# Incisor Trading — Audits, in full

The four answers behind every row in `AUDIT-LOG.md`. **This file is
not read front to back** — it is opened at the surface an audit row names, and
only that entry is read. It may grow without bound, and it will: `O6` never
completes, and guide §18 makes a surface due again after any revamp.

Every entry here has exactly one row in the audit log, and every audit row
resolves to exactly one heading here. A test asserts that bijection both ways,
keyed on the date and the task ID, because a dangling reference is how an index
rots without anything failing.

A surface audited twice keeps both entries. Nothing here is rewritten after the
fact — an audit is what was true on its date, and a later one says so itself.

Headings are `## MM-DD — Surface (Tnn)`, oldest first.

---

## 08-29 — Market clock (T5)

*Verdict: minor edits.*

**Useful.** The only surface that works with no service at all — but it answered
the less useful half of its own question. "Opens in 2d 10h" is a sum the reader
does in their head, against a timezone the live line had stopped naming: it
overwrites the served text, which was the page's only mention of ET. Now "Opens
Monday 9:30am ET", countdown kept only while the event is today. The reason a
day is odd (holiday, half day) moved to its own element so it wraps whole.

**Easy.** Measured at 375px rather than eyeballed: five everyday states one row,
three rare ones a stable two, and the served and live lines now match at 34px,
closing a load-time shift the reserved height had not actually prevented.

**Beautiful.** It is the plainest thing on the page and should stay that way —
one quiet line above the tabs is right for something read in a glance.

**Performing.** Zero upstream calls, no network at all, and it renders before
any data arrives.

---

## 08-29 — Index summary strip (T6)

*Verdict: minor edits.*

**Useful.** It answers the first question a visitor has, and it is the only
surface that answers one without being asked.

**Easy.** Except on a phone — where it stopped being the thing it is. At
`minmax(180px)` a 390px viewport fitted exactly one column, so the strip became
730px of grid holding four readings that exist to be compared and could only be
read one at a time; 160px pairs them, 730px becomes 359px, and all four are on
screen together.

**Beautiful.** Yes, it is the part of the page a screenshot would lead with —
but it opened with "Charts, movers and fundamentals fill the rest of this panel
across T8–T12", a sentence written to the routine, shown to the reader, and
wrong from the day T8 shipped.

**Performing.** Four `/history` calls a day against a 22 budget, cached and
shared across every visitor, reserved heights so the fill shifts nothing, and a
stated "unavailable" when the service is down.

**The real defect was in the numbers.** The tile states two windows and named
only the second, so a red −0.79% for one session sat directly above a "30d"
belonging to the line. Every change now carries `1d`, set the same way and
directly above the `30d` it pairs with, and says "over the last session" aloud.

**Not fixed, filed as D3:** a tile shows a symbol and cannot open it.

---

## 08-30 — Symbol lookup and quote detail (T7)

*Verdict: minor edits.*

**Useful.** It is the only way to reach any symbol that is not one of the four
proxies, and the chart has no source without it — the page would lose half of
what it does.

**Easy.** Three keystrokes and Enter, the combobox model is right, and "apple"
opens Apple.

**Beautiful.** The numbers are set properly and the card holds up beside the
strip.

**Performing.** Two upstream calls per symbol against a 22 budget, issued
together rather than in sequence, cached and shared.

**Three defects, all of them things the card left the reader to work out.** The
change named no window — four windows meet on this card and the largest coloured
figure on the page named none of them, which is the T6 tile finding on the
surface that shipped before that rule existed; it carries `1d` and a spoken
phrase now. The range bands drew their own point and would not say it: the
marker is decorative, so a screen reader got a low and a high and none of the
placement they exist to give — each band ends in a spoken sentence now, silent
when the position is unknown. And the not-found message ended "the search list
above is all of them" while the failed lookup had just closed that list, so it
named an empty strip of screen; it names the symbols instead. Also fixed: a
failed lookup states its reason in the panel alone, and the panel was not a live
region, so the only thing ever announced was the advice.

---

## 08-30 — Price chart (T8)

*Verdict: minor edits.*

**Useful.** It answers the question a price cannot — what the thing has been
doing — and it is the only surface that reuses a series already paid for, so it
teaches at no cost. Pressing 5D inside a green six months is the cheapest lesson
on the page.

**Easy.** Except by finger. Traced in Chrome under mobile emulation: a tap fires
pointerdown, pointerup and pointerleave and **no pointermove**, which was the
only event the chart listened for — so the one gesture a phone has read nothing,
while the drag that did work threw its answer away on the lift, and the hint
named hover and the arrow keys. A pointerdown now reads, a touch lift keeps the
reading, a pointercancel withdraws it, and the sentence names the finger.

