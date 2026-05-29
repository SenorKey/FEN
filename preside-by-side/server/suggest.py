#!/usr/bin/env python3
"""
Preside by Side — suggestion intake service.

POST /suggest (JSON) -> append to SQLite queue, post Discord embed.

Run under systemd; see preside-by-side-suggest.service. Apache reverse-
proxies /api/suggest on the public site to this service on localhost.

Config is loaded from the file at $CONFIG_FILE (set by the systemd unit
to /etc/preside-by-side/config.env). Keys:

    DISCORD_WEBHOOK_URL          required — suggestion-queue channel
    LOG_WEBHOOK_URL              optional — alerts channel (separate webhook
                                 so it can be rotated independently of the
                                 suggestions one). If unset, Discord-bound
                                 alerts are silently disabled and the
                                 service still logs to journalctl as before.
    DB_PATH                      default /var/lib/preside-by-side/suggestions.db
    LISTEN_HOST                  default 127.0.0.1
    LISTEN_PORT                  default 8787
    ALLOWED_ORIGIN               default https://frontendneeded.com
                                 comma-separated for multiple
    RATE_LIMIT_MAX / _WINDOW_SEC          per-IP submission ceiling
    GLOBAL_RATE_LIMIT_MAX / _WINDOW_SEC   service-wide submission ceiling
    ORIGIN_REJECT_THRESHOLD / _WINDOW_SEC origin-rejections from one IP
                                          before a probe alert fires
    RATING_LOG_ENRICH            add bar label + device summary to rating logs
    PRESIDENTS_DIR               override path to data/presidents/*.json
"""

import atexit
import datetime
import hashlib
import hmac
import json
import logging
import os
import pathlib
import queue
import re
import secrets
import sqlite3
import sys
import threading
import time
from collections import deque
from urllib.parse import urlparse

import requests
from flask import Flask, abort, jsonify, request
from werkzeug.exceptions import HTTPException


def load_env_file(path):
    """Minimal KEY=VALUE loader. Values may be quoted; comments start with #."""
    if not path or not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, val = line.split('=', 1)
            os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


load_env_file(os.environ.get('CONFIG_FILE'))

WEBHOOK_URL = os.environ.get('DISCORD_WEBHOOK_URL')
if not WEBHOOK_URL:
    sys.exit('DISCORD_WEBHOOK_URL is required (set in CONFIG_FILE or environment)')

DB_PATH = os.environ.get('DB_PATH', '/var/lib/preside-by-side/suggestions.db')
LISTEN_HOST = os.environ.get('LISTEN_HOST', '127.0.0.1')
LISTEN_PORT = int(os.environ.get('LISTEN_PORT', '8787'))
ALLOWED_ORIGINS = {
    o.strip()
    for o in os.environ.get('ALLOWED_ORIGIN', 'https://frontendneeded.com').split(',')
    if o.strip()
}

MAX_LENGTHS = {'president': 80, 'event': 200, 'source': 500, 'why': 600}

# Per-IP rolling-window rate limit. The browser-side cooldown is cosmetic
# (curl ignores it), so this is the real ceiling against scripted spam.
RATE_LIMIT_MAX = int(os.environ.get('RATE_LIMIT_MAX', '10'))
RATE_LIMIT_WINDOW_SEC = int(os.environ.get('RATE_LIMIT_WINDOW_SEC', '3600'))

# Global rolling-window ceiling across all IPs. The per-IP cap alone can be
# defeated by a CGNAT crowd or a small VPN pool — 1000 unique IPs each sending
# RATE_LIMIT_MAX still floods the Discord queue. This second gate caps the
# total submissions the service will accept per window, so a coordinated
# brigade is bounded by *one* number regardless of how many IPs they spread
# across. The on-disk queue is unaffected; rejected requests never insert.
GLOBAL_RATE_LIMIT_MAX = int(os.environ.get('GLOBAL_RATE_LIMIT_MAX', '60'))
GLOBAL_RATE_LIMIT_WINDOW_SEC = int(os.environ.get('GLOBAL_RATE_LIMIT_WINDOW_SEC', '3600'))

# Probe alert — fire one WARNING per IP per window when origin rejections
# from that IP exceed the threshold. Below threshold is uninteresting
# (curl smoke tests, misconfigured staging hosts); above threshold looks
# like someone is fuzzing the endpoint.
ORIGIN_REJECT_THRESHOLD = int(os.environ.get('ORIGIN_REJECT_THRESHOLD', '20'))
ORIGIN_REJECT_WINDOW_SEC = int(os.environ.get('ORIGIN_REJECT_WINDOW_SEC', '3600'))

LOG_WEBHOOK_URL = os.environ.get('LOG_WEBHOOK_URL', '').strip()

# --- Severity ratings (/rate, /ratings/<president>) ------------------------
#
# A user can rate any bar 1–10. The displayed average uses only the latest
# vote per (bar_id, ip_hash), so a user changing their mind doesn't get to
# count their old vote AND their new one.
#
# Three ceilings, in increasing order of how-determined-an-attacker-must-be:
#
#   (a) per (bar, IP) per RATING_BAR_IP_WRITE_WINDOW_SEC: max
#       RATING_BAR_IP_WRITES writes. Default = 2 per 24h, giving the user
#       one initial vote + one change-of-mind per day.
#   (b) per IP per RATING_IP_WINDOW_SEC: max RATING_IP_MAX votes. Caps a
#       single person carpet-bombing every bar in the dataset.
#   (c) global per RATING_GLOBAL_WINDOW_SEC: max RATING_GLOBAL_MAX votes
#       service-wide. Mirrors the /suggest global gate — protects against
#       CGNAT/VPN-pool brigades that defeat per-IP limits.
#
# Anything past (a)/(b)/(c) is rejected with 429. The user sees nothing
# special — same response shape as success — so probes can't tune their
# rate against the visible error.
#
# Quarantine: separate from the ceilings. If a single bar receives
# RATING_BURST_THRESHOLD votes from distinct ip_hashes within
# RATING_BURST_WINDOW_SEC, every rating arriving on that bar for the next
# RATING_BURST_SUPPRESS_SEC is stored with quarantined=1 (audit trail,
# attackers can't probe what made it through) and excluded from the
# computed average. One Discord WARN per trigger.
RATING_BAR_IP_WRITES = int(os.environ.get('RATING_BAR_IP_WRITES', '2'))
RATING_BAR_IP_WRITE_WINDOW_SEC = int(os.environ.get('RATING_BAR_IP_WRITE_WINDOW_SEC', '86400'))
RATING_IP_MAX = int(os.environ.get('RATING_IP_MAX', '40'))
RATING_IP_WINDOW_SEC = int(os.environ.get('RATING_IP_WINDOW_SEC', '86400'))
RATING_GLOBAL_MAX = int(os.environ.get('RATING_GLOBAL_MAX', '60'))
RATING_GLOBAL_WINDOW_SEC = int(os.environ.get('RATING_GLOBAL_WINDOW_SEC', '60'))
RATING_BURST_THRESHOLD = int(os.environ.get('RATING_BURST_THRESHOLD', '8'))
RATING_BURST_WINDOW_SEC = int(os.environ.get('RATING_BURST_WINDOW_SEC', '60'))
RATING_BURST_SUPPRESS_SEC = int(os.environ.get('RATING_BURST_SUPPRESS_SEC', '1800'))

