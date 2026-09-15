"""Tests for the snapshot cache, the price store and the call budget.

The headline T4 criterion is that two rapid requests for the same symbol
produce exactly one upstream call. That is asserted against a stub standing in
for source.fetch, in TestOneCallPerSymbol, along with the concurrent version of
the same question — four threads asking at once is the case a naive cache gets
wrong.

Every test starts from an empty cache. The service tests share one scratch
database, and a cache that survived between them would make results depend on
the order unittest happened to discover them in.

    cd incisor-trading/server && python3 -m unittest discover tests
"""

import datetime
import json
import os
import tempfile
import threading
import unittest
from unittest import mock

import service_fixture  # noqa: F401  — configures the service before import
import fetcher  # noqa: E402
import incisor  # noqa: E402
import provider  # noqa: E402
import source  # noqa: E402
import store  # noqa: E402


def clear_cache():
    with store.connect() as connection:
        for table in ('quotes', 'daily_bars', 'daily_series', 'upstream_calls'):
            connection.execute('DELETE FROM %s' % table)
    fetcher.reset_locks()


def a_quote_payload(symbol='SPY', price='604.5456'):
    return {'Global Quote': {
        '01. symbol': symbol, '02. open': '605.4406', '03. high': '607.8124',
        '04. low': '602.1773', '05. price': price, '06. volume': '93232810',
        '07. latest trading day': '2026-08-26', '08. previous close': '595.1010',
        '09. change': '9.4447', '10. change percent': '1.5871%'}}


def a_daily_payload(symbol='SPY', dates=('2026-08-25', '2026-08-26'),
                    close=100.0):
    """A TIME_SERIES_DAILY payload over the dates given, at one flat price."""
    return {
        'Meta Data': {'2. Symbol': symbol, '3. Last Refreshed': dates[-1]},
        'Time Series (Daily)': {
            date: {'1. open': '%.4f' % close, '2. high': '%.4f' % close,
                   '3. low': '%.4f' % close, '4. close': '%.4f' % close,
                   '5. volume': '1000'}
            for date in dates
        },
    }


class CacheTestCase(unittest.TestCase):

    def setUp(self):
        clear_cache()

    def tearDown(self):
        clear_cache()


class TestOneCallPerSymbol(CacheTestCase):
    """The T4 acceptance criterion."""

    def test_two_rapid_requests_make_exactly_one_call(self):
        stub = mock.Mock(return_value=a_quote_payload())
        with mock.patch.object(source, 'fetch', stub):
            first, first_meta = fetcher.get_quote('SPY', 'fixture')
            second, second_meta = fetcher.get_quote('SPY', 'fixture')

        self.assertEqual(stub.call_count, 1)
        self.assertFalse(first_meta['cached'])
        self.assertTrue(second_meta['cached'])
        self.assertEqual(first['price'], second['price'])

    def test_four_concurrent_requests_make_exactly_one_call(self):
        """A cache that only checks before taking the lock stampedes here."""
        started = threading.Barrier(4)

        def slow_fetch(*args, **kwargs):
            # Wide enough that every thread is inside get() at the same time.
            import time
            time.sleep(0.05)
            return a_quote_payload()

        stub = mock.Mock(side_effect=slow_fetch)
        results = []

        def ask():
            started.wait()
            results.append(fetcher.get_quote('SPY', 'fixture')[0]['price'])

        with mock.patch.object(source, 'fetch', stub):
            threads = [threading.Thread(target=ask) for _ in range(4)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=5)

        self.assertEqual(stub.call_count, 1)
        self.assertEqual(len(results), 4)
        self.assertEqual(len(set(results)), 1)

    def test_two_different_symbols_make_two_calls(self):
        """The lock is per symbol, not a single gate over the whole cache."""
        stub = mock.Mock(side_effect=lambda endpoint, symbol, *rest:
                         a_quote_payload(symbol))
        with mock.patch.object(source, 'fetch', stub):
            fetcher.get_quote('SPY', 'fixture')
            fetcher.get_quote('QQQ', 'fixture')
        self.assertEqual(stub.call_count, 2)

    def test_an_expired_entry_is_refetched(self):
        stub = mock.Mock(return_value=a_quote_payload())
        with mock.patch.object(source, 'fetch', stub):
            fetcher.get_quote('SPY', 'fixture')
            stale = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(
                seconds=fetcher.TTL_SECONDS[source.QUOTE] + 60)
            with store.connect() as connection:
                connection.execute('UPDATE quotes SET fetched_at = ?',
                                   (stale.isoformat(),))
            fetcher.get_quote('SPY', 'fixture')
        self.assertEqual(stub.call_count, 2)

    def test_quote_and_history_are_cached_separately(self):
        self.assertNotEqual(fetcher.TTL_SECONDS[source.QUOTE],
                            fetcher.TTL_SECONDS[source.DAILY])
        fetcher.get_quote('SPY', 'fixture')
        history, meta = fetcher.get_history('SPY', 'fixture')
        self.assertFalse(meta['cached'])
        self.assertGreaterEqual(len(history['bars']), 100)


