# Incisor Trading — verification

```
cd incisor-trading/tests && python3 -m unittest discover
```

Stdlib only, no dependencies, no network. Two suites:

- **`test_page.py`** — the page's structure: ARIA tab wiring, the hidden-page
  rules, telemetry hygiene, CSP readiness, and the house rules from guide
  sections 5, 6 and 13.
- **`test_tab_behaviour.py`** — runs the real `incisor.js` in JavaScriptCore
  (via `osascript`, which ships with macOS) against a DOM stub built from the
  real `index.html`, and drives the keyboard model. Skips on other platforms.

**These do not replace a browser.** They cannot see layout, contrast, spacing or
the 375px pass, and they never will. They exist because a scheduled session runs
unattended and cannot start the dev server, so without them the whole page would
ship on inspection alone. When a browser is available:

```
python3 -m http.server 8765
```

then open `http://localhost:8765/incisor-trading/`.
