# Incisor Trading — Backlog

Ordered. Work the topmost unchecked, unblocked task. One per session.
Check the box, then append to `PROGRESS.md`.

Do not reorder tasks above the one you are working on. New tasks may be appended
to the end of a phase, or added to `## Discovered` at the bottom.

Legend: `[ ]` open · `[x]` done · `[!]` blocked (say why inline)

---

## Phase 0 — Foundations

- [x] **T0 · Data provider due diligence**
  Research free-tier US equity data providers. Produce `docs/DATA-PROVIDER.md`
  with a comparison table: rate limit, delay, whether the terms permit **public
  display on a website**, required attribution, coverage (quotes / historical /
  fundamentals), and API key requirements.
  *Accept:* file exists; at least three providers compared; each "public display
  permitted?" cell cites the specific terms clause. A recommendation is stated
  with reasoning. **The choice and the signup are Key's — never register for an
  account or accept terms.** Record the recommendation under `For Key` and carry
  on; the fixture layer means no session is ever blocked on this. No code today.

- [x] **T1 · Page skeleton, hidden**
  `incisor-trading/index.html`, `incisor.css`, `incisor.js`. Shared FEN base CSS, site nav,
  footer, `noindex,nofollow`. Three empty tabs: Dashboard / Trade / Learn. Hard
  coded placeholder numbers, zero network calls.
  *Accept:* loads at `localhost:8765/incisor-trading/`, looks like FEN, no console errors,
  tabs switch by keyboard, works at 375px wide, `git status` clean outside `/incisor-trading/`.
  *Done 2026-08-27.* Built and covered by `tests/` (34 checks, including the
  keyboard model run for real in JavaScriptCore). The criteria that need eyes on
  a browser — renders, console clean, 375px, looks like FEN — could not be
  checked, because a scheduled session cannot start the dev server. Split out as
  **D1** rather than left implied.

- [x] **T2 · Flask service skeleton**
  Clone the structure of `preside-by-side/server/`: `incisor.py` with a `/health`
  endpoint, origin checking, per-IP and global rate limiting, config loading from
  `$CONFIG_FILE`, SQLite init. Plus `requirements.txt`, `config.env.example`,
  `incisor-trading.service`, `apache-snippet.conf`. Port 8789.
  *Accept:* runs locally, `/health` returns JSON, rejects a bad Origin, rate limit
  trips under a loop. Deploy files written but **not installed**.
  *Done 2026-08-27.* 28 tests, all four criteria verified over a real socket as
  well as through the test client. Nothing installed, nothing touched on the
  server. `/health` is deliberately not reverse-proxied.

- [x] **T3 · Fixture layer**
  `INCISOR_DATA_SOURCE=fixture|live`, defaulting to fixture. `server/fixtures/`
  with hand-written representative JSON matching the chosen provider's documented
  response shapes. A parser module that turns provider JSON into our internal
  shape, exercised against the fixtures.
  *Accept:* the service serves quotes end-to-end from fixtures with no network
  access at all. Verified by running with networking unavailable.
  *Done 2026-08-27.* `provider.py` (parsing), `source.py` (the one I/O seam),
  `GET /quote` and `GET /history`, six symbols in Alpha Vantage's documented
  shapes. 72 service tests; the no-network criterion is asserted by breaking
  every socket constructor, and confirmed again on a real socket with the
  `upstream_calls` counter still at zero.

- [x] **T4 · Snapshot cache + price store**
  SQLite schema for quotes, daily bars, and fundamentals. A single fetcher module
  that is the only code allowed to call upstream, with per-endpoint TTLs and a
  call counter written to the DB.
  *Accept:* two rapid requests for the same symbol produce exactly one upstream
  call (assert against a stub). Quota counter is queryable.
  *Done 2026-08-27.* `store.py` and `fetcher.py`; the database moved out of
  `incisor.py` entirely. Four concurrent requests for one symbol also produce
  one call. **No fundamentals table** — its shape and its upstream both belong
  to T11, so building it now would be schema with no writer; see `DECISIONS.md`
  and the note under *For Key*.

---

## Phase 1 — Dashboard

- [x] **T5 · Market clock** — open / pre / post / closed, with weekends and the US
  market holiday calendar. Pure client-side, no data needed. Countdown to next
  open or close. *Accept:* correct for a hardcoded set of test datetimes including
  a half-day and a holiday.
  *Done 2026-08-27.* `js/market-clock.js`, pure, with the view in `incisor.js`
  — the clock draws nothing from the service, so it stayed in the shell when
  the data views moved out at T7. Holidays are computed from their rules
  rather than listed, so the calendar does not expire. 59 checks in
  JavaScriptCore. The `t5-market-clock/` shots were pruned at T6; every
  current shot set has the clock in it. See `DECISIONS.md` for the rule.

- [x] **T6 · Index summary strip** — SPY / QQQ / DIA / IWM tiles with price, change,
  percent change, sparkline. Labeled as ETF proxies, not index levels.
  *Accept:* renders from fixtures; delay label visible; degrades to "unavailable"
  with the service stopped.
  *Done 2026-08-28.* `js/market-figures.js` and `js/market-data.js` (new),
  styles split out to `css/market.css`. Built on `/history` alone — the last
  two bars are the quote, so the strip costs four upstream calls a day rather
  than eight. 103 checks in JavaScriptCore, 50 page tests, 100 service tests.
  The view moved to `js/view-index-strip.js` at T7, and the `t6-*` shots were
  pruned there. **Audited 08-29 — minor edits;** see the audit log for what
  changed and why. Every current `t8-*` set shoots this strip, filled and
  degraded.

- [x] **T7 · Symbol search + quote detail** — search by ticker or company name;
  detail panel with last price, change, day range, 52-week range, volume vs.
  average, market cap, P/E. *Accept:* keyboard-navigable results; unknown symbol
  shows a clean not-found state.
  *Done 2026-08-28.* `js/symbol-search.js`, `js/view-symbol.js`, `js/dom.js`
  and `server/catalog.py` (new), with the views split out of `incisor.js` and
  `css/lookup.css` out of `css/market.css`. The fixture series went from 120
  bars to 260 so the 52-week range is a real figure, and live mode now asks
  for `outputsize=full` for the same reason. **Market cap and P/E render as
  em dashes**, with a line on the page saying why: they come from filings,
  which is T11. 163 checks in JavaScriptCore, 72 page tests, 123 service
  tests. Four states screenshotted under `docs/shots/t7-*`: loaded,
  searching, not-found, and with the service stopped.

