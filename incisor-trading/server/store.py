#!/usr/bin/env python3
"""
Incisor Trading — SQLite storage.

Everything that touches the database lives here: the schema, the snapshot
cache, and the upstream call log. Nothing else in the project opens a
connection, so there is one place to look for a query and one place a query
can be got wrong.

**Parameterized SQL only** (guide section 5). No value in this file is ever
formatted into a statement, including symbols that have already passed the
edge whitelist — defence in depth is worth more than the two characters it
costs.

Four tables:

    quotes          one row per symbol: the latest snapshot we hold
    daily_bars      one row per symbol and date: the daily series
    fundamentals    one row per symbol: the figures its last filing carried
    filing_reports  one row per symbol and quarter: when it was reported
    upstream_calls  one row per call we made, ever

`upstream_calls` predates the fetcher on purpose — see init().
"""

import datetime
import pathlib
import sqlite3

DEFAULT_DB_PATH = '/var/lib/incisor-trading/incisor.db'

# Where the database is, once the edge has said so. This module deliberately
# does not read DB_PATH from the environment: incisor.py imports store at the
# top of the file and loads $CONFIG_FILE below the imports, so anything read
# here would be read before config.env had been opened, and a path set there
# would be ignored while appearing to work.
DB_PATH = DEFAULT_DB_PATH

# The columns of a cached quote, in the order the internal shape defines them.
# Named once so the insert, the read and the shape can never drift apart.
QUOTE_COLUMNS = (
    'price', 'change', 'change_percent', 'open', 'high', 'low',
    'previous_close', 'volume', 'latest_trading_day',
)

BAR_COLUMNS = ('open', 'high', 'low', 'close', 'volume')

# The columns of a cached filing, in the order edgar.py's internal shape
# defines them. Every one is nullable, which the other two tables are not: a
# company that reports no dividend files no dividend tag, so absent is a fact
# about the filing rather than a hole in the cache.
FUNDAMENTAL_COLUMNS = (
    'entity_name', 'cik', 'as_of', 'filed', 'form', 'quarters',
    'shares_outstanding', 'revenue', 'gross_profit', 'operating_income',
    'net_income', 'eps', 'dividends_per_share',
)

# One report's columns, paired with the keys edgar.py spells them with.
# `start` and `end` are reserved-looking words a table is better off not
# using, so the two names differ and the mapping is written once, here.
REPORT_COLUMNS = (
    ('period_start', 'start'), ('period_end', 'end'), ('filed', 'filed'),
    ('form', 'form'), ('eps', 'eps'),
    ('dividends_per_share', 'dividends_per_share'),
)


def now_utc_iso():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def configure(path):
    """Point the store at a database file. Call before init() or connect().

    Returns the path in force, so the caller can log the value it set rather
    than reaching back in for it.
    """
    global DB_PATH
    DB_PATH = path or DEFAULT_DB_PATH
    return DB_PATH


def connect():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    # Per-connection, unlike journal_mode, so it has to be set every time.
    # NORMAL is the documented safe pairing with WAL.
    connection.execute('PRAGMA synchronous=NORMAL')
    return connection


