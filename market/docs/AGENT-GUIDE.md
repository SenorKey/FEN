# Market — Agent Guide

**Status:** v2, updated 2026-08-27.
**This file is read-only for the routine.** Only Key edits it. If following it
requires changing it, that is a question to park, not an edit to make.

Read this file, then `BACKLOG.md`, then the tail of `PROGRESS.md`, at the start
of every session.

---

## 1. Mission

Build `/market/` on frontendneeded.com: a single page that (a) displays current
US stock market information accurately and beautifully, and (b) contains a
zero-risk paper-trading game for learning how markets work, with optional
educational hints.

**Free to build, free to run, free to use — permanently.** Hidden behind
`noindex` and absent from the nav until Key promotes it. Built by one short
autonomous session per day.

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

1. **Only touch files under `/market/`.** Everything else in this repo is
   off-limits — `index.html`, `assets/`, `sitemap.xml`, `robots.txt`, the root
   `.htaccess`, and every other page folder. `git status` at the end of a session
   must show changes only under `market/`.
2. **Never add the page to navigation, the sitemap, or robots.txt.** Key does
   that once, manually, at promotion time.
3. **`/market/index.html` keeps `<meta name="robots" content="noindex,nofollow">`**
   until promotion. Do not remove it.
4. **Never commit to `main`, never merge to `main`, never push, never deploy.**
   Work lives on branches (§7). Key merges and deploys. This is the one remaining
   approval gate and it exists because `main` is what gets pulled onto the live
   server.
5. **Never touch the server.** No SSH, no `systemctl`, no `git pull` on the box.
   Write deploy artifacts as files; Key installs them.
6. **Never commit a secret.** API keys live only in `config.env.example` as
   `REPLACE_ME` placeholders. If a real key appears anywhere, stop and park it.
7. **Nothing that costs money** — see §4. This includes free trials that convert
   to paid, and anything requiring a credit card to register.
8. **One backlog task per session.** Finish it, or leave it clearly unfinished
   with a note. Do not start a second task because the first went quickly.
9. **Never exceed a documented free-tier rate limit.** Development runs on
   fixtures (§10), not live quota.
10. **No new runtime dependencies.** Vanilla HTML/CSS/JS on the front end;
    Flask + stdlib + `requests` on the back end. No npm, no build step, no
    bundler, no CSS or chart library. Hand-roll the SVG.

---

## 3. Autonomy — decide alone, or park?

**Default is: decide alone and proceed.** If no other page is affected and the
security implications are genuinely thought through, do not wait for approval.
Build it, document it, move on.

**Park it in `PROGRESS.md → Open questions`** only when the work would:

- Touch anything outside `/market/`, or change `main`, or reach the server.
- Require an account, a signup, or accepting terms of service — those are Key's
  to accept, under his name and email.
- Cost money, now or later.
- Put user data anywhere other than the user's own browser.
- Introduce a security tradeoff you cannot resolve cleanly on your own.
- Change this guide, the locked decisions, or the non-goals.
- Involve the legal wording of disclaimers.

Park with a recommendation attached. "I suggest X because Y — confirm?" is worth
far more than an open question. Then take the next unblocked task; a parked
question never stalls a session.

---

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

If a feature can only be built by spending money, it is out of scope. Park it
with the cost stated and build something else.

---

## 5. Security

Proportionate, not paranoid — but genuinely thought through. This page has no
accounts and no PII, which removes most of the risk; the remaining surface is the
public API endpoint, the data we render, and what leaves the user's browser.

**Server (`market/server/`):**
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
- The API key lives in `/etc/market/config.env`, root-owned, mode 640, never in
  the repo, never in a response, never in a log line.
- systemd hardening: `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`,
  `PrivateTmp`, with `ReadWritePaths` limited to the DB directory.
- Apache must deny `market/server/` and `market/docs/` so source and notes are
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
  vector by design. Keep it that way — if a feature would introduce one, park it.

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

Create branches freely. Trying an idea on a branch needs no approval — it affects
nothing until Key merges it.

| Prefix | For | Example |
|---|---|---|
| `market-dev` | the main line of backlog work | — |
| `market-look/<name>` | a distinct visual direction (§13) | `market-look/terminal` |
| `market-try/<name>` | an experiment, spike, or alternative approach | `market-try/canvas-chart` |

Branch from `market-dev` unless the experiment needs a clean base. An abandoned
experiment is a fine outcome — record what was learned in `PROGRESS.md` and leave
the branch in place rather than deleting it.

