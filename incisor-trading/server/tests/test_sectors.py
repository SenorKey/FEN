"""The sector grid: the arithmetic, and the route that spends the budget on it.

Two halves, and the first one is where the risk is. sectors.py is pure, so
every figure it produces is checked against a series written out here by hand
— a percentage computed from the wrong bar looks exactly like a percentage
computed from the right one, and no amount of driving the route would catch it.

The second half is about cost. Eleven funds is the most expensive surface on
the page against a 22-call day, so the route's two guards are asserted rather
than assumed: a week of freshness instead of a day, and a cap on how many
series one request may refresh.

    cd incisor-trading/server && python3 -m unittest discover tests
"""

import datetime
import json
import unittest
from unittest import mock

import service_fixture  # noqa: F401  — configures the service before import
import fetcher  # noqa: E402
import incisor  # noqa: E402
import sectors  # noqa: E402
import source  # noqa: E402
import store  # noqa: E402

ORIGIN = {'Origin': 'https://frontendneeded.com'}


def bars(closes, start_year=2026, start_month=1):
    """A series of daily bars with `closes`, one per notional session.

    Dates are sequential integers rendered as a date, not real trading days.
    Nothing in sectors.py counts calendar distance — it counts sessions, and
    reads the year off the last bar — so a believable calendar would add
    nothing but a way for the fixture to be wrong.
    """
    built = []
    day = 1
    month = start_month
    year = start_year
    for close in closes:
        built.append({'date': '%04d-%02d-%02d' % (year, month, day),
                      'close': close})
        day += 1
        if day > 28:
            day = 1
            month += 1
        if month > 12:
            month = 1
            year += 1
    return built


def series(closes, **kwargs):
    return {'symbol': 'X', 'interval': 'daily', 'bars': bars(closes, **kwargs)}


class TestWindowArithmetic(unittest.TestCase):

    def test_a_one_month_change_is_measured_twenty_one_sessions_back(self):
        """100 twenty-two bars ago, 110 today, is +10% — and the bar it reads
        is the twenty-second from the end, not the twenty-first."""
        closes = [100.0] + [999.0] * 20 + [110.0]
        self.assertAlmostEqual(
            sectors.change_for_window(bars(closes), '1M'), 10.0)

    def test_the_windows_read_different_bars(self):
        closes = [50.0] + [0.0] * 0 + [100.0] * 62 + [200.0]
        # 64 bars: the 3M base is bars[-64] = 50, the 1M base is 100.
        self.assertAlmostEqual(
            sectors.change_for_window(bars(closes), '3M'), 300.0)
        self.assertAlmostEqual(
            sectors.change_for_window(bars(closes), '1M'), 100.0)

    def test_a_series_that_does_not_reach_back_has_no_figure(self):
        """None, never zero. A window we cannot measure and a window that
        went nowhere are different facts, and the page renders them
        differently."""
        self.assertIsNone(sectors.change_for_window(bars([1.0] * 21), '1M'))
        self.assertIsNone(sectors.change_for_window(bars([1.0] * 200), '1Y'))
        self.assertIsNone(sectors.change_for_window([], '1M'))

    def test_a_window_that_went_nowhere_is_zero_and_not_none(self):
        self.assertEqual(sectors.change_for_window(bars([7.0] * 22), '1M'), 0.0)

    def test_year_to_date_runs_from_the_previous_year_s_final_close(self):
        """The convention, and the one that makes January comparable: YTD is
        measured from the last close of the old year, not the first of the
        new one."""
        closes = [80.0, 100.0, 105.0, 110.0]
        built = bars(closes, start_year=2025, start_month=12)
        built[0]['date'] = '2025-12-30'
        built[1]['date'] = '2025-12-31'
        built[2]['date'] = '2026-01-02'
        built[3]['date'] = '2026-01-05'
        self.assertAlmostEqual(sectors.change_for_window(built, 'YTD'), 10.0)

    def test_a_series_inside_one_year_has_no_year_to_date_figure(self):
        built = bars([100.0, 110.0], start_year=2026, start_month=2)
        self.assertIsNone(sectors.change_for_window(built, 'YTD'))

    def test_a_zero_base_does_not_divide(self):
        closes = [0.0] + [1.0] * 21
        self.assertIsNone(sectors.change_for_window(bars(closes), '1M'))