- [x] **T8 · Price chart** — hand-rolled SVG. Ranges 1D / 5D / 1M / 6M / 1Y / 5Y.
  Hover readout, accessible fallback table. No chart library.
  *Accept:* renders each range from fixtures; readable in light and dark; usable
  by keyboard; no layout shift on range change.
  *Done 2026-08-29.* `js/chart-geometry.js`, `js/view-price-chart.js` and
  `css/chart.css` (new). A surface of its own beside the quote card, drawing
  the series that panel already fetched — so a range change costs nothing
  upstream. **Five ranges, not six: there is no 1D**, because a day of a daily
  series is one bar; see `DECISIONS.md`, and do not "complete" this by adding
  it. 5Y draws the 260 sessions fixtures hold and says so on the page. Axis
  labels and round markers are HTML positioned over the SVG, because
  `preserveAspectRatio="none"` smears text and turns circles into ellipses.
  128 checks in JavaScriptCore, 88 page tests, 123 service tests; five states
  screenshotted under `docs/shots/t8-*`. **Audited 08-30 — minor edits;** see
  the audit log for what changed and why. The drawing moved to
  `js/chart-canvas.js` there, when the view crossed the 600-line rule, and a
  sixth shot set holds the state fixtures cannot serve.

- [x] **T9 · Watchlist** — add/remove symbols, persisted to `localStorage`, sortable.
  *Accept:* survives reload; handles a cleared/blocked `localStorage` without
  throwing; caps at a sane number of symbols to bound upstream calls.
  *Done 2026-08-30.* `js/watchlist-store.js`, `js/view-watchlist.js` and
  `css/watchlist.css` (new), plus a Watch toggle beside the quote card —
  outside `[data-quote]`, because everything in that panel is a figure the
  service returned and this is a control over the reader's own list. **Capped
  at eight**, and the number is the upstream budget rather than taste: a row
  costs one `/history` call, the same single call a tile costs. 119 checks in
  JavaScriptCore, 122 page tests, 128 service tests. Three states
  screenshotted under `docs/shots/t9-*`; the service-stopped state was
  verified and not committed, because `t8-service-down` already holds that
  picture. **Two defects found in the screenshots, not the tests** — the
  `[hidden]` attribute defeated by an author `display` rule, and a notice
  that only appeared after the thing it warned about. See `PROGRESS.md`.
  **Audited 08-31 — minor edits;** see the audit log for what changed and
  why. It grew a **trend column** there, drawn from the series each row was
  already fetching and dropping, and went full width to hold it; the
  sparkline drawer moved to `js/sparkline.js` and is shared with T6.

- [x] **T10 · Sector performance grid** — eleven Select Sector SPDR funds,
  ranked, over 1M / 3M / YTD / 1Y. *Accept:* renders from fixtures; gains/losses
  are distinguishable in grayscale.
  *Done 2026-08-31.* `server/sectors.py`, `js/view-sectors.js` and
  `css/sectors.css` (new), plus `GET /sectors` — the first route that computes
  rather than relays, because eleven series is a third of a megabyte to answer
  a question that needs forty-four numbers. **Sectors only: the movers half is
  T10b**, not because it is hard but because it cannot be built from per-symbol
  calls at all; see `DECISIONS.md` and do not "complete" this by ranking a
  handful of large caps. **No 1D column**, for the same reason T8 has no 1D
  range: eleven funds cost eleven of a 22-call day, so their series are read at
  a week and the shortest window the grid can honestly draw is a month. Every
  figure is measured to the newest date all eleven share. 72 checks in
  JavaScriptCore, 138 page tests, 156 service tests. Three states shot under
  `docs/shots/t10-*`. **Two defects found in the screenshots, not the tests** —
  bars overflowing their track, and sector names wrapping between 560 and
  768px.

- [x] **T10a · Give the served document a seam before the next surface lands**
  `index.html` is at 888 lines against the 900 ceiling D2 set — 12 lines of
  headroom, and T10b, T11 and T12 each add a surface. This is not a defect; it
  is sequenced work that has to happen before the next surface, and it was
  deferred once already.
  *Accept:* either a real seam is found and the document splits along it, or the
  ceiling moves with the reasoning written down the way D2 did it, and the
  per-surface 150-line rule is shown to still be the thing protecting
  readability. Whichever, `test_the_served_document_stays_under_900_lines` ends
  the session green with headroom for the surfaces still planned.
  *Done 2026-09-01.* **No seam exists and the ceiling was measuring the wrong
  thing.** A quarter of the document is comment, and on the one file that
  cannot split, counting comments makes deleting the reasoning the cheapest way
  past the rule — the opposite of what guide §16 asks for. The ceiling counts
  markup only now: 596 lines, under the 600 every other shipped file obeys,
  with 304 of headroom. **The per-surface rule was not reaching two of the
  surfaces it was supposed to protect** — it pairs a block with hooks that
  begin with the block's own attribute, and `[data-sectors]` matched none of
  its ten `data-sector-*` hooks on a plural `s`. The container is singular now
  and a derived guard fails any surface-shaped block no length rule reaches.
  141 page tests, 156 service tests, `shoot.py --api` green at four widths.

- [!] **T10b · Market movers** — top gainers, losers and most actively traded.
  The half of T10 that was deferred rather than deprioritised: it needs a
  **symbol-less upstream endpoint**, which the source path, the cache key and
  the per-symbol lock all assume does not exist. Ranking the catalogue instead
  costs one call per symbol — 48 against a budget of 22 — and any universe
  small enough to afford is too small for the answer to be true, because real
  top gainers are small caps nobody hand-picked. Alpha Vantage's
  `TOP_GAINERS_LOSERS` answers the whole market in one call and is the only
  affordable route to it. Two things to settle first: whether the fixture layer
  can produce a believable payload naming sixty tickers that are not in
  `server/catalog.py` and cannot be opened (D3, squared), and what the endpoint's
  terms say — `docs/DATA-PROVIDER.md` has no row for it.
  *Accept:* three lists render from fixtures; every symbol shown is one the page
  can say something about, or the list says why it cannot; the whole surface
  costs one upstream call a day.
  **`[!]` Blocked 2026-09-01 — the first surface here that has no honest
  fixture.** Both questions were settled and they point the same way. *Terms:*
  the endpoint has none of its own. Alpha Vantage licenses the platform in one
  sentence and the document does not contain the words "endpoint", "function",
  "dataset" or "Alpha Intelligence" anywhere, so this inherits the API-wide
  ambiguity and is resolved by the same written answer as everything else — see
  `DATA-PROVIDER.md`, *Per-endpoint terms*. Nothing further to research.
  *Fixture:* there is no shape that is both believable and honest. Every other
  surface's fixture synthesises a **series** for a symbol we chose; this one's
  payload is a **selection** — which symbols the market picked — and a selection
  cannot be synthesised. Inventing sixty tickers fabricates companies, not
  prices, and the provenance line cannot make a corporate identity honest.
  Ranking the seventeen symbols this build holds is a ranking of eleven sector
  funds and four index proxies presented in the clothes of a movers list, which
  is the dead end already recorded for the per-symbol version wearing a cheaper
  hat. And the one payload that *would* be honest — a real captured response —
  is the single thing the unresolved licence forbids, because committing it to a
  public repo is display.
  *Unblock when:* Key's written display permission exists, at which point this
  is built and verified in live mode directly, one call a day, and its symbols
  are openable because live mode already tries a free-typed ticker.

