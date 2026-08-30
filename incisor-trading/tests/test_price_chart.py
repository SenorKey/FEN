"""Runs the price chart, not just its markup.

`chart_model.jxa.js` loads the two real modules into JavaScriptCore and drives
them: js/chart-geometry.js against hand-computed coordinates, and
js/view-price-chart.js against a DOM stub driven by real range clicks, pointer
moves and arrow keys.

That is what covers the T8 acceptance criteria a headless session can reach —
every range renders from fixtures, the chart is usable by keyboard, and the
readout tracks without the plot changing size. What it cannot cover is whether
the line is legible in light and dark, or whether the axis labels collide at
375px. tools/shoot.py does that, and the screenshots are the evidence.

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
RUNNER = os.path.join(HERE, 'chart_model.jxa.js')

HTML = read('index.html')
CSS = read('css/chart.css')
PAGE = Page(HTML)


def chart_markup():
    """The served chart on its own, so assertions cannot drift onto the rest of
    the page. Entities are resolved first: an em dash is written `&mdash;` in
    the source and is the same character either way."""
    start = HTML.index('<figure class="inc-chart"')
    return html.unescape(HTML[start:HTML.index('</figure>', start)])


@unittest.skipUnless(shutil.which('osascript'), 'needs macOS JavaScriptCore')
class TestChartBehaviour(unittest.TestCase):

    def test_the_chart_is_correct_at_every_checked_case(self):
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
        self.assertGreaterEqual(report['total'], 80,
                                'the runner did not finish')


class TestChartIsWiredIntoThePage(unittest.TestCase):

    def test_the_modules_load_before_the_view(self):
        for module in ('js/chart-geometry.js', 'js/market-figures.js',
                       'js/dom.js'):
            self.assertIn('/incisor-trading/' + module, HTML, module)
            self.assertLess(HTML.index(module),
                            HTML.index('js/view-price-chart.js'))

    def test_the_chart_view_loads_before_the_panel_that_drives_it(self):
        self.assertLess(HTML.index('js/view-price-chart.js'),
                        HTML.index('js/view-symbol.js'))

    def test_the_page_has_every_hook_the_view_looks_for(self):
        for hook in ('data-chart', 'data-chart-ranges', 'data-chart-range',
                     'data-chart-plot', 'data-chart-canvas', 'data-chart-marks',
                     'data-chart-scale', 'data-chart-dates',
                     'data-chart-message', 'data-chart-readout',
                     'data-chart-readout-date', 'data-chart-readout-price',
                     'data-chart-readout-arrow', 'data-chart-readout-delta',
                     'data-chart-readout-pct', 'data-chart-readout-change',
                     'data-chart-symbol', 'data-chart-proxy',
                     'data-chart-period', 'data-chart-period-label',
                     'data-chart-period-arrow', 'data-chart-period-delta',
                     'data-chart-period-pct', 'data-chart-shortfall',
                     'data-chart-table', 'data-chart-rows',
                     'data-chart-tracking'):
            self.assertIn(hook, chart_markup(), hook)

    def test_the_chart_can_name_the_symbol_it_is_drawing(self):
        """The plot's aria-label named it from the start and nothing on screen
        did, which left a card of figures belonging to no ticker."""
        ticker = [e for e in PAGE.elements if 'data-chart-symbol' in e['attrs']]
        self.assertEqual(len(ticker), 1)
        # Hidden until a symbol is loaded; the view unhides it, as the quote
        # panel's own badge is unhidden.
        self.assertIn('hidden', ticker[0]['attrs'])

    def test_a_proxy_stays_labelled_on_the_chart_too(self):
        """The strip tells the reader the ETFs 'are labelled as proxies
        wherever they appear', and the chart head is somewhere they appear."""
        badge = [e for e in PAGE.elements if 'data-chart-proxy' in e['attrs']]
        self.assertEqual(len(badge), 1)
        self.assertIn('inc-proxy', classes(badge[0]))
        self.assertIn('hidden', badge[0]['attrs'])

    def test_the_gradient_the_area_fill_names_is_actually_defined(self):
        """It ships in the markup rather than being built, so that emptying the
        drawing group on every redraw does not take it with it."""
        self.assertIn('url(#inc-chart-fade)', CSS)
        self.assertIn('id="inc-chart-fade"', chart_markup())


