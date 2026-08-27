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
| Desktop | `docs/shots/<name>/desktop.png` |
| Mobile | `docs/shots/<name>/mobile.png` |
| Dark | `docs/shots/<name>/dark.png` |

**Strongest at:** <where this look earns its keep>
**Weakest at:** <where it struggles — dense tables, small screens, whatever>

-->

---

## Retired

Directions Key has ruled out. Kept for the record so the same idea isn't tried
twice.

_(none yet)_
