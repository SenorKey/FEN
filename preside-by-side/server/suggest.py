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
"""

import atexit
import datetime
import logging
import os
import pathlib
import queue
import re
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

_rate_lock = threading.Lock()
_rate_buckets = {}  # ip -> deque[float] of monotonic timestamps
_global_bucket = deque()  # monotonic timestamps of accepted submissions

# Per-IP origin-rejection tracking. Buckets hold timestamps of recent
# rejections; the *_alerted dict remembers when we last fired an alert
# for that IP so we don't spam Discord every request once an IP crosses
# the threshold — one alert per IP per window is enough signal.
_origin_lock = threading.Lock()
_origin_buckets = {}
_origin_alerted = {}


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


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


pathlib.Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
with db() as conn:
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


app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 8 * 1024  # 8 KB cap on request bodies


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
