#!/usr/bin/env python3
"""
Incisor Trading — the sector grid: which slices of the market have led.

Pure functions and one table. No I/O, no network, no clock: the route hands
this module a set of daily series and gets back the rows a reader sees, which
is what lets the arithmetic be unit-tested against hand-computed numbers
rather than against a running service.

**Why eleven funds and not eleven sectors.** Free market data has no index
levels, which is why the dashboard's four headline tiles are ETF proxies. The
same is true one level down: there is no free feed of "how technology did".
The Select Sector SPDR funds are the conventional tradeable stand-in, they are
what a professional screen actually plots, and each one is labelled as the
fund it is rather than presented as the sector itself.

**Why the windows start at a month.** The grid is deliberately not a second
copy of the index strip. Sector rotation is a slow signal — leadership turns
over weeks and quarters, not sessions — and a one-day column would invite the
reader to read noise as rotation. It is also the honest limit of what this
grid can claim: eleven symbols cost eleven upstream calls against a budget of
22 a day, so the series behind these rows are refreshed weekly rather than
daily (see incisor.py's /sectors route) and can be up to a week old. A figure
covering a month is still a figure covering a month when its end moved by a
few sessions; a figure covering a day is not.

**Why one end date for all eleven.** A ranking is a comparison, and a
comparison of eleven changes measured to eleven different dates is not one.
Rows can genuinely fall out of step — a weekly refresh is spread across
requests, so one fund's series can be days newer than another's — so every
window is measured to the newest date *all* the rows share, and the grid says
which date that was. Truncating three rows to last Tuesday is a small loss;
ranking Tuesday's technology against Friday's energy is a wrong answer.
"""

# fund -> the slice of the US market it stands for.
#
# Order is the conventional weight order of the S&P 500 sectors, largest
# first. It is only the fallback: the grid sorts by the window on screen, and
# a reader who has not chosen anything sees the ranking rather than this list.
SECTORS = (
    ('XLK', 'Technology'),
    ('XLF', 'Financials'),
    ('XLV', 'Health Care'),
    ('XLY', 'Consumer Discretionary'),
    ('XLC', 'Communication Services'),
    ('XLI', 'Industrials'),
    ('XLP', 'Consumer Staples'),
    ('XLE', 'Energy'),
    ('XLU', 'Utilities'),
    ('XLRE', 'Real Estate'),
    ('XLB', 'Materials'),
)

SECTOR_SYMBOLS = tuple(symbol for symbol, _ in SECTORS)
SECTOR_NAMES = dict(SECTORS)

# The windows a reader can rank by, in the order they are offered.
WINDOWS = ('1M', '3M', 'YTD', '1Y')

# How many sessions back each fixed window reaches. YTD is absent because it
# is a calendar boundary rather than a count, and is handled separately.
WINDOW_SESSIONS = {
    '1M': 21,
    '3M': 63,
    '1Y': 252,
}

# What each window is called in a sentence, for the surface and for anything
# that has to say it aloud. Written here so the page and the tests agree.
WINDOW_LABELS = {
    '1M': 'one month',
    '3M': 'three months',
    'YTD': 'year to date',
    '1Y': 'one year',
}


def _bars_through(bars, end_date):
    """The bars up to and including `end_date`, oldest first.

    A series with nothing on or before that date returns empty rather than
    raising: one fund missing is a row that says so, not a failed grid.
    """
    if not bars:
        return []
    return [bar for bar in bars if bar.get('date', '') <= end_date]


def _percent_change(base_close, last_close):
    """Percentage move between two closes, or None if it cannot be computed."""
    if base_close is None or last_close is None:
        return None
    if not base_close:
        return None
    return (last_close - base_close) / base_close * 100.0


def _year_start_close(bars):
    """The close the year ended on before the last bar's year, or None.

    Year to date is conventionally measured from the *previous* year's final
    close rather than the first session of January, which is why this looks
    backwards from the boundary rather than forwards. A series that does not
    reach back over a new year has no YTD figure, and says so.
    """
    if not bars:
        return None
    try:
        year = int(bars[-1]['date'][:4])
    except (KeyError, TypeError, ValueError):
        return None
    boundary = '%04d-01-01' % year
    for bar in reversed(bars):
        if bar.get('date', '') < boundary:
            return bar.get('close')
    return None


def change_for_window(bars, window):
    """One fund's percentage change over one window, or None.

    None means the series does not reach back far enough — a genuine "we do
    not know", which the page renders as an em dash. It is never zero: a
    missing figure and an unchanged one are different facts, and printing the
    first as the second is the failure this whole file is careful about.
    """
    if not bars:
        return None
    last_close = bars[-1].get('close')

    if window == 'YTD':
        return _percent_change(_year_start_close(bars), last_close)

    sessions = WINDOW_SESSIONS.get(window)
    if sessions is None or len(bars) <= sessions:
        return None
    return _percent_change(bars[-1 - sessions].get('close'), last_close)


def common_end_date(series_by_symbol):
    """The newest date every supplied series reaches, or None if there is none.

    The oldest of the last bars, not the newest: a date one series has not
    reached is a date the grid cannot measure all of its rows to.
    """
    ends = []
    for series in series_by_symbol.values():
        bars = series.get('bars') if series else None
        if bars:
            ends.append(bars[-1].get('date', ''))
    ends = [end for end in ends if end]
    return min(ends) if ends else None


def rows(series_by_symbol, end_date):
    """Every sector as a row of figures, in the table's fallback order.

    A fund with no series still gets a row. The grid is a fixed set of eleven
    slices of one market, so a missing one is information — the page says that
    row is unavailable rather than quietly ranking ten things and looking
    complete.
    """
    built = []
    for symbol, name in SECTORS:
        series = series_by_symbol.get(symbol)
        bars = _bars_through(series.get('bars') if series else None, end_date or '')
        changes = {}
        for window in WINDOWS:
            changes[window] = change_for_window(bars, window)
        built.append({
            'symbol': symbol,
            'name': name,
            'available': bool(bars),
            'last_close': bars[-1].get('close') if bars else None,
            'as_of': bars[-1].get('date') if bars else None,
            'changes': changes,
        })
    return built


def grid(series_by_symbol):
    """The whole surface: the rows, the date they share, and what is missing.

    `as_of` is the single date every figure in the grid is measured to. It is
    None when nothing could be served at all, which the page renders as its
    unavailable state rather than as an empty table.
    """
    end_date = common_end_date(series_by_symbol)
    built = rows(series_by_symbol, end_date)
    return {
        'as_of': end_date,
        'windows': list(WINDOWS),
        'window_labels': dict(WINDOW_LABELS),
        'sectors': built,
        'unavailable': [row['symbol'] for row in built if not row['available']],
    }

