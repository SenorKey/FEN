#!/usr/bin/env python3
"""
Incisor Trading — SEC EDGAR company facts parsing.

The second upstream, and the only module that knows what EDGAR's JSON looks
like. It stands to filings exactly as provider.py stands to quotes: pure
functions, no I/O, no network, no clock, and everything downstream sees the
internal shape defined here instead.

**Why a second provider at all.** Fundamentals are not price data. EDGAR is
public domain, needs no key and no account, and allows ten requests a second
against the quote provider's twenty-five a day — so reading filings here keeps
them off the budget that the whole dashboard is rationed by (docs/DECISIONS.md).
The trade is that EDGAR knows nothing about prices and speaks in XBRL tags
rather than in figures, which is what most of this file is for.

Three things about the shape drive the code below:

1. **Facts are filed, not stated.** A company reports one quarter at a time,
   so a trailing-twelve-month revenue is a sum this module computes rather
   than a number EDGAR holds. A figure covering fewer than four quarters is
   reported as covering fewer, never scaled up to look like a year.

2. **The same period is filed many times.** A quarter appears once in its own
   10-Q and again in every later amendment and comparative, with the same
   `start` and `end` and occasionally a restated `val`. Duplicates are
   collapsed on the period, keeping the most recently filed value, because a
   restatement is the company correcting itself and the correction is the
   fact.

3. **One figure has many tags.** Revenue is `Revenues` for some filers and
   `RevenueFromContractWithCustomerExcludingAssessedTax` for others, and a
   filer can switch between them. Each figure below names the tags it accepts,
   in preference order, and takes the first that yields a usable period.

Nothing here decides what a reader sees. The route computes the margins and
the beta; the browser computes what needs a price, so the market cap on screen
is derived from the price directly above it.
"""

import datetime

from provider import ProviderError

# Internal fundamentals shape, for reference by anything that consumes it:
#
#   {'symbol': 'AAPL', 'entity_name': 'Apple Inc.', 'cik': '0000320193',
#    'as_of': '2026-06-27',      # end of the newest period in the window
#    'filed': '2026-07-31',      # the newest filing behind any figure here
#    'form': '10-Q',             # what that filing was
#    'quarters': 4,              # periods the flow figures actually cover
#    'shares_outstanding': 14840000000,
#    'revenue': ..., 'gross_profit': ..., 'operating_income': ...,
#    'net_income': ..., 'eps': ..., 'dividends_per_share': ...,
#    'reports': [ {'start', 'end', 'filed', 'form', 'eps',
#                  'dividends_per_share'}, ... ]}   newest first
#
# `reports` is the same facts read per period instead of summed over four of
# them. The trailing figures answer what the company has earned; the reports
# answer when it said so and how each quarter compared with the one a year
# before, which is a different question off one payload (docs/DECISIONS.md).
#
# Every figure is None when the filings do not carry it. Absent is a real
# answer here in a way it is not for a quote: a company that pays no dividend
# files no dividend tag, and rendering that as zero would state something the
# filing does not.

FACTS = 'facts'
DEI = 'dei'
GAAP = 'us-gaap'

# How many quarterly periods a trailing-twelve-month figure sums.
TTM_QUARTERS = 4

# A quarterly period, in days, with enough slack for 13-week fiscal quarters,
# 52/53-week retail calendars and the odd company that reports a 98-day
# quarter. Anything outside this is a half-year or an annual period, and
# summing one of those alongside three quarters would double-count.
QUARTER_MIN_DAYS = 80
QUARTER_MAX_DAYS = 100

# figure -> XBRL tags that may carry it, in preference order.
#
# The alternates are not stylistic. `Revenues` was the pre-2018 tag and many
# filers still use it; the contract-with-customer tags came in with ASC 606
# and are what most large filers report now. A filer that switched mid-history
# has both, and the newest usable period is what either produces.
FLOW_TAGS = {
    'revenue': (
        'RevenueFromContractWithCustomerExcludingAssessedTax',
        'RevenueFromContractWithCustomerIncludingAssessedTax',
        'Revenues',
        'SalesRevenueNet',
    ),
    'gross_profit': ('GrossProfit',),
    'operating_income': ('OperatingIncomeLoss',),
    'net_income': ('NetIncomeLoss', 'ProfitLoss'),
    'eps': ('EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted'),
    'dividends_per_share': (
        'CommonStockDividendsPerShareDeclared',
        'CommonStockDividendsPerShareCashPaid',
    ),
}

# The one figure that is a level rather than a flow: shares outstanding is
# true on a date, not over a period, so it is read as the newest single
# observation and never summed.
SHARES_TAGS = ('EntityCommonStockSharesOutstanding',)