- [x] **T11 · Fundamentals panel** — the standard set: market cap, P/E, EPS,
  dividend yield, beta, shares outstanding, revenue, margins. Each with a one-line
  plain-English explanation on demand. *Accept:* every figure has a definition; missing
  data renders as "—", never as 0 or NaN.
  *Done 2026-09-01.* `server/edgar.py`, `server/fundamentals.py`,
  `server/collect.py`, `js/view-fundamentals.js` and `css/fundamentals.css`
  (new), plus `GET /fundamentals` — **the second upstream**. Filings come from
  SEC EDGAR, which is public domain, needs no key and allows ten requests a
  second, so the whole surface costs nothing against the 22-call day; a lookup
  still costs the two calls it did before this panel existed. Beta is measured
  from bars already in the cache and never refreshes one.
  **The quote card was split along its provider, not its markup** — the entry
  below said to extract the figures list, and the real seam is where the
  numbers come from: market cap and P/E moved out, Open and Volume stayed, and
  `[data-quote]` went 143 → 127 lines. See `DECISIONS.md`; do not "finish" the
  split by pulling the price figures out too.
  **The budget had to learn there are two upstreams.** `budget_remaining()`
  counted the whole call log, so a free SEC request would have cost one of
  Alpha Vantage's 22 — undoing the entire reason for choosing EDGAR. Scored
  over `source.UPSTREAM_OF` now, with a test that a filing call does not move
  the budget and a price call does.
  76 checks in JavaScriptCore, 160 page tests, 194 service tests. Four states
  shot under `docs/shots/t11-*`: a company, its explanations open, a fund, and
  the panel with the service stopped. **Two defects found in the screenshots,
  not the tests** — the explanations set in monospace because `font-family:
  inherit` resolves to the figure's face, and a heading reading "the company
  behind XLK" directly above a sentence saying XLK is not a company.
  `incisor.py` crossed the 600-line rule when the route landed and was split
  at `collect.py`. **One defect filed rather than fixed: D7.**

- [ ] **T12 · Earnings and dividend dates** — next earnings date, last report
  surprise, dividend ex-date and amount for the viewed symbol.

- [ ] **T13 · Dashboard polish, accessibility, and security pass** — accessibility
  audit, mobile pass, number formatting consistency, delay labels and attribution
  verified on every surface, designed empty/error/loading states for every panel.
  Add the `Content-Security-Policy` and `X-Content-Type-Options` headers. Audit
  every control for a generic `data-track` label so no ticker or dollar amount
  reaches the beacon. Confirm no `innerHTML` receives network or storage data.
  *Accept:* screenshots at 375px and desktop; keyboard-only walkthrough noted;
  CSP verified with no console violations; a grep for `innerHTML` comes back clean.

- [ ] **T13b · Visual directions, round one** — spin up two or three genuinely
  distinct `incisor-look/*` branches off the finished dashboard, each a complete,
  screenshottable treatment rather than a recolour. Register every one in
  `docs/DESIGN-BRANCHES.md` with concept, screenshots at both widths, and the
  preview command. *Accept:* the register renders correctly and each branch checks
  out and runs; directions differ in layout or hierarchy, not just palette.

---

## Phase 2 — Paper trading (live sim)

- [ ] **T14 · Portfolio model** — `localStorage` state: cash, positions, cost basis,
  realized and unrealized P/L. Versioned schema with a migration path. No account,
  no server state. *Accept:* survives reload; a corrupted stored blob resets cleanly
  with a warning rather than breaking the page.

- [ ] **T15 · Order ticket** — market and limit orders, long only, whole shares.
  Enforces the **forward-fill rule** (§7 of the guide) and the market-hours gate;
  orders placed while closed queue to the next open. *Accept:* an order placed
  against a fixture fills at the *next* price, not the displayed one; insufficient
  funds and invalid quantity are rejected with clear messages.

- [ ] **T16 · Positions, history, performance** — holdings table, transaction log,
  equity curve vs. a buy-and-hold SPY benchmark over the same period.
  *Accept:* P/L math verified against a hand-computed scenario written into the
  progress entry.

- [ ] **T17 · Corporate actions** — apply stock splits to held positions. Dividends
  optional. *Accept:* a split fixture adjusts share count and cost basis correctly.

- [ ] **T18 · Reset and onboarding** — reset portfolio, a short first-run explainer,
  the disclaimer surfaced before the first trade.

---

## Phase 3 — Historical replay

- [ ] **T19 · Replay dataset builder** — assemble anonymized historical windows
  from free EOD data: "Company A", no ticker, no dates, 60–250 trading days,
  with the fundamentals that were true at the time where available. Store as
  static JSON in the repo so replay needs no live data at all.
  *Accept:* at least 5 windows built, spanning different regimes (a crash, a
  bubble, a flat grind, a steady climb, a bankruptcy).

- [ ] **T20 · Replay engine** — step or auto-advance day by day, trade at each
  step, pause, adjust speed. Same order rules as Phase 2.
  *Accept:* a full window can be played start to finish; state survives a reload
  mid-run.

- [ ] **T21 · Reveal and post-mortem** — at the end, reveal the company and dates,
  show what actually happened next, and compare the user's return against
  buy-and-hold and against the best possible trade.

---

## Phase 4 — Hints

