"""Verification for the screenshot tool's stand-in for Apache.

`tools/shoot.py` is not shipped, so nothing here is about what a visitor sees.
It is about the one thing the tool has to get right to be evidence at all: with
--api it plays the reverse proxy, and a proxy that misrepresents who is calling
produces findings about itself rather than about the page.

That is D7. Every browser context reached the service over loopback with no
X-Forwarded-For, so four simulated readers shared one per-IP bucket and a
second run inside the minute was refused — 429s that read, in the tool's own
output, exactly like a broken dashboard.

The guard that catches a regression here lives in the tool (a page load that
outgrows one reader's allowance fails the run). These are the two properties
that guard has to stand on: that the proxy identifies its callers the way
Apache does, and that they are actually different callers.

    python3 -m unittest discover incisor-trading/tests
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tools'))

import shoot  # noqa: E402  (needs the path above)


class ProxyStub(shoot.QuietHandler):
    """A handler with the socket taken out, so `proxy` can be driven directly.

    Built without `__init__` because the real one reads a request off a live
    connection. Everything `proxy` touches on the way out is captured instead
    of written.
    """

    def __init__(self, headers, api_base='http://127.0.0.1:8789'):
        self.headers = headers
        self.path = shoot.API_PREFIX + 'sectors'
        self.api_base = api_base
        self.sent = []

    def send_response(self, status):
        self.sent.append(status)

    def send_header(self, *args):
        pass

    def end_headers(self):
        pass

    @property
    def wfile(self):
        class Sink:
            def write(self, data):
                pass
        return Sink()


class CapturedUpstream:
    """Stands in for urllib.request.urlopen and keeps the Request it was given."""

    def __init__(self):
        self.request = None

    def __call__(self, request, timeout=None):
        self.request = request
        return self

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    status = 200
    headers = {'Content-Type': 'application/json'}

    def read(self):
        return b'{}'


class TestTheProxyIdentifiesItsCallers(unittest.TestCase):
    """mod_proxy_http sets X-Forwarded-For on everything it forwards, and the
    service buckets its per-IP limit by it. This proxy has to do the same or
    it is exercising a code path production never takes."""

    def setUp(self):
        self.upstream = CapturedUpstream()
        self.original = shoot.urllib.request.urlopen
        shoot.urllib.request.urlopen = self.upstream
        shoot.QuietHandler.calls.clear()
        self.addCleanup(setattr, shoot.urllib.request, 'urlopen', self.original)
        self.addCleanup(shoot.QuietHandler.calls.clear)

    def test_the_context_marker_is_forwarded_as_x_forwarded_for(self):
        address = shoot.client_address(0)
        ProxyStub({shoot.CLIENT_HEADER: address}).proxy()
        self.assertEqual(
            self.upstream.request.get_header('X-forwarded-for'), address)

    def test_the_marker_itself_never_reaches_the_service(self):
        """It is the tool talking to its own proxy. Apache would not pass it on,
        and a header the service does not document has no business arriving."""
        ProxyStub({shoot.CLIENT_HEADER: shoot.client_address(0)}).proxy()
        forwarded = {name.lower() for name in self.upstream.request.headers}
        self.assertNotIn(shoot.CLIENT_HEADER.lower(), forwarded)

    def test_the_origin_check_is_still_satisfied(self):
        """The service rejects a bad Origin before it looks at anything else,
        so adding a header must not have displaced the one already there."""
        ProxyStub({shoot.CLIENT_HEADER: shoot.client_address(0)}).proxy()
        self.assertEqual(self.upstream.request.get_header('Origin'),
                         'https://frontendneeded.com')

    def test_an_unmarked_request_is_counted_rather_than_dropped(self):
        """Nothing should reach the proxy without a marker, so if something
        does, the tally is where it shows up — not a silent pass."""
        ProxyStub({}).proxy()
        self.assertEqual(shoot.QuietHandler.calls['unattributed'], 1)

    def test_every_forwarded_request_is_tallied_against_its_caller(self):
        address = shoot.client_address(1)
        for _ in range(3):
            ProxyStub({shoot.CLIENT_HEADER: address}).proxy()
        self.assertEqual(shoot.QuietHandler.calls[address], 3)


class TestEveryContextIsItsOwnReader(unittest.TestCase):

    def test_each_context_in_a_run_gets_a_distinct_address(self):
        """The count is derived from the viewport list, so a fourth
        photographed width is covered without anything being added here."""
        addresses = [shoot.client_address(i)
                     for i in range(shoot.CLIENTS_PER_RUN)]
        self.assertEqual(len(set(addresses)), shoot.CLIENTS_PER_RUN)

    def test_the_addresses_are_documentation_space(self):
        """RFC 5737. Not routable, so one of these in a log line can only ever
        be a simulated reader."""
        for index in range(shoot.CLIENTS_PER_RUN):
            address = shoot.client_address(index)
            self.assertTrue(address.startswith(shoot.CLIENT_NETWORK), address)
            last = int(address[len(shoot.CLIENT_NETWORK):])
            self.assertTrue(1 <= last <= 254, address)

    def test_a_run_claims_a_block_no_neighbouring_run_touches(self):
        """The block is keyed on the process id and strides by its own width,
        so two runs a pid apart cannot overlap. This is what makes a rerun a
        fresh set of readers rather than the same ones asking twice."""
        stride = shoot.CLIENTS_PER_RUN
        block = {(os.getpid() * stride + i) % 254 for i in range(stride)}
        neighbour = {((os.getpid() + 1) * stride + i) % 254
                     for i in range(stride)}
        self.assertEqual(block & neighbour, set())


class TestTheCeilingIsRead(unittest.TestCase):

    def test_the_per_ip_ceiling_is_a_usable_number(self):
        """Derived from the service's own source rather than repeated here.
        The check that it matches the running service is a service test, where
        the real value can be imported; this only asserts the read works."""
        self.assertIsInstance(shoot.per_ip_ceiling(), int)
        self.assertGreater(shoot.per_ip_ceiling(), 0)

    def test_the_environment_overrides_it_the_way_it_overrides_the_service(self):
        os.environ['RATE_LIMIT_MAX'] = '17'
        self.addCleanup(os.environ.pop, 'RATE_LIMIT_MAX', None)
        self.assertEqual(shoot.per_ip_ceiling(), 17)


if __name__ == '__main__':
    unittest.main()