**Beautiful.** It is the second thing a screenshot of this page leads with, and
it never said what it was a chart of — the plot's `aria-label` named the symbol
from the first day and nothing on screen did, with the quote card a scroll and a
half above it on a phone. It carries `SPY proxy` in its head now, badge
included, because the strip promises proxies are labelled wherever they appear.
Its worst-looking state was the one no screenshot held: with a quote but no
series, the empty SVG stayed in flow and squeezed the message into a 209px
column against the left edge of a 969px dashed box, under a head still naming
the last symbol's window, beside five range buttons that moved `aria-pressed`
and redrew nothing. All four fixed, and `shoot.py --chart-no-history` means the
state has a picture now.

**Performing.** Measured rather than assumed — five range changes made **zero**
upstream calls, a redraw takes 8–16ms, and the 260-row fallback table builds in
25ms and only when opened.

**Looked at and left.** The end markers sit astride the plot border, because the
first and last sessions *are* the window's ends and the axis labels are pinned
to those same edges; and the price axis carries three labels on 1Y and 5Y
against six on 6M, because the step family jumps 25 to 50 — 650/700/750 across a
605–785 band is a scale you read rather than interpolate. Both are restated in
`js/chart-canvas.js`.

---

## 08-31 — Watchlist (T9)

*Verdict: minor edits.*

**Useful.** And it is the only surface that is *about the reader* — the strip
and the grid show what the market did, and this shows what the symbols they
chose did. But it was showing less about them than the strip shows about four
they did not choose: a watched row costs one `/history` call, the same single
call a tile costs, and it was keeping three numbers out of 260 bars and dropping
the rest. The tile above it drew a line from exactly that payload. The trend
column is free upstream and it is the answer to question one — a list of prices
is a lookup, a list of shapes is a scan.

**Easy.** Yes by keyboard, and no by finger, twice. The remove control measured
**28x22 on every viewport**, under the 24px WCAG 2.2 minimum on one axis, and it
deletes a row with no undo; the target is the whole cell now, 52x41 and 42x44,
hit-tested at all four corners rather than read off the rule. And the sort
headers marked only the sorted column — the other two changed colour on hover,
which a phone does not have, so two of three columns told a sighted touch reader
nothing.

**Beautiful.** It was the part of the page you would crop out, and **T10 is what
made that true** rather than any change to this surface — an eleven-row ranked
table now runs edge to edge directly above a table that stopped at 58% of the
column, which reads as a surface that failed to finish loading. Full width now,
and the trend column is what earns the width the figures could not.

**Performing.** Unchanged, and that is the point — no new call, no new route, no
new state; the bars were already being fetched and parsed.

**Looked at and left.** The provenance sentence under this table is word-for-word
the one under the strip, which is three identical sentences in one scroll — but
each surface makes its own claim about its own numbers, and a shared line would
be one surface speaking for another's data. Restated in `js/view-watchlist.js`.

---

## 09-01 — Sector grid (T10)

*Verdict: minor edits.*

**Useful.** And it is the only surface that answers the question the four tiles
cannot no matter how long you look at them: what the market did *underneath* the
index. The strip says SPY finished down 0.79%; this says materials rose 22% year
to date while financials fell. It teaches without being asked to, as well —
pressing 1M after YTD re-ranks the same eleven funds into a different order,
which is the whole lesson that a ranking is a function of its window.

**Easy.** One press to change it and none to read it, real buttons in a labelled
group with `aria-pressed` and a visible focus ring, and direction survives
greyscale twice over — an arrow and an explicit sign on the figure, and a bar
rounded on the end it grew towards. **But on a phone it stopped being the thing
it is.** Below 560px the narrow rule set `display: none` on the bar, so the
width §13 calls first was the one width where eleven ranked funds were a column
of figures — on a surface whose own stylesheet opens by saying the bar "is the
whole reason this is a list and not a table of figures". That rule's reasoning
was sound and aimed at the wrong target: three columns really do not fit, which
is an argument against the bar sitting *beside* the name and not against the
bar. Stacked under it, it gets 358px at 390px — longer than the 343px it has on
a tablet — and the breakpoint moved to 700px, because 560 is where three columns
first fit rather than where they first work.

**Beautiful.** Yes, it is the densest thing on the page and the diverging axis
is the best single idea on it.

**Performing.** 2.9KB on the wire, 6ms warm and 26ms cold, complete at 72ms with
the grid ready before `DOMContentLoaded` at 107ms, and **four window presses
made zero market-data calls** — only the beacon, one per press, carrying the
generic label. A redraw is 0.5ms.

**Looked at and left.** 319px of nothing between the longest sector name and the
start of the bar track at 1440. The alternative was built and shot rather than
argued about, and it is worse; see `DEC-059`.

