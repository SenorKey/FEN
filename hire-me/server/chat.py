#!/usr/bin/env python3
"""The assistant on /hire-me/, between Apache and Ollama.

Before this, Apache passed /api/chat straight to Ollama, so anyone with a
script could pick any model on the box, write their own instructions, ask
for a huge context window or an endless answer, and send as many at once
as they liked. This service is the only thing that talks to Ollama now,
and it decides all of that itself:

  * The model, the context window, the temperature and the length of an
    answer are set here. Whatever the request asks for is ignored.
  * The instructions are built here, from prompt.txt and the page's own
    lines in ../index.html, the same notes the page used to build in the
    browser. A request cannot replace them; a "system" message in it is
    dropped.
  * A question is at most QUESTION_MAX characters, and only the last
    KEEP_TURNS messages of the conversation are sent back to the model.
  * Each address gets IP_MAX questions an hour, and the whole site
    GLOBAL_MAX. One answer is written at a time; a few more can wait
    briefly for their turn, and the rest are told to try again.
  * Requests must come from the page (the Origin header), like the
    feedback form's.
  * The answer is streamed through untouched, so the page is as fast as
    it was. If the reader presses Stop or leaves, the request to Ollama
    is closed too, which stops the GPU writing an answer nobody will read.

What it cannot do: stop someone asking Llama 3 off-topic questions through
the page within those limits. It caps what any one person can cost.

Config comes from the environment. On the server, systemd fills it from
/etc/hire-me-chat/config.env (EnvironmentFile=); $CONFIG_FILE works too,
for running it by hand. Every key is optional; config.env.example lists
them with their defaults.

Run it with one gunicorn worker: the limits and the queue live in memory.

    gunicorn --workers 1 --threads 8 --bind 127.0.0.1:8792 chat:app
"""

import json
import logging
import os
import re
import sys
import threading
import time
from collections import deque
from html.parser import HTMLParser

import requests
from flask import Flask, Response, jsonify, request


def load_env_file(path):
    """KEY=value lines, # comments. The environment wins over the file."""
    if not path or not os.path.exists(path):
        return
    with open(path) as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, val = line.split('=', 1)
            os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


load_env_file(os.environ.get('CONFIG_FILE'))


def env_int(name, default):
    return int(os.environ.get(name, default))


HERE = os.path.dirname(os.path.abspath(__file__))
PAGE_FILE = os.environ.get('PAGE_FILE', os.path.join(HERE, '..', 'index.html'))
PROMPT_FILE = os.environ.get('PROMPT_FILE', os.path.join(HERE, 'prompt.txt'))

OLLAMA_CHAT = os.environ.get('OLLAMA_URL', 'http://127.0.0.1:11434').rstrip('/') + '/api/chat'
MODEL = os.environ.get('MODEL', 'llama3')
NUM_CTX = env_int('NUM_CTX', 8192)            # the notes are about 3,000 tokens
NUM_PREDICT = env_int('NUM_PREDICT', 512)     # longest answer, in tokens
TEMPERATURE = float(os.environ.get('TEMPERATURE', '0.3'))
KEEP_ALIVE = os.environ.get('KEEP_ALIVE', '').strip()   # e.g. 30m; empty = Ollama's own (5m)

ALLOWED_ORIGINS = {o.strip() for o in os.environ.get(
    'ALLOWED_ORIGIN', 'https://frontendneeded.com,https://www.frontendneeded.com').split(',') if o.strip()}

QUESTION_MAX = env_int('QUESTION_MAX', 300)   # the page's box stops at 300 too
ANSWER_MAX = env_int('ANSWER_MAX', 3000)      # an earlier answer sent back as context
KEEP_TURNS = env_int('KEEP_TURNS', 6)

IP_MAX = env_int('IP_MAX', 20)
IP_WINDOW_SEC = env_int('IP_WINDOW_SEC', 3600)
GLOBAL_MAX = env_int('GLOBAL_MAX', 200)
GLOBAL_WINDOW_SEC = env_int('GLOBAL_WINDOW_SEC', 3600)

