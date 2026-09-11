"""Runs the order book and the ticket, not just their markup.

`orders_model.jxa.js` loads js/portfolio-orders.js, the store and
js/view-ticket.js into JavaScriptCore with the real js/market-clock.js. It
checks T15's acceptance the way the task states it — an order placed against a
series fills at the next price after it was placed, never the one on screen —
across market and limit orders, orders placed mid-session and while the market
is closed, and a fill that the cash can no longer cover. The ticket is driven
through its real controls: typing, pressing, submitting, cancelling.

What it cannot see is how the ticket sits at 375px, which is tools/shoot.py's.
"""

import json
import os
import re
import shutil
import subprocess
import unittest

from page_model import PAGE_DIR, read

HERE = os.path.dirname(os.path.abspath(__file__))
RUNNER = os.path.join(HERE, 'orders_model.jxa.js')

HTML = read('index.html')
ORDERS = read('js/portfolio-orders.js')
TICKET = read('js/view-ticket.js')
ORDERS_VIEW = read('js/view-orders.js')
WATCHLIST = read('js/watchlist-store.js')


@unittest.skipUnless(shutil.which('osascript'), 'needs macOS JavaScriptCore')
class TestOrdersBehaviour(unittest.TestCase):

    def test_orders_are_correct_at_every_checked_case(self):
        completed = subprocess.run(
            ['osascript', '-l', 'JavaScript', RUNNER, PAGE_DIR],
            capture_output=True, text=True, timeout=60)

        self.assertEqual(completed.returncode, 0, completed.stderr)
        report = json.loads(completed.stdout)

        failures = [row for row in report['results'] if not row['pass']]
        self.assertEqual(
            failures, [],
            '\n'.join('%s - %s' % (row['test'], row['detail']) for row in failures))
        self.assertGreaterEqual(report['total'], 110, 'the runner did not finish')


class TestOrdersAreWiredIntoThePage(unittest.TestCase):

    def test_the_order_book_loads_between_the_ledger_and_the_store(self):
        order = [HTML.index('/incisor-trading/js/' + name) for name in (
            'portfolio-ledger.js', 'portfolio-orders.js', 'portfolio-store.js')]
        self.assertEqual(order, sorted(order))

    def test_the_views_load_after_the_modules_they_read(self):
        """Both read window.IncisorPortfolio once, at load, and the ticket
        reads the orders view's words the same way."""
        order = [HTML.index('/incisor-trading/js/' + name) for name in (
            'view-portfolio.js', 'view-orders.js', 'view-ticket.js')]
        self.assertEqual(order, sorted(order))
        self.assertLess(order[-1], HTML.index('/incisor-trading/incisor.js'))

    def test_the_trade_panel_has_a_mount_for_each(self):
        start = HTML.index('id="panel-trade"')
        panel = HTML[start:HTML.index('</section>', start)]
        self.assertEqual(panel.count('data-ticket'), 1)
        self.assertEqual(panel.count('data-orders'), 1)


class TestTheTicketKeepsTickersFromTheBeacon(unittest.TestCase):
    """Guide section 5: no ticker, quantity or amount may reach the beacon,
    and beacon.js falls back to a button's text when it has no data-track."""

    def test_every_button_either_view_builds_is_given_a_data_track(self):
        for source in (TICKET, ORDERS_VIEW):
            buttons = source.count("element('button'")
            self.assertGreater(buttons, 0)
            self.assertEqual(source.count("'data-track'"), buttons)

    def test_every_label_it_sets_is_generic(self):
        """Literal labels, plus the one built as 'order-' + a switch's name —
        which is generic only because every name handed to it is a fixed
        word. The runner also checks the built buttons themselves."""
        for label in re.findall(r"'data-track',\s*'([^']+)'", TICKET + ORDERS_VIEW):
            self.assertRegex(label, r'^order-([a-z]+)?$')
        for name in re.findall(r"segmented\('[^']*', '([^']*)'", TICKET):
            self.assertRegex(name, r'^[a-z]+$')


class TestTheSymbolLimitIsTheCallBudget(unittest.TestCase):
    """DEC-028's arithmetic, extended by one surface: four tiles, eight
    watched rows and the portfolio's symbols must leave room for lookups."""

    def test_a_full_watchlist_and_a_full_portfolio_leave_two_lookups(self):
        limit = int(re.search(r'var SYMBOL_LIMIT = (\d+);', ORDERS).group(1))
        watched = int(re.search(r'var LIMIT = (\d+);', WATCHLIST).group(1))
        budget, tiles, per_lookup = 22, 4, 2
        self.assertGreaterEqual(budget - tiles - watched - limit, 2 * per_lookup)


if __name__ == '__main__':
    unittest.main()
