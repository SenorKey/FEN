#!/usr/bin/env python3
"""
Incisor Trading — where a provider payload comes from.

One seam between the routes and the outside world. In fixture mode it reads
committed JSON off disk and touches nothing else; in live mode it will call the
cached fetcher, which is the next backlog task (T4). Routes ask this module for
a payload and never care which of the two answered.

Fixture mode is the default and is what every session, test run and fresh
checkout uses, so `INCISOR_DATA_SOURCE=fixture` genuinely makes network access
impossible rather than merely unlikely: there is no HTTP client in this file to
call.

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


def fetch(endpoint, symbol, data_source):
    """Get a raw provider payload for one endpoint and symbol.

    `data_source` is the service's INCISOR_DATA_SOURCE value, passed in rather
    than read from the environment here so this module stays testable and has
    exactly one caller deciding the mode.
    """
    if data_source == 'fixture':
        return load_fixture(endpoint, symbol)
    # Live mode is configurable today because the service has always accepted
    # it, but the thing that would make the call — the cached, quota-counted
    # fetcher — is T4. Until then live mode fails closed and says so, which is
    # the honest behaviour: the alternative is a route that looks like it works
    # and silently serves nothing.
    raise SourceUnavailable(
        'live mode has no fetcher yet; it lands with the snapshot cache (T4)')
