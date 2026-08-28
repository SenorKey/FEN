"""The symbol catalogue and the route that serves it.

Search by company name is the half of T7 that has no upstream behind it — the
provider's own symbol-search endpoint spends a call per keystroke, which a
25-a-day budget rules out — so the names are a committed table and this is
what keeps it honest.

Two properties matter more than the rest. The route must never claim a symbol
is available when nothing can price it, because search that leads to a
not-found state on half its results is worse than a shorter list. And the
catalogue must never carry a figure: prices belong to the market service, and
a second place holding them is a second place for them to be wrong.
"""

import json
import re
import unittest
from unittest import mock

import service_fixture  # noqa: F401  — configures the service before import
import catalog  # noqa: E402
import incisor  # noqa: E402
import source  # noqa: E402

ORIGIN = {'Origin': 'https://frontendneeded.com'}

# The same whitelist the edge applies. A catalogue entry that could not be
# asked for would be a search result that 400s.
SYMBOL_PATTERN = re.compile(r'^[A-Z][A-Z.\-]{0,9}$')


class TestTheTable(unittest.TestCase):

    def test_every_symbol_passes_the_edge_whitelist(self):
        for symbol in catalog.ENTRIES:
            self.assertRegex(symbol, SYMBOL_PATTERN, symbol)

    def test_every_entry_has_a_name_and_a_kind(self):
        for row in catalog.entries():
            self.assertTrue(row['name'].strip(), row['symbol'])
            self.assertIn(row['kind'], ('stock', 'etf'), row['symbol'])

    def test_only_funds_stand_in_for_an_index(self):
        """`tracks` is what the proxy label is worded from, so a stock
        carrying one would put 'proxy' on something that is not one."""
        for row in catalog.entries():
            if row['tracks'] is not None:
                self.assertEqual(row['kind'], 'etf', row['symbol'])

    def test_the_four_dashboard_proxies_are_all_listed_as_proxies(self):
        listed = {row['symbol']: row for row in catalog.entries()}
        for symbol in ('SPY', 'QQQ', 'DIA', 'IWM'):
            self.assertIsNotNone(listed[symbol]['tracks'], symbol)

    def test_the_table_carries_no_figures(self):
        """Guide section 10: a name does not change and a price does. A
        catalogue holding a number would be a second source of truth for it."""
        for row in catalog.entries():
            for field in ('symbol', 'name', 'kind'):
                self.assertIsNone(re.search(r'\d+\.\d', str(row[field])),
                                  '%s carries a figure' % row['symbol'])

    def test_an_unlisted_symbol_has_no_entry(self):
        self.assertIsNone(catalog.entry('ZZZZ'))

    def test_a_restricted_listing_drops_what_it_cannot_name(self):
        listed = catalog.entries({'SPY', 'ZZZZ'})
        self.assertEqual([row['symbol'] for row in listed], ['SPY'])

    def test_entries_come_back_sorted(self):
        symbols = [row['symbol'] for row in catalog.entries()]
        self.assertEqual(symbols, sorted(symbols))


class TestFixtureAvailability(unittest.TestCase):

    def test_the_committed_symbols_are_found(self):
        found = source.available_symbols(source.DAILY)
        self.assertEqual(found, {'SPY', 'QQQ', 'DIA', 'IWM', 'AAPL', 'BRK.B'})

    def test_a_symbol_containing_a_hyphen_keeps_its_hyphen(self):
        """Splitting a fixture filename on its last hyphen would leave every
        symbol carrying half a date, and RDS-A carrying the wrong half."""
        names = {'RDS-A-2026-08-27.json', 'SPY-2026-08-27.json', 'notes.txt'}
        parsed = {source.FIXTURE_NAME.match(name).group('symbol')
                  for name in names if source.FIXTURE_NAME.match(name)}
        self.assertEqual(parsed, {'RDS-A', 'SPY'})

    def test_an_unknown_endpoint_is_refused(self):
        with self.assertRaises(source.SourceUnavailable):
            source.available_symbols('../../etc')


class TestSymbolsRoute(unittest.TestCase):

    def setUp(self):
        incisor.app.config['TESTING'] = True
        self.client = incisor.app.test_client()
        incisor.reset_rate_limits()

    def get(self):
        return self.client.get('/symbols', headers=ORIGIN)

    def test_it_answers_with_the_catalogue(self):
        response = self.get()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json['symbols'])

    def test_fixture_mode_lists_only_what_it_can_price(self):
        """The acceptance criterion behind the not-found state: a search
        result that cannot be quoted is a dead end, so it is not offered."""
        listed = {row['symbol'] for row in self.get().json['symbols']}
        self.assertEqual(listed, source.available_symbols(source.DAILY))

    def test_fixture_mode_says_the_list_is_the_whole_list(self):
        self.assertTrue(self.get().json['exhaustive'])

    def test_the_response_says_which_mode_produced_it(self):
        self.assertEqual(self.get().json['source'], 'fixture')

    def test_it_carries_no_prices(self):
        # The listing only, not the envelope: `served_at` is a timestamp and
        # its fractional seconds read as a price to a blunt enough pattern.
        listing = json.dumps(self.get().json['symbols'])
        self.assertIsNone(re.search(r'\d+\.\d\d', listing))

    def test_a_bad_origin_is_refused(self):
        response = self.client.get('/symbols',
                                   headers={'Origin': 'https://evil.example'})
        self.assertEqual(response.status_code, 403)

    def test_it_is_rate_limited_like_every_other_route(self):
        headers = dict(ORIGIN)
        headers['X-Forwarded-For'] = '203.0.113.55'
        codes = {self.client.get('/symbols', headers=headers).status_code
                 for _ in range(incisor.RATE_LIMIT_MAX + 5)}
        self.assertIn(429, codes)

    def test_it_makes_no_upstream_call(self):
        """It is a local table and a directory listing. Spending quota to
        answer a keystroke is the thing this route exists to avoid."""
        with mock.patch('source.fetch') as fetch:
            self.get()
        fetch.assert_not_called()


if __name__ == '__main__':
    unittest.main()