# Minimum number of (non-quarantined) votes before the public aggregate
# endpoint will report a bar's average. Below this, the bar is omitted
# entirely — n=1 averages are misleading and easy to manipulate.
RATING_MIN_DISPLAY = int(os.environ.get('RATING_MIN_DISPLAY', '5'))

# Stream each accepted rating to the alerts webhook (the LOG_WEBHOOK_URL
# channel). Default on. Set to 0/false to suppress — useful when a
# traffic spike would otherwise push genuinely-urgent alerts out of the
# bounded notify queue.
RATING_LOG_TO_DISCORD = os.environ.get(
    'RATING_LOG_TO_DISCORD', '1'
).strip().lower() not in ('0', 'false', 'no', '')

# Enrich each rating log line with extra context: a human-readable bar
# label and a parsed device/OS/browser summary. Default on. Both are
# local, cheap, and best-effort — a missing/unreadable JSON or an
# unrecognizable User-Agent just omits that piece; it never blocks or
# fails the vote. Set to 0 to fall back to the terse one-line format.
RATING_LOG_ENRICH = os.environ.get(
    'RATING_LOG_ENRICH', '1'
).strip().lower() not in ('0', 'false', 'no', '')

# Where the per-president bar JSON lives, for bar_id -> shortLabel lookups.
# Same resolution as backfill_bar_ids.py: <repo>/data/presidents. The
# deployed service is --chdir'd into <repo>/server, so this sibling dir is
# present and readable (ProtectSystem=strict mounts it read-only, which is
# all a label lookup needs). Override with PRESIDENTS_DIR if layout differs.
PRESIDENTS_DIR = pathlib.Path(
    os.environ.get('PRESIDENTS_DIR')
    or pathlib.Path(__file__).resolve().parent.parent / 'data' / 'presidents'
)

# HMAC key for hashing IPs in the ratings table. Set in config.env. If
# unset, a per-process random key is generated and a WARN is logged —
# the service still works but the hash changes across restarts (which
# loosens rate limits temporarily; data stays consistent because the
# UNIQUE(bar_id, ip_hash) just sees new hashes as new IPs).
_RATING_IP_HASH_SECRET = os.environ.get('RATING_IP_HASH_SECRET', '').strip()
if not _RATING_IP_HASH_SECRET:
    _RATING_IP_HASH_SECRET = secrets.token_hex(32)
    _ip_hash_secret_ephemeral = True
else:
    _ip_hash_secret_ephemeral = False
_RATING_IP_HASH_KEY = _RATING_IP_HASH_SECRET.encode('utf-8')

# Format the ID backfill script writes: 10 chars from a 32-char
# unambiguous alphabet. Used to validate inbound bar_id values so we
# never insert garbage that could never have come from our own JSON.
_BAR_ID_RE = re.compile(r'^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$')

# President slug as it appears in data/presidents/<slug>.json. Letters
# only (kept narrow on purpose); used to validate the path segment on
# the public /ratings/<president> endpoint.
_PRESIDENT_RE = re.compile(r'^[A-Za-z]{1,40}$')

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('suggest')

# Dedicated logger for Discord-bound alerts. Keeping these on their own
# logger means routine INFO chatter (per-request validation rejections,
# queued-suggestion lines) stays in journalctl and only the events we
# explicitly route here reach Discord — even if someone later raises the
# root log level. propagate=True so journalctl still gets them too.
notify = logging.getLogger('preside.notify')
notify.setLevel(logging.INFO)
notify.propagate = True


# --- Discord log handler ----------------------------------------------------

