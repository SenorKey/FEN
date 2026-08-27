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

Choices a future session could reasonably reverse or redo. **Nothing else.**
If the reason for a choice lives in a comment next to the code, it belongs
there and not here — see the inclusion test in guide §16.

| Date | Decision | Why |
|---|---|---|
| 2026-08-27 | Market data is licensed in **two layers, access and display**, and no commercial free tier grants display | Eight providers checked for T0. Finnhub, Massive (ex-Polygon.io), Twelve Data, Tiingo and FMP each forbid public display outright; exchanges charge for the display layer, so this is structural. **Stop re-searching for a free tier that allows it — there isn't one.** |
| 2026-08-27 | **Alpha Vantage** is the recommendation, conditional on written permission; stay in fixture mode until it exists | The only free tier whose bar is scoped to *commercial* activity (ToS §2.a.iii) rather than stated flatly, and this page is permanently non-commercial (guide §4). Ambiguous is not permitted (guide §10). Full clause-by-clause reasoning in `DATA-PROVIDER.md`. |
| 2026-08-27 | **SEC EDGAR for fundamentals**, separate from the quote provider | Public domain, 10 req/**second**, and no key, no account, no terms — so it is inside the routine's bounds with no input from Key. Has no prices. Keeps fundamentals off Alpha Vantage's 25/day quota. Needs a `User-Agent` naming the app and a contact email or it 403s. |
| 2026-08-27 | The dashboard is **end-of-day-oriented and honestly labeled**, not a live ticker | Alpha Vantage free is 25 requests/**day**. That is a tighter constraint than the licence question and it shapes T6 through T12. Decide it at T6 rather than discovering it at T9. |
| 2026-08-27 | Palette: enamel/bone ink and a single gold accent on near-black | Green and red are reserved for market direction on every surface, so the brand colour must avoid both. Gold also carries the "gold tooth" reading of the name without leaning on the gag. |
| 2026-08-27 | System monospace for all figures, no webfont | Guide §4 rules out font CDNs, and shipping a webfont would mean writing into `/assets`, which is out of bounds. `ui-monospace` plus `tabular-nums` gives aligned columns at zero cost. |
| 2026-08-27 | **No `gtag` on this page**, unlike every other FEN page | Guide §4 forbids third-party trackers here and the T13 CSP would block it. The first-party beacon is the only telemetry. A deliberate divergence from the rest of the site, not an oversight — do not "fix" it. |
| 2026-08-27 | `beacon.js` stays; every control ships an explicit generic `data-track` | T1's "zero network calls" means no *market-data* calls. Guide §5 plans for the beacon here and requires generic labels, because `beacon.js` otherwise falls back to an element's text content and a button reading "Buy 10 AAPL" would leave the browser. |
| 2026-08-27 | Front-end tests live in `tests/`, stdlib `unittest`, run headlessly | They assert structure, ARIA wiring, the noindex rule and telemetry hygiene, and run the real `incisor.js` in JavaScriptCore via `osascript` against a DOM stub. They do not replace a browser and do not pretend to — `tools/shoot.py` covers what they cannot. |

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
| 2026-08-27 | `chrome --headless --window-size=390,844 --screenshot` as a mobile check | Renders at 390px as a *desktop* browser — device emulation never engages, so the output is not what a phone shows. It made the T1 page look like it overflowed horizontally when a real mobile viewport proves it does not. **Do not "fix" overflow seen only in a narrow headless screenshot.** Use `tools/shoot.py`, which drives the same Chrome through Playwright with real emulation and asserts `scrollWidth` directly. | Chrome gains a real device-emulation flag | — |
| 2026-08-27 | marketstack | 100 requests per **month**. Four ETF proxies refreshed daily is 120/month — over budget before a visitor searches anything. Disqualified on volume before terms mattered. | The free quota grows by orders of magnitude | — |

---

## Recurring traps

Mistakes made more than once. Promoted here from *Dead ends* the second time the
same thing bites, because twice means it will happen a third time.

_(none yet)_
