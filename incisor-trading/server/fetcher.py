#!/usr/bin/env python3
"""
Incisor Trading — the cache, and the only code allowed to call upstream.

Every route goes through get_quote(), get_history() or get_fundamentals().
Neither the routes nor anything else may reach source.py directly, because this module is where the
two things that keep the project alive happen: the cache that stops a page
refresh costing a call, and the budget that stops us spending a day's quota in
a minute.

The free tier is **25 requests per day, and 5 per minute**
(docs/DATA-PROVIDER.md). The daily figure is what shapes the dashboard, so the
guard around it is deliberately conservative:

1. A fresh cache entry is served without asking anyone.
2. A stale entry with budget left is refreshed.
3. A stale entry with **no** budget left is served stale, flagged as stale.
   Degrading to yesterday's close is a far better outcome than an empty page,
   and quota exhaustion is treated as a denial-of-service condition to be
   absorbed rather than passed on (guide section 5).
4. Nothing cached and no budget is the only case that fails.

The per-minute limit is enforced by the same mechanism from the other end: a
call that would come too soon after the last one is simply not permitted, and
lands in case 2 or 3 above rather than going out and being throttled (D17).
Nothing sleeps; see Pacer.

Per-symbol locking means concurrent requests for the same symbol produce one
call, not one per thread. The service runs a single worker precisely so this
in-process state is the whole truth (see incisor-trading.service).

Caching applies in fixture mode too. It costs nothing, and it means the cache
path is exercised by every session and every test run rather than only in a
live mode that is currently switched off. The practical cost is that editing a
fixture will not show up until its TTL expires or the scratch database is
dropped.

**The cache is keyed by source as well as by symbol** (D16). Every load below
states the mode it will accept, and a row written by the other one is a miss:
fixture prices are invented, so serving them to a live request is not a stale
answer but a false one. The mode therefore also decides what a cold cache
costs — flipping to live starts from nothing, which is ~15 calls of the day's
22, and is an operation to stage rather than to discover.
"""

import datetime
import threading
import time

import edgar
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
    # Filings change four times a year. A day is far shorter than it needs to
    # be and costs nothing — EDGAR is not the rationed upstream — but it is
    # the freshness guide section 10 names for fundamentals, and a TTL that
    # matches the stated policy is worth more than one tuned to the filing
    # calendar.
    source.COMPANY_FACTS: 24 * 60 * 60,
}

# Held back from the documented 25 so a burst of searches cannot leave the
# dashboard's own proxies unrefreshed tomorrow morning.
DAILY_CALL_BUDGET = 22

# The *other* documented limit, and the one nothing enforced until D17.
# Alpha Vantage allows 25 requests a day **and 5 a minute**
# (docs/DATA-PROVIDER.md). The daily figure shapes the product and has a
# table, a counter and a reserve around it; the per-minute figure had nothing,
# so on 09-13 four /history calls left in eight milliseconds, drew the
# throttle notice, and spent four of the day's calls on replies carrying no
# data — a throttled reply costs exactly what a good one costs.
#
# Enforced as a minimum spacing rather than a five-per-sixty-seconds window,
# deliberately. A window would have permitted that burst — four is fewer than
# five — and it drew a throttle anyway, so the burst is what upstream objects
# to and spacing is what answers it. Twelve seconds is the documented rate
# expressed the strict way, and it cannot exceed the window either.
#
# Only the rationed upstream is paced. EDGAR allows ten requests a second and
# this page makes at most two per request, so it is three orders of magnitude
# from its limit and a gate there would be ceremony (guide section 4's
# proportionality, applied to rate rather than security).
UPSTREAM_MIN_INTERVAL_SEC = {
    source.ALPHA_VANTAGE: 60.0 / 5,
}

# How long a throttle notice buys upstream. It has just told us we are asking
# too often, which is better information than our own clock, and the honest
# reading is that our spacing was not enough rather than that it was unlucky.
THROTTLE_BACKOFF_SEC = 60.0

# How much daily history is kept and served. Upstream is asked for the `full`
# series because nothing shorter covers a 52-week range, and that runs to
# twenty-odd years — a payload worth receiving once and not worth storing per
# symbol or sending to a browser. Five years is the longest range the dashboard
# will offer, so it is where the series is cut.
MAX_DAILY_BARS = 5 * 252

_locks = {}
_locks_guard = threading.Lock()


