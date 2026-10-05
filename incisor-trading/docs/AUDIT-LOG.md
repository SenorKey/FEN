# Incisor Trading — audit log

One row per audit, newest last (guide §18). **Read in full every session**, at
step 2 with `DECISIONS.md` and `BACKLOG.md`: a surface with no row here and three
or more sessions behind it **is due**, and a due audit is taken at step 4 of the
session protocol *instead of* the next backlog task — one per session. A *keep*
verdict still writes a row; that row is what stops the surface coming up again.

**The row is the record; the four answers are in `AUDITS.md`**, under a heading
naming the same date and task. Open the detail only to act on a verdict. A test
asserts the bijection both ways, and caps a row at 200 characters.

Its own file since 09-26, and its own ceiling — `DEC-106`. At the ceiling the
consolidation is a known one: a surface re-audited under a later design has an
earlier row that is now history, and the two collapse to the later verdict
carrying the earlier finding's date. Do that rather than raise the number (§16).

## The queue

**T13c made all eleven due again**, oldest first: every row written before 09-22
was written against rounded cards in DM Sans, and broadsheet changed the measure,
the fills, the rules and the face of all of them (§18 — a revamp touching a
surface makes it due, whatever its last verdict).

**All eleven are down** — clock 09-22, index strip 09-23, symbol lookup and
price chart both 09-24, watchlist 09-26, sector grid and fundamentals panel
both 09-27, reporting calendar 09-29, portfolio summary 10-01, order ticket
10-03, holdings tables 10-04. That closes the dashboard's original six, the two
`T13c` reached second, and all three Trade-tab surfaces. Every verdict was
*minor edits*; none was a *keep* but the symbol lookup's.

**The queue is empty, so nothing is due and step 4 falls through to the
backlog** — `T13d` next. It fills again the ordinary way: a surface three or
more sessions old with no row, which now means a surface shipped from here on,
or any of these eleven the next revamp touches. `N17` is retired with the
queue that raised it: eleven consecutive audits did sit ahead of `T13d`, and
the answer turned out to be that they ran out.

## The log

| Date | Feature | Verdict | The finding, in one line |
|---|---|---|---|
| 08-29 | **Market clock** (T5) | Minor edits | It answered the less useful half of its own question: "Opens Monday 9:30am ET" beats a countdown. |
| 08-29 | **Index summary strip** (T6) | Minor edits | A tile stated two windows and named only the second; every change carries `1d` now. D3 filed, not fixed. |
| 08-30 | **Symbol lookup and quote detail** (T7) | Minor edits | Three defects, all of them things the card left the reader to work out. Two upstream calls a symbol. |
| 08-30 | **Price chart** (T8) | Minor edits | A tap fires no `pointermove`, so the one gesture a phone has read nothing. Five range changes: zero calls. |
| 08-31 | **Watchlist** (T9) | Minor edits | It kept three numbers out of 260 bars, and the trend column was free. Remove target 28x22, under WCAG 2.2. |
| 09-01 | **Sector grid** (T10) | Minor edits | Below 560px the bar was `display: none` — the one width where a ranked list was a column of figures. |
| 09-02 | **Fundamentals panel** (T11) | Minor edits | Fifteen of seventeen symbols are funds, and the fund state answered with one number under a fuller promise. |
| 09-07 | **Reporting calendar** (T12) | Minor edits | At 375px a 0.26 dividend read "0.2": the table was 18px over its box, and a body that never overflows hid it. |
| 09-16 | **Portfolio summary** (T14) | Minor edits | A fresh portfolio read "−$0.00" three times: the flat bar sits where a minus goes. And "1 open order" sat above two. |
| 09-16 | **Order ticket and open orders** (T15) | Minor edits | It said the rule before the button, then left the reader to find the refusal after it. Sample fills were promised. |
| 09-17 | **Holdings, trade log and equity curve** (T16) | Minor edits | A position worth what it cost read "▬ $0.00" — DEC-093, one surface down. The empty log pointed at a ticket above it. |
| 09-22 | **Market clock** (T5) | Minor edits | Broadsheet right-aligned it, so a growing countdown pushes the dot and the state word 7.2px, twice a session. The 12ch reserve never bound. |
| 09-23 | **Index summary strip** (T6) | Minor edits | Months of −4.4% and −7.7% drew the same picture: every line is scaled to its own range. The size existed only in the aria-label. |
| 09-24 | **Symbol lookup and quote detail** (T7) | **Keep** | 65 catalogue symbols, 17 answerable, and the dropdown offers only what resolves. Both calls earn their place. D26 filed on the chart. |
| 09-24 | **Price chart** (T8) | Minor edits | One height at every width: 720x240 at desktop against 300x185 on a phone, so the widescreen flattened the line. 320px from 1100px up. |
| 09-26 | **Watchlist** (T9) | Minor edits | Below 620px the line is `display: none`, and it carried the month's only sentence: 8 in the tree at desktop, 0 on a phone. |
| 09-27 | **Sector grid** (T10) | Minor edits | The window buttons are a copy of the chart's ranges, and the original grew a narrow rule the copy never got: 68.4x28 against 39.2x26 at 390px. |
| 09-27 | **Fundamentals panel** (T11) | Minor edits | The stylesheet says "three across, at every width" and set the flow, not the track count: four columns, three filled, 315px dead of 1240. |
| 09-29 | **Reporting calendar** (T12) | Minor edits | Below 700px "from 1.95" was `display: none`, so the tree read `+2.56%` alone: the baseline is in no other cell. |
| 10-01 | **Portfolio summary** (T14) | Minor edits | Figures are nowrap and their tracks came from round widths: a $10,000 gain overran a 320px cell, and every check was seeded with three figures. |
| 10-03 | **Order ticket and open orders** (T15) | Minor edits | The review said the order would be refused; the button under it stayed filled gold, four lines below the clause saying so. |
| 10-04 | **Holdings, trade log and equity curve** (T16) | Minor edits | The trade cell was left-aligned, its header was not: "Trade" sat 240px from its data. No seed reached the log's control. |
