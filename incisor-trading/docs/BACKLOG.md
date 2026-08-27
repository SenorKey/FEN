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

- [ ] **T3 · Fixture layer**
  `INCISOR_DATA_SOURCE=fixture|live`, defaulting to fixture. `server/fixtures/`
  with hand-written representative JSON matching the chosen provider's documented
  response shapes. A parser module that turns provider JSON into our internal
  shape, exercised against the fixtures.
  *Accept:* the service serves quotes end-to-end from fixtures with no network
  access at all. Verified by running with networking unavailable.

- [ ] **T4 · Snapshot cache + price store**
  SQLite schema for quotes, daily bars, and fundamentals. A single fetcher module
  that is the only code allowed to call upstream, with per-endpoint TTLs and a
  call counter written to the DB.
  *Accept:* two rapid requests for the same symbol produce exactly one upstream
  call (assert against a stub). Quota counter is queryable.

---

## Phase 1 — Dashboard

- [ ] **T5 · Market clock** — open / pre / post / closed, with weekends and the US
  market holiday calendar. Pure client-side, no data needed. Countdown to next
  open or close. *Accept:* correct for a hardcoded set of test datetimes including
  a half-day and a holiday.

- [ ] **T6 · Index summary strip** — SPY / QQQ / DIA / IWM tiles with price, change,
  percent change, sparkline. Labeled as ETF proxies, not index levels.
  *Accept:* renders from fixtures; delay label visible; degrades to "unavailable"
  with the service stopped.

- [ ] **T7 · Symbol search + quote detail** — search by ticker or company name;
  detail panel with last price, change, day range, 52-week range, volume vs.
  average, market cap, P/E. *Accept:* keyboard-navigable results; unknown symbol
  shows a clean not-found state.

- [ ] **T8 · Price chart** — hand-rolled SVG. Ranges 1D / 5D / 1M / 6M / 1Y / 5Y.
  Hover readout, accessible fallback table. No chart library.
  *Accept:* renders each range from fixtures; readable in light and dark; usable
  by keyboard; no layout shift on range change.

- [ ] **T9 · Watchlist** — add/remove symbols, persisted to `localStorage`, sortable.
  *Accept:* survives reload; handles a cleared/blocked `localStorage` without
  throwing; caps at a sane number of symbols to bound upstream calls.

- [ ] **T10 · Movers and sectors** — top gainers, losers, most active; sector
  performance grid. *Accept:* renders from fixtures; gains/losses are distinguishable
  in grayscale.

- [ ] **T11 · Fundamentals panel** — the standard set: market cap, P/E, EPS,
  dividend yield, beta, shares outstanding, revenue, margins. Each with a one-line
  plain-English explanation on demand. *Accept:* every figure has a definition; missing
  data renders as "—", never as 0 or NaN.

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

## Discovered

Tasks found mid-work that don't fit above. Append here; Key triages them into
phases.

- [ ] **D1 · Browser verification pass for the page skeleton** — the half of
  T1's acceptance criteria that a headless session cannot reach: load the page,
  confirm a clean console, check it at 375px and at desktop width, confirm it
  reads as a FEN page, and put screenshots in `docs/shots/`. Needs an attended
  session, or Key with the `fen` config running. Everything else about T1 is
  done and tested. See `DECISIONS.md` — *unattended sessions have no browser*.
  *Accept:* screenshots at both widths committed; console noted as clean; any
  layout defect either fixed or raised as its own task.
