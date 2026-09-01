#!/usr/bin/env python3
"""
Incisor Trading — what each surface is allowed to fetch.

The policy layer between the routes and the cache. fetcher.py decides whether
one symbol may be refreshed; this decides how many of them a whole surface may
refresh in one request, and how fresh each surface actually needs its data to
be. Both are per-surface judgements about a shared budget, and they were
growing inside the edge file alongside origin checks and rate limits, which is
two unrelated jobs in one place.

Nothing here reads the environment. The mode and the credentials are passed
in, the same discipline source.py keeps and for the same reason: the edge
loads the config file and everything below it is told (D4).
"""

import logging

import fetcher
import provider
import sectors
import source

log = logging.getLogger('incisor')

# --- Sector grid ------------------------------------------------------------

# How old a sector series may be before the grid tries to refresh it.
#
# A week, where every other reader of the same endpoint wants a day. Eleven
# funds at one call each is half of a 22-call day, and spending it daily would
# leave the lookup — the thing a reader actually came to do — with three
# symbols a day across every visitor. A week costs eleven a week.
#
# The product follows the budget rather than apologising for it: the grid's
# shortest window is a month (server/sectors.py), which does not change
# materially when its end moves by a few sessions, and the date every figure
# is measured to is on the page.
SECTOR_MAX_AGE_SEC = 7 * 24 * 60 * 60

# How many sector series one request may refresh.
#
# Not a quota rule — fetcher.py owns the day's budget — but a latency and
# throttle rule. Eleven series lapse within minutes of each other, so without
# this the first request after a week would make eleven sequential upstream
# calls inside one HTTP response, each with a ten-second timeout, against a
# free tier that also caps requests per minute. Two a request means the grid
# refreshes itself over the next handful of page loads instead, and rows that
# have not caught up yet are served from cache and measured to the date they
# all share.
SECTOR_REFRESH_PER_REQUEST = 2


def sector_series(refresh_allowance, data_source, api_key):
    """Every sector fund's cached series, refreshing at most a few of them.

    Returns (series_by_symbol, meta) where meta is the envelope fields the
    grid reports: whether anything served was stale, and the oldest fetch
    behind it. A fund that cannot be served at all is simply absent, which
    sectors.rows() renders as an unavailable row rather than a missing one.

    The allowance binds in live mode only, for the same reason the daily
    budget does: a fixture read is a local file read, and it has neither the
    ten-second timeout nor the per-minute throttle the cap exists to stay
    under. Capping it there would make the grid fill over six page loads in
    the one mode that has ever run, to ration a cost that is not being paid.
    """
    if data_source != 'live':
        refresh_allowance = len(sectors.SECTOR_SYMBOLS)
    series_by_symbol = {}
    stale = False
    oldest_fetch = None

    for symbol in sectors.SECTOR_SYMBOLS:
        may_refresh = refresh_allowance > 0
        try:
            data, meta = fetcher.get(
                source.DAILY, symbol, data_source, api_key,
                max_age=SECTOR_MAX_AGE_SEC, allow_refresh=may_refresh)
        except (provider.ProviderError, source.SourceUnavailable,
                fetcher.Unavailable) as exc:
            # One fund short is a row that says so, not a failed grid. Logged
            # at info because a refusal to refresh is an ordinary outcome here.
            if may_refresh:
                refresh_allowance -= 1
            log.info('sectors: %s unavailable: %s', symbol, exc)
            continue

        # An attempt spends the allowance whether or not it worked. A call
        # that errored still cost the ten seconds and the throttle slot this
        # cap exists to bound, which is why fetcher.py logs failures against
        # the day's budget too. Counting successes only would let eleven dead
        # calls through on the one request where that matters most.
        if may_refresh and (not meta['cached'] or meta['stale']):
            refresh_allowance -= 1
        stale = stale or meta['stale']
        if meta['fetched_at'] and (oldest_fetch is None
                                   or meta['fetched_at'] < oldest_fetch):
            oldest_fetch = meta['fetched_at']
        series_by_symbol[symbol] = data

    return series_by_symbol, {'stale': stale, 'fetched_at': oldest_fetch or ''}


def cached_series(symbol, data_source, api_key):
    """A symbol's daily bars if we already hold them, or [].

    Read from the cache and never refreshed. It exists for the fundamentals
    panel's beta, whose inputs are bars the tiles and the quote panel have
    already paid for — so measuring risk costs nothing upstream, and on a day
    where those bars have not been fetched a missing beta is a far better
    outcome than spending one of twenty-two calls on a figure nobody searched
    for.
    """
    try:
        data, _ = fetcher.get(source.DAILY, symbol, data_source, api_key,
                              allow_refresh=False)
    except (provider.ProviderError, source.SourceUnavailable,
            fetcher.Unavailable):
        return []
    return data['bars']
