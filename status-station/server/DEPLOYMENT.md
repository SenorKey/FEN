# Status Station — deployment & runbook

Operational reference for the **FEN Status Station**: one daemon that
probes the local services, tails the suggest service journal, reads its
SQLite, collects page-interaction beacons, and serves a LAN-only dashboard.

Companion doc to `preside-by-side/server/DEPLOYMENT.md` — same machine,
same patterns, same conventions.

---

## Architecture

```
Browser (visitor) ──POST /api/event──> Apache ──proxy──> Status Station (Flask)
                                       :443              127.0.0.1:8788
                                                            │
You (LAN / ssh tunnel / RustDesk) ──GET /────────────────────┤  dashboard
                                                            │
                          ┌──────────────┬─────────────────┼──────────────┐
                          ▼              ▼                 ▼              ▼
                    HTTP probes    systemctl         journalctl -f   SQLite
                    Ollama :11434  is-active         (suggest unit)  events.db (rw)
                    Suggest :8787  httpd/ollama/                     suggestions.db (ro)
                    vhost :443     suggest
```

- **Probes** every 15s: Ollama (`/api/version`), the suggest API
  (`/ratings/washington` — any 200 means up), and the Apache vhost via
  `https://127.0.0.1/` with a `Host:` header (the router has no NAT
  loopback, so the public hostname is unreachable from the LAN; this
  verifies Apache + vhost + TLS termination locally). Per-target rolling
  1-hour uptime %.
- **systemd states** for `httpd`, `ollama`, `preside-by-side-suggest`.
- **Service feed**: tails `journalctl -u preside-by-side-suggest -f`.
  Every Discord-bound event (suggestions, rating logs, probe alerts,
  rate-limit trips, start/stop) is also a journal line, so this feed is
  a superset of the Discord channels with zero changes to `suggest.py`.
- **Counters**: read-only queries against the suggest DB (pending,
  suggestions today, ratings today) plus interactions today.
- **Beacons**: `assets/js/beacon.js` on the hire-me and preside-by-side
  pages posts `{type, page, target}` to `/api/event`. Origin-gated and
  rate-limited like `/api/suggest`. Stored in the station's own SQLite;
  no cookies, no IDs, no raw IPs/UAs.

The dashboard (`GET /` on :8788) is **never** proxied by Apache — only
`/api/event` is public. Everything else stays on loopback.

---

## File inventory

### In the repo (`status-station/`)

| File | Purpose |
|---|---|
| `server/station.py` | The Flask daemon. Routes: `GET /`, `GET /api/status`, `POST /event`. |
| `server/requirements.txt` | `flask`, `gunicorn`, `requests`. |
| `server/config.env.example` | Template for `/etc/status-station/config.env`. |
| `server/status-station.service` | systemd unit. |
| `server/apache-snippet.conf` | `/api/event` proxy + deny-static directives. |
| `dashboard/index.html` + `station.css` + `station.js` | The dashboard, served by Flask (not Apache). |

Plus `assets/js/beacon.js` at the repo root (included by the pages).

### On the Fedora server

| Path | Owner / mode | Contents |
|---|---|---|
| `/var/www/frontendneeded.com/status-station/` | repo perms | This directory (git pull target). |
| `/etc/systemd/system/status-station.service` | `root:root 0644` | systemd unit (copy of the repo file). |
| `/etc/status-station/config.env` | `root:preside 0640` | Overrides; can be empty — all keys have defaults. |
| `/var/lib/status-station/events.db` | `preside:preside` | SQLite — interaction events. |

Runs as the existing `preside` user (already has read access to the
suggest DB dir) with the `systemd-journal` supplementary group for the
journal tail.

---

## First-time setup

Assumes the repo has been pulled on the Fedora box.

```bash
# 1. Deps — all already installed for the suggest service.
sudo dnf install -y python3-flask python3-gunicorn python3-requests sqlite

# 2. Dirs + config.
sudo mkdir -p /var/lib/status-station /etc/status-station
sudo chown preside:preside /var/lib/status-station
sudo chmod 750 /var/lib/status-station
sudo cp server/config.env.example /etc/status-station/config.env
sudo chown root:preside /etc/status-station/config.env
sudo chmod 640 /etc/status-station/config.env

# 3. systemd unit.
sudo cp server/status-station.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now status-station

# 4. Apache — add the contents of server/apache-snippet.conf inside the
#    existing <VirtualHost *:443>, near the /api/suggest block. Then:
sudo apachectl configtest
sudo systemctl reload httpd

# 5. SELinux — same boolean as Ollama/suggest; almost certainly already on.
sudo setsebool -P httpd_can_network_connect 1
```

