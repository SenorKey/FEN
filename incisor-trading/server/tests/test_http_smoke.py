"""Boots the service on a real socket and drives it with real HTTP.

The test client in test_incisor.py and test_fixture_layer.py covers behaviour;
this covers the thing the test client cannot prove — that the app actually
serves. "Runs locally" is a T2 acceptance criterion, and a WSGI app can pass
every test-client assertion while failing to boot. T3 adds the read routes to
the same treatment: a quote has to survive real HTTP, not just a WSGI call.

The server binds port 0 (the OS picks a free one) so this never collides with a
real service on 8789, and it is shut down in tearDownClass.
"""

import json
import threading
import unittest
import urllib.error
import urllib.request

import service_fixture  # noqa: F401  — configures the service before import
import incisor  # noqa: E402


class TestOverRealHttp(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        from werkzeug.serving import make_server
        cls.server = make_server('127.0.0.1', 0, incisor.app, threaded=True)
        cls.base = 'http://127.0.0.1:%d' % cls.server.server_port
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.thread.join(timeout=5)

    def setUp(self):
        incisor.reset_rate_limits()

    def get(self, path, headers=None):
        request = urllib.request.Request(self.base + path, headers=headers or {})
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                return response.status, response.headers, response.read()
        except urllib.error.HTTPError as error:
            return error.code, error.headers, error.read()

    def test_the_service_answers_on_a_real_socket(self):
        status, headers, body = self.get('/health')
        self.assertEqual(status, 200)
        self.assertTrue(headers.get('Content-Type', '').startswith('application/json'))
        self.assertEqual(json.loads(body)['status'], 'ok')

    def test_security_headers_survive_the_wire(self):
        _, headers, _ = self.get('/health')
        self.assertEqual(headers.get('X-Content-Type-Options'), 'nosniff')
        self.assertEqual(headers.get('X-Frame-Options'), 'DENY')
        self.assertEqual(headers.get('Content-Security-Policy'), "default-src 'none'")

    def test_a_foreign_origin_is_refused_over_the_wire(self):
        status, _, body = self.get('/health', {'Origin': 'https://evil.example.com'})
        self.assertEqual(status, 403)
        self.assertEqual(json.loads(body)['error'], 'forbidden')

    def test_the_site_origin_is_accepted_over_the_wire(self):
        status, _, _ = self.get('/health', {'Origin': 'https://frontendneeded.com'})
        self.assertEqual(status, 200)

    def test_the_rate_limit_trips_under_a_real_loop(self):
        headers = {'X-Forwarded-For': '198.51.100.42'}
        codes = [self.get('/health', headers)[0]
                 for _ in range(incisor.RATE_LIMIT_MAX + 3)]
        self.assertEqual(codes.count(200), incisor.RATE_LIMIT_MAX)
        self.assertEqual(codes[-3:], [429, 429, 429])

    def test_a_quote_is_served_over_the_wire_from_fixtures(self):
        status, headers, body = self.get('/quote?symbol=SPY')
        self.assertEqual(status, 200)
        self.assertTrue(headers.get('Content-Type', '').startswith('application/json'))
        payload = json.loads(body)
        self.assertEqual(payload['symbol'], 'SPY')
        self.assertEqual(payload['source'], 'fixture')
        self.assertGreater(payload['quote']['price'], 0)

    def test_a_history_series_is_served_over_the_wire_from_fixtures(self):
        status, _, body = self.get('/history?symbol=QQQ')
        self.assertEqual(status, 200)
        bars = json.loads(body)['history']['bars']
        self.assertGreaterEqual(len(bars), 100)

    def test_an_unknown_symbol_is_a_json_404_over_the_wire(self):
        status, headers, body = self.get('/quote?symbol=NOSUCH')
        self.assertEqual(status, 404)
        self.assertTrue(headers.get('Content-Type', '').startswith('application/json'))
        self.assertEqual(json.loads(body)['error'], 'symbol_not_found')

    def test_no_response_body_ever_carries_upstream_prose_or_a_path(self):
        """Guide section 5: log the upstream message, return a token."""
        for path in ('/quote?symbol=SPY', '/quote?symbol=NOSUCH', '/history?symbol=SPY'):
            with self.subTest(path=path):
                incisor.reset_rate_limits()
                _, _, body = self.get(path)
                serialised = body.decode()
                for leak in (incisor.DB_PATH, 'fixtures/', 'Alpha Vantage',
                             'UPSTREAM_API_KEY', 'Traceback'):
                    self.assertNotIn(leak, serialised)

    def test_an_unknown_route_is_json_not_an_html_error_page(self):
        status, headers, body = self.get('/definitely-not-a-route')
        self.assertEqual(status, 404)
        self.assertTrue(headers.get('Content-Type', '').startswith('application/json'))
        self.assertEqual(json.loads(body)['error'], 'not_found')
