"""Runs the equity curve's view, not just the arithmetic under it.

`performance_model.jxa.js` loads js/view-performance.js into JavaScriptCore
beside js/view-portfolio.js and the modules they share, and reads the block
the way a reader does: the state it declares, the sentence it gives for every
reason there is no line, the verdict and key figures when there is one, and
how many times it asks for each series.

`test_history.py` covered the curve's arithmetic from T16 on; what the view
made of it had no runner until D21. Its first run found two things the
screenshots never showed, because no seed reached them: a first week of
trading named "Sep ’26 to Sep ’26", and SPY still loading described as SPY
that "could not be loaded".

What this cannot see is the drawn line, the scale's placement, or the block at
375px. tools/shoot.py does that.
"""

import json
import os
import shutil
import subprocess
import unittest

from page_model import PAGE_DIR

HERE = os.path.dirname(os.path.abspath(__file__))
RUNNER = os.path.join(HERE, 'performance_model.jxa.js')


@unittest.skipUnless(shutil.which('osascript'), 'needs macOS JavaScriptCore')
class TestTheCurveSaysWhatItShows(unittest.TestCase):

    def test_every_checked_case_holds(self):
        completed = subprocess.run(
            ['osascript', '-l', 'JavaScript', RUNNER, PAGE_DIR],
            capture_output=True, text=True, timeout=60)

        self.assertEqual(completed.returncode, 0, completed.stderr)
        report = json.loads(completed.stdout)

        failures = [row for row in report['results'] if not row['pass']]
        self.assertEqual(
            failures, [],
            '\n'.join('%s - %s' % (row['test'], row['detail']) for row in failures))
        self.assertGreaterEqual(report['total'], 60, 'the runner did not finish')


if __name__ == '__main__':
    unittest.main()