---

## 09-02 — Fundamentals panel (T11)

*Verdict: minor edits.*

**Useful.** For a company, and it is the most explicitly educational surface on
the page — the explanations are the best writing on it and they teach without
being asked twice. But **fifteen of the seventeen symbols this build serves are
funds**, and the fund state was the common case answering with one number under
a sentence promising more: "What can be measured from its price is below" over a
lone beta, with 900px of nothing beside it. The two figures that fix it were
already being computed and thrown away — `beta()` pairs this symbol's daily
returns with the benchmark's and reads one number off the pairing, so volatility
and correlation cost nothing upstream and nothing on the wire worth measuring
(883 bytes to 952). Correlation is the one that earns its place twice: a beta is
a slope fitted through whatever is there, and 1.16 at a correlation of 0.61
means something quite different from 1.16 at 0.9 — the panel stated the slope
and never how much of the movement it explained.

**Easy.** Yes by keyboard, and the explanations are a real button with real
state. **But the layout was hiding the one relationship it explicitly teaches.**
The three margins are the same sale with one more cost taken off each time, and
in a single ten-figure grid they sat 819px apart across a row break at 1440 and
split again at two columns — while the copy under the third told the reader they
always fall in order. No ordering of one grid keeps a trio together at four
columns and at two, so the grid was the thing that had to go: four groups of
three now, each with a heading, each its own row, verified as one row at 1440,
768, 390 and 320 rather than eyeballed. The margins were not the only thing the
flow broke — a label that wraps pushed its value half a line below its
neighbours, so the groups share grid rows and the values sit on one baseline.

**Beautiful.** It was the part of the page you would crop out, ten unlabelled
numbers next to a sector grid with bars and a chart; four labelled groups is the
first structure it has had. The group headings had to be lifted to full ink,
because set muted at the figure labels' own size "AGAINST THE PRICE" and "MARKET
CAP" were the same thing twice.

**Performing.** Unchanged where it counts — one request per lookup, 4ms, **zero
calls against the 22-a-day budget** because filings come from EDGAR, and opening
the explanations makes no request at all.

**Looked at and left.** The fund panel still leads with a paragraph about what is
absent before showing what is present, which is the right order for a reader who
searched a ticker expecting a company. Restated in `js/view-fundamentals.js`.

## 09-07 — Reporting calendar (T12)

*Verdict: minor edits.*

**Useful.** For a company, decisively — nothing else on the page answers when a
filing landed or when the next one is likely, and it teaches while it does it:
the window is arithmetic on the company's own filing rhythm, it says so, and it
says companies move the date. For a fund it was a second copy of the paragraph
directly above it. Both panels opened on "No company files for SPY" and both
explained that a fund holds shares in companies that file their own, about
600px apart on a phone. Fifteen of seventeen catalogue symbols are funds, so
that pair is what most lookups actually produce. The calendar now answers only
for the dates and leaves the teaching where it already was and was better done.

**Easy.** No controls at all, so nothing to tab to and nothing to mis-hit; the
change column pairs green with an arrow and an explicit sign, and its window is
named once in the header. But it failed at width, and failed silently: at 375px
— the width §15 names — the table was 18px wider than its box, so the dividend
column read **"0.2" for a value of 0.26**. A cut number that still looks like a
number is worse than a missing one. It had been in that state since it shipped;
the body never overflows, so nothing failed. Fixed by shortening the three
column labels that were setting their columns' widths, not the figures. See
DEC-073, DEC-074.

**Beautiful.** At desktop it holds up beside the fundamentals panel it sits
under — same tabular figures, aligned columns, consistent decimals — and the
projected window reading as prose beside a date is the best-composed thing on
the surface. Left alone: the closing paragraph keeps a prose measure under a
full-width table, which leaves the right half of that row empty. That is a
measure doing its job, and the panel above does the same.

**Performing.** The cheapest surface on the page. Zero additional upstream
calls — it reads the `/fundamentals` payload the panel above already paid for
(DEC-032) — and it renders in the same tick, blocking nothing.

## 09-16 — Portfolio summary (T14)

*Verdict: minor edits.*

Judged from `shoot.py --tab trade` at every width in six states: a fresh
portfolio, `--portfolio held`, `corrupt`, `newer`, `--block-storage`, and held
with the service absent.

**Useful.** Yes — it is the Trade tab's answer, and nothing else on the page
says what the $100,000 became. The held shot adds up exactly: cash $49,908.04
plus holdings $50,231.33 is the $100,139.37 headline, and −$115.70 realized
plus +$255.07 unrealized is the +$139.37 return. The intro above it teaches
realized against unrealized in two sentences, which is the lesson the split
exists for. All three stored-state notices say what happened and what it
costs, above the figures they explain.

