# Incisor Trading — Agent Guide

**Status:** v2, updated 2026-08-27.
**This file is read-only for the routine.** Only Key edits it. If following it
requires changing it, that is a note for Key (§3), not an edit to make.

Read this file, then `BACKLOG.md`, then the tail of `PROGRESS.md`, at the start
of every session.

---

## 1. Mission

Build **Incisor Trading** at `/incisor-trading/` on frontendneeded.com: a single
page that (a) displays current US stock market information accurately and
beautifully, and (b) contains a zero-risk paper-trading game for learning how
markets work, with optional educational hints.

**Free to build, free to run, free to use — permanently.** Hidden behind
`noindex` and absent from the nav until Key promotes it. Built by one short
autonomous session per day.

### Name and identity

**Incisor Trading** — a play on "insider trading", and on the incisor as the
tooth that bites in first. The theme is eating, consuming, growing, sharpening:
you get better at trading by chewing through real market data with nothing at
risk.

The pun is doing real work, so let it inform the identity rather than sitting in
the title alone — bite, cut, sharpness, appetite, growth. Do not lean on the
gag so hard that the page reads as being *about* insider trading; the joke is the
name, the substance is education. Every surface stays unambiguous that this is a
learning tool with no real money and no privileged information.

### Non-goals — do not build these, do not ask to build these

- Options, futures, forex, crypto, bonds, mutual funds. **US-listed equities and
  ETFs only.**
- Level 2 / order book / time-and-sales.
- News feeds, news sentiment scoring, social sentiment, analyst price targets.
- Short selling, margin, leverage, or any derivative position in the game.
- Real money, prizes, entry fees, ads, paywalls, or anything of monetary value.
- Multi-page expansion. This is one route with modes, not a section of the site.
- Anything that renders a personalized recommendation to buy or sell. See §11.

### Decisions already locked (do not relitigate)

| Decision | Answer |
|---|---|
| Cost | **Free on every end.** See §4. |
| Data budget | **Free tiers only.** Delayed or end-of-day quotes, clearly labeled. |
| Accounts | **None.** Portfolio state lives in `localStorage`. No login, no email, no PII. |
| Build order | **Dashboard first**, then live paper-trading sim, then historical replay, then hints. |
| Hints | **Explanatory, never directive.** See §11. |
| Aesthetics | **First-class.** Beautiful and smooth is a requirement, not a polish phase. See §13. |

---

## 2. Hard rules

Absolute. Violating one is worse than shipping nothing that day.

1. **Only touch files under `/incisor-trading/`.** Everything else in this repo is
   off-limits — `index.html`, `assets/`, `sitemap.xml`, `robots.txt`, the root
   `.htaccess`, and every other page folder. `git status` at the end of a session
   must show changes only under `incisor-trading/`.
2. **Never add the page to navigation, the sitemap, or robots.txt.** Key does
   that once, manually, at promotion time.
3. **`/incisor-trading/index.html` keeps `<meta name="robots" content="noindex,nofollow">`**
   until promotion. Do not remove it.
4. **Never commit to `main`, never merge to `main`, never push, never deploy.**
   Work lives on branches (§7). Merging and deploying are Key's, not because they
   need his sign-off but because they are not the routine's to do — `main` is what
   gets pulled onto the live server.
5. **Never touch the server.** No SSH, no `systemctl`, no `git pull` on the box.
   Write deploy artifacts as files; Key installs them.
6. **Never commit a secret.** API keys live only in `config.env.example` as
   `REPLACE_ME` placeholders. If a real key appears anywhere, stop and note it.
7. **Nothing that costs money** — see §4. This includes free trials that convert
   to paid, and anything requiring a credit card to register.
8. **One task at a time, up to the session cap.** The routine's instructions set
   how many backlog tasks a session may complete. Fully finish, verify, and
   commit one before starting the next — never leave two half-built. If the cap
   is reached mid-task, finish that task, commit, and stop.
