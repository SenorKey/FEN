#!/usr/bin/env python3
"""
Incisor Trading — where a provider payload comes from.

One seam between the routes and the outside world. In fixture mode it reads
committed JSON off disk; in live mode it calls a provider over HTTPS. Callers
ask for a payload and never care which of the two answered.

**Two upstreams, one seam.** Prices come from Alpha Vantage, which needs a key
and rations us to twenty-five calls a day. Filings come from SEC EDGAR, which
is public domain, needs no key and no account, and allows ten requests a
second — which is why fundamentals are on it at all (docs/DECISIONS.md). They
differ in host, in authentication and in how a symbol is named, so each
endpoint below declares its upstream and the two never mix.

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
import re

from provider import ProviderError

UPSTREAM_URL = 'https://www.alphavantage.co/query'

# EDGAR's two documented JSON endpoints. The ticker map is fetched because it
# is published and changes as companies list and delist; a copy committed here
# would go stale silently, and a stale CIK does not fail — it returns another
# company's filings under our symbol.
EDGAR_FACTS_URL = 'https://data.sec.gov/api/xbrl/companyfacts/CIK%s.json'
EDGAR_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json'

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
COMPANY_FACTS = 'company-facts'

# Which upstream answers each endpoint. Read by fetcher.py to score the daily
# budget against the one provider that has one — counting the whole call log
# would charge a free SEC request to Alpha Vantage's allowance and undo the
# reason for having two upstreams at all.
ALPHA_VANTAGE = 'alpha-vantage'
EDGAR = 'edgar'
UPSTREAM_OF = {
    QUOTE: ALPHA_VANTAGE,
    DAILY: ALPHA_VANTAGE,
    COMPANY_FACTS: EDGAR,
}

FIXTURE_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures')

# Only these directories are ever read. A payload cannot be summoned from
# anywhere else on disk by asking for a creative endpoint name.
ENDPOINTS = (QUOTE, DAILY, COMPANY_FACTS)

# <SYMBOL>-<YYYY-MM-DD>.json, the layout described in the module docstring.
FIXTURE_NAME = re.compile(r'^(?P<symbol>.+)-\d{4}-\d{2}-\d{2}\.json$')


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


def available_symbols(endpoint):
    """Symbols with a committed fixture for one endpoint.

    Fixture mode can only answer for what is on disk, so this is what makes
    the /symbols route tell the truth about which symbols are actually
    priceable rather than listing names nothing can quote. Live mode has no
    equivalent question — the provider answers for anything listed.
    """
    if endpoint not in ENDPOINTS:
        raise SourceUnavailable('unknown endpoint %r' % endpoint)
    folder = os.path.join(FIXTURE_ROOT, endpoint)
    if not os.path.isdir(folder):
        raise SourceUnavailable('fixture directory missing: %s' % folder)
    found = set()
    for name in os.listdir(folder):
        # A symbol may itself contain hyphens (RDS-A), so the date suffix is
        # matched as a whole rather than split on the last hyphen — which
        # would leave every symbol carrying half a date.
        match = FIXTURE_NAME.match(name)
        if match:
            found.add(match.group('symbol'))
    return found


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
        # `compact` is 100 sessions, which is under five months — not enough
        # for the 52-week range the quote panel shows, and the shortfall would
        # be invisible rather than obvious. `full` costs the same single call
        # against the daily budget and differs only in payload size, which
        # fetcher.py bounds before anything is stored or served.
        parameters['outputsize'] = 'full'
    return parameters


def _get_json(url, parameters=None, headers=None):
    """One outbound GET returning parsed JSON. The only network call here.

    `requests` is imported inside rather than at module scope so that fixture
    mode genuinely cannot reach the network — there is no HTTP client loaded
    to reach it with. tests/test_fixture_layer.py asserts exactly that.
    """
    import requests

    try:
        response = requests.get(url, params=parameters, headers=headers,
                                timeout=UPSTREAM_TIMEOUT_SEC)
    except requests.RequestException as exc:
        # str(exc) can contain the full URL, and an Alpha Vantage URL contains
        # the key. Only the exception's type is safe to repeat.
        raise SourceUnavailable('upstream request failed: %s' % type(exc).__name__)

    if response.status_code != 200:
        raise SourceUnavailable('upstream returned HTTP %d' % response.status_code)

    try:
        return response.json()
    except ValueError:
        # Upstream answers a malformed request with an HTML page often enough
        # that this is a normal path, not an exceptional one.
        raise SourceUnavailable('upstream returned a non-JSON body')


def fetch_live(endpoint, symbol, api_key):
    """Call Alpha Vantage once for one price endpoint."""
    return _get_json(UPSTREAM_URL,
                     upstream_url_parameters(endpoint, symbol, api_key))


# Ticker -> CIK, held for the life of the process once EDGAR has been asked.
#
# In memory rather than in the database on purpose. It is not market data: it
# is the plumbing that turns a symbol into a URL, it costs nothing against any
# budget, and the service runs a single worker (incisor-trading.service), so
# process memory is the whole truth. A restart re-fetches it, which is one
# free request against a ten-a-second allowance.
_cik_by_ticker = None


def edgar_headers(contact):
    """The User-Agent EDGAR requires, or a refusal saying so.

    EDGAR asks every automated client to identify the application and give a
    contact address, and answers a request without one with a 403. The address
    is Key's to choose and lives in config.env beside the API key — it is not
    in this repository, which is public.
    """
    if not contact:
        raise SourceUnavailable(
            'live filings need a contact address for the EDGAR User-Agent')
    return {'User-Agent': 'Incisor Trading (%s)' % contact,
            'Accept-Encoding': 'gzip, deflate'}


def edgar_cik(symbol, contact):
    """The ten-digit CIK EDGAR files `symbol` under.

    The map is fetched rather than committed because EDGAR publishes it and it
    changes as companies list and delist. A stale CIK does not fail loudly —
    it returns another company's filings under our symbol — so a copy in this
    repository would be a quiet way to show the wrong company's revenue.
    """
    global _cik_by_ticker

    if _cik_by_ticker is None:
        listed = _get_json(EDGAR_TICKERS_URL, headers=edgar_headers(contact))
        # The published shape is an object keyed by row number, each row
        # carrying `cik_str` and `ticker`. Read row by row and keep what
        # parses: one malformed entry must not cost the whole map.
        rows = listed.values() if isinstance(listed, dict) else []
        _cik_by_ticker = {
            str(row['ticker']).upper(): '%010d' % int(row['cik_str'])
            for row in rows
            if isinstance(row, dict) and row.get('ticker') and row.get('cik_str')
        }

    # EDGAR spells a share class with a hyphen where the quote provider uses a
    # dot: BRK.B is filed as BRK-B. Both are tried rather than guessed between.
    for candidate in (symbol, symbol.replace('.', '-')):
        cik = _cik_by_ticker.get(candidate.upper())
        if cik:
            return cik
    raise ProviderError('not_found', 'no SEC filer is listed under %s' % symbol)


def fetch_edgar(symbol, contact):
    """One symbol's company facts from EDGAR."""
    return _get_json(EDGAR_FACTS_URL % edgar_cik(symbol, contact),
                     headers=edgar_headers(contact))


def reset_cik_map():
    """Drop the ticker map. For tests only."""
    global _cik_by_ticker
    _cik_by_ticker = None


def fetch(endpoint, symbol, data_source, api_key='', edgar_contact=''):
    """Get a raw provider payload for one endpoint and symbol.

    The mode and both credentials are passed in rather than read from the
    environment here, so this module stays testable and exactly one caller
    decides the mode. Call it through fetcher.py, never directly: this
    function has no cache and no budget behind it.
    """
    if data_source == 'fixture':
        return load_fixture(endpoint, symbol)
    if UPSTREAM_OF.get(endpoint) == EDGAR:
        return fetch_edgar(symbol, edgar_contact)
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