class Pacer:
    """One upstream's earliest next call. In-process, like the locks.

    **It declines rather than waits.** Sleeping until the slot opens would be
    the obvious version and is the wrong one here: the service runs a single
    worker on purpose (incisor-trading.service), so a twelve-second sleep
    inside a request is twelve seconds during which the whole page is
    unanswerable — and a cold cache needs about fifteen calls, which is three
    minutes of that. Declining costs nothing and lands in a path that already
    exists and is already tested: a refusal to refresh is served from cache
    and flagged stale, exactly as an exhausted budget is (see get()). The
    dashboard fills over the next few page loads instead of hanging on one.

    `reserve()` takes the slot as it checks, so a call that then fails still
    spent it. That is the truth of the thing — a throttled reply costs the
    same as a good one — and the alternative retries straight into the limit.
    """

    def __init__(self, min_interval):
        self.min_interval = min_interval
        self._guard = threading.Lock()
        self._next_allowed = 0.0

    def reserve(self):
        """Take the next slot if it is open. True if the caller may call."""
        with self._guard:
            now = time.monotonic()
            if now < self._next_allowed:
                return False
            self._next_allowed = now + self.min_interval
            return True

    def back_off(self, seconds):
        """Hold off at least this long — upstream said we are too fast."""
        with self._guard:
            self._next_allowed = max(self._next_allowed,
                                     time.monotonic() + seconds)

    def reset(self):
        with self._guard:
            self._next_allowed = 0.0


_pacers = {upstream: Pacer(interval)
           for upstream, interval in UPSTREAM_MIN_INTERVAL_SEC.items()}


def _pacer_for(endpoint):
    """The pacer guarding this endpoint's upstream, or None if it has none."""
    return _pacers.get(source.UPSTREAM_OF.get(endpoint))


def may_call_now(endpoint):
    """Whether an upstream call for this endpoint may go out, taking the slot.

    Side-effecting on purpose — see Pacer.reserve. Call it only where the call
    is otherwise going to be made.
    """
    pacer = _pacer_for(endpoint)
    return True if pacer is None else pacer.reserve()

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
    source.COMPANY_FACTS: {
        'load': store.load_fundamentals,
        'save': store.save_fundamentals,
        'parse': edgar.parse_company_facts,
    },
}

# The endpoints the daily budget is scored over: the ones answered by the
# upstream that has a budget. Derived from source.py rather than listed,
# because the fact of which provider serves what lives there and a second copy
# here would be a second thing to keep in step.
RATIONED_ENDPOINTS = tuple(
    endpoint for endpoint, upstream in source.UPSTREAM_OF.items()
    if upstream == source.ALPHA_VANTAGE)


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


def is_fresh(endpoint, fetched_at, max_age=None):
    """Whether a cache entry is still inside the freshness it is being read at.

    `max_age` lets a caller state the freshness it actually needs rather than
    inheriting the endpoint's. Both surfaces that read a daily series want a
    different answer: the tiles and the quote panel want today's close, and
    the sector grid wants a month of history, which does not change materially
    when its end moves by a few sessions. Eleven funds at the endpoint TTL
    would cost eleven of a 22-call day; at a week they cost eleven a week.

    An unreadable timestamp counts as stale. That is the safe direction: it
    costs at most one call, where trusting it could serve a price forever.
    """
    age = _age_seconds(fetched_at)
    limit = TTL_SECONDS[endpoint] if max_age is None else max_age
    return age is not None and age < limit


def budget_remaining():
    """Calls left in today's self-imposed budget. Never negative.

    Only live calls are scored. Fixture reads go in the same log — they are
    genuine cache misses and worth being able to see — but they are local file
    reads, and letting a session's fixture traffic eat the live allowance
    would make the budget lie in both directions.
    """
    return max(0, DAILY_CALL_BUDGET - _rationed_calls_today())


def _rationed_calls_today():
    """Live calls today against the provider that rations us.

    Not every call in the log costs quota. SEC filings are free and unlimited
    at the rate this page reads them, so counting the log whole would let a
    reader looking up eight companies exhaust a budget that exists to protect
    four price tiles — and the reason fundamentals are on a second provider is
    exactly that they should not be able to.
    """
    return store.calls_today('live', RATIONED_ENDPOINTS)


def quota_status():
    """The queryable counter, for diagnostics and the T13 status surface."""
    used = _rationed_calls_today()
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


