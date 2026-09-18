"""Runs the holdings table and the trade log, not just their markup.

`positions_model.jxa.js` loads js/view-positions.js into JavaScriptCore beside
js/view-portfolio.js and the modules they share, and reads the two tables the
way a reader does: the figures in each column, what a row says when a price
never arrived, what the empty states claim, and the log's preview control.

T16 shipped both tables with no runner at all. The cost was visible in the
09-17 audit: a position worth exactly what it cost rendered "▬ $0.00", which
is the flat bar sitting where a minus sign sits — the misreading DEC-093 had
already settled for the summary directly above this table, found again one
surface down because nothing here could see a rendered figure.

What this cannot see is the block layout below 560px, the contrast of a muted
zero, or whether six money columns fit a phone. tools/shoot.py does that.
"""

import json
import os
import shutil
import subprocess
import unittest

from page_model import PAGE_DIR, Page, read

HERE = os.path.dirname(os.path.abspath(__file__))
RUNNER = os.path.join(HERE, 'positions_model.jxa.js')

HTML = read('index.html')
PAGE = Page(HTML)


@unittest.skipUnless(shutil.which('osascript'), 'needs macOS JavaScriptCore')
class TestTheTablesAreCorrect(unittest.TestCase):

    def test_every_checked_case_holds(self):
        completed = subprocess.run(
            ['osascript', '-l', 'JavaScript', RUNNER, PAGE_DIR],
            capture_output=True, text=True, timeout=60)

        self.assertEqual(completed.returncode, 0, completed.stderr)
        report = json.loads(completed.stdout)

        failures = [row for row in report['results'] if not row['pass']]
        self.assertEqual(
            failures, [],
            '\n'.join('%s - %s' % (row['test'], row['detail']) for row in failures))
        self.assertGreaterEqual(report['total'], 30, 'the runner did not finish')


class TestTheZeroGainRuleHasOneHome(unittest.TestCase):
    """DEC-093 was argued for the summary and then found again, unchanged, in
    the holdings row an inch below it. A rule that two surfaces have to agree
    on is stated once; these assert that neither view has grown its own copy
    back."""

    def setUp(self):
        self.figures = read('js/market-figures.js')

    def test_the_rule_is_in_the_shared_module(self):
        self.assertIn('function gainArrowFor(value)', self.figures)
        self.assertIn('gainArrowFor: gainArrowFor,', self.figures)

    def test_neither_view_decides_it_for_itself(self):
        for name in ('js/view-portfolio.js', 'js/view-positions.js'):
            with self.subTest(name):
                source = read(name)
                self.assertIn('gainArrowFor', source)
                self.assertNotIn('arrowFor(dollars)', source)
                self.assertNotIn('=== 0 ?', source)


class TestTheTablesAreWiredIntoThePage(unittest.TestCase):

    def test_the_view_loads_after_the_portfolio_it_reads_through(self):
        self.assertGreater(
            HTML.index('/incisor-trading/js/view-positions.js'),
            HTML.index('/incisor-trading/js/view-portfolio.js'))

    def test_the_trade_panel_carries_both_roots_empty(self):
        for marker in ('data-positions', 'data-trade-log'):
            with self.subTest(marker):
                self.assertIn(marker, HTML)

    def test_the_ticket_is_served_above_the_trade_log(self):
        """The empty log names the ticket's direction, so the order of the
        two in the document is what makes that sentence true."""
        self.assertLess(HTML.index('data-ticket'), HTML.index('data-trade-log'))


class TestTheShotSeedReachesAFlatPosition(unittest.TestCase):
    """The zero-gain row is only photographable if a seed can reach it, and
    the audit that found it had to add one. It is kept so the next audit of
    this surface starts where this one ended."""

    def setUp(self):
        import sys
        sys.path.insert(0, os.path.join(PAGE_DIR, 'tools'))
        import shoot
        self.seed = json.loads(shoot.PORTFOLIO_SEEDS['flat'])

    def test_it_holds_one_position_bought_at_the_last_fixture_close(self):
        bought = self.seed['ledger'][0]
        self.assertEqual(bought['kind'], 'buy')
        self.assertEqual(bought['symbol'], 'SPY')
        self.assertEqual(bought['price'], 733.4011)

    def test_it_places_no_order_that_would_move_the_figure(self):
        self.assertEqual(self.seed['orders'], [])


if __name__ == '__main__':
    unittest.main()