def init():
    """Create the schema if it isn't there. Safe to run on every boot."""
    pathlib.Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    with connect() as connection:
        # WAL so reads never block behind the cache writer.
        connection.execute('PRAGMA journal_mode=WAL')

        # Exists before there is any fetcher to log into it, on purpose: the
        # free tier's 25-calls-a-day ceiling is the binding constraint on the
        # project, and if the counter did not predate the first fetcher then
        # the first version that forgets to record a call would go unnoticed.
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS upstream_calls (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                called_at   TEXT NOT NULL,
                endpoint    TEXT NOT NULL,
                symbol      TEXT,
                status      TEXT NOT NULL,
                source      TEXT NOT NULL
            )
            """
        )
        connection.execute(
            'CREATE INDEX IF NOT EXISTS idx_calls_at ON upstream_calls(called_at)')

        # One row per symbol. A quote is a snapshot, not a history — the
        # history lives in daily_bars, and keeping every intraday snapshot we
        # ever saw would grow without bound for no reader.
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS quotes (
                symbol              TEXT PRIMARY KEY,
                price               REAL NOT NULL,
                change              REAL NOT NULL,
                change_percent      REAL NOT NULL,
                open                REAL NOT NULL,
                high                REAL NOT NULL,
                low                 REAL NOT NULL,
                previous_close      REAL NOT NULL,
                volume              INTEGER NOT NULL,
                latest_trading_day  TEXT NOT NULL,
                fetched_at          TEXT NOT NULL
            )
            """
        )

        # Bars are immutable once a session closes, so they are stored per
        # symbol and date and upserted rather than replaced wholesale. A
        # refetch overlaps almost entirely with what we already hold, and the
        # rows that do change are the corrections we want to keep.
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS daily_bars (
                symbol      TEXT NOT NULL,
                date        TEXT NOT NULL,
                open        REAL NOT NULL,
                high        REAL NOT NULL,
                low         REAL NOT NULL,
                close       REAL NOT NULL,
                volume      INTEGER NOT NULL,
                fetched_at  TEXT NOT NULL,
                PRIMARY KEY (symbol, date)
            )
            """
        )

        # When each symbol's series was last refreshed. Kept apart from the
        # bars because a fetch that returns nothing new still happened, and
        # deriving freshness from max(fetched_at) would make a quiet weekend
        # look like a stale cache and burn a call re-proving it.
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS daily_series (
                symbol          TEXT PRIMARY KEY,
                last_refreshed  TEXT NOT NULL,
                fetched_at      TEXT NOT NULL
            )
            """
        )

        # One row per symbol, like quotes: a filing is a snapshot of what the
        # company has reported so far. Every figure is nullable — see
        # FUNDAMENTAL_COLUMNS. The quarter-by-quarter history those figures
        # were summed from is a different cardinality, and lives in
        # filing_reports below the way bars live beside a quote.
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS fundamentals (
                symbol              TEXT PRIMARY KEY,
                entity_name         TEXT,
                cik                 TEXT,
                as_of               TEXT,
                filed               TEXT,
                form                TEXT,
                quarters            INTEGER,
                shares_outstanding  REAL,
                revenue             REAL,
                gross_profit        REAL,
                operating_income    REAL,
                net_income          REAL,
                eps                 REAL,
                dividends_per_share REAL,
                fetched_at          TEXT NOT NULL
            )
            """
        )

        # One row per quarter the company has reported, keyed like
        # daily_bars and for the same reason: a period is immutable once
        # filed, a refetch overlaps almost entirely with what we hold, and
        # the rows that do change are restatements worth keeping. Replaced
        # per symbol on save rather than upserted — see save_fundamentals.
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS filing_reports (
                symbol              TEXT NOT NULL,
                period_end          TEXT NOT NULL,
                period_start        TEXT,
                filed               TEXT,
                form                TEXT,
                eps                 REAL,
                dividends_per_share REAL,
                PRIMARY KEY (symbol, period_end)
            )
            """
        )


def is_reachable():
    try:
        with connect() as connection:
            connection.execute('SELECT 1').fetchone()
        return True
    except sqlite3.Error:
        return False


# --- Quotes -----------------------------------------------------------------

def save_quote(quote, fetched_at=None):
    """Upsert one symbol's snapshot."""
    values = [quote['symbol']]
    values.extend(quote[column] for column in QUOTE_COLUMNS)
    values.append(fetched_at or now_utc_iso())
    # Column *names* come from the constant above, never from a caller; every
    # value below is still bound. This is the one statement in the file built
    # by formatting, and it is built out of our own identifiers.
    placeholders = ', '.join('?' * (len(QUOTE_COLUMNS) + 2))
    columns = ', '.join(('symbol',) + QUOTE_COLUMNS + ('fetched_at',))
    with connect() as connection:
        connection.execute(
            'INSERT OR REPLACE INTO quotes (%s) VALUES (%s)' % (columns, placeholders),
            values)


def load_quote(symbol):
    """The cached snapshot and when it was taken, or (None, None)."""
    with connect() as connection:
        row = connection.execute(
            'SELECT * FROM quotes WHERE symbol = ?', (symbol,)).fetchone()
    if row is None:
        return None, None
    quote = {'symbol': row['symbol']}
    for column in QUOTE_COLUMNS:
        quote[column] = row[column]
    return quote, row['fetched_at']


# --- Daily bars -------------------------------------------------------------

