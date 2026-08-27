# Incisor Trading — Decisions and dead ends

**Read this file in full at the start of every session.** Not the tail — all of
it. It is the routine's long-term memory, and it is deliberately kept short
enough to read every time.

`PROGRESS.md` is a journal: what happened on a given day, in order, growing
forever. This file is the opposite — a small, curated set of things that must
never be forgotten or rediscovered the hard way.

Append only. Never delete an entry; if something is overturned, add a new entry
saying so and mark the old one superseded.

---

## How to use it

**Before starting a task**, scan both tables below for anything touching the same
area. If the approach you are about to take appears under *Dead ends*, do not
take it again — the reason it failed is recorded, and unless the listed
*revisit condition* has actually changed, it will fail the same way.

**After finishing a task**, add an entry if either is true:

- You made a choice a future session could reasonably make differently
  (a library-free approach, a data shape, a layout model, an algorithm).
- You tried something that did not work, and abandoned it.

A negative result is worth as much as a positive one here. "I tried canvas for
the chart and it lost crispness on HiDPI, so I went back to SVG" saves a whole
future session.

Entries are one short paragraph. If one needs more, the detail belongs in the
`PROGRESS.md` entry for that day and this file just points at the date.

---

## Settled

Choices made deliberately, with the reasoning, so they are not relitigated.
Anything in guide §1 *Decisions already locked* is settled by Key and does not
need repeating here — this table is for the routine's own calls.

