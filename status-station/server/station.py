#!/usr/bin/env python3
"""
FEN Status Station — monitoring daemon + LAN dashboard.

One service, four jobs:

  1. Probe local endpoints (Ollama, suggest API, Apache vhost) and systemd
     units on an interval; keep a rolling up/down history per target.
  2. Tail the suggest service journal (journalctl -f) so every event that
     reaches Discord — suggestions, ratings, probe alerts, rate-limit
     trips — also streams into the dashboard feed in real time.
  3. Read the suggest service SQLite (read-only) for queue/ratings counts.
  4. Collect first-party page-interaction beacons: POST /event, proxied
     publicly as /api/event by Apache (same pattern as /api/suggest).

Routes:

    GET  /             dashboard HTML (LAN only — never proxied by Apache)
    GET  /api/status   full JSON snapshot; the dashboard polls this
    POST /event        interaction beacon intake

Run under systemd; see status-station.service. Config is loaded from the
file at $CONFIG_FILE (/etc/status-station/config.env in production). Keys:

    LISTEN_HOST / LISTEN_PORT    default 127.0.0.1:8788
    PUBLIC_SITE_URL              default https://127.0.0.1/ — probed with a
                                 Host header because the router does not
                                 support NAT loopback (see DEPLOYMENT.md of
                                 the suggest service); probing the public
                                 hostname from the LAN would hang.
    PUBLIC_SITE_HOST             default frontendneeded.com
    OLLAMA_PROBE_URL             default http://127.0.0.1:11434/api/version
    SUGGEST_PROBE_URL            default http://127.0.0.1:8787/ratings/washington
    SYSTEMD_UNITS                default httpd,ollama,preside-by-side-suggest
    PROBE_INTERVAL_SEC           default 15
    JOURNAL_UNIT                 default preside-by-side-suggest ('' disables)
    SUGGEST_DB_PATH              default /var/lib/preside-by-side/suggestions.db
    EVENTS_DB_PATH               default /var/lib/status-station/events.db
    ALLOWED_ORIGIN               origins allowed to POST /event;
                                 comma-separated, same default as suggest.py
    EVENT_RATE_MAX / _WINDOW_SEC          per-IP beacon ceiling (120/60s)
    EVENT_GLOBAL_MAX / _WINDOW_SEC        service-wide beacon ceiling (1200/60s)
"""

import datetime
import json
import logging
import os
import pathlib
import re
import sqlite3
import subprocess
import threading
import time
from collections import deque

import requests
from flask import Flask, abort, jsonify, request, send_from_directory


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

LISTEN_HOST = os.environ.get('LISTEN_HOST', '127.0.0.1')
LISTEN_PORT = int(os.environ.get('LISTEN_PORT', '8788'))

PUBLIC_SITE_URL = os.environ.get('PUBLIC_SITE_URL', 'https://127.0.0.1/')
PUBLIC_SITE_HOST = os.environ.get('PUBLIC_SITE_HOST', 'frontendneeded.com')
OLLAMA_PROBE_URL = os.environ.get('OLLAMA_PROBE_URL', 'http://127.0.0.1:11434/api/version')
SUGGEST_PROBE_URL = os.environ.get('SUGGEST_PROBE_URL', 'http://127.0.0.1:8787/ratings/washington')
SYSTEMD_UNITS = [
    u.strip()
    for u in os.environ.get('SYSTEMD_UNITS', 'httpd,ollama,preside-by-side-suggest').split(',')
    if u.strip()
]
PROBE_INTERVAL_SEC = int(os.environ.get('PROBE_INTERVAL_SEC', '15'))
JOURNAL_UNIT = os.environ.get('JOURNAL_UNIT', 'preside-by-side-suggest').strip()

SUGGEST_DB_PATH = os.environ.get('SUGGEST_DB_PATH', '/var/lib/preside-by-side/suggestions.db')
EVENTS_DB_PATH = os.environ.get('EVENTS_DB_PATH', '/var/lib/status-station/events.db')

