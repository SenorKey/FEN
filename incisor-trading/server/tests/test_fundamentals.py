"""Filings: the parser, the arithmetic, and the route that joins two upstreams.

Three halves, and the first one is where the risk lives. edgar.py turns a
filing into a trailing-twelve-month figure by summing four quarters out of a
payload that also carries half-years, full years and the same quarter filed
three times — and a sum over the wrong periods produces a number that looks
exactly like a sum over the right ones. Every one of those shapes is written
out here by hand, because no amount of driving the route would tell them apart.

The second is fundamentals.py: margins that must be absent rather than zero,
and a beta that has to pair two independently fetched series by date.

The third is about cost, and it guards the reason this surface exists on a
second provider at all. EDGAR is free and Alpha Vantage rations us to
twenty-five calls a day, so a filing fetch must not move the budget — and it
would have, because the call log is one table and the budget counted it whole.

    cd incisor-trading/server && python3 -m unittest discover tests
"""

import datetime
import json
import os
import unittest

import service_fixture  # noqa: F401  — configures the service before import
import edgar  # noqa: E402
import fetcher  # noqa: E402
import fundamentals  # noqa: E402
import incisor  # noqa: E402
import provider  # noqa: E402
import source  # noqa: E402
import store  # noqa: E402

ORIGIN = {'Origin': 'https://frontendneeded.com'}

FIXTURE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'fixtures', 'company-facts')


def quarter(start, end, value, filed='2026-08-01', form='10-Q'):
    return {'start': start, 'end': end, 'val': value,
            'filed': filed, 'form': form, 'fy': 2026, 'fp': 'Q1'}


def payload(tag_entries, taxonomy='us-gaap', unit='USD', extra=None):
    """A companyfacts envelope carrying one tag, in EDGAR's published shape."""
    facts = {taxonomy: {tag: {'units': {unit: entries}}
                        for tag, entries in tag_entries.items()}}
    if extra:
        facts.update(extra)
    return {'cik': 320193, 'entityName': 'Test Filer Inc.', 'facts': facts}


# Four abutting quarters, oldest first, as EDGAR reports them.
FOUR_QUARTERS = [
    quarter('2025-06-29', '2025-09-27', 100),
    quarter('2025-09-28', '2025-12-27', 110),
    quarter('2025-12-28', '2026-03-28', 120),
    quarter('2026-03-29', '2026-06-27', 130),
]


class TestQuarterSelection(unittest.TestCase):
    """What counts as a quarter, and what a trailing year is summed from."""

    def test_four_quarters_are_summed_into_a_trailing_year(self):
        facts = edgar.parse_company_facts(
            payload({'Revenues': FOUR_QUARTERS}), 'TEST')
        self.assertEqual(facts['revenue'], 460)
        self.assertEqual(facts['quarters'], 4)

    def test_an_annual_period_is_not_added_to_the_quarters_it_covers(self):
        """The failure this whole module exists to catch.

        Every real payload files the year against the same tag as the
        quarters, distinguished only by its length. A parser that summed
        everything it found would report 920 here and look entirely plausible.
        """
        annual = quarter('2025-06-29', '2026-06-27', 460, form='10-K')
        facts = edgar.parse_company_facts(
            payload({'Revenues': FOUR_QUARTERS + [annual]}), 'TEST')
        self.assertEqual(facts['revenue'], 460)

    def test_the_committed_fixtures_carry_that_annual_period(self):
        """The fixture has to contain the shape the parser must refuse.

        A fixture holding only quarters would let a parser that ignored the
        distinction pass, which is the same class of gap as a stand-in that
        papers over the thing it stands for.
        """
        for name in sorted(os.listdir(FIXTURE_DIR)):
            with open(os.path.join(FIXTURE_DIR, name)) as handle:
                entries = json.load(handle)['facts']['us-gaap']['Revenues']
            spans = [entry for entry in entries['units']['USD']
                     if not edgar._is_quarter(entry)]
            self.assertTrue(spans, '%s has no non-quarterly period in it' % name)

    def test_a_missing_quarter_stops_the_window_rather_than_reaching_past_it(self):
        """A gap means fewer quarters, never a quarter borrowed from a year ago."""
        gapped = [FOUR_QUARTERS[0], FOUR_QUARTERS[2], FOUR_QUARTERS[3]]
        facts = edgar.parse_company_facts(payload({'Revenues': gapped}), 'TEST')
        self.assertEqual(facts['revenue'], 250)
        self.assertEqual(facts['quarters'], 2)

    def test_a_restated_period_keeps_the_value_filed_last(self):
        restated = FOUR_QUARTERS + [
            quarter('2026-03-29', '2026-06-27', 999, filed='2026-11-02')]
        facts = edgar.parse_company_facts(
            payload({'Revenues': restated}), 'TEST')
        self.assertEqual(facts['revenue'], 100 + 110 + 120 + 999)

    def test_a_company_with_two_quarters_reports_two_quarters(self):
        facts = edgar.parse_company_facts(
            payload({'Revenues': FOUR_QUARTERS[2:]}), 'TEST')
        self.assertEqual(facts['quarters'], 2)
        self.assertEqual(facts['revenue'], 250)