QUEUE_MAX = env_int('QUEUE_MAX', 4)           # how many may wait for the GPU
QUEUE_WAIT_SEC = env_int('QUEUE_WAIT_SEC', 20)
ANSWER_WALL_SEC = env_int('ANSWER_WALL_SEC', 150)

ALERT_WEBHOOK_URL = os.environ.get('ALERT_WEBHOOK_URL', '').strip()
ORIGIN_REJECT_ALERT = env_int('ORIGIN_REJECT_ALERT', 20)   # per address per hour

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s', stream=sys.stdout)
log = logging.getLogger('hire-me-chat')

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 64 * 1024


# ── what a refusal says on the page ─────────────────────────────────────

SAY_EMAIL = 'keypanzarella@gmail.com'
SAY = {
    'origin': 'This assistant only answers questions asked on the Hire Me page.',
    'bad': 'That question did not come through right. Try asking it again.',
    'ip': f"You've asked a lot of questions this hour. Try again later, or email me at {SAY_EMAIL}.",
    'global': f'The assistant has had a busy hour and is taking a break. Try again later, or email me at {SAY_EMAIL}.',
    'busy': 'Someone else is asking right now. Try again in a moment.',
    'down': f"The model isn't answering right now. Everything it knows is on this page, or you can email me at {SAY_EMAIL}.",
}


def refuse(status, why):
    return jsonify(ok=False, error=why, say=SAY[why]), status


# ── the page, read the way the browser reads it ─────────────────────────
#
# hire-me.js used to build these notes from the live page. The functions
# below walk the same elements in the same order and produce the same text,
# so an edit to a line in index.html still reaches the assistant with no
# second edit. The test is that the two produce identical prompts.

VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}


class Node:
    __slots__ = ('tag', 'attrs', 'kids', 'parent')

    def __init__(self, tag, attrs, parent):
        self.tag = tag
        self.attrs = dict(attrs)
        self.kids = []
        self.parent = parent

    def has(self, cls):
        return cls in (self.attrs.get('class') or '').split()

    def walk(self):
        """Every element under this one, in document order."""
        for kid in self.kids:
            if isinstance(kid, Node):
                yield kid
                yield from kid.walk()

    def find(self, test):
        return next((n for n in self.walk() if test(n)), None)

    def find_all(self, test):
        return [n for n in self.walk() if test(n)]

    def elements(self):
        return [k for k in self.kids if isinstance(k, Node)]

    def inside(self, test):
        n = self.parent
        while n is not None:
            if test(n):
                return True
            n = n.parent
        return False

    def text(self, drop=()):
        """textContent, as if every element named in drop were removed first."""
        out = []

        def go(node):
            for kid in node.kids:
                if isinstance(kid, str):
                    out.append(kid)
                elif kid.tag not in drop:
                    go(kid)

        go(self)
        return ''.join(out)


class TreeBuilder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node('#document', [], None)
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs, self.cur)
        self.cur.kids.append(node)
        if tag not in VOID:
            self.cur = node

    def handle_startendtag(self, tag, attrs):
        self.cur.kids.append(Node(tag, attrs, self.cur))

    def handle_endtag(self, tag):
        n = self.cur
        while n is not self.root and n.tag != tag:
            n = n.parent
        if n is not self.root:
            self.cur = n.parent

    def handle_data(self, data):
        self.cur.kids.append(data)


def tidy(s):
    return re.sub(r'\s+', ' ', s or '').strip()


TRAILING_DOTS = re.compile(r'(\s*·)+\s*$')


