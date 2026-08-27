"""Runs the tab controller itself, not just its markup.

`tab_model.jxa.js` loads the real incisor.js into JavaScriptCore against a DOM
stub and drives the keyboard model. That engine ships with macOS via osascript,
which is where these sessions run, so this needs nothing installed. On a host
without it the case skips rather than failing — it is a development check, and
nothing about the page depends on it at runtime.
"""

import json
import os
import shutil
import subprocess
import tempfile
import unittest

from page_model import PAGE_DIR, Page, read

HERE = os.path.dirname(os.path.abspath(__file__))
RUNNER = os.path.join(HERE, 'tab_model.jxa.js')


def describe_tabs():
    """The tab and panel wiring, read from the real page so the two cannot drift."""
    page = Page(read('index.html'))
    return {
        'tabs': [{
            'id': tab['attrs']['id'],
            'controls': tab['attrs']['aria-controls'],
            'selected': tab['attrs'].get('aria-selected'),
            'tabindex': tab['attrs'].get('tabindex'),
        } for tab in page.with_role('tab')],
        'panels': [{
            'id': panel['attrs']['id'],
            'hidden': 'hidden' in panel['attrs'],
        } for panel in page.with_role('tabpanel')],
    }


@unittest.skipUnless(shutil.which('osascript'), 'needs macOS JavaScriptCore')
class TestTabKeyboardModel(unittest.TestCase):

    def test_the_controller_behaves(self):
        handle = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False)
        try:
            json.dump(describe_tabs(), handle)
            handle.close()
            completed = subprocess.run(
                ['osascript', '-l', 'JavaScript', RUNNER, PAGE_DIR, handle.name],
                capture_output=True, text=True, timeout=60)
        finally:
            os.unlink(handle.name)

        self.assertEqual(completed.returncode, 0, completed.stderr)
        report = json.loads(completed.stdout)

        failures = [row for row in report['results'] if not row['pass']]
        self.assertEqual(
            failures, [],
            '\n'.join('%s - %s' % (row['test'], row['detail']) for row in failures))
        self.assertGreaterEqual(report['total'], 14, 'the runner did not finish')
