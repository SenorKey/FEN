#!/usr/bin/env python3
"""
Incisor Trading — what the fundamentals panel is sent.

The second route that computes rather than relays, and it does so for the
reason /sectors does: the inputs are large and the answer is small. A year of
two daily series is forty thousand numbers to produce one beta, and the
filings behind a revenue figure are a payload measured in megabytes.

Pure functions, no I/O and no clock. edgar.py turns EDGAR's JSON into facts,
this turns facts and price series into the figures the panel names, and
incisor.py fetches and wraps. Nothing here knows where a series came from.

**What is deliberately not computed here.** Market cap, price/earnings and
dividend yield all need the last price as well as a filing, and the browser
already has that price on screen directly above this panel. Computing them
here would mean picking a price — and any price this route picked could
differ from the one the quote card is showing, which is a contradiction a
reader would be right to notice and has no way to resolve. So the wire
carries shares, earnings and dividends per share, and the three ratios are
worked out beside the price they belong to (js/market-figures.js).
"""

# Sessions the beta is measured over. A trading year, the same window the
# quote panel's 52-week range uses, so the two figures on one card describe
# the same span of time.
BETA_SESSIONS = 252

# Below this the window is too short for a covariance to mean much, and a beta
# from six weeks of returns is a number with an error bar wider than itself.
# Reported as unknown rather than as a figure nobody could act on.
BETA_MIN_SESSIONS = 60

# What beta is measured against. The market proxy the whole dashboard is built
# on, so a reader who wants to know what "the market" means here can see it in
# the tile strip at the top of the page.
BETA_BENCHMARK = 'SPY'


def margin(part, whole):
    """One margin as a fraction, or None when either side is unknown.

    None rather than zero on a missing numerator: a company that does not
    report gross profit has not reported a gross margin of nothing. Guide
    section 15 wants missing data as an em dash and never as a zero, and that
    rule starts here rather than in the browser.
    """
    if part is None or not whole:
        return None
    return part / whole


def _returns(bars):
    """date -> daily return, from a series of bars oldest first.

    Keyed by date rather than positional because the two series being
    compared are fetched independently and need not be the same length: a
    symbol listed part-way through the window has fewer bars than the
    benchmark, and pairing them by position would compare Tuesday against
    March.
    """
    out = {}
    previous = None
    for bar in bars:
        close = bar.get('close')
        date = bar.get('date')
        if not isinstance(close, (int, float)) or not date:
            previous = None
            continue
        if previous:
            out[date] = close / previous - 1.0
        previous = close
    return out


def beta(bars, benchmark_bars, sessions=BETA_SESSIONS):
    """How far the symbol moves for a move in the benchmark, or None.

    The textbook definition — the covariance of the two daily return series
    over the variance of the benchmark's — computed over the sessions the two
    series actually share. Returns (value, sessions) so the panel can say what
    the figure covers, which matters because it is often not a full year.

    A benchmark that never moved has zero variance and no beta; that cannot
    happen with real prices and is guarded rather than reasoned about, because
    the alternative is a division by zero in a page that has to keep rendering.
    """
    own = _returns(bars or [])
    market = _returns(benchmark_bars or [])
    shared = sorted(set(own) & set(market))[-sessions:]
    if len(shared) < BETA_MIN_SESSIONS:
        return None

    mine = [own[date] for date in shared]
    theirs = [market[date] for date in shared]
    mean_mine = sum(mine) / len(mine)
    mean_theirs = sum(theirs) / len(theirs)

    covariance = sum((a - mean_mine) * (b - mean_theirs)
                     for a, b in zip(mine, theirs))
    variance = sum((b - mean_theirs) ** 2 for b in theirs)
    if variance == 0:
        return None
    return covariance / variance, len(shared)


def filings(facts):
    """The filing figures as the wire spells them, or None if there are none.

    A fund reaches here with nothing: it files no income statement, so every
    figure is absent and the panel says the symbol is a fund rather than
    showing eight em dashes and leaving the reader to work out why.
    """
    if not facts:
        return None
    revenue = facts.get('revenue')
    return {
        'entity_name': facts.get('entity_name'),
        'as_of': facts.get('as_of'),
        'filed': facts.get('filed'),
        'form': facts.get('form'),
        'quarters': facts.get('quarters'),
        'shares_outstanding': facts.get('shares_outstanding'),
        'revenue': revenue,
        'net_income': facts.get('net_income'),
        'eps': facts.get('eps'),
        'dividends_per_share': facts.get('dividends_per_share'),
        'gross_margin': margin(facts.get('gross_profit'), revenue),
        'operating_margin': margin(facts.get('operating_income'), revenue),
        'net_margin': margin(facts.get('net_income'), revenue),
    }


def panel(facts, bars, benchmark_bars):
    """Everything the fundamentals surface is sent for one symbol.

    Beta sits beside the filings rather than inside them because it is not a
    filed figure — it is computed from prices, and it is the one number here
    that a fund has as much of as a company. That is the whole reason the two
    halves are separate on the wire: a fund gets a beta and no filings, and a
    freshly listed company gets filings and no beta.
    """
    measured = beta(bars, benchmark_bars)
    return {
        'filings': filings(facts),
        'beta': None if measured is None else {
            'value': measured[0],
            'sessions': measured[1],
            'benchmark': BETA_BENCHMARK,
        },
    }
