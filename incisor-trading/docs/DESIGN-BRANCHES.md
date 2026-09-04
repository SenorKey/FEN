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

_None registered yet — the first round is task T13b, after the dashboard is
complete enough to be worth looking at._

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
