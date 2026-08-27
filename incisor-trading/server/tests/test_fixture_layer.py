"""Tests for the fixture layer end to end — the T3 acceptance criteria.

The headline criterion is that the service serves quotes from fixtures "with no
network access at all". TestNoNetworkAccess proves it rather than assuming it:
every socket constructor is replaced with one that raises, and a full request
is driven through the real route stack with them in place.

    cd incisor-trading/server && python3 -m unittest discover tests
"""

import json
import os
import socket
import sys
import unittest
from unittest import mock

import service_fixture  # noqa: F401  — configures the service before import
import incisor  # noqa: E402
import provider  # noqa: E402
import source  # noqa: E402
import store  # noqa: E402

# The symbols the committed fixture set answers for. Listed rather than derived
# from the directory, so deleting a fixture fails a test instead of quietly
# shrinking what is covered.
FIXTURE_SYMBOLS = ('SPY', 'QQQ', 'DIA', 'IWM', 'AAPL', 'BRK.B')

# The four ETF proxies the dashboard's summary strip is built on (T6).
PROXY_SYMBOLS = ('SPY', 'QQQ', 'DIA', 'IWM')


class RouteTestCase(unittest.TestCase):

    def setUp(self):
        incisor.app.config['TESTING'] = True
        self.client = incisor.app.test_client()
        incisor.reset_rate_limits()

    def get_json(self, path, expect=200, **kwargs):
        response = self.client.get(path, **kwargs)
        self.assertEqual(response.status_code, expect, response.data)
        self.assertEqual(response.mimetype, 'application/json')
        return json.loads(response.data)


class TestQuoteRoute(RouteTestCase):

    def test_every_fixture_symbol_serves_a_quote(self):
        for symbol in FIXTURE_SYMBOLS:
            with self.subTest(symbol=symbol):
                incisor.reset_rate_limits()
                body = self.get_json('/quote?symbol=%s' % symbol)
                self.assertEqual(body['symbol'], symbol)
                self.assertEqual(body['quote']['symbol'], symbol)
                self.assertIsInstance(body['quote']['price'], float)
                self.assertGreater(body['quote']['price'], 0)

    def test_the_envelope_says_where_the_numbers_came_from(self):
        """The page must be able to label invented data as invented."""
        body = self.get_json('/quote?symbol=SPY')
        self.assertEqual(body['source'], 'fixture')
        self.assertEqual(body['delay'], 'end-of-day')
        self.assertIn('served_at', body)

    def test_a_dotted_symbol_resolves_to_its_own_fixture(self):
        body = self.get_json('/quote?symbol=BRK.B')
        self.assertEqual(body['quote']['symbol'], 'BRK.B')

    def test_a_lowercase_symbol_is_normalised_rather_than_rejected(self):
        body = self.get_json('/quote?symbol=spy')
        self.assertEqual(body['symbol'], 'SPY')

    def test_an_unknown_symbol_is_a_clean_404(self):
        body = self.get_json('/quote?symbol=NOSUCH', expect=404)
        self.assertEqual(body['error'], 'symbol_not_found')

    def test_a_missing_symbol_argument_is_a_400(self):
        body = self.get_json('/quote', expect=400)
        self.assertEqual(body['error'], 'invalid_symbol')

    def test_malformed_symbols_never_reach_the_source_layer(self):
        nasty = ('../../etc/passwd', 'SPY;DROP', 'SP Y', '1SPY', '', '.',
                 'TOOLONGSYMBOL', '%2e%2e', 'SPY\x00')
        with mock.patch.object(source, 'fetch') as fetch:
            for symbol in nasty:
                with self.subTest(symbol=symbol):
                    incisor.reset_rate_limits()
                    response = self.client.get('/quote', query_string={'symbol': symbol})
                    self.assertEqual(response.status_code, 400, symbol)
            fetch.assert_not_called()

    def test_a_foreign_origin_is_rejected_before_any_lookup(self):
        with mock.patch.object(source, 'fetch') as fetch:
            response = self.client.get(
                '/quote?symbol=SPY', headers={'Origin': 'https://evil.example.com'})
            self.assertEqual(response.status_code, 403)
            fetch.assert_not_called()


