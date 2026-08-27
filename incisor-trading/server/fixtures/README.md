# Fixtures

Committed JSON that the service serves when `INCISOR_DATA_SOURCE=fixture`,
which is the default and what every session, test run and fresh checkout uses.

```
<endpoint>/<SYMBOL>-<YYYY-MM-DD>.json
```

The date is when the payload was written or captured. Files accumulate rather
than overwrite and the newest date for a symbol wins, so refreshing a fixture is
a drop-in and the file it replaced stays in git history as evidence of what the
shape used to be.

| Directory | Alpha Vantage function |
|---|---|
| `global-quote/` | `GLOBAL_QUOTE` |
| `time-series-daily/` | `TIME_SERIES_DAILY` (compact, 120 sessions) |

Symbols: `SPY`, `QQQ`, `DIA`, `IWM` — the four ETF proxies the dashboard's
summary strip is built on — plus `AAPL` and `BRK.B`. `BRK.B` is there on
purpose: it is the one symbol in the set with a dot in it, so it exercises the
edge whitelist and the fixture-path resolution rather than leaving them assumed.

---

## The numbers are invented

**These are not real market prices, and no live call has ever been made from
this project.** No provider's free tier grants the right to display real quotes
on a public page (`docs/DATA-PROVIDER.md`), so the fixtures reproduce Alpha
Vantage's documented response *shapes* around a synthetic price series.

Shape fidelity is the point. The quirks that a parser has to survive are all
present and deliberate:

- every price and volume is a **quoted string**, not a number
- `10. change percent` carries a literal **`%` on the end**
- the daily series is keyed by date, **newest key first**
- keys are numbered and prefixed — `05. price`, `4. close`

The price levels only have to be plausible enough to lay a dashboard out
against. They are not, and must never be presented as, market data: every API
response carries `"source": "fixture"` so the page can say so.

## Regenerating

```
python3 server/fixtures/make_fixtures.py
```

Standard library only, and deterministic — each symbol walks from a fixed seed,
so rerunning it changes nothing unless the parameters in the script change. That
is what keeps the committed JSON reviewable in a diff.

Every symbol is priced off **one shared market factor** with its own beta and
idiosyncratic noise, which puts the daily-return correlations at roughly 0.85 to
0.90 between the index proxies and 0.5 to 0.65 for the two single stocks. The
first version of this generator used independent random walks per symbol and
produced a window where the Nasdaq proxy fell 26% while the Dow proxy rose 11% —
a market that cannot happen, and not something to design a dashboard against.

The quote fixture is derived from the last two bars of the same series rather
than generated separately, so a tile and its sparkline can never disagree.
