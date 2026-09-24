# Incisor Trading — Decisions and dead ends

**Read in full every session** — which is why it is short. Each row states a
claim and its reason and stands alone. To *act* on one, open
`DECISIONS-DETAIL.md` at that ID; nothing here is a summary of something lost.

**Rows are capped at 200 characters, merged rather than dropped, and only
cross-cutting.** A claim that will not fit goes to the detail file, or beside
the code it binds (guide §16). A spent or superseded row is a redirect to the
ID carrying it now; an ID absent from this file was moved beside the one
surface it binds, and **DEC-087's detail entry records where each went.**
`tests/test_docs_budget.py` holds the reasons for all three rules.

---

## Settled

| ID | Decision — and why, in brief |
|---|---|
| DEC-001 | **Display permitted in writing, conditionally.** Alpha Vantage, 2026-09-13: permissible while the site is strictly free and only free-tier APIs are used. Both now bind. |
| DEC-002 | **Fundamentals come from SEC EDGAR** — public domain, 10/sec, no key, off the 22-call budget. 403s without a contact `User-Agent`. |
| DEC-003 | **25 calls a day decides the product.** Budget 22, live calls only; the cache runs in fixture mode too. Tiles read `/history` alone, never `/quote`. |
| DEC-004 | **Fixtures are synthetic and say so** — one market factor with per-symbol beta, and `"source": "fixture"` on every response. |
| DEC-005 | **`provider.py` alone sees provider JSON; `source.py` is the only I/O seam.** Alpha Vantage signals failure as HTTP 200, so a status check is not enough. |
| DEC-006 | **Spent** — T4's deferred table shipped as T11. → DEC-002, DEC-043 |
| DEC-008 | **Enamel and gold on near-black; system monospace for figures; no webfont.** Green and red are reserved for direction, and §4 rules out font CDNs. |
| DEC-009 | **No `gtag` here, unlike every FEN page; `beacon.js` stays with generic `data-track` labels.** Deliberate — a ticker label would leave the browser. |
| DEC-010 | **No line on this page is coloured by direction.** The colour goes on the labelled figure beside it, which names its own period. |
| DEC-011 | **Superseded** → DEC-013, on where a surface splits. |
| DEC-012 | **Only `docs/shots/look-*/` is committed; other sets stay local.** Shots are reproducible and never served, and 321 blobs sat behind a repo the server pulls. |
| DEC-013 | **A market-data surface owns a view module and a stylesheet; one outgrowing a file splits at drawing versus deciding.** Supersedes DEC-011's placement. |
| DEC-015 | **Names come from committed `server/catalog.py`, never provider symbol search** — a call per keystroke against 22 a day is a disqualification. |
| DEC-019 | **A live surface may not overwrite a fact the served markup alone stated** — the clock keeps "Opens Monday 9:30am ET" over a bare countdown. |
| DEC-020 | **A figure carrying direction colour names its window in its own row** — tile `1d`, sparkline `30d`, chart *Over six months*. |
| DEC-021 | **Merged** → DEC-060, the same lesson on its second bite. |
| DEC-022 | **The period token is shared vocabulary; where it sits belongs to the surface.** `.inc-period` sets the look, the tile sets its alignment. |
| DEC-023 | **Merged** → DEC-078, on what an empty state may say. |
| DEC-024 | **A pointer surface listens for down, move, leave and cancel, and a *touch* leave keeps its reading.** A tap fires no `pointermove` at all. |
| DEC-025 | **The site is one deliberate dark treatment; `prefers-color-scheme` is not a gap.** `/assets` has no light palette and is out of bounds. Do not refile. |
| DEC-026 | **The 600-line rule is measured three ways: 600 lines per stylesheet and script, 650 elements per document, 150 lines per surface.** The surface list is derived, never listed. |
| DEC-027 | **Configuration is read at the edge, below the config load, and nowhere else.** An AST test enforces it (D4). |
| DEC-028 | **Three caps are the call budget, not taste: watchlist 8, open orders 6, equity curve 12.** Each refuses past it; the watchlist stores tickers only. Redo the sum to raise any. |
| DEC-030 | **`/sectors` computes; `/history` relays. Both are right.** Many symbols and one question is cheap to answer and costly to ship the inputs for. |
| DEC-032 | **A surface pays for a payload once; every question it already answers is free.** The watchlist sparkline came from bars already being discarded. |
| DEC-033 | **A measure that was right is made wrong by what lands next to it** — the watchlist's 620px cap, once T10 landed above it; then a 12ch reserve, once broadsheet realigned it. → DEC-100 |
| DEC-034 | **A control's target is what a finger can hit, not what the box reports.** A positioned overlay is outside the rect: hit-test the corners. |
| DEC-035 | **Merged** → DEC-060; hover is the channel it missed. |
| DEC-036 | **Every sideways-scrolling box sets `position: relative`** — `overflow-x` does not clip a positioned child. Two of the three are preventive, not dead. |
| DEC-038 | **Merged** → DEC-026, which carries all three length measures. |
| DEC-039 | **Merged** → DEC-064; a derivation is a stand-in. |
| DEC-040 | **A constraint that rules out a layout does not rule out the element** — the sector bar stacks below 700px rather than being `display: none`. |
| DEC-041 | **The budget scores one upstream of two** — only what `source.UPSTREAM_OF` marks Alpha Vantage's, so a free EDGAR call cannot cost one of 22. |
| DEC-043 | **Market cap, P/E and yield are computed in the browser; margins and beta on the server.** The line is whether a figure needs the price the reader sees. |
| DEC-045 | **A fund is a state, not a failure** — 200 with `filings: null`, in fund language. Fifteen of seventeen symbols are funds: the ordinary answer. |
| DEC-067 | **Spent** — the split landed; `tests/test_docs_budget.py` enforces it. |
| DEC-068 | **Closed work collapses in place; only live memory earns a detail file.** Nobody follows a pointer to a finished task, so `## Done` is one line each, in `BACKLOG.md` itself. |
| DEC-069 | **An audit is a one-line verdict row plus a dated entry, keyed on date and task — not a new ID namespace.** `O6` never completes, so this section grows forever. |
| DEC-072 | **Phase 2 builds its surfaces in the view, not the served document.** A panel behind a tab states no fact before a script runs, unlike every dashboard empty state. |
| DEC-074 | **Where a column label is wider than every figure under it, the label shortens — not the data, and never the accessible name.** Both spellings ship, aria-hidden. |
| DEC-077 | **The page's CSP needs no loosening: `default-src 'none'` plus `'self'` for script, style, font, img and connect.** No inline anything, no eval, no remote origin. Never add `unsafe-*`. |
| DEC-079 | **Two look directions may not share their most visible move.** Workbench built the quote-beside-chart lead and then dropped it: one idea in two branches is one direction in two palettes. |
| DEC-080 | **A committed look set is quantised, its mobile shot halved to CSS pixels, and copied onto `incisor-dev`.** 2.8MB became 900KB; the shelf is browsed from the working line. |
| DEC-081 | **The routine works in a `git worktree`, never the shared checkout.** A second session was live in it on 09-08; two checkouts crossed and an amend of mine rewrote its commit. |
| DEC-082 | **The portfolio is its ledger: totals are replayed, never stored; cents; average cost.** `ledger.apply` is the one judge of a trade — T15 gets no second copy of the rules. |
| DEC-084 | **Step 1 is failed by a changed tracked file outside `incisor-trading/`, not by an untracked one.** A stray preview config would skip every day; the worktree already protects Key. |
| DEC-085 | **An order fills at the first bar open (9:30 ET) or close after it was placed** — the bar's market moment, not its publication. Mid-session limits get the close only. |
| DEC-086 | **An open buy holds back cash — a limit at its limit, a market order at last close +5%.** Its six-symbol cap is one of the three in DEC-028. |
| DEC-087 | **An index row repeating a comment is a second copy, and the copy is the one that drifts.** Eight said what the file they bind said better; the index is for what no one file owns. |
| DEC-088 | **Merged** → DEC-028, which carries all three call-budget caps. |
| DEC-091 | **A cached row is keyed by the source that wrote it, and a response's `source` is the row's, not the config's.** Fixture prices answered live requests inside TTL, labelled `live`. |
| DEC-092 | **Upstream is paced at the documented 5/min by declining, never sleeping: a call too soon is a refusal to refresh, not a wait.** One worker — a 12s sleep stalls the page. |
| DEC-094 | **On sample data no line may promise a fill, a price, or a wait for one.** Sample prices never move; the note saying so sat under three lines saying otherwise. |
| DEC-096 | **A consolidation sets the ceiling by guide §16's formula — what landed plus a quarter — and the "only ever down" gloss is given up.** It walled two sessions. |
| DEC-097 | **The page takes the site's face, and each face has one token.** `body.incisor` restated DM Sans and eleven declarations named it: a switch that reads as one line was eleven. |
| DEC-098 | **Anything sticky is measured against the provenance line, in a browser, every run.** A banner must be clear at the top of the page and wherever the page's own scrolling puts it. |
| DEC-099 | **`broadsheet.css` loads last and owns what is *between* surfaces** — the measure, what is ruled rather than boxed, where the lead sits. DEC-013 still gives each surface its own file. |
| DEC-100 | **Ticking text is held still by a fixed-width format, not a reserved width** — a reservation holds only for the alignment it was measured in. Right-aligned, the countdown moved the dot. |
| DEC-101 | **Promoted** → DEC-103, in *Recurring traps*; it bit the watchlist the next day. |
| DEC-102 | **Out of width, the comparable figure stays and the incomparable one gives up its width** — off-screen, never `display: none`. The watchlist drops the session's dollars at 460px. |
| DEC-104 | **A drawing that prints its own scale is not DEC-103** — the range bands label both ends, so the marker is readable. Do not add a percent beside them. |

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
| DEC-065 | **A later rule at equal specificity defeats an earlier one and no DOM test sees it** — `display` over `[hidden]`, `:focus` over `:focus-visible`. Assert the pair. |
| DEC-066 | **The greps in `test_page.py` are blunt substring checks and mislead three ways** — unread files, prose matching a token, per-file rules concatenated. |
| DEC-073 | **A box that scrolls inside itself is not measured by a body that does not.** The calendar clipped a dividend to "0.2" at 375px for four sessions; nothing failed. |
| DEC-076 | **A directory kept out of the web root by one mechanism is exposed the moment that mechanism is absent** — `tools`, then `server/` the same day. Both `.htaccess` and the vhost, always. |
| DEC-078 | **An empty state may not misdescribe what emptied it.** Three panels said "Look up a symbol above" about the symbol they had just been denied. Absorbed DEC-023. |
| DEC-090 | **A table laid out with `display: block` stops being a table to a screen reader** — rows and cells go with it. Write every role out; at desktop each matches the implicit one. |
| DEC-093 | **A *gain* at exactly zero takes no flat bar `▬`: it sits where a minus goes, so "▬ $0.00" reads as a loss.** One home, `gainArrowFor`. Bit T14, then T16. |
| DEC-103 | **A locally scaled line cannot be read against the one beside it, so every sparkline states its figure too.** Four tiles, then eight chosen rows; the size was in the `aria-label` both. |
