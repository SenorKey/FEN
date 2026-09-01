# Incisor Trading — Data provider due diligence

**Task:** T0 · Research only. No account was created, no terms were accepted, no
API key was requested, and no upstream call was made. Provider selection and
signup are Key's (guide §3, out of bounds).

**Researched:** 2026-08-27. **Alpha Vantage's terms re-read 2026-09-01** for
T10b, which needed a row for `TOP_GAINERS_LOSERS` — see *Per-endpoint terms*
below. Still research only: no call was made to the API itself.
**Re-check before wiring live data.** Terms change; every clause below is quoted
with its source so it can be re-verified rather than re-researched.

---

## The headline finding

**No commercial provider's free tier clearly permits displaying its data on a
public website.** This is not a gap in the research — it is consistent across
every provider examined, and it is the single fact that shapes the build.

Market data is licensed in two separate layers, and free tiers only ever grant
the first:

1. **Access** — you may call the API and use the data yourself. Free tiers grant this.
2. **Display / redistribution** — you may show the data to other people. This is
   a separate, paid licence everywhere, because the exchanges charge for it.

Incisor Trading is, by definition, layer 2: a public page that shows quotes to
visitors. Guide §10 is therefore decisive — *"If public display isn't clearly
permitted, note it for Key and keep building on fixtures."* That is what this
session did.

This is not a blocker. The fixture layer (T3) exists precisely for this, and the
entire dashboard, the paper-trading game, and the historical replay can be built
and finished without a single live call.

---

## Comparison

