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

Three tables:

    quotes          one row per symbol: the latest snapshot we hold
    daily_bars      one row per symbol and date: the daily series
    upstream_calls  one row per call we made, ever

`upstream_calls` predates the fetcher on purpose — see init(). Fundamentals
are deliberately absent; the reasoning is in docs/DECISIONS.md.
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


def calls_since(since_iso, source=None):
    """How many calls were made at or after an ISO timestamp.

    `source` filters to one mode. Pass 'live' to score quota: fixture reads are
    logged too — they are real cache misses and worth seeing — but they are
    local file reads and spend nobody's allowance.
    """
    query = 'SELECT COUNT(*) AS total FROM upstream_calls WHERE called_at >= ?'
    values = [since_iso]
    if source is not None:
        query += ' AND source = ?'
        values.append(source)
    with connect() as connection:
        row = connection.execute(query, values).fetchone()
    return row['total']


def calls_today(source=None):
    """Calls made since midnight UTC — the window the daily quota is scored on.

    UTC rather than US/Eastern deliberately: the provider's day is not
    documented as either, and a budget that resets in the middle of the US
    trading session would be the worse guess of the two.
    """
    midnight = datetime.datetime.now(datetime.timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0)
    return calls_since(midnight.isoformat(), source)