ALLOWED_ORIGINS = {
    o.strip()
    for o in os.environ.get(
        'ALLOWED_ORIGIN', 'https://frontendneeded.com,https://www.frontendneeded.com'
    ).split(',')
    if o.strip()
}

EVENT_RATE_MAX = int(os.environ.get('EVENT_RATE_MAX', '120'))
EVENT_RATE_WINDOW_SEC = int(os.environ.get('EVENT_RATE_WINDOW_SEC', '60'))
EVENT_GLOBAL_MAX = int(os.environ.get('EVENT_GLOBAL_MAX', '1200'))
EVENT_GLOBAL_WINDOW_SEC = int(os.environ.get('EVENT_GLOBAL_WINDOW_SEC', '60'))

EVENT_TYPES = ('pageview', 'click', 'nav')
MAX_LENGTHS = {'page': 120, 'target': 160}

# 240 checks at the default 15s interval = a rolling 1-hour uptime window.
PROBE_HISTORY_LEN = 240
PROBE_TIMEOUT_SEC = 5

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('station')

# The public-site probe hits https://127.0.0.1 with a Host header, so the
# cert (issued for the public hostname) can never validate — verify=False
# is deliberate there, and urllib3 would otherwise warn on every probe.
requests.packages.urllib3.disable_warnings(
    requests.packages.urllib3.exceptions.InsecureRequestWarning
)

_CTRL_RE = re.compile(r'[\x00-\x1f\x7f]')


def clean_input(s):
    """Trim whitespace and strip ASCII control chars from user-supplied text."""
    if not isinstance(s, str) or not s:
        return ''
    return _CTRL_RE.sub(' ', s).strip()


def now_utc_iso():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def get_client_ip():
    return request.headers.get('X-Forwarded-For', request.remote_addr or '').split(',')[0].strip()


def parse_user_agent(ua):
    """Dependency-free UA summary -> 'Device · OS · Browser'. Same recognizer
    as suggest.py: only known tokens are emitted, never the raw UA."""
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


# --- Shared monitor state -----------------------------------------------------
#
# Same single-process assumption as suggest.py: all of this lives in module
# memory, guarded by _state_lock. The systemd unit pins --workers 1 (with
# --threads for concurrency); bumping workers would fork N independent
# probe/tail threads and N rate-limit ledgers. Don't.

_state_lock = threading.Lock()

# key -> {'label', 'status', 'latency_ms', 'detail', 'last_change', 'history': deque[bool]}
_probe_state = {}

# unit name -> systemctl is-active output ('active', 'inactive', 'failed', ...)
_unit_state = {}

# Rolling feeds for the dashboard. Ring buffers — the dashboard is a live
# view, not an archive; the events SQLite and journalctl hold full history.
_journal_feed = deque(maxlen=200)
_journal_status = 'starting'
_event_feed = deque(maxlen=100)

_event_rate_lock = threading.Lock()
_event_ip_buckets = {}
_event_global_bucket = deque()


PROBES = [
    {
        'key': 'ollama',
        'label': 'Ollama (hire-me chat)',
        'url': OLLAMA_PROBE_URL,
    },
    {
        'key': 'suggest',
        'label': 'Suggest API (preside-by-side)',
        'url': SUGGEST_PROBE_URL,
    },
    {
        'key': 'site',
        'label': 'Apache vhost (%s)' % PUBLIC_SITE_HOST,
        'url': PUBLIC_SITE_URL,
        # Host-header trick: the router has no NAT loopback, so the public
        # hostname is unreachable from the LAN. Hitting 127.0.0.1 with the
        # right Host verifies Apache + vhost + TLS termination locally.
        'host_header': PUBLIC_SITE_HOST,
        'verify': False,
    },
]


