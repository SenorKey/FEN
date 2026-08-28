# Incisor Trading — service tests

```
cd incisor-trading/server && .venv/bin/python -m unittest discover tests
```

Needs the dependencies in `requirements.txt`:

```
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

Everything runs in fixture mode against a temporary database, so no test
touches the network, the real data directory, or upstream quota. Live mode is
covered only where it can be without a network — URL construction, failing
closed without a key, and key redaction.

- **`test_incisor.py`** — behaviour through Flask's test client: `/health`,
  origin checking, both rate-limit gates, symbol validation, and response
  hygiene (generic errors, JSON 404s, security headers).
- **`test_provider.py`** — the parser in isolation: pure dicts in, typed values
  or `ProviderError`s out. Covers the shapes upstream uses to say no, all of
  which arrive as HTTP 200 with a prose message.
- **`test_fixture_layer.py`** — the read routes end to end over committed JSON,
  including the T3 acceptance criterion: `TestNoNetworkAccess` replaces every
  socket constructor with one that raises and drives a full request through the
  real route stack, so "no network access" is asserted rather than assumed.
- **`test_cache.py`** — the snapshot cache, the price store and the daily call
  budget. `TestOneCallPerSymbol` is the T4 acceptance criterion, including the
  concurrent version: four threads asking for one symbol at once must still
  produce a single call.
- **`test_catalog.py`** — the committed symbol-to-name table and `/symbols`.
  The route must never offer a symbol nothing can price, so in fixture mode it
  lists what is on disk and says the list is complete; the table itself must
  never carry a figure, because prices belong to the market service.
- **`test_http_smoke.py`** — the same service on a real socket, driven with
  real HTTP. A WSGI app can satisfy every test-client assertion and still fail
  to boot; this is what proves it serves.