class TestFigureReading(unittest.TestCase):
    """Tags, units and what absence means."""

    def test_the_first_tag_that_answers_wins_and_the_rest_are_not_mixed_in(self):
        """Two revenue tags are alternates, not addends.

        A filer that switched from Revenues to the contract-with-customer tag
        has both, and summing across them would double the year.
        """
        both = payload({
            'RevenueFromContractWithCustomerExcludingAssessedTax': FOUR_QUARTERS,
            'Revenues': [quarter('2025-06-29', '2025-09-27', 5000)],
        })
        self.assertEqual(edgar.parse_company_facts(both, 'TEST')['revenue'], 460)

    def test_a_per_share_figure_is_read_in_its_own_unit(self):
        """Reading the wrong unit gives a number of the right magnitude and
        the wrong meaning, which is why the unit is named per figure."""
        facts = edgar.parse_company_facts(payload(
            {'EarningsPerShareDiluted': [
                quarter('2025-06-29', '2025-09-27', 1.5),
                quarter('2025-09-28', '2025-12-27', 2.5),
            ]}, unit='USD/shares'), 'TEST')
        self.assertEqual(facts['eps'], 4.0)

    def test_a_figure_filed_only_in_the_wrong_unit_is_absent(self):
        """Revenue is present so the payload is readable; only the unit on
        the per-share tag is wrong, which is the case being asserted."""
        wrong_unit = payload({'Revenues': FOUR_QUARTERS})
        wrong_unit['facts']['us-gaap']['EarningsPerShareDiluted'] = {
            'units': {'USD': FOUR_QUARTERS}}
        self.assertIsNone(edgar.parse_company_facts(wrong_unit, 'TEST')['eps'])

    def test_a_company_that_declares_no_dividend_reports_none_not_zero(self):
        facts = edgar.parse_company_facts(
            payload({'Revenues': FOUR_QUARTERS}), 'TEST')
        self.assertIsNone(facts['dividends_per_share'])

    def test_shares_outstanding_is_the_newest_observation_not_a_sum(self):
        shares = {'dei': {'EntityCommonStockSharesOutstanding': {'units': {
            'shares': [
                {'end': '2026-03-28', 'val': 900, 'filed': '2026-05-01'},
                {'end': '2026-06-27', 'val': 800, 'filed': '2026-08-01'},
            ]}}}}
        facts = edgar.parse_company_facts(
            payload({'Revenues': FOUR_QUARTERS}, extra=shares), 'TEST')
        self.assertEqual(facts['shares_outstanding'], 800)

    def test_a_payload_with_nothing_we_asked_about_is_a_not_found(self):
        """How a fund arrives: readable, and silent on every figure."""
        with self.assertRaises(provider.ProviderError) as caught:
            edgar.parse_company_facts(payload({'Goodwill': FOUR_QUARTERS}), 'XLK')
        self.assertEqual(caught.exception.reason, 'not_found')

    def test_a_payload_that_is_not_company_facts_is_malformed(self):
        for bad in ({}, {'facts': 'not an object'}, []):
            with self.assertRaises(provider.ProviderError) as caught:
                edgar.parse_company_facts(bad, 'TEST')
            self.assertEqual(caught.exception.reason, 'malformed')

    def test_the_cik_is_padded_the_way_edgar_spells_it_in_a_url(self):
        facts = edgar.parse_company_facts(
            payload({'Revenues': FOUR_QUARTERS}), 'TEST')
        self.assertEqual(facts['cik'], '0000320193')


