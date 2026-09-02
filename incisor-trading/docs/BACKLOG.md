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

**Complete — T5 through T11, T10a included**; every surface among them has an
audit-log row below. Open here: T10b, blocked, then T12.

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

- [ ] **D11 · The audit log grows without bound in a file read in full**
  `[defect]` *(found 2026-09-02, closing D10)* — **13,219 bytes over seven
  rows**, which D10 was forbidden to touch and which is now 41% of this file.
  O6 never completes and §18 makes a surface due again after any revamp, so
  this is D9's disease in its third file. The prose is not the problem — an
  audit is the best writing the routine does — the problem is reading all of it
  every session when what a session needs is the date, the surface, the verdict.
  *Accept:* same shape as D10 — a one-line verdict row each here, the four
  answers moved to `docs/AUDITS.md` under a dated heading; `BACKLOG.md` under
  22,000 bytes; no prose discarded, checked by counting; every *looked at and
  left* finding restated in the code or filed as its own entry;
  `tests/test_docs_budget.py` grown to budget this file with the same both-way
  bijection D9 installed.

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
