#!/usr/bin/env python3
"""
Incisor Trading — market data service.

Config loading, origin checking, two-tier rate limiting, GET /health, and the
five read routes: GET /quote, GET /history, GET /symbols, GET /sectors and
GET /fundamentals.

This file is the edge. Storage lives in store.py, quote parsing in provider.py
and filing parsing in edgar.py, payload retrieval in source.py, the searchable
name table in catalog.py, the cache and quota budget in fetcher.py — which is
the only module permitted to reach upstream — and how much of that budget each
surface may spend in collect.py. A route's whole job is to check who is asking,
validate the symbol, ask for what it needs, and say nothing extra when
something goes wrong.

Run under systemd; see incisor-trading.service. Apache reverse-proxies
/api/incisor/* on the public site to this service on localhost. /health is
deliberately NOT proxied — it is a local diagnostic, not a public endpoint.

Config is loaded from the file at $CONFIG_FILE (set by the systemd unit to
/etc/incisor-trading/config.env). Keys:

    INCISOR_DATA_SOURCE     fixture (default) | live
    UPSTREAM_API_KEY        required only when INCISOR_DATA_SOURCE=live
    EDGAR_CONTACT           contact address for SEC EDGAR's User-Agent;
                            without it the fundamentals panel says so
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
import re
import sys
import threading
import time
from collections import deque

from flask import Flask, jsonify, request
from werkzeug.exceptions import HTTPException

import catalog
import collect
import fetcher
import fundamentals
import provider
import sectors
import source
import store


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

# The contact address EDGAR's access policy asks every automated client to
# put in its User-Agent, or it answers 403. Not fatal when it is missing, even
# in live mode: filings are one surface, prices are the page, and a service
# that refuses to boot over the fundamentals panel would take the dashboard
# down with it. The panel says it is unavailable instead.
EDGAR_CONTACT = os.environ.get('EDGAR_CONTACT', '').strip()

# Read here, not in store.py, and below load_env_file() like every other key.
# store is imported at the top of this file, so a DB_PATH it read at its own
# import would be read before $CONFIG_FILE had been opened — which is exactly
# what made the key silently ignored until D4. The edge reads the config; the
# store is told.
DB_PATH = store.configure(os.environ.get('DB_PATH', store.DEFAULT_DB_PATH))
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

    storage_ok = store.is_reachable()
    return jsonify(
        status='ok' if storage_ok else 'degraded',
        service='incisor-trading',
        source=DATA_SOURCE,
        storage='ok' if storage_ok else 'unavailable',
        time=now_utc_iso(),
    ), (200 if storage_ok else 503)



# The longest ticker the whitelist admits is ten characters. Anything much
# longer than that was never going to be a symbol, and is dropped before
# upper() runs so a pathological string cannot expand on its way in.
MAX_SYMBOL_INPUT = 16

# What the front end needs in order to label a price honestly (guide section
# 10). `source` is the important one: in fixture mode these numbers are
# invented, and the page has to be able to say so rather than presenting
# committed sample data as a market quote.
DELAY_LABEL = 'end-of-day'


def read_symbol_argument():
    """The validated `symbol` query argument, or None if it is not a ticker."""
    raw = request.args.get('symbol', '')
    if not raw or len(raw) > MAX_SYMBOL_INPUT:
        return None
    symbol = raw.strip().upper()
    return symbol if is_valid_symbol(symbol) else None


def gate(route):
    """Origin and rate-limit checks shared by every read route.

    Returns a ready-to-return error response, or None when the request may
    proceed. Read routes use the non-strict origin policy for the reason given
    on origin_is_allowed.
    """
    if not origin_is_allowed(strict=False):
        log.info('%s: rejected bad origin %r ip=%r', route,
                 request.headers.get('Origin', '')[:120], get_client_ip())
        return jsonify(error='forbidden'), 403

    allowed, reason = rate_limit_check(get_client_ip())
    if not allowed:
        log.info('%s: rate limited (%s) ip=%r', route, reason, get_client_ip())
        return jsonify(error='rate_limited'), 429
    return None


def error_for(route, symbol, exc):
    """Map a source or provider failure to a response that says nothing extra.

    The upstream message is logged and never returned: it is prose we did not
    write, and on the live path it can contain our own API key. The caller gets
    a token and a status code. Even the log line is redacted — upstream echoes
    the key back in some error bodies, and the journal is the realistic place
    for it to escape.
    """
    if isinstance(exc, (source.SourceUnavailable, fetcher.Unavailable)):
        log.error('%s: source unavailable for %s: %s', route, symbol, exc)
        return jsonify(error='data_unavailable'), 503

    if exc.reason == 'not_found':
        return jsonify(error='symbol_not_found'), 404
    if exc.reason == 'malformed':
        log.error('%s: unparseable payload for %s: %s', route, symbol,
                  source.redact(exc.detail, UPSTREAM_API_KEY))
        return jsonify(error='data_unavailable'), 502
    # rate_limited and quota_exhausted are both upstream saying no. They are
    # worth logging loudly — on a 25-calls-a-day tier, reaching one means the
    # cache in fetcher.py is not doing its job.
    log.warning('%s: upstream refused (%s) for %s', route, exc.reason, symbol)
    return jsonify(error='data_unavailable'), 503


def read_route(route, endpoint):
    """Shared body of the read routes: gate, validate, ask the fetcher, wrap.

    The envelope carries how old the data is as well as what it is. A page
    that shows a price without saying when it was taken is the failure mode
    guide section 10 is written to prevent.
    """
    rejection = gate(route)
    if rejection is not None:
        return rejection

    symbol = read_symbol_argument()
    if symbol is None:
        return jsonify(error='invalid_symbol'), 400

    try:
        data, meta = fetcher.get(endpoint, symbol, DATA_SOURCE, UPSTREAM_API_KEY)
    except (provider.ProviderError, source.SourceUnavailable,
            fetcher.Unavailable) as exc:
        return error_for(route, symbol, exc)

    return jsonify(
        symbol=symbol,
        source=DATA_SOURCE,
        delay=DELAY_LABEL,
        stale=meta['stale'],
        fetched_at=meta['fetched_at'],
        served_at=now_utc_iso(),
        **{route: data},
    ), 200


@app.route('/symbols', methods=['GET'])
def symbols():
    """The names the page can search by: GET /symbols.

    Local and free. It reads catalog.py and the fixture directory and never
    goes upstream, which is the whole point — the provider's own symbol-search
    endpoint would spend a call per keystroke against a 25-a-day budget.

    `exhaustive` is the field that matters to the caller. In fixture mode the
    service can only answer for the JSON that happens to be committed, so the
    list is the complete set of symbols that will resolve and the page can say
    so. In live mode the catalogue is a set of suggestions and any listed
    ticker is worth trying, so the page keeps accepting free-typed symbols.
    """
    rejection = gate('symbols')
    if rejection is not None:
        return rejection

    if DATA_SOURCE == 'fixture':
        try:
            available = source.available_symbols(source.DAILY)
        except source.SourceUnavailable as exc:
            log.error('symbols: fixture directory unreadable: %s', exc)
            return jsonify(error='data_unavailable'), 503
        listed = catalog.entries(available)
        exhaustive = True
    else:
        listed = catalog.entries()
        exhaustive = False

    return jsonify(
        source=DATA_SOURCE,
        exhaustive=exhaustive,
        symbols=listed,
        served_at=now_utc_iso(),
    ), 200


@app.route('/quote', methods=['GET'])
def quote():
    """Latest daily bar for one symbol: GET /quote?symbol=SPY."""
    return read_route('quote', source.QUOTE)


@app.route('/history', methods=['GET'])
def history():
    """Daily bars for one symbol, oldest first: GET /history?symbol=SPY.

    The whole cached series is returned and the client slices it into the
    ranges it offers. Serving one series and reusing it across every range is
    what keeps the upstream call count at one per symbol per day, which on a
    25-a-day tier is the difference between working and not.
    """
    return read_route('history', source.DAILY)



@app.route('/sectors', methods=['GET'])
def sector_grid():
    """How the eleven S&P sectors have done: GET /sectors.

    The one route that computes rather than relays. Eleven daily series is a
    third of a megabyte of bars to answer a question that needs forty-four
    numbers, so the arithmetic happens here and the browser is sent the
    figures — the opposite of /history, which hands over the whole series
    precisely so the chart can slice it without asking again.

    It takes no arguments. There is nothing for a caller to vary: the eleven
    funds are fixed, and every window is computed from the same series, so a
    reader switching between them costs nothing.
    """
    rejection = gate('sectors')
    if rejection is not None:
        return rejection

    series_by_symbol, meta = collect.sector_series(
        collect.SECTOR_REFRESH_PER_REQUEST, DATA_SOURCE, UPSTREAM_API_KEY)
    grid = sectors.grid(series_by_symbol)

    return jsonify(
        source=DATA_SOURCE,
        delay=DELAY_LABEL,
        stale=meta['stale'],
        fetched_at=meta['fetched_at'],
        served_at=now_utc_iso(),
        sectors=grid,
    ), 200


# --- Fundamentals -----------------------------------------------------------

@app.route('/fundamentals', methods=['GET'])
def fundamentals_panel():
    """What a company's filings say: GET /fundamentals?symbol=AAPL.

    Two sources meet here and neither can fail the other. The filings come
    from SEC EDGAR, which is public domain and free at this rate; the beta
    comes from daily bars the page has already fetched for something else. A
    fund has no filings and still has a beta, and a company listed last month
    has filings and no beta, so both halves are answered independently and
    either may be null.

    A symbol EDGAR does not file for is **not** an error. It is the ordinary
    answer for every ETF on this page, and the panel says so in fund language
    rather than showing a row of em dashes and leaving the reader to guess.
    """
    rejection = gate('fundamentals')
    if rejection is not None:
        return rejection

    symbol = read_symbol_argument()
    if symbol is None:
        return jsonify(error='invalid_symbol'), 400

    facts = None
    stale = False
    fetched_at = ''
    try:
        facts, meta = fetcher.get_fundamentals(symbol, DATA_SOURCE, EDGAR_CONTACT)
        stale = meta['stale']
        fetched_at = meta['fetched_at']
    except provider.ProviderError as exc:
        if exc.reason != 'not_found':
            return error_for('fundamentals', symbol, exc)
    except (source.SourceUnavailable, fetcher.Unavailable) as exc:
        # A filing source we could not reach is logged and reported as absent
        # rather than as a failed request: the beta below may still be
        # answerable, and half a panel beats none of it.
        log.info('fundamentals: no filings for %s: %s', symbol, exc)

    panel = fundamentals.panel(
        facts,
        collect.cached_series(symbol, DATA_SOURCE, UPSTREAM_API_KEY),
        collect.cached_series(fundamentals.BETA_BENCHMARK, DATA_SOURCE,
                              UPSTREAM_API_KEY))

    return jsonify(
        symbol=symbol,
        source=DATA_SOURCE,
        stale=stale,
        fetched_at=fetched_at,
        served_at=now_utc_iso(),
        fundamentals=panel,
    ), 200


store.init()
log.info('incisor-trading ready on %s:%d (source=%s)',
         LISTEN_HOST, LISTEN_PORT, DATA_SOURCE)


if __name__ == '__main__':
    # Development only. Production runs under gunicorn via the systemd unit.
    app.run(host=LISTEN_HOST, port=LISTEN_PORT)
