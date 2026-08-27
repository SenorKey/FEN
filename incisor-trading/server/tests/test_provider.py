"""Tests for the provider parser — the only module that sees upstream JSON.

Everything here is pure: dicts in, dicts or ProviderErrors out. The awkward
shapes are inline rather than in fixture files because they are two keys each
and reading them next to the assertion is the point.

    cd incisor-trading/server && python3 -m unittest discover tests
"""

import unittest

import service_fixture  # noqa: F401  — configures the service before import
import provider  # noqa: E402


def a_quote(**overrides):
    """A well-formed GLOBAL_QUOTE payload, with fields swapped in as needed."""
    quote = {
        '01. symbol': 'SPY',
        '02. open': '605.4406',
        '03. high': '607.8124',
        '04. low': '602.1773',
        '05. price': '604.5456',
        '06. volume': '93232810',
        '07. latest trading day': '2026-08-26',
        '08. previous close': '595.1010',
        '09. change': '9.4447',
        '10. change percent': '1.5871%',
    }
    quote.update(overrides)
    return {'Global Quote': quote}


# `rows=None` would make an intentionally empty series indistinguishable from
# "give me the default one", and an empty series is a case worth testing.
DEFAULT_ROWS = object()


def a_series(rows=DEFAULT_ROWS):
    """A well-formed TIME_SERIES_DAILY payload, newest key first as upstream."""
    if rows is DEFAULT_ROWS:
        rows = {
            '2026-08-26': {'1. open': '605.4406', '2. high': '607.8124',
                           '3. low': '602.1773', '4. close': '604.5456',
                           '5. volume': '93232810'},
            '2026-08-25': {'1. open': '596.4983', '2. high': '597.1802',
                           '3. low': '594.4207', '4. close': '595.1010',
                           '5. volume': '61003411'},
        }
    return {
        'Meta Data': {
            '1. Information': 'Daily Prices (open, high, low, close) and Volumes',
            '2. Symbol': 'SPY',
            '3. Last Refreshed': '2026-08-26',
            '4. Output Size': 'Compact',
            '5. Time Zone': 'US/Eastern',
        },
        'Time Series (Daily)': rows,
    }


class TestQuoteParsing(unittest.TestCase):

    def test_every_field_arrives_as_a_number_of_the_right_type(self):
        parsed = provider.parse_quote(a_quote(), 'SPY')
        self.assertEqual(parsed['symbol'], 'SPY')
        self.assertAlmostEqual(parsed['price'], 604.5456)
        self.assertAlmostEqual(parsed['open'], 605.4406)
        self.assertAlmostEqual(parsed['high'], 607.8124)
        self.assertAlmostEqual(parsed['low'], 602.1773)
        self.assertAlmostEqual(parsed['previous_close'], 595.1010)
        self.assertAlmostEqual(parsed['change'], 9.4447)
        self.assertEqual(parsed['latest_trading_day'], '2026-08-26')
        self.assertIsInstance(parsed['volume'], int)
        self.assertEqual(parsed['volume'], 93232810)

    def test_the_percent_sign_is_stripped_from_the_change_percent(self):
        """The one upstream quirk most likely to reach the page as '1.58%%'."""
        parsed = provider.parse_quote(a_quote(), 'SPY')
        self.assertIsInstance(parsed['change_percent'], float)
        self.assertAlmostEqual(parsed['change_percent'], 1.5871)

    def test_a_negative_change_survives_the_percent_strip(self):
        parsed = provider.parse_quote(
            a_quote(**{'09. change': '-4.2100', '10. change percent': '-0.7010%'}),
            'SPY')
        self.assertAlmostEqual(parsed['change'], -4.21)
        self.assertAlmostEqual(parsed['change_percent'], -0.7010)

    def test_an_empty_envelope_is_a_missing_symbol_not_a_broken_payload(self):
        """Upstream answers an unknown ticker with {} rather than an error."""
        with self.assertRaises(provider.ProviderError) as caught:
            provider.parse_quote({'Global Quote': {}}, 'NOSUCH')
        self.assertEqual(caught.exception.reason, 'not_found')

    def test_a_payload_for_another_symbol_is_refused(self):
        """Serving it would print one ticker's price under another's name."""
        with self.assertRaises(provider.ProviderError) as caught:
            provider.parse_quote(a_quote(), 'QQQ')
        self.assertEqual(caught.exception.reason, 'malformed')

    def test_a_missing_field_is_malformed_and_names_the_field(self):
        payload = a_quote()
        del payload['Global Quote']['05. price']
        with self.assertRaises(provider.ProviderError) as caught:
            provider.parse_quote(payload, 'SPY')
        self.assertEqual(caught.exception.reason, 'malformed')
        self.assertIn('05. price', caught.exception.detail)

    def test_a_non_numeric_price_is_malformed_rather_than_a_crash(self):
        with self.assertRaises(provider.ProviderError) as caught:
            provider.parse_quote(a_quote(**{'05. price': 'n/a'}), 'SPY')
        self.assertEqual(caught.exception.reason, 'malformed')

    def test_a_null_field_is_malformed_rather_than_a_type_error(self):
        with self.assertRaises(provider.ProviderError) as caught:
            provider.parse_quote(a_quote(**{'05. price': None}), 'SPY')
        self.assertEqual(caught.exception.reason, 'malformed')

    def test_a_missing_envelope_is_malformed(self):
        with self.assertRaises(provider.ProviderError) as caught:
            provider.parse_quote({}, 'SPY')
        self.assertEqual(caught.exception.reason, 'malformed')