- [ ] **T22 · Deterministic signal engine** — Python module computing RSI,
  distance from 50/200-day moving averages, 52-week position, volume vs. average,
  P/E vs. sector median, days to next earnings. Pure functions, no I/O.
  *Accept:* unit-tested against hand-computed values on a fixture series.

- [ ] **T23 · Strategy framing layer** — map computed signals to named strategy
  readings, always emitting at least two that disagree. Templated text only, no LLM.
  *Accept:* no output contains directive or predictive language; a test asserts
  against a forbidden-phrase list ("buy", "sell", "will", "should", "undervalued").

- [ ] **T24 · Hint UI** — opt-in, per-symbol and per-order. Off by default. Shows
  the computed facts alongside the framings, with the disclaimer attached.

- [ ] **T25 · Optional Ollama prose layer** — local model rewrites templated hints
  more readably, constrained to the numbers it is given, output re-checked against
  the forbidden-phrase list, falls back to the template on any violation or timeout.
  *Accept:* a deliberately adversarial prompt cannot produce a recommendation;
  service down means templates still render.

- [ ] **T26 · Compliance pass** — disclaimer present on every hint surface, every
  game surface, and the page footer. Ship the wording given in guide §11 as-is;
  note under `For Key` that the final legal phrasing is his to settle.

---

## Phase 5 — Promotion (Key does these, not the routine)

- [ ] **T27 · Promotion checklist** — the routine *writes* `docs/PROMOTION.md`:
  everything Key must do to take the page live (install the systemd unit and
  Apache snippet, create `/etc/incisor-trading/config.env`, set the real API key, remove
  `noindex`, add to sitemap/robots/nav, set up DB backups, verify TLS, load-check
  against the residential uplink). The routine never executes it.

---

## Phase 6 — Ongoing (never completes)

Reached when Phase 5 is done. There is no end state here; see guide §17. Pick
whatever will make the page most measurably better that day.

- [ ] **O1 · Research sweep.** Look outward — new web platform capabilities,
  visualization and interaction techniques, how the best financial and teaching
  interfaces handle density, change and explanation. Record findings in
  `DECISIONS.md` whether or not they are acted on, so the same ground is not
  covered twice. Repeatable; never checked off for good.
- [ ] **O2 · New visual direction.** A fresh `incisor-look/*` branch, registered
  in `DESIGN-BRANCHES.md`. Always legitimate, at any point, forever.
- [ ] **O3 · Major revamp.** If the page would be better rebuilt around a
  different structure, interaction model or visual language, build it on a
  branch and register it. Bold is free — it affects nothing until Key merges.
- [ ] **O4 · Deepen a feature.** Take something that works and make it excellent
  rather than adequate.
- [ ] **O6 · Audit a feature.** Take the least-recently-audited part of the page
  and answer the four questions in guide §18 — useful, easy, beautiful,
  performing — against the actual `shoot.py` images, not the source. End in one
  of the four verdicts and record it in the audit log below. If the verdict is
  *challenge it*, the replacement gets built to completion on
  `incisor-try/<feature>-<approach>` and compared finished-to-finished against
  criteria written down before either was judged. Repeatable; never checked off.
- [ ] **O5 · Maintenance.** Refresh fixtures, re-check provider terms, tighten
  tests, simplify what has grown awkward, re-walk the §5 security surface.

---

## Standing tasks

Not sequenced. Available any session where the top backlog task is blocked, or
when a phase closes and a breather is useful.

- **S1 · Spin a look branch.** A new `incisor-look/*` direction on whatever exists
  today, registered in `DESIGN-BRANCHES.md`. Always a legitimate use of a session.
- **S2 · Spin a `incisor-try/*` experiment.** An alternative approach worth
  proving or disproving. Record the finding in `PROGRESS.md` either way; a
  negative result is a real result.
- **S3 · Refresh fixtures.** Recapture provider JSON when response shapes drift.
  Costs live quota — log it.
- **S4 · Security review of the current surface.** Re-walk §5 of the guide against
  the code as it now stands. Note findings; fix the ones inside `/incisor-trading/`.
- **S5 · Tighten what exists.** Simplify a file that has grown awkward, improve an
  error state, add a missing unit test. No new features.
- **S6 · Consolidate the memory.** When `DECISIONS.md` runs past roughly two
  screens, merge duplicate entries, promote anything that has bitten twice into
  *Recurring traps*, and prune stale screenshots from `docs/shots/`. Delete no
  decision entries — the file has to stay readable in full every session, and it
  only stays useful if it stays short.

---

## Audit log

One row per audit, newest last (guide §18). A surface with no row here and three
or more sessions behind it **is due**, and a due audit is taken at step 4 of the
session protocol *instead of* the next backlog task — one per session. A *keep*
verdict still writes a row; that row is what stops the surface coming up again.

**Shipped and not yet audited**, oldest first — this is the queue:

**Nothing is due.** Every surface on the page has a row below. The next one
falls due three sessions after the next surface ships.

