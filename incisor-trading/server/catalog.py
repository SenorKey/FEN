#!/usr/bin/env python3
"""
Incisor Trading — the symbol catalogue.

A committed table of US-listed equities and ETFs with the names people
actually search by. It exists because searching for "Apple" has to work, and
nothing else in the project knows that AAPL is Apple: quotes and daily bars
carry a ticker and nothing else, and the provider's own symbol-search endpoint
spends a call per keystroke, which a 25-a-day budget rules out entirely.

So the names are static, local, and free to query. The list is a starting set
rather than a registry of every listed security — it is here to make name
search useful, not to be exhaustive, and it grows by editing this file.

Two things this table is careful about:

**It never carries a price, a figure or a date.** Those come from the market
service and change; a name and a listing kind do not. A catalogue that cached
numbers would be a second source of truth for them, and the two would drift.

**Availability is not a property of the table.** Which symbols can actually be
priced depends on the data source: in fixture mode it is whatever JSON is
committed, in live mode it is anything the provider will answer for. The route
resolves that, so the table stays a list of names.

US-listed equities and ETFs only. Options, futures, crypto and bonds are
non-goals (guide section 1), so no ticker for one appears here.
"""

# symbol -> (name, kind, tracks)
#
# `kind` is 'stock' or 'etf', which is what the page badges. `tracks` is set
# only for the four index proxies the dashboard is built on, and is the index
# they stand in for — free market data does not include index levels, so the
# proxies are labelled everywhere they appear (guide section 10) and this is
# where the wording for that comes from.
ENTRIES = {
    # --- The four dashboard proxies -----------------------------------------
    'SPY': ('SPDR S&P 500 ETF Trust', 'etf', 'S&P 500'),
    'QQQ': ('Invesco QQQ Trust', 'etf', 'Nasdaq 100'),
    'DIA': ('SPDR Dow Jones Industrial Average ETF Trust', 'etf', 'Dow 30'),
    'IWM': ('iShares Russell 2000 ETF', 'etf', 'Russell 2000'),

    # --- Broad-market and sector ETFs ---------------------------------------
    # The sector funds are here for the sector grid in T10 as much as for
    # search: they are the conventional way to read sector performance without
    # an index licence, for the same reason the four above stand in for indexes.
    'VTI': ('Vanguard Total Stock Market ETF', 'etf', None),
    'VOO': ('Vanguard S&P 500 ETF', 'etf', None),
    'XLB': ('Materials Select Sector SPDR Fund', 'etf', None),
    'XLC': ('Communication Services Select Sector SPDR Fund', 'etf', None),
    'XLE': ('Energy Select Sector SPDR Fund', 'etf', None),
    'XLF': ('Financial Select Sector SPDR Fund', 'etf', None),
    'XLI': ('Industrial Select Sector SPDR Fund', 'etf', None),
    'XLK': ('Technology Select Sector SPDR Fund', 'etf', None),
    'XLP': ('Consumer Staples Select Sector SPDR Fund', 'etf', None),
    'XLRE': ('Real Estate Select Sector SPDR Fund', 'etf', None),
    'XLU': ('Utilities Select Sector SPDR Fund', 'etf', None),
    'XLV': ('Health Care Select Sector SPDR Fund', 'etf', None),
    'XLY': ('Consumer Discretionary Select Sector SPDR Fund', 'etf', None),

    # --- Equities -----------------------------------------------------------
    'AAPL': ('Apple Inc.', 'stock', None),
    'ABBV': ('AbbVie Inc.', 'stock', None),
    'ADBE': ('Adobe Inc.', 'stock', None),
    'AMD': ('Advanced Micro Devices, Inc.', 'stock', None),
    'AMZN': ('Amazon.com, Inc.', 'stock', None),
    'BA': ('The Boeing Company', 'stock', None),
    'BAC': ('Bank of America Corporation', 'stock', None),
    'BRK.B': ('Berkshire Hathaway Inc.', 'stock', None),
    'CAT': ('Caterpillar Inc.', 'stock', None),
    'COST': ('Costco Wholesale Corporation', 'stock', None),
    'CRM': ('Salesforce, Inc.', 'stock', None),
    'CSCO': ('Cisco Systems, Inc.', 'stock', None),
    'CVX': ('Chevron Corporation', 'stock', None),
    'DIS': ('The Walt Disney Company', 'stock', None),
    'F': ('Ford Motor Company', 'stock', None),
    'GM': ('General Motors Company', 'stock', None),
    'GOOGL': ('Alphabet Inc.', 'stock', None),
    'GS': ('The Goldman Sachs Group, Inc.', 'stock', None),
    'HD': ('The Home Depot, Inc.', 'stock', None),
    'IBM': ('International Business Machines Corporation', 'stock', None),
    'INTC': ('Intel Corporation', 'stock', None),
    'JNJ': ('Johnson & Johnson', 'stock', None),
    'JPM': ('JPMorgan Chase & Co.', 'stock', None),
    'KO': ('The Coca-Cola Company', 'stock', None),
    'LMT': ('Lockheed Martin Corporation', 'stock', None),
    'MA': ('Mastercard Incorporated', 'stock', None),
    'MCD': ("McDonald's Corporation", 'stock', None),
    'META': ('Meta Platforms, Inc.', 'stock', None),
    'MRK': ('Merck & Co., Inc.', 'stock', None),
    'MSFT': ('Microsoft Corporation', 'stock', None),
    'NFLX': ('Netflix, Inc.', 'stock', None),
    'NKE': ('NIKE, Inc.', 'stock', None),
    'NVDA': ('NVIDIA Corporation', 'stock', None),
    'ORCL': ('Oracle Corporation', 'stock', None),
    'PEP': ('PepsiCo, Inc.', 'stock', None),
    'PFE': ('Pfizer Inc.', 'stock', None),
    'PG': ('The Procter & Gamble Company', 'stock', None),
    'PYPL': ('PayPal Holdings, Inc.', 'stock', None),
    'SBUX': ('Starbucks Corporation', 'stock', None),
    'T': ('AT&T Inc.', 'stock', None),
    'TSLA': ('Tesla, Inc.', 'stock', None),
    'UBER': ('Uber Technologies, Inc.', 'stock', None),
    'UNH': ('UnitedHealth Group Incorporated', 'stock', None),
    'V': ('Visa Inc.', 'stock', None),
    'VZ': ('Verizon Communications Inc.', 'stock', None),
    'WFC': ('Wells Fargo & Company', 'stock', None),
    'WMT': ('Walmart Inc.', 'stock', None),
    'XOM': ('Exxon Mobil Corporation', 'stock', None),
}


def entry(symbol):
    """One catalogue row as a dict, or None if the symbol is not listed."""
    row = ENTRIES.get(symbol)
    if row is None:
        return None
    name, kind, tracks = row
    return {'symbol': symbol, 'name': name, 'kind': kind, 'tracks': tracks}


def entries(only=None):
    """The catalogue as a list of rows, sorted by symbol.

    `only` restricts the result to a set of symbols — what fixture mode needs,
    where the answerable symbols are whatever JSON happens to be committed. A
    symbol in `only` that is not in the table is dropped rather than invented:
    a row with no name would be worse for search than no row at all.
    """
    symbols = sorted(ENTRIES) if only is None else sorted(set(only) & set(ENTRIES))
    return [entry(symbol) for symbol in symbols]