class DiscordWebhookHandler(logging.Handler):
    """Async log handler that POSTs records to a Discord webhook as embeds.

    Design notes:

      * Records go onto a bounded queue. On overflow we drop the oldest
        entry to make room — during an error storm the latest record is
        usually the most diagnostic, and journalctl still has the full
        history. The Discord channel is for "look at this now", not
        forensic replay.

      * A single daemon worker thread drains the queue, lingering briefly
        after the first record so a burst of N events coalesces into one
        embed with N fields instead of N separate POSTs. Discord webhooks
        are capped at ~30 req/min; coalescing keeps us comfortably under.

      * 429 responses honor Retry-After so we don't get the webhook
        kicked by Discord during a sustained incident.

      * All network failures are swallowed — the local stderr/journald
        handler from logging.basicConfig is the source of truth for what
        actually happened. Logging must never become a way for a Discord
        outage to surface as a service error.
    """

    COLOR_INFO = 0x4F8FCB     # blue   — service start/stop, healthy events
    COLOR_WARN = 0xE5A93B     # gold   — probe alerts, rate trips, retries
    COLOR_ERROR = 0xCC3B3B    # red    — unhandled exceptions
    BATCH_MAX = 10            # Discord allows 25 fields; 10 stays readable
    BATCH_LINGER_SEC = 0.5
    QUEUE_MAX = 200
    HTTP_TIMEOUT = 5

    _STOP = object()  # sentinel pushed by close() to drain the worker

    def __init__(self, webhook_url, username='Preside Logs'):
        super().__init__(level=logging.INFO)
        # Default Formatter appends the traceback when exc_info is set,
        # so notify.exception(...) calls land in Discord with the stack.
        self.setFormatter(logging.Formatter('%(message)s'))
        self._url = webhook_url
        self._username = username
        self._q = queue.Queue(maxsize=self.QUEUE_MAX)
        self._thread = threading.Thread(
            target=self._worker, name='discord-log', daemon=True,
        )
        self._thread.start()

    def emit(self, record):
        try:
            self._q.put_nowait(record)
        except queue.Full:
            # Drop oldest to make room. Two get/put attempts so a racing
            # worker drain doesn't leave us silently dropping the new one.
            try:
                self._q.get_nowait()
            except queue.Empty:
                pass
            try:
                self._q.put_nowait(record)
            except queue.Full:
                pass

    def close(self):
        try:
            self._q.put_nowait(self._STOP)
        except queue.Full:
            pass
        self._thread.join(timeout=3)
        super().close()

    def _worker(self):
        while True:
            first = self._q.get()
            if first is self._STOP:
                return
            batch = [first]
            deadline = time.monotonic() + self.BATCH_LINGER_SEC
            while len(batch) < self.BATCH_MAX:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                try:
                    item = self._q.get(timeout=remaining)
                except queue.Empty:
                    break
                if item is self._STOP:
                    self._send(batch)
                    return
                batch.append(item)
            self._send(batch)

    def _send(self, records):
        if not records:
            return
        worst = max(r.levelno for r in records)
        if worst >= logging.ERROR:
            color = self.COLOR_ERROR
        elif worst >= logging.WARNING:
            color = self.COLOR_WARN
        else:
            color = self.COLOR_INFO

        fields = []
        for r in records:
            msg = self.format(r)
            # Discord caps field values at 1024 chars. Tracebacks blow
            # past that easily; keep the head so the failure location is
            # visible and trust journalctl for the tail.
            if len(msg) > 1024:
                msg = msg[:1021] + '...'
            fields.append({
                'name': r.levelname,
                'value': msg or '(no message)',
                'inline': False,
            })

        title = ('%d events' % len(records)) if len(records) > 1 else 'Log event'
        payload = {
            'username': self._username,
            'embeds': [{
                'title': title,
                'color': color,
                'fields': fields,
                'timestamp': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            }],
        }
        try:
            resp = requests.post(self._url, json=payload, timeout=self.HTTP_TIMEOUT)
            if resp.status_code == 429:
                # Discord asks us to back off. Sleep for the suggested
                # window (capped) before pulling the next batch.
                retry = 1.0
                try:
                    retry = float(resp.headers.get('Retry-After', '1'))
                except (TypeError, ValueError):
                    pass
                time.sleep(min(max(retry, 0.0), 30.0))
        except Exception:
            # Local handler still has it — never surface to the caller.
            pass


if LOG_WEBHOOK_URL:
    _discord_handler = DiscordWebhookHandler(LOG_WEBHOOK_URL)
    notify.addHandler(_discord_handler)
    # Best-effort flush on process exit so the "service stopping" event
    # we emit from atexit actually leaves the queue before we die.
    atexit.register(_discord_handler.close)
else:
    log.info('LOG_WEBHOOK_URL not set — Discord alerts disabled')


# --- Helpers ----------------------------------------------------------------

# ASCII control chars (incl. NUL, \r, \n, \t) never appear in legitimate
# single-line <input> submissions — browsers strip them. Scrubbing them
# defangs log-injection and avoids weird display in any downstream consumer.
_CTRL_RE = re.compile(r'[\x00-\x1f\x7f]')

# Discord renders markdown in embed field values, including [text](url).
# We escape the metachars so attacker-controlled fields render literally in
# the queue channel instead of as clickable phishing links.
_DISCORD_MD_RE = re.compile(r'([\\`*_~|\[\]()>])')

# All rate-limit / burst-suppression state below is per-process and shared
# only across threads in this process — the deques live in module-level
# memory and the threading.Lock()s serialize access within the process.
# That means the configured ceilings ONLY hold if the service runs as a
# single gunicorn worker (use --threads for concurrency). The systemd
# unit pins --workers 1 --threads 4 for exactly this reason. Bumping
# --workers to N silently multiplies every ceiling here (per-IP, global,
# rating, burst threshold) by N because each worker tracks state
# independently — don't do it without moving this state to Redis/SQLite
# or putting a sticky-by-IP layer in front of gunicorn.
_rate_lock = threading.Lock()
_rate_buckets = {}  # ip -> deque[float] of monotonic timestamps
_global_bucket = deque()  # monotonic timestamps of accepted submissions

# Rating-specific rate-limit state. Separate from the /suggest gates so a
# noisy ratings flood can't starve the suggest channel and vice versa.
# Same single-worker assumption as the suggest gates above.
_rating_rate_lock = threading.Lock()
_rating_ip_buckets = {}      # ip -> deque[float]
_rating_global_bucket = deque()

# Per-bar burst tracker. Each entry holds a deque of (ts, ip_hash) tuples
# for recent votes on that bar, and a `suppress_until` timestamp; while
# suppress_until is in the future, every incoming vote on that bar lands
# with quarantined=1 and is invisible to the average.
_burst_lock = threading.Lock()
_burst_state = {}  # bar_id -> {'events': deque[(ts, ip_hash)], 'suppress_until': float}

# Per-IP origin-rejection tracking. Buckets hold timestamps of recent
# rejections; the *_alerted dict remembers when we last fired an alert
# for that IP so we don't spam Discord every request once an IP crosses
# the threshold — one alert per IP per window is enough signal.
_origin_lock = threading.Lock()
_origin_buckets = {}
_origin_alerted = {}

# Bar-label cache: president slug -> {bar_id: shortLabel}. The JSON files
# are static curated content, so we load each president once and keep it.
# Bounded by the number of president files (~dozens).
_label_lock = threading.Lock()
_label_cache = {}