| Date | Feature | Verdict | Note |
|---|---|---|---|
| 08-29 | **Market clock** (T5) | **Minor edits** | Useful, and the only surface that works with no service at all — but it answered the less useful half of its own question. "Opens in 2d 10h" is a sum the reader does in their head, against a timezone the live line had stopped naming: it overwrites the served text, which was the page's only mention of ET. Now "Opens Monday 9:30am ET", countdown kept only while the event is today. The reason a day is odd (holiday, half day) moved to its own element so it wraps whole. Measured at 375px rather than eyeballed: five everyday states one row, three rare ones a stable two, and the served and live lines now match at 34px, closing a load-time shift the reserved height had not actually prevented. Beautiful: it is the plainest thing on the page and should stay that way — one quiet line above the tabs is right for something read in a glance. Performing: zero upstream calls, no network at all, and it renders before any data arrives. |
| 08-29 | **Index summary strip** (T6) | **Minor edits** | Useful: it answers the first question a visitor has, and it is the only surface that answers one without being asked. Easy, except on a phone — where it stopped being the thing it is. At `minmax(180px)` a 390px viewport fitted exactly one column, so the strip became 730px of grid holding four readings that exist to be compared and could only be read one at a time; 160px pairs them, 730px becomes 359px, and all four are on screen together. Beautiful: yes, it is the part of the page a screenshot would lead with — but it opened with "Charts, movers and fundamentals fill the rest of this panel across T8–T12", a sentence written to the routine, shown to the reader, and wrong from the day T8 shipped. Performing: four `/history` calls a day against a 22 budget, cached and shared across every visitor, reserved heights so the fill shifts nothing, and a stated "unavailable" when the service is down. The real defect was in the numbers: the tile states two windows and named only the second, so a red −0.79% for one session sat directly above a "30d" belonging to the line. Every change now carries `1d`, set the same way and directly above the `30d` it pairs with, and says "over the last session" aloud. **Not fixed, filed as D3:** a tile shows a symbol and cannot open it. |
| 08-30 | **Symbol lookup and quote detail** (T7) | **Minor edits** | Useful: it is the only way to reach any symbol that is not one of the four proxies, and the chart has no source without it — the page would lose half of what it does. Easy: three keystrokes and Enter, the combobox model is right, and "apple" opens Apple. Beautiful: the numbers are set properly and the card holds up beside the strip. Performing: two upstream calls per symbol against a 22 budget, issued together rather than in sequence, cached and shared. **Three defects, all of them things the card left the reader to work out.** The change named no window — four windows meet on this card and the largest coloured figure on the page named none of them, which is the T6 tile finding on the surface that shipped before that rule existed; it carries `1d` and a spoken phrase now. The range bands drew their own point and would not say it: the marker is decorative, so a screen reader got a low and a high and none of the placement they exist to give — each band ends in a spoken sentence now, silent when the position is unknown. And the not-found message ended "the search list above is all of them" while the failed lookup had just closed that list, so it named an empty strip of screen; it names the symbols instead. Also fixed: a failed lookup states its reason in the panel alone, and the panel was not a live region, so the only thing ever announced was the advice. |
| 08-30 | **Price chart** (T8) | **Minor edits** | Useful: it answers the question a price cannot — what the thing has been doing — and it is the only surface that reuses a series already paid for, so it teaches at no cost. Pressing 5D inside a green six months is the cheapest lesson on the page. Easy, except by finger. Traced in Chrome under mobile emulation: a tap fires pointerdown, pointerup and pointerleave and **no pointermove**, which was the only event the chart listened for — so the one gesture a phone has read nothing, while the drag that did work threw its answer away on the lift, and the hint named hover and the arrow keys. A pointerdown now reads, a touch lift keeps the reading, a pointercancel withdraws it, and the sentence names the finger. Beautiful: it is the second thing a screenshot of this page leads with, and it never said what it was a chart of — the plot's `aria-label` named the symbol from the first day and nothing on screen did, with the quote card a scroll and a half above it on a phone. It carries `SPY proxy` in its head now, badge included, because the strip promises proxies are labelled wherever they appear. Its worst-looking state was the one no screenshot held: with a quote but no series, the empty SVG stayed in flow and squeezed the message into a 209px column against the left edge of a 969px dashed box, under a head still naming the last symbol's window, beside five range buttons that moved `aria-pressed` and redrew nothing. All four fixed, and `shoot.py --chart-no-history` means the state has a picture now. Performing: measured rather than assumed — five range changes made **zero** upstream calls, a redraw takes 8–16ms, and the 260-row fallback table builds in 25ms and only when opened. **Looked at and left:** the end markers sit astride the plot border, because the first and last sessions *are* the window's ends and the axis labels are pinned to those same edges; and the price axis carries three labels on 1Y and 5Y against six on 6M, because the step family jumps 25 to 50 — 650/700/750 across a 605–785 band is a scale you read rather than interpolate. |
| 08-31 | **Watchlist** (T9) | **Minor edits** | Useful, and it is the only surface that is *about the reader* — the strip and the grid show what the market did, and this shows what the symbols they chose did. But it was showing less about them than the strip shows about four they did not choose: a watched row costs one `/history` call, the same single call a tile costs, and it was keeping three numbers out of 260 bars and dropping the rest. The tile above it drew a line from exactly that payload. The trend column is free upstream and it is the answer to question one — a list of prices is a lookup, a list of shapes is a scan. Easy: yes by keyboard, and no by finger, twice. The remove control measured **28x22 on every viewport**, under the 24px WCAG 2.2 minimum on one axis, and it deletes a row with no undo; the target is the whole cell now, 52x41 and 42x44, hit-tested at all four corners rather than read off the rule. And the sort headers marked only the sorted column — the other two changed colour on hover, which a phone does not have, so two of three columns told a sighted touch reader nothing. Beautiful: it was the part of the page you would crop out, and **T10 is what made that true** rather than any change to this surface — an eleven-row ranked table now runs edge to edge directly above a table that stopped at 58% of the column, which reads as a surface that failed to finish loading. Full width now, and the trend column is what earns the width the figures could not. Performing: unchanged, and that is the point — no new call, no new route, no new state; the bars were already being fetched and parsed. **Looked at and left:** the provenance sentence under this table is word-for-word the one under the strip, which is three identical sentences in one scroll — but each surface makes its own claim about its own numbers, and a shared line would be one surface speaking for another's data. |
| 09-01 | **Sector grid** (T10) | **Minor edits** | Useful, and it is the only surface that answers the question the four tiles cannot no matter how long you look at them: what the market did *underneath* the index. The strip says SPY finished down 0.79%; this says materials rose 22% year to date while financials fell. It teaches without being asked to, as well — pressing 1M after YTD re-ranks the same eleven funds into a different order, which is the whole lesson that a ranking is a function of its window. Easy: one press to change it and none to read it, real buttons in a labelled group with `aria-pressed` and a visible focus ring, and direction survives greyscale twice over — an arrow and an explicit sign on the figure, and a bar rounded on the end it grew towards. **But on a phone it stopped being the thing it is.** Below 560px the narrow rule set `display: none` on the bar, so the width §13 calls first was the one width where eleven ranked funds were a column of figures — on a surface whose own stylesheet opens by saying the bar "is the whole reason this is a list and not a table of figures". That rule's reasoning was sound and aimed at the wrong target: three columns really do not fit, which is an argument against the bar sitting *beside* the name and not against the bar. Stacked under it, it gets 358px at 390px — longer than the 343px it has on a tablet — and the breakpoint moved to 700px, because 560 is where three columns first fit rather than where they first work. Beautiful: yes, it is the densest thing on the page and the diverging axis is the best single idea on it. Performing: 2.9KB on the wire, 6ms warm and 26ms cold, complete at 72ms with the grid ready before `DOMContentLoaded` at 107ms, and **four window presses made zero market-data calls** — only the beacon, one per press, carrying the generic label. A redraw is 0.5ms. **Looked at and left:** 319px of nothing between the longest sector name and the start of the bar track at 1440. The alternative was built and shot rather than argued about, and it is worse; see `DECISIONS.md`. |
| 09-02 | **Fundamentals panel** (T11) | **Minor edits** | Useful for a company, and it is the most explicitly educational surface on the page — the explanations are the best writing on it and they teach without being asked twice. But **fifteen of the seventeen symbols this build serves are funds**, and the fund state was the common case answering with one number under a sentence promising more: "What can be measured from its price is below" over a lone beta, with 900px of nothing beside it. The two figures that fix it were already being computed and thrown away — `beta()` pairs this symbol's daily returns with the benchmark's and reads one number off the pairing, so volatility and correlation cost nothing upstream and nothing on the wire worth measuring (883 bytes to 952). Correlation is the one that earns its place twice: a beta is a slope fitted through whatever is there, and 1.16 at a correlation of 0.61 means something quite different from 1.16 at 0.9 — the panel stated the slope and never how much of the movement it explained. Easy: yes by keyboard, and the explanations are a real button with real state. **But the layout was hiding the one relationship it explicitly teaches.** The three margins are the same sale with one more cost taken off each time, and in a single ten-figure grid they sat 819px apart across a row break at 1440 and split again at two columns — while the copy under the third told the reader they always fall in order. No ordering of one grid keeps a trio together at four columns and at two, so the grid was the thing that had to go: four groups of three now, each with a heading, each its own row, verified as one row at 1440, 768, 390 and 320 rather than eyeballed. The margins were not the only thing the flow broke — a label that wraps pushed its value half a line below its neighbours, so the groups share grid rows and the values sit on one baseline. Beautiful: it was the part of the page you would crop out, ten unlabelled numbers next to a sector grid with bars and a chart; four labelled groups is the first structure it has had. The group headings had to be lifted to full ink, because set muted at the figure labels' own size "AGAINST THE PRICE" and "MARKET CAP" were the same thing twice. Performing: unchanged where it counts — one request per lookup, 4ms, **zero calls against the 22-a-day budget** because filings come from EDGAR, and opening the explanations makes no request at all. **Looked at and left:** the fund panel still leads with a paragraph about what is absent before showing what is present, which is the right order for a reader who searched a ticker expecting a company. |

