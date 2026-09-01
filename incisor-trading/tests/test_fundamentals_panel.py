"""Runs the fundamentals panel, not just its markup.

`fundamentals_model.jxa.js` loads js/market-figures.js, js/market-data.js and
js/view-fundamentals.js into JavaScriptCore and drives them: the three figures
the browser derives against hand-computed numbers, the reader against payloads
where one half or the other is missing, and the view against a DOM stub driven
by a real click on the explain button.

The derived figures get the most attention there. Market cap, P/E and dividend
yield are each a filing over a price, and a ratio worked out against the wrong
price looks exactly like one worked out against the right one — which is the
whole reason they are computed beside the price the reader can see rather than
on the server.

What it cannot cover is whether ten figures read as a panel at 375px, or
whether the explanations are legible once opened. tools/shoot.py does that,
and the screenshots are the evidence.

The rest of this file is about the served markup, because a correct module
that is never wired to the page is worth nothing — and because the runner
builds its own markup from the contract the view documents, which would keep
passing if the page stopped carrying it.

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


def css_rules(stylesheet):
    """(selector, declarations) for every innermost block. Comments removed
    first, so a rule is never matched out of one that describes it."""
    stripped = re.sub(r'/\*.*?\*/', ' ', stylesheet, flags=re.S)
    return re.findall(r'([^{}]+)\{([^{}]*)\}', stripped)

HERE = os.path.dirname(os.path.abspath(__file__))
RUNNER = os.path.join(HERE, 'fundamentals_model.jxa.js')

HTML = read('index.html')
PAGE = Page(HTML)
VIEW = read('js/view-fundamentals.js')
STYLES = read('css/fundamentals.css')


def panel_markup():
    """The fundamentals panel on its own, so assertions cannot drift onto the
    rest of the page."""
    start = HTML.index('<section class="inc-fundamental"')
    return html.unescape(HTML[start:HTML.index('</section>', start)])


def figure_names():
    return re.findall(r'data-fundamental-figure="([a-z\-]+)"', panel_markup())


@unittest.skipUnless(shutil.which('osascript'), 'needs macOS JavaScriptCore')
class TestPanelBehaviour(unittest.TestCase):

    def test_the_panel_is_correct_at_every_checked_case(self):
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
        self.assertGreater(report['total'], 50, 'the runner stopped early')


class TestTheServedMarkup(unittest.TestCase):
    """The contract js/view-fundamentals.js documents, on the real page."""

    def test_the_panel_ships_with_a_state_the_view_can_replace(self):
        panels = [e for e in PAGE.elements if 'data-fundamental' in e['attrs']]
        self.assertEqual(len(panels), 1, 'the page carries no filings panel')
        self.assertEqual(panels[0]['attrs'].get('data-state'), 'empty')

    def test_the_container_is_singular_so_the_length_rule_can_see_it(self):
        """The trap T10a found and named as waiting to happen here.

        The per-surface rule pairs a block with hooks beginning with the
        block's own attribute. A [data-fundamentals] holding ten
        data-fundamental-* hooks would match none of them on a plural s, and
        the surface would go unmeasured from the day it shipped — silently,
        because a derived rule looks complete by construction.
        """
        self.assertNotIn('data-fundamentals', HTML)
        measured = dict(PAGE.surfaces())
        self.assertIn('data-fundamental', measured)
        self.assertGreater(measured['data-fundamental'], 0)

    def test_the_figure_list_ships_hidden_so_the_dashes_are_not_shown_as_data(self):
        body = next(e for e in PAGE.elements
                    if 'data-fundamental-body' in e['attrs'])
        self.assertIn('hidden', body['attrs'])

    def test_every_figure_the_view_writes_has_somewhere_to_go(self):
        """Derived from the view's own setFigure calls rather than written
        out, so a figure added there fails here instead of writing into
        nothing."""
        written = set(re.findall(r"setFigure\('([a-z\-]+)'", VIEW))
        self.assertEqual(written, set(figure_names()))

    def test_the_page_carries_the_whole_standard_set(self):
        self.assertEqual(
            set(figure_names()),
            {'market-cap', 'pe', 'eps', 'dividend-yield', 'beta', 'shares',
             'revenue', 'gross-margin', 'operating-margin', 'net-margin'})

    def test_every_figure_has_a_definition_beside_it(self):
        """T11's acceptance criterion, and the reason the panel exists rather
        than being ten more rows on the quote card. Counted per figure and not
        as a total: a page-wide count stops being a rule the moment a second
        surface grows an explanation."""
        markup = panel_markup()
        rows = re.findall(
            r'<dd class="inc-figure-value">(.*?)</dd>', markup, re.S)
        self.assertEqual(len(rows), 10)
        for row in rows:
            name = re.search(r'data-fundamental-figure="([a-z\-]+)"', row)
            self.assertIn('inc-figure-note', row, name and name.group(1))

    def test_the_definitions_are_page_copy_and_not_assembled_by_a_script(self):
        """What this panel teaches is in the served document. A script that
        wrote the sentences would mean the explanations existed only where
        JavaScript ran, on the one surface whose whole point is explaining."""
        self.assertNotIn('inc-figure-note', VIEW)
        # Whitespace-collapsed: the sentences wrap across lines in the
        # markup, and a substring check over the raw source would be
        # asserting where the line breaks fall rather than what it says.
        copy = ' '.join(panel_markup().split())
        self.assertIn('What the whole company costs at today', copy)
        self.assertIn('How far this moved on an average day', copy)

    def test_the_panel_carries_its_own_provenance_line(self):
        """Guide section 10, and it cannot borrow the quote card's: these
        numbers come from a different upstream at a different cadence, and one
        surface speaking for another's data is what the watchlist audit
        declined to do."""
        self.assertIn('data-fundamental-provenance', panel_markup())

    def test_the_served_message_is_true_before_the_script_runs(self):
        found = [e for e in PAGE.elements
                 if 'data-fundamental-message' in e['attrs']]
        self.assertEqual(len(found), 1)
        self.assertIn('Look up a symbol above', panel_markup())

    def test_the_heading_is_true_of_a_fund_as_well_as_a_company(self):
        """Fifteen of the seventeen symbols this build serves are funds.

        A heading reading "the company behind XLK" sat directly above a
        sentence explaining that XLK is not a company — the surface
        contradicting itself in the state it is in most of the time. Found in
        a screenshot rather than in a test, like every other one of these.
        """
        # Comments stripped first. The markup explains this change in prose
        # that necessarily quotes the wording being forbidden, and a
        # substring check over the raw source reads the explanation as the
        # thing it explains — the recurring trap, met twice while writing
        # this file alone.
        markup = re.sub(r'<!--.*?-->', ' ', panel_markup(), flags=re.S)
        heading = ' '.join(markup[:markup.index('</h4>')].split())
        self.assertNotIn('company behind', heading)
        self.assertIn('Beyond the price', heading)

    def test_the_served_heading_names_no_symbol_it_does_not_have(self):
        """The chart's rule, on the surface beneath it: a head naming the
        last symbol over a panel that no longer holds it is worse than a head
        naming none."""
        slot = next(e for e in PAGE.elements
                    if 'data-fundamental-symbol' in e['attrs'])
        self.assertIn('hidden', slot['attrs'])
        self.assertIn('nameSymbol(null)', VIEW)


class TestTheSurfaceMeetsTheHouseRules(unittest.TestCase):

    def test_the_explain_control_is_a_real_button(self):
        button = next(e for e in PAGE.elements
                      if 'data-fundamental-explain' in e['attrs'])
        self.assertEqual(button['tag'], 'button')
        self.assertEqual(button['attrs'].get('type'), 'button')

    def test_it_says_whether_it_is_open(self):
        """Guide section 13: a control's state is in the accessibility tree,
        not only in what happens to be on screen."""
        button = next(e for e in PAGE.elements
                      if 'data-fundamental-explain' in e['attrs'])
        self.assertEqual(button['attrs'].get('aria-expanded'), 'false')
        self.assertEqual(button['attrs'].get('aria-controls'),
                         'inc-fundamental-figures')
        self.assertIn('inc-fundamental-figures', HTML)

    def test_nothing_here_sends_a_ticker_to_the_beacon(self):
        """Guide section 5. beacon.js falls back to an element's text, and
        this panel's heading contains the symbol."""
        labels = {e['attrs'].get('data-track') for e in PAGE.elements
                  if 'data-fundamental' in ' '.join(e['attrs'])
                  and 'data-track' in e['attrs']}
        self.assertEqual(labels, {'fundamentals-explain'})

    def test_no_rule_here_sets_display_on_what_the_attribute_hides(self):
        """The trap from T5 and T9, avoided rather than met a third time.

        An author `display` rule beats the browser's own rule for the hidden
        attribute, so a surface that styles display on an element it also
        hides by attribute stays on screen while element.hidden is genuinely
        true — and no DOM test can see it. The figure list is hidden by
        attribute; nothing below styles its display.

        Asserted over parsed selectors rather than over the source text,
        because a stylesheet that explains itself contains the word in prose
        — which is the other recurring trap, and the one that failed this
        test when it was written as a substring check.
        """
        self.assertIn('.inc-figure-note', STYLES)
        self.assertIn('[data-explained] .inc-figure-note', STYLES)
        for selector, body in css_rules(STYLES):
            if 'display' in body:
                self.assertNotIn('[hidden]', selector)
                self.assertNotIn('data-fundamental-body', selector)

    def test_a_fund_hides_the_rows_it_cannot_fill(self):
        """Nine em dashes beside a sentence saying there is nothing to show
        reads as a panel that failed. The one row a fund keeps is the one
        measured from price alone, marked in the markup rather than matched
        by which hook it contains."""
        self.assertIn('inc-figure-unfiled', panel_markup())
        self.assertIn('[data-state="fund"] .inc-figure-unfiled', STYLES)
        marked = [e for e in PAGE.elements
                  if 'inc-figure-unfiled' in classes(e)]
        self.assertEqual(len(marked), 1)
        inside = {child['attrs'].get('data-fundamental-figure')
                  for child in PAGE.descendants(marked[0])}
        self.assertIn('beta', inside)


class TestWhatThisSurfaceCosts(unittest.TestCase):
    """The reason the panel could be added at all, asserted on the client."""

    def test_the_panel_asks_for_filings_and_nothing_else(self):
        """One request per lookup, to the free upstream. A view that also
        re-fetched a price series would put a figure nobody searched for on
        the twenty-two-call budget."""
        requests = set(re.findall(r'data\.([a-z]+)\(', VIEW))
        self.assertEqual(requests, {'fundamentals'})

    def test_the_price_is_handed_over_rather_than_fetched_again(self):
        """And it has to be, so the three derived ratios agree with the
        number on the card directly above them."""
        self.assertIn('function show(symbol, price)', VIEW)
        self.assertIn('filings.show(symbol, quote.price)',
                      read('js/view-symbol.js'))


if __name__ == '__main__':
    unittest.main()