def clean_input(s):
    """Trim whitespace and strip ASCII control chars from user-supplied text."""
    if not s:
        return ''
    return _CTRL_RE.sub(' ', s).strip()


def escape_discord_md(s):
    """Backslash-escape Discord markdown metachars so values render as typed."""
    if not s:
        return s
    return _DISCORD_MD_RE.sub(r'\\\1', s)


def get_client_ip():
    """First hop from X-Forwarded-For if present, else the socket peer."""
    return request.headers.get('X-Forwarded-For', request.remote_addr or '').split(',')[0].strip()


def bar_short_label(president, bar_id):
    """Curated shortLabel for (president, bar_id), or '' if the JSON can't
    be read or the id isn't present. Cached per president; the data files
    are static curated content (not user input), so a one-time load per
    slug is enough. Never raises — a missing/malformed file just yields ''
    and we log the id alone."""
    if not president or not bar_id or not _PRESIDENT_RE.match(president):
        return ''
    with _label_lock:
        labels = _label_cache.get(president)
    if labels is None:
        labels = {}
        try:
            with open(PRESIDENTS_DIR / (president + '.json'), encoding='utf-8') as f:
                for bar in json.load(f):
                    bid = bar.get('id')
                    if bid:
                        labels[bid] = (bar.get('shortLabel') or bar.get('title') or '')[:120]
        except Exception:
            # Missing/unreadable/malformed — cache the empty map so we don't
            # stat the file on every vote, and just log without a label.
            pass
        with _label_lock:
            _label_cache[president] = labels
    return labels.get(bar_id, '')


def parse_user_agent(ua):
    """Dependency-free UA summary -> 'Device · OS · Browser'. We emit only
    tokens we recognize (never the raw UA), so nothing user-controlled ever
    reaches the log line. Returns '' if nothing is recognizable."""
    if not ua:
        return ''
    s = ua.lower()
    if any(b in s for b in ('bot', 'crawl', 'spider', 'slurp')):
        device = 'Bot'
    elif 'ipad' in s or 'tablet' in s or ('android' in s and 'mobile' not in s):
        device = 'Tablet'
    elif 'mobi' in s or 'iphone' in s or 'ipod' in s or 'android' in s:
        device = 'Mobile'
    else:
        device = 'Desktop'

    if 'iphone' in s or 'ipad' in s or 'ipod' in s:
        osname = 'iOS'
    elif 'android' in s:
        osname = 'Android'
    elif 'windows' in s:
        osname = 'Windows'
    elif 'mac os' in s or 'macintosh' in s:
        osname = 'macOS'
    elif 'cros' in s:
        osname = 'ChromeOS'
    elif 'linux' in s:
        osname = 'Linux'
    else:
        osname = ''

    # Order matters: Edge/Opera/Chrome UAs all contain 'chrome'; iOS
    # browsers wrap WebKit and advertise 'safari' regardless of brand.
    if 'edg' in s:
        browser = 'Edge'
    elif 'opr' in s or 'opera' in s:
        browser = 'Opera'
    elif 'firefox' in s or 'fxios' in s:
        browser = 'Firefox'
    elif 'crios' in s or 'chrome' in s:
        browser = 'Chrome'
    elif 'safari' in s:
        browser = 'Safari'
    else:
        browser = ''

    return ' · '.join(p for p in (device, osname, browser) if p)


def note_origin_rejection(ip):
    """Record a bad-Origin rejection from `ip`. Return True iff this is
    the rejection that crossed (or re-crossed) the alert threshold and
    no alert has fired for this IP within the current window.

    Returning True at most once per IP per window keeps the Discord
    channel signal — "someone is probing the endpoint" — instead of
    flooding it with one ping per request once the threshold is met.
    """
    if not ip:
        return False
    now = time.monotonic()
    cutoff = now - ORIGIN_REJECT_WINDOW_SEC
    with _origin_lock:
        bucket = _origin_buckets.get(ip)
        if bucket is None:
            bucket = deque()
            _origin_buckets[ip] = bucket
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        bucket.append(now)

        if len(bucket) < ORIGIN_REJECT_THRESHOLD:
            return False

        last_alert = _origin_alerted.get(ip, 0.0)
        if last_alert >= cutoff:
            return False  # already alerted within the current window
        _origin_alerted[ip] = now

        # Opportunistic GC mirroring rate_limit_check — keeps both
        # dicts from growing unboundedly with one-shot visitors.
        if len(_origin_buckets) > 1024:
            for k in [k for k, v in _origin_buckets.items() if not v]:
                del _origin_buckets[k]
                _origin_alerted.pop(k, None)
        return True


def rate_limit_check(ip):
    """Check both gates. Returns (ok, reason) — reason is 'global' or 'ip'
    when ok is False, so the caller can log which ceiling tripped.

    Global is checked first: if the channel is already at its ceiling, no
    individual IP — identifiable or not — gets through. Per-IP is only
    checked when we can identify the caller; unidentifiable callers still
    count against the global budget so they can't bypass it.
    """
    now = time.monotonic()
    with _rate_lock:
        # Global gate — bounds total Discord embeds per window regardless of
        # how many distinct IPs are submitting.
        global_cutoff = now - GLOBAL_RATE_LIMIT_WINDOW_SEC
        while _global_bucket and _global_bucket[0] < global_cutoff:
            _global_bucket.popleft()
        if len(_global_bucket) >= GLOBAL_RATE_LIMIT_MAX:
            return False, 'global'

        # Per-IP gate — only meaningful when we can identify the caller.
        if ip:
            ip_cutoff = now - RATE_LIMIT_WINDOW_SEC
            bucket = _rate_buckets.get(ip)
            if bucket is None:
                bucket = deque()
                _rate_buckets[ip] = bucket
            while bucket and bucket[0] < ip_cutoff:
                bucket.popleft()
            if len(bucket) >= RATE_LIMIT_MAX:
                return False, 'ip'
            bucket.append(now)
            # Opportunistic GC: drop any other empty buckets we happen to see.
            # Keeps the dict from growing unboundedly with one-shot visitors.
            if len(_rate_buckets) > 1024:
                for k in [k for k, v in _rate_buckets.items() if not v]:
                    del _rate_buckets[k]

        # Both gates passed (or IP unknown with global headroom). Record the
        # submission against the global budget so it counts toward the cap.
        _global_bucket.append(now)
    return True, None


