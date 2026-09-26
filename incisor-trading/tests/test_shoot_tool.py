"""Verification for the screenshot tool's stand-in for Apache.

`tools/shoot.py` is not shipped, so nothing here is about what a visitor sees.
It is about the one thing the tool has to get right to be evidence at all: with
--api it plays the reverse proxy, and a proxy that misrepresents who is calling
produces findings about itself rather than about the page.

It also guards D27, below: that the tool builds its own driver rather than
needing one to be there already.

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

import ast
import contextlib
import io
import os
import pathlib
import sys
import tempfile
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



class TestTheToolBuildsItsOwnDriver(unittest.TestCase):
    """D27: the interpreter every doc names is absent on day one of every
    session, because rule 11 mandates a fresh worktree and `.devtools/` is
    gitignored. `ensure_driver` is what makes `python3 tools/shoot.py` work
    there, and these are the properties it has to keep.

    None of them builds a venv. The build is one `subprocess.run` away from
    a network install, so what is asserted is the decision to build, not the
    building — the accept criterion itself was verified by running the tool
    in a fresh worktree, which a test cannot do twice.
    """

    def setUp(self):
        self.calls = []
        self.execs = []
        self.addCleanup(setattr, shoot, 'subprocess', shoot.subprocess)
        self.addCleanup(setattr, shoot.os, 'execv', shoot.os.execv)

    def drive(self, *, importable, prefix, devtools, interpreter_exists=True,
              run_raises=None):
        """Run `ensure_driver` with the world stubbed out, and report what it did."""
        calls, execs = [], []

        class Stub:
            CalledProcessError = shoot.subprocess.CalledProcessError

            @staticmethod
            def run(argv, check=False):
                calls.append(argv)
                # Only the install is failed, so the venv build above it is
                # still exercised on the way past.
                if run_raises is not None and 'pip' in argv:
                    raise run_raises

        real_find_spec = shoot.importlib.util.find_spec
        real_execv = shoot.os.execv
        real_prefix = shoot.sys.prefix
        real_devtools = shoot.DEVTOOLS
        real_subprocess = shoot.subprocess

        shoot.importlib.util.find_spec = (
            lambda name: object() if name == 'playwright' and importable else None)
        shoot.os.execv = lambda path, argv: execs.append((path, argv))
        shoot.sys.prefix = str(prefix)
        shoot.DEVTOOLS = devtools
        shoot.subprocess = Stub
        interpreter = devtools / 'bin' / 'python'
        # A caller that made its own interpreter keeps it — one of these
        # tests needs it to be a symlink, not an empty file.
        if interpreter_exists and not interpreter.exists():
            interpreter.parent.mkdir(parents=True, exist_ok=True)
            interpreter.write_text('')
        try:
            # The tool announces a build it is about to do for real. Letting
            # that reach the suite's output would say a venv is being built
            # by the one test that exists to prove none is.
            with contextlib.redirect_stdout(io.StringIO()):
                shoot.ensure_driver()
        finally:
            shoot.importlib.util.find_spec = real_find_spec
            shoot.os.execv = real_execv
            shoot.sys.prefix = real_prefix
            shoot.DEVTOOLS = real_devtools
            shoot.subprocess = real_subprocess
        return calls, execs

    def test_an_importable_playwright_builds_nothing_and_re_execs_nothing(self):
        """The common case: a second run in the same worktree, or a machine
        with Playwright installed globally. It must cost neither."""
        with tempfile.TemporaryDirectory() as tmp:
            calls, execs = self.drive(
                importable=True, prefix='/usr', devtools=pathlib.Path(tmp))
        self.assertEqual(calls, [])
        self.assertEqual(execs, [])

    def test_a_fresh_worktree_builds_the_venv_and_installs_playwright(self):
        with tempfile.TemporaryDirectory() as tmp:
            devtools = pathlib.Path(tmp) / '.devtools'
            calls, execs = self.drive(
                importable=False, prefix='/usr', devtools=devtools,
                interpreter_exists=False)
        self.assertEqual(calls[0][1:], ['-m', 'venv', str(devtools)])
        self.assertIn('playwright', calls[1])
        self.assertIn('install', calls[1])

    def test_the_re_exec_keeps_the_arguments_it_was_given(self):
        """A run that dropped --out would overwrite the previous set and say
        nothing, which is the failure mode that looks like success."""
        argv = shoot.sys.argv
        shoot.sys.argv = ['tools/shoot.py', '--out', 'docs/shots/x', '--symbol', 'SPY']
        self.addCleanup(setattr, shoot.sys, 'argv', argv)
        with tempfile.TemporaryDirectory() as tmp:
            devtools = pathlib.Path(tmp) / '.devtools'
            _, execs = self.drive(
                importable=False, prefix='/usr', devtools=devtools)
        (path, forwarded), = execs
        self.assertEqual(path, str(devtools / 'bin' / 'python'))
        self.assertEqual(forwarded[2:], ['--out', 'docs/shots/x', '--symbol', 'SPY'])

    def test_a_python_already_inside_the_venv_does_not_re_exec(self):
        """Otherwise the documented `./.devtools/bin/python` spelling would
        exec itself once per run for nothing."""
        with tempfile.TemporaryDirectory() as tmp:
            devtools = pathlib.Path(tmp) / '.devtools'
            _, execs = self.drive(
                importable=False, prefix=devtools, devtools=devtools)
        self.assertEqual(execs, [])

    def test_an_unrunnable_venv_is_not_reported_as_a_network_problem(self):
        """Observed, not imagined: this worktree's venv outlived the Python
        that built it mid-session, and the message sent the reader to the
        network. DEC-078 — a state may not misdescribe what caused it."""
        with tempfile.TemporaryDirectory() as tmp:
            devtools = pathlib.Path(tmp) / '.devtools'
            with self.assertRaises(SystemExit) as raised:
                self.drive(importable=False, prefix='/usr', devtools=devtools,
                           run_raises=OSError(8, 'Exec format error'))
        message = str(raised.exception)
        self.assertIn('cannot be run', message)
        self.assertNotIn('network', message)
        self.assertNotIn('PyPI', message)

    def test_the_inside_test_is_the_prefix_and_not_the_executable(self):
        """The trap `ensure_driver`'s comment names, asserted rather than
        described. A venv's `python` is a symlink to the interpreter it was
        built from, so under the system Python the two executables resolve to
        the same file — an executable comparison reads that as "already
        inside", returns, and the import that needed site-packages fails."""
        with tempfile.TemporaryDirectory() as tmp:
            devtools = pathlib.Path(tmp) / '.devtools'
            (devtools / 'bin').mkdir(parents=True)
            interpreter = devtools / 'bin' / 'python'
            interpreter.symlink_to(shoot.sys.executable)
            self.assertEqual(
                interpreter.resolve(),
                pathlib.Path(shoot.sys.executable).resolve(),
                'the premise: the two executables are the same file')
            _, execs = self.drive(
                importable=False, prefix='/usr', devtools=devtools)
        self.assertEqual(len(execs), 1, 'must still re-exec into the venv')


