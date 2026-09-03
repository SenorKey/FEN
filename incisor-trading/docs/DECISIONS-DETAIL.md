# Incisor Trading — Decisions, in full

The reasoning behind every line in `DECISIONS.md`. **This file is not read front
to back** — it is opened at the ID an index line names, and only that entry is
read. It may grow without bound: storage is free and attention is not.

Every entry here is indexed exactly once, and every index ID resolves to exactly
one heading here. A test asserts that bijection both ways, because a dangling
reference is how an index rots without anything failing.

IDs are permanent. An entry that is superseded keeps its ID and says what
replaced it; nothing is renumbered and no ID is ever reused.

---

## DEC-001 — No free tier permits public display

*Settled · 08-27, 09-01*

**Decision**

**No commercial free tier grants the right to display market data publicly.
Alpha Vantage is the recommendation, conditional on written permission; stay
in fixture mode until it exists. And there are no per-endpoint terms — one
written answer settles the whole API at once.**

**Why**

Licensing has two layers, access and display, and the display layer is what
exchanges charge for — so this is structural, not a gap in the search. **Stop
re-searching for a free tier that allows public display.** Alpha Vantage is
the only one whose bar is scoped to *commercial* activity rather than stated
flatly, and this page is permanently non-commercial. Ambiguous is not
permitted (guide §10), so acting on it is Key's. Eight providers, clause by
clause, in `DATA-PROVIDER.md`. The 09-01 half answers a question T10b filed
and closes the shape of it: Alpha Vantage's terms are written over the
platform, and the document contains **zero** occurrences of "endpoint",
"function", "dataset" or "Alpha Intelligence", so no call has terms of its
own. **Do not open a licence question per endpoint** — for
`TOP_GAINERS_LOSERS` or any other. There is one licence and it is already in
the table.

## DEC-002 — SEC EDGAR for fundamentals

*Settled · 08-27*

**Decision**

**SEC EDGAR for fundamentals**, separate from the quote provider

**Why**