def hash_ip(ip):
    """Stable HMAC-SHA256 of an IP, truncated to 16 hex chars (64 bits).

    Truncation is fine — we never need to invert the hash, only group
    by it, and 64 bits is far more than enough to make per-IP collisions
    negligible at our scale. Storing the raw IP would be the simpler
    thing, but a long-lived ratings table with raw IPs is exactly the
    sort of data exposure to avoid by default.
    """
    if not ip:
        ip = ''
    return hmac.new(_RATING_IP_HASH_KEY, ip.encode('utf-8'), hashlib.sha256).hexdigest()[:16]


def rating_rate_limit_check(ip_hash):
    """Two-gate check for /rate. Returns (ok, reason). Mirrors the shape
    of rate_limit_check but with rating-specific buckets and windows so
    /suggest and /rate don't share a ceiling.
    """
    now = time.monotonic()
    with _rating_rate_lock:
        gcut = now - RATING_GLOBAL_WINDOW_SEC
        while _rating_global_bucket and _rating_global_bucket[0] < gcut:
            _rating_global_bucket.popleft()
        if len(_rating_global_bucket) >= RATING_GLOBAL_MAX:
            return False, 'global'

        if ip_hash:
            icut = now - RATING_IP_WINDOW_SEC
            bucket = _rating_ip_buckets.get(ip_hash)
            if bucket is None:
                bucket = deque()
                _rating_ip_buckets[ip_hash] = bucket
            while bucket and bucket[0] < icut:
                bucket.popleft()
            if len(bucket) >= RATING_IP_MAX:
                return False, 'ip'
            bucket.append(now)
            if len(_rating_ip_buckets) > 4096:
                for k in [k for k, v in _rating_ip_buckets.items() if not v]:
                    del _rating_ip_buckets[k]

        _rating_global_bucket.append(now)
    return True, None


def note_rating_and_check_burst(bar_id, ip_hash):
    """Record this vote on the per-bar burst tracker. Returns
    (quarantined, fired_alert). `quarantined` is True if the bar is
    currently inside a suppression window OR this vote crossed the
    burst threshold and *opened* a new window. `fired_alert` is True
    only on the transition into a new window — used by the caller to
    emit exactly one Discord WARN per trip.
    """
    now = time.monotonic()
    cutoff = now - RATING_BURST_WINDOW_SEC
    with _burst_lock:
        state = _burst_state.get(bar_id)
        if state is None:
            state = {'events': deque(), 'suppress_until': 0.0}
            _burst_state[bar_id] = state

        if state['suppress_until'] > now:
            # Still in a suppression window from a prior burst — don't
            # bother trimming the events deque (it's not informative
            # while suppressed). The new vote is quarantined silently.
            return True, False

        events = state['events']
        while events and events[0][0] < cutoff:
            events.popleft()
        events.append((now, ip_hash))

        distinct = {h for _, h in events}
        if len(distinct) >= RATING_BURST_THRESHOLD:
            state['suppress_until'] = now + RATING_BURST_SUPPRESS_SEC
            # Drop the events deque so a *second* burst after the
            # suppression window has to re-cross the threshold from
            # scratch; otherwise old events would still be in the deque
            # 30 min from now and re-trigger immediately on the first
            # legitimate vote.
            state['events'].clear()
            # Opportunistic GC to keep _burst_state bounded.
            if len(_burst_state) > 1024:
                stale = [k for k, s in _burst_state.items()
                         if not s['events'] and s['suppress_until'] < now]
                for k in stale:
                    del _burst_state[k]
            return True, True

        return False, False


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    # synchronous is per-connection (not stored in the DB header like
    # journal_mode), so it has to be re-set every time. NORMAL is the
    # documented safe pairing with WAL: a power loss can lose the last
    # committed transaction but the database stays consistent.
    conn.execute('PRAGMA synchronous=NORMAL')
    return conn


pathlib.Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
with db() as conn:
    # WAL lets /ratings/<president> reads run concurrently with /rate
    # writes instead of blocking on the database-level write lock the
    # default "delete" journal mode takes. Persistent — written into
    # the DB header, so this PRAGMA only needs to run once ever, but
    # re-asserting it on every boot is cheap and self-documenting.
    conn.execute('PRAGMA journal_mode=WAL')
    # status lifecycle: pending -> processing -> reviewed | rejected | added
    # The local AI flips status as it works the queue; notes holds its findings.
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS suggestions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            received_at TEXT NOT NULL,
            president   TEXT NOT NULL,
            event       TEXT NOT NULL,
            source      TEXT,
            why         TEXT,
            user_agent  TEXT,
            ip          TEXT,
            status      TEXT NOT NULL DEFAULT 'pending',
            processed_at TEXT,
            notes       TEXT
        )
        """
    )
    conn.execute('CREATE INDEX IF NOT EXISTS idx_status ON suggestions(status)')

    # Severity ratings — one current row per (bar_id, ip_hash). Updates
    # to an existing row use ON CONFLICT to flip the rating, bump
    # updated_at, and increment write_count; the write_count guard in
    # the route enforces "max RATING_BAR_IP_WRITES per window".
    #
    # `quarantined=1` rows still live here (auditability) but are
    # excluded from the aggregate query that powers the public endpoint.
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ratings (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            received_at   TEXT    NOT NULL,
            updated_at    TEXT    NOT NULL,
            president     TEXT    NOT NULL,
            bar_id        TEXT    NOT NULL,
            rating        INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 10),
            ip_hash       TEXT    NOT NULL,
            user_agent    TEXT,
            write_count   INTEGER NOT NULL DEFAULT 1,
            quarantined   INTEGER NOT NULL DEFAULT 0,
            quarantine_reason TEXT,
            UNIQUE(bar_id, ip_hash)
        )
        """
    )
    conn.execute('CREATE INDEX IF NOT EXISTS idx_ratings_president ON ratings(president)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_ratings_president_bar ON ratings(president, bar_id)')

    # Append-only audit log — one row per accepted rating write (insert
    # OR update). The `ratings` table tracks the *current* state per
    # (bar_id, ip_hash); this table preserves every value ever submitted,
    # so we can later reconstruct how a bar's average moved over time or
    # see whether a specific (hashed) voter flipped their score.
    #
    # Silently-capped writes (third+ within the 24h per-(bar,IP) window)
    # do NOT land here — they never affected real state, and recording
    # them would inflate "user activity" with no-ops. Quarantined writes
    # DO land (quarantined=1) so a future de-quarantine pass can include
    # them retroactively.
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ratings_history (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            happened_at   TEXT    NOT NULL,
            president     TEXT    NOT NULL,
            bar_id        TEXT    NOT NULL,
            rating        INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 10),
            ip_hash       TEXT    NOT NULL,
            action        TEXT    NOT NULL CHECK(action IN ('insert','update')),
            quarantined   INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    conn.execute('CREATE INDEX IF NOT EXISTS idx_history_bar_time ON ratings_history(bar_id, happened_at)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_history_president_time ON ratings_history(president, happened_at)')


