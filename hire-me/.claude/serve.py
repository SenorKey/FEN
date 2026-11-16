"""Preview server for /hire-me/. Local review only; nothing on the live site
uses this file.

The page has two things that need a server, and python -m http.server is
neither of them. So, beyond serving the repo:

1. no-store on everything. http.server sends only Last-Modified, so Chrome
   heuristic-caches the stylesheet and serves a version from several edits
   ago. Same fix as the Case Chronicle's preview server.

2. /api/chat is answered by a stand-in for Ollama. It speaks the same wire
   format the real one does with stream:true: one JSON object a line, the
   words in message.content, and a last object with done:true and Ollama's
   timing fields. That is what the page's stream reader, its Stop button and
   the receipt under an answer are written against, so they can be watched
   here without the model.

   It is not the model and its answers mean nothing. It picks one of a few
   canned replies by a word in the question, so the table has something to
   light. Three words in a question change how it behaves, to reach the
   states that are otherwise hard to see:

       "slow"    waits six seconds before the first word
       "broken"  answers 500
       "cut"     stops halfway and closes the connection

   On each question it prints how long the page's system prompt was, which
   is the number to watch against the model's context window.

3. /api/suggest/* is forwarded to the suggestion service, the way Apache
   forwards it in production, so the three questions at the foot of the page
   can be sent. Start the service first, from the repo root:

       CONFIG_FILE=/dev/null PYTHONDONTWRITEBYTECODE=1 \
       DISCORD_WEBHOOK_URL=http://127.0.0.1:8766/__sink \
       DB_PATH=/tmp/hire-me-test.db LISTEN_PORT=8793 \
       ALLOWED_ORIGIN=http://localhost:8766 \
       python3 preside-by-side/server/suggest.py

   /__sink swallows what the service would have posted to Discord and prints
   it here, so a test never reaches a real channel. With the service down the
   form says it could not send, which is what a reader would see in an outage.

4. /api/event, where the site's beacon posts, is answered 204.

Run from the repo root:  python3 hire-me/.claude/serve.py
"""

import functools
import http.server
import json
import pathlib
import time
import urllib.error
import urllib.request

PORT = 8766
SUGGEST_UPSTREAM = 'http://127.0.0.1:8793'
ROOT = str(pathlib.Path(__file__).resolve().parents[2])

REPLIES = [
    (('cellgate', 'hardware', 'wiring', 'device'),
     'At CellGate, Key takes live calls from installer technicians and guides them through wiring '
     'diagnostics: testing the circuit board, metering voltage and isolating faults in the low-voltage '
     'components. When a device drops offline he works out whether the cellular signal, the wired '
     'internet or the VPN failed. He also handles firmware updates and configuration.'),
    (('test', 'automat'),
     'Key covers Incisor Trading with 450+ automated tests and a Playwright tool that takes headless '
     'screenshots and checks the console. He also wrote a monitoring daemon, Status Station, that probes '
     'his server\'s services and systemd units every 15 seconds.'),
    (('deploy', 'server', 'running on', 'site'),
     'The site runs 24/7 on a repurposed PC with Fedora Linux and Apache, using virtual hosts, a reverse '
     'proxy, systemd services and a Git-based deploy. Key manages the DNS and TLS certificates himself.'),
    (('ai', 'model', 'llm'),
     'Key supported two AI products at CentralReach, ScheduleAI and NoteGuardAI. On his own time he runs '
     'Llama 3 through Ollama on his own server, and he benchmarked a YOLOv8n detector across PyTorch, ONNX '
     'Runtime and TensorRT in trtbench.'),
]
DEFAULT_REPLY = ('This is the preview stand-in, not the model, so this answer is canned. On the live site '
                 'the same box would hold whatever Llama 3 said. Key can be reached at keypanzarella@gmail.com.')