class TestChartAccessibility(unittest.TestCase):
    """Guide section 13: keyboard throughout, and never colour alone."""

    def test_the_plot_is_one_tab_stop_and_describes_itself(self):
        plot = [e for e in PAGE.elements if 'data-chart-plot' in e['attrs']]
        self.assertEqual(len(plot), 1)
        self.assertEqual(plot[0]['attrs'].get('tabindex'), '0')
        self.assertEqual(plot[0]['attrs'].get('role'), 'img')
        self.assertIn('aria-label', plot[0]['attrs'])
        described = plot[0]['attrs'].get('aria-describedby')
        self.assertIn(described, PAGE.by_id, 'aria-describedby does not resolve')

    def test_the_range_buttons_are_a_labelled_group_of_real_buttons(self):
        group = [e for e in PAGE.elements if 'data-chart-ranges' in e['attrs']]
        self.assertEqual(len(group), 1)
        self.assertEqual(group[0]['attrs'].get('role'), 'group')
        self.assertTrue(group[0]['attrs'].get('aria-label'))

        buttons = [e for e in PAGE.elements if 'data-chart-range' in e['attrs']]
        self.assertEqual(len(buttons), 5)
        for button in buttons:
            self.assertEqual(button['tag'], 'button')
            self.assertIn('aria-pressed', button['attrs'])

    def test_exactly_one_range_ships_pressed(self):
        pressed = [e for e in PAGE.elements
                   if e['attrs'].get('data-chart-range')
                   and e['attrs'].get('aria-pressed') == 'true']
        self.assertEqual(len(pressed), 1)

    def test_there_is_no_intraday_range_to_draw_from_a_daily_series(self):
        keys = [e['attrs']['data-chart-range'] for e in PAGE.elements
                if e['attrs'].get('data-chart-range')]
        self.assertNotIn('1D', keys)

    def test_the_decorative_layers_are_hidden_from_a_screen_reader(self):
        """The picture is described once, by the plot's own label. The SVG, the
        markers and both axes would otherwise be read as a list of numbers with
        no structure at all."""
        for hook in ('data-chart-marks', 'data-chart-scale',
                     'data-chart-dates'):
            node = [e for e in PAGE.elements if hook in e['attrs']]
            self.assertEqual(len(node), 1, hook)
            self.assertEqual(node[0]['attrs'].get('aria-hidden'), 'true', hook)

    def test_the_svg_is_not_a_focus_stop_of_its_own(self):
        svg = [e for e in PAGE.elements if 'inc-chart-svg' in classes(e)]
        self.assertEqual(len(svg), 1)
        self.assertEqual(svg[0]['attrs'].get('focusable'), 'false')
        self.assertEqual(svg[0]['attrs'].get('aria-hidden'), 'true')

    def test_the_readout_is_announced_when_it_changes(self):
        readout = [e for e in PAGE.elements
                   if 'data-chart-readout' in e['attrs']]
        self.assertEqual(len(readout), 1)
        self.assertEqual(readout[0]['attrs'].get('role'), 'status')

    def test_the_table_fallback_ships_with_its_own_header_row(self):
        rows = [e for e in PAGE.elements if 'data-chart-rows' in e['attrs']]
        self.assertEqual(len(rows), 1)
        headers = re.findall(r'<th scope="col">', chart_markup())
        self.assertEqual(len(headers), 6)


class TestChartTelemetryHygiene(unittest.TestCase):
    """Guide section 5: no ticker, quantity or figure may reach the beacon."""

    def test_every_range_button_shares_one_generic_label(self):
        labels = {e['attrs'].get('data-track') for e in PAGE.elements
                  if e['attrs'].get('data-chart-range')}
        self.assertEqual(labels, {'chart-range'})


class TestChartHasNoLayoutShift(unittest.TestCase):
    """Guide section 13. A range change must not move anything below it."""

    def test_the_plot_height_is_reserved_rather_than_driven_by_content(self):
        self.assertIn('--inc-chart-height', CSS)
        self.assertRegex(CSS, r'height:\s*var\(--inc-chart-height\)')

    def test_the_readout_reserves_its_line(self):
        self.assertRegex(CSS, r'\.inc-chart-readout\s*\{[^}]*min-height')


if __name__ == '__main__':
    unittest.main()