class TestOneSharedEndDate(unittest.TestCase):
    """A ranking of eleven changes measured to eleven dates is not a ranking."""

    def test_the_shared_date_is_the_oldest_last_bar(self):
        supplied = {
            'XLK': series([1.0, 2.0, 3.0]),
            'XLF': series([1.0, 2.0]),
        }
        self.assertEqual(sectors.common_end_date(supplied),
                         supplied['XLF']['bars'][-1]['date'])

    def test_a_longer_series_is_truncated_to_it(self):
        """The whole point: the fund that is a session ahead is measured to
        the same close as the fund that is behind, so the two are comparable."""
        ahead = series([100.0] + [1.0] * 20 + [110.0, 999.0])
        behind = series([100.0] + [1.0] * 20 + [110.0])
        end = sectors.common_end_date({'a': ahead, 'b': behind})
        built = sectors.rows({'a': ahead, 'b': behind}, end)
        figures = {row['symbol']: row for row in built}
        self.assertIsNotNone(end)
        # Both rows read the same last close, so neither sees the 999.
        for row in built:
            if row['available']:
                self.assertEqual(row['last_close'], 110.0)
        self.assertTrue(figures)

    def test_no_series_at_all_leaves_no_date(self):
        self.assertIsNone(sectors.common_end_date({}))
        self.assertIsNone(sectors.common_end_date({'XLK': {'bars': []}}))


class TestTheGrid(unittest.TestCase):

    def test_every_sector_gets_a_row_even_with_nothing_behind_it(self):
        """A fixed set of eleven slices of one market. Ranking ten of them and
        looking complete is worse than saying which one is missing."""
        grid = sectors.grid({})
        self.assertEqual(len(grid['sectors']), len(sectors.SECTORS))
        self.assertEqual(grid['unavailable'], list(sectors.SECTOR_SYMBOLS))
        self.assertIsNone(grid['as_of'])

    def test_a_present_fund_is_not_marked_unavailable(self):
        grid = sectors.grid({'XLK': series([100.0] * 30)})
        rows = {row['symbol']: row for row in grid['sectors']}
        self.assertTrue(rows['XLK']['available'])
        self.assertNotIn('XLK', grid['unavailable'])
        self.assertIn('XLF', grid['unavailable'])

    def test_every_fund_has_a_name_that_is_not_its_ticker(self):
        for symbol, name in sectors.SECTORS:
            self.assertTrue(name.strip())
            self.assertNotEqual(name, symbol)

    def test_every_window_is_labelled_in_words(self):
        """The surface has to be able to say the window aloud, and '1M' read
        out is 'one M'."""
        for window in sectors.WINDOWS:
            self.assertTrue(sectors.WINDOW_LABELS.get(window, '').strip())

    def test_there_is_no_one_day_window(self):
        """Deliberate. The series behind this grid are refreshed weekly, so a
        one-session figure would name a session that could be a week old."""
        self.assertNotIn('1D', sectors.WINDOWS)


class SectorRouteTestCase(unittest.TestCase):

    def setUp(self):
        incisor.app.config['TESTING'] = True
        self.client = incisor.app.test_client()
        incisor.reset_rate_limits()
        self.clear()

    def tearDown(self):
        self.clear()

    def clear(self):
        with store.connect() as connection:
            for table in ('daily_bars', 'daily_series', 'upstream_calls'):
                connection.execute('DELETE FROM %s' % table)
        fetcher.reset_locks()

    def get(self):
        return self.client.get('/sectors', headers=ORIGIN)