# Units each figure is read in. A tag can carry several — earnings per share
# is filed in 'USD/shares' and shares outstanding in 'shares' — and reading
# the wrong one produces a number of the right magnitude and the wrong
# meaning, which is the failure worth guarding against by name.
UNITS = {
    'revenue': 'USD',
    'gross_profit': 'USD',
    'operating_income': 'USD',
    'net_income': 'USD',
    'eps': 'USD/shares',
    'dividends_per_share': 'USD/shares',
    'shares': 'shares',
}


def _date(value):
    """An ISO date from a fact, or None if it is missing or malformed.

    EDGAR is well-formed in practice, so this is not defensive padding: a
    single unparseable entry must not lose the whole company, because the
    alternative is a panel of em dashes explaining nothing.
    """
    if not isinstance(value, str):
        return None
    try:
        return datetime.date.fromisoformat(value)
    except ValueError:
        return None


def _entries(payload, taxonomy, tag, unit):
    """Raw fact entries for one tag and unit, or [] if the filing has none."""
    if not isinstance(payload, dict):
        raise ProviderError('malformed', 'company facts payload is not an object')
    facts = payload.get(FACTS)
    if not isinstance(facts, dict):
        raise ProviderError('malformed', 'company facts payload has no facts')

    concept = (facts.get(taxonomy) or {}).get(tag)
    if not isinstance(concept, dict):
        return []
    entries = (concept.get('units') or {}).get(unit)
    return entries if isinstance(entries, list) else []


def _is_quarter(entry):
    """Whether one entry covers a single fiscal quarter.

    EDGAR files quarterly, half-yearly and annual periods against the same
    tag, distinguished only by how far apart `start` and `end` are. Summing
    four entries without checking that is how a trailing year silently becomes
    two.
    """
    start, end = _date(entry.get('start')), _date(entry.get('end'))
    if start is None or end is None:
        return False
    days = (end - start).days
    return QUARTER_MIN_DAYS <= days <= QUARTER_MAX_DAYS


def _newest_first(entries):
    """Quarterly entries, newest period first, one per period.

    A period filed more than once keeps its most recently filed value: later
    filings restate earlier ones, and a restatement is the company saying the
    first number was wrong.
    """
    by_period = {}
    for entry in entries:
        if not isinstance(entry, dict) or not _is_quarter(entry):
            continue
        if not isinstance(entry.get('val'), (int, float)):
            continue
        period = (entry['start'], entry['end'])
        held = by_period.get(period)
        if held is None or str(entry.get('filed', '')) >= str(held.get('filed', '')):
            by_period[period] = entry
    return sorted(by_period.values(), key=lambda entry: entry['end'], reverse=True)


def _trailing(entries, quarters=TTM_QUARTERS):
    """Sum the newest consecutive quarters, or None if there are none.

    Returns (total, covered, newest_entry). `covered` is how many quarters the
    total actually spans, which is not always four — a newly listed company
    has fewer, and a gap in the filings means the sum stops at the gap rather
    than reaching over it to borrow a quarter from a year earlier.
    """
    ordered = _newest_first(entries)
    if not ordered:
        return None

    total = 0.0
    covered = 0
    expected_start = None
    for entry in ordered[:quarters]:
        # Periods must abut. EDGAR reports the day after the previous period
        # ends as the next one's start, so a mismatch of more than a few days
        # is a missing quarter and the window stops there.
        if expected_start is not None:
            end = _date(entry['end'])
            if end is None or abs((expected_start - end).days) > 7:
                break
        total += float(entry['val'])
        covered += 1
        expected_start = _date(entry['start'])

    if covered == 0:
        return None
    return total, covered, ordered[0]


def _level(entries):
    """The newest single observation, or None. For figures that are not flows."""
    dated = [entry for entry in entries
             if isinstance(entry, dict)
             and isinstance(entry.get('val'), (int, float))
             and _date(entry.get('end')) is not None]
    if not dated:
        return None
    return max(dated, key=lambda entry: entry['end'])


def _first_usable(payload, tags, unit, read):
    """Apply `read` to the first tag that yields anything.

    Tags are alternates for one figure rather than different figures, so the
    first that answers wins and the rest are not consulted — mixing two
    revenue tags across quarters would sum two different definitions of
    revenue into one number.
    """
    for tag in tags:
        found = read(_entries(payload, GAAP, tag, unit))
        if found is not None:
            return found
    return None


def _cik(payload):
    """The CIK as EDGAR writes it in a URL: ten digits, zero-padded."""
    raw = payload.get('cik')
    if isinstance(raw, int):
        return '%010d' % raw
    if isinstance(raw, str) and raw.strip().isdigit():
        return '%010d' % int(raw.strip())
    return None


def _quarterly(entries):
    """Every usable quarterly entry, duplicates kept. None when there are none.

    Unlike _newest_first this collapses nothing: the reports below need every
    filing of a period, because the earliest of them is the day the company
    reported and the latest carries the figure it now stands behind.
    """
    found = [entry for entry in entries
             if isinstance(entry, dict) and _is_quarter(entry)
             and isinstance(entry.get('val'), (int, float))]
    return found or None


