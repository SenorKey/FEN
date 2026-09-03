"""The reporting calendar: the rhythm, the comparison, and the round trip.

Three things are worth testing here and none of them is arithmetic for its own
sake.

The **projection** is the only figure on this page derived from a pattern
rather than read off a filing, so what it refuses to state matters as much as
what it states: one report is not a rhythm, a mean is not a gap any quarter
ever took, and a lag range read from a decade of filings would describe how a
company used to close its books.

The **year-ago comparison** has to be matched on dates. Counting four rows back
is the obvious implementation and it silently compares a summer quarter with a
spring one the moment a filing is missing — which is exactly when a reader is
most likely to be looking.

The **round trip** is new storage. `filing_reports` is the first table here
whose rows are replaced rather than upserted, and a cache that lost the reports
would leave a surface that worked until its TTL expired.

    cd incisor-trading/server && python3 -m unittest discover tests
"""

import json
import os
import unittest

import service_fixture  # noqa: F401  — configures the service before import
import edgar  # noqa: E402
import incisor  # noqa: E402
import reporting  # noqa: E402
import store  # noqa: E402

ORIGIN = {'Origin': 'https://frontendneeded.com'}

FIXTURE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'fixtures', 'company-facts')


def report(end, filed, eps=None, dividend=None, start=None, form='10-Q'):
    return {'start': start, 'end': end, 'filed': filed, 'form': form,
            'eps': eps, 'dividends_per_share': dividend}


# Four quarters ninety-one days apart, newest first, filed between thirty-eight
# and forty-five days after each close. The shape every assertion below varies
# one thing away from.
QUARTERS = [
    report('2026-06-27', '2026-08-08', eps=2.00, dividend=0.26),
    report('2026-03-28', '2026-05-07', eps=1.80, dividend=0.26),
    report('2025-12-27', '2026-02-08', eps=1.81, dividend=0.26),
    report('2025-09-27', '2025-11-04', eps=1.51, dividend=0.26),
]

# The year behind them, which is what the comparison column reads.
YEAR_BEFORE = [
    report('2025-06-29', '2025-08-09', eps=1.95, dividend=0.24),
    report('2025-03-30', '2025-05-14', eps=1.55, dividend=0.24),
    report('2024-12-29', '2025-02-06', eps=1.44, dividend=0.24),
    report('2024-09-29', '2024-11-12', eps=1.34, dividend=0.24),
]

TWO_YEARS = QUARTERS + YEAR_BEFORE


class TestRhythm(unittest.TestCase):
    def test_the_cadence_is_a_gap_some_quarter_actually_took(self):
        """A median, not a mean. Quarters run ninety or ninety-one days apart
        and never ninety and a half, so an average would land the projected
        period end on a day no quarter of this company has ever ended."""
        uneven = [report('2026-06-27', '2026-08-08'),
                  report('2026-03-28', '2026-05-07'),
                  report('2025-12-27', '2026-02-08'),
                  report('2025-09-20', '2025-11-04')]
        gaps = {91, 91, 98}
        self.assertIn(reporting.cadence_days(uneven), gaps)

    def test_one_report_is_not_a_rhythm(self):
        """No gap to measure, so no projection. The honest answer for a company
        that has filed once — better than a window through a single point."""
        self.assertIsNone(reporting.cadence_days(QUARTERS[:1]))
        self.assertIsNone(reporting.projection(QUARTERS[:1]))

    def test_the_window_spans_the_shortest_and_longest_recent_lag(self):
        """Both ends are days this company has taken, which is what lets the
        surface show its arithmetic instead of asserting a date."""
        projected = reporting.projection(QUARTERS)
        self.assertEqual(projected['lag_min'], 38)
        self.assertEqual(projected['lag_max'], 43)
        self.assertEqual(projected['period_end'], '2026-09-26')
        self.assertEqual(projected['earliest'], '2026-11-03')
        self.assertEqual(projected['latest'], '2026-11-08')

    def test_an_old_filing_habit_does_not_widen_the_window(self):
        """Only the recent reports set it. A filer that has tightened its close
        would otherwise be projected against a lag it no longer takes — the
        window would be right about 2019 and wrong about now."""
        slow_past = QUARTERS + [report('2025-06-29', '2025-11-01')]
        self.assertEqual(reporting.projection(slow_past)['lag_max'],
                         reporting.projection(QUARTERS)['lag_max'])

    def test_a_report_with_no_filing_date_has_no_lag(self):
        self.assertIsNone(reporting.filing_lag(report('2026-06-27', None)))


