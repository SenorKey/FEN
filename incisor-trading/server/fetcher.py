#!/usr/bin/env python3
"""
Incisor Trading — the cache, and the only code allowed to call upstream.

Every route goes through get_quote() or get_history(). Neither the routes nor
anything else may reach source.py directly, because this module is where the
two things that keep the project alive happen: the cache that stops a page
refresh costing a call, and the budget that stops us spending a day's quota in
a minute.

The free tier is **25 requests per day** (docs/DATA-PROVIDER.md). That number,
not the licence, is what shapes the dashboard, so the guard around it is
deliberately conservative:

1. A fresh cache entry is served without asking anyone.
2. A stale entry with budget left is refreshed.
3. A stale entry with **no** budget left is served stale, flagged as stale.
   Degrading to yesterday's close is a far better outcome than an empty page,
   and quota exhaustion is treated as a denial-of-service condition to be
   absorbed rather than passed on (guide section 5).
4. Nothing cached and no budget is the only case that fails.

Per-symbol locking means concurrent requests for the same symbol produce one
call, not one per thread. The service runs a single worker precisely so this
in-process state is the whole truth (see incisor-trading.service).

Caching applies in fixture mode too. It costs nothing, and it means the cache
path is exercised by every session and every test run rather than only in a
live mode that is currently switched off. The practical cost is that editing a
fixture will not show up until its TTL expires or the scratch database is
dropped.
"""

import datetime
import threading

import provider
import source
import store

# Per-endpoint freshness, in seconds.
#
# Quotes are end-of-day oriented, so six hours means a symbol is refreshed at
# most four times a day. Four ETF proxies at that rate is sixteen calls, which
# fits inside 25 with room for a visitor to look something up. T5's market
# clock can make this close-aware later; a flat TTL is the honest version until
# something knows when the close was.
TTL_SECONDS = {
    source.QUOTE: 6 * 60 * 60,
    source.DAILY: 24 * 60 * 60,
}

# Held back from the documented 25 so a burst of searches cannot leave the
# dashboard's own proxies unrefreshed tomorrow morning.
DAILY_CALL_BUDGET = 22

# How much daily history is kept and served. Upstream is asked for the `full`
# series because nothing shorter covers a 52-week range, and that runs to
# twenty-odd years — a payload worth receiving once and not worth storing per
# symbol or sending to a browser. Five years is the longest range the dashboard
# will offer, so it is where the series is cut.
MAX_DAILY_BARS = 5 * 252

_locks = {}
_locks_guard = threading.Lock()

# endpoint -> how to read it from the cache, write it back, and parse it.
# Named rather than positional so the call sites read as English.
_HANDLERS = {
    source.QUOTE: {
        'load': store.load_quote,
        'save': store.save_quote,
        'parse': provider.parse_quote,
    },
    source.DAILY: {
        'load': store.load_history,
        'save': store.save_history,
        'parse': provider.parse_daily_history,
    },
}


class Unavailable(Exception):
    """Nothing could be served: no usable cache and no way to get one."""


def _lock_for(endpoint, symbol):
    """One lock per endpoint and symbol, created on demand.

    The dictionary only ever grows by the number of distinct symbols asked
    for, which the watchlist cap (T9) bounds, so there is nothing to evict.
    """
    key = (endpoint, symbol)
    with _locks_guard:
        lock = _locks.get(key)
        if lock is None:
            lock = threading.Lock()
            _locks[key] = lock
        return lock


def _age_seconds(fetched_at):
    """Seconds since an ISO timestamp, or None if it cannot be read."""
    try:
        stamp = datetime.datetime.fromisoformat(fetched_at)
    except (TypeError, ValueError):
        return None
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=datetime.timezone.utc)
    now = datetime.datetime.now(datetime.timezone.utc)
    return (now - stamp).total_seconds()


def is_fresh(endpoint, fetched_at):
    """Whether a cache entry is still inside its TTL.

    An unreadable timestamp counts as stale. That is the safe direction: it
    costs at most one call, where trusting it could serve a price forever.
    """
    age = _age_seconds(fetched_at)
    return age is not None and age < TTL_SECONDS[endpoint]


def budget_remaining():
    """Calls left in today's self-imposed budget. Never negative.

    Only live calls are scored. Fixture reads go in the same log — they are
    genuine cache misses and worth being able to see — but they are local file
    reads, and letting a session's fixture traffic eat the live allowance
    would make the budget lie in both directions.
    """
    return max(0, DAILY_CALL_BUDGET - store.calls_today('live'))