app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 8 * 1024  # 8 KB cap on request bodies


@app.after_request
def _security_headers(response):
    # Apache adds its own defensive headers on the public path, but this
    # service is the actual origin — if anything ever bypasses the proxy
    # (misconfigured vhost, direct localhost curl from a compromised
    # neighbor, future deployment shape) the raw responses shouldn't be
    # the weak link. All four are cheap, well-supported, and safe for a
    # JSON-only API:
    #
    #   nosniff:   block MIME sniffing — our responses are application/json
    #              and shouldn't be reinterpreted as anything else.
    #   DENY:      a JSON endpoint has no legitimate framing use case;
    #              denying outright is stricter than SAMEORIGIN at no cost.
    #   no-referrer: this service never wants the caller's Referer leaked
    #              to anything downstream (none of our responses link out).
    #   CSP default-src 'none': belt-and-suspenders for the unlikely case
    #              a response is ever rendered as a document — nothing
    #              loads, nothing executes.
    response.headers.setdefault('X-Content-Type-Options', 'nosniff')
    response.headers.setdefault('X-Frame-Options', 'DENY')
    response.headers.setdefault('Referrer-Policy', 'no-referrer')
    response.headers.setdefault('Content-Security-Policy', "default-src 'none'")
    return response


def now_utc_iso():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


@app.errorhandler(Exception)
def _on_unhandled(exc):
    """Last-ditch catcher for exceptions that escape the route handler.

    HTTPException subclasses (abort(403), 404 from no-route, etc.) are
    Flask raising on purpose; let those flow through with their intended
    status. Anything else is unexpected — log it with traceback and
    return a generic 500 so we don't leak internals.
    """
    if isinstance(exc, HTTPException):
        return exc
    notify.error('unhandled exception: %s', exc, exc_info=True)
    return jsonify(ok=False, error='internal error'), 500


# Startup announcement. Gunicorn forks one worker per --workers, and each
# worker imports this module separately — so a service with N workers
# will emit N "starting" events on boot. That's intentional: confirms
# every worker came up rather than just the first.
notify.info('service starting (pid=%d)', os.getpid())

if _ip_hash_secret_ephemeral:
    # WARN rather than INFO so it's visible in the alerts channel —
    # forgetting to set the secret silently weakens rate limits across
    # restarts and shouldn't be a silent failure.
    notify.warning(
        'RATING_IP_HASH_SECRET not set — using per-process random key. '
        'Rate limits will reset every restart. Set the env var in config.env.'
    )


@atexit.register
def _on_shutdown():
    # Fires on graceful exit (SIGTERM from systemd, Ctrl+C in dev). Not
    # guaranteed under SIGKILL — that's acceptable; the absence of a
    # "stopping" message after a "starting" is itself diagnostic.
    try:
        notify.info('service stopping (pid=%d)', os.getpid())
    except Exception:
        pass


@app.route('/suggest', methods=['POST'])
def suggest():
    # Origin check — same-origin browser POSTs include Origin. Curl / bots
    # that omit or spoof it to anything outside the allowlist get rejected.
    origin = request.headers.get('Origin', '')
    if origin not in ALLOWED_ORIGINS:
        probe_ip = get_client_ip()
        log.info('rejected: bad origin %r ip=%r', origin, probe_ip)
        if note_origin_rejection(probe_ip):
            notify.warning(
                'probe alert: %d+ origin rejections from %s in last hour '
                '(latest origin=%r)',
                ORIGIN_REJECT_THRESHOLD, probe_ip, origin[:120],
            )
        abort(403)

    ip = get_client_ip()
    ok, reason = rate_limit_check(ip)
    if not ok:
        log.info('rate limited (%s): ip=%r', reason, ip)
        if reason == 'global':
            # Brigade signal — the per-IP cap can be sailed past by a
            # CGNAT crowd / VPN pool, so the global trip is the one
            # worth waking a phone for. One ping per trip is enough;
            # subsequent global trips within the window will still fire
            # (no suppression here, by design — sustained pressure
            # should keep nudging).
            notify.warning(
                'global rate limit tripped (ip=%r, cap=%d/%ds)',
                ip, GLOBAL_RATE_LIMIT_MAX, GLOBAL_RATE_LIMIT_WINDOW_SEC,
            )
        return jsonify(ok=False, error='too many requests — try again later'), 429

    data = request.get_json(silent=True) or {}

    # Honeypot — silent 200 so bots can't tell they were caught.
    if (data.get('website') or '').strip():
        log.info('honeypot hit from %r', ip)
        return jsonify(ok=True)

    president = clean_input(data.get('president'))
    event = clean_input(data.get('event'))
    source = clean_input(data.get('source'))
    why = clean_input(data.get('why'))

    if not president or not event:
        log.info('rejected: missing required fields (president=%r event=%r)', president[:30], event[:30])
        return jsonify(ok=False, error='president and event are required'), 400

    for name, val in (('president', president), ('event', event), ('source', source), ('why', why)):
        if len(val) > MAX_LENGTHS[name]:
            log.info('rejected: %s exceeds %d chars (len=%d)', name, MAX_LENGTHS[name], len(val))
            return jsonify(ok=False, error=f'{name} exceeds {MAX_LENGTHS[name]} chars'), 400

    if source:
        u = urlparse(source)
        if u.scheme not in ('http', 'https') or not u.netloc:
            log.info('rejected: invalid source URL %r', source[:100])
            return jsonify(ok=False, error='source must be a valid http(s) URL'), 400

    ua = request.headers.get('User-Agent', '')[:300]

    with db() as conn:
        cur = conn.execute(
            'INSERT INTO suggestions (received_at, president, event, source, why, user_agent, ip)'
            ' VALUES (?,?,?,?,?,?,?)',
            (now_utc_iso(), president, event, source or None, why or None, ua, ip),
        )
        sid = cur.lastrowid

    log.info('queued suggestion #%d (president=%r event=%r)', sid, president[:30], event[:40])

    # Best-effort Discord notify. The row is already durable on disk, so a
    # Discord outage must not surface as an error to the submitter.
    try:
        post_to_discord(sid, president, event, source, why)
    except Exception as exc:
        # Routed through notify (not log) so the *alerts* channel learns
        # the suggestions-channel webhook is broken. If both webhooks
        # share an outage, the alerts handler will silently drop and
        # journalctl is still the source of truth.
        notify.warning('discord notify failed for #%d: %s', sid, exc)

    return jsonify(ok=True)