class TestFreshness(CacheTestCase):

    def test_an_unreadable_timestamp_counts_as_stale(self):
        """Safe direction: costs one call, where trusting it serves forever."""
        for stamp in ('', None, 'yesterday', '2026-13-45'):
            with self.subTest(stamp=stamp):
                self.assertFalse(fetcher.is_fresh(source.QUOTE, stamp))

    def test_a_just_written_entry_is_fresh(self):
        self.assertTrue(fetcher.is_fresh(source.QUOTE, store.now_utc_iso()))


class TestCallLog(CacheTestCase):
    """"Quota counter is queryable" — the other half of the criterion."""

    def test_every_call_is_logged_with_its_mode(self):
        with mock.patch.object(source, 'fetch', return_value=a_quote_payload()):
            fetcher.get_quote('SPY', 'fixture')
        with store.connect() as connection:
            rows = connection.execute('SELECT * FROM upstream_calls').fetchall()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['symbol'], 'SPY')
        self.assertEqual(rows[0]['endpoint'], source.QUOTE)
        self.assertEqual(rows[0]['status'], 'ok')
        self.assertEqual(rows[0]['source'], 'fixture')

    def test_a_failed_call_is_logged_too(self):
        """It spent quota. A budget counting only successes is optimistic."""
        failing = mock.Mock(side_effect=provider.ProviderError('rate_limited', 'x'))
        with mock.patch.object(source, 'fetch', failing):
            with self.assertRaises(provider.ProviderError):
                fetcher.get_quote('SPY', 'fixture')
        with store.connect() as connection:
            row = connection.execute('SELECT * FROM upstream_calls').fetchone()
        self.assertEqual(row['status'], 'rate_limited')

    def test_fixture_reads_are_logged_but_do_not_score_against_quota(self):
        fetcher.get_quote('SPY', 'fixture')
        self.assertEqual(store.calls_today(), 1)
        self.assertEqual(store.calls_today('live'), 0)
        self.assertEqual(fetcher.budget_remaining(), fetcher.DAILY_CALL_BUDGET)

    def test_quota_status_is_queryable_and_adds_up(self):
        status = fetcher.quota_status()
        self.assertEqual(status['budget'], fetcher.DAILY_CALL_BUDGET)
        self.assertEqual(status['used_today'] + status['remaining'],
                         status['budget'])

    def test_the_budget_is_held_below_the_documented_free_tier_limit(self):
        """25/day is the provider's ceiling; we stop short of it on purpose."""
        self.assertLess(fetcher.DAILY_CALL_BUDGET, 25)