class TestProviderMessages(unittest.TestCase):
    """Upstream signals every failure with HTTP 200 and a prose message."""

    def test_an_error_message_is_a_not_found(self):
        payload = {'Error Message': 'Invalid API call. Please retry or visit ...'}
        with self.assertRaises(provider.ProviderError) as caught:
            provider.parse_quote(payload, 'NOSUCH')
        self.assertEqual(caught.exception.reason, 'not_found')

    def test_a_note_is_a_rate_limit(self):
        payload = {'Note': 'Thank you for using Alpha Vantage! Our standard API '
                           'call frequency is 5 calls per minute.'}
        with self.assertRaises(provider.ProviderError) as caught:
            provider.parse_quote(payload, 'SPY')
        self.assertEqual(caught.exception.reason, 'rate_limited')

    def test_an_information_message_is_an_exhausted_daily_quota(self):
        payload = {'Information': 'We have detected your API key and our standard '
                                  'API rate limit is 25 requests per day.'}
        with self.assertRaises(provider.ProviderError) as caught:
            provider.parse_quote(payload, 'SPY')
        self.assertEqual(caught.exception.reason, 'quota_exhausted')

    def test_the_upstream_message_is_kept_as_detail_and_out_of_the_reason(self):
        """Detail is for the journal; reason is the only part safe to return."""
        payload = {'Note': 'demo key hint: your key is ABCD1234'}
        with self.assertRaises(provider.ProviderError) as caught:
            provider.parse_quote(payload, 'SPY')
        self.assertIn('ABCD1234', caught.exception.detail)
        self.assertNotIn('ABCD1234', caught.exception.reason)

    def test_history_recognises_the_same_messages(self):
        with self.assertRaises(provider.ProviderError) as caught:
            provider.parse_daily_history({'Note': 'slow down'}, 'SPY')
        self.assertEqual(caught.exception.reason, 'rate_limited')

    def test_a_payload_that_is_not_an_object_is_malformed(self):
        for payload in ([], 'nope', None, 7):
            with self.subTest(payload=payload):
                with self.assertRaises(provider.ProviderError) as caught:
                    provider.parse_quote(payload, 'SPY')
                self.assertEqual(caught.exception.reason, 'malformed')


class TestHistoryParsing(unittest.TestCase):

    def test_bars_come_back_oldest_first_whatever_the_key_order(self):
        parsed = provider.parse_daily_history(a_series(), 'SPY')
        dates = [bar['date'] for bar in parsed['bars']]
        self.assertEqual(dates, ['2026-08-25', '2026-08-26'])
        self.assertEqual(dates, sorted(dates))

    def test_a_bar_carries_typed_ohlcv(self):
        parsed = provider.parse_daily_history(a_series(), 'SPY')
        bar = parsed['bars'][-1]
        self.assertAlmostEqual(bar['open'], 605.4406)
        self.assertAlmostEqual(bar['high'], 607.8124)
        self.assertAlmostEqual(bar['low'], 602.1773)
        self.assertAlmostEqual(bar['close'], 604.5456)
        self.assertEqual(bar['volume'], 93232810)

    def test_the_envelope_reports_the_interval_and_refresh_date(self):
        parsed = provider.parse_daily_history(a_series(), 'SPY')
        self.assertEqual(parsed['symbol'], 'SPY')
        self.assertEqual(parsed['interval'], 'daily')
        self.assertEqual(parsed['last_refreshed'], '2026-08-26')

    def test_a_missing_last_refreshed_falls_back_to_the_newest_bar(self):
        payload = a_series()
        del payload['Meta Data']['3. Last Refreshed']
        parsed = provider.parse_daily_history(payload, 'SPY')
        self.assertEqual(parsed['last_refreshed'], '2026-08-26')

    def test_an_empty_series_is_a_missing_symbol(self):
        with self.assertRaises(provider.ProviderError) as caught:
            provider.parse_daily_history(a_series(rows={}), 'SPY')
        self.assertEqual(caught.exception.reason, 'not_found')

    def test_metadata_for_another_symbol_is_refused(self):
        with self.assertRaises(provider.ProviderError) as caught:
            provider.parse_daily_history(a_series(), 'QQQ')
        self.assertEqual(caught.exception.reason, 'malformed')

    def test_one_broken_bar_fails_the_whole_series(self):
        """Half a chart is worse than a designed error state (guide section 13)."""
        rows = a_series()['Time Series (Daily)']
        rows['2026-08-25']['4. close'] = 'null'
        with self.assertRaises(provider.ProviderError) as caught:
            provider.parse_daily_history(a_series(rows=rows), 'SPY')
        self.assertEqual(caught.exception.reason, 'malformed')


if __name__ == '__main__':
    unittest.main()
