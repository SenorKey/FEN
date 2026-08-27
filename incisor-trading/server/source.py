#!/usr/bin/env python3
"""
Incisor Trading — where a provider payload comes from.

One seam between the routes and the outside world. In fixture mode it reads
committed JSON off disk; in live mode it calls the provider over HTTPS. Callers
ask for a payload and never care which of the two answered.

In fixture mode `requests` is never imported, so
`INCISOR_DATA_SOURCE=fixture` makes network access impossible rather than
merely unlikely — the import happens inside the live branch, which is the one
thing in this project that opens a socket.

Nothing here caches, counts or rations. fetcher.py does all three, and it is
the only module that may call fetch().

Layout under fixtures/:

    fixtures/<endpoint>/<SYMBOL>-<YYYY-MM-DD>.json

The date is the day the payload was written or captured. Files accumulate
rather than overwrite, and the newest date for a symbol wins — so refreshing a
fixture (backlog S3) is a drop-in, and the file it replaced stays in the
history as evidence of what the shape used to be.
"""

import json
import os

from provider import ProviderError

UPSTREAM_URL = 'https://www.alphavantage.co/query'

# Our endpoint names mapped to the provider's `function` parameter. A caller
# cannot name a provider function directly; it can only pick one of these.
UPSTREAM_FUNCTIONS = {
    'global-quote': 'GLOBAL_QUOTE',
    'time-series-daily': 'TIME_SERIES_DAILY',
}

# Long enough for a slow upstream, short enough that a hung request does not
# hold a worker thread while the dashboard waits.
UPSTREAM_TIMEOUT_SEC = 10

QUOTE = 'global-quote'
DAILY = 'time-series-daily'

FIXTURE_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures')

# Only these two directories are ever read. A payload cannot be summoned from
# anywhere else on disk by asking for a creative endpoint name.
ENDPOINTS = (QUOTE, DAILY)


class SourceUnavailable(Exception):
    """No payload can be produced at all — a configuration or plumbing fault.

    Distinct from ProviderError, which means we reached a source and it said
    no. This one means we never got that far.
    """


def _fixture_path(endpoint, symbol):
    """Newest committed fixture for a symbol, or None if there is none.

    The symbol has already passed the service's whitelist, so it holds only
    letters, dots and hyphens. The containment check below is belt-and-braces
    against that whitelist ever loosening: a path that resolves outside the
    fixture root is refused rather than read.
    """
    if endpoint not in ENDPOINTS:
        raise SourceUnavailable('unknown endpoint %r' % endpoint)

    folder = os.path.join(FIXTURE_ROOT, endpoint)
    if not os.path.isdir(folder):
        raise SourceUnavailable('fixture directory missing: %s' % folder)

    prefix = symbol + '-'
    names = sorted(
        name for name in os.listdir(folder)
        if name.startswith(prefix) and name.endswith('.json')
    )
    if not names:
        return None

    # ISO dates sort lexicographically, so the last name is the newest capture.
    path = os.path.realpath(os.path.join(folder, names[-1]))
    if not path.startswith(os.path.realpath(folder) + os.sep):
        raise SourceUnavailable('fixture path escaped the fixture root')
    return path


def load_fixture(endpoint, symbol):
    """Read one committed payload. Returns the parsed JSON, exactly as stored."""
    path = _fixture_path(endpoint, symbol)
    if path is None:
        raise ProviderError('not_found', 'no %s fixture for %s' % (endpoint, symbol))
    try:
        with open(path) as handle:
            return json.load(handle)
    except (OSError, ValueError) as exc:
        # A fixture we committed being unreadable is our bug, not the caller's.
        raise SourceUnavailable('unreadable fixture %s: %s' % (path, exc))


def upstream_url_parameters(endpoint, symbol, api_key):
    """The query parameters for one upstream call.

    Split out from the call itself so the URL construction can be tested
    without a network, which is the only way it ever gets tested: live mode
    has never run (docs/DATA-PROVIDER.md).
    """
    if endpoint not in UPSTREAM_FUNCTIONS:
        raise SourceUnavailable('unknown endpoint %r' % endpoint)
    parameters = {
        'function': UPSTREAM_FUNCTIONS[endpoint],
        'symbol': symbol,
        'apikey': api_key,
    }
    if endpoint == 'time-series-daily':
        # 100 sessions, against `full`'s 20+ years. The dashboard's longest
        # range is 1Y and the payload is a fraction of the size.
        parameters['outputsize'] = 'compact'
    return parameters


def fetch_live(endpoint, symbol, api_key):
    """Call the provider once. The only outbound request in the project.

    `requests` is imported here rather than at module scope so that fixture
    mode genuinely cannot reach the network — there is no HTTP client loaded
    to reach it with. tests/test_fixture_layer.py asserts exactly that.
    """
    import requests

    parameters = upstream_url_parameters(endpoint, symbol, api_key)
    try:
        response = requests.get(
            UPSTREAM_URL, params=parameters, timeout=UPSTREAM_TIMEOUT_SEC)
    except requests.RequestException as exc:
        # str(exc) can contain the full URL, and the URL contains the key.
        # Only the exception's type is safe to repeat.
        raise SourceUnavailable('upstream request failed: %s' % type(exc).__name__)

    if response.status_code != 200:
        raise SourceUnavailable('upstream returned HTTP %d' % response.status_code)

    try:
        return response.json()
    except ValueError:
        # Upstream answers a malformed request with an HTML page often enough
        # that this is a normal path, not an exceptional one.
        raise SourceUnavailable('upstream returned a non-JSON body')


def fetch(endpoint, symbol, data_source, api_key=''):
    """Get a raw provider payload for one endpoint and symbol.

    `data_source` and `api_key` are passed in rather than read from the
    environment here, so this module stays testable and exactly one caller
    decides the mode. Call it through fetcher.py, never directly: this
    function has no cache and no budget behind it.
    """
    if data_source == 'fixture':
        return load_fixture(endpoint, symbol)
    if not api_key:
        raise SourceUnavailable('live mode requires an upstream API key')
    return fetch_live(endpoint, symbol, api_key)


def redact(text_with_key, api_key):
    """Remove a key from anything about to be logged.

    Upstream echoes the key back in some error bodies and it appears in every
    URL we build, so the log line is the realistic place for it to escape.
    """
    if not api_key:
        return text_with_key
    return text_with_key.replace(api_key, '[redacted]')
