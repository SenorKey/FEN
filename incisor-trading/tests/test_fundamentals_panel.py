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
    return [(selector, body) for _, selector, body in css_rules_in_context(
        stylesheet)]


def css_rules_in_context(stylesheet):
    """(at-rule prelude, selector, declarations) for every innermost block.

    The context is what a flat scan of this file cannot see, and its absence
    is not academic: a rule inside `@media (max-width: 520px)` has exactly
    the same selector text as the one at the top level, so a guard that told
    them apart by their selector read the media-query override as the base
    rule it was written to catch. Anything asserting that a rule is not
    overridden somewhere has to know where each rule sits.

    Depth-tracked rather than matched, because the shape being read is
    nesting and a regular expression cannot count braces. A text run is a
    declaration block when the token after it closes a brace; otherwise it
    is the selector or prelude for the block about to open. An empty run
    between two closing braces is neither and is skipped.
    """
    stripped = re.sub(r'/\*.*?\*/', ' ', stylesheet, flags=re.S)
    tokens = re.split(r'([{}])', stripped)
    out, context, depth = [], '', 0
    for index, token in enumerate(tokens):
        if token == '{':
            depth += 1
            if depth == 1 and tokens[index - 1].strip().startswith('@'):
                context = tokens[index - 1].strip()
        elif token == '}':
            depth -= 1
            if depth == 0:
                context = ''
        elif (depth and token.strip() and index >= 2
                and index + 1 < len(tokens) and tokens[index + 1] == '}'):
            # tokens run selector, '{', body, '}' — so the selector for this
            # body is two back, never one.
            out.append((context, tokens[index - 2], token))
    return out


HERE = os.path.dirname(os.path.abspath(__file__))
RUNNER = os.path.join(HERE, 'fundamentals_model.jxa.js')

HTML = read('index.html')
PAGE = Page(HTML)
VIEW = read('js/view-fundamentals.js')
STYLES = read('css/fundamentals.css')

# The client's read layer for the price-measured half. Read here so the
# assertion below stays inside the page: what matters to this panel is what
# the browser is given, and market-data.js is where that is named.
READER = read('js/market-data.js')


def panel_markup():
    """The fundamentals panel on its own, so assertions cannot drift onto the
    rest of the page."""
    start = HTML.index('<section class="inc-fundamental"')
    return html.unescape(HTML[start:HTML.index('</section>', start)])