def page_notes(doc):
    """The same notes hire-me.js's pageNotes() built, line for line."""
    notes = []
    stack = doc.find(lambda n: n.attrs.get('id') == 'stack')
    if stack is None:
        raise ValueError('no #stack in the page')

    for sec in stack.find_all(lambda n: n.has('layer')):
        h2 = sec.find(lambda n: n.tag == 'h2')
        cap = sec.find(lambda n: n.has('layer-cap'))
        notes += ['', f'LAYER: {tidy(h2.text())} ({tidy(cap.text())})']
        for line in sec.find_all(lambda n: n.has('ev')):
            name = line.find(lambda n: n.tag == 'b' and n.inside(lambda a: a.tag == 'summary'))
            para = line.find(lambda n: n.tag == 'p')
            notes.append(f'- {tidy(name.text())}: {tidy(para.text())}')
        kit = sec.find(lambda n: n.has('layer-kit'))
        if kit is not None:
            notes.append(f'Skills on this layer: {tidy(kit.text(drop={"span"}))}')

    notes += ['', 'JOBS, EDUCATION AND PROJECTS, AS A LIST']
    for li in doc.find_all(lambda n: n.tag == 'li' and n.inside(lambda a: a.has('rec'))):
        parts = [TRAILING_DOTS.sub('', tidy(c.text(drop={'a'}))) for c in li.elements()]
        notes.append('- ' + ' | '.join(p for p in parts if p))

    return '\n'.join(notes)


PROMPT_MARK = "{{ the page's own lines go here }}"


def read_prompt_file():
    """prompt.txt with its # comment lines taken out."""
    with open(PROMPT_FILE, encoding='utf-8') as fh:
        lines = [ln for ln in fh.read().split('\n') if not ln.startswith('#')]
    text = '\n'.join(lines).strip('\n')
    if PROMPT_MARK not in text:
        raise ValueError(f'prompt.txt has no {PROMPT_MARK} line')
    return text


_prompt_lock = threading.Lock()
_prompt_cache = {'key': None, 'text': None}


def system_prompt():
    """Rebuilt only when index.html or prompt.txt changes, so a git pull
    reaches the assistant with no restart."""
    key = (os.path.getmtime(PAGE_FILE), os.path.getmtime(PROMPT_FILE))
    with _prompt_lock:
        if _prompt_cache['key'] != key:
            with open(PAGE_FILE, encoding='utf-8') as fh:
                builder = TreeBuilder()
                builder.feed(fh.read())
                builder.close()
            text = read_prompt_file().replace(PROMPT_MARK, page_notes(builder.root))
            _prompt_cache.update(key=key, text=text)
            log.info('prompt rebuilt from the page (%d chars)', len(text))
        return _prompt_cache['text']


# ── limits ──────────────────────────────────────────────────────────────

_limits_lock = threading.Lock()
_per_ip = {}
_global = deque()
_origin_rejects = {}


def _trim(q, window, now):
    while q and now - q[0] > window:
        q.popleft()


def over_limit(ip):
    """'ip', 'global' or None. Only looks; count_question() records."""
    now = time.time()
    with _limits_lock:
        _trim(_global, GLOBAL_WINDOW_SEC, now)
        if len(_global) >= GLOBAL_MAX:
            return 'global'
        q = _per_ip.get(ip)
        if q is not None:
            _trim(q, IP_WINDOW_SEC, now)
            if len(q) >= IP_MAX:
                return 'ip'
    return None


def count_question(ip):
    now = time.time()
    with _limits_lock:
        _global.append(now)
        _per_ip.setdefault(ip, deque()).append(now)
        if len(_per_ip) > 5000:      # forget addresses with nothing in the window
            for k in [k for k, q in _per_ip.items() if not q or now - q[-1] > IP_WINDOW_SEC]:
                del _per_ip[k]


def note_origin_reject(ip):
    now = time.time()
    with _limits_lock:
        q = _origin_rejects.setdefault(ip, deque())
        _trim(q, 3600, now)
        q.append(now)
        if len(_origin_rejects) > 5000:
            for k in [k for k, v in _origin_rejects.items() if not v or now - v[-1] > 3600]:
                del _origin_rejects[k]
        return len(q)