9. **Never exceed a documented free-tier rate limit.** Development runs on
   fixtures (§10), not live quota.
10. **No new runtime dependencies.** Vanilla HTML/CSS/JS on the front end;
    Flask + stdlib + `requests` on the back end. No npm, no build step, no
    bundler, no CSS or chart library. Hand-roll the SVG. **Local dev tooling is
    different and is allowed** — anything that never ships to a visitor, is
    free, installs only inside `incisor-trading/` and is gitignored. The
    `.devtools` venv holding Playwright is the example. Shipped bytes are
    governed by this rule; the workbench is not.
11. **Never touch Key's uncommitted work.** If the working tree is dirty at the
    start of a session with changes outside `incisor-trading/`, stop immediately.
    Do not stash, commit, check out over, or clean anything. Write a one-line
    `PROGRESS.md` entry saying the tree was busy and end the session. A skipped
    day costs nothing; losing his work costs a lot.
12. **Two strikes and the task is blocked.** If a backlog task has already been
    attempted in two sessions without completing, do not attempt it a third time.
    Mark it `[!]` with the reason, record the failed approaches in
    `DECISIONS.md`, and take the next task.

---

## 3. Autonomy and bounds

**The routine never needs approval and never asks for it.** Inside the bounds
below, decide and proceed. Do not pause for confirmation, do not hedge a choice
in `PROGRESS.md` hoping Key will weigh in, do not open a question that is really
a request for permission. Make the call, write down why, keep going.

### Out of bounds — not decisions the routine makes

These are not "ask first" items. They are simply not the routine's to decide or
to do, ever. It does not act on them and it does not request permission to.

- Anything touching a file outside `/incisor-trading/`.
- Committing to, merging to, or pushing `main`; pushing any branch.
- Anything that reaches the server — SSH, `systemctl`, deploying, installing.
- Anything that costs money, now or later.
- Creating an account, signing up for a service, or accepting terms of service.
- Putting user data anywhere other than the user's own browser.
- Publishing the page: nav, sitemap, robots.txt, or removing `noindex`.
- The legal wording of disclaimers beyond what §11 already specifies.
- Changing this guide, the locked decisions, or the non-goals.

### When work meets a boundary

Do not stall, and do not wait. Write a short entry under `PROGRESS.md → For Key`
saying what was reached, what the routine recommends, and what it did instead.
Then carry on with work that is in bounds — there is always in-bounds work, and
the fixture layer (§10) exists precisely so that no external dependency can block
a session.

`For Key` is a notes shelf, not a queue the routine is blocked on. Never re-raise
the same item, and never treat an unanswered note as a reason to skip a session.

### In bounds — no approval needed, ever

Everything else. Explicitly including: creating branches, trying an approach and
abandoning it, restructuring files under `/incisor-trading/`, choosing the
layout, the palette, the type, the interaction model, the schema, the module
boundaries, and the wording of everything except the disclaimers. Taste and
engineering judgment are the routine's to exercise.

Security is not a gate to ask about — it is a standard to meet. Meet §5, or don't
build the thing that can't meet it.

## 4. Cost — free on every end

Free for Key to build and run, free for every visitor, with no path to a bill.

**Development and operation:**
- Market data: free tiers only. No paid plans, no trials that convert, nothing
  needing a card on file.
- Hosting: the existing Fedora box and Apache. No cloud services, no CDN, no
  managed database, no serverless anything.
- Storage: SQLite on local disk. No hosted DB.
- Inference: local Ollama, already running. **No hosted LLM API calls, ever** —
  they cost money and would send user data off the box.
- Fonts, icons, images: self-hosted in `assets/` or drawn inline as SVG. No
  Google Fonts, no icon CDN, no stock photo licensing.
- Tooling: stdlib and what is already installed. Tests use Python's `unittest`.
- No paid monitoring, error tracking, or analytics. The existing first-party
  beacon is the only telemetry.