def figure_names():
    """(group, figure) for every value slot on the panel.

    Read as pairs rather than as bare names because the group is half of
    what identifies a figure now: `gross` means nothing on its own and
    `margin`/`gross` does. Derived from the markup with the group left
    open, so a group added later is picked up rather than skipped by a
    pattern that lists the four there are today."""
    return re.findall(r'data-([a-z]+)-figure="([a-z\-]+)"', panel_markup())


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
        nothing. The group is asserted with the name: writing the right
        figure into the wrong group is the mistake this shape makes
        possible, and it would otherwise pass."""
        written = set(re.findall(r"setFigure\('([a-z]+)', '([a-z\-]+)'", VIEW))
        self.assertEqual(written, set(figure_names()))

    def test_the_page_carries_the_whole_standard_set(self):
        self.assertEqual(
            set(figure_names()),
            {('valuation', 'market-cap'), ('valuation', 'pe'),
             ('valuation', 'dividend-yield'),
             ('earned', 'revenue'), ('earned', 'eps'), ('earned', 'shares'),
             ('margin', 'gross'), ('margin', 'operating'), ('margin', 'net'),
             ('measured', 'beta'), ('measured', 'volatility'),
             ('measured', 'correlation')})

    def test_the_three_margins_are_one_group_and_share_a_row(self):
        """The audit finding this grouping exists for. In one flowing grid
        the three sat 819px apart across a row break at 1440 and split
        again at two columns, while the copy under the third told the
        reader they always fall in order — a relationship the layout was
        hiding at every width. They are a group of exactly three on a
        three-column grid now, so the row cannot wrap."""
        group = next(e for e in PAGE.elements if 'data-margin' in e['attrs'])
        names = {child['attrs'].get('data-margin-figure')
                 for child in PAGE.descendants(group)}
        self.assertEqual(names - {None}, {'gross', 'operating', 'net'})

        # One row of three, laid out column by column so that a label
        # wrapping to two lines cannot drop its value below the two beside
        # it. Two template rows and column flow is what says that.
        rule = next(body for selector, body in css_rules(STYLES)
                    if selector.strip() == '.inc-fundamental-group .inc-figures')
        self.assertIn('grid-auto-flow: column', rule)
        self.assertIn('grid-template-rows: auto auto', rule)

        # And nothing outside the explained state may re-flow it. That is
        # the half worth guarding: the flow above is one declaration, and a
        # later rule for some other width would put the margins back across
        # a break without touching anything this test names.
        base = '.inc-fundamental-group .inc-figures'
        for context, selector, body in css_rules_in_context(STYLES):
            if 'grid-auto-flow' not in body and 'grid-template-rows' not in body:
                continue
            if base not in selector:
                continue
            if not context and selector.strip() == base:
                continue    # the base rule itself, which is what sets it
            self.assertIn('[data-explained]', selector,
                          'a rule re-flows the group grid outside the '
                          'explained state: %s %s'
                          % (context, selector.strip()))

    def test_every_group_is_labelled_by_its_own_heading(self):
        """Four unlabelled definition lists is four lists a screen reader
        reaches with no idea which is which — and the group headings are
        the only thing on screen saying what separates them, so a reader
        who cannot see them is told nothing the layout says."""
        for group in ('valuation', 'earned', 'margin', 'measured'):
            block = next(e for e in PAGE.elements
                         if 'data-' + group in e['attrs'])
            lists = [c for c in PAGE.descendants(block) if c['tag'] == 'dl']
            self.assertEqual(len(lists), 1, group)
            labelled_by = lists[0]['attrs'].get('aria-labelledby')
            self.assertIn(labelled_by, PAGE.by_id, group)
            self.assertEqual(PAGE.by_id[labelled_by]['tag'], 'h5', group)

    def test_every_figure_has_a_definition_beside_it(self):
        """T11's acceptance criterion, and the reason the panel exists rather
        than being ten more rows on the quote card. Counted per figure and not
        as a total: a page-wide count stops being a rule the moment a second
        surface grows an explanation."""
        markup = panel_markup()
        rows = re.findall(
            r'<dd class="inc-figure-value">(.*?)</dd>', markup, re.S)
        self.assertEqual(len(rows), 12)
        for row in rows:
            name = re.search(r'data-[a-z]+-figure="([a-z\-]+)"', row)
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

    def test_a_fund_hides_the_groups_it_cannot_fill(self):
        """Em dashes beside a sentence saying there is nothing to show reads
        as a panel that failed. What a fund keeps is the whole group
        measured from price alone — a group rather than a marked row, so
        the rule names the thing being kept instead of a class put on one
        row to say which."""
        hidden = set()
        for selector, body in css_rules(STYLES):
            if '[data-state="fund"]' not in selector or 'display' not in body:
                continue
            if 'none' not in body:
                continue
            hidden |= set(re.findall(r'\[data-([a-z]+)\]', selector))
        self.assertEqual(hidden, {'valuation', 'earned', 'margin'})

    def test_the_group_a_fund_keeps_is_the_one_that_needs_no_filing(self):
        """Not a restatement of the rule above. That one says three groups
        go; this says the group left standing is the one whose figures the
        server measures from the price series, which is why a fund has it
        at all. If the two ever disagree the panel shows a fund a figure
        that can only come from an income statement."""
        block = next(e for e in PAGE.elements if 'data-measured' in e['attrs'])
        names = {child['attrs'].get('data-measured-figure')
                 for child in PAGE.descendants(block)} - {None}
        block = READER[READER.index('function readMeasures'):]
        read_from_the_wire = set(re.findall(
            r'^\s+([a-z]+): optionalNumber', block[:block.index('}')], re.M))
        self.assertTrue(names <= read_from_the_wire,
                        'the panel shows a fund %s, which nothing reads off '
                        'the wire' % sorted(names - read_from_the_wire))


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
