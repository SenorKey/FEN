#!/usr/bin/env python3
"""
Regenerate the committed fixture JSON.

Development tool. It is never imported by the service, never shipped to a
visitor, and needs nothing outside the standard library — run it by hand when
the fixture set needs rebuilding:

    python3 server/fixtures/make_fixtures.py

The numbers it writes are INVENTED. No live call has ever been made from this
project (see docs/DATA-PROVIDER.md: no free tier grants the right to display
real quotes publicly), so the fixtures reproduce Alpha Vantage's documented
response *shapes* around a synthetic price series. Shape fidelity is the point;
the price levels only have to be plausible enough to lay out a dashboard
against. See fixtures/README.md.

Each symbol walks from a fixed seed, so the output is byte-stable: rerunning
this changes nothing unless the parameters below change. That is what makes the
committed JSON reviewable in a diff.

The quote fixture is derived from the last two bars of the same series rather
than generated separately, so a tile and its sparkline can never disagree.
"""

import datetime
import json
import os
import random

# Capture date stands in for the date the shapes were written. It lands in every
# filename so a later real capture (backlog S3) drops in alongside rather than
# overwriting, and the store picks the newest.
AS_OF = datetime.date(2026, 8, 26)
WRITTEN = '2026-08-27'

# A full year of sessions, so a 52-week range is a real figure rather than a
# five-month one wearing a year's label (backlog T7), and so T8's 1Y range has
# something to draw. 260 weekdays is 52 weeks exactly; the panel reads the last
# 252 of them, which is what a trading year comes to once holidays are out.
TRADING_DAYS = 260

# One market factor drives every symbol, because independent random walks are
# what a naive fixture generator produces and they are visibly wrong: real index
# proxies are strongly correlated, and a set where the Nasdaq proxy falls 26%
# in the same window the Dow proxy rises 11% would have the dashboard designed
# against a market that cannot happen.
MARKET_SEED = 20260826
MARKET_DRIFT = 0.08      # annualised
MARKET_VOLATILITY = 0.0075   # daily

# symbol -> (starting price, beta, idiosyncratic daily vol, seed, base volume)
# Betas are the conventional rough values: the Dow proxy is the calmest, the
# Nasdaq and small-cap proxies the most geared, and the two single stocks carry
# far more of their own noise than any basket does.
#
# Every symbol gets both fixtures, quote as well as series, even where only one
# surface reads it. In fixture mode the /symbols route lists whatever daily
# JSON is committed, so a symbol with a series and no quote would be offered by
# the search box and then fail the lookup it was offered for.
SYMBOLS = {
    'SPY':   (612.00, 1.00, 0.0016, 1001, 74_000_000),
    'QQQ':   (548.00, 1.20, 0.0034, 1002, 42_000_000),
    'DIA':   (438.00, 0.85, 0.0022, 1003, 3_600_000),
    'IWM':   (228.00, 1.15, 0.0045, 1004, 28_000_000),
    'AAPL':  (241.00, 1.15, 0.0105, 1005, 51_000_000),
    'BRK.B': (498.00, 0.80, 0.0072, 1006, 3_100_000),

    # The eleven Select Sector SPDR funds, for the sector grid (backlog T10).
    # Betas and own-noise are the conventional rough shape of each slice: tech
    # and discretionary geared to the market, staples and utilities damped,
    # energy carrying more of its own story than any of them. A sector basket
    # sits between an index proxy and a single stock on both counts, and a
    # grid whose whole job is to rank them is only worth laying out against
    # numbers that spread the way real ones do.
    'XLB':   (95.00, 0.95, 0.0052, 1007, 5_100_000),
    'XLC':   (121.00, 1.10, 0.0058, 1008, 8_300_000),
    'XLE':   (92.00, 0.85, 0.0082, 1009, 15_400_000),
    'XLF':   (52.00, 1.05, 0.0048, 1010, 39_000_000),
    'XLI':   (150.00, 1.00, 0.0045, 1011, 9_200_000),
    'XLK':   (265.00, 1.25, 0.0061, 1012, 6_400_000),
    'XLP':   (82.00, 0.55, 0.0038, 1013, 12_100_000),
    'XLRE':  (44.00, 0.85, 0.0055, 1014, 6_000_000),
    'XLU':   (85.00, 0.55, 0.0041, 1015, 12_600_000),
    'XLV':   (150.00, 0.75, 0.0050, 1016, 8_100_000),
    'XLY':   (230.00, 1.15, 0.0057, 1017, 5_200_000),
}

