"""Runs the market clock itself, not just its markup.

`clock_model.jxa.js` loads the real js/market-clock.js into JavaScriptCore and
drives it against a hardcoded set of instants — every phase boundary, both
sides of daylight saving, a weekend, a full holiday and an early-close half
day. That is the whole T5 acceptance criterion, and none of it needs a DOM,
because the module is pure.

It then loads the shell's view against a DOM stub with sessionAt held fixed,
because the wordings a reader actually sees — the holiday name, the early-close
note, and leaving the served text alone when the module is missing — are
branches the pure module never reaches.

JavaScriptCore ships with macOS via osascript, so this needs nothing installed.
On a host without it the case skips rather than failing.
"""

import json
import os
import shutil
import subprocess
import unittest

from page_model import PAGE_DIR, read

HERE = os.path.dirname(os.path.abspath(__file__))
RUNNER = os.path.join(HERE, 'clock_model.jxa.js')


@unittest.skipUnless(shutil.which('osascript'), 'needs macOS JavaScriptCore')
class TestMarketClockLogic(unittest.TestCase):

    def test_the_clock_is_correct_at_every_checked_instant(self):
        completed = subprocess.run(
            ['osascript', '-l', 'JavaScript', RUNNER, PAGE_DIR],
            capture_output=True, text=True, timeout=60)

        self.assertEqual(completed.returncode, 0, completed.stderr)
        report = json.loads(completed.stdout)

        failures = [row for row in report['results'] if not row['pass']]
        self.assertEqual(
            failures, [],
            '\n'.join('%s - %s' % (row['test'], row['detail']) for row in failures))
        self.assertGreaterEqual(report['total'], 55, 'the runner did not finish')


class TestMarketClockIsWiredIntoThePage(unittest.TestCase):
    """The logic being right is worth nothing if it never reaches the page."""

    def setUp(self):
        self.markup = read('index.html')

    def test_the_clock_module_is_loaded_before_the_shell(self):
        self.assertIn('/incisor-trading/js/market-clock.js', self.markup)
        self.assertLess(self.markup.index('js/market-clock.js'),
                        self.markup.index('/incisor-trading/incisor.js'))

    def test_the_clock_has_the_hooks_the_shell_looks_for(self):
        for hook in ('data-clock', 'data-clock-state', 'data-clock-detail'):
            self.assertIn(hook, self.markup, hook)

    def test_the_served_markup_says_something_true_without_javascript(self):
        """If the script never runs, what is already on the page must stand."""
        self.assertNotIn('Clock arrives with T5', self.markup)
        self.assertIn('Regular hours', self.markup)

    def test_the_clock_is_not_a_live_region(self):
        """A per-second countdown inside role=status is announced per second."""
        clock = self.markup[self.markup.index('<div class="inc-clock"'):]
        clock = clock[:clock.index('</div>')]
        self.assertNotIn('aria-live', clock)
        self.assertNotIn('role="status"', clock)


if __name__ == '__main__':
    unittest.main()
