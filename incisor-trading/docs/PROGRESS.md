# Incisor Trading — Progress log

Append-only. Newest entries at the bottom. One entry per session, always —
including sessions where nothing shipped.

Entry format:

```
## YYYY-MM-DD — T<id> <task name>
**Outcome:** shipped / partial / blocked
**Changed:** files touched
**Verified:** how, and what was observed
**Notes:** anything the next session needs to know
```

---

## For Key

A notes shelf, not a queue. Things the routine reached that are out of its bounds
(guide §3), each with a recommendation and a note on what it did instead. **The
routine is never blocked on these** — it records one and moves on, and never
re-raises the same item.

- **N1 — Data provider choice.** Comes out of T0. The routine researches and
  recommends; picking one means creating an account and accepting terms, which is
  Key's. Meanwhile everything is built against fixtures, so nothing waits.
- **N1a — Alpha Vantage display permission (from T0, 2026-08-27).** No free tier
  from any commercial provider clearly permits public display of market data on a
  website; display is a separate paid licence layer everywhere. Alpha Vantage is
  the only one whose bar is scoped to *commercial* activity rather than stated
  flatly, so it is the recommendation — **conditional on a written yes**. One free
  email to `premium@alphavantage.co` (free, ad-free, non-commercial educational
  page; delayed data labeled; attribution as they require) settles it. Full
  reasoning and the quoted clauses are in `docs/DATA-PROVIDER.md`. *Meanwhile:*
  the routine stays in fixture mode and builds on, exactly as guide §10 directs.
- **N1b — SEC EDGAR needs nothing from Key (from T0).** `data.sec.gov` is public
  domain, requires no API key, no account, and no acceptance of terms, so it is
  inside the routine's bounds and it will be used for fundamentals (T11) without
  further input. It has no prices, so it does not replace N1a — it just means
  fundamentals never spend Alpha Vantage's 25-calls-a-day quota. Recorded here as
  a note, not a question.
- **N3 — ~~A scheduled session has no browser~~ RESOLVED 2026-08-27.** Closed by
  `tools/shoot.py`, which drives the installed Chrome through Playwright at
  desktop, tablet and true mobile-emulated widths and fails on console errors or
  horizontal overflow. Scheduled sessions verify visually on their own now; no
  attended session is required for it. Kept as a line rather than deleted so the
  history reads straight, but **it needs nothing from Key.**
- **N4 — The `incisor-api` launch config is Key's to add (from T2, 2026-08-27).**
  Guide §15 asks for one once the service exists. It now does, but
  `.claude/launch.json` sits outside `incisor-trading/`, and hard rule 1 makes
  every file outside this folder off-limits — so this is not a thing the routine
  asks permission for, it is simply not its file. The entry Key would add:

  ```json
  { "name": "incisor-api",
    "runtimeExecutable": "incisor-trading/server/.venv/bin/python",
    "runtimeArgs": ["incisor-trading/server/incisor.py"],
    "port": 8789, "autoPort": false }
  ```

  *Meanwhile:* the service is fully exercised by its own test suite, including
  over a real socket, so nothing is blocked on this.
