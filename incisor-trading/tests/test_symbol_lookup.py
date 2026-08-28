"""Runs symbol search and the quote panel, not just their markup.

`symbol_model.jxa.js` loads the four real modules into JavaScriptCore and
drives them: js/symbol-search.js and the figures added to js/market-figures.js
against hand-computed values, js/market-data.js against a fake fetch, and
js/view-symbol.js against a DOM stub driven by real keystrokes and clicks.

That is what covers the T7 acceptance criteria a headless session can reach —
results are keyboard-navigable, and an unknown symbol reaches a clean
not-found state rather than an error one. What it cannot cover is whether the
dropdown lands in the right place at 375px. tools/shoot.py does that, and the
screenshots are the evidence.

The rest of this file is about the served markup, because a correct module
that is never wired to the page is worth nothing — and because the stub in the
runner is built by hand, so something has to assert it still resembles the
page it stands in for.
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
RUNNER = os.path.join(HERE, 'symbol_model.jxa.js')

HTML = read('index.html')
PAGE = Page(HTML)


def quote_markup():
    """The served quote panel on its own, so assertions cannot drift onto the
    rest of the page. Entities are resolved first: an em dash is written
    `&mdash;` in the source and is the same character either way."""
    start = HTML.index('<div class="inc-quote"')
    return html.unescape(HTML[start:HTML.index('</section>', start)])


@unittest.skipUnless(shutil.which('osascript'), 'needs macOS JavaScriptCore')
class TestLookupBehaviour(unittest.TestCase):

    def test_search_and_the_quote_panel_are_correct_at_every_checked_case(self):
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


class TestLookupIsWiredIntoThePage(unittest.TestCase):

    def test_the_modules_load_before_the_view(self):
        for module in ('js/symbol-search.js', 'js/market-figures.js',
                       'js/market-data.js', 'js/dom.js'):
            self.assertIn('/incisor-trading/' + module, HTML, module)
            self.assertLess(HTML.index(module), HTML.index('js/view-symbol.js'))

    def test_the_page_has_every_hook_the_view_looks_for(self):
        for hook in ('data-search', 'data-search-input', 'data-search-results',
                     'data-search-hint', 'data-quote', 'data-quote-body',
                     'data-quote-message', 'data-quote-symbol', 'data-quote-name',
                     'data-quote-proxy', 'data-quote-price', 'data-quote-change',
                     'data-quote-arrow', 'data-quote-delta', 'data-quote-pct',
                     'data-range', 'data-range-track', 'data-range-marker',
                     'data-range-low', 'data-range-high', 'data-range-title',
                     'data-quote-provenance', 'data-quote-provenance-message'):
            self.assertIn(hook, HTML, hook)

    def test_every_figure_the_view_writes_has_somewhere_to_go(self):
        served = set(re.findall(r'data-figure="([a-z\-]+)"', HTML))
        self.assertEqual(
            served,
            {'open', 'previous', 'volume', 'average-volume', 'relative-volume',
             'market-cap', 'pe'})

    def test_there_are_exactly_two_ranges(self):
        ranges = [e['attrs']['data-range'] for e in PAGE.elements
                  if 'data-range' in e['attrs']]
        self.assertEqual(ranges, ['day', 'year'])


class TestComboboxWiring(unittest.TestCase):
    """The ARIA 1.2 combobox pattern. Getting this wrong does not look broken
    — it just leaves the control unusable by anyone not looking at it."""

    def setUp(self):
        self.input = next(e for e in PAGE.elements
                          if 'data-search-input' in e['attrs'])
        self.listbox = next(e for e in PAGE.elements
                            if 'data-search-results' in e['attrs'])

    def test_the_input_is_a_combobox(self):
        self.assertEqual(self.input['attrs'].get('role'), 'combobox')
        self.assertEqual(self.input['attrs'].get('aria-autocomplete'), 'list')

    def test_it_ships_collapsed_because_nothing_has_been_typed(self):
        self.assertEqual(self.input['attrs'].get('aria-expanded'), 'false')
        self.assertIn('hidden', self.listbox['attrs'])

    def test_the_input_points_at_the_listbox_it_controls(self):
        target = self.input['attrs'].get('aria-controls')
        self.assertEqual(target, self.listbox['attrs'].get('id'))
        self.assertEqual(self.listbox['attrs'].get('role'), 'listbox')

    def test_the_listbox_is_named_for_a_screen_reader(self):
        self.assertTrue(self.listbox['attrs'].get('aria-label'))

    def test_the_input_has_a_real_label(self):
        labels = [e for e in PAGE.with_tag('label')
                  if e['attrs'].get('for') == self.input['attrs'].get('id')]
        self.assertEqual(len(labels), 1, 'the search input has no label')

    def test_the_hint_is_announced_when_it_changes(self):
        """It carries the match count and the not-found wording, which is the
        only place either is said to someone not looking at the list."""
        hint = next(e for e in PAGE.elements if 'data-search-hint' in e['attrs'])
        self.assertEqual(hint['attrs'].get('role'), 'status')
        self.assertEqual(self.input['attrs'].get('aria-describedby'),
                         hint['attrs'].get('id'))

    def test_the_browser_does_not_autocomplete_over_the_listbox(self):
        self.assertEqual(self.input['attrs'].get('autocomplete'), 'off')


class TestTheServedPanelInventsNothing(unittest.TestCase):
    """The failure guide section 10 exists to prevent: a page showing numbers
    it did not fetch, which a reader has no way to tell from real ones."""

    def test_the_panel_ships_no_prices(self):
        found = re.findall(r'\d+\.\d\d', quote_markup())
        self.assertEqual(found, [], 'the served panel carries invented prices')

    def test_every_figure_starts_as_an_em_dash(self):
        for match in re.finditer(r'data-figure="[a-z\-]+">([^<]*)<', quote_markup()):
            self.assertEqual(match.group(1), '—')

    def test_every_range_end_starts_as_an_em_dash(self):
        for hook in ('data-range-low', 'data-range-high'):
            for match in re.finditer(hook + r'>([^<]*)<', quote_markup()):
                self.assertEqual(match.group(1), '—', hook)

    def test_the_panel_ships_in_its_empty_state(self):
        panel = next(e for e in PAGE.elements if 'data-quote' in e['attrs'])
        self.assertEqual(panel['attrs'].get('data-state'), 'empty')

    def test_the_body_ships_hidden_so_the_dashes_are_not_shown_as_data(self):
        body = next(e for e in PAGE.elements if 'data-quote-body' in e['attrs'])
        self.assertIn('hidden', body['attrs'])

    def test_the_panel_says_why_two_figures_are_permanently_dashes(self):
        """Market cap and P/E come from filings this page does not read. An
        unexplained em dash reads as a bug; an explained one reads as honest."""
        note = [e for e in PAGE.elements if 'inc-figures-note' in classes(e)]
        self.assertEqual(len(note), 1)


class TestSearchTelemetryHygiene(unittest.TestCase):
    """Guide section 5: no ticker may reach the beacon. beacon.js matches the
    nearest `button, a, [data-track]` ancestor of a click and falls back to its
    text, so a result row without a generic label overhead would report the
    ticker that was clicked."""

    def test_the_search_controls_carry_generic_labels(self):
        for hook in ('data-search-input', 'data-search-results'):
            element = next(e for e in PAGE.elements if hook in e['attrs'])
            label = element['attrs'].get('data-track')
            self.assertTrue(label, '%s has no data-track' % hook)
            self.assertIsNone(re.search(r'[\d$]', label), label)

    def test_no_data_track_on_the_page_names_a_symbol(self):
        labels = [e['attrs']['data-track'] for e in PAGE.elements
                  if e['attrs'].get('data-track')]
        for label in labels:
            self.assertRegex(label, r'^[a-z\-]+$', label)

    def test_the_options_the_view_builds_carry_no_label_of_their_own(self):
        """They sit inside the listbox, so its generic label is what a click
        reports. An option with its own would report the ticker instead."""
        source = read('js/view-symbol.js')
        self.assertNotIn('data-track', source)


if __name__ == '__main__':
    unittest.main()