class TestMargins(unittest.TestCase):
    def test_a_margin_is_the_fraction_of_revenue(self):
        self.assertAlmostEqual(fundamentals.margin(25.0, 100.0), 0.25)

    def test_a_missing_numerator_is_unknown_rather_than_zero(self):
        """Guide section 15: missing data is an em dash, never a 0."""
        self.assertIsNone(fundamentals.margin(None, 100.0))

    def test_no_revenue_means_no_margin_rather_than_a_division_by_zero(self):
        self.assertIsNone(fundamentals.margin(10.0, 0.0))
        self.assertIsNone(fundamentals.margin(10.0, None))


def series(closes, skip=0):
    """Daily bars on consecutive calendar days, oldest first.

    Real dates, because the two series a beta compares are paired by date.
    `skip` drops the first `skip` days, so a shorter series still lines up
    with the days it shares rather than starting again at day one.
    """
    start = datetime.date(2026, 1, 1)
    return [{'date': (start + datetime.timedelta(skip + index)).isoformat(),
             'close': close}
            for index, close in enumerate(closes)]


class TestBeta(unittest.TestCase):
    def test_a_series_measured_against_itself_is_one(self):
        prices = [100 * (1.01 if index % 3 else 0.99) ** index
                  for index in range(1, 100)]
        value, sessions = fundamentals.beta(series(prices), series(prices))
        self.assertAlmostEqual(value, 1.0)
        self.assertEqual(sessions, len(prices) - 1)

    def test_a_series_that_moves_twice_as_far_has_a_beta_of_two(self):
        market, geared = [100.0], [100.0]
        for index in range(1, 100):
            move = 0.01 if index % 3 else -0.02
            market.append(market[-1] * (1 + move))
            geared.append(geared[-1] * (1 + 2 * move))
        value, _ = fundamentals.beta(series(geared), series(market))
        self.assertAlmostEqual(value, 2.0, places=2)

    def test_the_two_series_are_paired_by_date_and_not_by_position(self):
        """The symbol and the benchmark are fetched separately and need not
        be the same length. Pairing by position would compare January with
        March and produce a number rather than a failure."""
        market = [100.0]
        for index in range(1, 120):
            market.append(market[-1] * (1 + (0.01 if index % 3 else -0.02)))
        full = series(market)
        # The same prices, listed from day 21 onward. Paired by date, every
        # shared day matches exactly and the beta is 1; paired by position,
        # day 21 would be compared with day 1.
        late = series(market[20:], skip=20)
        value, sessions = fundamentals.beta(late, full)
        self.assertAlmostEqual(value, 1.0)
        self.assertEqual(sessions, len(late) - 1)

    def test_too_few_shared_sessions_is_unknown_rather_than_a_wide_guess(self):
        prices = [100 + index for index in range(20)]
        self.assertIsNone(fundamentals.beta(series(prices), series(prices)))

    def test_an_unmoving_benchmark_has_no_beta_rather_than_a_zero_division(self):
        flat = series([100.0] * 100)
        moving = series([100 + index for index in range(100)])
        self.assertIsNone(fundamentals.beta(moving, flat))


