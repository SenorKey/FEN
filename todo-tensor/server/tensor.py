"""ToDo Tensor: the list's one source of truth.

Anyone may read the list. Only the owner, signed in with the one password,
may change it. The browser reaches this service through Apache at
/api/todo-tensor/…, the same way the Preside by Side suggestion box is
reached at /api/suggest.

    GET  /list      the list, its revision number and when it was saved
    GET  /session   whether this browser is signed in as the owner
    POST /login     {password}          signs this browser in
    POST /logout                        signs it out
    PUT  /list      {rev, list}         replaces the list (owner only)

Every save is kept as its own row, so the list has a history on the
server: `python3 tensor.py history` lists it and `python3 tensor.py export
[rev]` prints any version. A save names the revision it was made from; if
the list has moved on since (an edit from another device), the save is
refused with 409 and nothing is lost on either side.

Configuration comes from the environment, or a KEY=VALUE file named by
CONFIG_FILE (see config.env.example). Two values are required and never
belong in the repo: TENSOR_SECRET_KEY, which signs the sign-in cookie, and
TENSOR_OWNER_HASH, the password's hash (`python3 tensor.py hash-password`).

`python3 tensor.py dev` runs the whole page locally: this API under
/api/todo-tensor/ and the FEN folder as static files, on one origin, with
a throwaway database and the password "dev" unless told otherwise.
"""

import datetime
import getpass
import hmac
import json
import math
import os
import re
import secrets
import sqlite3
import sys
import threading
import time
from collections import deque
from contextlib import contextmanager

from flask import Flask, abort, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash


HERE = os.path.dirname(os.path.abspath(__file__))


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

DB_PATH = os.environ.get('TENSOR_DB', '/var/lib/todo-tensor/tensor.db')
SEED_FILE = os.environ.get('TENSOR_SEED', os.path.join(HERE, '..', 'list.json'))
ALLOWED_ORIGINS = {
    o.strip().rstrip('/')
    for o in os.environ.get('ALLOWED_ORIGIN', 'https://frontendneeded.com').split(',')
    if o.strip()
}
COOKIE_SECURE = os.environ.get('COOKIE_SECURE', '1') != '0'
SESSION_DAYS = int(os.environ.get('SESSION_DAYS', '30'))
KEEP_REVISIONS = int(os.environ.get('KEEP_REVISIONS', '1000'))

# Wrong passwords: this many from one address in the window locks that
# address out until the window passes; the global cap does the same for
# everyone at once, so spreading a guess over many addresses gains nothing.
LOGIN_FAILS_PER_IP = int(os.environ.get('LOGIN_FAILS_PER_IP', '5'))
LOGIN_FAILS_GLOBAL = int(os.environ.get('LOGIN_FAILS_GLOBAL', '30'))
LOGIN_WINDOW_SEC = int(os.environ.get('LOGIN_WINDOW_SEC', '900'))

# The same limits the page keeps (todo-tensor.js), checked again here
# because the page is not the only thing that can send a request.
MAX_PARAMS = 3
MAX_ITEMS = 2000
MAX_TEXT = 300
MAX_PLAN = 20000      # letters in an idea's plan: pages of it
MAX_POLE = 40
MAX_ID = 64

app = Flask(__name__)
app.config.update(
    MAX_CONTENT_LENGTH=4 * 1024 * 1024,             # 4 MB: thousands of ideas, some with long plans
    SESSION_COOKIE_NAME='tt_owner',
    SESSION_COOKIE_PATH='/api/todo-tensor',         # sent to this API and nowhere else
    SESSION_COOKIE_HTTPONLY=True,                   # no script on any page can read it
    SESSION_COOKIE_SECURE=COOKIE_SECURE,            # HTTPS only (off for the local dev server)
    SESSION_COOKIE_SAMESITE='Strict',               # never sent on a request another site starts
    PERMANENT_SESSION_LIFETIME=datetime.timedelta(days=SESSION_DAYS),
)


def configure(secret_key, owner_hash):
    if not secret_key or len(secret_key) < 32:
        sys.exit('TENSOR_SECRET_KEY is required: at least 32 characters (python3 -c "import secrets; print(secrets.token_urlsafe(48))")')
    if not owner_hash:
        sys.exit('TENSOR_OWNER_HASH is required (python3 tensor.py hash-password)')
    app.secret_key = secret_key
    app.config['OWNER_HASH'] = owner_hash


# ── The list's shape ──────────────────────────────────────────────────────