**Easy.** It failed in its commonest state. **A fresh portfolio read "−$0.00"
three times**: zero took the flat bar `▬`, which sits exactly where a minus
sign goes, muted grey like the figure — zoomed, "▬ $0.00" is a loss of
nothing. Every first visit sees that state, and a learner's first reading of
the game was that they had already lost money. Zero now carries no arrow;
unsigned and muted, "$0.00" has no direction to lose in greyscale. See
DEC-093. Second, **"$2,500.00 held for 1 open order" sat above two open
orders** — only buys hold cash, so the count was right and read as a miscount.
It now says "1 open buy". While there: an empty arrow slot kept its margin, so
"$0.00" and a pending "—" sat 5–7px off their labels' edge; an empty arrow is
`display: none` now. Mobile two-by-two holds at 390px, and no figure spills its
cell at 375 or 320.

**Beautiful.** It holds up beside the quote card it borrows its headline size
from: one large figure, a ruled breakdown under it, tabular digits aligned.
Looked at and left: the notices are red-tinted boxes beside a red realized
loss. That is the page-wide alert treatment — watchlist, lookup, strip and
chart use the same colour — so it is not this surface's to change, and an
alert in red is not misread as a direction.

**Performing.** An all-cash portfolio asks for nothing and renders at once.
A held one costs one `/history` per symbol held or on order — the same series
the ledger fills orders from, so valuing and settling share one payload
(DEC-032). Cash and realized gain draw before any price lands; the figures
needing every price dash until then, and with the service down they stay
dashed and the line under the card says how many positions could not be
priced.

## 09-16 — Order ticket and open orders (T15)

*Verdict: minor edits.*

Judged from `shoot.py --api --tab trade` at every width, fresh and
`--portfolio held`, plus held with no service. The ticket is a form, and every
state worth judging comes after typing, so those were reached with a scratchpad
driver built on `shoot.py`'s own server, proxy and storage seeds: a market and
a limit review, a sell past the holding, a buy past the cash, a placed order, a
symbol with no prices, and a cancel — each at 1440 and at 390 emulated. No
`shoot.py` flag reaches them; that is filed as `D20`.

**Useful.** Yes — it is the only way the game changes, and the part that
teaches the rule this game exists for. The review names the price an order
*will* take ("the open, 9:30am ET — not the last close shown above") before
the button, and a market buy says what it holds back and why: the last close
plus 5%, because the fill price is not yet known. The held shot's list shows
the rule working: a limit buy "open until its limit is reached", a market sell
due at a close, and a fill reported on load.

**Easy.** It said the rule before the button and then did not say the result.
**A buy of 500 SPY showed "$385,035.58 is held back … Free to spend:
$100,000.00"** and left the comparison to the reader; the refusal came only
after pressing. A sell of 50 against 25 held was the same. The module's own
header promises the reader meets the rule "before the button is pressed rather
than in a refusal afterwards", so both now end "— not enough for this order, so
it would be refused." A sell also read "About $36,670.06 before it fills",
which does not say what the figure is; it reads "at the last close" or "at your
limit" now, like a buy. Three lines contradicted the sample note beside them:
**"Order placed … It fills at the open"** directly under "here it will stay
open"; a stranded market order "waiting for that price to be published" above
a note saying no later price will arrive; and before any lookup, the timing
line pointed at "the last close shown above" with no close shown, and gave no
sample caveat though the portfolio had already priced sample data. All four
fixed. Keyboard: real buttons with `aria-pressed`, labelled inputs, a visible
focus ring. At 390 every field is full width and Cancel is 44px tall.

**Beautiful.** It holds up beside the summary above it: the one filled button
on the page, figures in the mono face, the three review lines as prose at a
72ch measure. Looked at and left: at 390 "25 SPY" can break across a line;
the "Filled:" reply sits under the *Open orders* heading, which is where the
order was when the reader last saw it; and a symbol with no prices still shows
the timing line, which is true and short.

**Performing.** One `/history` per symbol traded, cached for the page load, so
editing the quantity asks nothing; the catalogue is fetched on first focus of
the symbol field and costs no quota. The list itself asks for nothing — it
redraws from the store. Nothing here blocks the summary above it.

---

## 09-17 — Holdings, trade log and equity curve (T16)

*Verdict: minor edits.*

Judged from `shoot.py --api --tab trade` at every width, fresh and
`--portfolio held`, plus held with no service — and from a fourth state this
audit had to add, `--portfolio flat`: one position bought at the price it is
now worth. The queue asked for the gain column at exactly zero to be checked,
and reaching zero needed a seed, so the seed is committed rather than thrown
away.

