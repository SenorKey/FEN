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
- **N3 — A scheduled session has no browser (from T1, 2026-08-27).** The dev
  server cannot be started when nobody is present to approve it, and there is no
  node on the machine, so every *visual* acceptance criterion in guide §15 —
  renders, clean console, 375px, "looks like FEN" — is unreachable on a routine
  run. The routine's answer was to build a headless test suite under
  `incisor-trading/tests/` and split the eyes-on half out as backlog task **D1**,
  so nothing is silently claimed as verified. *If Key wants the routine to close
  that gap itself,* the options are an attended session, leaving `python3 -m
  http.server 8765` running, or installing a headless browser — his call, and
  the work continues either way.
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