**For the user:**
- No account, no email, no payment, no subscription, no paywall, no "pro" tier.
- No ads, no affiliate links, no sponsored tickers, no referral codes to brokers.
- No third-party trackers, no external script tags, no embedded widgets.

If a feature can only be built by spending money, it is out of scope. Note it
with the cost stated and build something else.

---

## 5. Security

Proportionate, not paranoid — but genuinely thought through. This page has no
accounts and no PII, which removes most of the risk; the remaining surface is the
public API endpoint, the data we render, and what leaves the user's browser.

**Server (`incisor-trading/server/`):**
- Model it on `preside-by-side/server/`, which already implements origin checking,
  per-IP and global rate limiting, HMAC-hashed IPs, and hardened systemd settings.
  Read it before writing anything.
- Bind to `127.0.0.1` only. Apache is the only thing that talks to it.
- Validate and whitelist every input at the edge. Ticker symbols match
  `^[A-Z][A-Z.\-]{0,9}$` and nothing else reaches a query or an upstream URL.
- **Parameterized SQL only.** No string interpolation into queries, ever.
- Rate limit every endpoint — per-IP and global. Upstream quota is a shared,
  exhaustible resource; treat exhausting it as a denial-of-service outcome and
  degrade gracefully rather than failing open.
- Never echo an upstream error body to the client; log it, return a generic message.
- Set `X-Content-Type-Options: nosniff` and a restrictive `Content-Security-Policy`
  on the page. No inline event handlers, no `eval`, no remote origins.
- The API key lives in `/etc/incisor-trading/config.env`, root-owned, mode 640, never in
  the repo, never in a response, never in a log line.
- systemd hardening: `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`,
  `PrivateTmp`, with `ReadWritePaths` limited to the DB directory.
- Apache must deny `incisor-trading/server/` and `incisor-trading/docs/` so source and notes are
  never served.

**Client:**
- **Never `innerHTML` with data that came from the network or from storage.**
  Use `textContent` and `createElement`. Ticker symbols and company names are
  attacker-influenced strings.
- Treat `localStorage` contents as untrusted on read: validate the shape, and
  reset cleanly with a visible notice if it fails. Wrap every access in
  `try/catch` — private windows and blocked site data throw.
- Nothing sensitive in URLs or query strings.
- **Telemetry hygiene:** `assets/js/beacon.js` reports clicked button and link
  labels. Give every market control an explicit `data-track` label that is
  generic — `"order-submit"`, not `"Buy 10 AAPL"`. No ticker, quantity, or
  dollar amount may reach the beacon. A user's watchlist and trades stay in
  their browser.
- No user content is ever shared between visitors, so there is no stored-XSS
  vector by design. Keep it that way — if a feature would introduce one, drop it.

**Ollama layer (Phase 4):**
- Local only, never a hosted API. Never send portfolio contents or anything
  user-authored to the model — only the computed, numeric facts from the signal
  engine. Treat model output as untrusted text: validate it, render it as text,
  and fall back to templates if it fails the checks in §11.

---

## 6. Code quality

Professional, clean, readable, simple — always, not as a cleanup pass.

- **Simple beats clever.** If a reviewer needs to pause, rewrite it. There is no
  performance problem here that justifies a dense solution.
- Small, single-purpose functions with honest names. No abbreviations that aren't
  already domain-standard.
- Match the existing FEN idiom: IIFE modules and `'use strict'` on the front end,
  the docstring-and-constants style of `suggest.py` on the back end. Read the
  neighbouring file before writing a new one.
- Comment *why*, never *what*. `suggest.py` and `beacon.js` set the density to
  aim for — a short header block explaining the module's job and its contract,
  then comments only where the reasoning isn't obvious from the code.
- Handle the error case explicitly. Every fetch has a failure path, every parse
  has a malformed-input path, and both render something a human understands.
- No dead code, no commented-out blocks, no `TODO` without a matching backlog
  entry, no placeholder text left in a committed file.
