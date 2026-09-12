# Incisor Trading — Backlog

Ordered. Work the topmost unchecked, unblocked task. One per session.
Check the box, then append to `PROGRESS.md`.

Do not reorder tasks above the one you are working on. New tasks may be appended
to the end of a phase, or added to `## Discovered` at the bottom.

**A finished task collapses to a one-line record in `## Done` at the bottom** —
nobody follows a reference to closed work. Anything in a completion note a
future session could act on is not a note: it is a `D` item, a task, or a `DEC`
line (guide §19), filed as one before the note goes.

Legend: `[ ]` open · `[x]` done · `[!]` blocked (say why inline)

---

## Phase 0 — Foundations

**Complete — T0 through T4.**

---

## Phase 1 — Dashboard

**Complete — T5 through T13b, T10a included.** Every surface among them has an
audit-log row below. Open here: T10b alone, and it is blocked on a permission
that is Key's to obtain, not the routine's to work around.

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
  **`[!]` Blocked 2026-09-01 — the first surface here that cannot be developed
  on fixtures at all.** Both questions were settled and they point the same way,
  and both answers are written down where a session that must act on them
  goes: the terms in `DATA-PROVIDER.md` under *Per-endpoint terms* (there are
  none — this inherits the API-wide ambiguity), and the fixture in `DEC-054`
  (a fixture can synthesise a series, never a selection; all three shapes were
  tried). Nothing further to research.
  *Unblock when:* Key's written display permission exists, at which point this
  is built and verified in live mode directly, one call a day, and its symbols
  are openable because live mode already tries a free-typed ticker.

---

## Phase 2 — Paper trading (live sim)

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

**The row is the record; the four answers are in `docs/AUDITS.md`**, under a
heading naming the same date and task. This file is read in full every session
and `O6` never completes, so the prose cannot live here — seven audits were 41%
of it. Open the detail only to act on a verdict. A test asserts the bijection
both ways, and caps a row at 200 characters.

**Shipped and not yet audited**, oldest first — this is the queue:

**Nothing is due yet.** Queued, oldest first: **Portfolio summary** (T14) and
**Order ticket and open orders** (T15), both shipped 09-11 and due at the
third session after that one; then **Holdings, trade log and equity curve**
(T16), shipped 09-12.

| Date | Feature | Verdict | The finding, in one line |
|---|---|---|---|
| 08-29 | **Market clock** (T5) | Minor edits | It answered the less useful half of its own question: "Opens Monday 9:30am ET" beats a countdown. |
| 08-29 | **Index summary strip** (T6) | Minor edits | A tile stated two windows and named only the second; every change carries `1d` now. D3 filed, not fixed. |
| 08-30 | **Symbol lookup and quote detail** (T7) | Minor edits | Three defects, all of them things the card left the reader to work out. Two upstream calls a symbol. |
| 08-30 | **Price chart** (T8) | Minor edits | A tap fires no `pointermove`, so the one gesture a phone has read nothing. Five range changes: zero calls. |
| 08-31 | **Watchlist** (T9) | Minor edits | It kept three numbers out of 260 bars, and the trend column was free. Remove target 28x22, under WCAG 2.2. |
| 09-01 | **Sector grid** (T10) | Minor edits | Below 560px the bar was `display: none` — the one width where a ranked list was a column of figures. |
| 09-02 | **Fundamentals panel** (T11) | Minor edits | Fifteen of seventeen symbols are funds, and the fund state answered with one number under a fuller promise. |
| 09-07 | **Reporting calendar** (T12) | Minor edits | At 375px a 0.26 dividend read "0.2": the table was 18px over its box, and a body that never overflows hid it. |

## Discovered

Tasks found mid-work that don't fit above. **Label each one `[defect]` or
`[enhancement]`** — see guide §19. A defect is taken before anything else at
step 4 of the session protocol; an enhancement waits for Key to triage it into a
phase. When the call is unclear, file it as a defect.

- [ ] **D16 · The Trade tab's surfaces redraw only when a settlement lands**
  `[enhancement]` *(2026-09-12)* — `js/view-portfolio.js` notifies its
  listeners once, when every symbol in play has answered and open orders have
  settled. Mid-flight it calls its own `render()` and tells nobody, so the
  holdings table and the equity curve sit at their empty state while the
  summary above them is already filling in. Nothing is wrong on screen and
  nothing is stale once the page settles — this is a few hundred milliseconds
  where one surface has figures and the two below it do not, which reads as
  the lower two being broken rather than as the upper one being early.
  The fix is small and the risk is not: `notify(null)` on every answer would
  redraw the curve once per symbol, and the curve is the one surface that
  fetches. So it wants a change that separates "prices moved" from "orders
  settled" rather than a second call to the same signal.
  *Accept:* a surface that can draw from what has arrived does; the curve is
  not recomputed once per answering symbol.