class TestDegradation(CacheTestCase):
    """Guide section 5: exhausting quota is a denial of service to absorb."""

    def test_an_exhausted_budget_serves_a_stale_entry_rather_than_failing(self):
        with mock.patch.object(source, 'fetch', return_value=a_quote_payload()):
            fetcher.get_quote('SPY', 'live')

        with mock.patch.object(fetcher, 'budget_remaining', return_value=0), \
                mock.patch.object(fetcher, 'is_fresh', return_value=False), \
                mock.patch.object(source, 'fetch') as blocked:
            quote, meta = fetcher.get_quote('SPY', 'live')

        blocked.assert_not_called()
        self.assertTrue(meta['stale'])
        self.assertAlmostEqual(quote['price'], 604.5456)

    def test_an_exhausted_budget_with_nothing_cached_is_the_one_hard_failure(self):
        with mock.patch.object(fetcher, 'budget_remaining', return_value=0):
            with self.assertRaises(fetcher.Unavailable):
                fetcher.get_quote('NEVERSEEN', 'live')

    def test_a_fixture_read_is_never_blocked_by_the_live_budget(self):
        with mock.patch.object(fetcher, 'budget_remaining', return_value=0):
            quote, _meta = fetcher.get_quote('SPY', 'fixture')
        self.assertEqual(quote['symbol'], 'SPY')

    def test_an_upstream_failure_falls_back_to_what_we_already_hold(self):
        """An upstream hiccup should not blank a dashboard that has data."""
        with mock.patch.object(source, 'fetch', return_value=a_quote_payload()):
            fetcher.get_quote('SPY', 'fixture')

        failing = mock.Mock(side_effect=source.SourceUnavailable('upstream down'))
        with mock.patch.object(source, 'fetch', failing), \
                mock.patch.object(fetcher, 'is_fresh', return_value=False):
            quote, meta = fetcher.get_quote('SPY', 'fixture')

        self.assertTrue(meta['stale'])
        self.assertAlmostEqual(quote['price'], 604.5456)

    def test_an_upstream_failure_on_an_unknown_symbol_still_raises(self):
        failing = mock.Mock(side_effect=source.SourceUnavailable('upstream down'))
        with mock.patch.object(source, 'fetch', failing):
            with self.assertRaises(source.SourceUnavailable):
                fetcher.get_quote('NEVERSEEN', 'fixture')


class TestStore(CacheTestCase):

    def test_a_quote_round_trips_through_sqlite_unchanged(self):
        original = provider.parse_quote(a_quote_payload(), 'SPY')
        store.save_quote(original, 'fixture')
        loaded, fetched_at = store.load_quote('SPY', 'fixture')
        self.assertEqual(loaded, original)
        self.assertTrue(fetched_at)

    def test_a_history_round_trips_and_stays_in_date_order(self):
        original = fetcher.get_history('SPY', 'fixture')[0]
        loaded, _fetched_at = store.load_history('SPY', 'fixture')
        self.assertEqual(loaded['bars'], original['bars'])
        dates = [bar['date'] for bar in loaded['bars']]
        self.assertEqual(dates, sorted(dates))

    def test_refetching_a_series_upserts_rather_than_duplicating(self):
        fetcher.get_history('SPY', 'fixture')
        with store.connect() as connection:
            before = connection.execute(
                'SELECT COUNT(*) AS n FROM daily_bars').fetchone()['n']
        store.save_history(store.load_history('SPY', 'fixture')[0], 'fixture')
        with store.connect() as connection:
            after = connection.execute(
                'SELECT COUNT(*) AS n FROM daily_bars').fetchone()['n']
        self.assertEqual(before, after)

    def test_a_missing_symbol_reads_back_as_nothing_rather_than_throwing(self):
        self.assertEqual(store.load_quote('NEVERSEEN', 'fixture'), (None, None))
        self.assertEqual(store.load_history('NEVERSEEN', 'fixture'), (None, None))

    def test_sql_is_parameterised(self):
        """The edge whitelist blocks this string; the store must not rely on it."""
        hostile = "SPY'); DROP TABLE quotes; --"
        self.assertEqual(store.load_quote(hostile, 'fixture'), (None, None))
        with store.connect() as connection:
            connection.execute('SELECT COUNT(*) FROM quotes').fetchone()