def _rating_log_head(president, bar_id, rating, action, quarantined, ip_hash, label=''):
    """Stable, greppable first line shared by the plain and enriched paths."""
    return 'rating: %s/%s%s score=%d (%s%s) ip=%s' % (
        president, bar_id,
        ' "%s"' % label if label else '',
        rating, action,
        ', QUARANTINED' if quarantined else '',
        ip_hash[:8],
    )


def _build_rating_log(president, bar_id, rating, action, quarantined, ip_hash, ua):
    """Multi-line enriched rating log: the greppable head plus a device
    line. Both enrichments are local, cheap, and best-effort (the helpers
    never raise) — a missing label or unrecognizable UA just shortens the
    message. Returns a single string ready to hand to a logger."""
    label = bar_short_label(president, bar_id)
    lines = [_rating_log_head(president, bar_id, rating, action, quarantined, ip_hash, label)]
    device = parse_user_agent(ua)
    if device:
        lines.append('• device: %s' % device)
    return '\n'.join(lines)


@app.route('/rate', methods=['POST'])
def rate():
    """Cast or update a single severity rating (1–10) for a bar.

    Body: {"president": "<slug>", "bar_id": "<10-char id>", "rating": 1..10}

    Returns {"ok": true} on success, on silent-discard (honeypot-style
    burst quarantine), and on per-(bar,ip) write limit hits — see below
    for why we don't surface those distinctly. Returns 400 on validation
    failure, 403 on bad origin, 429 on rate-limit trip.
    """
    origin = request.headers.get('Origin', '')
    if origin not in ALLOWED_ORIGINS:
        probe_ip = get_client_ip()
        log.info('rate: rejected bad origin %r ip=%r', origin, probe_ip)
        if note_origin_rejection(probe_ip):
            notify.warning(
                'probe alert: %d+ origin rejections from %s in last hour '
                '(latest origin=%r)',
                ORIGIN_REJECT_THRESHOLD, probe_ip, origin[:120],
            )
        abort(403)

    ip = get_client_ip()
    ip_hash = hash_ip(ip)

    ok, reason = rating_rate_limit_check(ip_hash)
    if not ok:
        log.info('rate: rate limited (%s) ip=%r', reason, ip)
        if reason == 'global':
            notify.warning(
                'ratings global rate limit tripped (cap=%d/%ds)',
                RATING_GLOBAL_MAX, RATING_GLOBAL_WINDOW_SEC,
            )
        return jsonify(ok=False, error='too many requests — try again later'), 429

    data = request.get_json(silent=True) or {}
    president = clean_input(data.get('president'))
    bar_id = clean_input(data.get('bar_id'))
    rating = data.get('rating')

    if not _PRESIDENT_RE.match(president or ''):
        return jsonify(ok=False, error='invalid president'), 400
    if not _BAR_ID_RE.match(bar_id or ''):
        return jsonify(ok=False, error='invalid bar_id'), 400
    try:
        rating = int(rating)
    except (TypeError, ValueError):
        return jsonify(ok=False, error='rating must be an integer 1..10'), 400
    if rating < 1 or rating > 10:
        return jsonify(ok=False, error='rating must be between 1 and 10'), 400

    quarantined, fired_alert = note_rating_and_check_burst(bar_id, ip_hash)
    if fired_alert:
        notify.warning(
            'ratings burst suppression engaged: bar_id=%s (>=%d distinct IPs in %ds); '
            'votes for this bar will be quarantined for the next %ds',
            bar_id, RATING_BURST_THRESHOLD, RATING_BURST_WINDOW_SEC,
            RATING_BURST_SUPPRESS_SEC,
        )

    ua = request.headers.get('User-Agent', '')[:300]
    now_iso = now_utc_iso()
    quarantine_reason = 'burst' if quarantined else None
    q_int = 1 if quarantined else 0

    with db() as conn:
        existing = conn.execute(
            'SELECT id, updated_at, write_count FROM ratings WHERE bar_id=? AND ip_hash=?',
            (bar_id, ip_hash),
        ).fetchone()

        action = None
        if not existing:
            # First-time vote for this (bar, ip). Each gunicorn worker
            # holds its own SQLite connection, so two simultaneous
            # first-time votes can both observe existing=None and both
            # try to INSERT — the second trips the UNIQUE(bar_id, ip_hash)
            # constraint. Catch that and re-read so the loser's vote
            # still lands via the UPDATE branch below.
            try:
                conn.execute(
                    'INSERT INTO ratings '
                    '(received_at, updated_at, president, bar_id, rating, ip_hash, '
                     'user_agent, write_count, quarantined, quarantine_reason) '
                    'VALUES (?,?,?,?,?,?,?,?,?,?)',
                    (now_iso, now_iso, president, bar_id, rating, ip_hash, ua,
                     1, q_int, quarantine_reason),
                )
                action = 'insert'
            except sqlite3.IntegrityError:
                existing = conn.execute(
                    'SELECT id, updated_at, write_count FROM ratings '
                    'WHERE bar_id=? AND ip_hash=?',
                    (bar_id, ip_hash),
                ).fetchone()

        if existing and action is None:
            # Existing vote — enforce the (bar, ip) write cap within
            # its rolling window before we'd UPDATE. Parsing the prior
            # ISO timestamp tells us whether the window has rolled over.
            try:
                prior_dt = datetime.datetime.fromisoformat(existing['updated_at'])
            except (TypeError, ValueError):
                prior_dt = None
            now_dt = datetime.datetime.now(datetime.timezone.utc)
            within_window = (
                prior_dt is not None
                and (now_dt - prior_dt).total_seconds() < RATING_BAR_IP_WRITE_WINDOW_SEC
            )
            if within_window and existing['write_count'] >= RATING_BAR_IP_WRITES:
                log.info('rate: per-(bar,ip) write cap hit bar_id=%s', bar_id)
                # Silent-success shape — the public response shouldn't
                # let a caller distinguish "got through" from "capped"
                # for the same reason the suggest honeypot is silent:
                # don't teach abusers what works. We do NOT log this to
                # ratings_history either: the write never landed, so
                # recording it would inflate user-activity metrics with
                # nothing-happened rows.
                return jsonify(ok=True)

            new_write_count = existing['write_count'] + 1 if within_window else 1
            conn.execute(
                'UPDATE ratings SET rating=?, updated_at=?, user_agent=?, '
                'write_count=?, quarantined=?, quarantine_reason=? WHERE id=?',
                (rating, now_iso, ua, new_write_count, q_int,
                 quarantine_reason, existing['id']),
            )
            action = 'update'

        # Append-only audit log. Inside the same `with` block so the
        # implicit commit covers both writes atomically — a power loss
        # mid-transaction can't produce a current-state row without its
        # matching history entry.
        conn.execute(
            'INSERT INTO ratings_history '
            '(happened_at, president, bar_id, rating, ip_hash, action, quarantined) '
            'VALUES (?,?,?,?,?,?,?)',
            (now_iso, president, bar_id, rating, ip_hash, action, q_int),
        )

    # Same message goes to journalctl always, and to the Discord alerts
    # channel when streaming is enabled. The greppable first line is stable
    # on both sinks: `rating: <pres>/<bar_id>[ "label"] score=<n>
    # (<action>[, QUARANTINED]) ip=<8 hex>`. Truncated ip_hash keeps the
    # embed compact while still letting us spot same-voter patterns.
    # Enrichment (bar label + device line) is local and cheap, so it runs
    # inline; RATING_LOG_ENRICH=0 falls back to the bare head.
    if RATING_LOG_ENRICH:
        event_msg = _build_rating_log(president, bar_id, rating, action, quarantined, ip_hash, ua)
    else:
        event_msg = _rating_log_head(president, bar_id, rating, action, quarantined, ip_hash)
    (notify.info if RATING_LOG_TO_DISCORD else log.info)(event_msg)
    return jsonify(ok=True)