## Discovered

Tasks found mid-work that don't fit above. **Label each one `[defect]` or
`[enhancement]`** — see guide §19. A defect is taken before anything else at
step 4 of the session protocol; an enhancement waits for Key to triage it into a
phase. When the call is unclear, file it as a defect.

- [ ] **D9 · Split the memory into an index and a detail file** `[defect]`
  *(flagged by the routine 2026-09-02; design settled with Key the same day)* —
  filed as a defect because the file only works as memory if it is read in full
  every session, so its size is a correctness property, and this one is
  degrading quietly with nothing failing to show it. **57,628 bytes across 50
  settled rows**, up from 10,849 after the last consolidation five days earlier:
  10.8K → 23.8K → 36.1K → 57.6K. The guide's old "roughly two screens" passed
  the whole way, because it counted lines while the rows are single lines up to
  1,573 characters — the 600-line-rule trap wearing a different hat.

  **The shape, decided rather than left open.** Skimming a book, not reading it:
  an index you read front to back, and a detail file you open only when a line
  in the index makes you want to.

  1. **`DECISIONS.md` becomes the index** and keeps its name — there are 81
     references to it across the docs, the tests, and code comments in
     `watchlist-store.js`, `sparkline.js`, `edgar.py` and others. Renaming the
     file everything points at trades a size problem for eighty dangling
     pointers. It stays the file §14 step 2 reads **in full**.
  2. **`DECISIONS-DETAIL.md` holds the reasoning.** It may grow without bound —
     storage is free and attention is not — and it is read only by following an
     index line, never front to back.
  3. **Every entry has a stable ID** (`D-001`, `D-002`, …) which is a real
     anchor in the detail file. "See the detail file" is useless at two hundred
     entries: following it would mean reading the whole thing, which defeats the
     split. IDs are assigned once and never reused, including for entries that
     are later superseded.
  4. **An index line carries the claim *and* its reason in brief** — never just
     a subject. "Finnhub — rejected" does not stop the next session re-walking
     it; "Finnhub — ToS forbids redistribution" is sufficient on its own and the
     detail never has to be opened. The index line must be independently enough
     to *prevent* the loop; the detail is for when you need to act on it.
  5. **Dead ends are indexed the same way** — tried X, failed because Y, revisit
     if Z, on one line. Locality cannot reach a dead end (you are about to
     create a file that does not exist yet, so there is no header to read), so
     the index line has to stand alone.

  *Accept, and each of these is checkable:*
  - `DECISIONS.md` is **under 12,000 bytes** and every settled row, dead end and
    recurring trap survives as an index line — count them before and after and
    state both numbers.
  - **No index line exceeds 200 characters**, asserted by a test. This is the
    one that matters most: the current file is what happens without it, because
    those 1,573-character rows were one-liners once. Nobody decided to write
    essays; they accreted.
  - `DECISIONS-DETAIL.md` carries the full reasoning for every entry, under its
    ID as a heading. **No reasoning is lost** — this is a move, not a trim.
  - **A bijection test**: every index ID resolves to exactly one detail heading,
    and every detail heading is indexed exactly once. Without it the split
    trades a size problem for a silent correctness problem, and dangling
    references are the failure mode of every index that has ever rotted.
  - `CEILING` in `tests/test_docs_budget.py` lowered to match what lands, and
    its docstring updated to describe the two files.
  - Guide §16 rewritten to describe the index/detail model, and §14 step 2 to
    name which file is read in full.
  - Both suites green.

  Expect a whole session. Take it before feature work — every session that files
  a decision first pays for this one's postponement.