class TestTheRoute(SectorRouteTestCase):

    def test_it_answers_with_every_sector(self):
        payload = self.get().json
        self.assertEqual(len(payload['sectors']['sectors']),
                         len(sectors.SECTORS))
        self.assertEqual(payload['sectors']['unavailable'], [])

    def test_the_envelope_says_where_the_numbers_came_from(self):
        """Guide section 10. In fixture mode every figure here is invented,
        and the page can only say so if the service does."""
        payload = self.get().json
        self.assertEqual(payload['source'], 'fixture')
        self.assertEqual(payload['delay'], incisor.DELAY_LABEL)
        self.assertIn('stale', payload)
        self.assertIn('served_at', payload)

    def test_every_figure_is_measured_to_one_stated_date(self):
        grid = self.get().json['sectors']
        self.assertRegex(grid['as_of'], r'^\d{4}-\d{2}-\d{2}$')

    def test_it_sends_figures_and_not_a_third_of_a_megabyte_of_bars(self):
        """The reason this route computes instead of relaying. Eleven full
        series is the payload /history would have made the browser fetch."""
        body = json.dumps(self.get().json)
        self.assertLess(len(body), 20000, 'the grid is sending raw bars')
        self.assertNotIn('"volume"', body)

    def test_a_bad_origin_is_refused(self):
        response = self.client.get('/sectors',
                                   headers={'Origin': 'https://evil.example'})
        self.assertEqual(response.status_code, 403)

    def test_it_is_rate_limited_like_every_other_route(self):
        headers = dict(ORIGIN)
        headers['X-Forwarded-For'] = '203.0.113.77'
        codes = {self.client.get('/sectors', headers=headers).status_code
                 for _ in range(incisor.RATE_LIMIT_MAX + 5)}
        self.assertIn(429, codes)

    def test_it_takes_no_arguments(self):
        """Nothing for a caller to vary means nothing to validate. Anything
        passed is ignored rather than reflected."""
        response = self.client.get('/sectors?symbol=../../etc', headers=ORIGIN)
        self.assertEqual(response.status_code, 200)


class TestWhatTheGridCosts(SectorRouteTestCase):

    def test_a_second_request_makes_no_further_reads(self):
        """Eleven funds cached is eleven calls not repeated. The cache runs in
        fixture mode too, which is what keeps this path exercised."""
        self.get()
        with mock.patch.object(source, 'fetch') as fetch:
            self.get()
        fetch.assert_not_called()

    def test_the_series_are_read_at_a_week_rather_than_a_day(self):
        """The budget decision, asserted where it lives. At the endpoint TTL
        these eleven funds would cost eleven of a 22-call day."""
        self.assertGreaterEqual(incisor.SECTOR_MAX_AGE_SEC, 7 * 24 * 60 * 60)
        self.assertGreater(incisor.SECTOR_MAX_AGE_SEC,
                           fetcher.TTL_SECONDS[source.DAILY])

        two_days_ago = (datetime.datetime.now(datetime.timezone.utc)
                        - datetime.timedelta(days=2)).isoformat()
        self.assertFalse(fetcher.is_fresh(source.DAILY, two_days_ago),
                         'the endpoint default should call this stale')
        self.assertTrue(fetcher.is_fresh(source.DAILY, two_days_ago,
                                         incisor.SECTOR_MAX_AGE_SEC),
                        'the grid should still be reading it')

    def test_live_mode_refreshes_only_a_couple_of_funds_per_request(self):
        """Eleven sequential upstream calls inside one response would blow
        both the ten-second timeout and the provider's per-minute throttle."""
        with mock.patch.object(incisor, 'DATA_SOURCE', 'live'), \
                mock.patch.object(source, 'fetch') as fetch:
            fetch.side_effect = source.SourceUnavailable('no network in a test')
            self.get()
        self.assertEqual(fetch.call_count, incisor.SECTOR_REFRESH_PER_REQUEST)

    def test_fixture_mode_is_not_capped(self):
        """A fixture read is a local file read. Rationing it would make the
        grid fill over six page loads in the only mode that has ever run."""
        self.assertEqual(self.get().json['sectors']['unavailable'], [])

    def test_a_fund_that_cannot_be_served_is_a_row_and_not_a_failure(self):
        real_get = fetcher.get

        def refuse_one(endpoint, symbol, *args, **kwargs):
            if symbol == 'XLE':
                raise fetcher.Unavailable('nothing for XLE')
            return real_get(endpoint, symbol, *args, **kwargs)

        with mock.patch.object(fetcher, 'get', refuse_one):
            payload = self.get().json

        self.assertEqual(payload['sectors']['unavailable'], ['XLE'])
        self.assertEqual(len(payload['sectors']['sectors']),
                         len(sectors.SECTORS))
        self.assertIsNotNone(payload['sectors']['as_of'])


if __name__ == '__main__':
    unittest.main()