def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _word(v):
    return re.sub(r'\s+', ' ', v).strip()[:MAX_POLE] if isinstance(v, str) else ''


def _id(v):
    return v if isinstance(v, str) and 0 < len(v) <= MAX_ID else None


def _plan(v):
    """An idea's plan: its lines kept as typed, line endings made plain,
    trailing spaces and blank lines at either end dropped."""
    if not isinstance(v, str):
        return ''
    lines = v.replace('\r\n', '\n').replace('\r', '\n').split('\n')
    return '\n'.join(l.rstrip() for l in lines).strip('\n')[:MAX_PLAN]


def _added(v):
    """When an idea was added: an ISO 8601 time, or '' if it is not one."""
    if not isinstance(v, str) or len(v) > 40:
        return ''
    try:
        datetime.datetime.fromisoformat(v.replace('Z', '+00:00'))
    except ValueError:
        return ''
    return v


def clean(raw):
    """The list as the page keeps it, or ValueError. Mirrors clean() in
    todo-tensor.js, but refuses what is malformed instead of repairing it:
    a save that does not look like the page made it is not saved."""
    if not isinstance(raw, dict):
        raise ValueError('the list must be an object')
    params_in = raw.get('params', [])
    items_in = raw.get('items', [])
    if not isinstance(params_in, list) or not isinstance(items_in, list):
        raise ValueError('params and items must be lists')
    if len(params_in) > MAX_PARAMS:
        raise ValueError(f'at most {MAX_PARAMS} parameters')
    if len(items_in) > MAX_ITEMS:
        raise ValueError(f'at most {MAX_ITEMS} ideas')

    params, seen = [], set()
    for p in params_in:
        pid = _id(p.get('id')) if isinstance(p, dict) else None
        if not pid or pid in seen:
            raise ValueError('every parameter needs its own id')
        seen.add(pid)
        params.append({'id': pid, 'left': _word(p.get('left')), 'right': _word(p.get('right'))})

    items, seen = [], set()
    for x in items_in:
        if not isinstance(x, dict):
            raise ValueError('every idea must be an object')
        iid = _id(x.get('id'))
        text = x.get('text')
        if not iid or iid in seen:
            raise ValueError('every idea needs its own id')
        if not isinstance(text, str) or not text.strip():
            raise ValueError('every idea needs words')
        seen.add(iid)
        scores = {}
        raw_scores = x.get('scores') or {}
        if not isinstance(raw_scores, dict):
            raise ValueError('scores must be an object')
        for k, v in raw_scores.items():
            if _id(k) and _num(v):
                scores[k] = max(-1.0, min(1.0, float(v)))
        item = {'id': iid, 'text': text.strip()[:MAX_TEXT], 'done': bool(x.get('done')), 'scores': scores}
        plan = x.get('plan')
        if plan is not None and not isinstance(plan, str):
            raise ValueError('a plan must be text')
        plan = _plan(plan)
        if plan:
            item['plan'] = plan   # left out when empty, so a list with no plans reads as before
        added = _added(x.get('added'))
        if added:
            item['added'] = added   # for "Recently added"; ideas from before it have none
        items.append(item)

    return {'version': 2, 'params': params, 'items': items}


# ── Storage ───────────────────────────────────────────────────────────────

_db_lock = threading.Lock()


@contextmanager
def db():
    """One connection for one piece of work: committed if it ends well,
    rolled back if not, and closed either way."""
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def init_db():
    os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
    with _db_lock, db() as conn:
        conn.execute('PRAGMA journal_mode=WAL')
        conn.execute('''CREATE TABLE IF NOT EXISTS revisions (
            rev      INTEGER PRIMARY KEY AUTOINCREMENT,
            saved_at TEXT NOT NULL,
            body     TEXT NOT NULL
        )''')
        if conn.execute('SELECT COUNT(*) FROM revisions').fetchone()[0] == 0:
            # the first start: the published list.json is revision 1
            try:
                with open(SEED_FILE) as f:
                    seed = clean(json.load(f))
            except (OSError, ValueError):
                seed = {'version': 2, 'params': [], 'items': []}
            conn.execute('INSERT INTO revisions (saved_at, body) VALUES (?, ?)',
                         (now_iso(), json.dumps(seed, ensure_ascii=False)))


def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')


def current(conn, rev=None):
    if rev is None:
        return conn.execute('SELECT rev, saved_at, body FROM revisions ORDER BY rev DESC LIMIT 1').fetchone()
    return conn.execute('SELECT rev, saved_at, body FROM revisions WHERE rev = ?', (rev,)).fetchone()


