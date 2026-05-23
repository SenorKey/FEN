#!/usr/bin/env python3
"""
Preside by Side — suggestion intake service.

POST /suggest (JSON) -> append to SQLite queue, post Discord embed.

Run under systemd; see preside-by-side-suggest.service. Apache reverse-
proxies /api/suggest on the public site to this service on localhost.

Config is loaded from the file at $CONFIG_FILE (set by the systemd unit
to /etc/preside-by-side/config.env). Keys:

    DISCORD_WEBHOOK_URL  required
    DB_PATH              default /var/lib/preside-by-side/suggestions.db
    LISTEN_HOST          default 127.0.0.1
    LISTEN_PORT          default 8787
    ALLOWED_ORIGIN       default https://frontendneeded.com
                         comma-separated for multiple
"""

import datetime
import logging
import os
import pathlib
import re
import sqlite3
import sys
import threading
import time
from collections import deque
from urllib.parse import urlparse

import requests
from flask import Flask, abort, jsonify, request


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

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('suggest')


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


def rate_limit_check(ip):
    """Return True if the request is within budget; False if over."""
    if not ip:
        return True  # don't penalize when we can't identify the caller
    now = time.monotonic()
    cutoff = now - RATE_LIMIT_WINDOW_SEC
    with _rate_lock:
        bucket = _rate_buckets.get(ip)
        if bucket is None:
            bucket = deque()
            _rate_buckets[ip] = bucket
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= RATE_LIMIT_MAX:
            return False
        bucket.append(now)
        # Opportunistic GC: drop any other empty buckets we happen to see.
        # Keeps the dict from growing unboundedly with one-shot visitors.
        if len(_rate_buckets) > 1024:
            for k in [k for k, v in _rate_buckets.items() if not v]:
                del _rate_buckets[k]
    return True


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


@app.route('/suggest', methods=['POST'])
def suggest():
    # Origin check — same-origin browser POSTs include Origin. Curl / bots
    # that omit or spoof it to anything outside the allowlist get rejected.
    origin = request.headers.get('Origin', '')
    if origin not in ALLOWED_ORIGINS:
        log.info('rejected: bad origin %r', origin)
        abort(403)

    ip = get_client_ip()
    if not rate_limit_check(ip):
        log.info('rate limited: ip=%r', ip)
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
        log.warning('discord notify failed for #%d: %s', sid, exc)

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