def _reported_at(entries):
    """(start, end) -> (filed, form) of the *earliest* filing carrying it.

    Earliest, which is the opposite of what _newest_first takes for a value
    and right for the same reason. A restatement corrects what a quarter
    earned, so the newest filing holds the truest figure — but the day the
    company reported that quarter is the day it first did. An amendment two
    years later is not a second earnings date.
    """
    out = {}
    for entry in entries:
        filed = str(entry.get('filed', ''))
        if not filed:
            continue
        period = (entry.get('start'), entry['end'])
        held = out.get(period)
        if held is None or filed < held[0]:
            form = entry.get('form')
            out[period] = (filed, form if isinstance(form, str) else None)
    return out


def _per_period(payload, name):
    """end -> one figure's value for each quarter that filed it."""
    entries = _first_usable(payload, FLOW_TAGS[name], UNITS[name], _quarterly)
    if entries is None:
        return {}
    return {entry['end']: float(entry['val']) for entry in _newest_first(entries)}


def quarterly_reports(payload):
    """Each quarter the filings describe, newest first.

    The periods come from the income statement rather than from the per-share
    tags, because a report is a report whether or not the company declared a
    dividend that quarter: keying on the dividend tag would drop every quarter
    of a filer that pays none, which is most of them.

    Earnings and dividends are then attached by period end. A quarter with
    neither is still a report and still carries its dates — an absent figure
    is a fact about the figure, not a reason to lose the filing.
    """
    entries = (_first_usable(payload, FLOW_TAGS['revenue'],
                             UNITS['revenue'], _quarterly)
               or _first_usable(payload, FLOW_TAGS['net_income'],
                                UNITS['net_income'], _quarterly))
    if entries is None:
        return []

    eps = _per_period(payload, 'eps')
    dividends = _per_period(payload, 'dividends_per_share')

    reports = [
        {'start': start, 'end': end, 'filed': filed, 'form': form,
         'eps': eps.get(end), 'dividends_per_share': dividends.get(end)}
        for (start, end), (filed, form) in _reported_at(entries).items()
    ]
    reports.sort(key=lambda report: report['end'], reverse=True)
    return reports


def parse_company_facts(payload, symbol):
    """Turn one EDGAR companyfacts payload into the internal shape.

    `symbol` is carried for the error message only. EDGAR keys on CIK and does
    not know the ticker, which is the one thing it and the quote provider do
    not agree on — the mapping between the two is source.py's problem.
    """
    if not isinstance(payload, dict) or FACTS not in payload:
        raise ProviderError(
            'malformed', 'no company facts in the payload for %s' % symbol)

    figures = {}
    newest_end = None
    newest_filed = None
    newest_form = None
    quarters = None

    for name, tags in FLOW_TAGS.items():
        found = _first_usable(payload, tags, UNITS[name], _trailing)
        if found is None:
            figures[name] = None
            continue
        total, covered, newest = found
        figures[name] = total
        # The window is whatever the income statement covers. Per-share
        # figures follow it rather than setting it: a company can declare a
        # dividend in three of four quarters, and that is a fact about the
        # dividend, not a shorter reporting year.
        if name == 'revenue' or quarters is None:
            quarters = covered
        if newest_end is None or newest['end'] > newest_end:
            newest_end = newest['end']
        filed = str(newest.get('filed', ''))
        if filed and (newest_filed is None or filed > newest_filed):
            newest_filed = filed
            newest_form = newest.get('form')

    shares = _first_usable(payload, SHARES_TAGS, UNITS['shares'], _level)
    if shares is None:
        # dei is where a filer states its own share count; a few state it
        # under us-gaap instead, so both taxonomies are tried before giving up.
        for tag in SHARES_TAGS:
            shares = _level(_entries(payload, DEI, tag, UNITS['shares']))
            if shares is not None:
                break

    if all(value is None for value in figures.values()) and shares is None:
        # A payload we could read and that says nothing we asked about. Funds
        # file this way — they have no revenue and no earnings per share — and
        # the caller renders that as "not a company" rather than as a failure.
        raise ProviderError(
            'not_found', 'no reportable figures for %s' % symbol)

    entity = payload.get('entityName')
    return {
        'symbol': symbol,
        'entity_name': entity if isinstance(entity, str) else None,
        'cik': _cik(payload),
        'as_of': newest_end,
        'filed': newest_filed,
        'form': newest_form if isinstance(newest_form, str) else None,
        'quarters': quarters,
        'shares_outstanding': float(shares['val']) if shares else None,
        'revenue': figures['revenue'],
        'gross_profit': figures['gross_profit'],
        'operating_income': figures['operating_income'],
        'net_income': figures['net_income'],
        'eps': figures['eps'],
        'dividends_per_share': figures['dividends_per_share'],
        'reports': quarterly_reports(payload),
    }