**Useful.** All three earn their place, and they answer three different
questions the summary above them cannot. The holdings table says *which*
holding the summary's figure came from; the log is the ledger printed, which
is the page keeping its own promise that every figure is replayed from it
(DEC-082) rather than stored; and the curve is the only surface that answers
the question the game exists for — not "am I up?" but "am I up by more than
doing nothing?". A reader up $139.37 who is $1,777.12 ahead of buy-and-hold
has learned something no other line on the page tells them.

**Easy.** Two things it got wrong, both of them the surface leaving the reader
to work out what it already knew.

**A position worth exactly what it cost read "▬ $0.00".** The flat bar sits
where a minus sits, in the same grey, so at reading distance the row said a
small loss. This is DEC-093 exactly, one surface down and four sessions later,
and it is not a rare state: an order fills at a bar's open or close (DEC-085),
so *every* position reads zero from the moment it fills until the next bar —
a learner's first trade, every time. The summary an inch above had already
stopped saying it, so the page contradicted itself within one screen. Fixed,
and the rule now lives in `figures.gainArrowFor` rather than in two views that
disagreed.

**The empty trade log pointed the wrong way.** "No trades yet. The order
ticket below opens the first one" — the ticket is *above* it, between the
holdings table and the log. On a phone that is a scroll away from the control
it names, in the wrong direction. Now "above", with a test on the document
order that makes the sentence true.

Otherwise it is in good shape. Below 560px both tables become one block per
row with the long column name restored beside each figure, which is the right
trade for six money columns on a phone; every table role is written out so
that layout does not cost a screen reader the table (DEC-090); the log's
preview control says how many it is holding back, reports `aria-expanded`, and
keeps focus on itself after redrawing. The curve carries an `aria-label`
describing both lines and their figures. With no service the holdings table
keeps shares and average cost and dashes only what needs a price, and the
curve says which prices were missing rather than that something failed.

Looked at and left: the legend's two figures are direction-coloured and name
no window in their own row, which DEC-020 would normally catch — but the axis
above them and the verdict sentence below both name it, and the sentence is
what the surface is for. The trade log's Amount column is signed and
deliberately *not* coloured, because a buy leaving the account is a cash flow
and not a loss; that is right and worth not "fixing" later.

**Beautiful.** It holds up. The holdings table is the densest thing on the
page and reads cleanly at 1440 and 768 — tabular figures, consistent decimals,
one alignment per column set in the stylesheet rather than per cell. The curve
is the best-looking surface on the Trade tab: two lines on one shared scale
(the loser cannot be drawn above the winner), the benchmark dashed and grey so
the reader's own line is the amber one, a baseline at the starting balance,
and three round-dollar gridlines rather than an abbreviation nobody can
reconcile against real trades. Its dashed/solid distinction carries the two
lines without colour.

**Performing.** No upstream cost of its own: the two tables fetch nothing at
all, and the curve asks only for symbols the ledger touched that the Trade tab
is not already pricing — a closed-out position — so the `held` portfolio costs
it zero calls. Nothing here blocks anything above it rendering.

**But the client repeats itself.** Counted on one load of `--portfolio flat`,
a portfolio holding one symbol: `/history?symbol=SPY` is requested **four
times** — once by the index strip, then three more in the same tick as the
portfolio, the curve and the benchmark each ask independently. No quota is
spent, because the service caches (DEC-003) and every repeat is a hit, so this
is four round trips on a home connection where one would do. It is also not
T16's alone — the index strip is one of the four — and `js/market-data.js`
already solves exactly this for `fundamentals()`, with a comment saying two
surfaces start in the same tick. `history()` never got the same guard. Filed
as **D22** rather than fixed here, because it belongs to the network seam
every surface shares, not to the surface under audit.

Also filed: **D21**, a runner for `js/view-performance.js`. It had none, and
its header named `tests/performance_model.jxa.js` as though it did — a file
that has never existed. `js/view-positions.js` had none either; this audit
built `tests/positions_model.jxa.js` for it, which is what a rendered "▬
$0.00" needed in order to be caught by anything but an eye.

---

## 09-22 — Market clock (T5)

*Verdict: minor edits.* The first of the eleven `T13c` made due again, and the
surface broadsheet moved furthest: from a line under the nameplate to a
dateline level with it, right-aligned against the masthead.

**Useful.** Still the only surface that works with no service at all, and the
revamp sharpened what it is for. Every price on this page is an end-of-day
bar, and the clock is the one thing that says what "now" is against them — a
reader who does not know the market is shut has no way to read a stale figure
correctly. As a dateline it also does the job a dateline does on a front page:
it says what day the paper is for. It would be missed.

