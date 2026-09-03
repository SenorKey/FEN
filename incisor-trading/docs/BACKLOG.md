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

**Complete — T5 through T12, T10a included.** Every surface among them except
T12 has an audit-log row below. Open here: T10b, blocked, then T13.

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

- [!] **T26b · Deploy rehearsal on the Fedora box** — **blocked until Key is
  home and can reach the server (noted 2026-09-02; he is away and has no remote
  access).** Not a promotion step and not the routine's to run: it is a trial
  install of what already exists, done early because the cost of waiting
  compounds. Nothing here has ever run where it will run. Nine surfaces, a Flask
  service, an Apache snippet and a systemd unit have only ever been exercised on
  a Mac against a Python stand-in, and **D5, D7 and D8 were all "correct
  everywhere except where it actually runs"** — a route Apache never proxied, a
  proxy stand-in that set no `X-Forwarded-For`, and a limiter reading the hop the
  caller writes. A rehearsal now debugs three such faults; one in two months
  debugs fifteen at once, all interacting.
  Known unknowns to expect, none of them verifiable from here: SELinux almost
  certainly blocks `mod_proxy` reaching `127.0.0.1:8789` until
  `httpd_can_network_connect` is on; the venv path in the unit; ownership and
  mode on `/var/lib/incisor-trading`; gunicorn not being installed; the firewall.
  *Accept:* the service starts under systemd and survives a reboot; `/health`
  answers on the box; every route in `apache-snippet.conf` answers through
  Apache; the page renders at `/incisor-trading/` on the real host with
  `noindex` intact and no nav or sitemap entry; **every fault found is filed**,
  since that list is the actual product of this task.

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

**Nothing is due yet.** The reporting calendar (T12) shipped 09-03 and has no
row below; it falls due on 09-06, three sessions on. Every older surface has
one.

| Date | Feature | Verdict | The finding, in one line |
|---|---|---|---|
| 08-29 | **Market clock** (T5) | Minor edits | It answered the less useful half of its own question: "Opens Monday 9:30am ET" beats a countdown. |
| 08-29 | **Index summary strip** (T6) | Minor edits | A tile stated two windows and named only the second; every change carries `1d` now. D3 filed, not fixed. |
| 08-30 | **Symbol lookup and quote detail** (T7) | Minor edits | Three defects, all of them things the card left the reader to work out. Two upstream calls a symbol. |
| 08-30 | **Price chart** (T8) | Minor edits | A tap fires no `pointermove`, so the one gesture a phone has read nothing. Five range changes: zero calls. |
| 08-31 | **Watchlist** (T9) | Minor edits | It kept three numbers out of 260 bars, and the trend column was free. Remove target 28x22, under WCAG 2.2. |
| 09-01 | **Sector grid** (T10) | Minor edits | Below 560px the bar was `display: none` — the one width where a ranked list was a column of figures. |
| 09-02 | **Fundamentals panel** (T11) | Minor edits | Fifteen of seventeen symbols are funds, and the fund state answered with one number under a fuller promise. |

## Discovered

Tasks found mid-work that don't fit above. **Label each one `[defect]` or
`[enhancement]`** — see guide §19. A defect is taken before anything else at
step 4 of the session protocol; an enhancement waits for Key to triage it into a
phase. When the call is unclear, file it as a defect.