def save_history(history, fetched_at=None):
    """Upsert a symbol's bars and record that the series was refreshed."""
    fetched_at = fetched_at or now_utc_iso()
    symbol = history['symbol']
    rows = [
        (symbol, bar['date']) + tuple(bar[column] for column in BAR_COLUMNS)
        + (fetched_at,)
        for bar in history['bars']
    ]
    with connect() as connection:
        connection.executemany(
            """
            INSERT OR REPLACE INTO daily_bars
                (symbol, date, open, high, low, close, volume, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            rows)
        connection.execute(
            """
            INSERT OR REPLACE INTO daily_series (symbol, last_refreshed, fetched_at)
            VALUES (?, ?, ?)
            """,
            (symbol, history['last_refreshed'], fetched_at))


def load_history(symbol):
    """The cached series and when it was fetched, or (None, None)."""
    with connect() as connection:
        series = connection.execute(
            'SELECT last_refreshed, fetched_at FROM daily_series WHERE symbol = ?',
            (symbol,)).fetchone()
        if series is None:
            return None, None
        rows = connection.execute(
            """
            SELECT date, open, high, low, close, volume FROM daily_bars
            WHERE symbol = ? ORDER BY date ASC
            """,
            (symbol,)).fetchall()
    if not rows:
        return None, None
    history = {
        'symbol': symbol,
        'interval': 'daily',
        'last_refreshed': series['last_refreshed'],
        'bars': [dict(row) for row in rows],
    }
    return history, series['fetched_at']


# --- Fundamentals -----------------------------------------------------------

def save_fundamentals(facts, fetched_at=None):
    """Upsert one symbol's filing figures."""
    values = [facts['symbol']]
    values.extend(facts.get(column) for column in FUNDAMENTAL_COLUMNS)
    values.append(fetched_at or now_utc_iso())
    # As with quotes: the column names are our own identifiers, every value is
    # bound. See the note on save_quote.
    placeholders = ', '.join('?' * (len(FUNDAMENTAL_COLUMNS) + 2))
    columns = ', '.join(('symbol',) + FUNDAMENTAL_COLUMNS + ('fetched_at',))

    symbol = facts['symbol']
    report_columns = ', '.join(column for column, _ in REPORT_COLUMNS)
    report_rows = [
        (symbol,) + tuple(report.get(key) for _, key in REPORT_COLUMNS)
        for report in facts.get('reports') or []
    ]
    with connect() as connection:
        connection.execute(
            'INSERT OR REPLACE INTO fundamentals (%s) VALUES (%s)'
            % (columns, placeholders),
            values)
        # Deleted and rewritten rather than upserted, unlike bars. An
        # amendment can withdraw a period as well as restate one, and a
        # quarter that has stopped being reported would otherwise stand here
        # forever. Eight rows a symbol is not a table worth optimising.
        connection.execute('DELETE FROM filing_reports WHERE symbol = ?',
                           (symbol,))
        connection.executemany(
            'INSERT INTO filing_reports (symbol, %s) VALUES (%s)'
            % (report_columns, ', '.join('?' * (len(REPORT_COLUMNS) + 1))),
            report_rows)


def load_fundamentals(symbol):
    """The cached filing figures and when they were fetched, or (None, None)."""
    with connect() as connection:
        row = connection.execute(
            'SELECT * FROM fundamentals WHERE symbol = ?', (symbol,)).fetchone()
    if row is None:
        return None, None
    facts = {'symbol': row['symbol']}
    for column in FUNDAMENTAL_COLUMNS:
        facts[column] = row[column]
    facts['reports'] = load_filing_reports(symbol)
    return facts, row['fetched_at']


def load_filing_reports(symbol):
    """One symbol's reported quarters, newest first, as edgar.py spells them.

    Ordered here rather than by the caller, so a cached answer and a fresh
    one arrive the same way round. A surface that showed the newest quarter
    first only while the cache was cold would be a fault nobody could
    reproduce twice.
    """
    with connect() as connection:
        rows = connection.execute(
            """
            SELECT period_start, period_end, filed, form, eps,
                   dividends_per_share
            FROM filing_reports WHERE symbol = ? ORDER BY period_end DESC
            """,
            (symbol,)).fetchall()
    return [{key: row[column] for column, key in REPORT_COLUMNS}
            for row in rows]


# --- Upstream call log ------------------------------------------------------

def record_call(endpoint, symbol, status, source):
    """Log one upstream call. Called for every attempt, successful or not.

    A failed call still spent quota, so logging only successes would make the
    budget optimistic in exactly the situation where it must not be.
    """
    with connect() as connection:
        connection.execute(
            """
            INSERT INTO upstream_calls (called_at, endpoint, symbol, status, source)
            VALUES (?, ?, ?, ?, ?)
            """,
            (now_utc_iso(), endpoint, symbol, status, source))


def calls_since(since_iso, source=None, endpoints=None):
    """How many calls were made at or after an ISO timestamp.

    `source` filters to one mode. Pass 'live' to score quota: fixture reads are
    logged too — they are real cache misses and worth seeing — but they are
    local file reads and spend nobody's allowance.

    `endpoints` filters to the routes belonging to one upstream. There are two
    upstreams and only one of them is rationed, so a log counted whole would
    charge a free SEC filing against the quote provider's twenty-five a day —
    which is the entire reason fundamentals were put on a second provider. The
    set is passed in rather than known here: which endpoint belongs to which
    upstream is source.py's fact, and a copy of it in this file is a copy that
    can fall out of step.
    """
    query = 'SELECT COUNT(*) AS total FROM upstream_calls WHERE called_at >= ?'
    values = [since_iso]
    if source is not None:
        query += ' AND source = ?'
        values.append(source)
    if endpoints is not None:
        endpoints = tuple(endpoints)
        if not endpoints:
            return 0
        # Placeholders, not values: the count is our own and every endpoint
        # name is still bound.
        query += ' AND endpoint IN (%s)' % ', '.join('?' * len(endpoints))
        values.extend(endpoints)
    with connect() as connection:
        row = connection.execute(query, values).fetchone()
    return row['total']


def calls_today(source=None, endpoints=None):
    """Calls made since midnight UTC — the window the daily quota is scored on.

    UTC rather than US/Eastern deliberately: the provider's day is not
    documented as either, and a budget that resets in the middle of the US
    trading session would be the worse guess of the two.
    """
    midnight = datetime.datetime.now(datetime.timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0)
    return calls_since(midnight.isoformat(), source, endpoints)