class TestYearAgoComparison(unittest.TestCase):
    def test_the_match_is_on_dates_and_not_on_position(self):
        """The failure this guards is quiet and seasonal. Counting four rows
        back works until a quarter is missing, and then compares Christmas
        with the autumn before it under a heading saying "a year ago"."""
        missing_one = QUARTERS + YEAR_BEFORE[1:]
        newest = reporting.year_ago(missing_one, missing_one[0])
        self.assertIsNone(newest, 'matched a quarter that is not a year old')
        older = reporting.year_ago(missing_one, QUARTERS[1])
        self.assertEqual(older['end'], '2025-03-30')

    def test_every_row_on_screen_carries_its_comparison(self):
        rows = reporting.quarters(TWO_YEARS)
        self.assertEqual(len(rows), 4)
        for row in rows:
            self.assertIsNotNone(row['eps_year_ago'], row['end'])
            self.assertIsNotNone(row['eps_change'], row['end'])

    def test_the_older_year_is_read_and_not_shown(self):
        """Eight rows would put four on screen whose comparison is necessarily
        blank. The second year is doing its work either way."""
        ends = [row['end'] for row in reporting.quarters(TWO_YEARS)]
        self.assertEqual(ends, [row['end'] for row in QUARTERS])

    def test_a_loss_a_year_ago_produces_no_percentage(self):
        """Every arithmetic answer to "up from minus one" reads backwards, so
        the honest output is no number at all."""
        loss = [report('2026-06-27', '2026-08-08', eps=2.00),
                report('2025-06-29', '2025-08-09', eps=-0.40)]
        self.assertIsNone(reporting.quarters(loss)[0]['eps_change'])

    def test_a_quarter_that_filed_no_earnings_still_has_its_dates(self):
        """An absent figure is a fact about the figure. Dropping the report
        would lose a filing that happened."""
        row = reporting.quarters([report('2026-06-27', '2026-08-08')])[0]
        self.assertIsNone(row['eps'])
        self.assertEqual(row['filed'], '2026-08-08')
        self.assertEqual(row['lag_days'], 42)


class TestCalendar(unittest.TestCase):
    def test_a_fund_has_no_calendar_at_all(self):
        """Every ETF on this page reaches here with nothing filed. A surface
        rendering an empty table for them would be answering a question about
        a company with the furniture of one."""
        self.assertIsNone(reporting.calendar(None))
        self.assertIsNone(reporting.calendar({'reports': []}))

    def test_the_last_report_is_the_newest_one(self):
        calendar = reporting.calendar({'reports': TWO_YEARS})
        self.assertEqual(calendar['last']['end'], '2026-06-27')
        self.assertEqual(calendar['last']['lag_days'], 42)

    def test_the_committed_fixture_carries_two_years_of_quarters(self):
        """The comparison column exists only because the fixture reaches back
        far enough for it. A four-quarter payload would leave every year-ago
        figure blank and nothing would fail to say so."""
        with open(os.path.join(FIXTURE_DIR, 'AAPL-2026-08-27.json')) as handle:
            facts = edgar.parse_company_facts(json.load(handle), 'AAPL')
        self.assertEqual(len(facts['reports']), 8)
        self.assertEqual(facts['reports'][0]['end'], '2026-06-27')


class TestReportsSurviveTheCache(unittest.TestCase):
    """New storage, and the first table here whose rows are replaced rather
    than upserted. A cache that lost the reports would leave a surface working
    until its TTL expired and empty afterwards."""

    def setUp(self):
        store.init()

    def facts(self, reports):
        return {'symbol': 'TEST', 'entity_name': 'Test Filer Inc.',
                'reports': reports}

    def test_a_saved_calendar_comes_back_newest_first(self):
        store.save_fundamentals(self.facts(list(reversed(QUARTERS))))
        loaded, _ = store.load_fundamentals('TEST')
        self.assertEqual([row['end'] for row in loaded['reports']],
                         [row['end'] for row in QUARTERS])
        self.assertEqual(loaded['reports'][0]['eps'], 2.00)

    def test_a_withdrawn_quarter_does_not_stand_forever(self):
        """Replaced rather than upserted: an amendment can drop a period as
        well as restate one."""
        store.save_fundamentals(self.facts(QUARTERS))
        store.save_fundamentals(self.facts(QUARTERS[:2]))
        loaded, _ = store.load_fundamentals('TEST')
        self.assertEqual(len(loaded['reports']), 2)

    def test_a_filer_with_no_reports_saves_cleanly(self):
        store.save_fundamentals(self.facts([]))
        loaded, _ = store.load_fundamentals('TEST')
        self.assertEqual(loaded['reports'], [])


class TestReportingRoute(unittest.TestCase):
    def get(self, symbol):
        client = incisor.app.test_client()
        return client.get('/fundamentals?symbol=' + symbol,
                          headers=ORIGIN).get_json()['fundamentals']

    def test_a_filer_answers_with_a_calendar(self):
        calendar = self.get('AAPL')['reporting']
        self.assertEqual(len(calendar['quarters']), 4)
        self.assertEqual(calendar['last']['form'], '10-Q')
        self.assertGreater(calendar['next']['lag_max'],
                           calendar['next']['lag_min'])

    def test_the_calendar_costs_no_second_request(self):
        """It rides the payload the figures already paid for. If this ever
        needed a fetch of its own it would be a call against a budget of
        twenty-two, for a question the response in hand already answers."""
        body = self.get('AAPL')
        self.assertIsNotNone(body['filings'])
        self.assertIsNotNone(body['reporting'])

    def test_a_fund_has_filings_and_a_calendar_both_absent(self):
        body = self.get('XLK')
        self.assertIsNone(body['filings'])
        self.assertIsNone(body['reporting'])
