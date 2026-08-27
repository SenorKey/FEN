#!/usr/bin/env python3
"""
Incisor Trading — market data service.

Right now this is the skeleton: config loading, the SQLite store, origin
checking, two-tier rate limiting, and GET /health. Quote and history routes
arrive with the fixture layer (T3) and the snapshot cache (T4).

Run under systemd; see incisor-trading.service. Apache reverse-proxies
/api/incisor/* on the public site to this service on localhost. /health is
deliberately NOT proxied — it is a local diagnostic, not a public endpoint.

Config is loaded from the file at $CONFIG_FILE (set by the systemd unit to
/etc/incisor-trading/config.env). Keys:

    INCISOR_DATA_SOURCE     fixture (default) | live
    UPSTREAM_API_KEY        required only when INCISOR_DATA_SOURCE=live
    DB_PATH                 default /var/lib/incisor-trading/incisor.db
    LISTEN_HOST             default 127.0.0.1
    LISTEN_PORT             default 8789
    ALLOWED_ORIGIN          comma-separated; default the two site hostnames
    RATE_LIMIT_MAX / _WINDOW_SEC          per-IP request ceiling
    GLOBAL_RATE_LIMIT_MAX / _WINDOW_SEC   service-wide request ceiling

Unlike the suggestion service next door, this one starts happily with no
credentials at all. Fixture mode is the default and needs no upstream, so a
missing key is only fatal when live mode is explicitly asked for — that is
what lets every session, and any fresh checkout, run the service without
touching a secret.
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

from flask import Flask, jsonify, request
from werkzeug.exceptions import HTTPException


def load_env_file(path):
    """Minimal KEY=VALUE loader. Values may be quoted; comments start with #."""
    if not path or not os.path.exists(path):
        return
    with open(path) as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env_file(os.environ.get('CONFIG_FILE'))

# --- Configuration ----------------------------------------------------------

DATA_SOURCE = os.environ.get('INCISOR_DATA_SOURCE', 'fixture').strip().lower()
if DATA_SOURCE not in ('fixture', 'live'):
    sys.exit('INCISOR_DATA_SOURCE must be "fixture" or "live", got %r' % DATA_SOURCE)

UPSTREAM_API_KEY = os.environ.get('UPSTREAM_API_KEY', '').strip()
if DATA_SOURCE == 'live' and not UPSTREAM_API_KEY:
    sys.exit('UPSTREAM_API_KEY is required when INCISOR_DATA_SOURCE=live')

DB_PATH = os.environ.get('DB_PATH', '/var/lib/incisor-trading/incisor.db')
LISTEN_HOST = os.environ.get('LISTEN_HOST', '127.0.0.1')
LISTEN_PORT = int(os.environ.get('LISTEN_PORT', '8789'))

ALLOWED_ORIGINS = {
    origin.strip()
    for origin in os.environ.get(
        'ALLOWED_ORIGIN',
        'https://frontendneeded.com,https://www.frontendneeded.com').split(',')
    if origin.strip()
}

# Two gates, same shape as preside-by-side. The per-IP ceiling stops one
# caller hammering us; the global ceiling is the one that matters here,
# because upstream quota is a shared, exhaustible resource. A CGNAT crowd
# each staying under the per-IP cap could still drain a day's worth of
# free-tier calls between them, so the total is bounded by one number.
RATE_LIMIT_MAX = int(os.environ.get('RATE_LIMIT_MAX', '60'))
RATE_LIMIT_WINDOW_SEC = int(os.environ.get('RATE_LIMIT_WINDOW_SEC', '60'))
GLOBAL_RATE_LIMIT_MAX = int(os.environ.get('GLOBAL_RATE_LIMIT_MAX', '600'))
GLOBAL_RATE_LIMIT_WINDOW_SEC = int(os.environ.get('GLOBAL_RATE_LIMIT_WINDOW_SEC', '60'))

# Ticker symbols are the only user-controlled string that will ever reach a
# query or an upstream URL, so they are whitelisted rather than escaped:
# one leading letter, then up to nine more letters, dots or hyphens. That
# covers BRK.B and RDS-A without admitting anything else.
SYMBOL_PATTERN = re.compile(r'^[A-Z][A-Z.\-]{0,9}$')

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
)
log = logging.getLogger('incisor')

app = Flask(__name__)


# --- Helpers ----------------------------------------------------------------

def now_utc_iso():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def get_client_ip():
    """First hop from X-Forwarded-For if present, else the socket peer."""
    forwarded = request.headers.get('X-Forwarded-For', '')
    return (forwarded or request.remote_addr or '').split(',')[0].strip()


def is_valid_symbol(symbol):
    """True for a well-formed ticker. Everything else is rejected at the edge.

    Deliberately strict and case-sensitive: callers normalise before asking,
    so a lowercase symbol is a bug in our own code rather than something to
    quietly accept.
    """
    return isinstance(symbol, str) and bool(SYMBOL_PATTERN.match(symbol))


# --- Rate limiting ----------------------------------------------------------

_rate_lock = threading.Lock()
_rate_buckets = {}
_global_bucket = deque()


