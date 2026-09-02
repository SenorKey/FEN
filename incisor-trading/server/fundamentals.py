#!/usr/bin/env python3
"""
Incisor Trading — what the fundamentals panel is sent.

The second route that computes rather than relays, and it does so for the
reason /sectors does: the inputs are large and the answer is small. A year of
two daily series is forty thousand numbers to produce three risk figures,
and the filings behind a revenue figure are a payload measured in
megabytes.

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

# Sessions the price measures are taken over. A trading year, the same
# window the quote panel's 52-week range uses, so the figures on one card
# describe the same span of time — and the span volatility is annualised
# over, so the scaling and the sample are the same number by construction.
BETA_SESSIONS = 252

# Below this the window is too short for a covariance to mean much, and a
# beta from six weeks of returns is a number with an error bar wider than
# itself. Reported as unknown rather than as a figure nobody could act on.
BETA_MIN_SESSIONS = 60

# What beta and correlation are measured against. The market proxy the whole
# dashboard is built on, so a reader who wants to know what "the market"
# means here can see it in the tile strip at the top of the page.
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


def _paired(bars, benchmark_bars, sessions):
    """The two return series over the sessions they share, newest last.

    Returns (mine, theirs) or None when the overlap is too short to measure
    anything from. Split out because all three figures below are read off one
    pairing: measuring them separately would walk the same two series three
    times and, worse, let them disagree about which sessions they covered.
    """
    own = _returns(bars or [])
    market = _returns(benchmark_bars or [])
    shared = sorted(set(own) & set(market))[-sessions:]
    if len(shared) < BETA_MIN_SESSIONS:
        return None
    return [own[date] for date in shared], [market[date] for date in shared]


def _mean(values):
    return sum(values) / len(values)


def _variance(values, mean):
    """The population variance. Population rather than sample because this is
    the whole window being described, not an estimate drawn from a larger
    one — and because the ratios below divide one of these by another, where
    a consistent denominator matters more than which convention is used."""
    return sum((value - mean) ** 2 for value in values) / len(values)


def volatility(returns):
    """How far the symbol moves on an average day, annualised, or None.

    The standard deviation of daily returns scaled by the square root of a
    trading year, which is the convention every published volatility figure
    uses — so a reader who compares this with one elsewhere is comparing the
    same quantity.

    Beta cannot answer this and is routinely mistaken for it: a beta of 1
    means "moves with the market", not "moves this much". A holding that
    barely tracks the market can still be the jumpiest thing on the page.
    """
    if len(returns) < BETA_MIN_SESSIONS:
        return None
    deviation = _variance(returns, _mean(returns)) ** 0.5
    return deviation * (BETA_SESSIONS ** 0.5)


def correlation(mine, theirs):
    """How much of the movement the benchmark explains, -1 to 1, or None.

    The caveat beta needs and does not carry. Beta is a slope, and a slope
    fitted through a cloud with no shape is still a slope — so a beta of 1.4
    means something quite different at a correlation of 0.9 than at 0.2, and
    nothing on the panel said which it was.

    None when either series never moved: a flat line has no direction to
    agree or disagree with, and a zero would read as "moves independently"
    rather than "there is nothing here to compare".
    """
    mean_mine, mean_theirs = _mean(mine), _mean(theirs)
    spread = (_variance(mine, mean_mine) * _variance(theirs, mean_theirs)) ** 0.5
    if spread == 0:
        return None
    covariance = _mean([(a - mean_mine) * (b - mean_theirs)
                        for a, b in zip(mine, theirs)])
    return covariance / spread


def beta(mine, theirs):
    """How far the symbol moves for a move in the benchmark, or None.

    The textbook definition — the covariance of the two daily return series
    over the variance of the benchmark's.

    A benchmark that never moved has zero variance and no beta; that cannot
    happen with real prices and is guarded rather than reasoned about,
    because the alternative is a division by zero in a page that has to keep
    rendering.
    """
    mean_mine, mean_theirs = _mean(mine), _mean(theirs)
    variance = _variance(theirs, mean_theirs)
    if variance == 0:
        return None
    covariance = _mean([(a - mean_mine) * (b - mean_theirs)
                        for a, b in zip(mine, theirs)])
    return covariance / variance


def measures(bars, benchmark_bars, sessions=BETA_SESSIONS):
    """Everything measurable from the price series alone, or None.

    One window, one benchmark, three figures — returned together because
    they describe the same span and the panel states that span once. A
    reader told "measured over 252 sessions against SPY" is being told it of
    all three, so all three have to have been measured that way.
    """
    paired = _paired(bars, benchmark_bars, sessions)
    if paired is None:
        return None
    mine, theirs = paired
    return {
        'beta': beta(mine, theirs),
        'volatility': volatility(mine),
        'correlation': correlation(mine, theirs),
        'sessions': len(mine),
        'benchmark': BETA_BENCHMARK,
    }


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

    The two halves are answered independently because they come from
    different places and either may be missing: a fund files no income
    statement and still has a price series, and a company listed last month
    has filings and too few sessions to measure against. That asymmetry is
    the whole reason `measures` sits beside `filings` rather than inside it.
    """
    return {
        'filings': filings(facts),
        'measures': measures(bars, benchmark_bars),
    }
