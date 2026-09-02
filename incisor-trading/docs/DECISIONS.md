# Incisor Trading — Decisions and dead ends

**The index. Read it in full every session** — that is the point of it being
short. Each line states a claim and its reason, and is meant to stand alone: a
line that stops you re-walking settled ground has done its job.

To *act* on one — rebuild it, argue with it, extend it — open
`DECISIONS-DETAIL.md` at that ID. Nothing here is a summary of something lost;
every reason survives in full, one file away.

**No line exceeds 200 characters, and a test enforces it.** This file went from
10KB to 57KB in five days because nobody decided to write essays — the
1,573-character rows were one-liners once. When a claim will not fit, its
reasoning goes to the detail file, or beside the code it binds (guide §16).

Rows are merged, never dropped; a superseded row says so in one line.

---

## Settled

| ID | Decision — and why, in brief |
|---|---|
| DEC-001 | **No free tier permits public *display*** — structural, not a search gap. Alpha Vantage pending Key's written permission; fixtures until then. One licence, every endpoint. |
| DEC-002 | **Fundamentals come from SEC EDGAR** — public domain, 10/sec, no key, off the 22-call budget. 403s without a contact `User-Agent`. |
| DEC-003 | **25 calls a day decides the product.** Budget 22, live calls only; the cache runs in fixture mode too. Tiles read `/history` alone, never `/quote`. |
| DEC-004 | **Fixtures are synthetic and say so** — one market factor with per-symbol beta, and `"source": "fixture"` on every response. |
| DEC-005 | **`provider.py` alone sees provider JSON; `source.py` is the only I/O seam.** Alpha Vantage signals failure as HTTP 200, so a status check is not enough. |
| DEC-006 | **No fundamentals table, despite T4 naming one** — its shape and upstream belong to T11. Do not "complete" T4 by adding it. |
| DEC-007 | **Market holidays are computed from their rules, never a table.** A table goes stale silently and would claim the market was open on Thanksgiving. |
| DEC-008 | **Enamel and gold on near-black; system monospace for figures; no webfont.** Green and red are reserved for direction, and §4 rules out font CDNs. |
| DEC-009 | **No `gtag` here, unlike every FEN page; `beacon.js` stays with generic `data-track` labels.** Deliberate — a ticker label would leave the browser. |
| DEC-010 | **No line on this page is coloured by direction.** The colour goes on the labelled figure beside it, which names its own period. |
| DEC-011 | **`incisor.css` is page furniture; `css/market.css` renders numbers; `js/` is pure logic plus one network seam.** The seam is data, not bytes. |
| DEC-012 | **`docs/shots/` keeps the newest set plus any state it does not show.** An old shot shows markup that no longer exists, which is worse than none. |
| DEC-013 | **A market-data surface owns a view module and a stylesheet; one outgrowing a file splits at drawing versus deciding.** Supersedes DEC-011's placement. |
| DEC-014 | **The quote panel costs two calls, `/history` and `/quote`; tiles still cost one.** A daily series has no session in progress, so the day range is not in it. |
| DEC-015 | **Names come from committed `server/catalog.py`, never provider symbol search** — a call per keystroke against 22 a day is a disqualification. |
| DEC-016 | **Enter with nothing highlighted takes the best match, not the raw text** — else `apple` looks up APPLE and reports it missing. |
| DEC-017 | **Front-end tests run the shipped scripts in JavaScriptCore against a DOM stub.** They do not replace a browser; `shoot.py` covers the rest. |
| DEC-018 | **Chart ranges are 5D / 1M / 6M / 1Y / 5Y — no 1D, though T8's wording names one.** A day of a daily series is one bar. Do not add it. |
| DEC-019 | **A live surface may not overwrite a fact the served markup alone stated** — the clock keeps "Opens Monday 9:30am ET" over a bare countdown. |
| DEC-020 | **A figure carrying direction colour names its window in its own row** — tile `1d`, sparkline `30d`, chart *Over six months*. |
| DEC-021 | **A fact stated in one channel only is one half the readers miss, both ways.** Bands speak their placement; the chart names its symbol on screen. See DEC-060. |
| DEC-022 | **The period token is shared vocabulary; where it sits belongs to the surface.** `.inc-period` sets the look, the tile sets its alignment. |
| DEC-023 | **An error may not point at something no longer on screen** — a failed lookup closes the list, so the panel names the symbols instead. |
| DEC-024 | **A pointer surface listens for down, move, leave and cancel, and a *touch* leave keeps its reading.** A tap fires no `pointermove` at all. |
| DEC-025 | **The site is one deliberate dark treatment; `prefers-color-scheme` is not a gap.** `/assets` has no light palette and is out of bounds. Do not refile. |
| DEC-026 | **The 600-line rule is measured three ways: 600 per stylesheet and script, 900 per document, 150 per surface.** The surface list is derived, never listed. |
| DEC-027 | **Configuration is read at the edge, below the config load, and nowhere else.** An AST test enforces it (D4). |
| DEC-028 | **The watchlist holds eight symbols and stores tickers only.** The cap is the call budget, not taste — do not raise it without redoing the arithmetic. |
| DEC-029 | **The sector grid is eleven funds read at a *week*, ranked to the newest shared date.** No 1D: a week-old series cannot carry a one-session figure. |
| DEC-030 | **`/sectors` computes; `/history` relays. Both are right.** Many symbols and one question is cheap to answer and costly to ship the inputs for. |
| DEC-031 | **The sector bars diverge at real zero, not the centre.** A bar length means "relative to this window's biggest mover", never "this many percent". |
| DEC-032 | **A surface pays for a payload once; every question it already answers is free.** The watchlist sparkline came from bars already being discarded. |
| DEC-033 | **A measure that was right can be made wrong by the surface that lands next to it** — the watchlist's 620px cap, once T10 landed above it. |
| DEC-034 | **A control's target is what a finger can hit, not what the box reports.** A positioned overlay is outside the rect: hit-test the corners. |
| DEC-035 | **A control whose only affordance is hover has no affordance** — every sortable column carries a glyph, not only the sorted one. |
| DEC-036 | **Every sideways-scrolling box sets `position: relative`** — `overflow-x` does not clip a positioned child. Two of the three are preventive, not dead. |
| DEC-037 | **`shoot.py` measures a fourth width it does not photograph: 320px, full watchlist, overflow only**, skipped with a stated reason without `--api`. |
| DEC-038 | **The document ceiling counts markup only; comments are free.** On the one file that cannot split, charging for comments makes deletion the cheap way out. |
| DEC-039 | **A derived rule hides what it does not reach, so the derivation needs its own guard** — `[data-sectors]` matched none of its hooks, in silence. |
| DEC-040 | **A constraint that rules out a layout does not rule out the element** — the sector bar stacks below 700px rather than being `display: none`. |
| DEC-041 | **The budget scores one upstream of two** — only what `source.UPSTREAM_OF` marks Alpha Vantage's, so a free EDGAR call cannot cost one of 22. |
| DEC-042 | **The quote card was split along its *provider*, not its markup.** Volume is a quote figure and stayed. Do not pull the price figures out too. |
| DEC-043 | **Market cap, P/E and yield are computed in the browser; margins and beta on the server.** The line is whether a figure needs the price the reader sees. |
| DEC-044 | **A fixture may invent a company's figures, but not independently of each other** — one income statement per quarter, plus the annual period to refuse. |
| DEC-045 | **A fund is a state, not a failure** — 200 with `filings: null`, in fund language. Fifteen of seventeen symbols are funds: the ordinary answer. |
| DEC-046 | **EDGAR's contact address is config, not code, and not the routine's to choose.** Without it live filings refuse and say why; the service still boots. |
| DEC-047 | **A proxy stand-in must identify its callers** — `shoot.py` sets `X-Forwarded-For` per context. Do not take any of D7's three candidates. |
| DEC-048 | **The per-IP limiter trusts the *last* hop of `X-Forwarded-For`** — a fact about this deployment: one proxy, appending. Empty fields disable the gate. |
| DEC-050 | **Volatility and correlation ride on the pairing `beta()` already builds** — one `measures` object. Beta alone states a slope and hides its fit. |
| DEC-051 | **The per-surface 150-line rule charges a block only what it does not delegate to a nested measured surface.** |
| DEC-067 | **The index drops the date column and merges nothing.** Dates live in the detail file; merging is S6's job and D9 was a move — 66 entries in, 66 out, checked by the bijection test. |
| DEC-068 | **Closed work collapses in place; only live memory earns a detail file.** Nobody follows a pointer to a finished task, so `## Done` is one line each, in `BACKLOG.md` itself. |