class TestHistoryRoute(RouteTestCase):

    def test_every_proxy_symbol_serves_a_daily_series(self):
        for symbol in PROXY_SYMBOLS:
            with self.subTest(symbol=symbol):
                incisor.reset_rate_limits()
                body = self.get_json('/history?symbol=%s' % symbol)
                bars = body['history']['bars']
                self.assertGreaterEqual(len(bars), 100)
                self.assertEqual(body['history']['interval'], 'daily')

    def test_bars_are_oldest_first_and_fully_typed(self):
        bars = self.get_json('/history?symbol=SPY')['history']['bars']
        dates = [bar['date'] for bar in bars]
        self.assertEqual(dates, sorted(dates))
        for bar in bars:
            self.assertIsInstance(bar['close'], float)
            self.assertIsInstance(bar['volume'], int)
            self.assertLessEqual(bar['low'], bar['high'])
            self.assertLessEqual(bar['low'], bar['open'])
            self.assertLessEqual(bar['low'], bar['close'])
            self.assertGreaterEqual(bar['high'], bar['open'])
            self.assertGreaterEqual(bar['high'], bar['close'])

    def test_an_unknown_symbol_is_a_clean_404(self):
        body = self.get_json('/history?symbol=NOSUCH', expect=404)
        self.assertEqual(body['error'], 'symbol_not_found')


class TestQuoteAgreesWithHistory(RouteTestCase):
    """A tile and its sparkline are drawn from two files; they must agree."""

    def test_the_quote_matches_the_last_two_bars_of_the_series(self):
        for symbol in PROXY_SYMBOLS:
            with self.subTest(symbol=symbol):
                incisor.reset_rate_limits()
                quote = self.get_json('/quote?symbol=%s' % symbol)['quote']
                incisor.reset_rate_limits()
                bars = self.get_json('/history?symbol=%s' % symbol)['history']['bars']

                self.assertEqual(quote['latest_trading_day'], bars[-1]['date'])
                self.assertAlmostEqual(quote['price'], bars[-1]['close'], places=4)
                self.assertAlmostEqual(
                    quote['previous_close'], bars[-2]['close'], places=4)
                self.assertAlmostEqual(
                    quote['change'], bars[-1]['close'] - bars[-2]['close'], places=3)


class TestSourceLayer(unittest.TestCase):

    def test_an_unknown_endpoint_is_refused_rather_than_joined_into_a_path(self):
        for endpoint in ('../server', 'secrets', '', '/etc'):
            with self.subTest(endpoint=endpoint):
                with self.assertRaises(source.SourceUnavailable):
                    source.load_fixture(endpoint, 'SPY')

    def test_the_newest_dated_fixture_wins(self):
        """Refreshing a fixture is a drop-in; the older file stays as evidence."""
        folder = os.path.join(source.FIXTURE_ROOT, source.QUOTE)
        newer = os.path.join(folder, 'SPY-2099-01-01.json')
        payload = {'Global Quote': {'01. symbol': 'SPY'}}
        with open(newer, 'w') as handle:
            json.dump(payload, handle)
        try:
            self.assertEqual(source.load_fixture(source.QUOTE, 'SPY'), payload)
        finally:
            os.unlink(newer)

    def test_a_symbol_with_no_fixture_is_a_provider_not_found(self):
        with self.assertRaises(provider.ProviderError) as caught:
            source.load_fixture(source.QUOTE, 'NOSUCH')
        self.assertEqual(caught.exception.reason, 'not_found')


class TestNoNetworkAccess(RouteTestCase):
    """The T3 acceptance criterion, asserted rather than assumed."""

    def setUp(self):
        super().setUp()
        # Empty the snapshot cache first. A cached answer would satisfy these
        # assertions from SQLite without ever opening a fixture, which is a
        # weaker claim than the one this class exists to make.
        with store.connect() as connection:
            for table in ('quotes', 'daily_bars', 'daily_series'):
                connection.execute('DELETE FROM %s' % table)

    def test_the_fixture_path_never_imports_the_http_client(self):
        """`requests` is the only HTTP client we ship, so its absence is the
        check that means something. Werkzeug drags urllib and http.client in on
        its own, which is why those are not asserted on — the socket test below
        is what covers them."""
        self.get_json('/quote?symbol=SPY')
        incisor.reset_rate_limits()
        self.get_json('/history?symbol=QQQ')
        self.assertNotIn('requests', sys.modules)

    def test_quotes_still_serve_with_every_socket_broken(self):
        def refuse(*args, **kwargs):
            raise AssertionError('the fixture path opened a socket')

        with mock.patch.object(socket, 'socket', refuse), \
                mock.patch.object(socket, 'create_connection', refuse), \
                mock.patch.object(socket, 'getaddrinfo', refuse):
            body = self.get_json('/quote?symbol=SPY')
            self.assertEqual(body['quote']['symbol'], 'SPY')
            incisor.reset_rate_limits()
            history = self.get_json('/history?symbol=SPY')
            self.assertGreaterEqual(len(history['history']['bars']), 100)


if __name__ == '__main__':
    unittest.main()