- **N2 — Disclaimer wording.** The routine ships the wording in guide §11
  verbatim ("Educational only. Not investment advice. Delayed data. No real money
  is involved."). If Key wants different legal phrasing, that's his to set.

## Resolved

- **2026-08-27 — Data budget:** free tiers only, delayed data, clearly labeled.
- **2026-08-27 — Accounts:** none. `localStorage` only, no PII, no login. Accounts
  are a possible future phase, deliberately out of this backlog.
- **2026-08-27 — Build order:** dashboard first, then live paper trading, then
  historical replay, then hints.
- **2026-08-27 — Visibility:** the page ships hidden (`noindex`, no nav, no
  sitemap) and is promoted manually by Key.
- **2026-08-27 — Cost:** free on every end, permanently. Free-tier data, existing
  hardware, local Ollama, self-hosted assets. No cost to the user, no ads, no
  paywall, no account. Guide §4.
- **2026-08-27 — Autonomy:** the routine decides on its own by default. Approval
  is only needed for work that touches another page, changes `main`, reaches the
  server, costs money, requires a signup, or carries an unresolved security
  tradeoff. Guide §3.
- **2026-08-27 — Branching:** new branches may be created freely. Visual
  directions live on `incisor-look/*` and must be registered in
  `DESIGN-BRANCHES.md`; experiments live on `incisor-try/*`. Guide §7–8.
- **2026-08-27 — Commit style:** every routine commit starts with `C:`. Guide §7.
- **2026-08-27 — Name:** **Incisor Trading**, at `/incisor-trading/`. A play on
  "insider trading" and on the tooth that bites in first — eating, consuming,
  growing, sharpening. Branches renamed to `incisor-dev`, `incisor-look/*`,
  `incisor-try/*`. Guide §1.
- **2026-08-27 — Memory model:** `DECISIONS.md` is the routine's long-term
  memory, read in full every session; `PROGRESS.md` is a journal read from the
  tail only. Git history is evidence of what was kept, not a record of what was
  rejected, so lessons that must survive go in `DECISIONS.md`. Two hard rules
  added: never touch a dirty tree outside `incisor-trading/`, and a task that has
  failed twice gets marked blocked rather than attempted a third time. Guide §16.
- **2026-08-27 — Look branches:** stay local. Not pushed to GitHub.
- **2026-08-27 — Autonomy, restated:** the out-of-bounds list is not a set of
  things to seek approval for; they are simply not the routine's to decide or do.
  Inside the bounds it never asks. `PROGRESS.md → For Key` is a notes shelf, never
  a queue the routine waits on. Guide §3.

---

## Sessions

## 2026-08-27 — Planning
**Outcome:** shipped
**Changed:** `incisor-trading/docs/` — `AGENT-GUIDE.md` (v2), `BACKLOG.md`,
`PROGRESS.md`, `DESIGN-BRANCHES.md`, `.htaccess`, `shots/`
**Verified:** files written; the docs directory carries a deny-all `.htaccess` so
planning notes are never served publicly. `git status` shows changes only under
`incisor-trading/`.
**Notes:** No code yet. Guide v2 adds the cost rules (§4), security (§5), code
quality (§6), git and branch conventions (§7), the design review shelf (§8), and
the relaxed autonomy model (§3). Next session starts at T0 — data provider due
diligence, research only, no signups, no code; the provider choice is out of
bounds (needs Key's account and his acceptance of terms), so it lands under
`For Key` as a recommendation and the build continues on fixtures regardless.

## 2026-08-27 — Planning (cont.)
**Outcome:** shipped
**Changed:** `docs/DECISIONS.md` (new), `AGENT-GUIDE.md` (§16 plus hard rules 11
and 12, session protocol rewritten), `BACKLOG.md` (S6)
**Verified:** section numbering contiguous 1–16; the four docs each have one job
and the protocol names which to read in full versus from the tail.
**Notes:** The anti-loop mechanism is `DECISIONS.md`. Add to it in the same
session as the work, never "next time" — an undocumented dead end is
indistinguishable from an untried idea.

## 2026-08-27 — T0 Data provider due diligence
**Outcome:** shipped
**Changed:** `incisor-trading/docs/DATA-PROVIDER.md` (new), `BACKLOG.md` (T0
checked), `DECISIONS.md` (three entries), `PROGRESS.md` (N1a, N1b)
**Verified:** against the T0 acceptance criteria — the file exists; **eight**
providers are compared against the required three; every "public display
permitted?" cell quotes the operative clause with its section number and links
the source; a recommendation is stated with reasoning and a fallback. No account
was created, no terms accepted, no API key requested, and no upstream call made.
No code, as the task specifies. `git status` shows changes only under
`incisor-trading/`.
**Notes:** The research produced one finding that outranks the provider choice
itself: **market data is licensed in two layers — access and display — and free
tiers only ever grant access.** Finnhub, Massive (Polygon.io, rebranded October
2025), Twelve Data, Tiingo and FMP each forbid public display in plain language;
marketstack fails on volume alone at 100 requests/month. Alpha Vantage is the
only near-miss, because its restriction is scoped to *commercial* activity, and
this page is permanently non-commercial by guide §4 — hence the conditional
recommendation in N1a rather than a pick.

Two consequences the next sessions should carry:

1. **SEC EDGAR is usable immediately** and needs nothing from Key — no key, no
   account, no terms. Fundamentals (T11) should come from it, which also keeps
   them off Alpha Vantage's quota.
2. **25 requests/day is the binding constraint**, not the licence. It means the
   dashboard is end-of-day-oriented and honestly labeled, not a live ticker, and
   it makes T4's caching and T9's watchlist cap load-bearing rather than nice to
   have. Design for that from T6 onward instead of discovering it at T9.

Fixtures will be hand-written to Alpha Vantage's documented response shapes in
T3. That is deliberately reversible: T3's parser module is the only code that
ever sees provider JSON, so a different provider changes one file.

## 2026-08-27 — T1 Page skeleton, hidden
**Outcome:** shipped, with the visual pass split out as D1
**Changed:** `incisor-trading/index.html`, `incisor.css`, `incisor.js` (all new),
`tests/` (new: `page_model.py`, `test_page.py`, `test_tab_behaviour.py`,
`tab_model.jxa.js`, `README.md`, deny-all `.htaccess`, `.gitignore`),
`BACKLOG.md` (T1 checked, D1 added), `DECISIONS.md` (six entries)
**Verified:** `python3 -m unittest discover` in `incisor-trading/tests` —
**34 checks, all passing.** They cover the ARIA tab wiring end to end, the
`noindex` rule, that the page never links to itself, that every control carries a
generic `data-track`, that no inline handler, inline style or remote origin
exists, that `innerHTML`/`eval`/`fetch` appear nowhere, that up/down is never
signalled by colour alone, and the §6 line-length and file-size limits. The
keyboard model is not inspected but **executed**: `tab_model.jxa.js` loads the
real `incisor.js` into JavaScriptCore against a DOM stub built from the real
`index.html` and drives click, arrows, Home/End, wrap-around and an ignored key.
`git status` shows changes only under `incisor-trading/`.

**Not verified, and not claimed:** anything needing eyes. See N3 — a scheduled
session cannot start the dev server. That half is now backlog task **D1**.

**Notes:** The page is one scrolling document rather than the shared
golden-ratio shell, which is built for the home page and locks the viewport at
`height:100vh; overflow:hidden`. `body.incisor` releases that at every width.

Identity is enamel-and-gold on near-black. The constraint that drove it: green
and red carry market direction everywhere on this page, so the brand colour had
to avoid both — gold does, and it reads as the "gold tooth" behind the name
without playing the joke too loudly. Figures are set in the system monospace
stack with `tabular-nums`, since guide §4 rules out font CDNs and adding a
webfont would mean writing into `/assets`, which is out of bounds.

Two things worth carrying forward:

1. **`beacon.js` falls back to an element's `textContent`** when there is no
   `data-track`, `aria-label` or `id`. On a trading page that means a button
   reading "Buy 10 AAPL" would leave the browser. Every control here ships an
   explicit generic label, and `test_page.py` now fails the build if a new one
   does not — the guard is automated rather than remembered.
2. **The panels ship in a correct state before any JavaScript runs** — one tab
   selected, the other two panels carrying `hidden`. The page is readable if the
   script never loads, and `incisor.js` documents that as its contract.

No `gtag` here, unlike the rest of the site: guide §4 forbids third-party script
tags on this page and the T13 CSP would block it. Deliberate, not an oversight.

## 2026-08-27 — T2 Flask service skeleton
**Outcome:** shipped
**Changed:** `incisor-trading/server/` (all new) — `incisor.py`,
`requirements.txt`, `config.env.example`, `incisor-trading.service`,
`apache-snippet.conf`, `.gitignore`, and `tests/` with `service_fixture.py`,
`test_incisor.py`, `test_http_smoke.py`, `README.md`. Plus `BACKLOG.md` (T2
checked), `DECISIONS.md` (six entries), `PROGRESS.md` (N4).
**Verified:** `.venv/bin/python -m unittest discover tests` — **28 tests, all
passing, in under a second.** Every T2 criterion is checked twice, once through
Flask's test client and once against a **real HTTP socket**, because a WSGI app
can satisfy every test-client assertion and still fail to boot:

- *runs locally* — the app serves on a real port and answers.
- */health returns JSON* — 200, `application/json`, expected keys, and asserted
  to leak no path, version or key state.
- *rejects a bad Origin* — 403 for a foreign origin, and separately for three
  lookalikes (`frontendneeded.com.evil.test`, `notfrontendneeded.com`, and the
  `http://` variant) that substring matching would have let through.
- *rate limit trips under a loop* — the per-IP gate trips at exactly its
  ceiling; the global gate is shown to bound 620 requests from 620 *distinct*
  IPs, which is the case the per-IP gate cannot catch.

Also covered: symbol validation against injection-shaped inputs, generic error
bodies, JSON 404s, and the four security headers over the wire. Nothing was
installed and nothing on the server was touched. `git status` shows changes only
under `incisor-trading/`.

**Notes:** Three departures from `preside-by-side/server`, each deliberate:

1. **It starts with no credentials.** Copying `suggest.py`'s exit-if-no-webhook
   would mean no session and no fresh checkout could run the service without a
   secret. Fixture mode is the default and never calls upstream, so a missing
   key is fatal only when live mode is explicitly requested.
2. **Origin policy varies by method.** Browsers omit `Origin` on same-origin
   GETs, so a read endpoint can only reject an origin that is *present and not
   allowlisted* — demanding one would break the requests we exist to serve.
   `origin_is_allowed(strict=)` holds both policies and data routes will use
   the strict one.
3. **`/health` is not reverse-proxied.** It is a local diagnostic; the public
   internet has no reason to ask this service how it is feeling. The Apache
   snippet ships with the data-route proxy lines commented out, so the file
   grows one line per route as they land and nothing is ever exposed early.

The `upstream_calls` table exists already, before there is anything to call.
That is on purpose: 25 requests a day is the binding constraint on this whole
project, and if the counter does not predate the first fetcher then the first
version that forgets to log a call will not be noticed. T4 builds on it.

The systemd unit pins **one worker with four threads**. The rate-limit buckets
and the call budget live in process memory, so a second worker would silently
double both ceilings — on a 25-a-day quota that is the difference between
working and not. The comment in the unit says so, because it looks like a
performance mistake otherwise.

## 2026-08-27 — Session close
**Outcome:** session cap reached — T0, T1 and T2 all shipped and committed
**Verified:** both suites green (34 page checks, 28 service checks); working
tree clean; `git status` shows nothing outside `incisor-trading/`; no branch
pushed, nothing merged, nothing installed, no upstream call made, no account
created and no terms accepted.
**Notes for the next session:** the top of the backlog is **T3, the fixture
layer**, which is unblocked — fixtures are hand-written to Alpha Vantage's
documented response shapes, and the parser is the only code that ever sees
provider JSON, so the provider choice staying open does not block it.

Two housekeeping flags:

- **`DECISIONS.md` gained fifteen rows today** and is now around 86 lines of
  wide table. Guide §16 says to consolidate once it runs past roughly two
  screens, and it is close. **S6 is worth taking soon** — the file only earns
  its keep by being short enough to read in full every session, and today's
  growth is exactly the drift it warns about.
- **D1** (browser verification of the page) stays open and needs an attended
  session. It is not a blocker for T3 or T4, which are both server-side.

## 2026-08-27 — Attended session (Key + Claude): review, tooling, guide v3
**Outcome:** shipped
**Changed:** `tools/shoot.py` + `tools/.htaccess` (new), `.gitignore` (new),
`docs/shots/t1-skeleton/`, `AGENT-GUIDE.md` (rule 10, §15, §16, new §17),
`BACKLOG.md` (D1 closed, Phase 6 added), `DECISIONS.md` (consolidated),
`server/incisor.py` and `server/incisor-trading.service` (comments)
**Verified:** both suites still green (34 page, 28 service); `shoot.py` reports
no console errors and no horizontal overflow at 1440/768/390; screenshots
reviewed by eye at desktop and mobile.

**Review of the first routine session — it held up.** In bounds, guide
untouched, tests genuinely passing, T0's licensing research accurate and
sourced. Three corrections came out of it:

1. **The browser gap is closed.** `tools/shoot.py` drives the installed Chrome
   through Playwright in a gitignored `.devtools` venv — free, local, never
   shipped. Guide rule 10 now separates shipped dependencies from dev tooling.
2. **A narrow `chrome --headless --screenshot` is not a mobile view.** It made
   T1 look like it overflowed horizontally; real emulation proves it does not.
   Recorded as a dead end so no session "fixes" a bug that isn't there.
3. **`DECISIONS.md` was collecting implementation rationale**, which belongs in
   comments beside the code. Guide §16 now carries an inclusion test: record it
   only if a future session could reverse or redo it unknowingly. The file went
   from 86 lines to 79 with the malformed rows repaired, and the reasoning for
   the one-worker unit and the early `upstream_calls` table moved into the files
   themselves — the systemd comment the last session referred to did not
   actually exist until now.

**New standing direction:** guide §17 and Phase 6. Finishing the backlog is not
finishing the project — after Phase 5 the routine keeps researching, keeps
trying new visual directions, and may build major revamps on branches. Ongoing
change must make the page measurably better and say how in the commit message.

**Notes:** Top of the backlog is still **T3, the fixture layer**, unblocked.

## 2026-08-27 — T3 · Fixture layer
**Outcome:** shipped
**Changed:** `server/provider.py`, `server/source.py`, `server/fixtures/`
(new — generator, README, 12 payloads), `server/incisor.py` (two routes),
`server/apache-snippet.conf`, `server/config.env.example`,
`server/tests/test_provider.py`, `server/tests/test_fixture_layer.py`,
`server/tests/test_http_smoke.py`, `server/tests/README.md`
**Verified:** 72 service tests and 34 page tests green. The service was booted
as a real process on a real socket and served `/quote` and `/history` for every
fixture symbol; `upstream_calls` stayed at zero rows and `lsof` showed no
outbound connection. `tools/shoot.py` was not run — this task touched no markup
or CSS.

`GET /quote?symbol=SPY` and `GET /history?symbol=SPY` now serve end to end from
committed JSON. Both go through the same three-step path: `source.fetch` decides
where a payload comes from, `provider.parse_*` turns it into our shape, and the
route wraps it in an envelope carrying `symbol`, `source`, `delay` and
`served_at`.

**Two properties of Alpha Vantage's responses drove most of the parser.** Every
value arrives as a quoted string, and the change percentage arrives with a
literal `%` on the end — so `'1.5871%'` becomes `1.5871`, once, in one place,
rather than being formatted out of a string in six. More importantly, **every
failure arrives as HTTP 200**: a bad symbol, a throttle and an exhausted daily
quota are all a normal 200 carrying prose under `Error Message`, `Note` or
`Information`. A parser that trusted the status code would render a rate-limit
notice as a price. Each is recognised and raised as a typed `ProviderError`
whose `reason` is a short token — safe to return — while the upstream prose goes
to the journal only, because on the live path that text can quote our own API
key back at us.

**The fixtures are invented and the API says so.** Every response carries
`"source": "fixture"`, so the page can label sample data as sample data rather
than presenting it as a quote. That field is not decoration; it is the thing
that keeps an unfinished dashboard honest.

The first generator walked each symbol independently and produced a 120-day
window where QQQ fell 26% while DIA rose 11%. That is not a market, and it is
what the whole dashboard would have been laid out against. Rewritten around one
shared market factor with a per-symbol beta and idiosyncratic noise: daily-return
correlations now sit at 0.84–0.91 across the four index proxies and 0.49–0.65 for
the two single stocks, which is what real tape looks like. Volume also scales
with the size of the day's move, so T7's "volume vs. average" readout has
something real to measure.

`BRK.B` is in the fixture set deliberately — it is the one symbol with a dot in
it, so the edge whitelist and the fixture path resolution are exercised rather
than assumed. `source.py` also refuses any endpoint outside the two it knows and
re-checks that a resolved fixture path is still inside the fixture root, which is
belt-and-braces against that whitelist ever loosening.

**Live mode fails closed.** It is still configurable, but the thing that would
make the call — the cached, quota-counted fetcher — is T4. Until then the routes
return a logged 503 rather than a route that looks like it works and serves
nothing. `config.env.example` says so, so nobody flips the switch and wonders.

The Apache snippet grew its first two real proxy lines, since the routes now
exist. Nothing was installed and nothing on the server was touched.

## 2026-08-27 — Attended: the audit directive (guide §18)
**Outcome:** shipped
**Changed:** `AGENT-GUIDE.md` (new §18), `BACKLOG.md` (O6, audit log section),
`ROUTINE.md` (bootstrap line)
**Verified:** section numbering contiguous 1–18; backlog headings in order with
the audit log above *Discovered*; audit table columns consistent.

**Notes:** §18 covers going back over finished work. A feature is audited on
four questions — useful, easy, beautiful, performing — answered in writing
against the `shoot.py` images rather than the source, and ends in exactly one of
four verdicts: keep, minor edits, challenge, retire. *Retire* is deliberately
included; a feature that fails the usefulness question should be deleted, not
improved.

The challenger protocol is the substance. Criteria get written down **before**
the alternative is built, because the routine will have built both and would
otherwise decide in favour of whichever it enjoyed more. The challenger must be
finished — same acceptance criteria, same suites, own screenshots, same empty
and error states — because an unfinished challenger always loses for reasons
unrelated to whether the idea was better. Loser becomes a dead end entry.

Decision rights split: function, usability and performance are the routine's own
call under §3; how the page looks overall stays Key's via `DESIGN-BRANCHES.md`.
A challenge that is both decides the functional half and registers the visual.

The audit log lives at the bottom of `BACKLOG.md` rather than in a new file —
it is already read in full every session, and audits generate tasks anyway.
Working oldest-first is what stops one feature being re-audited while another
has never been looked at.


## 2026-08-27 — T4 · Snapshot cache + price store
**Outcome:** shipped
**Changed:** `server/store.py`, `server/fetcher.py` (both new),
`server/incisor.py`, `server/source.py`, `server/config.env.example`,
`server/tests/test_cache.py` (new), `server/tests/test_fixture_layer.py`,
`server/tests/README.md`
**Verified:** 100 service tests and 34 page tests green. Against the running
service, seven HTTP requests produced three upstream reads and four produced
two; the reported age of a quote is now identical across the fetch and every
later cache hit.

The database left `incisor.py` for `store.py`, and `incisor.py` is now only the
edge: check who is asking, validate the symbol, ask the fetcher, and say nothing
extra when it fails. Five modules with one job each — edge, storage, cache,
retrieval, parsing.

**`fetcher.py` is the only module allowed upstream**, because it is where the
two things that keep this project alive happen. The cache means a page refresh
costs nothing. The freshness check is repeated *inside* the per-symbol lock
rather than trusted from before the wait, which is the difference between one
call and four when several requests arrive together — there is a test that
starts four threads on a barrier to prove it.

The budget is the other half, and it is a design decision as much as a limit.
25 calls a day is the ceiling, so the service stops at 22 and degrades in the
order that keeps a page on the screen: fresh cache, then refresh, then **serve
stale and say so**, and only then fail. An upstream error with something cached
takes the same path — a hiccup should not blank a dashboard that already has
data. `stale` and `fetched_at` ride in every response so the page can label what
it is showing rather than quietly presenting old numbers as current.

Every attempt is logged, failures included, because a failed call still spent
quota and a budget that counts only successes is optimistic in exactly the
situation where it must not be. Fixture reads are logged too — they are real
cache misses and worth seeing — but excluded from the count, since letting a
session's fixture traffic eat the live allowance would make the number lie in
both directions.

**Live mode is now wired end to end and has still never run.** What can be
checked without a network is: URL construction, failing closed with no key, and
redacting the key from anything logged. That last one is not theoretical —
upstream echoes the key back in some error bodies, and the journal is the
realistic place for it to escape.

**One deliberate deviation.** T4 asks for a fundamentals table and there is not
one. Its shape is undefined until T11 and its upstream is SEC EDGAR rather than
the quote provider, so building it now would be schema with no writer and a
migration to come. Recorded in `DECISIONS.md` and flagged below.

## 2026-08-27 — T5 · Market clock
**Outcome:** shipped
**Changed:** `js/market-clock.js` (new), `incisor.js`, `index.html`,
`incisor.css`, `tests/clock_model.jxa.js` and `tests/test_market_clock.py`
(new), `tests/tab_model.jxa.js`, `tests/test_page.py`
**Verified:** 59 checks in JavaScriptCore covering every phase boundary, both
sides of daylight saving, a weekend, a full holiday, an early-close half day and
the view's own wordings. 39 page tests and 100 service tests green. `shoot.py`
reports no console errors and no horizontal overflow at 1440, 768 or 390, and
the screenshots in `docs/shots/t5-market-clock/` show the clock live in its
pre-market state — the script genuinely upgraded the served text.

**Holidays are computed, not listed.** A hardcoded table is correct until the
year it isn't, and it goes stale silently: the page would simply claim the market
was open on Thanksgiving. Every NYSE closure has a rule — a fixed date, an nth
weekday, or Good Friday, which is Easter minus two days and the reason there is
now an Easter computation in a trading page. Checked against published calendars
for 2026, 2027, 2028 and 2033.

Two edges worth naming, because both look like bugs and neither is. When
1 January falls on a Saturday the exchange does **not** close on the preceding
Friday, so that year has nine closures rather than ten — written out explicitly
rather than left to the observance rule, which would otherwise compute a
"January 0th" and give the right answer for the wrong reason. And a full holiday
outranks an early close, which is what makes an observed 3 July shut rather than
short.

Eastern time comes from `Intl` rather than a fixed offset, so the open is 13:30Z
in summer and 14:30Z in winter without this project tracking daylight saving.

**The page is correct before the script runs.** The served markup states regular
market hours — always true — and the script upgrades that rather than replacing
a placeholder, so a failed script leaves something useful rather than "Loading…"
forever. There is a test for that path. The clock is deliberately not a live
region: the countdown reticks every second, and `role="status"` would have a
screen reader announce it every second too. The coloured dot never carries the
state alone; the word beside it says the same thing.

**One thing fixed in passing.** The page-level security greps — no `innerHTML`,
no `eval`, no network calls — only ever read `incisor.js`. They are blunt
substring checks by design, and a rule covering one file stopped being a rule
the moment `js/` appeared, so they now read every shipped script.

## 2026-08-27 — Session close
**Outcome:** session cap reached — T3, T4 and T5 shipped and committed
**Verified:** all three suites green (100 service, 39 page, 59 clock checks);
`shoot.py` green with screenshots reviewed by eye at desktop and mobile;
`git status` shows nothing outside `incisor-trading/`; no branch pushed, nothing
merged, nothing installed, **no upstream call made**, no account created and no
terms accepted.

Phase 0 is complete and Phase 1 is open. The top of the backlog is **T6, the
index summary strip**, which is unblocked and now well supplied: `/quote` and
`/history` serve all four ETF proxies from fixtures, the tiles have real numbers
to bind to, and the clock is already sitting above them.

### For Key

- **No fundamentals table was created, though T4 names one.** Its shape is
  undefined until T11 and its upstream is SEC EDGAR rather than the quote
  provider, so it would have been a table with no writer and a migration to
  come. If you would rather the schema landed up front the way `upstream_calls`
  did, say so and it will be added — the argument for doing it early is the same
  one that applied there.
- **The fixture prices are invented, and the API says so.** Every response
  carries `"source": "fixture"`, and `T6` should surface that on the page as
  something a visitor can see. Flagging it because it is the one honesty
  property that would be easy to drop by accident while making the tiles look
  good.
- **`DECISIONS.md` is at 86 lines again**, the same drift the last close-out
  flagged. **S6 is worth taking soon.**

## 2026-08-28 — T6 · Index summary strip
**Outcome:** shipped
**Changed:** `js/market-figures.js`, `js/market-data.js`, `css/market.css`,
`tests/strip_model.jxa.js`, `tests/test_index_strip.py` (all new),
`incisor.js`, `index.html`, `incisor.css`, `tests/test_page.py`,
`tools/shoot.py`
**Verified:** 103 checks in JavaScriptCore, 50 page tests, 100 service tests.
`shoot.py` green at 1440, 768 and 390 in both acceptance states — with the
service proxied (`docs/shots/t6-index-strip/`) and with nothing answering
(`docs/shots/t6-service-down/`). Screenshots reviewed by eye at desktop and
mobile; the second one changed the design, see below.

**One endpoint, not two, and that is the whole shape of the task.** A daily
series already contains its own quote: the last bar is the latest price and the
bar before it is the previous close, which between them are every figure a tile
shows. Calling `/quote` as well would have spent a second upstream call per
symbol to be told what we had just been told. The evidence is in the scratch
database — nine page loads across three screenshot runs produced exactly four
fixture reads, one per symbol, no repeats. In live mode that is four calls a
day for the strip against a budget of twenty-two, rather than eight.

**The served markup carries no prices at all.** Every figure is an em dash
until the service answers. The hardcoded sample numbers from T1 are gone along
with the banner that excused them, because a page printing plausible figures it
did not fetch is, to a reader, indistinguishable from one showing real ones.
The line under the grid is what says which it is, and it is driven by the
service's own `source` field rather than by the page assuming anything — so the
day the provider question is settled, the same line starts saying "delayed
close" without a change here. There is a test that the served wording is still
true when the script never runs.

**The screenshot changed the design, which is the argument for taking them.**
The first render coloured the sparkline by its own thirty-day direction, which
is standard and was correct: the fixture market has been drifting down for a
month while the last session was up a hair. On screen it produced four tiles
each showing a green up arrow directly above a red falling line, and it reads
as a contradiction rather than as the two timescales it is. The line is now
uncoloured, green and red mean exactly one thing per tile, and the dashed
opening level is what says which way the month went. Nothing in the source
would have shown that.

**Degradation was built as a first-class state, not an afterthought.** With
nothing answering, the grid keeps its shape, each tile says "unavailable" in
its own space, and the line beneath explains why. The rejection path is
deliberately silent — the failure is already on screen twice, and a console
error there would be noise in the one check that has to stay meaningful. That
is also why `shoot.py` treats a failed `/api/incisor/` request as benign: it
matches on the request URL, so a genuine script error inside `market-data.js`
is still reported, because its location is the script and not the endpoint.

**Two page tests were wrong rather than merely outgrown.** The line-count rule
measured the concatenation of every shipped script, so it would eventually have
demanded a split of whichever file happened to be last when the total crossed
600 — it is per file now. And `test_the_skeleton_makes_no_network_calls_of_its_own`
was written for a page that had no data; it now asserts what it always stood
for, which is that every request goes to a relative path on our own origin.

**`incisor.css` passed 600 lines**, so the surfaces that render numbers moved to
`css/market.css`. The seam was already there and it is not a byte count:
everything moved draws data from the service, everything left would look the
same with no data at all.

**`shoot.py` gained `--api`.** It forwards `/api/incisor/*` to a running service
the way Apache does in production, which is what made "renders from fixtures"
checkable in a browser at all rather than only in a DOM stub. Without the flag
the same command shoots the degraded state, so both halves of the acceptance
criteria come from one tool.

One stale screenshot folder was removed: `docs/shots/review-t5/` was an
uncommitted duplicate of `t5-market-clock/` left over from the last session.

## 2026-08-28 — S6 · Consolidate the memory
**Outcome:** shipped
**Changed:** `docs/DECISIONS.md`, `docs/BACKLOG.md`, `docs/shots/`
**Verified:** 50 page tests and 100 service tests still green; every surviving
reference to a pruned screenshot folder now points at what replaced it.

Taken ahead of T7 because the last two close-outs both flagged it and guide §16
triggers on a condition that was met: `DECISIONS.md` has to be readable in full
every session, and it had stopped being that.

**The first attempt failed and is worth recording.** Merging the rows dropped
the count from 25 to 17 and made the file *longer* — 2093 words to 2217 — because
merging without cutting is rearrangement. The measure that matters is how much
there is to read, not how many rows there are. The second pass applied the
guide's own inclusion test properly and the file is now **1854 words in 57 lines
against 1837 in 86 at the start of the day, while carrying four more entries**
than it did this morning.

What actually came out was duplication with better homes. The provider dead-end
row was reproducing clause numbers that `DATA-PROVIDER.md` already sets out in
full, the market-holiday row was reproducing an edge case already commented at
`js/market-clock.js:162`, and the header was restating guide §16 back at itself.
Each is now a pointer. Nothing was deleted: the five rejected providers are one
row instead of five, each still named with its reason and its revisit condition.

**One promotion to Recurring traps**, which had been empty. The blunt substring
greps in `test_page.py` have now bitten twice — at T5 they were only reading
`incisor.js` and had silently stopped being rules when `js/` appeared, and at T6
the word `innerHTML` inside an explanatory comment failed the test that forbids
it while the 600-line rule turned out to be measuring every script concatenated.
Three different failure modes from one design, which is what makes it a trap
rather than two unrelated bugs.

**`docs/shots/` went from four sets to two.** The T1 and T5 sets showed markup
that no longer exists, and T6 shoots the same page at the same three widths with
the clock in it. That reclaimed 780KB in a repo served off a home connection,
which is the whole reason the guide names screenshots as the other thing that
grows without bound. The retention rule is now written down rather than being
re-decided each time: keep the newest set for the page as it stands, plus any
set showing a state that one does not — which is why both T6 folders survive,
since the second is the service-unavailable state.

### For Key

- **The T1 and T5 screenshots were deleted, deliberately.** If you wanted those
  kept as a visual history of how the page evolved rather than as evidence for
  a task, say so and the rule in `DECISIONS.md` changes — it is one row. The
  current page, in both its loaded and its unavailable states, is in
  `docs/shots/t6-*`.
- **The provider question is still the only thing gating live data.** Nothing
  has changed since T0 and no session is blocked on it, but T6 is the first
  task where it is visible on the page: the line under the tiles currently
  reads "Sample data · generated prices, not real quotes", and it will start
  saying "Delayed data · end-of-day close" on its own, with no code change,
  the day the service runs in live mode.

## 2026-08-28 — Session close
**Outcome:** two tasks shipped — T6 and S6 — and stopped short of the cap
**Verified:** 103 JavaScriptCore checks, 50 page tests and 100 service tests
green; `shoot.py` green at 1440, 768 and 390 in both of T6's acceptance states,
with the images reviewed by eye; `git status` shows nothing outside
`incisor-trading/`; no branch pushed, nothing merged, nothing installed, **no
upstream call made**, no account created and no terms accepted.

**Stopped at two of three deliberately.** The next task is T7, symbol search and
the quote detail panel, and it is too large to start and finish honestly in what
was left — hard rule 8 says finish one before starting the next, and a half-built
T7 would be worse than a clean stop. What was done instead was to establish what
T7 actually has to work with, so the next session does not spend its first hour
discovering it.

**T7 is not blocked, but three of the figures it names have no data behind them.**
Checked directly rather than assumed:

- **52-week range — not possible from fixtures.** Every series is 120 bars,
  2026-03-12 to 2026-08-26. That is five and a half months, not a year. Either
  the generator is extended to 260 bars (cheap, deterministic, and it also
  unblocks T8's 1Y and 5Y ranges) or the panel labels the range by the window it
  actually has. The first is better and belongs at the top of T7.
- **Market cap and P/E — no source exists.** They come from SEC EDGAR, which is
  T11, and there is no fundamentals table by an explicit T4 decision. T7 should
  render them as "—" the way T11's own acceptance criteria demand, not invent a
  second upstream.
- **Search by company name — there is no name index anywhere.** The four names
  on the page are hardcoded in the markup, and nothing on the data side knows
  that SPY is the S&P 500. Alpha Vantage has a symbol-search endpoint but it
  spends quota per keystroke, which the 22-call budget rules out. A small
  committed symbol-to-name table is the obvious answer and costs nothing.

The rest of T7 is well supplied: `/quote` already returns the day range, volume
and previous close, and it is still unused by the page, so the panel has a route
waiting for it.

### For Key

Nothing new needs a decision. The two open notes are the provider permission,
unchanged since T0 and blocking nothing, and the screenshot retention rule
recorded under S6 above — both are one-line reversals if you disagree.

## 2026-08-28 — T7 · Symbol search + quote detail
**Outcome:** shipped
**Changed:** `index.html`, `incisor.js`, `css/lookup.css` (new),
`css/market.css`, `js/dom.js` · `js/symbol-search.js` · `js/view-symbol.js` ·
`js/view-index-strip.js` (new), `js/market-data.js`, `js/market-figures.js`,
`server/catalog.py` (new), `server/incisor.py`, `server/source.py`,
`server/fetcher.py`, `server/fixtures/`, `tools/shoot.py`, `tests/`
**Verified:** 163 checks in JavaScriptCore, 72 page tests, 123 service tests;
`shoot.py` green at 1440, 768 and 390 in four states, images reviewed by eye.

Search is a combobox over a committed name table, and the panel below it shows
one symbol's last price, both its ranges, and how heavily it traded. Both
halves of the acceptance criteria are screenshotted rather than asserted only:
`docs/shots/t7-search/` has the list open and walkable, `docs/shots/t7-quote/`
has SPY loaded, `docs/shots/t7-not-found/` is an unknown ticker, and
`docs/shots/t7-service-down/` is the same lookup with nothing answering.

**Three of the figures had no data behind them, as last session found.** Each
was answered rather than worked around:

- **The 52-week range needed a year and nothing had one.** The fixture series
  ran 120 sessions and live mode asked upstream for `outputsize=compact`,
  which is 100 — so both would have produced a "52-week" range covering under
  half a year, invisibly. Fixtures now run 260 weekdays and live asks for
  `full`, which costs the same single call and is cut to five years by
  `fetcher.bounded` before anything is stored. Regenerating changed every
  price; the daily-return correlations across the proxies still sit between
  0.79 and 0.92, so the set still describes one market. This also unblocks
  T8's 1Y and 5Y ranges.
- **Search by name needed something that knows AAPL is Apple.** Nothing did.
  `server/catalog.py` is a committed table of about fifty US listings and
  `GET /symbols` serves it; upstream symbol search was disqualified outright,
  not on cost but on spending a call per keystroke against a budget of 22 a
  day. The route resolves availability rather than the table doing it, so in
  fixture mode search offers exactly the six symbols that can be priced.
- **Market cap and P/E stay em dashes**, with a line on the page saying they
  come from filings this page does not read yet. That is T11's job and T11's
  own acceptance criterion; inventing a second upstream for them here would
  have been the wrong answer to a question already assigned.

**Two files crossed 600 lines and both splits were real ones.** `incisor.js`
held the shell, the clock and the whole index strip; `css/market.css` held
every surface. The seam is the one already used between `incisor.css` and
`css/market.css`, applied one level further — a surface that renders market
data owns a view module and a stylesheet, and the shell keeps what would look
the same with no service at all. `js/dom.js` holds the three DOM writes every
view makes, so the rule that network data is written as text rather than
markup is stated once instead of re-decided per view.

**Three bugs came out of the screenshots rather than the tests**, which is
guide §18 working as intended:

1. **The results list re-opened on top of the panel it had just filled.** Each
   keystroke queues a debounced render, and choosing a symbol closed the list
   without cancelling the queued one, so it reappeared 90ms later. Closing now
   cancels the pending render. The regression test was confirmed to fail
   without the fix before being kept.
2. **With the service stopped, an unknown-symbol message appeared for a symbol
   that exists.** Any 404 was being read as "no such ticker", and the static
   server standing in for the stopped service answers 404. Only our own
   service's `symbol_not_found` body counts now. A real Apache with a dead
   backend would have produced the same confident lie.
3. **The hint said "Showing NVDA." directly above "No data for NVDA."** It was
   set optimistically before the lookup resolved. It now says what to do next,
   and only when there is something to do — trying a different ticker fixes a
   ticker that does not exist and fixes nothing when the service is down.

Also: seven figures under `auto-fit` put six on one row and orphaned the
seventh, which reads as breakage rather than as a grid. Fixed columns, 4 + 3
at desktop and 2 + 2 + 2 + 1 on a phone.

**`shoot.py` gained `--symbol` and `--search`.** The quote panel is empty
until someone searches, so without them the only screenshot the tool could
take of the task's whole deliverable was the one state nobody is asking about.
T8 needs the same thing — a chart does not exist until a symbol is loaded.

**The mid-page navigation bar in a full-page mobile screenshot is a capture
artifact, not a defect.** `.site-nav` is `position: sticky` under the shared
stylesheet's mobile breakpoint, and Chrome paints a sticky element again
partway down a full-page capture. Checked directly at 390px with a viewport
screenshot: the heading it appeared to cover is present and visible. Worth
knowing before someone chases it, and the fix would be out of bounds anyway —
`.site-nav` belongs to `/assets`.

### For Key

- **`DECISIONS.md` has grown from 1854 words to about 2480** in one session.
  Every entry passes the inclusion test, but S6 ran only yesterday and the
  file is heading back toward being too long to read in full each time. Not
  acted on today — consolidating and shipping T7 in one session would have
  meant doing neither properly — but it is the first thing worth a session
  when the top of the backlog is blocked.
- **The provider question is unchanged and still blocks nothing.** T7 makes it
  slightly more visible: the quote panel now carries its own "Sample data ·
  generated prices" line beside a second price, so the page says it twice. It
  will start saying "Delayed data · end-of-day close" in both places on its
  own, with no code change, the day the service runs in live mode.

## 2026-08-28 — Session close
**Outcome:** one task shipped — T7 — and stopped short of the cap
**Verified:** 163 JavaScriptCore checks, 72 page tests and 123 service tests
green; `shoot.py` green at 1440, 768 and 390 across four states, images
reviewed by eye; `git status` shows nothing outside `incisor-trading/`; no
branch pushed, nothing merged, nothing installed, **no upstream call made**, no
account created and no terms accepted.

**Stopped at one of three deliberately.** T7 was three tasks' worth of work in
one entry — a search control, a detail panel, two file splits and a fixture
regeneration — and the next task is T8, the price chart, which is comparable in
size. Hard rule 8 says finish one before starting the next, and a half-built
chart would be worse than a clean stop. What was done with the remaining time
instead was to establish what T8 has to work with, the way the last session did
for T7.

**T8 is not blocked, but two of the six ranges it names have a problem.**
Checked against the committed fixtures rather than assumed:

- **1D cannot be drawn from what we have.** Every range reads the daily series,
  and one day of it is a single bar — a chart of one point. A real intraday
  chart needs `TIME_SERIES_INTRADAY`, which the provider does have
  (`DATA-PROVIDER.md`) but which is a separate call per symbol, on top of the
  two a symbol already costs. On a 22-a-day budget that is affordable only
  on demand and only for the symbol being viewed, never for the four proxies.
  The alternative is to drop 1D and start the ranges at 5D, which is honest
  and free. **Worth deciding before building, not during.**
- **5Y is short in fixture mode and fine in live mode.** The generator writes
  260 bars and `fetcher.MAX_DAILY_BARS` allows 1260, so live mode fills a 5Y
  range and a session working on fixtures cannot see one. Extending the
  generator to 1260 bars would take the fixture set from roughly 270KB to well
  over a megabyte. Labelling the range by the window it actually has is the
  cheaper answer and the page already does exactly that for the 52-week range,
  which is a precedent worth reusing rather than a compromise.

The other four ranges — 5D, 1M, 6M, 1Y — have their sessions in full. The
sparkline in `js/market-figures.js` is a working, tested precedent for the
geometry, including the flat-series and single-point cases that produce `NaN`
paths and render as nothing at all.

### For Key

Nothing new needs a decision. The two open notes are the provider permission,
unchanged since T0 and blocking nothing, and `DECISIONS.md` heading back toward
being too long to read in full — both recorded in the T7 entry above.

## 2026-08-29 — T8, the price chart

**Task:** T8 · Price chart. Shipped.

The dashboard now draws a symbol as well as quoting it. `js/chart-geometry.js`
is the pure half — ranges, windows, scales, axis ticks and the arithmetic that
turns a pointer position into a bar — and `js/view-price-chart.js` is the
drawing, with `css/chart.css` beside it. That is the same seam the last two
tasks split along: a surface that renders market data owns a view module and a
stylesheet, and the pure logic sits where a session with no browser can drive
it.

**The chart owns no request.** It draws the `/history` series the quote panel
already fetched, handed over rather than asked for again. That is what makes
the range buttons free: switching from 1M to 5Y is a redraw, not a fetch, and
on a budget of 22 calls a day a chart that re-fetched per range would be a
chart with two ranges. It also means the chart cannot fail on its own — if the
series did not arrive, the panel above still has a price and the chart says
what is missing in its own space.

**Five ranges, not the six T8 names.** 1D is not built and is not going to be:
a day of a daily series is one bar, and an intraday view is a third upstream
call per symbol on top of the two a lookup already costs. The last session had
already established this against the fixtures; today it became a decision, and
`DECISIONS.md` says plainly not to "complete" T8 by adding it. The other short
range, 5Y, was kept rather than dropped and made honest instead: in fixture
mode it draws the 260 sessions the series holds, the heading reads *Over the
260 sessions held* rather than *Over five years*, and a line under the chart
names the shortfall. That is the precedent the 52-week range set at T7 rather
than a new compromise.

**The SVG stretches, so text and circles came out of it.** The plot uses
`preserveAspectRatio="none"` — the same trick the tile sparklines use, and the
reason a 1.4-unit stroke stays 1.4px at every width. Straight lines survive
that. Glyphs come out smeared and a `<circle>` comes out an ellipse, so the
price scale, the date labels, the point markers and the hover dot are HTML
positioned over the plot at the percentage the geometry computed, through the
same `style.setProperty` route the range markers already use. The gradient
under the line ships in the markup rather than being built, so emptying the
drawing group on each redraw does not take it along.

**Reading a single day works two ways and writes one readout.** The pointer
reads it, and the plot is one tab stop where the arrow keys walk the series,
Home and End jump to its ends, and Escape puts the cursor away. Underneath,
a `<details>` holds every session in the range as a real table — built when it
is opened rather than on every redraw, because a five-year window is over a
thousand rows and rebuilding those on each range change would be a cost paid
by everyone to serve the readers who open it.

**Three things came out of the screenshots rather than the tests**, which is
guide §18 working as intended.

1. **The price axis had two labels on it.** `priceTicks` asked for four levels,
   and the 1/2/2.5/5/10 step family rounds up hard enough that a typical price
   band landed a step of 50 across a span of 130. Two labels is a scale a
   reader interpolates rather than reads. Asking for six gets a step of 25 and
   five or six labels, which is an axis.
2. **The 5D axis bunched.** Sampling four date ticks out of five sessions
   rounds two of them onto adjacent bars, so the labels read 20, 21, 25, 26
   with a hole in the middle — which looks like a fault rather than a scale. A
   window short enough to label bar by bar now is, and the mobile rule that
   thins a crowded axis drops alternate interior labels rather than a fixed
   one, so what remains stays spread whether the axis carries four labels or
   five.
3. **A screenshot showed the 6M button pressed above a chart drawing five
   years.** It was not: the shot was taken inside the 180ms transition between
   two correct states. A browser check proved the attribute had moved. The fix
   is in the tool — `tools/shoot.py` now passes `animations="disabled"` on
   every capture, so a shot is of a state the page actually rests in. Recorded
   as a trap in `DECISIONS.md`, because chasing it meant a long look at code
   that was right.

Two smaller ones came out of re-reading the finished module. The scale used to
place a gridline was a second copy of the arithmetic that placed the line, so
`plot` now returns the scale itself and there is one formula rather than two
that have to agree. And the shortfall note outlived the series it described:
switching to 5Y and then losing the history left "5Y is the whole series held"
above an empty chart.

**Light and dark.** The criterion is met the only way it can be here: nothing
on this page, and nothing in `/assets/css/styles.css`, responds to
`prefers-color-scheme` — the whole site is one deliberate dark treatment, and
`css/chart.css` adds no media query of its own. Every colour the chart uses is
declared against the page's own tokens, so a light-scheme browser renders it
identically rather than half-styled. Worth stating rather than claiming a
light theme was reviewed.

**Verified:** 134 checks in JavaScriptCore for the chart (460 across all four
runners), 88 page tests, 123 service tests, all green. `tools/shoot.py` green
at 1440, 768 and 390 across four states, images reviewed by eye. The service
ran in fixture mode against a scratch database throughout; **no upstream call
was made**, no account created, no terms accepted, nothing installed, nothing
pushed or merged. `git status` shows changes only under `incisor-trading/`.

**Four shot sets, down from the six that were taken.** `t8-chart` is the page
as it stands; `t8-chart-5d` and `t8-chart-5y` are the two ends of the range
control, which the default set cannot show and which both changed today;
`t8-service-down` is an acceptance criterion. The searching and not-found
states went with the four superseded `t7-*` sets: their markup no longer
matches the page, and what they proved is proved on every run by 163 checks in
`symbol_model.jxa.js` and the markup assertions in `test_symbol_lookup.py`.
`docs/shots/` is 2.8MB against about 2MB before, because the chart makes the
page taller and a full-page mobile capture is the bulk of a set. Worth a look
the next time S6 comes round.

**D2, resolved the same session it was found.** `index.html` finished T8 at
598 lines against a 600-line rule, which would have blocked T9 through T12 —
each of them adds a surface. It was filed as a task with three options and one
of them was "or Key says the rule reads differently", which is exactly the
hedge guide §3 forbids, so it came back off the shelf and got decided.

The answer was to ask what the rule protects. §6 says to split a long file
*along a real seam*; every other file here has one and has used it, and a
served document has none — hard rule 10 forbids a build step so there is no
include, and the non-goals forbid a second route to move markup to. A line cap
on markup is therefore not a readability rule at all, it is a cap on how many
surfaces this route may carry. So `test_page.py` measures three things now:
600 lines per stylesheet and script, which can split; 900 for the document, a
ceiling that fails loudly if the page ever carries a second route's worth of
markup; and **150 lines per surface**, which is what §6 is for. The largest
surfaces today are the quote panel at 109 and the chart at 103.

The surface list is derived rather than written out — an element whose own
`data-x` attribute is the prefix of several hooks inside it, which is the
pairing every view module already documents as its contract. A written list
would stop covering the page the moment somebody added the next surface, which
is the trap `DECISIONS.md` already records twice.

**Stopped at one backlog task and one discovered one.** T8 was a task's worth
of work on its own — three new files, a stylesheet, an axis system, two input
paths and a table fallback — and D2 came out of it and had to be cleared
before anything else could touch the markup. T9 is `localStorage` state with
its own failure modes and is now genuinely unblocked, which is a better place
to leave it than half-built.

### For Key

- **The 600-line rule now reads three ways, and that is an interpretation of
  the guide rather than a change to it.** `index.html` cannot split — no build
  step, no second route — so the cap it was failing was really a cap on how
  many surfaces the page may have. Scripts and stylesheets keep 600, the
  document gets a 900 ceiling, and each surface gets 150, which is the number
  that actually protects readability. Decided rather than raised, per §3, but
  it touches how a guide rule is read, so it is here for you to overrule.
  `DECISIONS.md` carries the reasoning.
- **The rate limiter bites the screenshot tool.** One `shoot.py` run makes
  about 21 requests across its three viewports, and the per-IP ceiling is 60 a
  minute — so three runs back to back trip it and the page correctly renders
  its "market data unavailable" state. That looks exactly like a broken
  screenshot. Noted in `tests/README.md`; no code change, because the limiter
  is doing its job and the fix is to leave a minute between runs.
- **The provider question is unchanged and still blocks nothing.** T8 adds no
  upstream call at all, so it does not move.

## 2026-08-29 — Attended: two fixes before the next session
**Outcome:** shipped
**Changed:** `AGENT-GUIDE.md` (§18 cadence, §14 step 4), `BACKLOG.md` (audit log
seeded with the queue), `tools/shoot.py`
**Verified:** 90 page tests still green; `shoot.py --api` against a dead port now
reports 502s instead of passing, and the no-`--api` run is still clean.

**1. Audits could never fire.** `O6` is the only audit task and it sits in Phase
6, below nineteen open tasks, while §18 said audit "no later than the end of the
phase it belongs to". The protocol takes the topmost unchecked task, so the
whole dashboard would have shipped unaudited. My error, not the routine's.

An audit is no longer something reached by working down the backlog. A surface
with no row in the audit log and three or more sessions behind it **is due**, and
at step 4 a due audit is taken *instead of* the next task, one per session. A
*keep* verdict still writes a row — that row is what stops the surface coming up
again. The log is seeded with the four shipped surfaces in ship order, so the
next session has an unambiguous queue: the market clock is first.

**2. `shoot.py` suppressed real service failures.** `API_PREFIX` was in
`BENIGN_CONSOLE` unconditionally, so with `--api` passed a 500 from the service
being exercised would have been filtered out and the run would have gone green.
Split into `BENIGN_CONSOLE` (always benign — the beacon's `/api/event`) and
`BENIGN_WITHOUT_API` (benign only when the service was never wired up, which is
the deliberate degraded-state shot).

**Still open for Key, not acted on:** D2 raised the served document's line
ceiling to 900 where guide §6 says ~600. The reasoning is sound and was recorded
rather than hidden, but it is a rule of his being reinterpreted, so it stays his
call. No change made.

## 2026-08-29 — Audit: the market clock (T5)
**Outcome:** shipped — verdict **minor edits**
**Changed:** `js/market-clock.js`, `incisor.js`, `index.html`, `incisor.css`,
`tests/clock_model.jxa.js`, all four shot sets
**Verified:** 72 checks in JavaScriptCore (up from 68), 90 page tests, 123
service tests, `shoot.py` green at 1440, 768 and 390 across four states.

The first audit to fire under the new §18 cadence. The market clock was the
oldest surface with no row in the log, so it was this session's work instead of
T9.

**What it said.** `● CLOSED  Opens in 2d 10h`. Everything about that is
correct and none of it is what a visitor came for. "In 2d 10h" is a sum the
reader performs in their head to arrive at "Monday morning", and it arrives at
it in no stated timezone — because the line the script overwrites,
`Regular hours 9:30am – 4:00pm ET, Monday to Friday`, was the only place on the
surface that said ET. The upgrade *removed* information. The state word lost
its subject the same way: the served markup said "US market", and the live
version replaced it with "Closed", which names no market at all.

None of this was a defect. The clock's suite is thorough — every phase
boundary, both sides of daylight saving, a half day, a holiday, the computus —
and all of it passed, because the tests were written from the same idea of the
feature that built it. Nothing was broken; the wrong half of the question was
being answered. That is exactly the gap guide §18 exists for, and it is why an
audit reads the rendered image rather than the module.

**What it says now.** `● CLOSED  Opens Monday 9:30am ET`. The moment is named,
in Eastern, with the day word dropped when the event is today and "tomorrow"
where it fits. `sessionAt` grew a `next.when` for it, so the wording is pure
and testable against fixed datetimes like everything else in that module.

The countdown is kept **only while the event is today**. It earns its width by
being live and close — "Closes 4:00pm ET · in 14m" is worth watching — and
beyond that it is the same fact told worse. Naming the day also made the
weekend fix itself: the audit's second finding was that a holiday explained
why the market was shut while a weekend just showed a countdown, and "Opens
Monday" is that explanation, so no wording was needed for it.

**The measurement, not the eyeball.** The rare states are the long ones and
today is a Saturday, so they cannot be screenshotted without lying about the
system clock. A throwaway Playwright script drove the real page at 375px and
wrote each candidate wording into the real node. First pass: three of seven
states wrapped, and a holiday took *three* rows. That killed the first draft,
which had kept the countdown everywhere.

With the same-day rule, and with the reason moved out of the detail string
into its own element so it wraps as a whole phrase rather than across
"Juneteenth National Independence" / "Day":

| state | rows at 375px |
|---|---|
| served, no JS | 1 |
| open · pre-market · after hours · weekend | 1 |
| early close · holiday, incl. the longest holiday name | 2 |

The reason is parenthesised rather than separated by the page's middot,
because it is the one part of the line that lands at the start of a row and a
leading separator there reads as a missing word.

**A third finding, closed on the way past.** `min-height: 34px` on the clock
carries a comment saying it reserves the height so real content cannot shift
the page. It did not: the served line wrapped to two rows on a phone and the
live one did not, so the surface shrank the moment the deferred script ran.
Shortening the served text to `9:30am – 4:00pm ET` puts both states at exactly
34px, measured. The state span carries "Regular hours" until the script runs,
which reads as a definition of the hours rather than a claim about now — the
dot stays grey with no `data-phase`.

**The subject came back as an off-screen span.** "US market", never rewritten,
so a screen reader hears "US market, Closed, Opens Monday 9:30am ET" instead
of "Closed". Sighted readers get the subject from the ET. It is not a shared
utility class — this is the only element on the page that needs one, and
`/assets` is out of bounds.

**The other two questions.** *Beautiful:* it is the plainest thing on the page
and should stay that way. One quiet line above the tabs is right for something
read in a glance, and it would be a mistake to grow it into a card. *Performing:*
zero upstream calls, no network at all, and it renders before any data arrives
— the only surface here that is complete with the service stopped.

**All four shot sets were refreshed,** because every one of them carries the
clock at the top and every one of them was showing a line that no longer
exists. Same names, same states, replaced rather than accumulated, per the
`docs/shots/` rule.

**No backlog task was taken.** One audit per session is the whole of it (§18),
so T9 waits a day. Nothing was installed, no upstream call was made, no
account created, no terms accepted, nothing pushed or merged; the service ran
in fixture mode against a scratch database in the session's temp directory and
was stopped afterwards. `git status` shows changes only under
`incisor-trading/`.

**The queue is now three.** The index strip is next, then the quote panel,
then the chart.

### For Key

- **Nothing new.** The 600-line reading from yesterday and the `shoot.py` rate
  limit note both still stand as written; neither moved today.
- **The provider question is untouched** — the clock has never needed data and
  still does not.

## 2026-08-29 — Audit: the index summary strip (T6)
**Outcome:** shipped — verdict **minor edits**
**Changed:** `index.html`, `incisor.css`, `css/market.css`,
`tests/test_index_strip.py`, `tests/test_page.py`, all four shot sets
**Verified:** 94 page tests (up from 90), 123 service tests, `shoot.py` green at
1440, 768 and 390 across four states, plus a measured pass at 320px and a real
browser read of the accessibility tree in both the filled and degraded states.

The second audit under the §18 cadence. The index strip was the oldest surface
with no row in the log, so it was this session's work instead of T9.

**The defect was in the numbers, and no test could have caught it.** A tile
states two windows at once — one session in the coloured change, thirty days in
the line beneath it — and named only the second. The only period word on the
tile was the sparkline's `30d`, sitting directly under a red `−0.79%` that
covers a single day. Everything on that tile was correct and the reader had no
way to attach a period to the figure that mattered.

This is the same finding as 08-28, one step further on. Uncolouring the
sparkline stopped the tile contradicting itself; it did not give the surviving
coloured figure a window. The chart got that right at T8 — it says *Over six
months* above its own figure — and the tile it was modelled on never did.

Every change row now ends in `1d`, right-aligned so it lands directly above the
`30d` it pairs with. Set the same way, the two read as two scales; set
differently, one reads as a label and the other as noise. `1d` is `aria-hidden`
— read aloud it is "one d" — and an off-screen "over the last session" carries
it instead, so a screen reader gets `−5.85 −0.79% over the last session`. Both
leave the tree entirely when a tile has no figure to describe, which is what
stops a failed tile announcing "unavailable over the last session".

**On a phone it had stopped being a strip.** At `minmax(180px)` a 390px
viewport fitted exactly one column: 730px of grid holding four readings whose
entire purpose is being compared, and a reader could only ever see two. The
comparison is the feature, so the phone was the one place the feature did not
exist. `160px` pairs them — measured, not eyeballed: 358px of grid, two columns
of 173px, four tiles in 359px instead of 730, all four on one screen, and the
page 742px shorter overall. Tablet went from three across to four. At 320px it
falls back to one column, which is correct — two 160px tiles do not fit 288px.
No row inside a tile overflows at any of the four widths checked.

**It opened with a sentence addressed to the routine.** "Charts, movers and
fundamentals fill the rest of this panel across T8–T12" was printed to every
visitor, named internal task IDs, and had been wrong since the day T8 shipped.
Guide §6 forbids placeholder text in a committed file; this had survived three
sessions because nobody reads their own page's first paragraph. The Trade panel
had the identical defect (`T14–T18`) and was fixed with it. `test_page.py` now
greps the *visible text* of the page — comments exempted, since an internal
note is allowed to name the task it is about — so the next one fails a test
rather than shipping.

**The off-screen class stopped being a special case.** `.inc-clock-subject`
carried a comment saying it was the only thing on the page that needed
off-screen text. A second thing needed it, so it is `.inc-offscreen` now and
the clock reads it. This is the shape `DECISIONS.md` already records twice: a
rule stated as a count across the page expires the moment a second surface does
the same thing.

**The four questions.** *Useful:* yes, and it is the only surface that answers
a question without being asked one. *Easy:* zero actions to read, but see D3
below. *Beautiful:* it is the part of the page a screenshot would lead with,
and that is not faint praise — the numbers are the content and they are set
properly. *Performing:* four `/history` calls a day against a 22-call budget,
cached and shared across every visitor, reserved heights so filling shifts
nothing, and a stated "unavailable" rather than a blank grid with the service
down.

**The strongest finding was deliberately not acted on.** A tile shows a symbol
and cannot open it: a reader looking at SPY who wants SPY's chart retypes
`SPY` into a box 400px below on desktop and 900px below on a phone, while the
thing they are pointing at is already on screen. That is a real gap and it is
also not a touch-up — it needs an export from `view-symbol.js`, focus handling,
and a generic `data-track` so a button labelled with a ticker does not send
that ticker to the beacon (§5). Filed as **D3** rather than rushed into an
audit. **D4** was found in passing: `DB_PATH` in `config.env` is read before
the config file loads and is silently ignored — harmless today only because the
configured value equals the default.

**All four shot sets were refreshed,** since every one of them carries this
strip and every one was showing the unlabelled version. Same names, same
states, replaced rather than accumulated. `docs/shots/` is unchanged at 2.8MB.

Nothing was installed, no upstream call was made, no account created, no terms
accepted, nothing pushed or merged. The service ran in fixture mode against a
scratch database in the session's temp directory and was stopped afterwards.
`git status` shows changes only under `incisor-trading/`.

**The queue is now two.** The quote panel is next, then the chart.

### For Key

- **Flask was not installed anywhere on this machine**, so the service could
  not be started to shoot the strip with data in it. Installed into the
  gitignored `.devtools` venv, which hard rule 10 allows explicitly — it never
  ships to a visitor, costs nothing, and lives inside `incisor-trading/`.
  Nothing about `server/requirements.txt` changed.
- **The light-theme question is now closed rather than open.** It was recorded
  in the T8 journal entry, which is read from the tail and would have scrolled
  away; it is a `DECISIONS.md` row now. The site defines no light palette, a
  light palette for this page alone would mean writing into `/assets`, and
  `shoot.py --theme light` is identical to the dark run. Say if you read §13
  otherwise.
- **Nothing else new.** The provider question is untouched — the strip has
  always run on committed fixtures and still does. The 600-line reading and the
  `shoot.py` rate-limit note both stand as written.

## 2026-08-30 — Audit: symbol lookup and the quote detail panel (T7)
**Outcome:** shipped — verdict **minor edits**
**Changed:** `index.html`, `css/market.css`, `js/view-symbol.js`,
`tools/shoot.py`, `tests/test_symbol_lookup.py`, `tests/symbol_model.jxa.js`,
all four shot sets plus a new one
**Verified:** 99 page tests (up from 94), 168 checks in JavaScriptCore (up from
163), 123 service tests, `shoot.py` green at 1440, 768 and 390 across five
states, and a read of Chrome's own accessibility tree over the filled and the
not-found panel.

The third audit under the §18 cadence. The quote panel was the oldest surface
with no row in the log, so it was this session's work instead of T9.

**Three defects, and the same one underneath all of them:** the card knew
something and left the reader to work it out.

**The change named no window.** Four windows meet on this card — a session in
the coloured change, a session in the day band, a year in the band beside it,
six months in the chart below — and the largest coloured figure on the page
was the only one naming none of them. This is the T6 tile finding exactly, on
the surface that shipped the day before that rule existed, and it is now the
third session running in which the same defect has turned up somewhere new.
The card carries `1d` with "over the last session" spoken beside it.

Set inline rather than right-aligned, which is a departure from the tile and a
deliberate one. A tile pushes the token to the right of its row so it lands
directly above the `30d` and the two read as a pair; this card has nothing
beneath it to pair with, and `margin-left: auto` would have parked "1d" 900px
from the figure it names. `.inc-period` now sets how the token looks and each
surface sets where it goes — the seam `css/market.css` already runs on.

**The bands drew their own point and would not say it.** A low and a high are
two numbers the reader already has; where the price sits between them is the
whole reason the band was drawn, the marker that says it is `aria-hidden`
because it is a decoration, and nothing stood in for it. A screen reader got
"Day range, 731.63, 738.67" and none of the meaning. Each band ends in a
spoken sentence now — "Last price 733.40 sits 25% of the way up this range" —
rounded to whole percent, because the drawing is not precise to a decimal and
reading one would claim it was. It says nothing at all when the position is
unknown, rather than describing a band with no ends.

**The not-found message pointed at something that was not there.** It ended
"the search list above is all of them", which was true and useless: the lookup
that just failed closes that list, so the sentence sent the reader to an empty
strip of screen. It names the symbols now. The count in front of the list went
too — redundant beside the names, and a numeral inside prose reads as a figure
on a page where every other numeral is one.

**A fourth, found while checking the third.** A failed lookup states its reason
in the panel and nowhere else, and the panel was not a live region — so the
only thing ever announced was the advice underneath the field: "Try another
ticker or company name." with nothing to explain it. The message is
`role="status"`, and the loading line stopped appearing in both places at once,
which had put the same sentence on screen twice twenty pixels apart and would
now have read it out twice as well.

**The tool was failing the shot it had been asked to take.** Capturing the
not-found state means asking the service for a symbol it has no data for; it
answers 404, correctly, and Chrome logs every 404 as a console error — so the
one state proving the panel degrades well was the one state that could not be
captured on a green run. Forgiven narrowly: only the symbol the run asked for,
and only once the panel has settled in not-found for it. Checked the other way
by pointing `--api` at a closed port — a 502 for that same symbol still fails
the run, because the panel settles in `error` instead.

**The four questions.** *Useful:* yes, decisively — it is the only way to reach
a symbol that is not one of the four proxies, and the chart has no source
without it. *Easy:* three keystrokes and Enter, the combobox model is right,
and typing "apple" opens Apple. *Beautiful:* the numbers are set properly and
the card holds up beside the strip, which is the part of the page a screenshot
would lead with. *Performing:* two upstream calls per symbol against a 22-a-day
budget, issued together rather than in sequence so the panel spends the shorter
time loading, cached and shared across every visitor.

**The audit log was out of order.** Its header says newest last and both
existing rows were newest first. Fixed while adding the third, since a log that
contradicts its own stated order stops being skimmable in the way that made it
worth keeping.

**Five shot sets, four refreshed and one new.** Every existing set carries this
card and every one was showing a change with no window on it. `t8-not-found` is
new: the current sets had no not-found state in them, and it is the state this
audit changed most. Same names, replaced rather than accumulated; `docs/shots/`
is 3.2MB, up from 2.8MB for the added set.

**No backlog task was taken** — one audit per session is the whole of it (§18),
so T9 waits a day. Nothing was installed, no upstream call was made, no account
created, no terms accepted, nothing pushed or merged. The service ran in
fixture mode against a scratch database in the session's temp directory and was
stopped afterwards. `git status` shows changes only under `incisor-trading/`.

**The queue is now one:** the price chart.

### For Key

- **Nothing new.** The provider question is untouched — the panel has always
  run on committed fixtures and still does. The 600-line reading, the light
  theme decision and the `shoot.py` rate-limit note all stand as written.
- **D3 is still open and this audit did not close it**, deliberately — a tile
  still shows a symbol it cannot open. It needs an export from
  `view-symbol.js`, focus handling and a generic `data-track`, and doing that
  inside an audit is how it gets done badly. Second session it has been named.

## 2026-08-30 — Audit: the price chart (T8)
**Outcome:** shipped — verdict **minor edits**
**Changed:** `index.html`, `css/chart.css`, `js/view-price-chart.js`,
`js/chart-canvas.js` (new), `js/view-symbol.js`, `tools/shoot.py`,
`tests/test_price_chart.py`, `tests/test_page.py`, `tests/chart_model.jxa.js`,
all five shot sets plus a new one
**Verified:** 102 page tests (up from 99), 148 checks in JavaScriptCore (up
from 141), 123 service tests, `shoot.py` green at 1440, 768 and 390 across six
states, and four measurements taken in Chrome rather than reasoned about.

The fourth audit under the §18 cadence, and the last surface with no row in
the log. The queue is empty; the next entry joins it three sessions after it
ships.

**The card never said what it was a chart of.** The plot's `aria-label` has
named the symbol since the day it shipped — "SPY closing prices, over six
months…" — and nothing on screen ever did. It carries a price, a date, a
six-month change and the largest coloured figure on the page, and on a phone
the quote card that names the symbol is a scroll and a half above it. This is
the same defect as the range bands in the T7 audit with the channels swapped:
a fact stated in one place only, and that place the one some readers do not
have. The head reads `SPY proxy over six months` now. The badge is there
because the strip promises the ETFs "are labelled as proxies wherever they
appear", and whether a symbol tracks an index is known to the quote panel,
which passes it over with the series.

**A tap did nothing, and a drag threw its answer away.** Traced rather than
guessed, because the first attempt to prove it was wrong: coordinates from
`bounding_box()` are viewport-relative, the chart sits 4000px down the page,
and the tap landed on nothing. Scrolled into view, the trace is
`pointerdown → pointerup → pointerleave → click`, **with no `pointermove` at
all** — and `pointermove` was the only event the chart listened for. So the
one gesture a phone has read nothing. What did work, a finger dragged across
the plot, was undone by the lift: that arrives as a `pointerleave`, the
readout reverted to the last close, and it did so at the moment the reader
lifted their finger to look at it.

A `pointerdown` takes a reading now, and a touch pointer leaving keeps it —
right for a finger, where a mouse leaving still clears, because on a phone the
finger is over the picture and the readout is under it. A `pointercancel`
withdraws it, which is what separates a reading from the vertical scroll the
plot deliberately allows over itself. Confirmed all three ways through CDP
touch input: drag reads, lift keeps, swipe-to-scroll withdraws.

The hint said "Hover the chart, or focus it and use the left and right arrow
keys" — two things a phone does not have, and no mention of the one it does.
It says "Touch or hover" now.

**The worst-looking state was the one no screenshot held.** A quote that
arrives with no series behind it puts the chart in `unavailable`, and nobody
had ever looked at it. The plot becomes a flex box in every non-ready state
and the empty SVG stayed in flow as a 714px item beside the message, so the
centring the stylesheet asks for had nothing to centre: the sentence was a
209px column pinned to the left edge of a 969px dashed box. Above it the head
still named the last symbol's window — `blank()` cleared the drawing and left
the label — and beside that, five range buttons that still moved
`aria-pressed` and redrew nothing. All four fixed, and `shoot.py
--chart-no-history` means the state has a picture. It is the only state on the
page fixtures cannot produce: it needs `/quote` to answer and `/history` not
to, and the service either holds a symbol or does not.

**The view crossed 600 lines, so the drawing left.** 611, and the seam was
already written in the file's own header. `js/chart-canvas.js` appends every
node and decides nothing; `js/view-price-chart.js` decides everything and
appends none. 453 and 205. The runner drives the split pair exactly as it
drove the single file, which is what made the move safe to do inside an audit.
A new page test asserts every module in `js/` and `css/` is actually loaded —
`_shipped()` calls a file shipped because it is in the folder, so a module
added without a script tag would have been held to every house rule while
being dead code.

**Performing, measured.** Five range changes made **zero** upstream calls: the
series arrives once with the quote and every window is a slice of its tail. A
redraw takes 8–16ms. The 260-row fallback table builds in 25ms, and only when
it is opened. Against the 22-a-day budget the chart's marginal cost is zero,
which is the whole reason it draws the panel's series rather than asking for
its own.

**Looked at and left alone.** The end markers sit astride the plot border —
but the first and last sessions *are* the window's ends, the axis labels are
pinned to those same edges, and insetting them would put a gap where the
reader expects the window to start. The price axis lands six labels on 6M and
three on 1Y and 5Y, because a 605-to-785 band asks for a step of 30 and the
family's next size up is 50; 650, 700 and 750 is still a scale you read rather
than interpolate. Both are recorded where they would otherwise be "fixed": the
second in a comment beside `PRICE_TICKS`.

**No backlog task was taken** — one audit per session is the whole of it
(§18), so T9 waits a day. Nothing was installed, no upstream call was made, no
account created, no terms accepted, nothing pushed or merged. The service ran
in fixture mode against a scratch database in the session's temp directory and
was stopped afterwards. `git status` shows changes only under
`incisor-trading/`.

### For Key

- **Nothing new.** The provider question is untouched — the chart has always
  drawn committed fixtures and still does. The 600-line reading, the light
  theme decision and the `shoot.py` rate-limit note all stand as written.
- **D3 is still open**, and this is the third session it has been named: a
  tile shows a symbol and cannot open it. It is now the oldest unaddressed
  finding on the page, and with the audit queue empty it is the first thing a
  session could take that is not a numbered backlog task.

## 2026-08-30 — Attended: defects need a way to be reached
**Outcome:** shipped
**Changed:** `AGENT-GUIDE.md` (§14 step 4, new §19), `BACKLOG.md` (Discovered
header, D3 and D4 labelled)
**Verified:** 102 page tests green; section numbering contiguous 1–19.

The audit fix worked — all four surfaces audited, four real verdicts, and the
findings were ones tests and screenshots had both missed. But `## Discovered`
has the same defect the audit log had: it sits below every phase, so nothing in
it is reachable by working down the list. `D2` only got done because it was
actively blocking T8, and `D1` was done attended.

That is harmless for ideas and bad for bugs. **D4** — `DB_PATH` in `config.env`
ignored because `store` is imported before `load_env_file()` runs — would have
sat behind nineteen feature tasks, working by coincidence until the day the path
changed on deployment.

A `D` item is now labelled `[defect]` or `[enhancement]`. A defect is taken at
step 4 before any audit and before the next task, one per session. An
enhancement waits for Key. When the call is unclear, file it as a defect. D3
(a tile cannot open its symbol) is an enhancement; D4 is a defect, so it is what
the next session picks up.

**Note for the next session:** step 4 is now (a) defect, (b) due audit, (c) next
task. All four surfaces are audited, so the next session takes D4, then T9.