class TestLiveMode(CacheTestCase):
    """Live mode has never run. What can be checked without a network, is."""

    def test_live_without_a_key_fails_closed(self):
        with self.assertRaises(source.SourceUnavailable):
            source.fetch(source.QUOTE, 'SPY', 'live')

    def test_the_upstream_url_names_the_right_provider_function(self):
        parameters = source.upstream_url_parameters(source.QUOTE, 'SPY', 'KEY123')
        self.assertEqual(parameters['function'], 'GLOBAL_QUOTE')
        self.assertEqual(parameters['symbol'], 'SPY')

        parameters = source.upstream_url_parameters(source.DAILY, 'SPY', 'KEY123')
        self.assertEqual(parameters['function'], 'TIME_SERIES_DAILY')
        # `compact` is 100 sessions, which cannot reach back the 52 weeks the
        # quote panel puts a price inside. The larger series costs the same
        # single call and is cut to size before it is stored.
        self.assertEqual(parameters['outputsize'], 'full')

    def test_a_long_series_is_cut_before_it_is_stored(self):
        bars = [{'date': '2020-01-%02d' % ((day % 28) + 1), 'close': float(day)}
                for day in range(fetcher.MAX_DAILY_BARS + 500)]
        cut = fetcher.bounded(source.DAILY, {'symbol': 'SPY', 'bars': bars})
        self.assertEqual(len(cut['bars']), fetcher.MAX_DAILY_BARS)

    def test_the_cut_keeps_the_most_recent_bars(self):
        bars = [{'date': 'd%d' % day, 'close': float(day)}
                for day in range(fetcher.MAX_DAILY_BARS + 500)]
        cut = fetcher.bounded(source.DAILY, {'symbol': 'SPY', 'bars': bars})
        self.assertEqual(cut['bars'][-1], bars[-1])

    def test_a_short_series_is_left_alone(self):
        history = {'symbol': 'SPY', 'bars': [{'date': 'a', 'close': 1.0}]}
        self.assertIs(fetcher.bounded(source.DAILY, history), history)

    def test_a_quote_has_no_series_to_cut(self):
        quote = {'symbol': 'SPY', 'price': 1.0}
        self.assertIs(fetcher.bounded(source.QUOTE, quote), quote)

    def test_an_unknown_endpoint_never_becomes_an_upstream_call(self):
        with self.assertRaises(source.SourceUnavailable):
            source.upstream_url_parameters('anything-else', 'SPY', 'KEY123')

    def test_the_key_is_redacted_before_anything_is_logged(self):
        message = 'upstream said: apikey=KEY123 was rejected'
        redacted = source.redact(message, 'KEY123')
        self.assertNotIn('KEY123', redacted)
        self.assertIn('[redacted]', redacted)


class TestRouteEnvelope(CacheTestCase):
    """The cache has to reach the page, or it cannot be labelled."""

    def setUp(self):
        super().setUp()
        incisor.app.config['TESTING'] = True
        self.client = incisor.app.test_client()
        incisor.reset_rate_limits()

    def test_the_response_says_how_old_the_data_is(self):
        body = json.loads(self.client.get('/quote?symbol=SPY').data)
        self.assertFalse(body['stale'])
        self.assertTrue(body['fetched_at'])
        self.assertIn('served_at', body)

    def test_the_age_reported_on_a_fetch_matches_what_is_cached(self):
        """Otherwise the first visitor is told a different age to the second."""
        first = json.loads(self.client.get('/quote?symbol=SPY').data)
        incisor.reset_rate_limits()
        second = json.loads(self.client.get('/quote?symbol=SPY').data)
        self.assertEqual(first['fetched_at'], second['fetched_at'])

    def test_a_second_request_is_served_from_the_cache(self):
        with mock.patch.object(source, 'fetch',
                               return_value=a_quote_payload()) as stub:
            self.client.get('/quote?symbol=SPY')
            incisor.reset_rate_limits()
            response = self.client.get('/quote?symbol=SPY')
        self.assertEqual(stub.call_count, 1)
        self.assertEqual(response.status_code, 200)


