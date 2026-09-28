"""Runs the sector grid, not just its markup.

`sectors_model.jxa.js` loads js/market-data.js and js/view-sectors.js into
JavaScriptCore and drives them: the shape checks against payloads with rows
that lie, and the view against a DOM stub driven by real clicks on the window
buttons. That covers the T10 acceptance criteria a headless session can reach
— the grid renders from fixtures, a sector with no figure says so rather than
ranking as flat, and the whole thing degrades to a stated "unavailable".

The bar axis gets the most attention there, because it is the one part of this
surface that can be confidently wrong. A ranking drawn against the wrong axis
looks exactly like a ranking drawn against the right one.

What it cannot cover is whether eleven bars read as a ranking at 375px, or
whether the greyscale criterion holds. tools/shoot.py does that, and the
screenshots are the evidence.

The rest of this file is about the served markup, because a correct module
that is never wired to the page is worth nothing — and because the runner
builds its own markup from the contract the view documents, which would keep
passing if the page stopped carrying it.
"""

import html
import json
import os
import shutil
import subprocess
import unittest

from page_model import PAGE_DIR, Page, classes, read

HERE = os.path.dirname(os.path.abspath(__file__))
RUNNER = os.path.join(HERE, 'sectors_model.jxa.js')

HTML = read('index.html')
PAGE = Page(HTML)
VIEW = read('js/view-sectors.js')
STYLES = read('css/sectors.css')


def sector_markup():
    """The sector section on its own, so assertions cannot drift onto the
    rest of the page."""
    start = HTML.index('<section class="inc-sectors"')
    return html.unescape(HTML[start:HTML.index('</section>', start)])


def _button_rules(styles, class_name):
    """Every declaration one button class is given, keyed by where.

    The key is what follows the class name in the selector — '' for the base
    rule, ':disabled', '[aria-pressed="true"]' — paired with the media query
    the rule sits in. That is what makes the two sets comparable: a hover
    rule in one stylesheet lines up with the hover rule in the other, and a
    rule that exists in only one of them has no partner and says so.

    Deliberately a small parser rather than a grep. The surface it guards is
    a sameness between two files, and a substring check cannot tell a
    declaration from the comment explaining it (the greps trap in
    DECISIONS.md).
    """
    import re

    styles = re.sub(r'/\*.*?\*/', ' ', styles, flags=re.S)
    rules = {}

    def collect(css, media):
        for selector, body in re.findall(r'([^{}]+)\{([^{}]*)\}', css):
            for one in selector.split(','):
                one = one.strip()
                # Word boundary by hand: `.inc-chart-ranges` is the container,
                # not the button, and startswith would take it.
                if not re.match(r'\.%s(?![\w-])' % re.escape(class_name), one):
                    continue
                key = (one[len(class_name) + 1:], media)
                rules.setdefault(key, set()).update(
                    part.strip() for part in body.split(';') if part.strip())

    # Media blocks first, then what is left is the top level. Nesting is one
    # deep in both files and neither stylesheet is a general CSS parser's job.
    for condition, block in re.findall(r'@media([^{]+)\{((?:[^{}]*\{[^{}]*\})*)',
                                       styles):
        collect(block, condition.strip())
    collect(re.sub(r'@media[^{]+\{(?:[^{}]*\{[^{}]*\})*\}', ' ', styles), '')
    return rules


@unittest.skipUnless(shutil.which('osascript'), 'needs macOS JavaScriptCore')
class TestSectorGridBehaviour(unittest.TestCase):

    def test_the_sector_grid_is_correct_at_every_checked_case(self):
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
    """The contract js/view-sectors.js documents, asserted on the real page."""

    def test_the_panel_ships_with_a_state_the_view_can_replace(self):
        panels = [e for e in PAGE.elements if 'data-sector' in e['attrs']]
        self.assertEqual(len(panels), 1, 'the page carries no sector grid')
        self.assertEqual(panels[0]['attrs'].get('data-state'), 'loading')

    def test_the_list_ships_empty(self):
        """Eleven rows in the markup would be eleven rows to keep in step
        with the server's own table, and the page has no build step to
        generate them from one source."""
        markup = sector_markup()
        self.assertIn('data-sector-list', markup)
        self.assertNotIn('inc-sector-row', markup)

    def test_exactly_one_window_starts_pressed(self):
        markup = sector_markup()
        self.assertEqual(markup.count('aria-pressed="true"'), 1)

    def test_every_window_button_is_a_real_button(self):
        for element in PAGE.elements:
            if 'data-sector-window' in element['attrs']:
                self.assertEqual(element['tag'], 'button', element['line'])

    def test_every_window_the_service_offers_has_a_button(self):
        """Derived from the service's own list rather than written out, so a
        window added there fails here instead of silently never appearing."""
        import sys
        sys.path.insert(0, os.path.join(PAGE_DIR, 'server'))
        import sectors  # noqa: E402

        markup = sector_markup()
        for window in sectors.WINDOWS:
            self.assertIn('data-sector-window="%s"' % window, markup,
                          '%s is offered by the service and not by the page'
                          % window)

    def test_no_window_button_sends_its_own_name_to_the_beacon(self):
        """Guide section 5. One generic label for all four, like the chart's
        range buttons — the beacon is told a window was chosen, never which."""
        labels = set()
        for element in PAGE.elements:
            if 'data-sector-window' in element['attrs']:
                labels.add(element['attrs'].get('data-track'))
        self.assertEqual(labels, {'sector-window'})

    def test_the_grid_carries_its_own_provenance_line(self):
        """Guide section 10: where these numbers came from, next to them."""
        self.assertIn('data-sector-provenance', sector_markup())

    def test_the_served_message_is_true_before_the_script_runs(self):
        """The page has no figures of its own, so the served state has to say
        so — and go on saying so if the script never runs."""
        found = [e for e in PAGE.elements if 'data-sector-message' in e['attrs']]
        self.assertEqual(len(found), 1)
        self.assertIn('Loading', sector_markup())