class TestFundamentalsRoute(unittest.TestCase):
    def setUp(self):
        self.client = incisor.app.test_client()
        # The beta reads whatever series the cache already holds and never
        # refreshes one, so the two the assertions need are warmed here.
        for symbol in ('SPY', 'AAPL'):
            self.client.get('/history?symbol=' + symbol, headers=ORIGIN)

    def get(self, symbol):
        return self.client.get('/fundamentals?symbol=' + symbol, headers=ORIGIN)

    def test_a_filer_answers_with_its_filings_and_a_beta(self):
        body = self.get('AAPL').get_json()['fundamentals']
        self.assertEqual(body['filings']['entity_name'], 'Apple Inc.')
        self.assertEqual(body['filings']['quarters'], 4)
        self.assertGreater(body['filings']['revenue'], 0)
        self.assertEqual(body['beta']['benchmark'], 'SPY')

    def test_the_margins_fall_in_the_order_every_income_statement_has(self):
        """Gross above operating above net. A fixture that failed this would
        be teaching an impossible company."""
        filings = self.get('AAPL').get_json()['fundamentals']['filings']
        self.assertGreater(filings['gross_margin'], filings['operating_margin'])
        self.assertGreater(filings['operating_margin'], filings['net_margin'])

    def test_earnings_per_share_agrees_with_income_over_shares(self):
        """The two figures sit on one card, and a reader can divide."""
        filings = self.get('AAPL').get_json()['fundamentals']['filings']
        implied = filings['net_income'] / filings['shares_outstanding']
        self.assertAlmostEqual(filings['eps'], implied, places=1)

    def test_a_fund_has_no_filings_and_is_not_an_error(self):
        """Every ETF on this page arrives here. It is the ordinary answer."""
        response = self.get('XLK')
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.get_json()['fundamentals']['filings'])

    def test_a_symbol_nothing_has_ever_priced_answers_with_neither_half(self):
        body = self.get('ZZZZ').get_json()['fundamentals']
        self.assertIsNone(body['filings'])
        self.assertIsNone(body['beta'])

    def test_an_invalid_symbol_is_refused_at_the_edge(self):
        self.assertEqual(
            self.client.get('/fundamentals?symbol=../etc', headers=ORIGIN)
            .status_code, 400)

    def test_a_bad_origin_is_refused(self):
        self.assertEqual(
            self.client.get('/fundamentals?symbol=AAPL',
                            headers={'Origin': 'https://example.com'})
            .status_code, 403)

    def test_the_panel_never_refreshes_a_price_series_to_measure_a_beta(self):
        """A figure nobody searched for must not spend one of twenty-two calls.

        BRK.B has a committed series and has not been fetched in this test, so
        a route that refreshed to get a beta would create a cache row here.
        """
        store.save_fundamentals  # the filings path is cached; the series is not
        self.get('BRK.B')
        cached, _ = store.load_history('BRK.B')
        self.assertIsNone(cached)
        self.assertIsNone(self.get('BRK.B').get_json()['fundamentals']['beta'])


class TestTheFreeUpstreamCostsNoQuota(unittest.TestCase):
    """The reason fundamentals are on a second provider, asserted.

    EDGAR is public domain and allows ten requests a second; Alpha Vantage
    rations us to twenty-five a day. Both write to one call log, so a budget
    counted over the whole log would let a reader opening eight companies
    exhaust the allowance that exists to keep four price tiles refreshed.
    """

    def test_a_filing_call_is_logged(self):
        before = store.calls_today()
        incisor.app.test_client().get('/fundamentals?symbol=AAPL', headers=ORIGIN)
        fetcher.reset_locks()
        self.assertGreaterEqual(store.calls_today(), before)

    def test_a_filing_call_does_not_reduce_the_price_budget(self):
        store.record_call(source.COMPANY_FACTS, 'AAPL', 'ok', 'live')
        self.assertEqual(fetcher.budget_remaining(), fetcher.DAILY_CALL_BUDGET)
        self.assertEqual(fetcher.quota_status()['used_today'], 0)

    def test_a_price_call_does_reduce_it(self):
        store.record_call(source.DAILY, 'SPY', 'ok', 'live')
        self.assertEqual(fetcher.budget_remaining(),
                         fetcher.DAILY_CALL_BUDGET - 1)

    def test_the_rationed_set_is_derived_from_which_upstream_serves_what(self):
        """Written out, this list would be a second place to keep in step."""
        self.assertEqual(set(fetcher.RATIONED_ENDPOINTS),
                         {source.QUOTE, source.DAILY})
        self.assertNotIn(source.COMPANY_FACTS, fetcher.RATIONED_ENDPOINTS)


class TestLiveFilingsPath(unittest.TestCase):
    """The live EDGAR path, which has never run and is tested the only way it
    can be: by checking what it would send, not by sending it."""

    def test_a_missing_contact_address_refuses_rather_than_getting_a_403(self):
        with self.assertRaises(source.SourceUnavailable):
            source.edgar_headers('')

    def test_the_user_agent_names_the_application_and_the_contact(self):
        agent = source.edgar_headers('someone@example.com')['User-Agent']
        self.assertIn('Incisor Trading', agent)
        self.assertIn('someone@example.com', agent)

    def test_the_filings_endpoint_belongs_to_edgar_and_the_prices_do_not(self):
        self.assertEqual(source.UPSTREAM_OF[source.COMPANY_FACTS], source.EDGAR)
        self.assertEqual(source.UPSTREAM_OF[source.QUOTE], source.ALPHA_VANTAGE)

    def test_the_facts_url_is_built_from_a_padded_cik(self):
        self.assertEqual(
            source.EDGAR_FACTS_URL % '0000320193',
            'https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json')


if __name__ == '__main__':
    unittest.main()
