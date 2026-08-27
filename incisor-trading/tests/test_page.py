"""Verification for the Incisor Trading page.

Guide section 15 wants this checked in a browser, and it should be. But a
scheduled session runs unattended and cannot start the dev server, so these
tests cover everything that can be asserted without one: the ARIA tab wiring,
the hidden-page rules, telemetry hygiene, CSP readiness, and the house style
rules from sections 5, 6 and 13.

What they deliberately do not cover is whether it looks right. Layout, contrast
and the 375px pass still need eyes on a browser.

    python3 -m unittest discover incisor-trading/tests
"""

import os
import re
import unittest

from page_model import PAGE_DIR, Page, classes, read

HTML = read('index.html')
CSS = read('incisor.css')
# Every script this page serves, concatenated. The security greps below are
# deliberately blunt substring checks, so they have to be pointed at all of the
# shipped JavaScript rather than just the shell — a rule that only covers one
# file stops being a rule the moment a second one appears.
JS_FILES = ('incisor.js',) + tuple(
    os.path.join('js', name) for name in sorted(os.listdir(os.path.join(PAGE_DIR, 'js')))
    if name.endswith('.js'))
JS = '\n'.join(read(name) for name in JS_FILES)
PAGE = Page(HTML)


class TestMarkupIsWellFormed(unittest.TestCase):

    def test_every_tag_is_closed(self):
        self.assertEqual(PAGE.unclosed, [], 'tags left open at end of document')

    def test_no_tags_close_out_of_order(self):
        self.assertEqual(PAGE.mismatched, [], 'closing tags out of order')

    def test_ids_are_unique(self):
        ids = [e['attrs']['id'] for e in PAGE.elements if e['attrs'].get('id')]
        self.assertEqual(sorted(ids), sorted(set(ids)), 'duplicate id on the page')


class TestTabWiring(unittest.TestCase):
    """The contract incisor.js documents at the top of the file."""

    def setUp(self):
        self.tabs = PAGE.with_role('tab')
        self.panels = PAGE.with_role('tabpanel')

    def test_three_tabs_and_three_panels(self):
        self.assertEqual(len(self.tabs), 3)
        self.assertEqual(len(self.panels), 3)

    def test_tablist_exists_for_the_script_to_bind_to(self):
        lists = [e for e in PAGE.elements if 'inc-tablist' in classes(e)]
        self.assertEqual(len(lists), 1, 'incisor.js binds to .inc-tablist and would no-op')
        self.assertEqual(lists[0]['attrs'].get('role'), 'tablist')

    def test_tabs_are_real_buttons(self):
        for tab in self.tabs:
            self.assertEqual(tab['tag'], 'button', tab['attrs'].get('id'))
            self.assertEqual(tab['attrs'].get('type'), 'button')

    def test_exactly_one_tab_starts_selected(self):
        selected = [t for t in self.tabs if t['attrs'].get('aria-selected') == 'true']
        self.assertEqual(len(selected), 1)

    def test_each_tab_points_at_a_panel_that_points_back(self):
        for tab in self.tabs:
            target = tab['attrs'].get('aria-controls')
            self.assertIn(target, PAGE.by_id, 'aria-controls does not resolve')
            panel = PAGE.by_id[target]
            self.assertEqual(panel['attrs'].get('role'), 'tabpanel')
            self.assertEqual(panel['attrs'].get('aria-labelledby'), tab['attrs'].get('id'))

    def test_roving_tabindex_matches_selection(self):
        for tab in self.tabs:
            selected = tab['attrs'].get('aria-selected') == 'true'
            self.assertEqual(tab['attrs'].get('tabindex'), '0' if selected else '-1',
                             tab['attrs'].get('id'))

    def test_unselected_panels_ship_hidden(self):
        """So the served page is already correct before any script runs."""
        for tab in self.tabs:
            panel = PAGE.by_id[tab['attrs']['aria-controls']]
            selected = tab['attrs'].get('aria-selected') == 'true'
            self.assertEqual('hidden' in panel['attrs'], not selected,
                             panel['attrs'].get('id'))

    def test_there_is_a_skip_link_to_the_main_content(self):
        skip = [e for e in PAGE.elements if 'skip-link' in classes(e)]
        self.assertEqual(len(skip), 1)
        self.assertEqual(skip[0]['attrs'].get('href'), '#main-content')
        self.assertIn('main-content', PAGE.by_id)


class TestPageStaysHidden(unittest.TestCase):
    """Hard rules 2 and 3. A regression here publishes the page by accident."""

    def test_robots_meta_is_noindex_nofollow(self):
        robots = [e for e in PAGE.with_tag('meta')
                  if e['attrs'].get('name') == 'robots']
        self.assertEqual(len(robots), 1, 'the robots meta tag is missing')
        content = robots[0]['attrs'].get('content', '')
        self.assertIn('noindex', content)
        self.assertIn('nofollow', content)

    def test_the_page_does_not_link_to_itself(self):
        links = [e for e in PAGE.with_tag('a')
                 if 'incisor' in (e['attrs'].get('href') or '')]
        self.assertEqual(links, [], 'a self-link in the nav publishes the page')


