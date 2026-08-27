"""Tests for the Incisor Trading service skeleton.

Covers the T2 acceptance criteria — /health answers with JSON, a bad Origin is
rejected, and the rate limit trips under a loop — plus the edge validation and
the response hygiene guide section 5 asks for.

Every test runs against the temporary database set up by service_fixture, in
fixture mode, so nothing here touches the network or the real data directory.

    cd incisor-trading/server && python3 -m unittest discover tests
"""

import json
import unittest

import service_fixture  # noqa: F401  — configures the service before import
import incisor  # noqa: E402



class ServiceTestCase(unittest.TestCase):

    def setUp(self):
        incisor.app.config['TESTING'] = True
        self.client = incisor.app.test_client()
        incisor.reset_rate_limits()


class TestHealth(ServiceTestCase):

    def test_health_returns_json_and_200(self):
        response = self.client.get('/health')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, 'application/json')
        body = json.loads(response.data)
        self.assertEqual(body['status'], 'ok')
        self.assertEqual(body['service'], 'incisor-trading')
        self.assertEqual(body['source'], 'fixture')
        self.assertEqual(body['storage'], 'ok')
        self.assertIn('time', body)

    def test_health_answers_a_same_origin_request_with_no_origin_header(self):
        """Browsers omit Origin on same-origin GETs, and so does curl."""
        self.assertEqual(self.client.get('/health').status_code, 200)

    def test_health_leaks_nothing_about_the_deployment(self):
        body = json.loads(self.client.get('/health').data)
        self.assertEqual(
            set(body), {'status', 'service', 'source', 'storage', 'time'})
        serialised = json.dumps(body)
        for secret in (incisor.DB_PATH, 'REPLACE_ME', 'UPSTREAM_API_KEY'):
            self.assertNotIn(secret, serialised)


class TestOriginChecking(ServiceTestCase):

    def test_an_allowed_origin_passes(self):
        response = self.client.get(
            '/health', headers={'Origin': 'https://frontendneeded.com'})
        self.assertEqual(response.status_code, 200)

    def test_a_foreign_origin_is_rejected(self):
        response = self.client.get(
            '/health', headers={'Origin': 'https://evil.example.com'})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(json.loads(response.data)['error'], 'forbidden')

    def test_a_lookalike_origin_is_rejected(self):
        """Substring matching would let this through; set membership does not."""
        for origin in ('https://frontendneeded.com.evil.test',
                       'https://notfrontendneeded.com',
                       'http://frontendneeded.com'):
            with self.subTest(origin=origin):
                incisor.reset_rate_limits()
                response = self.client.get('/health', headers={'Origin': origin})
                self.assertEqual(response.status_code, 403, origin)

    def test_strict_mode_requires_an_origin(self):
        """State-changing routes will use strict=True, where absent is a failure."""
        with incisor.app.test_request_context('/health'):
            self.assertFalse(incisor.origin_is_allowed(strict=True))
            self.assertTrue(incisor.origin_is_allowed(strict=False))