# One answer on the GPU at a time. A few more may wait for it.
#
# The slot has an owner and a start time instead of being a plain lock,
# because a slot that is never given back would turn every later question
# away for good. It is given back when the response closes, and again when
# the stream itself ends (both are safe to run twice). If a server bug ever
# skips both (Werkzeug's development server does, when the reader hangs up),
# a slot held past ANSWER_WALL_SEC + 30 is taken over by the next question.
_gpu_cv = threading.Condition()
_gpu_owner = None          # (token, since) while an answer is being written
_waiting = 0
STALE_SEC = ANSWER_WALL_SEC + 30


def take_gpu():
    """A token for the slot, or None if the wait is too long."""
    global _waiting, _gpu_owner
    with _gpu_cv:
        if _waiting >= QUEUE_MAX:
            return None
        _waiting += 1
        try:
            deadline = time.time() + QUEUE_WAIT_SEC
            while _gpu_owner is not None:
                held = time.time() - _gpu_owner[1]
                if held > STALE_SEC:
                    log.warning('took over a GPU slot held for %.0fs; that answer never closed', held)
                    break
                left = deadline - time.time()
                if left <= 0:
                    return None
                _gpu_cv.wait(min(left, 1.0))
            token = object()
            _gpu_owner = (token, time.time())
            return token
        finally:
            _waiting -= 1


def give_gpu(token):
    global _gpu_owner
    with _gpu_cv:
        if _gpu_owner is not None and _gpu_owner[0] is token:
            _gpu_owner = None
            _gpu_cv.notify()


# ── alerts ──────────────────────────────────────────────────────────────

_alerted = {}


def alert(key, text):
    """At most one Discord post per key per hour, sent off the request thread."""
    log.warning('alert: %s', text)
    if not ALERT_WEBHOOK_URL:
        return
    now = time.time()
    with _limits_lock:
        if now - _alerted.get(key, 0) < 3600:
            return
        _alerted[key] = now

    def send():
        try:
            requests.post(ALERT_WEBHOOK_URL, timeout=5, json={
                'username': 'Hire Me assistant',
                'embeds': [{'title': 'Hire Me assistant', 'description': text[:1800], 'color': 0x8F4C1E}],
            })
        except Exception as exc:          # an alert that fails is only a log line
            log.warning('alert not sent: %s', exc)

    threading.Thread(target=send, daemon=True).start()


# ── the request ─────────────────────────────────────────────────────────

def client_ip():
    """Apache appends the address it saw to X-Forwarded-For, so the last
    entry is the real one. The first can be written by anyone."""
    fwd = request.headers.get('X-Forwarded-For', '')
    return fwd.split(',')[-1].strip() if fwd else (request.remote_addr or '')


def read_messages(data):
    """The conversation from the page, cut to size, or None if it is not
    the shape the page sends."""
    if not isinstance(data, dict) or not isinstance(data.get('messages'), list):
        return None
    talk = []
    for m in data['messages']:
        if not isinstance(m, dict) or not isinstance(m.get('content'), str):
            return None
        role = m.get('role')
        if role == 'system':
            continue                       # the instructions are ours to write
        if role not in ('user', 'assistant'):
            return None
        talk.append({'role': role, 'content': m['content']})
    if not talk or talk[-1]['role'] != 'user':
        return None

    question = tidy(talk[-1]['content'])[:QUESTION_MAX]
    if not question:
        return None
    earlier = []
    for m in talk[:-1][-KEEP_TURNS:]:
        cap = QUESTION_MAX if m['role'] == 'user' else ANSWER_MAX
        earlier.append({'role': m['role'], 'content': m['content'].strip()[:cap]})
    return earlier + [{'role': 'user', 'content': question}]