Public domain, 10 req/**second**, no key, no account, no terms — inside the
routine's bounds with no input from Key. Has no prices. Keeps fundamentals off
the quote provider's 25/day quota. Needs a `User-Agent` naming the app and a
contact email or it 403s.

## DEC-003 — The 22-call daily budget

*Settled · 08-27, 08-28*

**Decision**

**The 25-calls-a-day ceiling decides the product.** The dashboard is
end-of-day-oriented and says so. The cache runs in **both** fixture and live
mode. The budget is **22 of 25**, counting live calls only. Exhaustion
degrades fresh → refresh → **serve stale and flag it** → fail. The tiles read
**`/history` alone, never `/quote`**.

**Why**

Quota binds harder than the licence question and shapes T6–T12. Caching in
fixture mode too keeps that path exercised every session rather than only in a
live mode that is switched off — the cost is that editing a fixture needs the
TTL to lapse or the scratch DB dropped. A daily series already contains its
own quote (last bar, and the one before it), so calling `/quote` as well would
spend a second call per symbol to be told what we were already told: eight a
day for the strip instead of four. `/quote` is still right for T7, which needs
the day range and volume.

## DEC-004 — Fixtures are synthetic and say so

*Settled · 08-27*

**Decision**

Fixtures are **synthetic and say so**: a seeded generator prices every symbol
off **one shared market factor** with a per-symbol beta, and every response
carries `"source": "fixture"`

**Why**

No live call is permitted yet, so there is nothing real to capture. The
`source` field is what lets the page label invented numbers as invented rather
than presenting them as quotes. Stdlib-only and deterministic, so the
committed JSON stays reviewable in a diff and a real capture drops in beside
it later (S3).

## DEC-005 — provider.py is the only module that sees provider JSON

*Settled · 08-27*

**Decision**

**`provider.py` is the only module that sees provider JSON**; `source.py` is
the only I/O seam

**Why**

Keeps the provider choice reversible while its terms are unresolved — swapping
providers rewrites one file, not the dashboard. Alpha Vantage also quotes
every value as a string and signals **every failure as HTTP 200** with prose
in the body, so a status-code check alone would serve a rate-limit notice as a
quote.

## DEC-006 — No fundamentals table at T4

*Settled · 08-27*

**Decision**

**No fundamentals table**, despite T4 naming one

**Why**

Its shape is undefined until T11 and its upstream is EDGAR rather than the
quote provider, so building it now would be schema with no writer and a
migration to come. A deliberate deviation from the task's wording — do not
"complete" T4 by adding it. Noted for Key.

## DEC-007 — Market holidays are computed, never listed

*Settled · 08-27*

**Decision**

Market holidays are **computed from their rules**, never a hardcoded table

**Why**

A table is correct until the year it isn't, and it goes stale silently — the
page would simply claim the market was open on Thanksgiving. Every NYSE
closure has a rule, which is why there is an Easter computation in a trading
page. The two edges that look like bugs and are not are commented in
`js/market-clock.js`.

## DEC-008 — Enamel and gold, system monospace, no webfont

*Settled · 08-27*

**Decision**

**Enamel and gold on near-black; system monospace for every figure; no
webfont**

**Why**

Green and red are reserved for market direction on every surface, so the brand
colour has to avoid both — and gold carries the "gold tooth" reading of the
name without leaning on the gag. Guide §4 rules out font CDNs and a
self-hosted webfont would mean writing into `/assets`, which is out of bounds.

## DEC-009 — No gtag, but beacon.js stays

*Settled · 08-27*

**Decision**

**No `gtag` here, unlike every other FEN page — but `beacon.js` stays, and
every control ships a generic `data-track`**

**Why**

Guide §4 forbids third-party trackers on this page and the T13 CSP would block
one. A deliberate divergence from the rest of the site; **do not "fix" it**.
T1's "zero network calls" meant no *market-data* calls, never no beacon. The
labels have to be generic because `beacon.js` otherwise falls back to an
element's text, and a button reading "Buy 10 AAPL" would leave the browser.

## DEC-010 — No line is coloured by direction

*Settled · 08-28, 08-29*

**Decision**

**No line on this page is coloured by direction** — not the tile sparklines,
not the price chart. The colour goes on the labelled figure beside the line,
which names its own period.

**Why**

The sparkline covers 30 days and the headline change covers one, so colouring
both was correct and read as a contradiction — four tiles each showing a green
up arrow above a red falling line. Green and red now mean one thing per
surface; the dashed opening level says which way the window went and the
`aria-label` says it in words. Found in the screenshots, not in the code
(guide §18). T8 reuses the shape: the chart's period figure *is* coloured,
because it is labelled *Over six months* and sits in its own card, so it
cannot be read as contradicting the one-day change above it.

## DEC-011 — The CSS and JS module seams

*Settled · 08-28*

**Decision**

**`incisor.css` is page furniture, `css/market.css` is the surfaces that
render numbers; `js/` holds pure logic and the one network seam, and every
view lives in `incisor.js`**

**Why**

The CSS seam is not a byte count: everything moved draws data from the
service, everything left would look the same with no data at all, and T7–T12
all add to the moved half. The JS split is what keeps an unattended session
able to verify anything — `market-clock.js`, `market-figures.js` and
`market-data.js` all run in JavaScriptCore with no DOM.

## DEC-012 — docs/shots keeps only the current set

*Settled · 08-28*

**Decision**

**`docs/shots/` keeps the newest set for the page as it stands now, plus any
set showing a state that one does not** — superseded sets are deleted, not
accumulated

**Why**

One set per task would be a permanent 400KB a session in a repo served off a
home connection, and an old set is worse than no set: it shows markup that no
longer exists to someone trying to review what does. The T1 and T5 sets went
at T6, which shoots the same page at the same three widths and includes the
clock they were taken for. What they proved — clean console, no overflow at
390 — is re-proved by every `shoot.py` run, and that is the durable record.

## DEC-013 — A surface owns a view module and a stylesheet

*Settled · 08-28, 08-30*

**Decision**

**A surface that renders market data owns a view module and a stylesheet; the
shell keeps what needs no data. A view that outgrows one file splits again at
drawing versus deciding** — `js/chart-canvas.js` appends every node and
decides nothing; `js/view-price-chart.js` decides everything and appends none.

**Why**

Both files crossed the 600-line rule at T7 and the seam had to be a real one
(guide §6). It is the same seam `css/market.css` was already split along,
applied one level further: the clock would say the same thing with no service
at all, and the strip and the quote panel would say nothing. The second cut,
at T8's audit, is the one the chart's own header had already described — 611
lines became 453 and 205, and the half that keeps growing is the deciding
half. The shared vocabulary — direction colours, the arrow, the proxy badge,
the provenance line, and the three DOM writes in `js/dom.js` — is defined once
and read by every surface, which is what stops the next view restating it.
**Supersedes the T6 note that every view lives in `incisor.js`.**

## DEC-014 — The quote panel costs two calls

*Settled · 08-28*

**Decision**

**The quote panel costs two upstream calls; the tiles still cost one.**
`/history` for the year behind the 52-week range and the volume average,
`/quote` for the day's own open, high, low and volume.

**Why**

A daily series does not carry the session in progress, so the day range
genuinely is not in `/history` — which is the opposite of the T6 finding, and
worth stating so the two are not confused. Against the 22-a-day budget: four
for the strip, plus one or two per symbol looked up. Live mode also had to
switch to `outputsize=full`, because `compact` is 100 sessions and cannot
reach back a year; `fetcher.MAX_DAILY_BARS` cuts the answer to five years
before it is stored.

## DEC-015 — Names come from a committed catalogue

*Settled · 08-28*

**Decision**

**Names come from a committed table (`server/catalog.py`) served by `GET
/symbols`, never from the provider's symbol search**

**Why**

Upstream symbol search spends a call per keystroke, and the budget is 22 a day
— so it is not a cost question, it is a disqualification. The route rather
than the table resolves availability: in fixture mode it lists only symbols
with committed JSON and says the list is complete, so search never offers a
result that dead-ends. In live mode the catalogue is suggestions and a
free-typed ticker is still tried.

## DEC-017 — Front-end tests run in JavaScriptCore

*Settled · 08-27*

**Decision**

Front-end tests live in `tests/`, stdlib `unittest`, run headlessly

**Why**

They assert structure, ARIA wiring, the noindex rule and telemetry hygiene,
and run the real shipped scripts in JavaScriptCore via `osascript` against a
DOM stub. They do not replace a browser and do not pretend to —
`tools/shoot.py` covers what they cannot. Read *Recurring traps* before
changing one.

## DEC-018 — Chart ranges: no 1D

*Settled · 08-29*

**Decision**

**The chart's ranges are 5D / 1M / 6M / 1Y / 5Y. There is no 1D, and T8's own
wording names one.**

**Why**

A day of a daily series is one bar, so 1D is a chart of one point. A real
intraday view needs `TIME_SERIES_INTRADAY`, a third upstream call per symbol
on top of the two a lookup already costs — unaffordable against 22 a day, and
unaffordable for the four proxies at any price. A deliberate deviation from
the task's wording: **do not "complete" T8 by adding 1D.** 5Y is kept and made
honest instead of dropped — in fixture mode it draws the 260 sessions held and
says so on the page, which is the precedent the 52-week range set at T7.

## DEC-019 — A live surface may not overwrite served facts

*Settled · 08-29*

**Decision**

**A live surface may not overwrite a fact the served markup was the only place
to state.** The clock names the moment and the timezone — "Opens Monday 9:30am
ET" — and keeps its countdown only while the event is today.

**Why**

Found by auditing T5, not by a failing test: the script replaced "Regular
hours 9:30am – 4:00pm ET" with "Opens in 2d 10h", so the page's one mention of
Eastern time disappeared the moment JavaScript ran, and the state word was
left naming no market. The countdown is worth its width when it is live and
close and not otherwise, so it is dropped once the event is on another day —
which also means a weekend explains itself and only a holiday or half day
still states a reason. **Do not "simplify" the wording back to a bare
countdown.** The reason has its own element so it wraps as a phrase; the
same-day rule and the split are what keep every everyday state on one row at
375px.

## DEC-020 — A coloured figure names its window

*Settled · 08-29*

**Decision**

**A figure that carries direction colour names the window it covers, in the
figure's own row.** The tile change is `1d`, the sparkline is `30d`, the chart
says *Over six months*.

**Why**

The other half of the 08-28 colour decision, and the half that was missed for
three sessions. Removing the colour from the sparkline stopped the tile
contradicting itself, but the tile still stated two windows and named only
one: the sole period word was the line's `30d`, and the red one-session change
sat directly above it. A reader has no way to attach a period to a figure that
does not carry one. The token is right-aligned in its row so it lands directly
above the `30d` it pairs with — set the same way, they read as two scales; set
differently, they read as one label and some noise. It is `aria-hidden` with a
spoken phrase beside it, because "1d" read aloud is "one d", and both leave
the accessibility tree when the tile has no figure to describe.

## DEC-021 — A fact in one channel only

*Settled · 08-29, 08-30*

**Decision**

**A fact stated in one channel only is a fact half the readers do not get, and
it runs both ways.** The range bands say aloud where the price sits inside
them, because the marker that says it visually is decorative — and the price
chart names its symbol on screen, because its `aria-label` was the only place
that said so.

**Why**

The third finding of the T7 audit and the one no test could have caught: the
band exists to say the one thing a low and a high do not, the marker is
`aria-hidden` because it is a decoration, and nothing stood in for it — so the
surface announced two numbers and withheld its own point. Same shape as the
tile's missing period token and the clock's overwritten timezone: a fact
stated in one channel only, and that channel the one some readers do not have.
The sentence is rounded to whole percent, because the drawing is not precise
to a decimal and reading one would claim it was. The chart is the mirror image
and was found the same way: it carried a price, a date and the largest
coloured figure on the page, the panel naming its symbol was a scroll and a
half above it on a phone, and only a screen reader was ever told which symbol
it drew. **Ask of every surface: what does it know that only one kind of
reader is told?**

## DEC-022 — The period token's placement belongs to the surface

*Settled · 08-30*

**Decision**

**The period token is shared vocabulary; where it sits belongs to the
surface.** `.inc-period` sets the look, `.inc-tile-change .inc-period` sets
the tile's right alignment, and the quote card keeps it inline.

**Why**

The token was written for the tile and carried `margin-left: auto` in the
shared rule, so the quote card would have parked "1d" 900px from the figure it
names. Right alignment was never about the token — it was about landing
directly above the `30d`, and there is no `30d` under the quote card. This is
the same seam `css/market.css` already runs on: the vocabulary is defined
once, and each surface says where it goes.

## DEC-023 — An error may not point off screen

*Settled · 08-30*

**Decision**

**An error message may not point at something that is no longer on screen.**
The not-found panel names the symbols this build serves instead of citing "the
search list above".

**Why**

True and useless: the lookup that fails closes the results list, so the
sentence sent the reader to an empty strip of screen and asked them to find
their way back into it. The list of names fits in the sentence and can be
acted on where it is read. The count in front of it was dropped too —
redundant beside the names, and a numeral inside prose reads as a figure on a
page where every other numeral is one.

## DEC-024 — Pointer surfaces listen for four events

*Settled · 08-30*

**Decision**

**A surface that reads a pointer position listens for down, move, leave and
cancel — and a *touch* pointer leaving keeps its reading.**

**Why**

Traced in Chrome under mobile emulation, because it cannot be reasoned about:
a tap fires `pointerdown`, `pointerup` and `pointerleave` and **no
`pointermove` at all**, so the chart, wired to move alone, answered nothing on
the one gesture a phone has. The drag that did work was undone by the lift,
which arrives as a `pointerleave` — right for a mouse, wrong for a finger,
because on a phone the finger is over the picture and the readout is under it.
`pointercancel` is what separates a reading from a scroll the plot allowed
over itself. **Applies to every pointer-read surface after it**, and to the
copy beside them: a line naming hover and the arrow keys names nothing a touch
reader has.

## DEC-025 — Dark only, and not a gap

*Settled · 08-29*

**Decision**

**The site is one deliberate dark treatment and this page follows it.
`prefers-color-scheme` is not implemented and is not a gap.**

**Why**

Guide §13 asks for light and dark both fully designed; `assets/css/styles.css`
defines no light palette and `/assets` is out of bounds (§3), so a light theme
here would be this page alone diverging from every other page on the site.
Recorded at T8 and re-checked in the T6 audit with `shoot.py --theme light`,
which is identical to the dark run. **This is settled — do not file it as a
defect again**, and do not build a light palette for this page alone.

## DEC-026 — The 600-line rule, measured three ways

*Settled · 08-29*

**Decision**

**The 600-line rule is measured three ways: per stylesheet and script, per
served document at 900, and per surface at 150.** The surface list is derived
from the `data-x` / `data-x-*` pairing, never written out.

**Why**

Guide §6 says to split a long file *along a real seam*, and `index.html` has
none — no build step (hard rule 10), no second route (non-goals). Capping a
document at the code number is not a readability rule; it is a cap on how many
surfaces the route may carry, and it would have blocked T9–T12 with two lines
to spare. The per-surface number is what §6 is actually for and is the one
that keeps biting; the document ceiling only fails if the page starts carrying
a second route. **This is an interpretation of the guide, not a change to it**
— noted for Key, who can say it reads otherwise.

## DEC-027 — Configuration is read at the edge

*Settled · 08-30*

**Decision**

**Configuration is read at the edge, after the file is loaded, and nowhere
else. `store.py` holds `DEFAULT_DB_PATH` and a `configure()`; it reads no
environment of its own.**

**Why**

D4: `store.DB_PATH` was read at `store`'s import, `incisor.py` imports `store`
above the line that opens `$CONFIG_FILE`, and so the key could never take
effect. It passed for three weeks because `config.env.example` repeats the
module default — **two values agreeing by coincidence look exactly like a
value being honoured**, and nothing distinguishes them until someone changes
one. The rule now has a test rather than a convention: an AST walk asserting
no module but the edge touches the environment at module level. Walked, not
grepped, because both files explain in prose why they do not do it. The same
trap catches any future module that reads a key at import, which is the half
worth keeping.

## DEC-028 — The watchlist holds eight tickers

*Settled · 08-30*

**Decision**

**The watchlist holds eight symbols, stores tickers and nothing else, and
discards a stored blob it cannot read rather than migrating it. Its toggle
lives beside the quote card, not inside `[data-quote]`.**

**Why**

The cap is the upstream budget, not taste: a row costs one `/history` call —
the same single call a tile costs — so four tiles plus eight rows leaves ten
of the 22 for lookups at two each. **Raising it takes the budget away from the
surface that feeds it**, and `test_watchlist.py` asserts the arithmetic. No
names are stored because a ticker is what a watchlist is for, and storing
network-derived strings would duplicate `server/catalog.py` and put
attacker-influenced text in storage for no gain. No migration because there is
nothing worth migrating — eight tickers a reader can retype — and a fake
migration path here would be inherited by T14's portfolio, which needs a real
one. The toggle sits outside the panel because everything within
`[data-quote]` is a figure the service returned and this is a control over a
list held in the browser; the per-surface line rule is what caught it. **Do
not move it back in, add names, or raise the cap without redoing the call
arithmetic.**

## DEC-029 — The sector grid reads at a week

*Settled · 08-31*

**Decision**

**The sector grid is eleven funds read at a *week*, ranked over 1M / 3M / YTD
/ 1Y, with every figure measured to the newest date all eleven share. There is
no 1D column and its absence is the design.** In live mode one request
refreshes at most two series; the cap does not bind in fixture mode.

**Why**

Eleven funds is eleven upstream calls, and at the endpoint's daily TTL that is
half of a 22-call day — leaving three lookups a day for the whole internet on
the surface a reader actually came to use. A week costs eleven a week. The
window list follows from that and not from taste: a series that can be a week
old cannot honestly carry a one-session figure, while a figure covering a
month is still covering a month when its end moves by a few sessions. **Do not
"complete" T10 by adding 1D**, and do not shorten the TTL without redoing that
arithmetic. The shared end date is what makes the ranking a ranking — a weekly
refresh spread across requests is exactly how eleven series fall out of step,
and eleven changes measured to eleven dates is not a comparison. The
per-request cap is latency and throttle, not quota: eleven sequential calls
inside one response is 110 seconds of ten-second timeouts against a tier that
also limits requests per minute. It is scoped to live mode for the reason
`budget_remaining()` already is — a fixture read is a local file read, and
rationing it made the grid fill over six page loads in the only mode that has
ever run.

## DEC-030 — /sectors computes; /history relays

*Settled · 08-31*

**Decision**

**`/sectors` computes; `/history` relays. Both are right.**

**Why**

The first route that does arithmetic rather than parsing, and the exception
needs its reason recorded or the next route will copy the wrong one. Eleven
daily series is ~340KB to answer a question that needs forty-four numbers, and
the answer is 2.8KB. `/history` hands over the whole series precisely so the
chart can slice five ranges out of it without asking again — one symbol, many
questions. The grid is many symbols, one question, and the question is cheap
to answer and expensive to ship the inputs for.

## DEC-031 — The sector bars diverge at real zero

*Settled · 08-31*

**Decision**

**The sector bars are a diverging chart whose zero line sits where zero falls,
not at the centre.**

**Why**

A fixed centre is the obvious way to draw one and it wastes half of every row
the moment a window is one-sided — which sector windows usually are: nine
sectors up and two down leaves the entire left half of eleven rows as empty
grey. The axis spans the data *plus zero*, seeded at zero on both ends so the
line is always somewhere on the track, and every bar starts at it — so a rise
and a fall of the same size are the same length in opposite directions, and
the rows stay comparable because they share one axis. The trade, worth knowing
before anyone "fixes" it: a bar length means "relative to the biggest mover in
this window", never "this many percent", which is why the figure is on the row
and the bar is `aria-hidden`.

## DEC-032 — A payload is paid for once

*Settled · 08-31*

**Decision**

**A surface pays for a payload once; every question that payload already
answers is free.** The watchlist rows draw the tile's thirty-day sparkline,
from the series they were fetching and discarding.

**Why**

Found by asking question four of a surface that passes it — the row costs one
`/history` call whether or not the line is drawn, so 250 of its 260 bars were
being fetched, parsed and dropped. The tile above, on the identical single
call, drew a line from them. That made the surface *about the reader's own
symbols* show strictly less than the surface about four symbols they did not
choose, which fails question one on a page whose whole constraint is 22 calls
a day. **Ask of every surface what its payload already contains**, before
asking what a new call could add. The drawing moved to `js/sparkline.js` at
the same time, because a second view restating forty lines of
`createElementNS` is how two surfaces that must agree stop agreeing.

## DEC-033 — A neighbour can invalidate a measure

*Settled · 08-31*

**Decision**

**A measure that was right can be made wrong by the surface that lands next to
it.** The watchlist table was capped at 620px for a stated reason and is now
full width, because T10 put an eleven-row ranked table edge to edge directly
above it.

**Why**

The cap's reasoning was sound and is still readable in the diff: three short
figures spread over 1070px put a hand's width of nothing between a symbol and
its own numbers. Nothing about that argument became false — a *neighbour* did.
Against a full-width ranking doing the same job one surface up, a table
stopping at 58% of the column reads as one that failed to finish loading, not
as a deliberate measure. The trend column is what makes the width honest
rather than merely full: the gap is no longer nothing. **A layout decision is
not settled by its own reasoning alone**, and re-reading it is what an audit
is for — this one had been correct for two sessions and wrong for one.

## DEC-034 — A target is what a finger can hit

*Settled · 08-31*

**Decision**

**A control's target is what a finger can hit, never what the rule says or the
box reports.** The watchlist's remove button is the whole cell, grown with a
positioned overlay, and it was verified by hit-testing four corners rather
than by measuring the button.

**Why**

`getBoundingClientRect` on the button reports 28x22 before *and after* the
fix, because an absolutely positioned overlay is not in its box — so the
measurement that finds the defect is not the measurement that proves it fixed.
`document.elementFromPoint` at each corner of the cell is, and it needs the
element scrolled into view first or it answers `null` for everything and looks
like a failure. Same family as the `[hidden]` trap: **an assertion about a
rule is not an assertion about what a reader can reach.** The overlay is used
rather than padding so the row's height and the glyph's position do not move.

## DEC-035 — Hover alone is no affordance

*Settled · 08-31*

**Decision**

**A control whose only affordance is hover has no affordance.** Every sortable
column carries a glyph now, not only the sorted one.

**Why**

Two of the three watchlist headers were marked purely by a colour change on
hover, on the surface most likely to be scanned on a phone — where there is no
hover, and where a list of eight rows is exactly what someone wants to
reorder. `aria-pressed` had been correct since T9, so a screen reader knew and
a sighted touch reader did not: **the same shape as the range bands and the
chart's own symbol — a fact stated in one channel only.** A doubled arrow for
"can be sorted", dimmed, so it never reads as "sorted this way" beside the
single arrows that mean direction everywhere else on the page.

## DEC-036 — Sideways scrollers are containing blocks

*Settled · 08-31*

**Decision**

**Every box on this page that scrolls sideways sets `position: relative`, and
a test derives that pairing from the stylesheets rather than listing the
boxes.** `overflow-x: auto` does not clip what is absolutely positioned inside
it.

**Why**

D6, and the table it was filed against was innocent: it scrolled inside its
own box correctly and always had. What pushed the body was the header's
off-screen "Remove" label — `.inc-offscreen` is `position: absolute`, and an
absolutely positioned element is clipped only by an ancestor that is a
**containing block** for it, which a scroller with no `position` is not. So
the one element on the surface nobody can see was the one that escaped, 1.77px
past a 320px viewport. The reason lives beside `.inc-offscreen` in
`incisor.css` rather than beside any one scroller, because the escaping thing
is shared and the scrollers are not: this page pairs a visually-hidden label
with a scrolling table on every surface that ranks anything. **Do not remove
`position: relative` from `.inc-watch-scroll`, `.inc-tablist` or
`.inc-chart-table-scroll` as a no-op** — two of the three are preventive and
look like dead declarations. Same family as the `[hidden]` trap: a rule that
is correct about the visible content and silent about the rest.

## DEC-037 — shoot.py measures a fourth width

*Settled · 08-31*

**Decision**

**`shoot.py` measures a fourth width it does not photograph: 320px, full
watchlist, overflow only — and skips it with a stated reason when `--api` is
absent.**

**Why**

§13's rule is unconditional, so §15's 375 is a width to check at and not a
floor; but a fourth image every session is permanent weight in a repo served
off a home connection, and the check is one number rather than a picture. The
skip is the part worth recording: with no service the rows fall back to a
short "unavailable", the table fits, and the run would go green against the
one state the rule is not about — the same "what does the stand-in paper
over?" question D4 and D5 turned into a recurring trap. A pass that stands for
nothing is worse than a stated skip. One run costs 32 requests against a
60-a-minute per-IP limit, so the fourth load does not put the tool near its
own service's ceiling.

## DEC-038 — The document ceiling counts markup only

*Settled · 09-01*

**Decision**

**The document ceiling counts markup only — comments and blank lines are
free.** 596 of 894, against 900. **This supersedes D2's all-lines measure, not
its reasoning**, which was right that the document has no seam.

**Why**

Every other shipped file can answer a length rule by splitting. This one
cannot, so the only move it has left is deletion — and a quarter of it is the
reasoning guide §16 puts beside the code rather than here: the ET the clock
must not overwrite, why the proxy symbols live in markup, why the watch toggle
sits outside the quote card, why there is no `gtag`. A ceiling that prices an
explanation the same as a surface makes deleting the memory the cheap way past
it, on the one file where that is the *only* way past it. Measured over markup
the document is 596 lines — under the 600 every other file obeys, which
answers whether it is unreadable: it is not long, it is well explained. **The
rule that actually binds is the per-surface 150**, and it is not close: the
quote card is at 143 (T11 has to split it before it adds anything) while the
document sits at 66% of its ceiling. Do not re-add comments to the count.

## DEC-039 — A derived rule needs its own guard

*Settled · 09-01*

**Decision**

**A derived rule hides what it does not reach, so the derivation needs a guard
of its own.** The per-surface rule pairs a block with hooks beginning with the
block's own attribute, and skipped two of the page's surfaces in silence.
`[data-sectors]` is `[data-sector]` now.

**Why**

The pairing is what keeps the rule covering surfaces nobody listed, and it is
also why a container spelled with an `s` its ten hooks do not have matched
zero of them and went unmeasured from the day it shipped — the whole sector
grid, and `[data-index-strip]` beside it. Nothing failed; the rule simply had
nothing to say, which is the same shape as the `_shipped()` and proxy-badge
traps and worse, because a *derived* list looks complete by construction. The
guard derives the gap rather than closing one hole: a block is surface-shaped
when it carries a valueless `data-` marker with three or more `data-`
descendants — how every view here finds its root — and is covered when the
rule measures it, when it sits inside one the rule measures, or when it
*contains* ones it measures, which is why the strip needs no measure of its
own. **Ask of a derived rule not what it catches but what it is silent
about**, and note that T11's natural `[data-fundamentals]` is the same plural
waiting to happen.

## DEC-040 — A constraint on placement is not on the element

*Settled · 09-01*

**Decision**

**A constraint that rules out a layout does not rule out the element.** The
sector bar is stacked under the name below 700px, never deleted; the
breakpoint is where the beside-the-name track first clears 300px.

**Why**

The narrow rule dropped the bar with `display: none`, and its stated reasoning
was correct about the wrong thing — three columns genuinely do not fit under
560px, which argues against the bar being *beside* the name and not against
the bar. So the surface whose stylesheet opens "the bar is the whole reason
this is a list and not a table of figures" was a table of figures on the width
§13 calls first. Stacked, it gets 358px at 390px — more than the 343px a
tablet gives it, and more than double the 168px the old breakpoint gave it —
with no name wrapping. 300px is not taste: under it the fill's 2px minimum
starts overriding real differences, so every sector that moved under a third
of a percent draws the same stub. **Ask of a rule that removes something: is
the constraint against the element, or only against where it was put?**

## DEC-041 — The budget scores one upstream of two

*Settled · 09-01*

**Decision**

**Fundamentals come from SEC EDGAR, and the budget had to learn there are two
upstreams.** `budget_remaining()` scores only the endpoints
`source.UPSTREAM_OF` marks as Alpha Vantage's; both providers still write to
one call log.

**Why**

The 08-27 choice of EDGAR was made on licence and quota and both hold — public
domain, no key, ten requests a *second*. But the reason for it was undone in
code the moment the route landed: one `upstream_calls` table, one `COUNT(*)`,
and a free SEC request costing one of twenty-two. A reader opening eight
companies would have exhausted the allowance that keeps four price tiles
refreshed, which is the exact cost this provider choice exists to avoid — and
nothing would have looked wrong, because the budget was being spent correctly
on the wrong thing. Derived from the upstream map rather than listed, so a
third provider is scored by declaring who serves it. **A provider chosen to be
free has to be free where the counting happens, not only where the calls are
made.**

## DEC-042 — The quote card split along its provider

*Settled · 09-01*

**Decision**

**The quote card was split along its *provider*, not along its markup.**
Market cap and P/E moved to the filings panel; `[data-quote]` went from 143
lines to 127 and now holds only what the price service returned. T11's backlog
note proposed extracting the whole `<dl class="inc-figures">`.

**Why**

The note's seam was the shape on screen — a list of figures — and the real one
is where the numbers come from. Extracting the whole list would have put Open,
Previous close and Volume *outside* `[data-quote]`, contradicting the rule
that card has stated since T9: everything inside it is a figure the service
returned. Volume is a quote figure. Market cap and P/E never were — they were
em dashes with a paragraph underneath explaining that they come from filings,
which is the card naming its own exception. Splitting on the provider deletes
the exception rather than relocating it, and the paragraph went with it. **A
deliberate deviation from the task's own wording; do not "fix" it by pulling
the price figures out too.**

## DEC-043 — Ratios divide beside the price shown

*Settled · 09-01*

**Decision**

**Market cap, P/E and dividend yield are computed in the browser; margins and
beta on the server.** The wire carries shares, earnings and dividends per
share, never the three ratios.

**Why**

The dividing line is whether a figure needs the price *the reader can see*.
Any price the server picked for a market cap could differ from the one on the
card directly above the panel — a different cache age, a refresh between two
requests — and that is a contradiction a reader would be right to notice and
unable to resolve. So the division happens beside the number it is divided by.
Margins need no price and beta needs two whole series, so both stay where the
data is. `/fundamentals` computing at all follows `/sectors`: eleven series
was a third of a megabyte for forty-four numbers, and a year of two series is
forty thousand numbers for one beta.

## DEC-045 — A fund is a state, not a failure

*Settled · 09-01*

**Decision**

**A fund is a state, not a failure.** `/fundamentals` answers 200 with
`filings: null` for every ETF, and the panel says so in fund language while
still showing the one figure a fund has.

**Why**

Fifteen of the seventeen symbols this build serves are funds, so this is the
*ordinary* answer and a 404 would have made the common case look like an
error. Ten em dashes would have been worse than the error: a reader who
searched XLK has not made a mistake, and a column of dashes suggests they
have. The panel hides the rows it cannot fill and keeps beta, which is the one
figure measured from price alone — that asymmetry is why beta sits beside the
filings on the wire rather than inside them. A company listed last month is
the mirror image and gets filings with no beta.

## DEC-046 — EDGAR's contact address is config

*Settled · 09-01*

**Decision**

**EDGAR's contact address is config, not code, and not the routine's to
choose.** `EDGAR_CONTACT` in `config.env`, empty by default; without it live
filings refuse and say why, and the service still boots.

**Why**

EDGAR answers an automated client with no identifying User-Agent with a 403,
and the address it wants is one a regulator would use to reach whoever runs
this — Key's, in the same class as the API key, and out of bounds (§3). Not
fatal even in live mode, unlike `UPSTREAM_API_KEY`: filings are one surface
and prices are the page, so a service refusing to boot over the fundamentals
panel would take the dashboard down with it. The CIK map is **fetched, never
committed**, for a sharper reason — a stale CIK does not fail, it returns
another company's filings under our ticker.

## DEC-047 — A proxy stand-in must identify its callers

*Settled · 09-02*

**Decision**

**A stand-in for a proxy has to identify its callers, or the thing it stands
in for is not what is being tested.** `tools/shoot.py` sets `X-Forwarded-For`
per browser context, because `mod_proxy_http` sets it per visitor; each
context is its own reader with its own address.

**Why**

D7, and the three candidates its filing named were all about the arithmetic —
raise the limit for the tool's service, pace the loads, add a bucket-reset
diagnostic — while the defect was that four visitors were arriving as one.
**Do not take any of the three.** Raising the limit stops the tool meeting the
gate at all; pacing slows every run for a collision that should not happen;
and a route that clears the rate limiter is a control that must never be
enabled in production, which is the kind of switch D4 showed nobody notices is
wrong. The sharper half is what the collapse was hiding: the service buckets
by the forwarded address, so **every request this tool has ever sent took the
branch production never takes** — the same 'what does the stand-in paper
over?' question as D4 and D5, asked of a header rather than a config key, and
it left the per-IP gate's real path unexercised long enough for D8 to sit in
it unnoticed. The ceiling is now checked deliberately and against the right
thing: one page load against the allowance one reader gets, printed every run
because it grows with every surface — nine requests at T11, fourteen with a
full watchlist, and nothing was watching it.

## DEC-048 — The limiter trusts the last hop

*Settled · 09-02*

**Decision**

**The per-IP limiter trusts the *last* hop of `X-Forwarded-For`, and that is a
fact about the deployment rather than about the header.** Exactly one proxy
sits in front of this service and it always appends, so the final entry is the
only one a caller cannot write. Empty entries are dropped before the last is
taken.

**Why**

D8. The usual advice is to read the *first* hop, which is right where nothing
prepends and wrong here: `mod_proxy_http` appends the peer to whatever
arrived, so the first hop is whatever the caller typed, and varying it per
request put the 60-a-minute ceiling permanently out of reach. **Put a second
proxy in that chain — Cloudflare, another Apache — and the last hop becomes
wrong in the other direction**, naming the intermediary instead of the reader;
it would then have to count hops from the right by however many are trusted.
That is the reversal a future session could not make safely without knowing,
which is why the topology is recorded here and not only in the docstring. The
empty half is the sharper trap and it is one character wide: a caller controls
the separators as well as the fields, so `1.2.3.4,` arrives appended as
`1.2.3.4, , <peer>` and the last *field* is the empty string — which
`rate_limit_check` reads as an unidentifiable caller and **exempts from the
per-IP gate entirely**. **Anything that lets `get_client_ip()` return empty
disables the gate silently**, and a disabled gate is indistinguishable from a
gate nobody has tripped.

## DEC-050 — Volatility and correlation ride with beta

*Settled · 09-02*

**Decision**

**Volatility and correlation are read off the pairing `beta()` already builds;
the panel's fund state is what they were added for.** One `measures` object on
the wire — three figures, one window, one benchmark — replacing the old `beta`
object.

**Why**

The 08-31 watchlist rule applied to a *computation* rather than a fetch: the
server was pairing 252 daily returns against the benchmark's, reading one
number off them and discarding both series. **Fifteen of the seventeen symbols
this build serves are funds**, and a fund's whole panel was that one number
under a sentence reading "What can be measured from its price is below" — the
common case writing a cheque the surface did not cash. Correlation earns its
place twice over: beta is a slope fitted through whatever is there, so 1.16 at
a correlation of 0.61 and 1.16 at 0.9 are different claims, and the panel
stated the slope while saying nothing about how much of the movement it
explained. That caveat is exactly guide §11's shape and it is why the two ship
together rather than volatility alone. One object rather than three siblings
because one window produced all three, and the page states that window once —
`Beta, volatility and correlation measured over 252 sessions against SPY`.
**Any one of them may be null while the others are not** (a benchmark that
never moved costs the beta and the correlation and leaves volatility
untouched), so the reader keeps an object with a window and blanks per figure.

## DEC-051 — Nested surfaces are charged once

*Settled · 09-02*

**Decision**

**The per-surface 150-line rule charges a block only the lines it does not
delegate to a surface nested inside it.** Every line is charged to exactly one
surface: the innermost that owns it.

**Why**

`[data-fundamental]` stood at 144 of 150 and could not grow, which is the rule
working — but splitting it into four groups made it a *container*, and the old
measure charged it its own chrome plus all four groups, reporting 231 for a
panel that reads as five short things. `is_measured()` already said a
container of measured blocks needs no measure of its own; this is the same
principle applied to the number instead of to the coverage. The guard is the
part that matters and it is in `test_page.py`: a block that delegates nothing
is still charged in full, so **wrapping a long surface in a marker buys
nothing unless the inner block is itself measured**. Confirmed to fail with
the old double-counting rule put back.

## DEC-052 — Five free-tier quote providers

*Dead end · 08-27*

**Tried**

**Five free-tier quote providers.** Clause citations in `DATA-PROVIDER.md`.

**Why it failed**

**Finnhub** (60/min, the best limit found) forbids sharing data with any third
party without written approval, and visitors are third parties. **Twelve
Data** (800/day) licenses the free tier for internal use only. **Tiingo**
charges for redistribution and limits free plans to transient in-memory data,
which forbids the cache T4 requires. **Massive**, ex-Polygon.io, bars public
display outright — the most explicit of the eight. **marketstack** allows 100
requests a *month*, and four proxies refreshed daily is 120: disqualified on
volume before terms mattered.

**Revisit if**

Finnhub or Twelve Data ships a free display tier; Tiingo relaxes **both** its
display and its caching bars; marketstack's quota grows by orders of
magnitude. Massive: never, on the free tier.

## DEC-053 — Movers from per-symbol calls

*Dead end · 08-31*

**Tried**

**Computing top gainers, losers and most active from per-symbol calls** — the
movers half of T10

**Why it failed**

Arithmetic, not difficulty. A mover list is a ranking over a universe, and
this architecture prices a universe one call at a time: the 48-name catalogue
is 48 calls against a budget of 22 a day. Every universe small enough to
afford is too small for the answer to be true — real top gainers are small
caps nobody hand-picked, so "top gainers among fifteen ETFs we happen to
fetch" would be a ranking presented as a fact about the market. Deferred to
T10b with the one affordable route named: a symbol-less market-wide endpoint,
which the source path, the cache key and the per-symbol lock all assume does
not exist.

**Revisit if**

Never for the per-symbol version. T10b, once the symbol-less endpoint's terms
and its fixture shape are settled.

## DEC-054 — All three fixture shapes for the movers list

*Dead end · 09-01*

**Tried**

**All three fixture shapes for the movers list (T10b): sixty invented tickers,
a ranking of the seventeen symbols this build holds, and a committed real
capture.**

**Why it failed**

**A fixture can synthesise a series; it cannot synthesise a selection.** Every
surface before this one asked about a symbol *we* named, so generated prices
under a "sample data" label were an honest stand-in. A movers list's entire
claim is *which symbols the market picked*, and that claim has no synthetic
form. Invented tickers fabricate companies rather than prices, and no
provenance line makes a corporate identity honest — while the page's own
not-found state already means "the provider does not answer for that ticker",
so a reader who checks one is told a second untruth. Ranking the seventeen
committed symbols is eleven sector funds and four index proxies dressed as
market movers: the per-symbol dead end below in a cheaper hat, and its stated
reason was truth, not cost. The one honest payload is a real capture, and
committing that to a public repo **is** display — the single thing the
unresolved licence forbids. So T10b is `[!]`, and it is the first surface here
that cannot be developed on fixtures at all.

**Revisit if**

Written display permission exists, at which point T10b is built and verified
directly in live mode — one call a day, and its symbols open because live mode
already tries a free-typed ticker.

## DEC-055 — Headless Chrome as a mobile check

*Dead end · 08-27*

**Tried**

`chrome --headless --window-size=390,844 --screenshot` as a mobile check

**Why it failed**

Renders at 390px as a *desktop* browser — device emulation never engages, so
the output is not what a phone shows. It made the T1 page look like it
overflowed horizontally when a real mobile viewport proves it does not. **Do
not "fix" overflow seen only in a narrow headless screenshot.**
`tools/shoot.py` drives the same Chrome through Playwright with real emulation
and asserts `scrollWidth` directly.

**Revisit if**

Chrome gains a real device-emulation flag

## DEC-056 — Independent random walks for fixtures

*Dead end · 08-27*

**Tried**

Independent per-symbol random walks for the fixture series

**Why it failed**

Produced a window where the Nasdaq proxy fell 26% while the Dow proxy rose 11%
— a market that cannot happen, and the thing the whole dashboard would then be
laid out against. Replaced with one shared market factor plus per-symbol beta
and noise; daily-return correlations now sit near 0.9 across the proxies.

**Revisit if**

Never — correlated proxies are not a stylistic preference

## DEC-057 — Treating any 404 as a missing symbol

*Dead end · 08-28*

**Tried**

**Treating any HTTP 404 as "that symbol does not exist"**

**Why it failed**

Found in a screenshot, not in the code. With the service stopped, the static
server behind `shoot.py` answered `/api/incisor/quote` with a 404 and the
panel told the reader their ticker was not one the provider answers for — a
confident lie about someone else's failure, and a real Apache with a dead
backend would do the same with its own 404 page. Only a 404 carrying our
service's own `symbol_not_found` body counts as a missing symbol now; anything
else is a service that was never reached.

**Revisit if**

Never

## DEC-058 — sys.modules as a no-network assertion

*Dead end · 08-27*

**Tried**

Asserting `urllib.request` / `http.client` are absent from `sys.modules` as a
"no network access" check

**Why it failed**

Werkzeug imports both itself, so the assertion fails on a request that never
touched the network. It proves nothing either way. Patch the `socket`
constructors to raise and drive a real request through instead — what
`TestNoNetworkAccess` does.

**Revisit if**

Never

## DEC-059 — A 240px sector name column

*Dead end · 09-01*

**Tried**

**Closing the 319px gap between the sector names and the bar track by fixing
the name column at 240px**

**Why it failed**

Built and shot, not argued about — and it is worse. The longer track buys no
legibility, because the axis is set by the window's maximum and every bar
keeps its proportion of it; all it adds is empty grey to the right of nine
bars out of eleven. And 240px is exactly what the longest name needs beside
its ticker, so pinning the column there leaves it no slack for a name that
grows. The gap is what sits between a column of short labels and a chart whose
eleven bars must all start at one shared x — that shared left edge is the
thing making the ranking comparable, and it is not a defect.

**Revisit if**

A sector name changes length enough to move the 240px floor, or the row grows
a fourth column

## DEC-060 — A fact in one channel only (trap)

*Recurring trap · 08-29, 08-31*

**The trap**

**A fact stated in one channel only is a fact half the readers do not get —
and it keeps being found in a new channel.** The range bands were silent about
where the price sat; the chart never named its symbol on screen; the sort
headers marked themselves only on hover.

**How to avoid it**

Promoted on the third instance, because the shape is now clearly general
rather than a property of any one surface. Each time, the surface was
*correct* in one channel and empty in another: `aria-hidden` on a decoration
with nothing standing in for it, an `aria-label` naming a symbol nothing on
screen named, an `aria-pressed` that a sighted touch reader has no way to
perceive. Two of the three were caught by an audit and none by a test. **Ask
of every surface: what does it know that only one kind of reader is told?** —
and note that hover is a channel some readers do not have, exactly as vision
is.

## DEC-061 — A count across the page is not a rule

*Recurring trap · 08-28*

**The trap**

**A count taken across the whole page stops being a rule the moment a second
surface does the same thing.** `test_proxy_tiles_are_labelled_as_proxies`
compared the number of `.inc-proxy` badges to the number of tiles, and failed
on the quote panel growing a proxy badge — while it was labelling a proxy
correctly. Same shape as the `_shipped()` trap below it.

**How to avoid it**

Assert the property per element, not as a total. "Every tile contains one
badge" survives a second surface; "the page has four badges" does not, and its
failure points at the innocent party.

## DEC-062 — A screenshot catches transitions in flight

*Recurring trap · 08-29*

**The trap**

**A screenshot taken straight after an interaction catches a CSS transition in
flight, and the frozen frame reads as a bug.** The 5Y chart shot showed the 6M
button still pressed while the chart drew five years — 180ms of `transition:
background` between two correct states, photographed halfway. A browser check
proved the attribute had moved all along.

**How to avoid it**

`page.screenshot(..., animations="disabled")`, which `tools/shoot.py` now
passes on every capture. Before filing a state as wrong because a screenshot
shows it, ask whether anything on screen was mid-transition when the shutter
fell.

## DEC-063 — A full-page shot composites the fixed nav

*Recurring trap · 08-29*

**The trap**

**A full-page screenshot composites the fixed site nav into the middle of the
image, over whatever happened to be at that scroll offset.** In
`t8-chart/mobile.png` the nav sits across the tiles; in the version before it,
across the "Look up a symbol" heading. Nothing is overlapping on the real page
— the header is `position: fixed`, and a stitched full-page capture paints it
at the offset the page was scrolled to. It moves whenever the page's height
changes, so it looks like a new defect every time.

**How to avoid it**

Before filing an element that overlaps the site nav, check whether the same
artifact is in the previous committed shot. If it is, it is the capture. This
is the second screenshot-reading trap after the mid-transition one below — an
image is evidence about the page, but it is also evidence about the camera.

## DEC-064 — A stand-in fails where nobody checks

*Recurring trap · 08-30, 08-31, 09-02*

**The trap**

**A stand-in fails silently in the direction nobody checks, and it is never
only the deployment.** D4: a config key read above the line that loads the
config file, which passed for three weeks because the module default happened
to match. D5: `/symbols` missing from `apache-snippet.conf` since T7, while
`tools/shoot.py`'s static server forwards the whole `/api/incisor/` prefix and
the service tests call the routes directly — so the search box worked
everywhere except where it would ship.

**How to avoid it**

Ask of anything in `server/` that is not code: **what stands in for this
locally, and what does the stand-in paper over?** Then assert the deploy
artefact against something derived, never written out. `test_config.py` walks
the AST for module-level environment reads; `test_page.py` derives the routes
the browser calls from the shipped client and checks each is proxied. Both
were confirmed to fail with the defect put back, which is the only evidence a
guard of this kind is real.

## DEC-065 — An author display rule defeats [hidden]

*Recurring trap · 08-29, 08-30*

**The trap**

**An author `display` rule silently defeats the `hidden` attribute, and no DOM
test can see it.** The browser's rule for `[hidden]` is `display: none` at the
lowest specificity, so any surface that sets `display` on the same element
keeps it on screen while `element.hidden` is genuinely `true`. It bit the
clock's reason at T5, which got a local patch, and the watchlist's Watch
toggle at T9, which sat under a panel reading "Nothing looked up yet" — and
the JavaScriptCore check asserting `watch.hidden === true` passed both times,
because the attribute really was set.

**How to avoid it**

`incisor.css` now carries one `[hidden] { display: none !important; }` at the
top and the local patch is gone, so the next surface that hides something
inherits the fix. The wider lesson is the one to keep: **an assertion about an
attribute is not an assertion about what is on screen.** Anything hidden by
attribute has to be confirmed in a `shoot.py` image at least once.

## DEC-066 — The greps in test_page.py mislead

*Recurring trap · 08-27, 08-28, 09-01*

**The trap**

**The greps in `tests/test_page.py` are blunt substring checks over the
shipped source, and they mislead in three directions.** At T5 the security
rules read only `incisor.js`, so they silently stopped being rules the moment
`js/` appeared. At T6 the word `innerHTML` in an explanatory *comment* failed
`test_no_innerhtml`, and the 600-line rule turned out to be measuring every
script concatenated — so it would eventually have demanded a split of
whichever file happened to be last.

**How to avoid it**

When a new file starts being served, check the greps read it — that list is
built by `_shipped()` now rather than written out. A rule that forbids a token
forbids it in prose too, so describe the thing instead of naming it. And a
per-file rule has to be measured per file: if a test folds several files into
one string, ask what it is actually asserting. **09-01: the prose half bit
twice more in one session, both times inside the guard being written for it**
— a check that no rule hides the figure list failed on the comment saying
nothing is hidden, and a check that the heading no longer calls a fund a
company failed on the markup comment explaining why. The trap fires hardest
when writing the guard against it, because the guard is the thing most likely
to quote what it forbids. Strip comments and read parsed rules, never raw
source.

## DEC-067 — The shape of the index itself

*Settled · 09-02*

**Decision**

**The index carries no date column, and D9 merged no rows.** Every date a row
ever carried is in `DECISIONS-DETAIL.md`; the index spends its width on the
claim and the reason instead. Sixty-six entries went in and sixty-six came
out.

**Why**

Two calls the acceptance criteria left open, both worth recording because a
later session could reverse either without knowing. **Dates:** a date column
costs 12–19 characters of a line capped at 200, and what stops a loop is the
claim and its reason, never when it was decided — chronology is what
`PROGRESS.md` is for, and the detail file keeps every date a merged row
accumulated. **No merging:** DEC-021 and DEC-060 are the same lesson, settled
and then promoted to a trap, and folding them was tempting. It was refused
because D9 is a *move, not a trim*: the one thing that makes the split
verifiable is that the count is unchanged and the bijection is exact, and a
merge inside the same change makes "no reasoning lost" impossible to check by
counting. Merging is S6's job and the index is the right place to do it from.
**The headroom this leaves is the point, not an oversight:** at roughly 165
bytes an entry the 12,000 ceiling holds about seventy and the index is at
sixty-seven, so the next session that files a decision will have to move a
surface-scoped one beside the code it binds (guide §16) or merge a pair here.
That pressure is the mechanism, and the 200-character cap is what keeps it
linear rather than the five-fold growth that made this a defect.

## DEC-068 — Closed work collapses in place

*Settled · 09-02*

**Decision**

**Finished work does not get an anchor.** D9 split `DECISIONS.md` into an index
and a detail file because a settled decision still binds — a session needs to
open it and argue with it. A completed backlog task does not: nobody follows a
reference to work that is closed. So D10 collapsed twenty-two of them to a
one-line record each in `## Done`, in `BACKLOG.md` itself, rather than moving
them to a second file the way D9 did.

**Why**

The two files had the same symptom and needed different cures, and taking D9's
shape for both would have been the easy mistake. A `BACKLOG-DONE.md` would
have cost a file, a cross-reference and a bijection test to hold something
nobody opens; the record's whole job is that it happened, when, and what it
concluded, which fits on a line. What a session actually needs from finished
work is elsewhere already — the `DEC` lines it settled, the audit-log row, and
the code — so the record carries pointers to those and no reasoning of its own.

The rule that makes the collapse safe is the one worth keeping: **anything in a
completion note a future session could act on is not a note.** It is a `D`
item, a task, or a `DEC` line, and it is filed as one *before* the note goes.
D9's own note held the only mention of `N7` — the guide rewrite that is Key's —
so that clause survives verbatim in D9's record rather than as a pointer.

Two things were moved rather than written for this. `DEC-049` left the index
for `js/view-fundamentals.js`'s header, because it binds nothing but that
surface and the index had seventy bytes of headroom (guide §16, rule 1). And
the observation that three consecutive surfaces shipped defects their green
suites could not see went to `tests/README.md`, next to the sentence that
already says those suites do not replace a browser.

**What it cost, and what it did not fix**

62,563 → 32,538 bytes, of which the collapse itself accounts for all but the
950 bytes of `D11`, filed the same session. `D11` is the finding: the audit
log is 13,219 bytes over seven rows, `D10` was forbidden to touch it, and `O6`
never completes — so 41% of a file read in full every session is now a section
this fix was not allowed to reach. Same disease, third file, and the reason
`BACKLOG.md` lands at 32,538 against a stated target of 32,000.

## DEC-069 — An audit is a row and a dated entry

*Settled · 09-03*

**Decision**

**An audit records as a one-line verdict row in `BACKLOG.md` and a dated
entry in `docs/AUDITS.md` holding the four answers, bound by a bijection
keyed on the date and the task ID.** No `A`/`AUD` prefix is created.

**Why**

Third file, same disease, and the first one where the growth is guaranteed
rather than incidental. `O6` never completes and guide §18 makes a surface due
again after any revamp, so the audit log has no terminal size — seven audits
had already reached 13,219 bytes, 41% of a file read in full every session,
and `D10` was explicitly forbidden to touch it. Deferring again would have
meant a fourth session collapsing the same shape.

**Why the prose survives whole.** An audit is the best writing the routine
does, and it is not what a session needs from it. A session skimming the log
needs the date, the surface, the verdict, and enough of the finding to know
whether the surface moved underneath it — 150 characters, not 1,900. Acting on
a verdict is rare, and rare work pays to open a file.

**Why the key is the date and the task, not a new ID.** Guide §19 names seven
prefixes and spells `DEC` out rather than shortening it, precisely so two
namespaces cannot sit one typo apart in files read together. An eighth would
be a number to assign, never reuse, and keep in step across two files —
overhead an audit does not need, because it already carries a natural
composite key that both sides state anyway. The date alone will not do: a
revamp makes a surface due again, so one task ID can hold two audits.

**Why `AUDITS.md` is unbudgeted.** Same reason as `DECISIONS-DETAIL.md`
(`DEC-067`): it is opened at a heading, never read front to back, so its size
costs a reader nothing. Storage is free and attention is not.

**What the ceiling does not do.** The byte count is how the growth was
noticed, never what stopped it — a ceiling alone was the old "two screens"
rule, and it failed. Each collapse this project does ships a shape rule with a
length cap beside it: a finished task is a row and never a bullet
(`DEC-068`), an audit is a row and never four paragraphs, and both caps are
enforced per row rather than as a total. `BACKLOG_CEILING` drops 33,000 →
22,000 as a ratchet.

**What paid for this entry.** Adding it put the index 136 bytes over its
ceiling, which is the mechanism working rather than failing. `DEC-016` and
`DEC-044` left the index for the files they bind — `js/view-symbol.js` and
`server/fixtures/make_fixtures.py` — and neither was written out, because both
were already there in full. The index had been carrying a second copy of a
comment sitting beside the code it explains, which is the worse of the two
places for it: shared memory is read by every session, and a comment cannot
drift from what it describes. Guide §16, rule 1.

**Also settled here:** every *looked at and left* finding from the seven
audits now lives where it binds — `js/chart-canvas.js` for the end markers
astride the plot border and the axis step family, `js/view-watchlist.js` for
the three identical provenance sentences, `js/view-fundamentals.js` for the
fund panel leading with what is absent, `DEC-059` for the 319px sector gap,
and `D3` for a tile that cannot open its symbol. A finding recorded only in an
audit is a finding that gets re-found the next time someone reads that file.
