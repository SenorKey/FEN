# Incisor Trading — verification

```
cd incisor-trading/tests && python3 -m unittest discover
```

Stdlib only, no dependencies, no network. Named rather than counted, because
the count went stale three suites ago:

- **`test_page.py`** — the page's structure: ARIA tab wiring, the hidden-page
  rules, telemetry hygiene, CSP readiness, and the house rules from guide
  sections 5, 6 and 13.
- **`test_tab_behaviour.py`** — runs the real `incisor.js` in JavaScriptCore
  (via `osascript`, which ships with macOS) against a DOM stub built from the
  real `index.html`, and drives the keyboard model. Skips on other platforms.
- **`test_market_clock.py`** — the clock against fixed datetimes, including a
  half-day and a holiday.
- **`test_index_strip.py`** — the four proxy tiles, filled, failed and mixed.
- **`test_symbol_lookup.py`** — symbol search and the quote panel, driven by
  real keystrokes and clicks: the combobox keyboard model, the figures, and
  the not-found state.
- **`test_price_chart.py`** — the price chart: the geometry against
  hand-computed coordinates, and the view driven by real range clicks, pointer
  moves and arrow keys.
- **`test_watchlist.py`** — the stored list, the sort model, and the call
  arithmetic behind its cap of eight.
- **`test_sectors.py`** — the eleven-fund ranking and its diverging axis.
- **`test_fundamentals_panel.py`** — the filings panel, for a company and for
  a fund, which is the state most symbols here are in.
- **`test_shoot_tool.py`** — not the page: `tools/shoot.py`'s stand-in for
  Apache. It has to identify its callers the way a real proxy does, or its
  findings are about itself (D7).

All but the first and the last drive the shipped modules through
`*_model.jxa.js` runners. `dom_stub.jxa.js` is the DOM those runners share —
narrow on purpose, so a view reaching for something it never documented fails
loudly rather than going quietly untested.

**These do not replace a browser.** They cannot see layout, contrast, spacing or
the 375px pass, and they never will.

That is not a caveat — it is where the defects have actually been. T9, T10 and
T11 each shipped with two, and all six were found in the `shoot.py` images with
both suites green: a `[hidden]` attribute defeated by an author `display` rule,
a notice that only appeared after the thing it warned about, bars overflowing
their track, sector names wrapping, explanations set in the wrong face, and a
heading calling a fund a company. A green run means nothing here is broken in a
way a DOM stub can reach. Look at the pictures.

They exist because a scheduled session runs unattended and cannot start the dev
server, so without them the whole page would ship on inspection alone. When a
browser is available:

```
python3 -m http.server 8765
```

then open `http://localhost:8765/incisor-trading/`.

Unattended, `tools/shoot.py` is the visual check, and `--symbol` / `--search`
reach the states that only exist after an interaction:

```
./.devtools/bin/python tools/shoot.py --out docs/shots/x --api http://127.0.0.1:8789 --symbol SPY
```

`--range 5Y` presses a chart range after the symbol loads, which is the only
way to shoot a range other than the default.

Run it as often as you like. Each browser context is a separate visitor with
its own address, so a run costs the service nothing another run has already
spent — the pause this used to ask for was D7, and the fix was to stop
collapsing four readers into one.

Every run prints what the busiest of them cost:

```
  requests busiest visitor 14 of 60 allowed -> 4 simulated readers
```

That number is worth watching. It grows every time a surface lands, and the
run fails if one page load ever outgrows the per-IP allowance a real reader
gets — at which point the fix is in the page, not in the tool.
