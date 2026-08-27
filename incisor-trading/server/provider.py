#!/usr/bin/env python3
"""
Incisor Trading — provider response parsing.

This module is the only place in the project that knows what Alpha Vantage's
JSON looks like. Everything downstream — routes, cache, the front end — sees
the internal shapes defined here and nothing else. That containment is what
makes the provider choice reversible: swapping providers means rewriting this
file, not the dashboard (see docs/DATA-PROVIDER.md, where the choice is still
open pending a written display permission).

Pure functions, no I/O, no network, no clock. Where a payload comes from is
source.py's problem.

Two things about the upstream shapes drive most of the code below:

1. **Everything is a string.** Prices, volumes and the percentage all arrive
   quoted, and the percentage arrives with a literal '%' on the end. Numbers
   are the content of this page (guide section 13), so they are converted once,
   here, rather than being formatted from strings in six places.

2. **Errors arrive as HTTP 200.** Alpha Vantage signals a bad symbol, a
   throttle and an exhausted daily quota with a normal 200 response carrying a
   prose message under 'Error Message', 'Note' or 'Information' respectively.
   A parser that only checks the status code would happily serve a rate-limit
   notice as a quote, so each of those is recognised and raised as a typed
   ProviderError instead.
"""

# Internal quote shape, for reference by anything that consumes it:
#
#   {'symbol': 'SPY', 'price': 604.5456, 'change': 9.4447,
#    'change_percent': 1.5871, 'open': ..., 'high': ..., 'low': ...,
#    'previous_close': ..., 'volume': 93232810,
#    'latest_trading_day': '2026-08-26'}
#
# Internal history shape:
#
#   {'symbol': 'SPY', 'interval': 'daily', 'last_refreshed': '2026-08-26',
#    'bars': [{'date': ..., 'open': ..., 'high': ..., 'low': ...,
#              'close': ..., 'volume': ...}, ...]}   # oldest first

QUOTE_ENVELOPE = 'Global Quote'
DAILY_ENVELOPE = 'Time Series (Daily)'
DAILY_META = 'Meta Data'

# Upstream's prose-message keys, mapped to the reason we raise. The messages
# themselves are never shown to a caller (guide section 5) — only the reason.
MESSAGE_KEYS = {
    'Error Message': 'not_found',
    'Note': 'rate_limited',
    'Information': 'quota_exhausted',
}

_QUOTE_FIELDS = {
    'symbol': ('01. symbol', str),
    'open': ('02. open', float),
    'high': ('03. high', float),
    'low': ('04. low', float),
    'price': ('05. price', float),
    'volume': ('06. volume', int),
    'latest_trading_day': ('07. latest trading day', str),
    'previous_close': ('08. previous close', float),
    'change': ('09. change', float),
    'change_percent': ('10. change percent', 'percent'),
}

_BAR_FIELDS = {
    'open': ('1. open', float),
    'high': ('2. high', float),
    'low': ('3. low', float),
    'close': ('4. close', float),
    'volume': ('5. volume', int),
}


class ProviderError(Exception):
    """An upstream payload we cannot turn into data.

    `reason` is one of 'not_found', 'rate_limited', 'quota_exhausted' or
    'malformed'. It is a short machine token on purpose: it is safe to put in
    a response body, whereas the upstream message it came from is not.
    """

    def __init__(self, reason, detail=''):
        super().__init__(detail or reason)
        self.reason = reason
        self.detail = detail


def _to_number(raw, kind, field):
    """Convert one quoted upstream value, or fail loudly with the field name."""
    if not isinstance(raw, str):
        raise ProviderError('malformed', 'field %s is not a string' % field)
    text = raw.strip()
    try:
        if kind == 'percent':
            # '1.5871%' — the sign is decoration, not data.
            return float(text.rstrip('%'))
        if kind is int:
            # Volume is an integer in every response we have seen, but float()
            # first so a '93232810.0' would not blow up the whole quote.
            return int(float(text))
        return float(text)
    except ValueError:
        raise ProviderError('malformed', 'field %s is not a number' % field)