class TestTelemetryHygiene(unittest.TestCase):
    """Guide section 5. beacon.js falls back to an element's text content, so a
    control without an explicit data-track leaks whatever it says."""

    def test_every_control_outside_the_nav_has_a_generic_data_track(self):
        for button in PAGE.with_tag('button'):
            if PAGE.is_inside(button, 'nav'):
                continue
            label = button['attrs'].get('data-track')
            self.assertTrue(label, 'button at line %d has no data-track' % button['line'])
            self.assertIsNone(re.search(r'[\d$]', label),
                              'data-track %r carries a figure' % label)


class TestNoThirdPartyOrigins(unittest.TestCase):
    """Guide section 4: nothing on this page may be fetched from someone else."""

    def test_no_remote_src_or_href(self):
        for element in PAGE.elements:
            for attribute in ('src', 'href'):
                value = element['attrs'].get(attribute)
                if value and re.match(r'(https?:)?//', value):
                    self.fail('remote %s=%s at line %d'
                              % (attribute, value, element['line']))

    def test_no_analytics_or_font_cdn(self):
        for marker in ('googletagmanager', 'fonts.googleapis', 'fonts.gstatic'):
            self.assertNotIn(marker, HTML)

    def test_stylesheet_pulls_nothing_remote(self):
        self.assertIsNone(re.search(r'url\(\s*[\'"]?(https?:)?//', CSS))


class TestReadyForTheContentSecurityPolicy(unittest.TestCase):
    """T13 adds a strict CSP. These are the things that would break under it."""

    def test_no_inline_event_handlers(self):
        for element in PAGE.elements:
            for name in element['attrs']:
                self.assertFalse(name.startswith('on'),
                                 'inline %s at line %d' % (name, element['line']))

    def test_no_inline_style_attributes(self):
        for element in PAGE.elements:
            self.assertNotIn('style', element['attrs'],
                             'inline style at line %d' % element['line'])

    def test_no_inline_script_blocks(self):
        self.assertIsNone(re.search(r'<script(?![^>]*\ssrc=)[^>]*>\s*\S', HTML))


class TestClientSecurity(unittest.TestCase):
    """Guide section 5."""

    def test_no_innerhtml(self):
        self.assertNotIn('innerHTML', JS)

    def test_no_eval(self):
        self.assertIsNone(re.search(r'\beval\s*\(|new Function', JS))

    def test_the_skeleton_makes_no_network_calls_of_its_own(self):
        self.assertIsNone(re.search(r'\bfetch\s*\(|XMLHttpRequest|sendBeacon', JS))


class TestDesignRules(unittest.TestCase):
    """Guide section 13."""

    def test_direction_is_never_signalled_by_colour_alone(self):
        for element in PAGE.elements:
            marks = classes(element) & {'inc-up', 'inc-down'}
            if not marks:
                continue
            inner = PAGE.descendants(element)
            self.assertTrue(
                any('inc-arrow' in classes(child) for child in inner),
                'line %d uses %s with no arrow glyph' % (element['line'], marks))

    def test_numbers_are_set_in_tabular_figures(self):
        self.assertIn('tabular-nums', CSS)

    def test_reduced_motion_is_honoured(self):
        self.assertIn('prefers-reduced-motion', CSS)

    def test_focus_is_visible(self):
        self.assertIn(':focus-visible', CSS)

    def test_proxy_tiles_are_labelled_as_proxies(self):
        """Guide section 10: ETF stand-ins must never read as index levels."""
        proxies = [e for e in PAGE.elements if 'inc-proxy' in classes(e)]
        tiles = [e for e in PAGE.elements if 'inc-tile' in classes(e)]
        self.assertEqual(len(proxies), len(tiles), 'a tile is missing its proxy label')


class TestHouseStyle(unittest.TestCase):
    """Guide section 6."""

    def test_no_todo_left_behind(self):
        for name, source in (('incisor.js', JS), ('incisor.css', CSS)):
            self.assertIsNone(re.search(r'\bTODO\b', source), name)

    def test_lines_stay_under_100_characters(self):
        for name, source in (('index.html', HTML), ('incisor.css', CSS), ('incisor.js', JS)):
            long_lines = [i + 1 for i, line in enumerate(source.splitlines())
                          if len(line) > 100]
            self.assertEqual(long_lines, [], '%s lines over 100 chars' % name)

    def test_files_stay_under_600_lines(self):
        for name, source in (('index.html', HTML), ('incisor.css', CSS), ('incisor.js', JS)):
            self.assertLess(len(source.splitlines()), 600, '%s needs a split' % name)

    def test_stylesheet_braces_balance(self):
        self.assertEqual(CSS.count('{'), CSS.count('}'))

    def test_every_incisor_class_used_is_actually_styled(self):
        used = set()
        for element in PAGE.elements:
            used |= {c for c in classes(element) if c.startswith('inc-')}
        unstyled = sorted(c for c in used if '.' + c not in CSS)
        self.assertEqual(unstyled, [], 'classes used but never styled')


if __name__ == '__main__':
    unittest.main()