**Easy.** Measured at 375px across all eight sessions, not eyeballed at the one
the wall clock happened to be in: five everyday states sit on one row, and the
three with a reason — a holiday, a half day, Juneteenth's 37-character name —
take a stable two, with the reason wrapping whole. That is exactly what its own
element was built for and it still holds under the new measure. Colour is never
alone: the dot is colour, the word beside it says the same thing, and an
off-screen "US market" names the subject the word leaves out. The open dot's
pulse stops under `prefers-reduced-motion`. No control, so nothing to tab to.

**Beautiful.** Yes — and it is better as a dateline than it was as a line under
the nameplate. But right alignment inverted what the countdown's width does.
Left-aligned, a countdown growing a character pushed empty space; right-aligned
it pushes everything to its left, and the leftmost things are the status dot and
the OPEN/CLOSED word. At 1440px the line stepped **7.2px** crossing 1h00m to
59m59s and again at 10m00s to 9m59s — twice a session, on the one line meant to
be the page's fixed point. The `min-width: 12ch` on `.inc-clock-detail` was
supposed to prevent exactly this and never bound once: the shortest string that
element ever holds is 22 characters. Fixed by padding every unit in
`formatCountdown`, so a countdown is always seven characters and the line cannot
move in any alignment — the property, not the pixel, since a reserved width only
holds for the alignment it was measured in (DEC-033's shape again).

**Performing.** Unchanged and unbeatable: zero upstream calls, no network, and
it renders from the served markup before any script runs. It ticks once a
second but writes the DOM only when the string changed, so the common second is
a string comparison. Nothing on the page waits for it.

**Looked at and left.** Two things measured as faults and were not.

At 900–1024px on a holiday, the dateline's column takes 478px and the nameplate
wraps to two lines — the numbers said defect, the picture said otherwise:
"Incisor / Trading" stacked reads as a deliberate masthead, and better than the
single line. Recorded here so the next session does not "fix" it.

On mobile the clock sits *below* the masthead rule rather than above it, so it
is on the opposite side of that rule from where it sits on desktop. Left as is:
a dateline in a band under the masthead rule is what a narrow front page does.

**The tool cannot see this surface.** `shoot.py` photographs whichever session
the wall clock is in, and the clock derives everything from `new Date()` — so
eight of its nine states have never been photographed and cannot be. This audit
drove them with a scratchpad driver freezing `Date` before the page's scripts
run, the way the `T15` audit used one to reach a filled-in order ticket. Filed
as **D23**; without it the next audit of this surface judges one state again.

---

## 09-23 — Index summary strip (T6)

*Verdict: minor edits.* Second of the eleven `T13c` made due again. Broadsheet
turned four rounded cards into a ruled band; the tiles kept their contents and
changed their setting.

**Useful.** Yes, and it is the page's lead for a reason: four readings that say
what the market did, above the fold, before any interaction. But it was
answering half of its own standfirst. "Where the four most-quoted US indexes
finished the last session, **and the shape of the month behind each one**" —
the session half is three figures and an arrow; the month half was a picture
and nothing else.

Each sparkline is scaled to its own symbol's thirty-day high and low. That is
right for reading one shape and wrong for the thing four tiles in a row invite.
On the fixture data the four months were **−4.44%, −7.66%, −5.25% and −7.82%** —
QQQ's nearly double SPY's — and because each line is normalised to its own
range, all four end between 88% and 95% of the way down their own box. The grid
drew four near-identical pictures of four materially different months, which is
worse than saying nothing: it is an answer, and it is wrong.

The size of the move did exist, in exactly one channel — the sentence the
sparkline hands a screen reader, `"SPY thirty-day trend: down 4.44 percent over
the period"`. So the spoken page was more precise than the seen one, which is
`DEC-060`'s trap arriving from the far side: the channel that usually goes
missing was the only one that had it.

**Fixed** by printing the figure beside the line, coloured by its own direction
with its own arrow, right-aligned above the `30d` token that already named the
window. It cost no fetch — `draw()` computes that percentage to write the
sentence it was already writing (`DEC-032`).

**Easy.** At 375px the tiles are 171px wide, and the figure did not fit beside
a line worth looking at: it took the sparkline from ~100px to 42px, 1.4px a
session, which is a texture rather than a shape. So the row wraps on the
sparkline's own minimum (110px, ≈3.7px a session) rather than on a viewport
breakpoint — the same tile is too narrow through the middle of the range and
wide enough at both ends, because the grid goes four-across again at 760px. The
line now measures 127–173px everywhere and is **wider at 375px than before this
audit**. The figure's placeholder reserves the width of the figure that
replaces it, so landing cannot flip the row from one line to two: measured
pending-to-ready at 375, 390, 900, 960, 1000, 1040, 1100 and 1200px, tile
height identical at every one. Colour is never alone — arrow and explicit sign.
Aria-hidden, because the sparkline's own name already says it in words: one
statement per channel, not one channel.

**Beautiful.** Better than before, and in a way that was not the point of the
change: right-aligning the percentages in a fixed 7ch box sets the four months
in a column, and the `1d` and `30d` tokens now sit in one rule down the right
edge of every tile. The wrapped mobile arrangement — full-width line, figure
beneath it — reads more like a broadsheet chart than the squeezed row did.

**Performing.** Unchanged, which is the whole point: four `/history` calls, one
per tile, cached server-side, four of the 22-call budget (`DEC-003`). The
figure is arithmetic on bars already in hand and is written in the same pass
that draws the line. Nothing new blocks, nothing new fetches.

**Looked at and left.** The dotted opening-level line stays. With a figure
beside it, it is no longer carrying a fact alone — it now shows *where* in the
month the level was crossed, which the percentage cannot.

A shared percentage scale across the four tiles was the obvious alternative and
is the wrong trade: it would make the lines comparable by flattening the
smallest of them to 45% of its amplitude at 34px tall, buying with the shape
exactly what the figure now gives for free. Recorded as `DEC-101` so it is not
rebuilt.

**The same defect is one surface over.** The watchlist draws this sparkline
from the same payload under a `Trend / 30d` header and states no figure either,
across up to eight rows the reader *chose* — where the comparison is the point
of the surface, not a side effect of the layout. Its own header comment says
the column is not sortable because "a ranking by shape is not a thing a reader
can ask for", which is the tell: with a figure it would be. Filed as **D24**
rather than fixed here — one surface per audit.

---

## 09-24 — Symbol lookup and quote detail (T7)

*Verdict: keep.* Third of the eleven `T13c` made due again, and the first
re-audit to change nothing. Broadsheet reset the card's measure and its rules
and left its contents alone; everything this audit went looking for turned out
to be already reasoned about, in a comment, next to the code.

**Useful.** Yes, and more so than when it was first audited. It is still the
only route to any symbol that is not one of the four proxies, and three
surfaces that did not exist on 08-30 now hang off it: the fundamentals panel
opens on a quote, the Watch toggle is offered on a quote, and the chart draws
the series the lookup already fetched. Removing it would take most of the page
with it.

**Easy.** The combobox model is unchanged and still right. What this audit
checked instead was the thing that would be invisible from the source — what a
reader is told when the answer is no, which on a 17-symbol fixture build is
most of the time.

The catalogue holds **65 symbols**; fixture mode can answer for **17**. The
gap is exactly where a search box invites a reader to ask for something it
cannot deliver, and `/symbols` closes it: in fixture mode it intersects
`catalog.py` with the committed JSON and returns `exhaustive: true`, so the
dropdown only ever offers what will resolve. Typing `tes` offers nothing and
the hint says why in words a reader can act on — *"Nothing matches “tes”. This
build serves sample data for a handful of symbols, so the list is short."*
`NVDA` is in the catalogue and not in the fixtures, and gets the same honest
answer rather than a suggestion that dead-ends. A free-typed `PLTR` reaches
the panel and is refused by name, with the seventeen listed.

**Looked at and left:** while the list is open it sits over the hint line, so
*"1 match. Press Enter to open it."* is occluded in the one case where it
applies. Left because the list is its own affordance — a visible row under a
text field is not a thing readers need told — and the sentence is still the
input's `aria-describedby`, so the channel that cannot see the list keeps it.

**Beautiful.** It holds up. Figures are tabular and the two range bands line
up on one rule; the card, the chart and the panel below share a measure now
that they did not before `T13c`. One blemish, and it is the arrangement rather
than the surface: at 1440px the card runs ~225px past the bottom of the chart
beside it, so the right column empties while the left is still going. At
tablet and below the columns stack and it does not arise.

**Performing.** A lookup costs **three browser requests and two of the 22
daily calls** — `/history`, `/quote`, and `/fundamentals`, which is EDGAR and
off the budget (`DEC-041`). The second call was the thing worth re-checking,
because `DEC-003` says tiles read `/history` alone and never `/quote`, and the
same argument would retire `/quote` here and halve the cost of the page's
central interaction.

It does not. `/history` carries the year the 52-week range is measured over
and the average volume today is compared against; `/quote` carries the current
session's own open, high, low and volume, which a daily series does not hold
while that session is still running. Alpha Vantage's free tier is **15-minute
delayed as well as EOD**, so the in-progress session is real in live mode and
the second call buys something. Verified against `DATA-PROVIDER.md` rather
than against the comment that claims it.

A symbol already on the strip re-requests `/history` — `D22`'s seam joins
requests in flight, and the strip's finished long before — but the service
answers it from its own cache, so it costs a round trip and no upstream call.
That is the arithmetic the watchlist's eight-symbol cap is written against,
and it holds.

**The range bands are not `DEC-103`, and the next session should not fix
them.** They look like the trap: a drawing scaled to its own window, with the
placement stated only in an `.inc-offscreen` sentence — *"Last price 273.78
sits 68% of the way up this range."* The difference is that a sparkline's
scale is nowhere on screen, so its shape cannot be interpreted at all, while
these bands print their low and their high at each end. The scale is stated,
the marker sits inside it, and a reader can read the position off the drawing.
Adding "68%" beside it would buy precision the bar is not drawn to and clutter
a card that is already dense. → `DEC-104`

**One defect found, and it belongs to the chart.** After a refused lookup the
panel below says *"No chart for PLTR. The lookup above did not come back."*
The lookup did come back — with a definite answer, which the card two inches
above is at that moment spelling out symbol by symbol. `view-price-chart.js`
has two blanks, one for a request that failed and one for a lookup that
failed, and the second is worded as the first. Filed as `D26` against `T8`,
whose audit is the next one in this queue.

---

## 09-24 — Price chart (T8)

*Verdict: minor edits.*

Fourth of the eleven `T13c` made due, and the second piece of work in a session
that opened with `D26` — a defect filed against this surface by the previous
audit. The defect was fixed first and separately; what follows judges what was
left.

**Useful.** The strongest surface on the page, and the only one that answers a
question the card beside it cannot: what the thing has been *doing*. It still
costs nothing — it draws the `/history` payload the quote panel already holds
— and it is honest about what it does not have. Pressing 5Y on a fixture
symbol gives `OVER THE 260 SESSIONS HELD` in the head and a note underneath
saying *"5Y is the whole series held for SPY — 260 sessions — rather than five
years."* A chart that says it could not honour the button it just drew is
teaching something most real ones hide.

**Easy.** All three input channels are present and none is the only one: the
range buttons carry `:focus-visible` rings, the plot takes focus and arrows
step the cursor, and a tap reads the day under it — the `DEC-024` fix from the
first audit, still covered by a runner assertion that a move alone never
fired. The hint names all three in the sentence under the plot. Range buttons
measure 67x27 CSS px at 390px, clear of the 24x24 WCAG 2.2 floor. Nothing is
carried by colour alone: direction is an arrow and a sign as well as green or
red, and the pressed range has a filled background, not just an accent.

**Beautiful.** This is where the edit came from, and it is a proportion
problem rather than a decoration one. `--inc-chart-height` was a constant —
240px above 700px wide, 190px below — while the plot's *width* is whatever the
column gives it. So the same six months draw at **720x240 (3:1) at 1440px**
and **300x185 (1.6:1) at 390px**: the widescreen flattens the line, and the
page's most prominent drawing reads as a calmer market than the identical data
does on a phone. It also left the right column short — the chart ended ~235px
above the card beside it. The token now steps to **320px at 1100px and up**,
giving 2.25:1 and closing that gap to ~142px. Tablet and mobile are below the
breakpoint and are byte-for-byte unchanged. A step rather than an
`aspect-ratio`: the plot is a flex child beside a fixed-width scale gutter
inside a row that takes this height, and sizing it from its own width would
move where the gutter's labels land.

**Performing.** Measured again rather than inherited. Three runs — 6M resting,
5D pressed, 5Y pressed — each reported `requests busiest visitor 13 of 60`,
identical. **A range change still costs zero upstream calls**, which is the
whole reason five ranges are affordable at 22 calls a day. The fallback table
is still built only when opened.

**Looked at and left.** The dashed horizontal rule across the plot is the
level the window opened at, and it is the reason `DEC-010` can forbid
colouring the line — it says whether the range ended above or below its start
without the drawing taking a side. Nothing on screen names it, which has the
shape of `DEC-060`, and it is not: the figure directly above it states the
same movement in words and colour (`OVER SIX MONTHS` / `+78.41 +11.97%`), so
the mark is the picture of a fact the head already gives. This is `DEC-104`'s
argument, one surface over. The reason is already in `js/chart-canvas.js`
beside the line that draws it, which is where guide §16 says a
single-surface decision belongs, so it earns no index row and no backlog
entry — adding a legend is the change to *not* make.

Also left: the price axis still carries three labels on 1Y and 5Y against six
on 6M, restated in `js/chart-canvas.js` and unchanged since 08-30; and the
no-history box is now 320px of dashed empty at desktop, which is the reserved
space working as §13 asks rather than a hole — the alternative is the layout
shift the first audit removed.