- Consistent formatting: 4-space indent in Python, 4-space in JS, single quotes
  in JS to match `beacon.js`, lines under 100 characters.
- Pure logic (the signal engine, P/L math, the market clock) gets `unittest`
  coverage. UI gets verified in the browser and screenshotted.
- If a file passes ~600 lines, split it along a real seam.

---

## 7. Git — commits and branches

### Commit messages

Every commit made by the routine starts with `C:` so its origin is obvious in the
log. Subject line under 72 characters, lowercase after the prefix, descriptive
rather than terse, with the task ID in parentheses. Body wrapped at 72 columns,
explaining *why* when it isn't self-evident.

```
C: add the index summary strip to the market dashboard (T6)

Renders SPY, QQQ, DIA and IWM as ETF proxies rather than index levels,
since free-tier data does not include the indices themselves. Each tile
is labeled as a proxy so the distinction is visible to the reader.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

No `feat:`/`fix:` prefixes — the repo doesn't use them. One logical change per
commit; if the subject needs "and", it is probably two commits.

### Branches

Create branches freely and often. An experiment on a branch affects nothing
until Key merges it, so there is no reason to hesitate over one.

| Prefix | For | Example |
|---|---|---|
| `incisor-dev` | the main line of backlog work | — |
| `incisor-look/<name>` | a distinct visual direction (§13) | `incisor-look/terminal` |
| `incisor-try/<name>` | an experiment, spike, or alternative approach | `incisor-try/canvas-chart` |

Branch from `incisor-dev` unless the experiment needs a clean base. An abandoned
experiment is a fine outcome — record what was learned in `PROGRESS.md` and leave
the branch in place rather than deleting it.

Branches stay local unless Key asks for them to be pushed.

---

## 8. Aesthetic branches — the review shelf

Aesthetics are a first-class goal, and taste is Key's call, not the routine's.
So build genuine alternatives and leave them somewhere obvious.

- A distinct visual direction gets its own `incisor-look/<name>` branch.
- **Every such branch must be registered in `docs/DESIGN-BRANCHES.md`** — that
  file is the index Key browses. An unregistered branch does not exist.
- Each entry records: branch name, one-line concept, what is different about it,
  screenshots at desktop and mobile width, the date, and the exact command to
  preview it.
- Screenshots go in `incisor-trading/docs/shots/<branch>/`, PNG, reasonably compressed.
  Keep them small — this repo is served from a home connection.
- A look branch must be **complete enough to judge**: the dashboard rendering real
  fixture data, not a colour swatch. If it can't be screenshotted, it isn't ready
  to register.
- Directions should actually differ. Three variations on the same layout with
  different accent colours are one direction, not three.
- Never merge a look branch into `incisor-dev`. Key picks, then says so.

---

## 9. Architecture

Follow the shape of `preside-by-side/server/` — it already solves origin checking,
rate limiting, hashed IPs, SQLite setup, config loading, and systemd hardening.

```
incisor-trading/
  index.html          the whole page — dashboard + game modes as tabs
  incisor.css          page styles; builds on the shared base
  incisor.js           app shell, mode routing
  js/                 split modules once incisor.js outgrows one file
  server/
    incisor.py         Flask app
    requirements.txt  flask, gunicorn, requests  (nothing else)
    config.env.example
    incisor-trading.service    systemd unit, modeled on preside-by-side-suggest.service
    apache-snippet.conf
    fixtures/         golden JSON captured from the provider
    tests/            unittest, stdlib only
  docs/               guide, decisions, backlog, progress, design branches
                      (deny-all .htaccess — never served)
    shots/            screenshots for the design review shelf