def _read_fields(source, spec, context):
    """Pull a flat dict of upstream keys into our own names and types."""
    result = {}
    for name, (key, kind) in spec.items():
        if key not in source:
            raise ProviderError('malformed', 'missing %s in %s' % (key, context))
        raw = source[key]
        if kind is str:
            if not isinstance(raw, str) or not raw.strip():
                raise ProviderError('malformed', 'empty %s in %s' % (key, context))
            result[name] = raw.strip()
        else:
            result[name] = _to_number(raw, kind, key)
    return result


def raise_for_message(payload):
    """Turn a 200-with-a-prose-message into the ProviderError it really is."""
    if not isinstance(payload, dict):
        raise ProviderError('malformed', 'payload is not an object')
    for key, reason in MESSAGE_KEYS.items():
        if key in payload:
            # The message is passed along as `detail` for the log only. It is
            # never returned to a caller — it can quote our own API key back
            # at us, and it is upstream prose either way.
            detail = payload[key] if isinstance(payload[key], str) else ''
            raise ProviderError(reason, detail)


def parse_quote(payload, expected_symbol):
    """GLOBAL_QUOTE payload -> internal quote dict.

    An unknown symbol comes back as an empty envelope rather than an error
    message, which is why the emptiness check is a not_found and not a
    malformed.
    """
    raise_for_message(payload)
    quote = payload.get(QUOTE_ENVELOPE)
    if not isinstance(quote, dict):
        raise ProviderError('malformed', 'no %s envelope' % QUOTE_ENVELOPE)
    if not quote:
        raise ProviderError('not_found', 'empty quote envelope')

    parsed = _read_fields(quote, _QUOTE_FIELDS, 'quote')
    if parsed['symbol'].upper() != expected_symbol:
        # A payload for the wrong symbol means a mixed-up cache key or a
        # confused upstream. Either way, serving it would show a visitor one
        # ticker's price under another ticker's name.
        raise ProviderError(
            'malformed',
            'asked for %s, payload is for %s' % (expected_symbol, parsed['symbol']))
    parsed['symbol'] = expected_symbol
    return parsed


def parse_daily_history(payload, expected_symbol):
    """TIME_SERIES_DAILY payload -> internal history dict, oldest bar first.

    Upstream keys the series by date, newest first. Dict order is not a
    contract, so the bars are sorted by date here and every consumer can rely
    on ascending order — a chart that renders its x-axis backwards because a
    provider changed key order is the kind of bug that looks like bad data.
    """
    raise_for_message(payload)
    series = payload.get(DAILY_ENVELOPE)
    if not isinstance(series, dict):
        raise ProviderError('malformed', 'no %s envelope' % DAILY_ENVELOPE)
    if not series:
        raise ProviderError('not_found', 'empty daily series')

    meta = payload.get(DAILY_META)
    meta = meta if isinstance(meta, dict) else {}
    meta_symbol = meta.get('2. Symbol', '')
    if isinstance(meta_symbol, str) and meta_symbol.strip():
        if meta_symbol.strip().upper() != expected_symbol:
            raise ProviderError(
                'malformed',
                'asked for %s, payload is for %s' % (expected_symbol, meta_symbol))

    bars = []
    for date in sorted(series):
        row = series[date]
        if not isinstance(row, dict):
            raise ProviderError('malformed', 'bar %s is not an object' % date)
        bar = _read_fields(row, _BAR_FIELDS, 'bar %s' % date)
        bar['date'] = date
        bars.append(bar)

    last_refreshed = meta.get('3. Last Refreshed')
    if not isinstance(last_refreshed, str) or not last_refreshed.strip():
        last_refreshed = bars[-1]['date']

    return {
        'symbol': expected_symbol,
        'interval': 'daily',
        'last_refreshed': last_refreshed.strip(),
        'bars': bars,
    }