Branches stay local unless Key asks for them to be pushed.

---

## 8. Aesthetic branches — the review shelf

Aesthetics are a first-class goal, and taste is Key's call, not the routine's.
So build genuine alternatives and leave them somewhere obvious.

- A distinct visual direction gets its own `market-look/<name>` branch.
- **Every such branch must be registered in `docs/DESIGN-BRANCHES.md`** — that
  file is the index Key browses. An unregistered branch does not exist.
- Each entry records: branch name, one-line concept, what is different about it,
  screenshots at desktop and mobile width, the date, and the exact command to
  preview it.
- Screenshots go in `market/docs/shots/<branch>/`, PNG, reasonably compressed.
  Keep them small — this repo is served from a home connection.
- A look branch must be **complete enough to judge**: the dashboard rendering real
  fixture data, not a colour swatch. If it can't be screenshotted, it isn't ready
  to register.
- Directions should actually differ. Three variations on the same layout with
  different accent colours are one direction, not three.
- Never merge a look branch into `market-dev`. Key picks, then says so.

---

## 9. Architecture

Follow the shape of `preside-by-side/server/` — it already solves origin checking,
rate limiting, hashed IPs, SQLite setup, config loading, and systemd hardening.

```
market/
  index.html          the whole page — dashboard + game modes as tabs
  market.css          page styles; builds on the shared base
  market.js           app shell, mode routing
  js/                 split modules once market.js outgrows one file
  server/
    market.py         Flask app
    requirements.txt  flask, gunicorn, requests  (nothing else)
    config.env.example
    market.service    systemd unit, modeled on preside-by-side-suggest.service
    apache-snippet.conf
    fixtures/         golden JSON captured from the provider
    tests/            unittest, stdlib only
  docs/               guide, backlog, progress, design branches  (deny-all .htaccess)
    shots/            screenshots for the design review shelf
```

- Front end: vanilla JS, no framework, no build step.
- Back end: Flask under gunicorn on `127.0.0.1:8789`, SQLite at
  `/var/lib/market/market.db`.
- Apache reverse-proxies `/api/market/*`.
- **The browser never talks to the data provider.** All upstream calls go through
  our service, so one fetch serves every visitor and the key stays server-side.

---

## 10. Data, licensing, and fixtures

- Before any live data is wired up, `docs/DATA-PROVIDER.md` must record, for the
  chosen provider: free-tier rate limit, whether the terms permit **public
  display on a website**, the required attribution string, and the data delay.
- If public display isn't clearly permitted, **park it and keep building on
  fixtures.** Do not wire live data on an unclear licence.
- Every price carries a visible delay label — on the page, not in a tooltip.
- Provider attribution in the footer, worded as the provider requires.
- Cache server-side and aggressively. A refresh must not cause an upstream call.
  Quotes cache to the delay interval, fundamentals for a day, historical series
  indefinitely.
- Free tiers usually cannot serve index levels. Use liquid ETF proxies
  (SPY, QQQ, DIA, IWM) and **label them as proxies**.
- `MARKET_DATA_SOURCE` is `fixture` (default) or `live`. `server/fixtures/` holds
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

1. Read `AGENT-GUIDE.md`, `BACKLOG.md`, and the last few `PROGRESS.md` entries.
2. `git checkout market-dev` (create it from `main` if absent).
3. Take the **topmost unblocked, unchecked** task in `BACKLOG.md`. Don't skip
   ahead to something more interesting. If the top task is blocked, note why and
   take the next one.
4. Build it, in fixture mode, inside `/market/`.
5. Verify against the task's acceptance criteria (§15). Unverified is not done.
6. Commit per §7.
7. Check the task off, append to `PROGRESS.md`, park any questions, register any
   new look branch in `DESIGN-BRANCHES.md`.
8. **Stop.**

A session that makes no progress still writes a `PROGRESS.md` entry saying so and
why. A clear "blocked, here's the reason" is a successful session.

---

## 15. Verification

- Serve locally with the `fen` launch config and open
  `http://localhost:8765/market/`.
- Add a `market-api` launch config once the service exists.
- Check the browser console for errors, check at 375px, and check **with the API
  service stopped** — the dashboard must degrade to a clear "market data
  unavailable" state, never a blank page or an endless spinner.
- Run `unittest` for any pure logic touched.
- Screenshot anything visual and reference it in the progress entry.
- Confirm `git status` shows changes only under `market/`.
