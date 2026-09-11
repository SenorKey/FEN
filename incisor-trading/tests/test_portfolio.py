"""Runs the paper portfolio, not just its markup.

`portfolio_model.jxa.js` loads js/portfolio-ledger.js, js/portfolio-store.js
and js/view-portfolio.js into JavaScriptCore and drives them: the ledger
against a P/L scenario worked out by hand in cents, the store against every
kind of corrupt blob and against storage that throws or refuses writes, the
migration path with steps of its own, and the view against a DOM stub. That
is the whole of T14's acceptance a headless session can reach — the portfolio
survives a reload, and a corrupted blob resets with a notice rather than
breaking the page.

What it cannot see is whether the summary reads well at 375px. tools/shoot.py
does that, with --portfolio to seed the states only storage can produce.

The rest of this file checks the served markup the view relies on, because the
runner builds its own from the contract the view documents, and would keep
passing if the page stopped carrying it.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import unittest

from page_model import PAGE_DIR, Page, read

HERE = os.path.dirname(os.path.abspath(__file__))
RUNNER = os.path.join(HERE, 'portfolio_model.jxa.js')

HTML = read('index.html')
PAGE = Page(HTML)
LEDGER = read('js/portfolio-ledger.js')
STORE = read('js/portfolio-store.js')


def trade_panel():
    """The Trade panel on its own, so nothing here can match the dashboard."""
    start = HTML.index('<section class="inc-panel" id="panel-trade"')
    return HTML[start:HTML.index('</section>', start)]


@unittest.skipUnless(shutil.which('osascript'), 'needs macOS JavaScriptCore')
class TestPortfolioBehaviour(unittest.TestCase):

    def test_the_portfolio_is_correct_at_every_checked_case(self):
        completed = subprocess.run(
            ['osascript', '-l', 'JavaScript', RUNNER, PAGE_DIR],
            capture_output=True, text=True, timeout=60)

        self.assertEqual(completed.returncode, 0, completed.stderr)
        report = json.loads(completed.stdout)

        failures = [row for row in report['results'] if not row['pass']]
        self.assertEqual(
            failures, [],
            '\n'.join('%s - %s' % (row['test'], row['detail']) for row in failures))
        self.assertGreaterEqual(report['total'], 150, 'the runner did not finish')


class TestPortfolioIsWiredIntoThePage(unittest.TestCase):

    def test_the_ledger_loads_before_the_store_and_the_store_before_the_view(self):
        order = [HTML.index('/incisor-trading/js/' + name) for name in (
            'market-figures.js', 'portfolio-ledger.js', 'portfolio-store.js',
            'market-data.js', 'view-portfolio.js')]
        self.assertEqual(order[:3], sorted(order[:3]))
        self.assertLess(order[2], order[4])
        self.assertLess(order[3], order[4])
        self.assertLess(order[4], HTML.index('/incisor-trading/incisor.js'))

    def test_the_trade_panel_has_the_root_and_the_fallback(self):
        panel = trade_panel()
        self.assertEqual(panel.count('data-portfolio '), 1)
        self.assertEqual(panel.count('data-portfolio-fallback'), 1)


class TestTheServedPanelIsTrueBeforeAnyScriptRuns(unittest.TestCase):
    """DEC-072: the served Trade panel states no figure. It once shipped a
    balance nothing had computed, shaped exactly like the reader's own."""

    def test_it_prints_no_balance(self):
        visible = re.sub(r'<!--.*?-->', ' ', trade_panel(), flags=re.S)
        visible = re.sub(r'<[^>]*>', ' ', visible)
        self.assertNotRegex(visible, r'\$\d[\d,]*\.\d\d',
                            'the served Trade panel prints a dollar figure')

    def test_the_starting_balance_it_promises_is_the_one_the_ledger_starts_at(self):
        cents = int(re.search(r'var STARTING_CASH = (\d+);', LEDGER).group(1))
        self.assertIn('$%s' % format(cents // 100, ','), trade_panel())


class TestPortfolioStorageStaysSafe(unittest.TestCase):
    """Guide section 5, for the one store on the page holding weeks of work."""

    def test_the_store_writes_under_its_own_key(self):
        self.assertIn("var KEY = 'incisor.portfolio';", STORE)

    def test_the_store_only_ever_touches_its_own_key(self):
        """A store that removes or rewrites another key could take the
        watchlist with it."""
        for call in re.findall(r'storage\.(\w+)\((\w+)', STORE):
            self.assertEqual(call[1], 'KEY', 'storage.%s(%s)' % call)

    def test_nothing_it_reads_is_evaluated(self):
        for source in (LEDGER, STORE):
            self.assertNotIn('eval(', source)
            self.assertNotIn('new Function', source)

    def test_the_ledger_repeats_the_service_symbol_whitelist(self):
        self.assertIn(r"/^[A-Z][A-Z.\-]{0,9}$/", LEDGER)


class TestTheShotSeedsMatchTheStore(unittest.TestCase):
    """tools/shoot.py --portfolio writes blobs the store must read as meant.
    A seed at the wrong key or version is read as corrupt, and the shot of a
    portfolio holding positions would show a fresh $100,000 instead — which
    looks exactly like the seeding not working."""

    def setUp(self):
        sys.path.insert(0, os.path.join(PAGE_DIR, 'tools'))
        import shoot
        self.shoot = shoot

    def test_the_key_is_the_store_s(self):
        self.assertIn("var KEY = '%s';" % self.shoot.PORTFOLIO_KEY, STORE)

    def test_the_held_seed_is_at_the_current_version(self):
        version = int(re.search(r'var VERSION = (\d+);', STORE).group(1))
        held = json.loads(self.shoot.PORTFOLIO_SEEDS['held'])
        self.assertEqual(held['v'], version)
        self.assertTrue(held['ledger'])

    def test_the_newer_seed_is_newer(self):
        version = int(re.search(r'var VERSION = (\d+);', STORE).group(1))
        self.assertGreater(json.loads(self.shoot.PORTFOLIO_SEEDS['newer'])['v'], version)


if __name__ == '__main__':
    unittest.main()