def rate_limit_check(ip):
    """Check both gates. Returns (ok, reason); reason is 'global' or 'ip'.

    Global is checked first: once the service is at its ceiling nobody gets
    through, identifiable or not. The per-IP gate only applies when we know
    who is calling, but unidentifiable callers still spend global budget so
    they cannot sidestep it.
    """
    now = time.monotonic()
    with _rate_lock:
        global_cutoff = now - GLOBAL_RATE_LIMIT_WINDOW_SEC
        while _global_bucket and _global_bucket[0] < global_cutoff:
            _global_bucket.popleft()
        if len(_global_bucket) >= GLOBAL_RATE_LIMIT_MAX:
            return False, 'global'

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
            # Opportunistic GC, so one-shot visitors don't grow the dict
            # without bound. Mirrors the suggestion service.
            if len(_rate_buckets) > 1024:
                for key in [k for k, v in _rate_buckets.items() if not v]:
                    del _rate_buckets[key]

        _global_bucket.append(now)
    return True, None


def reset_rate_limits():
    """Drop all rate-limit state. For tests only."""
    with _rate_lock:
        _rate_buckets.clear()
        _global_bucket.clear()


# --- Origin checking --------------------------------------------------------

def origin_is_allowed(strict):
    """Whether the request's Origin header passes.

    Browsers omit Origin on same-origin GETs, so a read endpoint can only
    reject an Origin that is *present and not allowlisted* — demanding one
    would break the very requests we want to serve. Anything that changes
    state uses strict=True, where a missing Origin is itself a failure.
    """
    origin = request.headers.get('Origin', '')
    if not origin:
        return not strict
    return origin in ALLOWED_ORIGINS


# --- Database ---------------------------------------------------------------

def db():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    # Per-connection, unlike journal_mode, so it has to be set every time.
    # NORMAL is the documented safe pairing with WAL.
    connection.execute('PRAGMA synchronous=NORMAL')
    return connection


def init_db():
    """Create the schema if it isn't there. Safe to run on every boot."""
    pathlib.Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    with db() as connection:
        # WAL so reads never block behind the cache writer.
        connection.execute('PRAGMA journal_mode=WAL')
        # The only table the skeleton needs: a record of what we asked
        # upstream for and when. Quotes, bars and fundamentals get their
        # own tables in T4, but the call log has to exist first — free-tier
        # quota is the binding constraint on this whole project, so it is
        # never not being counted.
        connection.execute(
            """
            -- Exists before there is any fetcher to log into it, on purpose:
            -- the free tier's 25-calls-a-day ceiling is the binding constraint
            -- on the project, and if the counter did not predate the first
            -- fetcher then the first version that forgets to record a call
            -- would go unnoticed. T4 builds its budgeting on this table.
            CREATE TABLE IF NOT EXISTS upstream_calls (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                called_at   TEXT NOT NULL,
                endpoint    TEXT NOT NULL,
                symbol      TEXT,
                status      TEXT NOT NULL,
                source      TEXT NOT NULL
            )
            """
        )
        connection.execute(
            'CREATE INDEX IF NOT EXISTS idx_calls_at ON upstream_calls(called_at)')


def db_is_reachable():
    try:
        with db() as connection:
            connection.execute('SELECT 1').fetchone()
        return True
    except sqlite3.Error:
        # The reason is logged, never returned — an error string from the
        # storage layer is not something a caller needs to see.
        log.exception('health: database unreachable')
        return False


# --- Request plumbing -------------------------------------------------------

@app.after_request
def _security_headers(response):
    """Apache adds its own on the public path, but this service is the actual
    origin. If anything ever reaches it directly, the raw responses should not
    be the weak link. All four are cheap and safe for a JSON-only API."""
    response.headers.setdefault('X-Content-Type-Options', 'nosniff')
    response.headers.setdefault('X-Frame-Options', 'DENY')
    response.headers.setdefault('Referrer-Policy', 'no-referrer')
    response.headers.setdefault('Content-Security-Policy', "default-src 'none'")
    return response


@app.errorhandler(Exception)
def _on_unhandled(exc):
    """Never let an exception body reach the client.

    Upstream errors and stack traces go to the journal; the caller gets a
    generic message. Flask's own aborts keep their intended status.
    """
    if isinstance(exc, HTTPException):
        return jsonify(error=exc.name.lower().replace(' ', '_')), exc.code
    # exc_info=exc rather than log.exception(): the handler is handed the
    # exception explicitly, so this logs the right traceback regardless of
    # the ambient exception state.
    log.error('unhandled error on %s', request.path, exc_info=exc)
    return jsonify(error='internal_error'), 500


# --- Routes -----------------------------------------------------------------

@app.route('/health', methods=['GET'])
def health():
    """Liveness and configuration readout for whoever is on the box.

    Not reverse-proxied — see apache-snippet.conf. It reports the data-source
    mode and whether storage answers, and nothing else: no paths, no versions,
    no key material, not even whether a key is set.
    """
    if not origin_is_allowed(strict=False):
        log.info('health: rejected bad origin %r ip=%r',
                 request.headers.get('Origin', '')[:120], get_client_ip())
        return jsonify(error='forbidden'), 403

    allowed, reason = rate_limit_check(get_client_ip())
    if not allowed:
        log.info('health: rate limited (%s) ip=%r', reason, get_client_ip())
        return jsonify(error='rate_limited'), 429

    storage_ok = db_is_reachable()
    return jsonify(
        status='ok' if storage_ok else 'degraded',
        service='incisor-trading',
        source=DATA_SOURCE,
        storage='ok' if storage_ok else 'unavailable',
        time=now_utc_iso(),
    ), (200 if storage_ok else 503)


init_db()
log.info('incisor-trading ready on %s:%d (source=%s)',
         LISTEN_HOST, LISTEN_PORT, DATA_SOURCE)


if __name__ == '__main__':
    # Development only. Production runs under gunicorn via the systemd unit.
    app.run(host=LISTEN_HOST, port=LISTEN_PORT)