@app.route('/ratings/<president>', methods=['GET'])
def ratings(president):
    """Aggregate (avg, count, sum) per bar for one president.

    Returns {"<bar_id>": {"avg": 7.4, "count": 12, "sum": 88}, ...},
    including only bars whose non-quarantined vote count is >=
    RATING_MIN_DISPLAY. Bars below that threshold are omitted entirely —
    callers should treat a missing key as "not enough votes yet" and
    render nothing.

    `sum` is the exact integer total of all (non-quarantined) ratings so
    the client can do lossless optimistic-update math (sum±vote, then
    divide by count) instead of reconstructing the running total from
    the already-rounded `avg` and drifting on every vote.

    GET, so no Origin/honeypot/rate-limit gates — it's a read of public
    aggregate data and Apache can cache it freely if needed later.
    """
    if not _PRESIDENT_RE.match(president or ''):
        abort(400)

    with db() as conn:
        rows = conn.execute(
            'SELECT bar_id, AVG(rating) AS avg, COUNT(*) AS n, '
            'SUM(rating) AS total '
            'FROM ratings WHERE president=? AND quarantined=0 '
            'GROUP BY bar_id HAVING n >= ?',
            (president, RATING_MIN_DISPLAY),
        ).fetchall()

    # Round avg to one decimal place — matches what the UI displays.
    # Doing it server-side keeps client math trivial and means the wire
    # format is the displayed format. `sum` stays unrounded so optimistic
    # updates can recompute a fresh avg from an exact running total.
    out = {
        r['bar_id']: {'avg': round(r['avg'], 1), 'count': r['n'], 'sum': r['total']}
        for r in rows
    }
    return jsonify(out)


def post_to_discord(sid, president, event, source, why):
    # Truncate first, then escape — escaping last guarantees we don't slice
    # through a backslash sequence and produce a malformed value.
    fields = [
        {'name': 'President', 'value': escape_discord_md(president[:1024]), 'inline': True},
        {'name': 'Event', 'value': escape_discord_md(event[:1024]), 'inline': False},
    ]
    if source:
        fields.append({'name': 'Source', 'value': escape_discord_md(source[:1024]), 'inline': False})
    if why:
        fields.append({'name': 'Why it matters', 'value': escape_discord_md(why[:1024]), 'inline': False})

    payload = {
        'username': 'Paul Revere',
        'embeds': [
            {
                'title': f'New Suggestion #{sid}',
                'color': 0xB89A5E,
                'fields': fields,
                'timestamp': now_utc_iso(),
            }
        ],
    }
    r = requests.post(WEBHOOK_URL, json=payload, timeout=5)
    r.raise_for_status()


if __name__ == '__main__':
    app.run(host=LISTEN_HOST, port=LISTEN_PORT)
