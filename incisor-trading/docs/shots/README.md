# Screenshots

Written by `tools/shoot.py`, which is also the check that fails a session on a
console error or horizontal overflow. A green run means nothing is broken; these
images are how anyone finds out whether it looks good.

## What is kept

The newest set for the page **as it stands now**, plus any set showing a state
that one does not — service stopped, storage blocked, a chart range, a symbol
that does not exist. Superseded sets are deleted rather than accumulated: an old
set is worse than no set, because it shows markup that no longer exists to
someone trying to review what does.

## Widths

`shoot.py` writes desktop, tablet and mobile. **Tablet is kept only where it
shows something the other two do not**, which is usually where a layout changes
between 768 and 1440. For most surfaces it is the desktop picture at a narrower
measure, and this repo is served off a home connection — so it is deleted, and
the set says so here rather than in a README of its own. `t10-sectors-fell/`
keeps its own note because its reason is about the axis rather than the width.

Sets currently at desktop and mobile only: `t9-watchlist`, `t9-watch-toggle`,
`t9-storage-blocked`. The watchlist's one width-dependent behaviour is the trend
column, which is present at 768 and at 1440 and hidden below 460 — so desktop
and mobile bracket it and tablet sits in the middle saying neither.

`t10-sectors` keeps its tablet shot for the opposite reason. The grid stacks its
bar under the sector name below 700px and sets it beside the name above, so
desktop and mobile show the two layouts — and 768 is the tightest the beside
layout ever gets, 68px above the breakpoint, where the bar is 343px rather than
the 544px desktop gives it. If that width ever stops working, this is the only
picture that would show it.