@app.route('/chat', methods=['POST'])
def chat():
    ip = client_ip()

    origin = request.headers.get('Origin', '')
    if origin not in ALLOWED_ORIGINS:
        n = note_origin_reject(ip)
        log.info('refused: origin %r from %s', origin[:80], ip)
        if n >= ORIGIN_REJECT_ALERT:
            alert(f'origin:{ip}', f'{n} requests in the last hour from {ip} without the page as their origin (latest {origin[:80]!r}).')
        return refuse(403, 'origin')

    messages = read_messages(request.get_json(silent=True))
    if messages is None:
        log.info('refused: malformed request from %s', ip)
        return refuse(400, 'bad')

    why = over_limit(ip)
    if why:
        log.info('refused: %s limit, %s', why, ip)
        if why == 'ip':
            alert(f'ip:{ip}', f'{ip} reached {IP_MAX} questions in an hour and is being turned away.')
        else:
            alert('global', f'The whole site reached {GLOBAL_MAX} questions in an hour. Everyone is being turned away until it drops.')
        return refuse(429, why)

    token = take_gpu()
    if token is None:
        log.info('refused: busy, %s', ip)
        return refuse(503, 'busy')

    count_question(ip)
    began = time.time()

    try:
        body = {
            'model': MODEL,
            'stream': True,
            'messages': [{'role': 'system', 'content': system_prompt()}] + messages,
            'options': {'num_ctx': NUM_CTX, 'num_predict': NUM_PREDICT, 'temperature': TEMPERATURE},
        }
        if KEEP_ALIVE:
            body['keep_alive'] = KEEP_ALIVE
        upstream = requests.post(OLLAMA_CHAT, json=body, stream=True, timeout=(5, 120))
        if upstream.status_code != 200:
            log.warning('ollama answered %s: %s', upstream.status_code, upstream.text[:200])
            upstream.close()
            give_gpu(token)
            return refuse(502, 'down')
    except Exception as exc:
        log.warning('ollama unreachable: %s', exc)
        give_gpu(token)
        return refuse(502, 'down')

    done = {'released': False, 'tokens': None, 'reason': None}

    def finish():
        """Runs when the answer is over, whether it ended, was stopped,
        or the reader left. Closing upstream tells Ollama to stop. Called
        from two places, so it does its work once."""
        if done['released']:
            return
        done['released'] = True
        upstream.close()
        give_gpu(token)
        log.info('answered %s: %d messages, %s tokens, %s, %.1fs',
                 ip, len(messages), done['tokens'], done['reason'] or 'cut short', time.time() - began)

    def stream():
        held = b''
        try:
            for chunk in upstream.iter_content(chunk_size=None):
                if not chunk:
                    continue
                yield chunk
                held = (held + chunk)[-2048:]
                if b'"done":true' in held:
                    try:
                        last = json.loads(held.strip().split(b'\n')[-1])
                        done['tokens'] = last.get('eval_count')
                        done['reason'] = last.get('done_reason')
                    except ValueError:
                        pass
                if time.time() - began > ANSWER_WALL_SEC:
                    log.warning('answer for %s passed %ds, cut', ip, ANSWER_WALL_SEC)
                    break
        finally:
            finish()

    resp = Response(stream(), mimetype='application/x-ndjson')
    resp.headers['Cache-Control'] = 'no-store'
    resp.call_on_close(finish)
    return resp


@app.route('/chat/health', methods=['GET'])
def health():
    """For a quick check after a deploy: the prompt builds, Ollama is up.
    Says nothing a visitor could use."""
    try:
        chars = len(system_prompt())
    except Exception as exc:
        return jsonify(ok=False, prompt=str(exc)), 500
    try:
        up = requests.get(OLLAMA_CHAT.rsplit('/api/', 1)[0] + '/api/version', timeout=3).ok
    except Exception:
        up = False
    return jsonify(ok=up, prompt_chars=chars, ollama=up), (200 if up else 502)


if __name__ == '__main__':
    # Local runs only: python chat.py [port]
    app.run(host='127.0.0.1', port=int(sys.argv[1]) if len(sys.argv) > 1 else 8792, threaded=True)