| Provider | Free-tier limit | Delay | **Public display permitted on free tier?** | Attribution | Coverage | Key? |
|---|---|---|---|---|---|---|
| **Alpha Vantage** | 25 req/day, 5 req/min | 15-min delayed; EOD | **Unclear — closest to yes.** Licence is for "personal, non-commercial use" (§2.a). The commercial trigger is activity "that allows individuals or entities other than User to access information" (§2.a.iii) — but it is scoped to *commercial* activity, and FEN is free and ad-free. Ambiguous, not clearly permitted. | None stated in ToS | Quotes, intraday, daily/weekly/monthly history, fundamentals, earnings | Yes, free, email only |
| **Finnhub** | 60 req/min | Real-time US | **No.** "You hereby agree to not redistribute or share access to data or derived results from the data obtained from Finnhub with anyone or any 3rd party without written approval" (*Redistribution Rights and Personal Use*). Site visitors are third parties. | None stated | Quotes, candles, fundamentals, earnings | Yes, free |
| **Twelve Data** | 800 req/day, 8 req/min | Delayed on free | **No.** Free tier is licensed "solely for Internal Use" (§2.2(a)); redistribution or external display requires a "Redistribution Rights Add-On" (§2.4), and §2.3(l) prohibits "Use Free Tier data for commercial purposes". | Required only *with* the paid add-on (§2.4) | Quotes, time series, fundamentals | Yes, free |
| **Tiingo** | 50 symbols/hr, 1000 req/day (Starter) | EOD + delayed | **No — and worse for us.** "Redistribution is only available upon special request and permission, and comes with additional fees" (§7.3). §1.4(h) also bars "Publishing or otherwise making available to the public any analysis of the Service or Tiingo Data." | "Data sourced by Tiingo" + link, *if* licensed (§7.3) | EOD history, fundamentals, news | Yes, free |
| **Massive** (was Polygon.io) | 5 req/min, EOD only | End-of-day | **No, emphatically.** Market Data Terms §2: data "may not be copied, reproduced, republished, uploaded, posted, publicly displayed … or distributed in any way". §1: "you may not use the Market Data to build an application intended for use by end users other than you." | None stated | Aggregates, trades, quotes, corporate actions | Yes, free |
| **Financial Modeling Prep** | 250 req/day, 500MB/30d | EOD / delayed | **No.** Display or redistribution requires a separate "Data Display and Licensing Agreement" with FMP, at every tier including free. | Per that agreement | Statements, ratios, quotes, history | Yes, free |
| **marketstack** (APILayer) | **100 req/month** | EOD | **No.** Commercial use is a paid-plan feature; the free plan's display rights are not granted in the APILayer SaaS agreement. | Not confirmed | EOD, 12 months history | Yes, free |
| **SEC EDGAR** (`data.sec.gov`) | 10 req/**second** | Filing-time (not prices) | **YES — unambiguously.** US Government work, not subject to copyright. The SEC asks only that you do not imply endorsement. | None required; do not imply endorsement | Fundamentals only (XBRL from 10-K/10-Q), filings, company metadata. **No prices.** | **No key, no account, no ToS** |

---

## Per-endpoint terms — there are none

*Added 2026-09-01, answering the question T10b filed.*

T10b assumed `TOP_GAINERS_LOSERS` would need a row of its own, because it is the
one endpoint that answers about the whole market rather than about a symbol we
named. **It does not have one, and cannot: Alpha Vantage's terms are written
over the platform, not over its functions.**

The grant is a single sentence covering everything: Alpha Vantage grants the
right to "install, use, access, display and run the software … for personal,
non-commercial use, unless you and Alpha Vantage have agreed otherwise in
writing." *Use Restrictions* (§4) is about reverse engineering and about what a
user uploads; it says nothing about redistribution or public display at all.

Searched in full, the document contains **zero** occurrences of "endpoint",
"function", "dataset", "gainer" or "Alpha Intelligence". No feature, tier of
data or API call is singled out anywhere.

So the endpoint inherits exactly the ambiguity already recorded for the API as a
whole, and nothing more: the same "personal, non-commercial use" scope, the same
absence of an explicit display bar, and the same resolution — one written answer
from Alpha Vantage settles the whole platform at once, this endpoint with it.

**Do not research this again per endpoint.** The same holds for `TIME_SERIES_*`,
`GLOBAL_QUOTE`, `OVERVIEW` and anything else the backlog reaches for: there is
one licence, and it is already in the table above.

---

## Why marketstack is disqualified on numbers alone

100 requests per *month* cannot run a dashboard. Four ETF proxies refreshed once
a day is 120 calls/month — over budget before a single visitor searches a symbol.
Listed for completeness; not a candidate.

---

## The exception worth building on now: SEC EDGAR

`data.sec.gov` is the one source in this table that is unambiguously free to
display publicly, and it is also the only one that requires **no account and no
acceptance of terms** — which means it is entirely inside the routine's bounds
(guide §3). Key does not have to do anything for it to be usable.

- No API key, no registration, no ToS to accept.
- 10 requests/second, versus Alpha Vantage's 25 requests/**day**.
- US Government work — public domain, redistributable.
- Requires a `User-Agent` header naming the app and a contact email, or it 403s.

**What it does not have: prices.** No quotes, no OHLC bars, no intraday. It
covers the fundamentals half of T11 (revenue, EPS, shares outstanding, margins)
and nothing on the chart.

This splits the data problem cleanly in two, and the halves have different
answers:

| Need | Source | Status |
|---|---|---|
| Fundamentals (T11), company metadata | SEC EDGAR | **Available now, no action from Key** |
| Prices, quotes, charts (T6–T10) | A licensed provider | **Needs Key's decision** |

---

## Recommendation

**Alpha Vantage, conditional on Key obtaining written confirmation — which is
free to ask for.**

Reasoning:

1. **It is the only free tier whose terms do not flatly forbid public display.**
   Every other provider bars it in plain language. Alpha Vantage's restriction is
   scoped to *commercial activity* (§2.a.iii), and Incisor Trading is free, has
   no ads, no account, no paywall, and nothing of monetary value — guide §4 makes
   that permanent and verifiable. There is a real argument that the clause does
   not bite. There is also a real argument that it does. **Ambiguous is not
   permitted**, per guide §10.

2. **The ambiguity is cheap to resolve.** One email to `premium@alphavantage.co`
   describing the page — free, educational, non-commercial, delayed data,
   attributed — converts "unclear" into a written yes or no at zero cost. A
   written yes is the only thing that makes live data legitimate here.

3. **Its coverage matches the backlog** — quotes, intraday, long daily history,
   fundamentals and earnings from one provider, which is what T6 through T12 need.

4. **Its rate limit is the real constraint, and it is survivable.** 25 requests
   per day, 5 per minute. With the server-side caching T4 already mandates and
   the four ETF proxies of T6, that supports a dashboard refreshed a handful of
   times a day — an **end-of-day-oriented dashboard, honestly labeled**, not a
   live ticker. That is a fine product and arguably the better teaching tool.
   It does mean T9's watchlist cap must be tight, and it is a strong argument for
   pulling fundamentals from SEC EDGAR so they never spend Alpha Vantage quota.

**Fallback if the answer is no:** the page still works. Historical replay
(Phase 3) is explicitly designed around anonymized static windows committed to
the repo, needing no live data ever, and the paper-trading game runs on whatever
series it is given. A no narrows the dashboard; it does not stop the project.

**Explicitly not recommended:** Finnhub and Massive, despite the best free rate
limits in the table, because their terms forbid exactly what this page does.
Twelve Data's 800/day is tempting for the same reason and fails the same test.

---

## For Key — the two decisions

1. **Ask Alpha Vantage.** Email `premium@alphavantage.co`: free, non-commercial,
   ad-free educational page; delayed data clearly labeled; attribution wherever
   they want it. Their written answer settles it. If yes, get a free key at
   `alphavantage.co/support/#api-key` and it goes in
   `/etc/incisor-trading/config.env` — never the repo (guide §5).
2. **Nothing needed for SEC EDGAR.** The routine will build the fundamentals path
   against it without further input, since it needs no account and no agreement.

Both are logged under `For Key` in `PROGRESS.md`. Neither blocks a session.

---

## What this means for the build

Unchanged. T1 through T5 need no provider at all, and T3's fixture layer is what
makes every later task provider-independent. Fixtures will be **hand-written to
Alpha Vantage's documented response shapes** — that is a reversible choice, since
the parser module T3 specifies is the only code that ever sees provider JSON.

Live mode stays off (`INCISOR_DATA_SOURCE=fixture`) until a written display
permission exists.

---

## Sources

- Alpha Vantage, Terms of Service — <https://www.alphavantage.co/terms_of_service/> (§2 Grant of License)
- Finnhub, Terms of Service — <https://finnhub.io/terms-of-service> (Redistribution Rights and Personal Use)
- Twelve Data, Terms of Use — <https://twelvedata.com/terms> (§2.2, §2.3, §2.4)
- Tiingo, Terms of Use — <https://app.tiingo.com/tos/> (§1.4(h), §1.6, §7.3)
- Massive (formerly Polygon.io), Market Data Terms — <https://massive.com/legal/market-data-terms-of-service> (§1, §2, §5(c))
- Massive, rebrand announcement — <https://massive.com/blog/polygon-is-now-massive>
- Financial Modeling Prep, Terms of Service — <https://site.financialmodelingprep.com/terms-of-service>
- marketstack / APILayer legal — <https://www.ideracorp.com/legal/APILayer>
- SEC, EDGAR APIs — <https://www.sec.gov/search-filings/edgar-application-programming-interfaces>
- SEC, Accessing EDGAR Data (fair-use limits) — <https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data>
