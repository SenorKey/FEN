"""Runs the client's network seam, not just its readers.

`market_data_model.jxa.js` loads the real js/market-data.js into
JavaScriptCore behind a fetch stub that stays pending, and asks the question
D22 was filed for: how many requests does one page load make for one series?

The answer used to be four. The index strip, the portfolio, the equity curve
and its benchmark each ask for SPY in the same tick on a Trade tab holding it,
and no view can see what another is asking for — so the join belongs at the
seam, which is the only thing that sees them all.

The cost was never quota. The service caches (DEC-003), so the repeats were
invisible to the call budget and to every test, which is exactly how they
survived: four round trips on a residential uplink, growing with each surface
added to the tab.

What cannot be checked here is that a surface draws what it is handed.
tools/shoot.py does that.
"""

import json
import os
import re
import shutil
import subprocess
import unittest

from page_model import PAGE_DIR, read

HERE = os.path.dirname(os.path.abspath(__file__))
RUNNER = os.path.join(HERE, 'market_data_model.jxa.js')

READER = read('js/market-data.js')


def code(source):
    """A script with its comments removed (DEC-066).

    This file's own header talks about sharing requests and about what the
    browser never does, so a substring check over the whole text matches the
    prose as readily as the code. Every rule below is about what the module
    executes.
    """
    return re.sub(r'//[^\n]*', ' ',
                  re.sub(r'/\*.*?\*/', ' ', source, flags=re.S))


READER_CODE = code(READER)


@unittest.skipUnless(shutil.which('osascript'), 'needs macOS JavaScriptCore')
class TestTheSeamSharesWhatIsAlreadyOut(unittest.TestCase):

    def test_every_checked_case_holds(self):
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
        self.assertGreaterEqual(report['total'], 15, 'the runner did not finish')


class TestTheJoinIsSingleFlightAndNotACache(unittest.TestCase):
    """The difference is one line, and getting it wrong is worse than the
    defect it fixes: a held answer would leave every surface showing a figure
    that had stopped being refreshed, with nothing on the page to expire it.
    The runner asserts the behaviour; these assert the shape that produces it,
    because a cache that happened to look right under the stub would pass
    there and fail on a page left open."""

    def test_an_entry_is_dropped_when_its_request_settles(self):
        self.assertIn('delete inFlight[url]', READER_CODE)

    def test_it_is_dropped_in_both_directions(self):
        """A rejected request left behind would hand its failure to every
        later caller of that URL."""
        self.assertIn('request.then(settled, settled)', READER_CODE)

    def test_nothing_holds_the_parsed_answer(self):
        """Only the promise goes in the map. A resolved envelope stored here
        would be the cache this deliberately is not."""
        self.assertNotIn('inFlight[url] = payload', READER_CODE)
        self.assertIn('inFlight[url] = request', READER_CODE)


class TestEveryRouteGoesThroughIt(unittest.TestCase):
    """Keyed on the URL rather than the route, so a route cannot be added
    without the guard — which is what made this a defect in the seam rather
    than in the four views that happened to show it."""

    def test_no_route_reaches_the_network_around_it(self):
        """fetchJson is the inner half; requestJson is the half that shares.
        A route calling the inner one directly would be a route with no
        join, and it would look entirely reasonable."""
        self.assertEqual(READER_CODE.count('fetchJson('), 2)

    def test_every_route_asks_through_the_sharing_half(self):
        for route in ('/history?symbol=', '/quote?symbol=',
                      '/fundamentals?symbol=', '/symbols', '/sectors'):
            self.assertIn(route, READER_CODE, route)
        self.assertEqual(READER_CODE.count('requestJson('), 6)

    def test_the_map_cannot_be_reached_by_an_inherited_name(self):
        """A URL is not attacker-chosen here, but a plain object would answer
        `inFlight['constructor']` with a function and read it as a request."""
        self.assertIn('Object.create(null)', READER_CODE)


if __name__ == '__main__':
    unittest.main()