def _refresh(endpoint, symbol, data_source, api_key, edgar_contact):
    """Call the source once, parse it, and store what came back.

    Returns (data, fetched_at). One timestamp is generated here and used for
    both the row and the reply, so the age a caller is told on the fetch is
    the same age every later caller reads back out of the cache.

    Only reached with the symbol's lock held and the budget already checked.
    """
    handler = _HANDLERS[endpoint]
    status = 'error'
    try:
        payload = source.fetch(endpoint, symbol, data_source, api_key,
                               edgar_contact)
        parsed = bounded(endpoint, handler['parse'](payload, symbol))
        status = 'ok'
    except provider.ProviderError as exc:
        status = exc.reason
        # A throttle is upstream telling us our spacing is not enough, which
        # is better information than our own clock. Both of its refusals are
        # treated the same way here: hold the slot shut for a while rather
        # than letting the next request walk straight back into the limit.
        # Nothing retries — the caller serves what it has and flags it stale
        # (see get) — so this only decides when the *next* attempt may go.
        if exc.reason in ('rate_limited', 'quota_exhausted'):
            pacer = _pacer_for(endpoint)
            if pacer is not None:
                pacer.back_off(THROTTLE_BACKOFF_SEC)
        raise
    finally:
        # Logged even on failure: a call that errored still spent quota, and a
        # budget that only counts successes is optimistic in exactly the
        # situation where it must not be. Fixture reads are free and are
        # recorded as such so the two can be told apart in the log.
        store.record_call(endpoint, symbol, status, data_source)

    fetched_at = store.now_utc_iso()
    handler['save'](parsed, data_source, fetched_at)
    return parsed, fetched_at


def _meta(cached, stale, fetched_at, source):
    """The envelope a caller reports: how old this is, and what produced it.

    `source` is the source of the *bytes being returned*, not the mode the
    service is configured in. The two agree because a row written by the other
    mode is not loaded at all — the load filters on it (D16) — but they are
    written down as different things, because before D16 the response reported
    the configured mode and that is precisely how generated fixture prices
    went out labelled `live`. A caller that wants to say where a number came
    from reads this; nothing above should reach for the config value again.
    """
    return {'cached': cached, 'stale': stale, 'fetched_at': fetched_at,
            'source': source}


def get(endpoint, symbol, data_source, api_key='', max_age=None,
        allow_refresh=True, edgar_contact=''):
    """Cached data for one endpoint and symbol.

    Returns (data, meta), where meta carries `cached`, `stale` and
    `fetched_at` so the page can say how old what it is showing is.

    `max_age` overrides the endpoint's TTL for this caller — see is_fresh.
    `allow_refresh=False` says "answer from the cache or not at all", which is
    how a caller that needs many symbols at once bounds what one request can
    spend: a stale entry is served and flagged, and a symbol never held raises.
    It is the same degradation an exhausted budget produces, deliberately, so
    there is one path to test rather than two.
    """
    if endpoint not in _HANDLERS:
        raise Unavailable('unknown endpoint %r' % endpoint)

    load = _HANDLERS[endpoint]['load']

    cached, fetched_at = load(symbol, data_source)
    if cached is not None and is_fresh(endpoint, fetched_at, max_age):
        return cached, _meta(True, False, fetched_at, data_source)

    with _lock_for(endpoint, symbol):
        # Re-read inside the lock: whoever held it may have just refreshed
        # this very symbol, and taking the cache on trust from before the wait
        # is how one stampede becomes four calls.
        cached, fetched_at = load(symbol, data_source)
        if cached is not None and is_fresh(endpoint, fetched_at, max_age):
            return cached, _meta(True, False, fetched_at, data_source)

        # Fixture reads are local file reads. They cost no quota and must not
        # be able to exhaust a budget that exists to ration network calls, nor
        # be paced against a per-minute limit they do not consume.
        #
        # Order matters: may_call_now() takes the slot as it answers, so it is
        # asked last and only when everything else would have permitted the
        # call. `or` short-circuits, which is what keeps that true.
        if (not allow_refresh
                or (data_source == 'live' and budget_remaining() <= 0)
                or (data_source == 'live' and not may_call_now(endpoint))):
            if cached is not None:
                return cached, _meta(True, True, fetched_at, data_source)
            raise Unavailable(
                'nothing cached for %s and no refresh was permitted' % symbol)

        try:
            fresh, fresh_at = _refresh(endpoint, symbol, data_source, api_key,
                                       edgar_contact)
        except (provider.ProviderError, source.SourceUnavailable):
            # A symbol we have never held has nothing to fall back to, so the
            # error is the answer. One we do hold is better served stale than
            # not at all — an upstream hiccup should not blank the dashboard.
            if cached is None:
                raise
            return cached, _meta(True, True, fetched_at, data_source)

        return fresh, _meta(False, False, fresh_at, data_source)


def get_quote(symbol, data_source, api_key=''):
    return get(source.QUOTE, symbol, data_source, api_key)


def get_history(symbol, data_source, api_key=''):
    return get(source.DAILY, symbol, data_source, api_key)


def get_fundamentals(symbol, data_source, edgar_contact=''):
    """Filing figures for one symbol. No API key: EDGAR does not issue them."""
    return get(source.COMPANY_FACTS, symbol, data_source,
               edgar_contact=edgar_contact)


def reset_locks():
    """Drop the per-symbol locks and open every pacer. For tests only."""
    with _locks_guard:
        _locks.clear()
    for pacer in _pacers.values():
        pacer.reset()
