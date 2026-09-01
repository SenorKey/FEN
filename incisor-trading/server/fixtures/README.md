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

| Directory | Upstream | Payload |
|---|---|---|
| `global-quote/` | Alpha Vantage | `GLOBAL_QUOTE` |
| `time-series-daily/` | Alpha Vantage | `TIME_SERIES_DAILY` (260 sessions — one year) |
| `company-facts/` | SEC EDGAR | `companyfacts` — four quarters of filings |

Symbols: `SPY`, `QQQ`, `DIA`, `IWM` — the four ETF proxies the dashboard's
summary strip is built on — the eleven Select Sector SPDR funds, plus `AAPL`
and `BRK.B`. `BRK.B` is there on purpose: it is the one symbol in the set with
a dot in it, so it exercises the edge whitelist and the fixture-path
resolution rather than leaving them assumed.

**Only `AAPL` and `BRK.B` have a `company-facts/` fixture**, and the absence is
the point rather than a gap: every other symbol here is an exchange-traded
fund, a fund files no income statement, and the fundamentals panel says it is a
fund instead of showing a column of em dashes. Both states are reachable in
fixture mode.

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

Each series runs **260 weekdays**, ending 2026-08-26 — a full year, so the
52-week range on the quote panel is a real figure rather than a five-month one
wearing a year's label. The service asks upstream for `outputsize=full` for the
same reason and cuts the answer to five years before storing it; the meta field
here says `Full` because that is the request these shapes stand in for, not
because the file holds two decades.

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

The filings are built the same way and for the same reason. One income
statement is generated per quarter and **every other figure is read out of
it** — gross profit, operating income and net income are fractions of that
quarter's revenue, and earnings per share is that quarter's income divided by
the share count. Six independently drawn fundamentals would produce companies
that cannot exist: a net margin above a gross margin, or an EPS that disagrees
with the income and the shares printed beside it on the same card. That is the
fundamentals version of the independent random walks described above.

Each payload also carries **an annual period alongside the four quarters**,
because every real one does — same tag, distinguished only by being twelve
months long. A fixture holding only quarters would let a parser that summed
everything it found pass, and it would then double every revenue figure in
production. `server/tests/test_fundamentals.py` asserts the annual period is
present in the committed JSON as well as that the parser refuses it.