- [x] **D8 · The per-IP gate can be sidestepped by the caller it is meant to
  bound** `[defect]` *(found 2026-09-02 fixing D7, fixed 2026-09-02)* — fixed
  as filed: the gate reads the **last** hop now, the only one Apache wrote.
  The one-line fix was one line; the part worth recording is the entry the
  scope did not mention. A caller controls the whole prefix **including its
  separators**, so `X-Forwarded-For: 1.2.3.4,` arrives appended as
  `1.2.3.4, , <peer>` — take the final comma-separated field verbatim and the
  bucket is the **empty string**, which `rate_limit_check` reads as an
  unidentifiable caller and exempts from the per-IP gate altogether. Taking
  the last hop and taking the last *non-empty* hop are one character apart and
  the first one reopens the defect through a side door.
  Verified against a live service, not only the test client: 70 requests each
  carrying a fresh claimed address trip at exactly 61, the log shows all of
  them bucketed under the appended peer rather than any of the 250 claimed,
  and a different reader is unaffected. Four back-to-back `shoot.py` runs stay
  green with zero 429s, so the tool's four simulated readers are still
  identified one by one — the criterion the fix had to keep.
  `TestForwardedForTrust` is seven checks; the six that assert the fix were
  confirmed to fail with the first-hop read put back, and the two that must
  hold both ways (a single hop is the caller, no header falls back to the
  peer) hold in both directions. Original scope below.

  ~~`get_client_ip()` takes
  the **first** hop of `X-Forwarded-For`, and `mod_proxy_http` **appends** the
  peer to whatever the client already sent. So a caller who sets the header
  themselves arrives as `X-Forwarded-For: <whatever they chose>, <their real
  address>`, and the service buckets them under the half they control. Vary it
  per request and the 60-a-minute per-IP ceiling never fires.~~

  Found from the other side: D7's whole subject is that the tool was never
  exercising this path, so nothing had looked at what the path does with a
  header a stranger can write. Filed rather than fixed because guide §19 takes
  one defect a session and this is a different surface from the one just
  worked on — the service edge, not the tool.

  **Bounded, not harmless.** The global gate is 600 a minute across every
  caller, is keyed on nothing spoofable, and the 22-a-day upstream budget sits
  behind that, so quota — the thing §5 says to protect — stays bounded. What
  is lost is the per-caller ceiling: one client can take ten times its share
  of the service, and of the cache behind it, without ever being refused.

  The likely fix is one line and its reasoning: behind exactly one trusted
  proxy the **last** hop is the only one Apache wrote and the only one a
  caller cannot forge. It needs saying in a comment, because taking the last
  hop looks wrong to anyone who has read the usual advice about the first.
  *Accept:* a request carrying a forged `X-Forwarded-For` is bucketed under
  the address Apache appended, not the one the caller supplied; a test drives
  a forged header through the real gate and shows the ceiling still trips;
  `tools/shoot.py` still identifies its own visitors, since it sets exactly
  one hop and is the shape the fix has to keep working.

- [x] **D6 · The watchlist table pushes the page 2px wide at 320px** `[defect]`
  *(found 2026-08-31 in the T9 audit, diagnosed attended the same day, fixed
  2026-08-31)* — and the table was never the culprit. It scrolls inside its own
  box correctly, and always did; what escaped was the header's off-screen
  "Remove" label. `.inc-offscreen` is `position: absolute`, and an absolutely
  positioned element is clipped only by an ancestor that is a **containing
  block** for it — a scroller with no `position` is not one, so the label sat
  1.77px past a 320px viewport while every visible column obeyed the clip.
  Fixed by making the three sideways-scrolling boxes containing blocks, with
  the reason recorded beside `.inc-offscreen` in `incisor.css` because that is
  the thing that escapes. Two guards, both confirmed to fail with the fix
  removed: `test_page.py` derives every `overflow*: auto` rule from the shipped
  CSS and asserts each one also establishes a containing block, and
  `tools/shoot.py` loads the page a fourth time at **320px with a full
  eight-row watchlist** and checks for overflow — measured, not photographed,
  and skipped with a stated reason when `--api` is absent, because an unpriced
  table is narrower than the rule is about. Density is unchanged: every column,
  row and cell measures identically at 320, 390, 768 and 1440, and the remove
  control still hit-tests at all four corners.
  Original scope below.

  ~~The audit measured the overflow, confirmed it pre-existing, and left it
  because chasing it belonged to another surface.~~ It belongs to this one:
  measured with
  six rows stored, `table.inc-watch-table` overflows by 2px at a 320px viewport,
  and is clean at 360 and 375. Guide §13 is unconditional — "wide tables scroll
  inside their own container; the page body never scrolls horizontally" — and
  this table pushes the body instead of scrolling itself, so the width §15 names
  for checking is not a floor below which the rule stops applying. `shoot.py`
  cannot see it: its narrowest viewport is 390.
  *Accept:* no horizontal overflow at 320px with a full eight-row watchlist; a
  test asserts it at 320 so the next narrow surface cannot reintroduce it;
  desktop row density unchanged.

- [x] **D7 · Two `shoot.py` runs inside a minute trip the service's own rate
  limit** `[defect]` *(found 2026-09-01 building T11, fixed 2026-09-02)* — and
  none of the three candidates in the original scope was the fix, because the
  arithmetic was not the defect. **The tool was not identifying its callers.**
  With `--api` it stands in for Apache, and `mod_proxy_http` sets
  `X-Forwarded-For` from the peer on everything it forwards; this proxy set
  nothing, so all four browser contexts reached the service as the loopback
  peer and shared one per-IP bucket. Four visitors were being charged to one,
  and the second run inside the minute paid for the first.
  That also made this the one control whose production path no local check
  ever took: the service buckets by the forwarded address, and every request
  the tool ever sent took the `else` branch.
  Each context is a visitor now with its own RFC 5737 address, in a block
  keyed on the process so a rerun is a fresh set of readers. **Four runs back
  to back are green with zero 429s**, verified against a live service, and the
  service log shows it bucketing four distinct addresses rather than one.
  The ceiling is still exercised, deliberately rather than by collision: the
  proxy tallies per visitor and fails the run when **one page load** outgrows
  the allowance **one reader** gets — which is the finding that was hiding
  under this. A load cost nine requests when D7 was filed and costs fourteen
  with a full watchlist; nothing was tracking the number, and it grows every
  time a surface lands. It is printed on every run. The number itself is read
  out of `server/incisor.py`'s AST rather than repeated, and a read that stops
  finding it raises instead of defaulting.
  Guards, both confirmed to fail with the fix removed: `tests/test_shoot_tool.py`
  (10 checks) asserts the marker becomes `X-Forwarded-For`, never reaches the
  service itself, and that a run's addresses are distinct and cannot overlap a
  neighbouring run's; `server/tests/test_incisor.py` asserts the derived
  ceiling against the real one, in the only place both exist at once.
  Original scope below.

  ~~The run exits non-zero with a list of
  console errors that look exactly like a broken dashboard; they are 429s from
  our own service, and every one of them is the tool exceeding the per-IP
  ceiling it is testing against.~~

  The arithmetic: `shoot.py` loads the page four times, and each load now costs
  nine requests — `/symbols`, `/sectors`, four tile `/history`, plus `/quote`,
  `/history` and `/fundamentals` for a looked-up symbol. That is **36 a run**
  against `RATE_LIMIT_MAX=60` a minute. One run is comfortable. Two are 72, and
  any session that ships a surface shoots at least two states — this one shot
  four and hit the wall three times.

  **Pre-existing, and T11 made it worse rather than causing it:** the same
  arithmetic was 32 a run before this session, so two runs was already 64. The
  08-31 note in `DECISIONS.md` is right that *one* run stays clear of the
  ceiling and was only ever measuring one.

  Not fixed today because the fix is a judgement about the tool rather than a
  line: the candidates are for `shoot.py` to raise the limit for its own
  child service (which stops the tool exercising the gate at all), to pace its
  loads (which makes every run slower for a problem only sessions have), or to
  reset the buckets between runs through a diagnostic the service does not yet
  have. Choosing among those is a session's work, not a footnote in one.
  *Accept:* four `shoot.py` runs back to back produce no 429, and whichever
  route is taken, the per-IP gate is still exercised somewhere — a fix that
  makes the tool stop testing the limit has moved the problem rather than
  solved it.