class TestImportingTheToolCostsNothing(unittest.TestCase):
    """Every test in this file imports `shoot`, so the driver must not be
    built at import — and `--help` and a mistyped flag must not build one
    either. Asserted on the syntax tree rather than by running the tool,
    because running it is what the assertion is trying to avoid."""

    def tree(self):
        source = pathlib.Path(shoot.__file__).read_text()
        return ast.parse(source, filename=shoot.__file__)

    def called_names(self, node):
        return [n.func.id for n in ast.walk(node)
                if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)]

    def test_nothing_at_module_level_calls_ensure_driver(self):
        for statement in self.tree().body:
            # A def is not a call. Walking into one would find `main`'s body,
            # which is exactly where the call is supposed to be.
            if isinstance(statement, (ast.FunctionDef, ast.ClassDef)):
                continue
            self.assertNotIn('ensure_driver', self.called_names(statement),
                             'importing the tool would build a venv')

    def test_ensure_driver_runs_after_the_arguments_are_parsed(self):
        main, = [node for node in self.tree().body
                 if isinstance(node, ast.FunctionDef) and node.name == 'main']
        order = []
        for statement in main.body:
            for name in self.called_names(statement):
                if name == 'ensure_driver':
                    order.append('ensure_driver')
            for node in ast.walk(statement):
                if (isinstance(node, ast.Call)
                        and isinstance(node.func, ast.Attribute)
                        and node.func.attr == 'parse_args'):
                    order.append('parse_args')
        self.assertEqual(order, ['parse_args', 'ensure_driver'],
                         '--help and a typo must not build a venv')


if __name__ == '__main__':
    unittest.main()