class TestRateLimiting(ServiceTestCase):

    def test_the_per_ip_gate_trips_under_a_loop(self):
        limit = incisor.RATE_LIMIT_MAX
        headers = {'X-Forwarded-For': '198.51.100.7'}

        for attempt in range(limit):
            response = self.client.get('/health', headers=headers)
            self.assertEqual(response.status_code, 200, 'tripped early at %d' % attempt)

        response = self.client.get('/health', headers=headers)
        self.assertEqual(response.status_code, 429)
        self.assertEqual(json.loads(response.data)['error'], 'rate_limited')

    def test_a_different_ip_is_unaffected_by_another_ip_ceiling(self):
        for _ in range(incisor.RATE_LIMIT_MAX + 5):
            self.client.get('/health', headers={'X-Forwarded-For': '198.51.100.7'})
        response = self.client.get('/health', headers={'X-Forwarded-For': '203.0.113.9'})
        self.assertEqual(response.status_code, 200)

    def test_the_global_gate_bounds_a_crowd_of_distinct_ips(self):
        """The per-IP cap alone cannot stop a CGNAT crowd; this is the gate
        that actually protects upstream quota."""
        allowed = 0
        for index in range(incisor.GLOBAL_RATE_LIMIT_MAX + 20):
            # A fresh IP every time, so the per-IP gate never fires.
            response = self.client.get(
                '/health', headers={'X-Forwarded-For': '10.%d.%d.%d' % (
                    index // 65536 % 256, index // 256 % 256, index % 256)})
            if response.status_code == 200:
                allowed += 1
            else:
                self.assertEqual(response.status_code, 429)
        self.assertEqual(allowed, incisor.GLOBAL_RATE_LIMIT_MAX)

    def test_an_unidentifiable_caller_still_spends_global_budget(self):
        environ = {'REMOTE_ADDR': ''}
        for _ in range(incisor.GLOBAL_RATE_LIMIT_MAX):
            self.client.get('/health', environ_overrides=environ)
        response = self.client.get('/health', environ_overrides=environ)
        self.assertEqual(response.status_code, 429)


class TestSymbolValidation(unittest.TestCase):
    """Guide section 5: nothing but a whitelisted symbol reaches a query or an
    upstream URL."""

    def test_ordinary_symbols_are_accepted(self):
        for symbol in ('A', 'F', 'AAPL', 'SPY', 'BRK.B', 'RDS-A', 'ABCDEFGHIJ'):
            self.assertTrue(incisor.is_valid_symbol(symbol), symbol)

    def test_malformed_symbols_are_rejected(self):
        rejected = (
            '', 'aapl', '1AAPL', '.AAPL', '-AAPL', 'ABCDEFGHIJK',
            'AAPL ', ' AAPL', 'AA PL', 'AAPL;', "AAPL' OR '1'='1",
            'AAPL/../etc', 'AAPL\nSPY', 'AAPL%00', '../../etc/passwd',
            '<script>', 'AAPL&key=stolen', None, 42, ['AAPL'],
        )
        for symbol in rejected:
            self.assertFalse(incisor.is_valid_symbol(symbol), repr(symbol))

    def test_the_pattern_is_anchored_at_both_ends(self):
        """An unanchored pattern would pass 'AAPL\\nrm -rf' on the first line."""
        self.assertFalse(incisor.is_valid_symbol('AAPL\nevil'))
        self.assertFalse(incisor.is_valid_symbol('evil\nAAPL'))


class TestResponseHygiene(ServiceTestCase):

    def test_security_headers_are_present_on_every_response(self):
        for path in ('/health', '/no-such-route'):
            with self.subTest(path=path):
                headers = self.client.get(path).headers
                self.assertEqual(headers['X-Content-Type-Options'], 'nosniff')
                self.assertEqual(headers['X-Frame-Options'], 'DENY')
                self.assertEqual(headers['Referrer-Policy'], 'no-referrer')
                self.assertEqual(headers['Content-Security-Policy'], "default-src 'none'")

    def test_an_unknown_route_returns_json_not_html(self):
        response = self.client.get('/no-such-route')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.mimetype, 'application/json')
        self.assertEqual(json.loads(response.data)['error'], 'not_found')

    def test_an_unhandled_error_returns_a_generic_message(self):
        """Upstream detail and stack traces belong in the journal, not a body.

        The handler is called directly rather than through a route that raises:
        Flask refuses new routes once the app has served a request, and it is
        the handler's own behaviour under test either way.
        """
        leaky = RuntimeError('upstream said: key=abc123 for https://provider/q')
        with incisor.app.test_request_context('/quote'):
            body, status = incisor._on_unhandled(leaky)

        self.assertEqual(status, 500)
        self.assertEqual(json.loads(body.data), {'error': 'internal_error'})
        for secret in (b'abc123', b'provider', b'Traceback'):
            self.assertNotIn(secret, body.data)

    def test_a_flask_abort_keeps_its_own_status(self):
        """Deliberate aborts must not be flattened into a 500."""
        from werkzeug.exceptions import Forbidden
        with incisor.app.test_request_context('/health'):
            body, status = incisor._on_unhandled(Forbidden())
        self.assertEqual(status, 403)
        self.assertEqual(json.loads(body.data)['error'], 'forbidden')


class TestConfiguration(unittest.TestCase):

    def test_fixture_is_the_default_source(self):
        self.assertEqual(incisor.DATA_SOURCE, 'fixture')

    def test_the_service_binds_to_localhost_only(self):
        self.assertEqual(incisor.LISTEN_HOST, '127.0.0.1')
        self.assertEqual(incisor.LISTEN_PORT, 8789)

    def test_no_credential_is_needed_to_run_in_fixture_mode(self):
        self.assertEqual(incisor.UPSTREAM_API_KEY, '')

    def test_the_origin_allowlist_is_exact_strings(self):
        self.assertEqual(
            incisor.ALLOWED_ORIGINS,
            {'https://frontendneeded.com', 'https://www.frontendneeded.com'})