def _run_probe(spec):
    """One HTTP probe. Returns (up, latency_ms, detail)."""
    headers = {}
    if spec.get('host_header'):
        headers['Host'] = spec['host_header']
    started = time.monotonic()
    try:
        resp = requests.get(
            spec['url'],
            headers=headers,
            timeout=PROBE_TIMEOUT_SEC,
            verify=spec.get('verify', True),
        )
        latency = int((time.monotonic() - started) * 1000)
        return resp.status_code < 500, latency, 'HTTP %d' % resp.status_code
    except requests.exceptions.RequestException as exc:
        latency = int((time.monotonic() - started) * 1000)
        # Exception class name only — exc text can embed full URLs and
        # pool internals that just add noise on a status tile.
        return False, latency, type(exc).__name__


def _check_units():
    """systemctl is-active for each configured unit. Missing systemctl
    (macOS dev box) degrades to 'unavailable' rather than erroring."""
    out = {}
    for unit in SYSTEMD_UNITS:
        try:
            r = subprocess.run(
                ['systemctl', 'is-active', unit],
                capture_output=True, text=True, timeout=5,
            )
            out[unit] = (r.stdout or '').strip() or 'unknown'
        except FileNotFoundError:
            out[unit] = 'unavailable'
        except subprocess.SubprocessError:
            out[unit] = 'unknown'
    return out


def _probe_worker():
    while True:
        results = [(spec, _run_probe(spec)) for spec in PROBES]
        units = _check_units()
        now_iso = now_utc_iso()
        with _state_lock:
            for spec, (up, latency, detail) in results:
                st = _probe_state.get(spec['key'])
                if st is None:
                    st = {
                        'label': spec['label'],
                        'status': None,
                        'latency_ms': None,
                        'detail': '',
                        'last_change': now_iso,
                        'history': deque(maxlen=PROBE_HISTORY_LEN),
                    }
                    _probe_state[spec['key']] = st
                status = 'up' if up else 'down'
                if st['status'] is not None and st['status'] != status:
                    st['last_change'] = now_iso
                    log.info('probe %s: %s -> %s (%s)', spec['key'], st['status'], status, detail)
                st['status'] = status
                st['latency_ms'] = latency
                st['detail'] = detail
                st['history'].append(up)
            _unit_state.clear()
            _unit_state.update(units)
        time.sleep(PROBE_INTERVAL_SEC)


def _classify_journal(msg, priority):
    if msg.startswith('rating:'):
        return 'rating'
    if 'queued suggestion' in msg:
        return 'suggestion'
    if priority <= 4:  # journald: 4=warning, 3=err
        return 'alert'
    return 'info'


def _journal_worker():
    """Tail the suggest service journal forever. Every Discord-bound event
    is also a journal line (notify propagates to journald), so this feed is
    a superset of what lands in the Discord channels — no changes to
    suggest.py needed. Requires membership in the systemd-journal group
    (SupplementaryGroups= in the unit)."""
    global _journal_status
    while True:
        try:
            proc = subprocess.Popen(
                ['journalctl', '-u', JOURNAL_UNIT, '-f', '-n', '40',
                 '-o', 'json', '--no-pager'],
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
            )
        except FileNotFoundError:
            with _state_lock:
                _journal_status = 'journalctl not available on this host'
            return
        with _state_lock:
            _journal_status = 'tailing %s' % JOURNAL_UNIT
        for line in proc.stdout:
            try:
                rec = json.loads(line)
            except ValueError:
                continue
            msg = rec.get('MESSAGE') or ''
            if isinstance(msg, list):
                # journald emits non-UTF8 messages as byte arrays.
                try:
                    msg = bytes(msg).decode('utf-8', 'replace')
                except (TypeError, ValueError):
                    continue
            try:
                priority = int(rec.get('PRIORITY', 6))
            except (TypeError, ValueError):
                priority = 6
            ts_us = rec.get('__REALTIME_TIMESTAMP')
            try:
                at = datetime.datetime.fromtimestamp(
                    int(ts_us) / 1e6, tz=datetime.timezone.utc
                ).isoformat()
            except (TypeError, ValueError):
                at = now_utc_iso()
            entry = {
                'at': at,
                'kind': _classify_journal(msg, priority),
                'text': msg[:500],
            }
            with _state_lock:
                _journal_feed.append(entry)
        # journalctl exited (rotation hiccup, OOM, …) — note it and retail.
        with _state_lock:
            _journal_status = 'journalctl exited; restarting'
        log.warning('journalctl tail exited; restarting in 5s')
        time.sleep(5)