# ── Who is asking ─────────────────────────────────────────────────────────

def client_ip():
    # Apache appends the real peer as the LAST X-Forwarded-For entry; anything
    # before it is whatever the client chose to send.
    fwd = request.headers.get('X-Forwarded-For', '')
    return fwd.split(',')[-1].strip() if fwd else (request.remote_addr or '')


def is_owner():
    return session.get('owner') is True


def same_origin():
    return request.headers.get('Origin', '').rstrip('/') in ALLOWED_ORIGINS


def csrf_ok():
    sent = request.headers.get('X-Tensor-CSRF', '')
    want = session.get('csrf', '')
    return bool(sent and want) and hmac.compare_digest(sent, want)


_fails_lock = threading.Lock()
_fails_by_ip = {}
_fails_all = deque()


def _prune(q, now):
    while q and q[0] < now - LOGIN_WINDOW_SEC:
        q.popleft()


def locked_out(ip):
    now = time.time()
    with _fails_lock:
        _prune(_fails_all, now)
        q = _fails_by_ip.get(ip)
        if q is not None:
            _prune(q, now)
            if not q:
                del _fails_by_ip[ip]
        return len(_fails_all) >= LOGIN_FAILS_GLOBAL or (q is not None and len(q) >= LOGIN_FAILS_PER_IP)


def note_fail(ip):
    now = time.time()
    with _fails_lock:
        _fails_all.append(now)
        _fails_by_ip.setdefault(ip, deque()).append(now)


def body_json():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        abort(400)
    return data


# ── Routes ────────────────────────────────────────────────────────────────

@app.after_request
def _headers(response):
    response.headers.setdefault('Cache-Control', 'no-store')
    response.headers.setdefault('X-Content-Type-Options', 'nosniff')
    response.headers.setdefault('X-Frame-Options', 'DENY')
    response.headers.setdefault('Referrer-Policy', 'no-referrer')
    if response.mimetype == 'application/json':
        response.headers.setdefault('Content-Security-Policy', "default-src 'none'")
    return response


@app.errorhandler(400)
def _bad(_e):
    return jsonify(error='bad request'), 400


@app.errorhandler(413)
def _big(_e):
    return jsonify(error='too large'), 413


@app.get('/list')
def get_list():
    with db() as conn:
        row = current(conn)
    return jsonify(rev=row['rev'], saved_at=row['saved_at'], list=json.loads(row['body']))


@app.get('/session')
def get_session():
    # plans=True says this server keeps plans; a page talking to an older
    # one (which would drop them unseen) does not offer to write any
    if is_owner():
        return jsonify(owner=True, csrf=session.get('csrf'), plans=True)
    return jsonify(owner=False, plans=True)


@app.post('/login')
def login():
    if not same_origin():
        return jsonify(error='bad origin'), 403
    ip = client_ip()
    if locked_out(ip):
        return jsonify(error='too many tries; wait a while'), 429
    password = body_json().get('password')
    if not isinstance(password, str) or len(password) > 1024 \
            or not check_password_hash(app.config['OWNER_HASH'], password):
        note_fail(ip)
        time.sleep(0.5)   # one wrong guess costs time too
        return jsonify(error='wrong password'), 401
    session.clear()
    session.permanent = True
    session['owner'] = True
    session['csrf'] = secrets.token_urlsafe(32)
    app.logger.info('owner signed in from %s', ip)
    return jsonify(owner=True, csrf=session['csrf'], plans=True)


@app.post('/logout')
def logout():
    if not same_origin():
        return jsonify(error='bad origin'), 403
    session.clear()
    return jsonify(owner=False)


@app.put('/list')
def put_list():
    if not same_origin():
        return jsonify(error='bad origin'), 403
    if not is_owner() or not csrf_ok():
        return jsonify(error='sign in to save'), 401
    data = body_json()
    base = data.get('rev')
    if not isinstance(base, int) or isinstance(base, bool):
        abort(400)
    try:
        lst = clean(data.get('list'))
    except ValueError as e:
        return jsonify(error=str(e)), 400
    body = json.dumps(lst, ensure_ascii=False)
    with _db_lock, db() as conn:
        row = current(conn)
        if row['rev'] != base:
            # saved from another device since this one last loaded
            return jsonify(error='changed elsewhere', rev=row['rev'], saved_at=row['saved_at'],
                           list=json.loads(row['body'])), 409
        if row['body'] == body:
            return jsonify(rev=row['rev'], saved_at=row['saved_at'])
        cur = conn.execute('INSERT INTO revisions (saved_at, body) VALUES (?, ?)', (now_iso(), body))
        rev = cur.lastrowid
        conn.execute('DELETE FROM revisions WHERE rev <= ?', (rev - KEEP_REVISIONS,))
        saved_at = conn.execute('SELECT saved_at FROM revisions WHERE rev = ?', (rev,)).fetchone()[0]
    return jsonify(rev=rev, saved_at=saved_at)