HERE = os.path.dirname(os.path.abspath(__file__))


def trading_days_ending(last_day, count):
    """The `count` weekdays ending on `last_day`, oldest first.

    Market holidays are not modelled. A fixture series only has to be a
    believable run of sessions, and inventing holiday gaps would imply a
    calendar accuracy these numbers do not have.
    """
    days = []
    day = last_day
    while len(days) < count:
        if day.weekday() < 5:
            days.append(day)
        day -= datetime.timedelta(days=1)
    days.reverse()
    return days


def market_returns(count):
    """The shared daily return series every symbol is priced off."""
    rnd = random.Random(MARKET_SEED)
    daily_drift = MARKET_DRIFT / 252.0
    return [daily_drift + rnd.gauss(0.0, MARKET_VOLATILITY) for _ in range(count)]


def build_series(start_price, beta, idiosyncratic, seed, base_volume, days, market):
    """Daily OHLCV bars, oldest first, from the market factor plus own noise."""
    rnd = random.Random(seed)
    close = start_price
    bars = []
    for day, market_return in zip(days, market):
        change = beta * market_return + rnd.gauss(0.0, idiosyncratic)
        close = close * (1.0 + change)
        intraday = abs(change) * 0.5 + idiosyncratic
        open_ = close * (1.0 - change * 0.6)
        span = abs(rnd.gauss(0.0, intraday))
        high = max(open_, close) * (1.0 + span)
        low = min(open_, close) * (1.0 - span)
        # Volume rises with the size of the move. Real tape does this, and the
        # dashboard's "volume vs. average" readout (T7) is meaningless against
        # a series where it does not.
        busyness = 0.7 + rnd.random() * 0.4 + abs(change) * 12.0
        bars.append({
            'date': day.isoformat(),
            'open': open_,
            'high': high,
            'low': low,
            'close': close,
            'volume': int(base_volume * busyness),
        })
    return bars


def money(value):
    """Alpha Vantage renders every price as a 4-decimal string, so we do too."""
    return '%.4f' % value


def as_time_series_daily(symbol, bars):
    """The TIME_SERIES_DAILY envelope: newest key first, numbered inner keys."""
    series = {}
    for bar in reversed(bars):
        series[bar['date']] = {
            '1. open': money(bar['open']),
            '2. high': money(bar['high']),
            '3. low': money(bar['low']),
            '4. close': money(bar['close']),
            '5. volume': str(bar['volume']),
        }
    return {
        'Meta Data': {
            '1. Information': 'Daily Prices (open, high, low, close) and Volumes',
            '2. Symbol': symbol,
            '3. Last Refreshed': bars[-1]['date'],
            # Describes the request that would have produced this: the
            # service asks for `full` because nothing shorter reaches back a
            # year. The fixture holds one year of it rather than twenty.
            '4. Output Size': 'Full',
            '5. Time Zone': 'US/Eastern',
        },
        'Time Series (Daily)': series,
    }


def as_global_quote(symbol, bars):
    """The GLOBAL_QUOTE envelope, derived from the last two bars of the series."""
    latest, previous = bars[-1], bars[-2]
    change = latest['close'] - previous['close']
    percent = change / previous['close'] * 100.0
    return {
        'Global Quote': {
            '01. symbol': symbol,
            '02. open': money(latest['open']),
            '03. high': money(latest['high']),
            '04. low': money(latest['low']),
            '05. price': money(latest['close']),
            '06. volume': str(latest['volume']),
            '07. latest trading day': latest['date'],
            '08. previous close': money(previous['close']),
            '09. change': money(change),
            # Yes, a percent sign inside the string. This is the single most
            # parser-worthy quirk in the whole response, so the fixture keeps it.
            '10. change percent': '%.4f%%' % percent,
        }
    }


def write(folder, symbol, payload):
    path = os.path.join(HERE, folder, '%s-%s.json' % (symbol, WRITTEN))
    with open(path, 'w') as handle:
        json.dump(payload, handle, indent=2)
        handle.write('\n')
    return path


def main():
    days = trading_days_ending(AS_OF, TRADING_DAYS)
    market = market_returns(len(days))
    for symbol, (price, beta, idiosyncratic, seed, volume) in SYMBOLS.items():
        bars = build_series(price, beta, idiosyncratic, seed, volume, days, market)
        print(write('time-series-daily', symbol, as_time_series_daily(symbol, bars)))
        print(write('global-quote', symbol, as_global_quote(symbol, bars)))


if __name__ == '__main__':
    main()
