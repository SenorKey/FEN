"""Runs the watchlist, not just its markup.

`watchlist_model.jxa.js` loads js/watchlist-store.js and js/view-watchlist.js
into JavaScriptCore and drives them: the store against storage stubs that hold
nonsense, throw on every access, or refuse every write, and the view against a
DOM stub driven by real clicks on the sort headers, the remove buttons and the
Watch toggle. That covers the T9 acceptance criteria a headless session can
reach — the list survives a reload, a cleared or blocked localStorage never
throws, and the cap holds.

What it cannot cover is whether the table reads well at 375px, or whether a
four-column layout survives a phone. tools/shoot.py does that, and the
screenshots are the evidence.

The rest of this file is about the served markup, because a correct module
that is never wired to the page is worth nothing — and because the runner
builds its own markup from the contract the view documents, which would keep
passing if the page stopped carrying it.
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
RUNNER = os.path.join(HERE, 'watchlist_model.jxa.js')

HTML = read('index.html')
PAGE = Page(HTML)
STORE = read('js/watchlist-store.js')


def watchlist_markup():
    """The watchlist section on its own, so assertions cannot drift onto the
    rest of the page."""
    start = HTML.index('<section class="inc-watchlist"')
    return html.unescape(HTML[start:HTML.index('</section>', start)])


@unittest.skipUnless(shutil.which('osascript'), 'needs macOS JavaScriptCore')
class TestWatchlistBehaviour(unittest.TestCase):

    def test_the_watchlist_is_correct_at_every_checked_case(self):
        completed = subprocess.run(
            ['osascript', '-l', 'JavaScript', RUNNER, PAGE_DIR],
            capture_output=True, text=True, timeout=60)

        self.assertEqual(completed.returncode, 0, completed.stderr)
        report = json.loads(completed.stdout)

        failures = [row for row in report['results'] if not row['pass']]
        self.assertEqual(
            failures, [],
            '\n'.join('%s - %s' % (row['test'], row['detail']) for row in failures))
        self.assertGreaterEqual(report['total'], 90, 'the runner did not finish')


class TestWatchlistIsWiredIntoThePage(unittest.TestCase):

    def test_the_modules_load_before_the_shell(self):
        for module in ('js/watchlist-store.js', 'js/view-watchlist.js'):
            self.assertIn('/incisor-trading/' + module, HTML, module)
            self.assertLess(HTML.index(module),
                            HTML.index('/incisor-trading/incisor.js'))

    def test_the_store_is_defined_before_the_view_that_reads_it(self):
        self.assertLess(HTML.index('js/watchlist-store.js'),
                        HTML.index('js/view-watchlist.js'))

    def test_the_quote_panel_hands_its_symbol_over_after_the_watchlist_exists(self):
        """js/view-symbol.js reads window.IncisorWatchlist at load, the same
        way it reads the chart's. A view that runs first sees undefined and
        the toggle silently never appears."""
        self.assertLess(HTML.index('js/view-watchlist.js'),
                        HTML.index('js/view-symbol.js'))
        self.assertIn('IncisorWatchlist', read('js/view-symbol.js'))

    def test_the_page_has_the_hooks_the_view_looks_for(self):
        for hook in ('data-watchlist', 'data-watchlist-rows',
                     'data-watchlist-sort', 'data-watchlist-column',
                     'data-watchlist-count', 'data-watchlist-notice',
                     'data-watchlist-provenance',
                     'data-watchlist-provenance-message',
                     'data-watch', 'data-watch-toggle',
                     'data-watch-toggle-label', 'data-watch-note'):
            self.assertIn(hook, HTML, hook)

    def test_every_sort_key_the_store_accepts_has_a_column(self):
        """The runner builds its own headers from the contract, so it would
        keep passing if the page dropped one. This is what notices."""
        keys = re.search(r"var SORT_KEYS = \[([^\]]*)\]", STORE).group(1)
        wanted = set(re.findall(r"'([a-z]+)'", keys))
        offered = {element['attrs']['data-watchlist-sort']
                   for element in PAGE.elements
                   if 'data-watchlist-sort' in element['attrs']}
        self.assertEqual(offered, wanted)

    def test_the_sort_controls_are_real_buttons_inside_their_header_cells(self):
        for element in PAGE.elements:
            if 'data-watchlist-sort' not in element['attrs']:
                continue
            self.assertEqual(element['tag'], 'button')
            self.assertEqual(element['attrs'].get('type'), 'button')
            column = PAGE.ancestors(element)[0]
            self.assertEqual(column['tag'], 'th')
            self.assertIn('data-watchlist-column', column['attrs'])
            # aria-sort belongs on the column, not on the control that
            # changes it: it describes the thing that is sorted.
            self.assertIn(column['attrs'].get('aria-sort'),
                          ('ascending', 'descending', 'none'))

    def test_exactly_one_column_starts_sorted(self):
        sorted_columns = [e for e in PAGE.elements
                          if 'data-watchlist-column' in e['attrs']
                          and e['attrs'].get('aria-sort') != 'none']
        self.assertEqual(len(sorted_columns), 1)


class TestTheServedWatchlistIsTrueBeforeAnyScriptRuns(unittest.TestCase):
    """The same rule the tiles and the provenance line follow: what ships has
    to be correct for a visitor whose JavaScript never runs."""

    def test_it_ships_empty_and_says_so(self):
        panel = [e for e in PAGE.elements if 'data-watchlist' in e['attrs']]
        self.assertEqual(len(panel), 1)
        self.assertEqual(panel[0]['attrs'].get('data-state'), 'empty')
        self.assertIn('Nothing here yet', watchlist_markup())

    def test_it_ships_no_rows(self):
        body = [e for e in PAGE.elements if 'data-watchlist-rows' in e['attrs']]
        self.assertEqual(len(body), 1)
        self.assertEqual(PAGE.descendants(body[0]), [])

    def test_it_invents_no_prices(self):
        self.assertEqual(re.findall(r'\d+\.\d\d', watchlist_markup()), [])

    def test_the_toggle_and_the_notice_ship_hidden(self):
        for hook in ('data-watch', 'data-watch-note', 'data-watchlist-notice',
                     'data-watchlist-provenance'):
            found = [e for e in PAGE.elements if hook in e['attrs']]
            self.assertEqual(len(found), 1, hook)
            self.assertIn('hidden', found[0]['attrs'], hook)

    def test_the_cap_the_page_promises_is_the_cap_the_store_enforces(self):
        """The section says the list holds eight. A number written into copy
        and a number written into code are two sources of truth, and this is
        the only thing that would notice them disagreeing."""
        limit = int(re.search(r'var LIMIT = (\d+);', STORE).group(1))
        words = {4: 'four', 6: 'six', 8: 'eight', 10: 'ten', 12: 'twelve'}
        self.assertIn(words.get(limit, str(limit)), watchlist_markup())


class TestWatchlistAccessibility(unittest.TestCase):

    def test_the_toggle_describes_itself_with_the_note_that_refuses(self):
        """A full list makes the button aria-disabled rather than disabled, so
        a keyboard reader reaches it — which is only worth anything if the
        reason travels with it."""
        toggle = [e for e in PAGE.elements if 'data-watch-toggle' in e['attrs']][0]
        described = toggle['attrs'].get('aria-describedby')
        self.assertTrue(described)
        self.assertIn(described, PAGE.by_id)
        self.assertIn('data-watch-note', PAGE.by_id[described]['attrs'])

    def test_the_star_is_decorative(self):
        """It repeats what the label says. Read aloud beside "Watching" it is
        noise, and it is never the only signal of the pressed state."""
        for element in PAGE.elements:
            if 'inc-watch-mark' in classes(element):
                self.assertEqual(element['attrs'].get('aria-hidden'), 'true')

    def test_the_change_column_names_the_window_it_covers(self):
        """Every coloured figure on this page names its period (DECISIONS.md).
        In a table the header does it once for the column, rather than every
        row repeating a token — but it still has to be said in both channels,
        because "1d" read aloud is "one d"."""
        column = [e for e in PAGE.elements
                  if e['attrs'].get('data-watchlist-sort') == 'change'][0]
        markup = html.unescape(HTML[column['line'] - 1:])
        markup = markup[:markup.index('</th>')]
        self.assertIn('inc-period', markup)
        self.assertIn('over the last session', markup)

    def test_the_table_has_a_caption_for_a_screen_reader(self):
        captions = [e for e in PAGE.elements if e['tag'] == 'caption']
        self.assertEqual(len(captions), 1)
        self.assertIn('inc-offscreen', classes(captions[0]))

    def test_the_notice_is_announced_when_it_appears(self):
        """It only ever appears because something was lost, and a reader who
        is not looking at that corner of the page should still hear it."""
        notice = [e for e in PAGE.elements
                  if 'data-watchlist-notice' in e['attrs']][0]
        self.assertEqual(notice['attrs'].get('role'), 'status')


class TestWatchlistStaysWithinItsBudget(unittest.TestCase):
    """Guide section 10 and the 22-a-day ceiling. The cap is not a style
    choice — it is the number of upstream calls this surface may cost."""

    def test_the_cap_leaves_room_for_the_strip_and_a_few_lookups(self):
        limit = int(re.search(r'var LIMIT = (\d+);', STORE).group(1))
        tiles = len([e for e in PAGE.elements if 'data-tile' in e['attrs']])
        # Four tiles, one call each; every watched symbol one more; a lookup
        # is two. Anything that leaves fewer than two lookups in the day has
        # taken the budget away from the surface it feeds.
        self.assertLessEqual(tiles + limit + 4, 22)

    def test_the_watchlist_asks_for_daily_bars_and_never_for_a_quote(self):
        """A daily series carries its own latest quote, so a row costs one
        call and not two. Asking for both would double this surface's share
        of the budget to learn what it had already been told."""
        view = read('js/view-watchlist.js')
        self.assertIn('data.history(', view)
        self.assertNotIn('data.quote(', view)


if __name__ == '__main__':
    unittest.main()