# --- Events database ----------------------------------------------------------

try:
    pathlib.Path(EVENTS_DB_PATH).parent.mkdir(parents=True, exist_ok=True)
except OSError:
    # Dev box without /var/lib write access — fall back next to the source
    # so `python3 station.py` just works. Production uses the systemd path.
    EVENTS_DB_PATH = str(pathlib.Path(__file__).resolve().parent / 'events-dev.db')
    log.warning('events DB path not writable; using %s', EVENTS_DB_PATH)


def events_db():
    conn = sqlite3.connect(EVENTS_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA synchronous=NORMAL')
    return conn


with events_db() as _conn:
    _conn.execute('PRAGMA journal_mode=WAL')
    _conn.execute(
        """
        CREATE TABLE IF NOT EXISTS events (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            received_at TEXT NOT NULL,
            type        TEXT NOT NULL,
            page        TEXT NOT NULL,
            target      TEXT,
            device      TEXT
        )
        """
    )
    _conn.execute('CREATE INDEX IF NOT EXISTS idx_events_time ON events(received_at)')


def suggest_db_stats():
    """Read-only counts from the suggest service DB. Any failure (file
    missing on the dev box, perms) degrades to ok=False — the dashboard
    shows the error string instead of numbers."""
    today = now_utc_iso()[:10]
    try:
        conn = sqlite3.connect('file:%s?mode=ro' % SUGGEST_DB_PATH, uri=True, timeout=2)
        try:
            pending = conn.execute(
                "SELECT COUNT(*) FROM suggestions WHERE status='pending'"
            ).fetchone()[0]
            suggestions_today = conn.execute(
                'SELECT COUNT(*) FROM suggestions WHERE substr(received_at,1,10)=?',
                (today,),
            ).fetchone()[0]
            ratings_today = conn.execute(
                'SELECT COUNT(*) FROM ratings_history WHERE substr(happened_at,1,10)=?',
                (today,),
            ).fetchone()[0]
        finally:
            conn.close()
        return {
            'ok': True,
            'pending': pending,
            'suggestions_today': suggestions_today,
            'ratings_today': ratings_today,
        }
    except sqlite3.Error as exc:
        return {'ok': False, 'error': str(exc)}


def event_rate_check(ip):
    """Two-gate beacon ceiling, same shape as suggest.py's. Beacons are
    fire-and-forget telemetry — over the cap we just drop, never queue."""
    now = time.monotonic()
    with _event_rate_lock:
        gcut = now - EVENT_GLOBAL_WINDOW_SEC
        while _event_global_bucket and _event_global_bucket[0] < gcut:
            _event_global_bucket.popleft()
        if len(_event_global_bucket) >= EVENT_GLOBAL_MAX:
            return False
        if ip:
            icut = now - EVENT_RATE_WINDOW_SEC
            bucket = _event_ip_buckets.get(ip)
            if bucket is None:
                bucket = deque()
                _event_ip_buckets[ip] = bucket
            while bucket and bucket[0] < icut:
                bucket.popleft()
            if len(bucket) >= EVENT_RATE_MAX:
                return False
            bucket.append(now)
            if len(_event_ip_buckets) > 4096:
                for k in [k for k, v in _event_ip_buckets.items() if not v]:
                    del _event_ip_buckets[k]
        _event_global_bucket.append(now)
    return True


# --- Flask app ----------------------------------------------------------------

DASHBOARD_DIR = pathlib.Path(__file__).resolve().parent.parent / 'dashboard'

app = Flask(__name__, static_folder=str(DASHBOARD_DIR), static_url_path='/dashboard')
app.config['MAX_CONTENT_LENGTH'] = 4 * 1024


@app.after_request
def _security_headers(response):
    response.headers.setdefault('X-Content-Type-Options', 'nosniff')
    response.headers.setdefault('X-Frame-Options', 'DENY')
    response.headers.setdefault('Referrer-Policy', 'no-referrer')
    # 'self' (not 'none') — this service serves its own HTML/CSS/JS.
    response.headers.setdefault('Content-Security-Policy', "default-src 'self'")
    return response


@app.route('/')
def index():
    return send_from_directory(str(DASHBOARD_DIR), 'index.html')


@app.route('/api/status')
def api_status():
    with _state_lock:
        probes = []
        for spec in PROBES:
            st = _probe_state.get(spec['key'])
            if st is None:
                probes.append({
                    'key': spec['key'], 'label': spec['label'],
                    'status': 'unknown', 'latency_ms': None,
                    'detail': 'first probe pending', 'uptime_pct': None,
                    'last_change': None,
                })
                continue
            history = st['history']
            uptime = round(100.0 * sum(history) / len(history), 1) if history else None
            probes.append({
                'key': spec['key'], 'label': st['label'],
                'status': st['status'], 'latency_ms': st['latency_ms'],
                'detail': st['detail'], 'uptime_pct': uptime,
                'last_change': st['last_change'],
            })
        units = [{'unit': u, 'state': _unit_state.get(u, 'unknown')} for u in SYSTEMD_UNITS]
        journal = {'status': _journal_status, 'recent': list(_journal_feed)[-60:][::-1]}
        recent_events = list(_event_feed)[::-1]

    today = now_utc_iso()[:10]
    try:
        with events_db() as conn:
            events_today = conn.execute(
                'SELECT COUNT(*) FROM events WHERE substr(received_at,1,10)=?',
                (today,),
            ).fetchone()[0]
        events = {'ok': True, 'today': events_today, 'recent': recent_events}
    except sqlite3.Error as exc:
        events = {'ok': False, 'error': str(exc), 'recent': recent_events}

    return jsonify({
        'generated_at': now_utc_iso(),
        'probe_interval_sec': PROBE_INTERVAL_SEC,
        'probes': probes,
        'units': units,
        'suggest_db': suggest_db_stats(),
        'events': events,
        'journal': journal,
    })


@app.route('/event', methods=['POST'])
def event():
    # Same Origin gate as the suggest service — beacons come from our own
    # pages, anything else is noise. 204 either way on rate-limit drops;
    # telemetry must never surface errors to a visitor's browser console.
    origin = request.headers.get('Origin', '')
    if origin not in ALLOWED_ORIGINS:
        abort(403)

    if not event_rate_check(get_client_ip()):
        return '', 204

    data = request.get_json(silent=True) or {}
    etype = clean_input(data.get('type'))
    page = clean_input(data.get('page'))[:MAX_LENGTHS['page']]
    target = clean_input(data.get('target'))[:MAX_LENGTHS['target']]

    if etype not in EVENT_TYPES or not page:
        return '', 204

    device = parse_user_agent(request.headers.get('User-Agent', '')[:300])
    at = now_utc_iso()

    with events_db() as conn:
        conn.execute(
            'INSERT INTO events (received_at, type, page, target, device) VALUES (?,?,?,?,?)',
            (at, etype, page, target or None, device or None),
        )
    with _state_lock:
        _event_feed.append({
            'at': at, 'type': etype, 'page': page,
            'target': target, 'device': device,
        })
    return '', 204


# --- Background threads -------------------------------------------------------
#
# Started at import so the gunicorn worker gets them too (mirrors how
# suggest.py wires its Discord handler). --workers must stay 1.

_started = False


def _start_background():
    global _started
    if _started:
        return
    _started = True
    threading.Thread(target=_probe_worker, name='probes', daemon=True).start()
    if JOURNAL_UNIT:
        threading.Thread(target=_journal_worker, name='journal-tail', daemon=True).start()
    else:
        global _journal_status
        _journal_status = 'disabled (JOURNAL_UNIT empty)'
    log.info('status station up — probes every %ds, events DB %s',
             PROBE_INTERVAL_SEC, EVENTS_DB_PATH)


_start_background()


if __name__ == '__main__':
    app.run(host=LISTEN_HOST, port=LISTEN_PORT)
