"""Runs the reporting calendar, not just its markup.

`reports_model.jxa.js` loads js/market-figures.js, js/market-data.js and
js/view-reports.js into JavaScriptCore and drives them: the reader against
payloads with a calendar, without one, and with reports but no projection;
and the view against a DOM stub.

Most of what it asserts there is **wording**, which is unusual for a runner
and is the point of this surface. Every other panel on this page states a
figure that was filed. This one states a window that was worked out here, from
the company's own filing history, and a date on a page is read as a date the
company gave. So the tests check that the projection says it is projected,
that its arithmetic is shown beside it, and that a quarter with nothing behind
it shows an em dash rather than a zero — three ways of being wrong that a
screenshot cannot tell from being right.

The rest of this file is about the served markup and the house rules, because
a correct module that is never wired to the page is worth nothing, and because
the runner builds its own markup from the contract the view documents, which
would keep passing if the page stopped carrying it.

    python3 -m unittest discover incisor-trading/tests
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
RUNNER = os.path.join(HERE, 'reports_model.jxa.js')

HTML = read('index.html')
PAGE = Page(HTML)
VIEW = read('js/view-reports.js')
STYLES = read('css/reports.css')
READER = read('js/market-data.js')


def surface_markup():
    """The reporting calendar on its own, so assertions cannot drift onto the
    rest of the page."""
    start = HTML.index('<section class="inc-reports"')
    return html.unescape(HTML[start:HTML.index('</section>', start)])


@unittest.skipUnless(shutil.which('osascript'), 'needs macOS JavaScriptCore')
class TestCalendarBehaviour(unittest.TestCase):

    def test_the_surface_is_correct_at_every_checked_case(self):
        completed = subprocess.run(
            ['osascript', '-l', 'JavaScript', RUNNER, PAGE_DIR],
            capture_output=True, text=True, timeout=60)

        self.assertEqual(completed.returncode, 0, completed.stderr)
        report = json.loads(completed.stdout)

        failures = [row for row in report['results'] if not row['pass']]
        self.assertEqual(
            failures, [],
            '\n'.join('%s - %s' % (row['test'], row['detail'])
                      for row in failures))
        self.assertGreater(report['total'], 40, 'the runner stopped early')


class TestTheServedMarkup(unittest.TestCase):
    """The contract js/view-reports.js documents, on the real page."""

    def test_it_ships_with_a_state_the_view_can_replace(self):
        found = [e for e in PAGE.elements if 'data-reports' in e['attrs']]
        self.assertEqual(len(found), 1, 'the page carries no reporting calendar')
        self.assertEqual(found[0]['attrs'].get('data-state'), 'empty')

    def test_the_container_is_singular_so_the_length_rule_can_see_it(self):
        """`data-reports` holding `data-reports-*` hooks. A plural container
        over singular hooks matches none of them and the surface goes
        unmeasured in silence — the trap DECISIONS.md records against
        `[data-sectors]`."""
        markup = surface_markup()
        self.assertIn('data-reports ', markup)
        self.assertGreater(len(re.findall(r'data-reports-[a-z]+', markup)), 3)

    def test_the_table_body_the_view_fills_is_there(self):
        self.assertIn('data-reports-rows', surface_markup())

    def test_the_figures_the_view_writes_have_slots_to_write_into(self):
        names = set(re.findall(r'data-reports-figure="([a-z]+)"',
                               surface_markup()))
        self.assertEqual(names, {'last', 'next'})
        notes = set(re.findall(r'data-reports-note="([a-z]+)"',
                               surface_markup()))
        self.assertEqual(notes, names,
                         'every figure here carries the basis it was drawn '
                         'from, so the slots come in pairs')

    def test_the_empty_state_is_a_sentence_and_not_a_blank(self):
        message = [e for e in PAGE.elements
                   if 'data-reports-message' in e['attrs']]
        self.assertEqual(len(message), 1)
        self.assertEqual(message[0]['attrs'].get('role'), 'status',
                         'the state changes without the reader looking at it')

    def test_the_word_projected_ships_in_the_document(self):
        """Not written by the script.

        The distinction this surface turns on is whether a date was filed or
        worked out here, and the served markup states it before any script
        runs — so a reader whose JavaScript failed and who sees the heading
        and the copy is not left with a date and no qualifier. The note under
        the figure repeats the arithmetic; this is the label."""
        self.assertIn('projected', surface_markup())

    def test_what_a_filing_does_not_carry_is_page_copy(self):
        """The ex-dividend date is the thing a reader is most likely to
        assume this table holds. Said in the document, like the filings
        panel's explanations, rather than assembled by a script."""
        markup = surface_markup()
        self.assertIn('ex-dividend', markup)
        self.assertIn('declared', markup)


