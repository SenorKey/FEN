"""Preview server for local review only.

Two jobs beyond serving files:

1. no-store on everything. python -m http.server sends only Last-Modified,
   so Chrome heuristic-caches the stylesheet and happily serves a version
   from several edits ago.

2. /api/* is forwarded to the suggestion service on 127.0.0.1:8788, the way
   Apache forwards it in production, so the corrections form can be tested
   here. Start the service first:

       CONFIG_FILE=/dev/null \
       DISCORD_WEBHOOK_URL=<test> DOE_WEBHOOK_URL=<test> \
       DB_PATH=/tmp/suggest-test.db LISTEN_PORT=8788 \
       ALLOWED_ORIGIN=http://localhost:8732 \
       python3 ../preside-by-side/server/suggest.py

   With the service down the form reports "Could not send", which is the
   same thing a reader would see during an outage - a fair thing to see.
"""

import functools
import http.server
import urllib.error
import urllib.request

API_UPSTREAM = 'http://127.0.0.1:8788'
ROOT = '/Users/keypanzarella/FEN'


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

    def do_POST(self):
        if not self.path.startswith('/api/'):
            self.send_error(404)
            return
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        req = urllib.request.Request(
            API_UPSTREAM + self.path[len('/api'):],
            data=body, method='POST',
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
            code, out = 502, b'{"ok":false,"error":"suggestion service is not running locally"}'
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def log_message(self, *a):
        pass


http.server.ThreadingHTTPServer(
    ('127.0.0.1', 8732),
    functools.partial(Handler, directory=ROOT),
).serve_forever()
