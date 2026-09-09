# Incisor Trading — Design branches

The review shelf. Every distinct visual direction the routine builds is
registered here, so choosing between them is browsing one file rather than
digging through `git branch`.

**An unregistered branch does not exist.** If it isn't in the table below with
screenshots, assume it was never finished.

Nothing here is merged. Key picks a direction, says so, and only then does it
become the main look.

---

## How to review one

```bash
git checkout incisor-look/<name>
```

Then serve the site and open the page:

```bash
python3 -m http.server 8765
```

`http://localhost:8765/incisor-trading/` — the dashboard renders from committed fixtures,
so no API key or running backend is required to judge the look.

Back to the working line when done:

```bash
git checkout incisor-dev
```

---

**Where the images go.** `docs/shots/look-<name>/` — the `look-` prefix is not
cosmetic, it is what the gitignore exception matches. Every other screenshot set
is local only, because they are reproducible from the code; a look branch's set
is committed so this shelf can be browsed without checking out each branch in
turn. A set filed anywhere else will not be committed and the shelf will show
nothing.

## Directions

Two, and they are deliberately opposed. Both start from the same finished
dashboard and answer the same question — *what is a reader doing here?* — in
opposite directions, so choosing between them is a choice about the page rather
than about a palette. Neither changes a hook, a state, a colour or a line of
markup: each is one stylesheet loaded last and one `<link>`, so what the
direction does is the whole of its diff, and deleting the link returns the page
to `incisor-dev`.

### `incisor-look/broadsheet` — the market page of a newspaper

**Registered:** 2026-09-08 · **Based on:** `incisor-dev` @ `78cc3bb` · **At:** `9fb6cde`

The page already writes like an editorial: a Playfair headline over every
surface, a paragraph under it explaining what you are about to look at, a market
clock that reads as a dateline. It then renders as a column of rounded cards
1120px wide with a third of a desktop screen unused either side. This direction
stops the page arguing with itself — a 1320px measure, hairline rules where the
card fills were, the four proxy tiles as one ruled band, the clock set level
with the nameplate as a dateline, and the quote card beside its own chart
instead of 700px above it.

What it trades away is density. Nothing is boxed, so nothing is separated by
anything stronger than a rule and some air, and a reader skimming for one figure
has fewer edges to aim at. It is the better page to read and the worse page to
operate.

| | |
|---|---|
| Desktop | `docs/shots/look-broadsheet/desktop.png` |
| Tablet | `docs/shots/look-broadsheet/tablet.png` |
| Mobile | `docs/shots/look-broadsheet/mobile.png` |

**Strongest at:** the lead. Search, price and chart become one thought instead of
three screens, and the tile band reads as a market summary rather than four cards.
**Weakest at:** the long tail. Below the fold it is still a single column of
full-width tables, and without fills the fundamentals panel's four groups have
little to hold them apart.

### `incisor-look/workbench` — an instrument, not a document

**Registered:** 2026-09-08 · **Based on:** `incisor-dev` @ `78cc3bb` · **At:** `c44a937`

The opposite bet. A page you *use* — look a symbol up, read its chart, add it to
a list, look the next one up — wants its context to stay put while the middle
changes. So the masthead and the market clock move into a 300px rail down the
left, the clock pinned there the whole way down the page; the tab strip sticks
below the site nav so the mode switch is reachable from anywhere in a 4,000px
panel; every surface gets a real edge and a tinted label strip; and Playfair
gives way to the figure face, which puts headings and the numbers under them in
one typeface for the first time.

What it trades away is warmth and the site's voice. Uppercase mono labels state
what a surface *is* and stop narrating what it is *for*, which costs the page
some of the teaching tone guide §13 asks it to keep. It is the better page to
operate and the worse page to read.

| | |
|---|---|
| Desktop | `docs/shots/look-workbench/desktop.png` |
| Tablet | `docs/shots/look-workbench/tablet.png` |
| Mobile | `docs/shots/look-workbench/mobile.png` |

**Strongest at:** never losing your place. The clock and the mode switch are on
screen at any scroll position, and the module edges make the page scannable.
**Weakest at:** the rail below the clock, which is 3,000px of empty margin at
desktop — it holds two things and has room for six. If this direction is the one,
the watchlist belongs in it.

### What a third round should try

Neither of these questions the *order* of the page: both keep index strip →
sectors → lookup → watchlist, one surface after another, every surface always
present. A third direction worth building would make the page one surface at a
time — the symbol you are looking at filling the screen, everything else
collapsed to a spine — which is a different answer again rather than a third
arrangement of the same list. Filed as `O2`, not attempted here: two finished
directions beat three unfinished ones, and guide §8 wants each one complete
enough to judge.

<!-- Template for each entry. Copy it, fill it in, newest at the top.

### `incisor-look/<name>` — <one-line concept>

**Registered:** YYYY-MM-DD · **Based on:** `incisor-dev` @ `<short sha>`

<Two or three sentences: what this direction is going for, and what is
actually different about it — layout, hierarchy, density, type, motion. Say
what it trades away, not only what it wins.>

| | |
|---|---|
| Desktop | `docs/shots/look-<name>/desktop.png` |
| Mobile | `docs/shots/look-<name>/mobile.png` |
| Dark | `docs/shots/look-<name>/dark.png` |

**Strongest at:** <where this look earns its keep>
**Weakest at:** <where it struggles — dense tables, small screens, whatever>

-->

---

## Retired

Directions Key has ruled out. Kept for the record so the same idea isn't tried
twice.

_(none yet)_
