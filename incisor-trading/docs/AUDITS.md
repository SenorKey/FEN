# Incisor Trading — Audits, in full

The four answers behind every row in `BACKLOG.md`'s audit log. **This file is
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