- [ ] **D15 · `shoot.py` should compress the set it knows will be committed**
  `[enhancement]` *(2026-09-08)* — a look branch's shots are the only ones that
  enter history (DEC-012), and history is the one place a PNG cannot be deleted
  from. T13b's six came out of the tool at 2.8MB and went in at 900KB, with no
  visible difference on a page whose palette is six colours: mobile is captured
  at `device_scale_factor` 2 and was halved back to CSS pixels, then all three
  were quantised to 256 colours. That was a script in a scratchpad, run from
  memory, on a step nothing enforces — so the next look branch commits 2.8MB
  unless whoever builds it happens to remember. It belongs in `shoot.py`, which
  already knows the `--out` path and can see the `look-` prefix that decides it.
  *Accept:* a run writing to `docs/shots/look-*/` compresses what it writes and
  says so in its summary line; every other run is untouched, since those sets
  are gitignored and reproducible in seconds.

- [ ] **D13 · Decide whether this page takes the site's new face**
  `[enhancement]` *(2026-09-03)* — Key moved the site to Bricolage Grotesque in
  a change that was not meant to reach `/incisor-trading/`. The page still
  renders DM Sans and Playfair Display exactly as before, because `body.incisor`
  restates the face rather than inheriting it — verified by computed style, not
  by reading the CSS. So nothing is broken and nothing needs undoing.
  What is open is whether it *should* take Bricolage eventually. Guide §13 says
  the page belongs to the site, which argues yes; every figure and line of prose
  here was set against DM Sans, which argues for measuring before switching.
  **Key's call, not the routine's** — it is a look decision, so it goes through
  `DESIGN-BRANCHES.md` as an `incisor-look/*` direction if it is tried at all.
  Until then `incisor.css` keeps DM Sans and its comments say why.

- [ ] **D15 · The site-wide beacon 404s on every page** `[defect]`
  *(found 2026-09-12 during the T26b rehearsal)* — **not an Incisor defect and
  not Incisor's to fix**, recorded here because this is where it was seen.
  `assets/js/beacon.js` loads on every FEN page and POSTs to `/api/event`, which
  returns **404** on the live server: the Status Station service it reports to
  was built but never deployed. Harmless by construction — the beacon swallows
  its own failures and never surfaces them to a reader — but it means the site
  has been recording no analytics at all, and every page logs a console error.
  Out of the routine's bounds twice over: the fix is a service install plus a
  vhost change, both on the server (hard rule 5), and `assets/` is outside
  `incisor-trading/` (hard rule 1). **Key's, whenever he wants it.**

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

## Done

Closed work, oldest first — history, not a queue. `→` names the `DECISIONS.md`
IDs the work settled; those, the audit-log row above, and the code are where a
session that must *act* on any of this goes.

