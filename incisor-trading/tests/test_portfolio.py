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
STYLES = read('css/portfolio.css')
STORE = read('js/portfolio-store.js')


def newest_fixture_close(symbol):
    """The last close the fixture layer serves for a symbol.

    The newest date for a symbol wins, which is the rule the fixtures README
    states and `source.py` implements, so a refreshed capture is picked up
    here the same way the page picks it up."""
    directory = os.path.join(PAGE_DIR, 'server', 'fixtures',
                             'time-series-daily')
    captures = sorted(name for name in os.listdir(directory)
                      if name.startswith(symbol + '-'))
    with open(os.path.join(directory, captures[-1]), encoding='utf-8') as handle:
        series = json.load(handle)['Time Series (Daily)']
    return float(series[max(series)]['4. close'])


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


class TestTheFiguresFitTheTracksTheyAreGiven(unittest.TestCase):
    """Every figure in this card is `white-space: nowrap`, so a track narrower
    than the figure in it is not a wrapped number — it is a number printed
    over the rule beside it, and at the narrowest width it pushed the body
    sideways. The track count therefore steps down twice, at the widths where
    the longest figure the surface can show stops clearing its track.

    What made it invisible for as long as the surface shipped: the sample the
    checks ran against held three-figure gains, and the surface has to fit six
    (DEC-113)."""

    def narrow_block(self, start):
        """One media query's body, so a rule cannot be matched in another."""
        block = STYLES[STYLES.index(start):]
        return block[:block.index('\n}\n')]

    def test_the_track_count_steps_down_twice(self):
        four = STYLES[:STYLES.index('@media')]
        self.assertIn('grid-template-columns: repeat(4, minmax(0, 1fr));', four)

        two = self.narrow_block('@media (max-width: 830px)')
        self.assertIn('grid-template-columns: repeat(2, minmax(0, 1fr));', two)

        one = self.narrow_block('@media (max-width: 389px)')
        self.assertIn('grid-template-columns: minmax(0, 1fr);', one)

    def test_the_single_column_rule_is_the_later_of_the_two_that_match(self):
        """Below 389px both queries match and both set the same properties at
        the same specificity, so the only thing deciding the outcome is source
        order. Asserted as a pair, because either rule alone reads as correct
        and the one that loses is the one nothing shows (DEC-065)."""
        self.assertLess(STYLES.index('@media (max-width: 830px)'),
                        STYLES.index('@media (max-width: 389px)'))

    def test_the_single_column_block_undoes_both_rules_the_two_drew(self):
        """Two across draws a left rule on the right-hand cell and a top rule
        on the lower pair. One across has neither column nor pair, so both
        have to be withdrawn or the card keeps the lines of a grid it is no
        longer in."""
        two = self.narrow_block('@media (max-width: 830px)')
        self.assertIn('.inc-folio-part:nth-child(odd)', two)
        self.assertIn('.inc-folio-part:nth-child(n + 4)', two)

        one = self.narrow_block('@media (max-width: 389px)')
        self.assertIn('border-left: 0;',
                      one[one.index('.inc-folio-part:nth-child(odd)'):],
                      'the column rule goes with the column')
        self.assertIn('.inc-folio-part + .inc-folio-part', one)

    def test_the_change_row_may_use_a_second_line(self):
        """The headline's change is arrow, amount and period, each its own
        flex item and every one of them nowrap. Without a wrap the row is as
        wide as its longest possible reading, and "since start" was printed
        outside the card on a phone — the figure's window leaving the box the
        figure is in (DEC-020)."""
        rule = STYLES[STYLES.index('.inc-folio-change {'):]
        rule = rule[:rule.index('}')]
        self.assertIn('flex-wrap: wrap;', rule)
        self.assertIn('display: flex;', rule)


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

    def test_the_narrow_pass_seeds_the_widest_figures_it_can_be_asked_to_fit(self):
        """The 320px pass measures each figure against its own box, and what
        it proves is only as wide as the figures it seeded. It ran against
        `held` — three-figure gains — for as long as it existed, and a
        five-figure gain pushed the body sideways at that width the whole
        time (DEC-113).

        The gain is derived from the committed fixture the page itself is
        priced from rather than written down here, so a refreshed fixture
        moves both together. Six figures is the stated ceiling: with the
        arrow and the sign it is the twelve characters the tracks are sized
        for."""
        name = self.shoot.NARROW_PORTFOLIO
        self.assertIn(name, self.shoot.PORTFOLIO_SEEDS)
        seed = json.loads(self.shoot.PORTFOLIO_SEEDS[name])

        # One buy and no sells, so the gain is arithmetic on a single row and
        # this test needs no second copy of the ledger's rules (DEC-082).
        self.assertEqual(
            len(seed['ledger']), 1,
            'the narrow pass must name a seed this test can price without a '
            'second copy of the ledger: one buy, no sells. %r has %d rows'
            % (name, len(seed['ledger'])))
        row = seed['ledger'][0]
        self.assertEqual(row['kind'], 'buy')
        self.assertEqual(seed.get('orders'), [])

        close = newest_fixture_close(row['symbol'])
        gain = row['shares'] * (close - row['price'])
        self.assertGreaterEqual(
            round(gain), 100000,
            'the narrow pass has to be seeded with a six-figure gain, and '
            '%r yields $%.2f' % (name, gain))


if __name__ == '__main__':
    unittest.main()