class TestTheCacheIsKeyedBySource(CacheTestCase):
    """D16 — the defect that made the page lie about where a number came from.

    Minutes after the live key was switched on, `/quote?symbol=SPY` answered
    733.4011 with a `latest_trading_day` of 2026-08-26, `stale: false`, and
    `"source": "live"`. Every one of those fields was doing its job. The price
    was generated by the fixture layer during the T26b rehearsal eighteen days
    earlier, the cache was keyed on symbol alone so it read back as a hit, and
    the envelope reported the mode the service was configured in rather than
    what had produced the bytes.

    This is the worst class of bug this project can have: the page's whole
    claim on a reader is that it says where its numbers come from, and there
    is no reading of the screen that would have caught it. Hence the size of
    this class relative to the change.
    """

    def fill_fixture_cache(self, price='100.0000'):
        """One quote and one series in the cache, both written from fixtures."""
        with mock.patch.object(source, 'fetch',
                               return_value=a_quote_payload(price=price)):
            fetcher.get_quote('SPY', 'fixture')
        with mock.patch.object(source, 'fetch', return_value=a_daily_payload()):
            fetcher.get_history('SPY', 'fixture')

    # --- every row says what wrote it --------------------------------------

    def test_every_cached_row_records_the_source_that_wrote_it(self):
        self.fill_fixture_cache()
        with store.connect() as connection:
            for table in ('quotes', 'daily_series', 'daily_bars'):
                rows = connection.execute(
                    'SELECT DISTINCT source FROM %s' % table).fetchall()
                self.assertEqual([row['source'] for row in rows], ['fixture'],
                                 table)

    def test_a_cache_written_before_d16_is_rebuilt_and_the_ledger_is_kept(self):
        """The migration, driven rather than described.

        A pre-D16 database holds rows whose provenance is unknowable — that
        is the defect — so they are dropped rather than carried forward. The
        call log in the same file is not a cache and must survive: it is what
        the day's remaining budget is counted from, and a reset one would let
        twenty-two calls be spent twice in a day.
        """
        handle = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
        handle.close()
        legacy = handle.name
        original = store.DB_PATH
        try:
            store.configure(legacy)
            with store.connect() as connection:
                connection.execute(
                    """
                    CREATE TABLE quotes (
                        symbol TEXT PRIMARY KEY, price REAL NOT NULL,
                        fetched_at TEXT NOT NULL
                    )
                    """)
                connection.execute(
                    "INSERT INTO quotes VALUES ('SPY', 733.4011, 'then')")
                connection.execute(
                    """
                    CREATE TABLE upstream_calls (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        called_at TEXT NOT NULL, endpoint TEXT NOT NULL,
                        symbol TEXT, status TEXT NOT NULL, source TEXT NOT NULL
                    )
                    """)
                connection.execute(
                    """
                    INSERT INTO upstream_calls
                        (called_at, endpoint, symbol, status, source)
                    VALUES ('2026-09-13T17:05:24', 'global-quote', 'SPY',
                            'ok', 'live')
                    """)

            store.init()

            with store.connect() as connection:
                columns = {row['name'] for row in
                           connection.execute('PRAGMA table_info(quotes)')}
                self.assertIn('source', columns)
                self.assertEqual(
                    connection.execute(
                        'SELECT COUNT(*) AS n FROM quotes').fetchone()['n'], 0,
                    'the unlabelled cache should not have survived')
                self.assertEqual(
                    connection.execute(
                        'SELECT COUNT(*) AS n FROM upstream_calls'
                    ).fetchone()['n'], 1,
                    'the call ledger is not a cache and must survive')
        finally:
            store.configure(original)
            for suffix in ('', '-wal', '-shm'):
                try:
                    os.unlink(legacy + suffix)
                except OSError:
                    pass

    # --- the flip ----------------------------------------------------------

    def test_flipping_to_live_does_not_serve_the_fixture_row(self):
        """The headline criterion: a populated cache, the mode flipped, and
        the stale row refused rather than relabelled."""
        self.fill_fixture_cache(price='733.4011')

        live = mock.Mock(return_value=a_quote_payload(price='612.0000'))
        with mock.patch.object(source, 'fetch', live):
            quote, meta = fetcher.get_quote('SPY', 'live')

        # It went upstream rather than reading the fixture row back.
        self.assertEqual(live.call_count, 1)
        self.assertFalse(meta['cached'])
        self.assertEqual(quote['price'], 612.0)
        self.assertEqual(meta['source'], 'live')

    def test_a_live_request_with_no_live_row_and_no_upstream_fails_honestly(self):
        """The exact shape of 09-13, with the fix in. Nothing live is cached,
        upstream cannot be reached, and the only row we hold is fixture. The
        answer is that there is no answer — which is what the dashboard's
        unavailable state is for. Serving the fixture row here, under any
        label, is the defect."""
        self.fill_fixture_cache(price='733.4011')

        def refuses(*args, **kwargs):
            raise source.SourceUnavailable('no network in a test')

        with mock.patch.object(source, 'fetch', side_effect=refuses):
            with self.assertRaises((source.SourceUnavailable,
                                    fetcher.Unavailable)):
                fetcher.get_quote('SPY', 'live')

    def test_the_fixture_row_is_still_there_for_the_mode_that_wrote_it(self):
        """A miss for the other mode is not a delete. Flipping back must not
        have cost the fixture cache."""
        self.fill_fixture_cache(price='733.4011')
        with mock.patch.object(source, 'fetch', return_value=a_quote_payload()):
            try:
                fetcher.get_quote('SPY', 'live')
            except Exception:
                pass

        quote, meta = fetcher.get_quote('SPY', 'fixture')
        self.assertTrue(meta['cached'])
        self.assertEqual(meta['source'], 'fixture')
        self.assertEqual(quote['price'], 733.4011)

    def test_a_series_is_never_assembled_from_two_markets(self):
        """The subtler half, and the reason daily_bars carries the column too.

        `daily_bars` is keyed on symbol and date, and a refresh only replaces
        the dates it returns. Tag the series row alone and a live fetch
        covering two sessions would be handed back stapled to every fixture
        bar outside that window — one series, two markets, no way to see it
        on screen."""
        with mock.patch.object(source, 'fetch', return_value=a_daily_payload(
                dates=('2026-08-20', '2026-08-21', '2026-08-25', '2026-08-26'),
                close=100.0)):
            fetcher.get_history('SPY', 'fixture')

        with mock.patch.object(source, 'fetch', return_value=a_daily_payload(
                dates=('2026-08-25', '2026-08-26'), close=612.0)):
            history, meta = fetcher.get_history('SPY', 'live')

        self.assertEqual([bar['date'] for bar in history['bars']],
                         ['2026-08-25', '2026-08-26'])
        self.assertEqual({bar['close'] for bar in history['bars']}, {612.0})
        self.assertEqual(meta['source'], 'live')

    # --- the label follows the bytes ---------------------------------------

    def test_the_meta_reports_the_source_of_the_bytes(self):
        self.fill_fixture_cache()
        _, meta = fetcher.get_quote('SPY', 'fixture')
        self.assertEqual(meta['source'], 'fixture')

    def test_the_route_reports_the_bytes_not_the_configured_mode(self):
        """The regression test for the defect itself. The service is told it
        is live; what it has to serve is fixture; the response must say
        fixture. Before D16 this said live, and that is the whole bug."""
        incisor.app.config['TESTING'] = True
        client = incisor.app.test_client()
        incisor.reset_rate_limits()

        fixture_quote = provider.parse_quote(a_quote_payload(), 'SPY')
        meta = {'cached': True, 'stale': False, 'fetched_at': '2026-08-27T00:00:00+00:00',
                'source': 'fixture'}

        with mock.patch.object(incisor, 'DATA_SOURCE', 'live'):
            with mock.patch.object(fetcher, 'get',
                                   return_value=(fixture_quote, meta)):
                body = json.loads(client.get('/quote?symbol=SPY').data)

        self.assertEqual(body['source'], 'fixture')


if __name__ == '__main__':
    unittest.main()
