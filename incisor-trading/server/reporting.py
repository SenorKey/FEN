#!/usr/bin/env python3
"""
Incisor Trading — the reporting calendar, computed from filings alone.

Pure functions, no I/O, no network and no clock. edgar.py reads each quarter
out of one companyfacts payload; this turns that list into what the surface
states — when the company last reported, what the reports said, and when the
pattern of its own filings puts the next one.

**Why this is a calendar built from filings rather than a calendar of dates.**
The obvious version of this surface names a next earnings date, a consensus
estimate and the surprise against it. None of those three can be had here and
the reasons differ:

- A **scheduled earnings date** is something companies announce and nobody
  publishes for free in a form we may display. EDGAR knows when a report was
  filed, never when the next one will be.
- A **consensus estimate** is an analyst product, sold. Guide section 1 rules
  out analyst targets as a non-goal, and this is the same thing one column
  over.
- A **surprise** is the second minus the first, so it goes with them.

What EDGAR does hold is every past report and the day it landed, and a
company's own filing rhythm is remarkably regular — quarters end about ninety
days apart, and a large filer's 10-Q follows five to seven weeks later. So the
next report is stated as a **window derived from that rhythm**, with the
arithmetic on screen and the words "projected" and "not announced" beside it.
That is an observation with its basis shown rather than a date we do not have,
which is the shape guide section 11 asks every computed statement here to take.

And the honest replacement for the surprise is better than the surprise: each
quarter is set against **the same quarter a year earlier**, which is a fact
from the filings rather than a fact about analysts. Earnings are seasonal, so
the year-ago comparison is the one that means anything — a retailer's December
against its September teaches nothing but Christmas.
"""

import datetime

# How many reported quarters the surface carries: one year of them.
#
# Not every quarter held. Two years are read, because the year-ago column has
# to come from somewhere, but showing all eight puts four rows on screen whose
# comparison is necessarily blank — the older year has nothing behind it. Four
# complete rows teach more than eight where half the table is em dashes, and
# the second year is doing its work either way.
REPORTS_SHOWN = 4

# How many recent reports the projected filing window is read from. Four, so
# the window describes how this company files *now*: a filer that has tightened
# its close over five years would otherwise be projected against a lag it no
# longer takes.
LAG_BASIS = 4

# What counts as "the same quarter a year earlier". A fiscal year is not 365
# days for a 52/53-week filer, and quarter ends drift by a few days every year,
# so the match is a window rather than an equality.
YEAR_MIN_DAYS = 350
YEAR_MAX_DAYS = 380

# Below two reports there is no gap to measure, so there is no rhythm and no
# projection. Stated as a constant because it is the reason `next` is None for
# a company that has filed once, which is otherwise an easy thing to read as a
# bug.
CADENCE_MIN_REPORTS = 2


def _date(value):
    """An ISO date, or None if it is missing or unparseable."""
    if not isinstance(value, str):
        return None
    try:
        return datetime.date.fromisoformat(value)
    except ValueError:
        return None


def _days_between(earlier, later):
    """Whole days from one ISO date to another, or None if either is absent."""
    start, end = _date(earlier), _date(later)
    if start is None or end is None:
        return None
    return (end - start).days


def filing_lag(report):
    """Days from a quarter closing to its report being filed, or None.

    The one number this whole surface turns on. A reader who knows a company
    takes about six weeks to report knows roughly when to look, which is what
    a scheduled date would have told them and is arrived at from public
    filings rather than bought.
    """
    return _days_between(report.get('end'), report.get('filed'))


def _median(values):
    """The middle value, or None. Not the mean.

    A real observed gap rather than an average of them: quarters are ninety or
    ninety-one days apart and never ninety and a half, so a mean would project
    the next period end onto a day no quarter of this company has ever ended.
    """
    if not values:
        return None
    return sorted(values)[len(values) // 2]


def cadence_days(reports):
    """The typical gap between one quarter ending and the next, or None."""
    if len(reports) < CADENCE_MIN_REPORTS:
        return None
    gaps = []
    for newer, older in zip(reports, reports[1:]):
        gap = _days_between(older.get('end'), newer.get('end'))
        if gap:
            gaps.append(gap)
    return _median(gaps)


def year_ago(reports, report):
    """The report for the same quarter a year earlier, or None.

    Matched on the period end rather than on position, because a company that
    missed a filing has a hole in the list and counting four back would then
    compare a summer quarter with a spring one and label it a year.
    """
    for candidate in reports:
        distance = _days_between(candidate.get('end'), report.get('end'))
        if distance is not None and YEAR_MIN_DAYS <= distance <= YEAR_MAX_DAYS:
            return candidate
    return None


def _change(now, before):
    """The fractional change between two figures, or None.

    None rather than zero when either side is missing, and None when the
    earlier figure is a loss: a company that lost money last year and made
    some this year has no meaningful percentage between the two, and every
    arithmetic answer to that is a number that reads backwards.
    """
    if now is None or before is None or before <= 0:
        return None
    return now / before - 1.0


def quarters(reports):
    """Each reported quarter with its year-ago comparison, newest first."""
    out = []
    for report in reports[:REPORTS_SHOWN]:
        previous = year_ago(reports, report)
        out.append({
            'end': report.get('end'),
            'filed': report.get('filed'),
            'form': report.get('form'),
            'eps': report.get('eps'),
            'dividend': report.get('dividends_per_share'),
            'eps_year_ago': previous.get('eps') if previous else None,
            'eps_change': _change(report.get('eps'),
                                  previous.get('eps') if previous else None),
            'lag_days': filing_lag(report),
        })
    return out


def projection(reports):
    """When this company's own rhythm puts its next report, or None.

    A window rather than a date, and a projection rather than a schedule. The
    period end is the last one plus the usual gap; the window is that end plus
    the shortest and the longest of the recent filing lags. Both ends of it
    are days this company has actually taken.

    None when there is not enough history to describe a rhythm at all, which
    is the honest answer for a company that has filed once — better than a
    window drawn through a single point.
    """
    cadence = cadence_days(reports)
    last_end = _date(reports[0].get('end')) if reports else None
    if cadence is None or last_end is None:
        return None

    lags = [lag for lag in (filing_lag(report) for report in reports[:LAG_BASIS])
            if lag is not None]
    if not lags:
        return None

    period_end = last_end + datetime.timedelta(cadence)
    return {
        'period_end': period_end.isoformat(),
        'earliest': (period_end + datetime.timedelta(min(lags))).isoformat(),
        'latest': (period_end + datetime.timedelta(max(lags))).isoformat(),
        'lag_min': min(lags),
        'lag_max': max(lags),
        'basis_reports': len(lags),
        'cadence_days': cadence,
    }


def calendar(facts):
    """Everything the reporting surface is sent, or None if nothing was filed.

    None rather than an empty calendar for a fund: every ETF on this page
    reaches here with no filings at all, and a surface that rendered an empty
    table for them would be answering a question about a company with the
    furniture of one.
    """
    reports = (facts or {}).get('reports') or []
    if not reports:
        return None

    last = reports[0]
    return {
        'last': {
            'end': last.get('end'),
            'filed': last.get('filed'),
            'form': last.get('form'),
            'lag_days': filing_lag(last),
        },
        'next': projection(reports),
        'quarters': quarters(reports),
    }
