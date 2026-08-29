# Incisor Trading — verification

```
cd incisor-trading/tests && python3 -m unittest discover
```

Stdlib only, no dependencies, no network. Six suites:

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

The last four drive the shipped modules through `*_model.jxa.js` runners.
`dom_stub.jxa.js` is the DOM those runners share — narrow on purpose, so a
view reaching for something it never documented fails loudly rather than
going quietly untested.

**These do not replace a browser.** They cannot see layout, contrast, spacing or
the 375px pass, and they never will. They exist because a scheduled session runs
unattended and cannot start the dev server, so without them the whole page would
ship on inspection alone. When a browser is available:

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

The service enforces a 60-request-a-minute per-IP limit and one `shoot.py` run
makes about 21 requests across its three viewports. Three runs back to back
trip it, and the page then correctly shows its "market data unavailable" state
— which looks like a broken screenshot and is a working rate limiter. Leave a
minute between runs.