class TestTheSurfaceMeetsTheHouseRules(unittest.TestCase):

    def test_the_only_coloured_figure_names_its_window(self):
        """Every figure carrying direction colour names the period it covers.
        In a table the header does it once for the column rather than every
        row repeating a token — the watchlist settled that — but it still has
        to be said in both channels, because "1y" read aloud is "one y"."""
        markup = surface_markup()
        column = markup[markup.index('>Change'):]
        column = column[:column.index('</th>')]
        self.assertIn('inc-period', column)
        self.assertIn('a year earlier', column)

    def test_direction_is_never_carried_by_colour_alone(self):
        """An arrow and an explicit sign travel with the colour, so the change
        survives greyscale and colour blindness."""
        self.assertIn('arrowFor', VIEW)
        self.assertIn('formatPercent', VIEW)
        self.assertIn('setDirection', VIEW)

    def test_the_table_scrolls_inside_its_own_box(self):
        """Five columns at any width. The body never scrolls sideways, and
        the scroller is positioned so that is true of the whole box and not
        only its visible half."""
        rule = STYLES[STYLES.index('.inc-reports-scroll {'):]
        rule = rule[:rule.index('}')]
        self.assertIn('overflow-x: auto', rule)
        self.assertIn('position: relative', rule)

    def test_nothing_here_reaches_the_beacon_with_a_ticker(self):
        """There is no control on this surface at all, which is the simplest
        way to satisfy guide section 5 — asserted rather than assumed, since
        a sort button would be an easy thing to add later without noticing
        that its label would be a date or a figure."""
        markup = surface_markup()
        self.assertNotIn('<button', markup)
        self.assertNotIn('data-track', markup)

    def test_the_hidden_body_cannot_be_defeated_by_an_author_rule(self):
        """A `display` rule silently beats `[hidden]` and no DOM test sees it.
        Recorded in DECISIONS.md as a trap that has bitten twice."""
        self.assertIn('.inc-reports-body[hidden]', STYLES)
        self.assertIn('display: none !important', STYLES)

    def test_the_surface_says_where_its_figures_came_from(self):
        line = [e for e in PAGE.elements
                if 'data-reports-provenance' in e['attrs']]
        self.assertEqual(len(line), 1)
        self.assertIn('inc-provenance', classes(line[0]))
        self.assertIn('fixture', VIEW,
                      'in fixture mode these dates are invented and the '
                      'surface has to say so')


class TestWhatThisSurfaceCosts(unittest.TestCase):
    """Nothing, which is the reason it could be added at all."""

    def test_it_makes_no_request_of_its_own_route(self):
        """It reads GET /fundamentals, the response the filings panel already
        pays for. A route of its own would be a second call for a question
        the answer in hand already contains."""
        self.assertNotIn("'/reporting", VIEW)
        self.assertIn('data.fundamentals', VIEW)

    def test_two_surfaces_reading_one_response_make_one_request(self):
        """Both views are started in the same tick by js/view-symbol.js, so
        the sharing has to happen at the seam that owns the network rather
        than in either view."""
        self.assertIn('inFlight', READER)

    def test_the_lookup_drives_both_surfaces(self):
        driver = read('js/view-symbol.js')
        self.assertIn('IncisorReports', driver)
        self.assertIn('reports.show(symbol)', driver)
        self.assertIn('reports.reset()', driver)