Smoke test:

```bash
# Dashboard JSON from the box itself:
curl -s http://127.0.0.1:8788/api/status | python3 -m json.tool | head -40
# Expect: probes up, units active, journal recent lines present.

# Beacon path through Apache (mimics a browser):
curl -ik -X POST https://localhost/api/event \
     -H 'Host: frontendneeded.com' \
     -H 'Origin: https://frontendneeded.com' \
     -H 'Content-Type: application/json' \
     -d '{"type":"click","page":"/smoke-test/","target":"deploy check"}'
# Expect: HTTP 204. Then confirm it landed:
sudo -u preside sqlite3 /var/lib/status-station/events.db \
     'SELECT * FROM events ORDER BY id DESC LIMIT 3;'
```

---

## Viewing the dashboard

Three ways, in order of convenience:

1. **RustDesk** (the morning routine): open `http://127.0.0.1:8788/` in
   Firefox on the server. For an app-like fullscreen launcher, drop this
   on the desktop:

   ```ini
   # ~/.local/share/applications/status-station.desktop
   [Desktop Entry]
   Type=Application
   Name=Status Station
   Exec=firefox --kiosk http://127.0.0.1:8788/
   Icon=utilities-system-monitor
   ```

2. **ssh tunnel from the MacBook** — no config changes needed:
   `ssh -L 8788:localhost:8788 <user>@<server-lan-ip>`, then open
   `http://localhost:8788/` in any browser.

3. **LAN-direct** (optional): set `LISTEN_HOST=0.0.0.0` (or the LAN IP)
   in `/etc/status-station/config.env` **and** change the `--bind` in the
   unit's `ExecStart` to match (gunicorn binds from the flag, not the env
   var — same gotcha as the suggest service), then
   `sudo firewall-cmd --add-port=8788/tcp --permanent && sudo firewall-cmd --reload`.
   Only do this on a trusted LAN — the dashboard has no auth in v1.

---

## Day-to-day operations

```bash
sudo systemctl status status-station --no-pager
sudo journalctl -u status-station -f
sudo systemctl restart status-station        # after a git pull
```

If `status-station.service` itself changed:

```bash
sudo cp server/status-station.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl restart status-station
```

Inspect / prune the events DB:

```bash
sudo -u preside sqlite3 /var/lib/status-station/events.db
sqlite> SELECT type, COUNT(*) FROM events GROUP BY type;
sqlite> SELECT page, COUNT(*) n FROM events
   ...> WHERE substr(received_at,1,10)=date('now') GROUP BY page ORDER BY n DESC;
sqlite> DELETE FROM events WHERE received_at < datetime('now','-90 days');
```

---

## Troubleshooting

- **Journal feed empty, `journal.status` says permission-ish things** —
  the unit needs `SupplementaryGroups=systemd-journal`; confirm with
  `sudo -u preside journalctl -u preside-by-side-suggest -n 5` (will say
  "No journal files were opened" without the group, since it's set per
  service, not on the user — check the unit file was copied + reloaded).
- **`suggest DB unreachable` on the dashboard** — the read-only open
  failed. `/var/lib/preside-by-side` is `750 preside:preside`; the station
  runs as `preside` so this only breaks if the unit's `User=` was changed.
  Also check the unit's `ReadOnlyPaths=` still lists the dir.
- **Beacons 403** — `Origin` not in `ALLOWED_ORIGIN`. The journal prints
  nothing for these by design; test with the smoke-test curl above.
- **Beacons 503 through Apache** — same SELinux boolean / proxy checklist
  as the suggest service (`httpd_can_network_connect`, vhost snippet
  present, `apachectl configtest`).
- **vhost tile red but the site is fine publicly** — the loopback probe
  path broke (cert renewal hiccup, Apache binding change), or Apache
  really is down and only cached DNS is "fine". Check
  `systemctl status httpd` first.

---

## Future work (phases, not promises)

- External uptime probe (the loopback vhost check can't see DNS/router
  failures) — a free UptimeRobot-style pinger or a cron on another box.
- GTK/WebKit shell wrapping the dashboard for a true native window.
- Auth (basic auth or Tailscale) if the dashboard ever leaves loopback.
- Hire-me chat conversation/turn counters (would need an Ollama proxy or
  log parse — `/api/chat` currently goes straight to Ollama).
- Site-wide beacon rollout beyond hire-me + preside-by-side.