| ID | Done | What shipped, and what it concluded |
|---|---|---|
| T0 | 08-27 | **Data provider due diligence.** `docs/DATA-PROVIDER.md`. → DEC-001, DEC-052 |
| T1 | 08-27 | **Page skeleton, hidden.** The half of its criteria needing a browser became D1. |
| T2 | 08-27 | **Flask service skeleton.** Port 8789, origin checks, both rate gates; deploy files written, never installed. |
| T3 | 08-27 | **Fixture layer.** `provider.py` parses, `source.py` is the only I/O seam. → DEC-004, DEC-005, DEC-058 |
| T4 | 08-27 | **Snapshot cache and price store.** Four concurrent requests for one symbol make exactly one upstream call. → DEC-003, DEC-006 |
| T5 | 08-27 | **Market clock.** Audited 08-29, minor edits. → DEC-019, `js/market-clock.js` |
| T6 | 08-28 | **Index summary strip.** Four ETF-proxy tiles. Audited 08-29, minor edits. → DEC-020 |
| T7 | 08-28 | **Symbol search and quote detail.** Audited 08-30, minor edits. → DEC-015, DEC-023, `js/view-symbol.js` |
| T8 | 08-29 | **Price chart.** Hand-rolled SVG. Audited 08-30, minor edits. → DEC-024, `js/chart-geometry.js` |
| T9 | 08-30 | **Watchlist.** Audited 08-31, minor edits. → DEC-028, DEC-032, DEC-033 |
| T10 | 08-31 | **Sector performance grid.** `GET /sectors`. Audited 09-01, minor edits. → DEC-030, `server/sectors.py` |
| T10a | 09-01 | **A seam for the served document.** No seam exists. → DEC-026, DEC-038, DEC-039 |
| T11 | 09-01 | **Fundamentals panel.** SEC EDGAR as a second upstream. Audited 09-02, minor edits. → DEC-002, DEC-041, DEC-043 |
| D1 | 08-27 | **Browser pass for the skeleton** *(defect, fixed)* — and it built `tools/shoot.py` to do it. → DEC-055 |
| D2 | 08-29 | **`index.html` hit the 600-line rule** *(defect, fixed)* → DEC-026 |
| D4 | 08-30 | **`DB_PATH` in `config.env` was ignored** *(defect, fixed)* — worse than filed: the service failed to boot. → DEC-027, DEC-064 |
| D5 | 08-31 | **`/symbols` was never reverse-proxied** *(defect, fixed)* — with a derived rule rather than a line. → DEC-064 |
| D6 | 08-31 | **The page went 2px wide at 320px** *(defect, fixed)* — and the watchlist table was never the culprit. → DEC-036, `tools/shoot.py` |
| D7 | 09-02 | **Two `shoot.py` runs tripped the rate limit** *(defect, fixed)* — the tool identified no callers. → DEC-047 |
| D8 | 09-02 | **The per-IP gate could be sidestepped** *(defect, fixed)* — it reads the last non-empty hop now. → DEC-048 |
| D9 | 09-02 | **The memory split into an index and a detail file** *(defect, fixed)* — 66 entries in, 66 out. **Guide §16 and §14 step 2 still describe the pre-split model; that rewrite is Key's, drafted as `N7` in `PROGRESS.md`.** → DEC-067 |
| D10 | 09-02 | **This file carried its own history** *(defect, fixed)* — twenty-two closed entries became these rows. → DEC-068 |
| T12 | 09-03 | **Reporting calendar.** A filing calendar, not an earnings calendar: no scheduled date, consensus or surprise exists. → `server/reporting.py`, `server/fixtures/make_fixtures.py` |
| D11 | 09-03 | **The audit log grew without bound in a file read in full** *(defect, fixed)* — 13,219 bytes over seven rows became seven; the prose is in `docs/AUDITS.md`. → DEC-069 |
| D12 | 09-04 | **Two length rules were one surface from failing** *(defect, fixed)* — the script split at a real seam; the document had no fat to cut, and its ceiling was charging for the prose it teaches with. Elements now, 433 of 650. → DEC-038, DEC-026 |
| D14 | 09-07 | **`server/` was served, because only the vhost denied it** *(defect, fixed)* — the rehearsal's first fault, in two commands: the source was readable from the branch landing until the vhost snippet was pasted in by hand. → DEC-076 |
| T13 | 09-08 | **Dashboard polish, accessibility and security pass.** CSP in meta and vhost; a dead tab stop and an invisible focus ring fixed; three panels stopped denying a failed lookup. → DEC-076, DEC-077, DEC-078 |
| T13b | 09-08 | **Visual directions, round one.** Two opposed look branches — `broadsheet` (a document) and `workbench` (an instrument) — registered with shots. → DEC-079, DEC-080, DEC-081 |
| T14 | 09-11 | **Portfolio model.** A replayed ledger in `localStorage`, an account summary on the Trade tab, and a notice for a blob that was unreadable or written by a newer page. → DEC-082, DEC-083 |
| T15 | 09-11 | **Order ticket and open orders.** Fills at the first bar open or close after placing; buys hold back cash; open orders were the first migration, v1 to v2. → DEC-085, DEC-086 |
| T16 | 09-12 | **Positions, history, performance.** A holdings table, the trade log, and an equity curve against buy-and-hold SPY. → DEC-088, DEC-089, DEC-090 |
| T26b | 09-12 | **Deploy rehearsal: the code ran where it will run, and it found a hole in two commands.** Service installed, enabled, running in fixture mode; all five routes answer through Apache; `/health` correctly unreachable from outside. → D14, D15 |