```

- Front end: vanilla JS, no framework, no build step.
- Back end: Flask under gunicorn on `127.0.0.1:8789`, SQLite at
  `/var/lib/incisor-trading/incisor.db`.
- Apache reverse-proxies `/api/incisor/*`.
- **The browser never talks to the data provider.** All upstream calls go through
  our service, so one fetch serves every visitor and the key stays server-side.

---

## 10. Data, licensing, and fixtures

- Before any live data is wired up, `docs/DATA-PROVIDER.md` must record, for the
  chosen provider: free-tier rate limit, whether the terms permit **public
  display on a website**, the required attribution string, and the data delay.
- If public display isn't clearly permitted, **note it for Key and keep building
  on fixtures.** Never wire live data on an unclear licence.
- Every price carries a visible delay label — on the page, not in a tooltip.
- Provider attribution in the footer, worded as the provider requires.
- Cache server-side and aggressively. A refresh must not cause an upstream call.
  Quotes cache to the delay interval, fundamentals for a day, historical series
  indefinitely.
- Free tiers usually cannot serve index levels. Use liquid ETF proxies
  (SPY, QQQ, DIA, IWM) and **label them as proxies**.
- `INCISOR_DATA_SOURCE` is `fixture` (default) or `live`. `server/fixtures/` holds
  real captured JSON with the capture date in the filename, committed to the repo.
  Sessions work in fixture mode; live mode is exercised rarely and deliberately,
  and the call is logged in `PROGRESS.md`.
- Log upstream call counts so quota usage stays inspectable.

---

## 11. Hints — explanatory, never directive

The hint system teaches; it does not advise. A hint may never tell a user what to
do. This is a legal boundary and also the better product.

**Forbidden output:** "Buy X." "Now is a good time to sell." "X is undervalued."
"X will likely rise." Any prediction, recommendation, or statement about what the
user should do with a specific security.

**Required shape:** a computed, sourced observation, what named strategies make of
it, and the counter-case.

> AAPL is trading 12% below its 200-day moving average, and its 14-day RSI is 28.
> A mean-reversion approach treats readings under 30 as stretched to the downside.
> A trend-following approach reads the same chart as a confirmed downtrend and
> stays out. They disagree — that disagreement is the lesson.

**Build order matters:**
1. A **deterministic** Python signal engine computes the facts (RSI, distance from
   moving averages, 52-week position, P/E vs. sector median, days to earnings).
   These are the only numbers a hint may contain.
2. A rules layer maps facts to strategy framings and always emits at least two
   that disagree.
3. *Optionally*, local Ollama rewrites the templated text more readably, given
   only those numbers, forbidden from producing new figures, tickers, or
   directional language. Output is re-checked against a forbidden-phrase list;
   any violation, or a timeout, falls back to the template.

Every hint surface carries: *"Educational only. Not investment advice. Delayed
data. No real money is involved."*

---

## 12. Game rules (paper trading)

- $100,000 fake starting balance, resettable at any time.
- Long positions only. No shorting, margin, leverage, or options.
- Whole shares only, at first.
- **Forward fill:** an order fills at the *next* price the server fetches after
  submission — never the price shown when the user clicked. This is what stops
  delayed data from being free money.
- Orders outside market hours queue to the next open. The market clock is
  authoritative and handles weekends and US market holidays.
- Apply stock splits to held positions. Dividends optional, later.
- No leaderboard, no monetary framing, no competition. Compare the user against a
  buy-and-hold benchmark instead.

---

## 13. Design and aesthetics

This page should be genuinely beautiful and feel smooth. Treat that as a
requirement on every task, not a phase at the end.

- Build on `assets/css/styles.css` and FEN's existing typography (DM Sans,
  Playfair Display) and spacing. The page belongs to the site; it should not look
  like a bolted-on trading terminal.
- **Numbers are the content.** Tabular figures, consistent decimal places, aligned
  columns, sensible abbreviation of large values. Sloppy number formatting reads
  as inaccurate data.
- Motion is purposeful and short. Value changes ease rather than snap; nothing
  bounces, nothing flashes, nothing moves without a reason. Respect
  `prefers-reduced-motion` completely.
- No layout shift. Reserve space for values that haven't loaded; skeletons, not
  jumps. Loading, empty, and error states are designed, not defaults.
- Green/red **must not be the only signal** — pair with arrows or explicit signs so
  it survives colour blindness and grayscale.
- Mobile first. Wide tables scroll inside their own container; the body never
  scrolls horizontally.
- Keyboard accessible throughout: real `<button>`s, real labels, visible focus
  rings, logical tab order.
- Light and dark both fully designed, neither an afterthought.

---

## 14. Session protocol

1. Check the working tree. If it is dirty outside `incisor-trading/`, stop —
   hard rule 11.
2. Read, in this order: `AGENT-GUIDE.md`, **`DECISIONS.md` in full**, `BACKLOG.md`,
   and the last few `PROGRESS.md` entries. Then `git log --oneline -20` and
   `git branch --list 'incisor-*'` for the trajectory.
3. `git checkout incisor-dev` (create it from `main` if absent).
4. Take the **topmost unblocked, unchecked** task in `BACKLOG.md`. Don't skip
   ahead to something more interesting. If the top task is blocked, note why and
   take the next one. If it has already failed twice, mark it `[!]` and move on.
5. Before building, check `DECISIONS.md` for a dead end covering the approach you
   are about to take. If one is listed, take a different approach.
6. Build it, in fixture mode, inside `/incisor-trading/`.
7. Verify against the task's acceptance criteria (§15). Unverified is not done.
8. Commit per §7.
9. Check the task off in `BACKLOG.md`, append to `PROGRESS.md`, add any `For Key`
   notes, register any new look branch in `DESIGN-BRANCHES.md`, and **add a
   `DECISIONS.md` entry for anything chosen or abandoned** (§16).
10. If the session cap has not been reached, return to step 4 for the next task.
    Otherwise **stop.**

A session that makes no progress still writes a `PROGRESS.md` entry saying so and
why. A clear "blocked, here's the reason" is a successful session.

---

## 15. Verification

- **`./.devtools/bin/python tools/shoot.py --out docs/shots/<name>`** is the
  primary visual check and works unattended. It serves the repo itself, drives
  the installed Chrome through Playwright at desktop, tablet and true
  mobile-emulated widths, writes screenshots, and **exits non-zero on a console
  error or any horizontal overflow**. Run it after any change that touches
  markup or CSS, and look at the images it produces — a green exit means nothing
  is broken, not that the page looks good.
- For an attended session, the `fen` launch config also serves
  `http://localhost:8765/incisor-trading/`.
- Add a `incisor-api` launch config once the service exists.
- Check the browser console for errors, check at 375px, and check **with the API
  service stopped** — the dashboard must degrade to a clear "market data
  unavailable" state, never a blank page or an endless spinner.
- Run `unittest` for any pure logic touched.
- Screenshot anything visual and reference it in the progress entry.
- Confirm `git status` shows changes only under `incisor-trading/`.

---

## 16. Memory — how not to repeat yourself

Four files, four jobs. Confusing them is how a routine ends up rebuilding
something it already rejected.

| File | Holds | Read |
|---|---|---|
| `AGENT-GUIDE.md` | Stable rules. Changes rarely, and only by Key. | In full, every session |
| `DECISIONS.md` | Settled calls and dead ends. The long-term memory. | **In full, every session** |
| `BACKLOG.md` | What is left to do, in order. | In full, every session |
| `PROGRESS.md` | Dated journal of what happened. Grows forever. | Last few entries only |

`PROGRESS.md` is a journal, not memory. It is read from the tail, so anything
recorded there and nowhere else becomes invisible within a few weeks. **If a
lesson needs to survive, it goes in `DECISIONS.md`.**

### Git history is evidence, not memory

Start each session with `git log --oneline -20` and `git branch --list 'incisor-*'`.
That is cheap and shows the trajectory. But git records only what was kept —
an abandoned experiment leaves an `incisor-try/*` branch with no explanation, and
an idea rejected during a session leaves nothing at all. Git tells you *what*
happened; `DECISIONS.md` tells you *why*, and *why not*.

This is why the `C:` prefix and the task ID in every subject line matter: they
make the log skimmable enough to be worth reading at the top of every session.

### The inclusion test

Before adding to `DECISIONS.md`, ask: **could a future session reverse or redo
this without knowing?** Only then does it belong here.

- **Yes — record it.** A licensing finding. An approach that failed. A palette
  choice. A deliberate divergence from how the rest of the site works, which
  would otherwise read as an oversight and get "fixed".
- **No — put it in a comment next to the code.** Why the systemd unit pins one
  worker, why `/health` is not proxied, why an origin check varies by method.
  The person who needs that reason is reading that file, and a comment cannot
  drift away from what it explains. Writing it here instead makes the memory
  longer and the code poorer.

The test is not "is this interesting". Most good engineering reasoning belongs
in the code it explains.

### Write the entry before you forget

Add to `DECISIONS.md` in the same session as the work, never "next time". An
undocumented dead end is indistinguishable from an untried idea, and will be
tried again.

### Signs you are in a loop — stop and check

- The task you picked looks untouched but feels familiar.
- You are about to write a file that already exists on another branch.
- A third session in a row has ended without checking a box.
- You find yourself reasoning toward an approach that `DECISIONS.md` lists.

In any of these cases: stop, read `DECISIONS.md` and `git log` properly, and if
the work really has been attempted before, mark the task `[!]` and move on.

### Keep the memory readable

`DECISIONS.md` earns its value by being short enough to read in full every time.
If it grows past roughly two screens, spend a session consolidating: merge
duplicates, delete nothing, and promote anything that has bitten twice into
*Recurring traps*.

Screenshots in `docs/shots/` are the other thing that grows without bound. Keep
one set per registered look branch, replace rather than accumulate, and delete
the folder when a direction moves to *Retired* in `DESIGN-BRANCHES.md`.

---

## 17. The work is never done

**Finishing the backlog is not finishing the project.** `BACKLOG.md` is where
this starts, not where it stops. When Phase 5 is complete the routine keeps
running, and its job changes from *building the plan* to *making the page
better than the plan imagined*.

Treat a completed backlog as a beginning. Nobody has to hand you the next idea.

### What ongoing work means

- **Research.** Go and look at what is new — web platform features that have
  landed, visualization and interaction techniques, how the best financial
  interfaces present density and change over time, what teaching tools do to
  make an idea click. Bring findings back and record them in `DECISIONS.md`
  whether or not you act on them.
- **Aesthetics, continuously.** The look is never settled. New directions on
  `incisor-look/*` branches are always a legitimate use of a session, at any
  point, forever — not only at T13b. Chase the version that is genuinely
  beautiful, not the one that is merely finished.
- **Major revamps are in scope.** If the page would be better rebuilt around a
  different structure, interaction model or visual language, build it on a
  branch and register it. A revamp affects nothing until Key merges it, so a
  bold one costs nothing to try and there is no reason to hold back.
- **Depth.** Take something that works and make it excellent — a chart that
  reads better, an explanation that actually teaches, an empty state worth
  seeing, a transition that makes a change legible.
- **Maintenance.** Refresh fixtures, re-check provider terms, tighten tests,
  simplify what has grown awkward, re-walk the security surface.

### The bar

Change must make the page **measurably better** — clearer, faster, more
beautiful, more accurate, or more educational. Say which in the commit message.
Churn for its own sake is worse than a quiet session, and "I could not find
anything worth improving today" is a legitimate outcome to write down.

Everything else still holds: the same bounds (§3), the same security standard
(§5), the same cost rules (§4), the same branch and commit conventions (§7).
Ambition is unlimited inside those; the bounds do not loosen because the backlog
is empty.

---

## 18. Auditing what already works

Shipping a feature settles nothing. Everything built early was judged against
the standard that existed then, and the standard keeps moving — so the page
needs someone to go back and ask, honestly, whether each part of it is still
good enough. That someone is the routine, and nobody has to ask it to.

This is not the same as fixing bugs. A feature can pass every test, have no
defects, and still be the wrong feature.

### The four questions

Audit **one feature at a time**, and answer all four in writing. Vague praise is
not an answer; each one wants a specific observation.

1. **Useful.** Does this answer a question a visitor actually has? If it
   vanished tomorrow, would anyone notice? Is it teaching something, or is it
   here because dashboards usually have one?
2. **Easy.** Can someone use it without being told how? How many actions does
   the common case take? Does it work by keyboard, on a phone, at 375px, for
   someone who cannot distinguish red from green?
3. **Beautiful.** Does it hold up next to the best part of the page, or is it
   the part you would crop out of a screenshot? Look at the actual images from
   `tools/shoot.py` — do not audit a feature from its source code.
4. **Performing.** How fast does it become useful? Does it block anything else
   rendering? What does it cost in upstream calls against a 25-a-day budget?

### The four verdicts

Every audit ends in exactly one, recorded in the audit log at the bottom of
`BACKLOG.md` so the same feature is not audited again next week:

- **Keep.** It is good. Say why, note the date, move on. This is a real and
  common outcome — an audit that changes nothing is not a wasted session.
- **Minor edits.** It is the right feature, imperfectly done. Fix it in place on
  `incisor-dev`. Same rigour as any task: state what was wrong, change it,
  re-run the suites and `shoot.py`, record what improved. Small does not mean
  unverified.
- **Challenge it.** The idea itself may be wrong and you can name something
  better. Build the replacement — see below.
- **Retire it.** It is not useful. Remove it. A feature that fails question one
  should be deleted, not improved; improving it only makes the page longer. Note
  what was removed and why, because deletion is the change most likely to be
  quietly undone later.

### Challenging a feature — the protocol

When you think a fundamentally different approach would be better, prove it.

1. **Write down the criteria first.** Before building anything, state in the
   `incisor-try/*` branch's first commit what would make the challenger better,
   and how you will tell. Deciding the criteria *after* seeing both results is
   how you talk yourself into whichever one you enjoyed building — and you will
   have built both, so that bias is real and it is yours.
2. **Build it on `incisor-try/<feature>-<approach>`,** branched from
   `incisor-dev`.
3. **Finish it.** This is the part that matters. Compare finished to finished —
   an unfinished challenger always loses, for reasons that have nothing to do
   with whether the idea was better. Finished means it meets the same acceptance
   criteria the incumbent meets, passes the same suites, has its own
   `shoot.py` screenshots, and handles the same empty, loading and error states.
   A challenger that cannot be finished is itself a finding: record why.
4. **Compare on the stated criteria, with evidence.** Screenshots of both side
   by side, numbers wherever numbers exist. Answer the four questions for the
   challenger exactly as you did for the incumbent.
5. **Decide, and record the decision in `DECISIONS.md`** with the reasoning. The
   loser becomes a dead end entry, so nobody rebuilds it in six weeks.
6. **If the challenger wins,** merge it into `incisor-dev` and delete nothing —
   leave the branch in place as the record.

**Who decides.** A comparison about function, usability or performance is the
routine's own call under §3 — decide it and write down why. A comparison that is
purely about *how the page looks overall* stays Key's: register it in
`DESIGN-BRANCHES.md` as an `incisor-look/*` direction and leave it for him.
When a challenge is both — a new interaction model that also looks different —
decide the functional half, and register the visual half for Key.

### Cadence

- Audit a feature no sooner than a few sessions after it ships, so there is
  something to judge, and no later than the end of the phase it belongs to.
- Once the backlog is done, work through the page a feature at a time,
  continuously, oldest audit first. The audit log makes that order obvious.
- Re-audit anything a major revamp touches, regardless of when it was last done.