- [ ] **D3 · A tile shows a symbol and cannot open it** `[enhancement]`
  *(found 2026-08-29, in the T6 audit; widened 2026-08-30)* — **now two
  surfaces:** T9's watchlist rows have exactly the same problem, and it is
  sharper there, because a watchlist is a list of symbols whose entire purpose
  is to be looked at. Still labelled `[enhancement]`, so the routine leaves it
  for Key's triage. Original scope below.

  The strongest finding of that audit
  and the one it deliberately did not act on. A reader looking at the SPY tile
  who wants SPY's chart has to retype `SPY` into a search box 400px below it on
  desktop and 900px below it on a phone, while the thing they are pointing at
  is already on screen. Every other part of the page is one action away from
  what it names; this is four keystrokes and a scroll.
  Not folded into the audit because it is not a touch-up: it needs a real
  export from `js/view-symbol.js` (the chart already sets the precedent with
  `window.IncisorPriceChart`), focus moved to the panel rather than the page
  jumping, a decision about whether the search input should show the symbol
  that was opened, and a **generic `data-track`** — a `<button>` whose label is
  a ticker would send that ticker to the beacon, which guide §5 forbids. Doing
  that quickly inside an audit is how it gets done badly.
  *Accept:* a tile opens its symbol by mouse and by keyboard; focus lands
  somewhere a screen reader explains; the beacon sees no ticker; the strip
  still renders with `view-symbol.js` absent.

- [x] **D5 · `/symbols` was never reverse-proxied** `[defect]`
  *(found and fixed 2026-08-31, mid-T10)* — the search box has called
  `/api/incisor/symbols` since T7 and `server/apache-snippet.conf` names one
  route per line, so on the day it was deployed the combobox would have been
  permanently empty against Apache's own 404. Invisible locally because every
  check this project runs forwards the whole `/api/incisor/` prefix: the static
  server in `tools/shoot.py` does, and the service tests call the routes
  directly. Fixed with a rule rather than a line — `test_page.py` derives the
  routes the browser calls from the shipped client source and asserts each is
  proxied, `/health` asserted the other way round. Confirmed to fail with the
  line removed again. Third of the deploy-only defects after D4; promoted to
  *Recurring traps* in `DECISIONS.md`.

- [x] **D4 · `DB_PATH` in `config.env` is silently ignored** `[defect]`
  *(found 2026-08-29, done 2026-08-30)* — and worse than filed. With `DB_PATH`
  set only in `config.env` the service does not quietly use the wrong path: it
  tries to create `/var/lib/incisor-trading` and **fails to boot** wherever
  that is not writable. On the deployment box, where `ReadWritePaths` makes it
  writable, it would have written to the old path instead — which is the
  failure that was filed. Fixed by moving the read to the edge: `store.py`
  keeps `DEFAULT_DB_PATH` and a `configure()`, `incisor.py` reads the key below
  `load_env_file()` like every other one. Verified end to end — the service was
  booted with its path coming only from a config file, `shoot.py` drove the
  full page against it, and the database at that path came back holding 1040
  daily bars. `tests/test_config.py` (5 checks) covers the key and the class of
  bug: an AST rule that only the edge reads the environment at module level,
  and only below the line that loads the file. Both guards were confirmed to
  fail with the defect put back.

- [x] **D2 · `index.html` hit the 600-line rule with two lines to spare**
  *(done 2026-08-29)* — and it would have blocked T9 through T12, each of which
  adds a surface. Resolved by asking what the rule was protecting rather than
  by shrinking the file: §6 says "split it along a real seam", every other file
  here has one, and a served document has none — no build step (hard rule 10)
  and no second route (non-goals). A line cap on markup is therefore not a
  readability rule but a cap on how many surfaces the route may carry.
  `test_page.py` now measures the three things separately: 600 lines per
  stylesheet and script, which can split; 900 for the document, as a ceiling
  that fails loudly if the page starts carrying a second route's worth of
  markup; and **150 lines per surface**, which is what §6 is actually for. The
  surface list is derived from the `data-x` / `data-x-*` pairing every view
  documents, not written out, so it covers the next surface added. See
  `DECISIONS.md`.

- [x] **D1 · Browser verification pass for the page skeleton** *(done 2026-08-27,
  attended)* — verified with `tools/shoot.py`: no console errors and no
  horizontal overflow at 1440, 768 or 390 (true mobile emulation). The apparent
  mobile overflow in an earlier `chrome --headless --screenshot` was an artifact
  of that tool, not a defect — see `DECISIONS.md`. The `t1-skeleton/` shots were
  pruned at T6; `shoot.py` re-proves the same two properties on every run, and
  the current page is shot in `docs/shots/t7-quote/`. Original scope below.

  ~~**D1 · Browser verification pass for the page skeleton**~~ — the half of
  T1's acceptance criteria that a headless session cannot reach: load the page,
  confirm a clean console, check it at 375px and at desktop width, confirm it
  reads as a FEN page, and put screenshots in `docs/shots/`. Needs an attended
  session, or Key with the `fen` config running. Everything else about T1 is
  done and tested. See `DECISIONS.md` — *unattended sessions have no browser*.
  *Accept:* screenshots at both widths committed; console noted as clean; any
  layout defect either fixed or raised as its own task.