def quota_status():
    """The queryable counter, for diagnostics and the T13 status surface."""
    used = store.calls_today('live')
    return {
        'used_today': used,
        'budget': DAILY_CALL_BUDGET,
        'remaining': max(0, DAILY_CALL_BUDGET - used),
    }


def bounded(endpoint, parsed):
    """The tail of a daily series, capped at MAX_DAILY_BARS. Other shapes pass.

    Applied on the way in rather than on the way out, so the cap is what gets
    stored: an untrimmed series would grow the cache by two decades of bars per
    symbol to serve five years of them.
    """
    if endpoint != source.DAILY:
        return parsed
    if len(parsed['bars']) <= MAX_DAILY_BARS:
        return parsed
    trimmed = dict(parsed)
    trimmed['bars'] = parsed['bars'][-MAX_DAILY_BARS:]
    return trimmed


def _refresh(endpoint, symbol, data_source, api_key):
    """Call the source once, parse it, and store what came back.

    Returns (data, fetched_at). One timestamp is generated here and used for
    both the row and the reply, so the age a caller is told on the fetch is
    the same age every later caller reads back out of the cache.

    Only reached with the symbol's lock held and the budget already checked.
    """
    handler = _HANDLERS[endpoint]
    status = 'error'
    try:
        payload = source.fetch(endpoint, symbol, data_source, api_key)
        parsed = bounded(endpoint, handler['parse'](payload, symbol))
        status = 'ok'
    except provider.ProviderError as exc:
        status = exc.reason
        raise
    finally:
        # Logged even on failure: a call that errored still spent quota, and a
        # budget that only counts successes is optimistic in exactly the
        # situation where it must not be. Fixture reads are free and are
        # recorded as such so the two can be told apart in the log.
        store.record_call(endpoint, symbol, status, data_source)

    fetched_at = store.now_utc_iso()
    handler['save'](parsed, fetched_at)
    return parsed, fetched_at


def get(endpoint, symbol, data_source, api_key=''):
    """Cached data for one endpoint and symbol.

    Returns (data, meta), where meta carries `cached`, `stale` and
    `fetched_at` so the page can say how old what it is showing is.
    """
    if endpoint not in _HANDLERS:
        raise Unavailable('unknown endpoint %r' % endpoint)

    load = _HANDLERS[endpoint]['load']

    cached, fetched_at = load(symbol)
    if cached is not None and is_fresh(endpoint, fetched_at):
        return cached, {'cached': True, 'stale': False, 'fetched_at': fetched_at}

    with _lock_for(endpoint, symbol):
        # Re-read inside the lock: whoever held it may have just refreshed
        # this very symbol, and taking the cache on trust from before the wait
        # is how one stampede becomes four calls.
        cached, fetched_at = load(symbol)
        if cached is not None and is_fresh(endpoint, fetched_at):
            return cached, {'cached': True, 'stale': False, 'fetched_at': fetched_at}

        # Fixture reads are local file reads. They cost no quota and must not
        # be able to exhaust a budget that exists to ration network calls.
        if data_source == 'live' and budget_remaining() <= 0:
            if cached is not None:
                return cached, {'cached': True, 'stale': True,
                                'fetched_at': fetched_at}
            raise Unavailable('daily call budget exhausted and nothing cached')

        try:
            fresh, fresh_at = _refresh(endpoint, symbol, data_source, api_key)
        except (provider.ProviderError, source.SourceUnavailable):
            # A symbol we have never held has nothing to fall back to, so the
            # error is the answer. One we do hold is better served stale than
            # not at all — an upstream hiccup should not blank the dashboard.
            if cached is None:
                raise
            return cached, {'cached': True, 'stale': True, 'fetched_at': fetched_at}

        return fresh, {'cached': False, 'stale': False, 'fetched_at': fresh_at}


def get_quote(symbol, data_source, api_key=''):
    return get(source.QUOTE, symbol, data_source, api_key)


def get_history(symbol, data_source, api_key=''):
    return get(source.DAILY, symbol, data_source, api_key)


def reset_locks():
    """Drop the per-symbol locks. For tests only."""
    with _locks_guard:
        _locks.clear()