# ── Command line ──────────────────────────────────────────────────────────

def _serve_dev(port):
    """The page and the API on one origin, for trying it on this machine."""
    from flask import send_from_directory
    from werkzeug.middleware.dispatcher import DispatcherMiddleware

    root = os.path.abspath(os.path.join(HERE, '..', '..'))
    site = Flask('site', static_folder=None)

    @site.route('/', defaults={'path': 'index.html'})
    @site.route('/<path:path>')
    def static_file(path):
        full = os.path.join(root, path)
        if os.path.isdir(full):
            path = os.path.join(path, 'index.html')
        resp = send_from_directory(root, path)
        resp.headers['Cache-Control'] = 'no-cache'
        return resp

    site.wsgi_app = DispatcherMiddleware(site.wsgi_app, {'/api/todo-tensor': app})
    print(f'ToDo Tensor dev: http://localhost:{port}/todo-tensor/  (database {DB_PATH})')
    site.run(host='127.0.0.1', port=port, debug=False)


def main(argv):
    global DB_PATH, ALLOWED_ORIGINS
    cmd = argv[1] if len(argv) > 1 else ''
    if cmd == 'hash-password':
        pw = getpass.getpass('New owner password: ')
        if len(pw) < 12:
            sys.exit('Use at least 12 characters.')
        if getpass.getpass('Again: ') != pw:
            sys.exit('The two did not match.')
        print(generate_password_hash(pw))
        return
    if cmd == 'history':
        with db() as conn:
            for r in conn.execute('SELECT rev, saved_at, length(body) AS n FROM revisions ORDER BY rev DESC LIMIT 50'):
                print(f"{r['rev']:>6}  {r['saved_at']}  {r['n']} bytes")
        return
    if cmd == 'export':
        with db() as conn:
            row = current(conn, int(argv[2]) if len(argv) > 2 else None)
        if not row:
            sys.exit('No such revision.')
        print(json.dumps(json.loads(row['body']), ensure_ascii=False, indent=2))
        return
    if cmd == 'date-ideas':
        # Once, after this version is deployed: ideas made before ideas carried
        # a date get the time of the first saved version that holds them, and
        # the result is saved as a new version. Ideas older than the server
        # all get its first day; "Recently added" keeps their list order.
        with _db_lock, db() as conn:
            first = {}
            for r in conn.execute('SELECT saved_at, body FROM revisions ORDER BY rev'):
                for it in json.loads(r['body']).get('items', []):
                    if isinstance(it, dict):
                        first.setdefault(it.get('id'), r['saved_at'])
            row = current(conn)
            lst = json.loads(row['body'])
            n = 0
            for it in lst['items']:
                if not it.get('added') and it['id'] in first:
                    it['added'] = first[it['id']]
                    n += 1
            if not n:
                print('Every idea already has a date.')
                return
            cur = conn.execute('INSERT INTO revisions (saved_at, body) VALUES (?, ?)',
                               (now_iso(), json.dumps(clean(lst), ensure_ascii=False)))
        print(f'Dated {n} ideas; saved as revision {cur.lastrowid}. Reload the page.')
        return
    if cmd == 'dev':
        port = int(os.environ.get('PORT', '8790'))
        DB_PATH = os.environ.get('TENSOR_DB', os.path.join(HERE, 'dev.db'))
        ALLOWED_ORIGINS = {f'http://localhost:{port}', f'http://127.0.0.1:{port}'}
        app.config['SESSION_COOKIE_SECURE'] = False
        configure(os.environ.get('TENSOR_SECRET_KEY') or secrets.token_urlsafe(48),
                  os.environ.get('TENSOR_OWNER_HASH') or generate_password_hash('dev'))
        init_db()
        _serve_dev(port)
        return
    sys.exit('usage: tensor.py hash-password | history | export [rev] | date-ideas | dev')


if __name__ == '__main__':
    main(sys.argv)
else:
    # under gunicorn: the service proper
    configure(os.environ.get('TENSOR_SECRET_KEY'), os.environ.get('TENSOR_OWNER_HASH'))
    init_db()