class TestTheSurfaceMeetsTheHouseRules(unittest.TestCase):

    def test_the_bar_is_never_the_only_signal(self):
        """Guide section 13. The bar is aria-hidden and decorative; every
        figure beside it carries an arrow and an explicit sign, and the
        stylesheet gives a fall its own side of the zero line."""
        self.assertIn("aria-hidden", VIEW)
        self.assertIn('inc-arrow', VIEW)
        self.assertIn('data-direction="down"', STYLES)

    def test_a_missing_figure_draws_no_bar(self):
        """An empty bar and a bar of length zero look identical and mean
        opposite things. The one that is not known is not drawn."""
        self.assertIn('[data-state="missing"] .inc-sector-bar-fill', STYLES)

    def test_the_bar_survives_every_width(self):
        """The bar is what makes this a ranking rather than a list of figures,
        and it used to be the first thing dropped at narrow widths — so on a
        phone, the width guide section 13 calls first, the surface was eleven
        names and eleven numbers.

        It may be moved. It may not be deleted: the narrow rule stacks it
        under the name instead, where it gets more width than it had beside
        it. Walked over the innermost rule blocks rather than grepped for the
        two words, because `display: none` inside a comment explaining why the
        bar is *not* hidden would fail a substring check (see the greps trap
        in DECISIONS.md).
        """
        import re
        blocks = re.findall(r'([^{}]+)\{([^{}]*)\}',
                            re.sub(r'/\*.*?\*/', ' ', STYLES, flags=re.S))
        for selector, body in blocks:
            # The track, not the fill: a row with no figure hides its fill on
            # purpose, and that has its own test directly above.
            if not re.search(r'\.inc-sector-bar(?![\w-])', selector):
                continue
            self.assertNotRegex(
                body, r'\bdisplay\s*:\s*none\b',
                '%s hides the bar; at that width the ranking is a column of '
                'figures' % selector.strip())

    def test_the_list_reserves_its_height(self):
        """Guide section 13: no layout shift. Eleven rows arrive at once, and
        an unreserved list would shove the lookup section down the page."""
        self.assertIn('min-height', STYLES)

    def test_motion_is_optional(self):
        """Guide section 13, honoured where it is actually honoured.

        This used to assert that css/sectors.css contained the words
        `prefers-reduced-motion`, and it passed while the block it was
        checking did nothing: incisor.css already stops every transition on
        the page with `!important`, so the surface's own copy could not
        change an outcome. Asserting the page-wide rule covers this file's
        moving parts is the claim that is worth holding, and it keeps
        holding when a surface stops carrying a copy.
        """
        import re
        page_wide = read('incisor.css')
        self.assertIn('prefers-reduced-motion', page_wide)
        self.assertRegex(page_wide, r'body\.incisor \*')
        self.assertIn('transition-duration: 0.01ms !important', page_wide)

        moving = [(selector.strip(), body)
                  for selector, body in re.findall(
                      r'([^{}]+)\{([^{}]*)\}',
                      re.sub(r'/\*.*?\*/', ' ', STYLES, flags=re.S))
                  if re.search(r'\b(transition|animation)\s*:', body)]
        self.assertTrue(moving, 'nothing here moves; the rule this derives '
                                'from moved instead')

        # The one way this surface could put its motion back: out-shout the
        # page-wide rule. Nothing else it declares can reach past !important.
        for selector, body in moving:
            self.assertNotRegex(
                body, r'\b(transition|animation)[\w-]*\s*:[^;]*!important',
                '%s forces its own motion past the page-wide stop' % selector)

    def test_the_figures_are_tabular(self):
        self.assertIn('tabular-nums', STYLES)

    def test_the_window_buttons_are_still_the_chart_range_buttons(self):
        """The top of css/sectors.css claims the window buttons *are* the
        chart's range buttons — same size, same pressed treatment — because
        two sets of period controls that looked different would read as two
        different kinds of control. That claim was true at desktop and tablet
        and false on a phone: chart.css had given its set a narrow rule and
        this one never got it, so at 390px they measured 68x28 and 39x26 and
        the smaller target was the one under a finger.

        Compared declaration by declaration rather than by grepping for the
        rule that was missing, per DEC-064: a check that asserts today's fix
        watches today's fix, and the next divergence will be a different
        property. Keyed on what follows the class name and on the enclosing
        media query, so a hover rule is compared against a hover rule.
        """
        chart = _button_rules(read('css/chart.css'), 'inc-chart-range')
        sector = _button_rules(STYLES, 'inc-sector-window')
        self.assertTrue(chart, 'the pattern this derives from moved')
        self.assertEqual(
            sorted(chart), sorted(sector),
            'one set of period controls is styled in a context the other is '
            'not; they are meant to be the same control')
        for key in chart:
            self.assertEqual(
                chart[key], sector[key],
                'the two period controls disagree at %r' % (key,))

    def test_every_class_the_view_builds_is_styled(self):
        """The rows are built in JavaScript, so PAGE.elements never sees them
        and the page-wide unstyled-class check cannot cover this surface."""
        import re
        built = set(re.findall(r"element\('\w+', '(inc-[a-z-]+)'\)", VIEW))
        self.assertTrue(built, 'the pattern this derives from moved')
        unstyled = sorted(name for name in built
                          if '.' + name not in STYLES + read('css/market.css'))
        self.assertEqual(unstyled, [], 'classes built but never styled')


if __name__ == '__main__':
    unittest.main()