def pick_reply(question):
    q = question.lower()
    for words, reply in REPLIES:
        if any(w in q for w in words):
            return reply
    return DEFAULT_REPLY


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

    def log_message(self, *args):
        pass

    def _body(self):
        length = int(self.headers.get('Content-Length', 0) or 0)
        return self.rfile.read(length) if length else b''

    def _json(self, code, payload):
        out = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def do_POST(self):
        if self.path == '/api/chat':
            return self.chat()
        if self.path.startswith('/api/suggest'):
            return self.forward()
        if self.path == '/api/event':
            self._body()
            self.send_response(204)
            self.end_headers()
            return
        if self.path == '/__sink':
            print('[sink] the service would have posted to Discord:', self._body().decode('utf-8', 'replace'), flush=True)
            self.send_response(204)
            self.end_headers()
            return
        self.send_error(404)

    # -- the stand-in for Ollama --------------------------------------------

    def chat(self):
        try:
            req = json.loads(self._body() or b'{}')
        except ValueError:
            return self._json(400, {'error': 'invalid JSON'})

        messages = req.get('messages') or []
        system = next((m.get('content', '') for m in messages if m.get('role') == 'system'), '')
        question = next((m.get('content', '') for m in reversed(messages) if m.get('role') == 'user'), '')
        opts = req.get('options') or {}
        print('[chat] system prompt %d chars (about %d tokens at 3.6 chars each), %d messages, num_ctx=%s, question=%r'
              % (len(system), len(system) / 3.6, len(messages), opts.get('num_ctx'), question[:80]), flush=True)

        q = question.lower()
        if 'broken' in q:
            return self._json(500, {'error': 'the stand-in was asked to fail'})

        words = pick_reply(question).split(' ')
        if 'cut' in q:
            words = words[:len(words) // 2]

        self.send_response(200)
        self.send_header('Content-Type', 'application/x-ndjson')
        self.end_headers()

        started = time.monotonic()
        if 'slow' in q:
            time.sleep(6)
        first = time.monotonic()

        def line(obj):
            self.wfile.write((json.dumps(obj) + '\n').encode())
            self.wfile.flush()

        try:
            for i, word in enumerate(words):
                line({'model': req.get('model', 'llama3'), 'message': {'role': 'assistant', 'content': ('' if i == 0 else ' ') + word}, 'done': False})
                time.sleep(0.03)
            if 'cut' in q:
                return                              # no done:true, the way a dropped connection ends
            now = time.monotonic()
            line({
                'model': req.get('model', 'llama3'),
                'message': {'role': 'assistant', 'content': ''},
                'done': True,
                'done_reason': 'stop',
                'total_duration': int((now - started) * 1e9),
                'load_duration': 0,
                'prompt_eval_count': int(len(system) / 3.6),
                'prompt_eval_duration': int((first - started) * 1e9),
                'eval_count': len(words),
                'eval_duration': int((now - first) * 1e9),
            })
        except (BrokenPipeError, ConnectionResetError):
            print('[chat] the page hung up (Stop pressed)', flush=True)

    # -- the suggestion service, as Apache would reach it --------------------

    def forward(self):
        req = urllib.request.Request(
            SUGGEST_UPSTREAM + self.path[len('/api'):],
            data=self._body(), method='POST',
            headers={
                'Content-Type': 'application/json',
                'Origin': self.headers.get('Origin', ''),
                'User-Agent': self.headers.get('User-Agent', ''),
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                code, out = r.status, r.read()
        except urllib.error.HTTPError as e:
            code, out = e.code, e.read()
        except OSError:
            code, out = 502, b'{"ok":false,"error":"the suggestion service is not running locally"}'
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(out)))
        self.end_headers()
        self.wfile.write(out)


if __name__ == '__main__':
    print('hire-me preview on http://localhost:%d/hire-me/ (serving %s)' % (PORT, ROOT), flush=True)
    http.server.ThreadingHTTPServer(
        ('127.0.0.1', PORT),
        functools.partial(Handler, directory=ROOT),
    ).serve_forever()
