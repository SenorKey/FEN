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
import re
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


class TestTheShotSeedReachesTheLogsOwnControl(unittest.TestCase):
    """The expander is hidden until the ledger runs past the preview, so with
    four trades it is in no screenshot — which is how three audits of this
    surface judged a trade log without ever seeing the one thing on it a
    reader can press. Sibling of the flat seed above, and kept for the same
    reason: the next audit starts where this one ended."""

    def setUp(self):
        import sys
        sys.path.insert(0, os.path.join(PAGE_DIR, 'tools'))
        import shoot
        self.seed = json.loads(shoot.PORTFOLIO_SEEDS['busy'])
        self.preview = int(re.search(r'LOG_PREVIEW = (\d+)',
                                     read('js/view-positions.js')).group(1))

    def test_it_makes_more_trades_than_the_log_previews(self):
        self.assertGreater(len(self.seed['ledger']), self.preview)

    def test_no_position_or_balance_in_it_could_not_have_happened(self):
        """A log that the game's own rules forbid teaches the wrong shape, and
        a reader cannot tell a seeded ledger from a played one."""
        shares = {}
        cash = self.seed['startingCash']
        for entry in self.seed['ledger']:
            held = shares.get(entry['symbol'], 0)
            amount = round(entry['shares'] * entry['price'] * 100)
            if entry['kind'] == 'buy':
                shares[entry['symbol']] = held + entry['shares']
                cash -= amount
            else:
                self.assertLessEqual(entry['shares'], held,
                                     'sold %d %s holding %d'
                                     % (entry['shares'], entry['symbol'], held))
                shares[entry['symbol']] = held - entry['shares']
                cash += amount
            self.assertGreaterEqual(cash, 0, 'cash went negative at %s'
                                    % entry['at'])

    def test_it_is_in_date_order_so_the_log_reverses_a_real_sequence(self):
        stamps = [entry['at'] for entry in self.seed['ledger']]
        self.assertEqual(stamps, sorted(stamps))


class TestTheTradeColumnsHeaderTravelsWithItsCells(unittest.TestCase):
    """Every other column on these tables is a figure and reads right to left;
    the trade column is a phrase and reads left to right. The cell was given
    that alignment on its own, and the header kept the right-aligned default —
    so at desktop "Trade" sat at the far edge of a 303px column with its data
    starting 250px to its left. DEC-065: assert the pair, and write it as one
    rule so the two cannot drift apart again."""

    def setUp(self):
        # Comments first: these carry commas, and a selector list is split on
        # them, so a rule's prose would arrive as half a dozen selectors
        # (DEC-066 — a blunt match over a file reads things that are not there).
        self.css = re.sub(r'/\*.*?\*/', '', read('css/positions.css'),
                          flags=re.S)

    def rules_setting_left_alignment(self):
        for selectors, body in re.findall(r'([^{}]+)\{([^{}]*)\}', self.css):
            if re.search(r'text-align:\s*left', body):
                yield [part.strip() for part in selectors.split(',')]

    def test_one_rule_names_both_the_header_and_the_cell(self):
        wanted = {'.inc-trade-log thead th:nth-child(2)',
                  '.inc-trade-log td:nth-child(2)'}
        for selectors in self.rules_setting_left_alignment():
            if wanted <= set(selectors):
                return
        self.fail('no single rule left-aligns both halves of the trade '
                  'column; found %r' % list(self.rules_setting_left_alignment()))

    def test_no_other_rule_aligns_only_one_half(self):
        for selectors in self.rules_setting_left_alignment():
            found = {s for s in selectors if 'nth-child(2)' in s
                     and '.inc-trade-log' in s}
            if found:
                self.assertEqual(len(found), 2, 'a rule aligns %r alone' % found)


if __name__ == '__main__':
    unittest.main()
