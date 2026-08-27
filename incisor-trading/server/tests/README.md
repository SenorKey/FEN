# Incisor Trading — service tests

```
cd incisor-trading/server && .venv/bin/python -m unittest discover tests
```

Needs the dependencies in `requirements.txt`:

```
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

Everything runs in fixture mode against a temporary database, so no test
touches the network, the real data directory, or upstream quota.

- **`test_incisor.py`** — behaviour through Flask's test client: `/health`,
  origin checking, both rate-limit gates, symbol validation, and response
  hygiene (generic errors, JSON 404s, security headers).
- **`test_http_smoke.py`** — the same service on a real socket, driven with
  real HTTP. A WSGI app can satisfy every test-client assertion and still fail
  to boot; this is what proves it serves.