---

## Dead ends

**Do not retry an entry here** unless its revisit condition has genuinely
changed. The detail file carries each one in full.

| ID | Tried — and why it failed |
|---|---|
| DEC-052 | **Five free-tier quote providers** — Finnhub, Twelve Data, Tiingo, Massive, marketstack all bar display, redistribution or caching, or are too small. |
| DEC-053 | **Movers computed from per-symbol calls** — 48 calls against 22, and any affordable universe is too small to be true. Never; T10b needs one endpoint. |
| DEC-054 | **All three fixture shapes for T10b's movers list** — a fixture can synthesise a series, never a *selection*. Revisit on written display permission. |
| DEC-055 | **Headless `chrome --screenshot` as a mobile check** — renders 390px as desktop; emulation never engages. Do not fix overflow seen only there. |
| DEC-056 | **Independent per-symbol random walks for fixtures** — produced a market that cannot happen. Never; correlated proxies are not a preference. |
| DEC-057 | **Treating any HTTP 404 as "that symbol does not exist"** — a dead backend's 404 became a confident lie. Only our `symbol_not_found` body counts. |
| DEC-058 | **Asserting `urllib` absent from `sys.modules` as a no-network check** — Werkzeug imports it, so it proves nothing. Patch the socket constructors. |
| DEC-059 | **A 240px sector name column, to close the 319px gap** — built and shot, and worse: a longer track buys no legibility. Revisit if a name grows. |

---

## Recurring traps

Promoted here the second time the same thing bites, because twice means
there will be a third.

| ID | Trap — and how to avoid it |
|---|---|
| DEC-060 | **A fact in one channel only keeps being found in a *new* channel** — decoration, `aria-label`, `aria-pressed`. Hover is a channel some readers lack. |
| DEC-061 | **A count across the whole page stops being a rule once a second surface does the same thing.** Assert per element, never as a total. |
| DEC-062 | **A screenshot taken straight after an interaction catches a transition in flight.** `shoot.py` passes `animations="disabled"`. |
| DEC-063 | **A full-page screenshot composites the fixed site nav mid-image**, moving with the page height. Check the previous shot before filing an overlap. |
| DEC-064 | **A stand-in fails silently in the direction nobody checks.** Ask what stands in for this locally and what it papers over; assert against something derived. |
| DEC-065 | **An author `display` rule silently defeats `[hidden]`, and no DOM test sees it.** One `!important` rule fixes it; confirm hidden things in an image. |
| DEC-066 | **The greps in `test_page.py` are blunt substring checks and mislead three ways** — unread files, prose matching a token, per-file rules concatenated. |