- [ ] **D12 · Two length rules are one surface from failing** `[defect]`
  *(found 2026-09-03, adding T12; attempt 1 on 09-03)* — `index.html` at 837
  markup lines of 900 and `js/view-symbol.js` at 593 of 600. Neither broken,
  which is why this was filed rather than fixed: the next session to add a
  surface fails a test it did not cause, mid-task, with no seam ready.
  *Accept:* both files under 80% of their ceilings, the space found by
  deleting or splitting rather than by moving a number; suites green and
  `shoot.py` clean at three widths.

  **The script half is done.** `view-symbol.js` split at drawing versus
  deciding (`DEC-013`) into itself at 468 and `js/quote-card.js` at 179 — 78%,
  and the seam was where that entry said it would be.

  **The document half is open, and this entry's premise was wrong.** The
  deletion is not in the four dashboard panels. Each was measured and none is
  fat: the biggest, `[data-fundamental]` at 181 markup lines, is twelve
  labelled figures and their explanations, and the repeated blocks are
  load-bearing served markup — eight `test_index_strip` assertions rest on the
  tiles' em dashes alone. Found instead: a portfolio the Trade panel invented,
  deleted with its dead CSS (`DEC-072`), taking the file to **817 of 900**.

  **What the measurement says, so attempt 2 decides instead of re-deriving.**
  Of 817 markup lines **138 are page copy** — the figure notes, the panel
  notes, the proxy and filing caveats, the chart hint, the disclaimer — so
  **structure alone is 679, already under the 719 target.** Reaching 80% by
  deletion means deleting what the page teaches, on a page whose mission is
  teaching: `DEC-038`'s argument one step over, since that entry made comments
  free here precisely because a ceiling making deletion the cheapest way past
  it measures the wrong thing. Attempt 2 picks one and records it: **delete
  ~98 lines of served copy**, or **extend `DEC-038` so the ceiling counts
  structure and not the copy inside it**, with the per-surface 150-line rule
  left counting everything so nothing escapes. No third attempt — hard rule 12.

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
| T5 | 08-27 | **Market clock.** Audited 08-29, minor edits. → DEC-007, DEC-019 |
| T6 | 08-28 | **Index summary strip.** Four ETF-proxy tiles. Audited 08-29, minor edits. → DEC-020 |
| T7 | 08-28 | **Symbol search and quote detail.** Audited 08-30, minor edits. → DEC-015, DEC-016, DEC-023 |
| T8 | 08-29 | **Price chart.** Hand-rolled SVG. Audited 08-30, minor edits. → DEC-018, DEC-024 |
| T9 | 08-30 | **Watchlist.** Audited 08-31, minor edits. → DEC-028, DEC-032, DEC-033 |
| T10 | 08-31 | **Sector performance grid.** `GET /sectors`. Audited 09-01, minor edits. → DEC-029, DEC-030, DEC-031 |
| T10a | 09-01 | **A seam for the served document.** No seam exists. → DEC-026, DEC-038, DEC-039 |
| T11 | 09-01 | **Fundamentals panel.** SEC EDGAR as a second upstream. Audited 09-02, minor edits. → DEC-002, DEC-041, DEC-042, DEC-043 |
| D1 | 08-27 | **Browser pass for the skeleton** *(defect, fixed)* — and it built `tools/shoot.py` to do it. → DEC-055 |
| D2 | 08-29 | **`index.html` hit the 600-line rule** *(defect, fixed)* → DEC-026 |
| D4 | 08-30 | **`DB_PATH` in `config.env` was ignored** *(defect, fixed)* — worse than filed: the service failed to boot. → DEC-027, DEC-064 |
| D5 | 08-31 | **`/symbols` was never reverse-proxied** *(defect, fixed)* — with a derived rule rather than a line. → DEC-064 |
| D6 | 08-31 | **The page went 2px wide at 320px** *(defect, fixed)* — and the watchlist table was never the culprit. → DEC-036, DEC-037 |
| D7 | 09-02 | **Two `shoot.py` runs tripped the rate limit** *(defect, fixed)* — the tool identified no callers. → DEC-047 |
| D8 | 09-02 | **The per-IP gate could be sidestepped** *(defect, fixed)* — it reads the last non-empty hop now. → DEC-048 |
| D9 | 09-02 | **The memory split into an index and a detail file** *(defect, fixed)* — 66 entries in, 66 out. **Guide §16 and §14 step 2 still describe the pre-split model; that rewrite is Key's, drafted as `N7` in `PROGRESS.md`.** → DEC-067 |
| D10 | 09-02 | **This file carried its own history** *(defect, fixed)* — twenty-two closed entries became these rows. → DEC-068 |
| T12 | 09-03 | **Reporting calendar.** A filing calendar, not an earnings calendar: no scheduled date, consensus or surprise exists. → DEC-070, DEC-071 |
| D11 | 09-03 | **The audit log grew without bound in a file read in full** *(defect, fixed)* — 13,219 bytes over seven rows became seven; the prose is in `docs/AUDITS.md`. → DEC-069 |
