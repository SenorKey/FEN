"""Runs the index summary strip, not just its markup.

`strip_model.jxa.js` loads the three real modules into JavaScriptCore and
drives them: js/market-figures.js against hand-computed values, js/market-data.js
against a fake fetch, and the view in incisor.js against a DOM stub. That covers
the T6 acceptance criteria a headless session can reach — the tiles fill from a
payload, a fall is never signalled by colour alone, and the strip degrades to a
stated "unavailable" rather than a blank grid when the service does not answer.

What it cannot cover is whether the result looks right at 375px. tools/shoot.py
does that, and the screenshots are the evidence.

The rest of this file is about the served markup, because a correct module that
is never wired to the page is worth nothing.
"""

import html
import json
import os
import re
import shutil
import subprocess
import unittest

from page_model import PAGE_DIR, Page, classes, read

HERE = os.path.dirname(os.path.abspath(__file__))
RUNNER = os.path.join(HERE, 'strip_model.jxa.js')

HTML = read('index.html')
PAGE = Page(HTML)
PROXIES = ('SPY', 'QQQ', 'DIA', 'IWM')


def tile_markup():
    """The served tile grid on its own, so assertions cannot drift onto the
    rest of the page. Entities are resolved first: an em dash is written
    `&mdash;` in the source and is the same character either way."""
    start = HTML.index('<ul class="inc-tile-grid"')
    return html.unescape(HTML[start:HTML.index('</ul>', start)])


@unittest.skipUnless(shutil.which('osascript'), 'needs macOS JavaScriptCore')
class TestStripBehaviour(unittest.TestCase):

    def test_the_strip_is_correct_at_every_checked_case(self):
        completed = subprocess.run(
            ['osascript', '-l', 'JavaScript', RUNNER, PAGE_DIR],
            capture_output=True, text=True, timeout=60)

        self.assertEqual(completed.returncode, 0, completed.stderr)
        report = json.loads(completed.stdout)

        failures = [row for row in report['results'] if not row['pass']]
        self.assertEqual(
            failures, [],
            '\n'.join('%s - %s' % (row['test'], row['detail']) for row in failures))
        self.assertGreaterEqual(report['total'], 100, 'the runner did not finish')


class TestStripIsWiredIntoThePage(unittest.TestCase):

    def test_the_modules_load_before_the_shell(self):
        for module in ('js/market-figures.js', 'js/market-data.js'):
            self.assertIn('/incisor-trading/' + module, HTML, module)
            self.assertLess(HTML.index(module),
                            HTML.index('/incisor-trading/incisor.js'))

    def test_the_strip_has_the_hooks_the_shell_looks_for(self):
        for hook in ('data-index-strip', 'data-tile', 'data-tile-price',
                     'data-tile-delta', 'data-tile-pct', 'data-tile-arrow',
                     'data-tile-change', 'data-tile-spark', 'data-provenance',
                     'data-provenance-message'):
            self.assertIn(hook, HTML, hook)

    def test_the_four_proxies_are_the_ones_the_guide_names(self):
        symbols = [element['attrs']['data-tile'] for element in PAGE.elements
                   if 'data-tile' in element['attrs']]
        self.assertEqual(tuple(symbols), PROXIES)

    def test_every_tile_reserves_a_sparkline(self):
        sparks = [e for e in PAGE.elements if 'data-tile-spark' in e['attrs']]
        self.assertEqual(len(sparks), len(PROXIES))
        for spark in sparks:
            self.assertEqual(spark['tag'], 'svg')
            # Without a viewBox the box has no coordinate system and the drawn
            # path lands somewhere unrelated to the tile.
            self.assertIn('viewbox', spark['attrs'])
            self.assertEqual(spark['attrs'].get('role'), 'img')
            self.assertTrue(spark['attrs'].get('aria-label'))


class TestTheServedPageInventsNothing(unittest.TestCase):
    """The failure guide section 10 exists to prevent: a page showing numbers
    it did not fetch, which a reader has no way to tell from real ones."""

    def test_no_tile_ships_a_price(self):
        found = re.findall(r'\d+\.\d\d', tile_markup())
        self.assertEqual(found, [], 'the served markup carries invented prices')

    def test_every_tile_figure_starts_as_an_em_dash(self):
        for hook in ('data-tile-price', 'data-tile-delta', 'data-tile-pct'):
            for match in re.finditer(hook + r'>([^<]*)<', tile_markup()):
                self.assertEqual(match.group(1), '—', hook)

    def test_the_served_provenance_line_is_true_without_javascript(self):
        """If the script never runs, nothing has loaded — and the line has to
        keep saying that rather than describing data that never arrived."""
        line = HTML[HTML.index('<p class="inc-provenance"'):]
        line = line[:line.index('</p>')]
        self.assertIn('Sample data', line)
        self.assertIn('loaded yet', line)

    def test_the_provenance_line_is_announced_when_it_changes(self):
        """Unlike the clock, this is written a handful of times, not once a
        second, and 'market data unavailable' is worth hearing."""
        line = HTML[HTML.index('<p class="inc-provenance"'):]
        self.assertIn('role="status"', line[:line.index('>') + 1])


class TestStripAccessibility(unittest.TestCase):

    def test_the_tile_arrow_is_hidden_from_screen_readers(self):
        """It is a redundant glyph beside a signed number; read aloud it is
        noise. The sign and the sparkline's own label carry the meaning."""
        for element in PAGE.elements:
            if 'data-tile-arrow' in element['attrs']:
                self.assertEqual(element['attrs'].get('aria-hidden'), 'true')

    def test_the_thirty_day_label_is_decorative(self):
        for element in PAGE.elements:
            if 'inc-spark-label' in classes(element):
                self.assertEqual(element['attrs'].get('aria-hidden'), 'true')


if __name__ == '__main__':
    unittest.main()