| Date | Decision | Why | Superseded by |
|---|---|---|---|
| 2026-08-27 | Docs split four ways: stable guide, ordered backlog, journal, memory | A single planning file means the routine rewrites its own instructions and drifts | — |
| 2026-08-27 | Market data is licensed in **two layers — access and display** — and no commercial free tier grants display | Checked eight providers for T0. Finnhub, Massive (ex-Polygon.io), Twelve Data, Tiingo and FMP each forbid public display outright; the exchanges charge for the display layer, so this is structural, not a gap to shop around for. Stop re-searching for a free tier that allows it — there isn't one. | — |
| 2026-08-27 | Recommend **Alpha Vantage**, conditional on written permission; stay in fixture mode until it exists | The only free tier whose bar is scoped to *commercial* activity (ToS §2.a.iii) rather than stated flatly, and this page is permanently non-commercial (guide §4). Ambiguous is not permitted (guide §10), so live mode waits on a written yes. Coverage matches T6–T12 from one provider. | — |
| 2026-08-27 | **SEC EDGAR (`data.sec.gov`) for fundamentals**, separate from the quote provider | Public domain, 10 req/**second**, and — decisively — no key, no account, no terms to accept, so it is inside the routine's bounds with no input from Key. Has no prices, so it supplements rather than replaces a quote provider, and keeps fundamentals off Alpha Vantage's 25/day quota. Requires a `User-Agent` naming the app and a contact email or it 403s. | — |
| 2026-08-27 | Design the dashboard as **end-of-day-oriented, honestly labeled**, not a live ticker | Alpha Vantage free is 25 requests/**day**, 5/min. That is the binding constraint on the whole dashboard, tighter than the licence question. T4's caching and T9's watchlist cap are load-bearing because of it. Decide this at T6, not by discovering it at T9. | — |
| 2026-08-27 | **Unattended sessions have no browser.** Verify what can be verified headlessly, split the rest out as its own task | `preview_start` refuses to launch a dev server when nobody is present to approve it, and there is no node on this machine. Guide §15 assumes a browser, so every visual acceptance criterion is unreachable on a scheduled run. Do not burn a session rediscovering this or trying to work around it. | Sessions become attended, or a headless browser is installed | — |
| 2026-08-27 | Front-end checks live in `incisor-trading/tests/`, stdlib `unittest`, run headlessly | Without a browser, "unverified is not done" would block every UI task forever. The suite asserts structure, ARIA wiring, the noindex rule, telemetry hygiene and CSP readiness, and **runs the real `incisor.js` in JavaScriptCore via `osascript`** against a DOM stub built from the real HTML — so keyboard behaviour is genuinely executed, not eyeballed. It does not replace a browser and does not pretend to. | — | — |
| 2026-08-27 | Palette: enamel/bone ink and a single gold accent on near-black | Green and red are reserved for market direction on every surface, so the brand colour has to avoid both. Gold also carries the "gold tooth" reading of the name without leaning on the gag. | — | — |
| 2026-08-27 | System monospace stack for all figures, no webfont | Guide §4 rules out font CDNs, and shipping a webfont would mean writing into `/assets`, which is out of bounds. `ui-monospace` plus `tabular-nums` gives aligned columns at zero cost. | — | — |
| 2026-08-27 | No `gtag` on this page, unlike every other FEN page | Guide §4 forbids third-party trackers and external script tags here, and the T13 CSP would block it anyway. The first-party beacon is the only telemetry. This is a deliberate divergence from the rest of the site, not an oversight. | — | — |
| 2026-08-27 | Read T1's "zero network calls" as "no market-data calls"; `beacon.js` stays | Guide §5 explicitly plans for beacon integration on this page and specifies `data-track` labels for market controls, so excluding the beacon would contradict it. Every control ships an explicit generic `data-track`, because `beacon.js` otherwise falls back to an element's text content. | — | — |
| 2026-08-27 | The service **starts with no credentials at all**; a missing key is fatal only in live mode | `suggest.py` exits without its webhook, but copying that would mean no session and no fresh checkout could run the service without a secret. Fixture mode is the default and never calls upstream, so requiring a key there would be theatre. | — | — |
| 2026-08-27 | Origin policy differs by method: reject a *present but disallowed* Origin on reads, require an allowlisted one on writes | Browsers omit `Origin` on same-origin GETs, so demanding one on a read endpoint would reject the very requests we exist to serve. `origin_is_allowed(strict=)` carries both policies, and data routes will pass `strict=True`. | — | — |
| 2026-08-27 | `/health` is **not** reverse-proxied; it stays localhost-only, and reports no paths, versions or key state | It is a diagnostic for whoever is on the box. The public internet has no reason to ask this service how it is feeling, and a health endpoint is a free reconnaissance surface if you let it be one. | — | — |
| 2026-08-27 | `upstream_calls` table exists from the skeleton, before there is anything to call | Free-tier quota is the binding constraint on the whole project (25/day). The counter has to predate the first fetcher, or the first version that forgets to log a call will not be noticed. T4 builds on it. | — | — |
| 2026-08-27 | One gunicorn worker, threads for concurrency | Rate-limit buckets and the upstream-call budget live in process memory. A second worker would silently double both ceilings, which on a 25-calls-a-day quota is the difference between working and not. | Ceilings move to SQLite or Redis | — |
| 2026-08-27 | No Discord alerting, unlike the suggestion service | Nothing here is urgent enough to wake a phone: there is no submission queue and no user content. `journalctl` is the sink. Revisit if live mode ever starts burning quota unexpectedly. | Live mode ships and quota needs watching | — |

---

## Dead ends

Things tried that did not work. **Do not retry an entry here** unless its revisit
condition has genuinely changed.

| Date | Tried | Why it failed | Revisit if | Branch |
|---|---|---|---|---|
| 2026-08-27 | Finnhub as the quote provider (best free limit found: 60 req/min) | ToS *Redistribution Rights and Personal Use* forbids redistributing or sharing data "with anyone or any 3rd party" without written approval. Site visitors are third parties. Rate limit is irrelevant if the licence forbids the use. | Finnhub grants written approval, or ships a display tier that is free | — |
| 2026-08-27 | Twelve Data (800 req/day) | Free tier is licensed "solely for Internal Use" (§2.2(a)); external display needs a paid Redistribution Rights Add-On (§2.4), and §2.3(l) bars free-tier commercial use. | The add-on becomes free | — |
| 2026-08-27 | Tiingo | Redistribution is "only available upon special request … and comes with additional fees" (§7.3); §1.4(h) bars publishing analysis publicly. Worse, §1.6(a) limits free plans to transient in-memory data only — which **forbids the server-side cache T4 requires**. | Tiingo offers a free display licence *and* relaxes the caching bar — both, not either | — |
| 2026-08-27 | Massive, formerly Polygon.io (rebranded Oct 2025) | Market Data Terms §2 bars data being "publicly displayed"; §1 bars building "an application intended for use by end users other than you". The most explicit prohibition of the eight. | Never, on the free tier | — |
| 2026-08-27 | marketstack | 100 requests per **month**. Four ETF proxies refreshed daily is 120/month — over budget before a visitor searches anything. Disqualified on volume before terms mattered. | The free quota grows by orders of magnitude | — |

---

## Recurring traps

Mistakes made more than once. Promoted here from *Dead ends* the second time the
same thing bites, because twice means it will happen a third time.

_(none yet)_
