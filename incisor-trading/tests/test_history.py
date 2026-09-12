"""Runs the equity curve, not just its markup.

`history_model.jxa.js` loads js/market-clock.js, js/portfolio-ledger.js and
js/portfolio-history.js into JavaScriptCore and drives the curve against a
scenario worked out by hand in cents: a buy at one close, a part-sale at
another, and five sessions of two daily series. T16's acceptance asks for that
arithmetic to be written down, and it is — in the runner's header, and in the
session's PROGRESS.md entry.

The property worth more than any figure is the join with T14: the curve's last
point and js/portfolio-ledger.js's valuation are two routes to one number, and
the runner asserts they agree. A curve that drifts from the summary above it
would be the page contradicting itself in the same screen.

What this cannot see is whether the chart reads at 375px, or whether two lines
on one scale are distinguishable without colour. tools/shoot.py does that.
"""

import json
import os
import re
import shutil
import subprocess
import unittest

from page_model import PAGE_DIR, Page, read

HERE = os.path.dirname(os.path.abspath(__file__))
RUNNER = os.path.join(HERE, 'history_model.jxa.js')

HTML = read('index.html')
PAGE = Page(HTML)
HISTORY = read('js/portfolio-history.js')
GEOMETRY = read('js/chart-geometry.js')


def code(source):
    """A script with its comments removed.

    DEC-066: a blunt substring check over a whole file matches the prose as
    readily as the code, and this file's header says the module is "no DOM,
    no storage, no network" and that a caller "knows what to fetch" — which
    is exactly the sentence a search for `fetch` should not find. The rule is
    about what the module does, so it is asserted against what it executes.
    """
    return re.sub(r'//[^\n]*', ' ',
                  re.sub(r'/\*.*?\*/', ' ', source, flags=re.S))


HISTORY_CODE = code(HISTORY)


@unittest.skipUnless(shutil.which('osascript'), 'needs macOS JavaScriptCore')
class TestTheCurveIsCorrect(unittest.TestCase):

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


class TestTheCurveIsPure(unittest.TestCase):
    """js/portfolio-history.js is arithmetic. The moment it can reach the DOM,
    storage or the network it stops being checkable without a browser, which
    is what made T14's ledger worth separating from its view in the first
    place."""

    def test_it_touches_nothing_outside_itself(self):
        for forbidden in ('document', 'localStorage', 'fetch', 'XMLHttpRequest',
                          'IncisorMarketData', 'IncisorPortfolioStore'):
            self.assertNotIn(forbidden, HISTORY_CODE, forbidden)

    def test_it_reads_the_clock_it_is_handed_rather_than_the_global(self):
        """Handed in like js/portfolio-orders.js takes it, so a test can drive
        the walk across a holiday without moving the machine's clock."""
        self.assertNotIn('IncisorMarketClock', HISTORY_CODE)
        self.assertIn('clock.sessionOn', HISTORY_CODE)

    def test_it_never_takes_a_new_date(self):
        """Every instant it compares comes from a stored trade or from the
        clock. A curve that read `now` would draw a different line depending
        on when the page was opened."""
        self.assertNotIn('new Date()', HISTORY_CODE)
        self.assertNotIn('Date.now', HISTORY_CODE)


class TestTwoLinesShareOneScale(unittest.TestCase):
    """A portfolio and its benchmark drawn on their own scales can put the
    loser above the winner. js/chart-geometry.js grew an explicit bounds
    argument for it rather than the curve growing a second copy of plot()."""

    def test_plot_takes_explicit_bounds(self):
        self.assertIn('function plot(bars, width, height, padding, bounds)', GEOMETRY)

    def test_the_bounds_are_checked_before_they_are_trusted(self):
        self.assertIn('isFiniteNumber(bounds.low)', GEOMETRY)
        self.assertIn('bounds.high >= bounds.low', GEOMETRY)


class TestTheCurveIsWiredIntoThePage(unittest.TestCase):

    def test_the_history_module_loads_after_what_it_replays(self):
        order = [HTML.index('/incisor-trading/js/' + name) for name in (
            'market-clock.js', 'portfolio-ledger.js', 'portfolio-history.js')]
        self.assertEqual(order, sorted(order))

    def test_the_view_loads_after_the_arithmetic_and_the_geometry(self):
        for earlier in ('portfolio-history.js', 'chart-geometry.js',
                        'view-portfolio.js'):
            self.assertLess(
                HTML.index('/incisor-trading/js/' + earlier),
                HTML.index('/incisor-trading/js/view-performance.js'), earlier)

    def test_the_trade_panel_carries_the_three_roots_t16_builds_into(self):
        start = HTML.index('<section class="inc-panel" id="panel-trade"')
        panel = HTML[start:HTML.index('</section>', start)]
        for hook in ('data-positions', 'data-trade-log', 'data-performance'):
            self.assertEqual(panel.count(hook), 1, hook)


if __name__ == '__main__':
    unittest.main()
