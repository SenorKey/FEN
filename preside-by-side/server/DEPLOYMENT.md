# Suggestion intake service — deployment & runbook

Operational reference for the **Preside by Side** suggestion-box backend.
This documents the live setup so future-you (or a fresh machine) can rebuild
or diagnose it without having to reverse-engineer the moving parts.

The webhook URL itself is never in this file or anywhere in the repo — it
lives only in `/etc/preside-by-side/config.env` on the server.

---

## Architecture

```
Browser ──POST /api/suggest──> Apache ──proxy──> Python service (Flask)
                               :443             127.0.0.1:8787
                                                   │
                                        ┌──────────┼──────────┐
                                        ▼                     ▼
                                  SQLite queue          Discord webhook
                                  /var/lib/...          (Paul Revere embed)
```

- The browser POSTs same-origin to `/api/suggest` with JSON. The page never
  sees the Discord webhook URL.
- Apache reverse-proxies `/api/suggest` → `http://127.0.0.1:8787/suggest`
  inside the existing `frontendneeded.com` SSL vhost. Same pattern as
  `/api/chat` → Ollama.
- The Flask service validates the payload (Origin header, honeypot, length
  caps, URL scheme on `source`), inserts a row into SQLite, and fires the
  Discord embed best-effort. A Discord outage does **not** fail the user
  request — the row is already durable on disk.
- The SQLite row's `status` column starts at `pending` so a downstream AI
  consumer can claim rows and flip them through `processing` →
  `reviewed`/`rejected`/`added`.

---

## File inventory

### In the repo (`preside-by-side/server/`)

| File | Purpose |
|---|---|
| `suggest.py` | The Flask service. One endpoint, `POST /suggest`. |
| `requirements.txt` | `flask`, `requests`. |
| `config.env.example` | Template for `/etc/preside-by-side/config.env`. |
| `preside-by-side-suggest.service` | systemd unit. |
| `apache-snippet.conf` | Reference copy of the Apache directives. |
| `.gitignore` | Belt-and-suspenders against committing the real config or a stray DB. |
| `DEPLOYMENT.md` | This file. |

### On the Fedora server

| Path | Owner / mode | Contents |
|---|---|---|
| `/var/www/frontendneeded.com/preside-by-side/` | normal repo perms | The repo (git pull target). |
| `/etc/systemd/system/preside-by-side-suggest.service` | `root:root 0644` | systemd unit (copy of the repo file). |
| `/etc/preside-by-side/config.env` | `root:preside 0640` | Real webhook URL + service config. |
| `/var/lib/preside-by-side/suggestions.db` | `preside:preside 0644` | SQLite queue. |
| `/etc/httpd/conf.d/frontendneeded.com-le-ssl.conf` | system | Apache vhost (manually edited to add `<Location /api/suggest>`). |

The service runs as the unprivileged `preside` system user (no shell, no home).

---

## First-time setup (condensed)

Assumes the repo is already at `/var/www/frontendneeded.com/preside-by-side/`
on the Fedora box and the new code has been pulled.

```bash
# 1. Python deps (prefer dnf over pip on Fedora — PEP 668).
sudo dnf install -y python3-flask python3-requests sqlite

# 2. Service user + dirs.
sudo useradd --system --no-create-home --shell /sbin/nologin preside
sudo mkdir -p /var/lib/preside-by-side /etc/preside-by-side
sudo chown preside:preside /var/lib/preside-by-side
sudo chmod 750 /var/lib/preside-by-side

# 3. Config file with the real Discord webhook URL.
sudo cp server/config.env.example /etc/preside-by-side/config.env
sudoedit /etc/preside-by-side/config.env     # paste real DISCORD_WEBHOOK_URL
sudo chown root:preside /etc/preside-by-side/config.env
sudo chmod 640 /etc/preside-by-side/config.env

# 4. systemd unit.
sudo cp server/preside-by-side-suggest.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now preside-by-side-suggest

# 5. Apache vhost — add inside the existing <VirtualHost *:443> for
#    frontendneeded.com, right after the </Location> for /api/chat:
#
#        <Proxy http://127.0.0.1:8787/*>
#            Require all granted
#        </Proxy>
#        <Location /api/suggest>
#            ProxyPass http://127.0.0.1:8787/suggest
#            ProxyPassReverse http://127.0.0.1:8787/suggest
#            Require all granted
#        </Location>
#
#        <Directory /var/www/frontendneeded.com/preside-by-side/server>
#            Require all denied
#        </Directory>
sudo apachectl configtest
sudo systemctl reload httpd

# 6. SELinux boolean (one-time; almost certainly already on from Ollama).
sudo setsebool -P httpd_can_network_connect 1
```

Smoke test:

```bash
curl -ik -X POST https://localhost/api/suggest \
     -H 'Host: frontendneeded.com' \
     -H 'Origin: https://frontendneeded.com' \
     -H 'Content-Type: application/json' \
     -d '{"president":"Test","event":"smoke test"}'
# Expect: HTTP/1.1 200 OK, body {"ok":true}, embed in Discord, row in DB.
```

---

## Day-to-day operations

### Rotate the Discord webhook (suspected leak/abuse)

1. In Discord: Channel → Integrations → Webhooks → delete the old one,
   create a new one, copy the new URL.
2. On Fedora:
   ```bash
   sudoedit /etc/preside-by-side/config.env       # paste new URL
   sudo systemctl restart preside-by-side-suggest
   ```

No code change, no deploy, no git commit. The leaked URL is dead the moment
you delete it in Discord — anyone who scraped it can no longer post.

### Inspect the queue

```bash
sudo -u preside sqlite3 /var/lib/preside-by-side/suggestions.db

# Useful queries:
sqlite> SELECT id, received_at, status, president, substr(event,1,40) FROM suggestions ORDER BY id DESC LIMIT 20;
sqlite> SELECT status, COUNT(*) FROM suggestions GROUP BY status;
sqlite> SELECT * FROM suggestions WHERE id = 42;
```

### Mark a suggestion processed (manual, before the AI consumer exists)

```bash
sudo -u preside sqlite3 /var/lib/preside-by-side/suggestions.db \
    "UPDATE suggestions SET status='added', processed_at=datetime('now'), notes='added to bars' WHERE id=42;"
```

Status lifecycle (advisory, not enforced):
`pending` → `processing` → `reviewed` / `rejected` / `added`

### Tail the service logs

```bash
sudo journalctl -u preside-by-side-suggest -f
```

Look for `INFO queued suggestion #N` on success and
`WARNING discord notify failed for #N` if Discord rejected the embed
(the row is still safely persisted — Discord is best-effort).

### Restart / stop / start

```bash
sudo systemctl restart preside-by-side-suggest
sudo systemctl stop preside-by-side-suggest
sudo systemctl start preside-by-side-suggest
sudo systemctl status preside-by-side-suggest --no-pager
```

### Update the service code

```bash
cd /var/www/frontendneeded.com/preside-by-side
git pull
sudo systemctl restart preside-by-side-suggest
```

If `preside-by-side-suggest.service` itself changed, also:

```bash
sudo cp server/preside-by-side-suggest.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl restart preside-by-side-suggest
```

### Backup the queue

```bash
sudo -u preside sqlite3 /var/lib/preside-by-side/suggestions.db ".backup '/tmp/suggestions-$(date +%F).db'"
```

`.backup` is the safe way to copy a live SQLite DB (no risk of catching it
mid-write). Move the resulting file wherever your backups live.

---

## Troubleshooting

Real issues encountered during the initial deploy, plus likely future ones.
Listed by symptom.

### Form submission "Could not send" in the browser

Open DevTools → Network → click the failed `suggest` request. Look at the
status and response body. Then check the service journal:
`sudo journalctl -u preside-by-side-suggest -n 50`.

Most likely causes:

- **400 `president and event are required`** — JS validation should catch
  this; if it didn't, the request body shape changed. Inspect the request
  payload in DevTools.
- **403 `Forbidden`** — `Origin` header missing or doesn't match
  `ALLOWED_ORIGIN` in `/etc/preside-by-side/config.env`. Browser requests
  from the live site should always send the right Origin. If you've added
  a new hostname (e.g. `www.` variant or a staging site), update
  `ALLOWED_ORIGIN` (comma-separate multiple) and restart the service.
- **502 / 503** — Apache reached out to `127.0.0.1:8787` and got nothing.
  Check `systemctl status preside-by-side-suggest`. If the service is
  down, restart it. If it's up, check SELinux (see below).

### curl from inside the LAN hangs on the public URL

NAT loopback (hairpin NAT) not supported by the router. The packet leaves
the LAN looking for the public IP and never comes back. This is a router
behavior, not a server bug — anything served at `frontendneeded.com` will
exhibit it.

Workaround for testing from on-LAN:

```bash
curl -ik -X POST https://localhost/api/suggest \
     -H 'Host: frontendneeded.com' \
     -H 'Origin: https://frontendneeded.com' \
     -H 'Content-Type: application/json' \
     -d '{"president":"x","event":"y"}'
```

`-k` skips cert validation (cert is for the public hostname, not localhost),
`Host:` selects the right vhost, `Origin:` passes the service's check.

Real users on the public internet are unaffected.

### `404` response to `/api/suggest` (when it used to work)

Apache isn't matching the `<Location /api/suggest>` block. Confirm it's
still in the vhost file and inside the `<VirtualHost *:443>` braces:

```bash
sudo grep -n -B1 -A4 "/api/suggest\|127.0.0.1:8787" \
    /etc/httpd/conf.d/frontendneeded.com-le-ssl.conf
sudo apachectl configtest
sudo systemctl reload httpd
```

### `503` after a long hang (Apache → service path)

Almost always SELinux blocking httpd from making the outbound connection.

```bash
getsebool httpd_can_network_connect
# If 'off':
sudo setsebool -P httpd_can_network_connect 1
```

Same boolean covers all local ports; setting it once is enough for both
Ollama (`:11434`) and this service (`:8787`).

### Service fails to start

```bash
sudo journalctl -u preside-by-side-suggest --no-pager -n 50
```

Common causes:

- **`DISCORD_WEBHOOK_URL is required`** — `/etc/preside-by-side/config.env`
  isn't readable by the `preside` user. Check perms: should be
  `-rw-r----- root preside`. Fix:
  `sudo chown root:preside /etc/preside-by-side/config.env && sudo chmod 640 /etc/preside-by-side/config.env`
- **`Address already in use`** — something else is on `:8787`. Find it:
  `sudo ss -tlnp | grep 8787`. Either stop that process or change
  `LISTEN_PORT` in `config.env` (and update the Apache `ProxyPass` to match).
- **`ModuleNotFoundError: No module named 'flask'`** — Python deps not
  installed system-wide. Re-run `sudo dnf install -y python3-flask python3-requests`.

### Discord embeds stop appearing but submissions still succeed

Service journal will show `WARNING discord notify failed for #N: ...`.
Submissions are still safe (row is in SQLite); just the notification step
broke. Usually means:

- Webhook URL was deleted/rotated in Discord but not updated in
  `/etc/preside-by-side/config.env`. Update + restart.
- Discord is having an outage. Wait it out; nothing on our end to fix.
- Rate limit hit (very unlikely — Discord allows 30 req/min per webhook,
  and the client cooldown + low traffic make this nearly impossible).

### Spam in the Discord channel

Web-facing endpoint, has a honeypot field + Origin check + length caps,
but a determined attacker who knows the URL and forges Origin can still
POST. Defenses in escalating order:

1. **Rotate the webhook** (see above). Breaks anyone who scraped the old URL.
2. **Tighten `ALLOWED_ORIGIN`** if you've ever loosened it.
3. **Add per-IP rate limiting** to `suggest.py` — simple in-memory dict
   keyed on `request.remote_addr`, reject if more than N in the last minute.
4. **Put a Cloudflare Worker in front** that requires a per-domain secret
   header. Heaviest option; only if the above don't hold.

The on-disk queue is unaffected by Discord spam — even if Discord fills up
with junk, the SQLite rows still get written and the AI consumer can be
tuned to filter quality from there.

---

## Future work

The AI consumer half is not yet built. The schema is ready for it:

```sql
SELECT * FROM suggestions WHERE status = 'pending' ORDER BY id LIMIT 1;
-- ... do source-finding + validation work ...
UPDATE suggestions
   SET status = 'reviewed', processed_at = datetime('now'), notes = ?
 WHERE id = ?;
```

Whoever builds this can run as the same `preside` user (already has DB
write perms) or a separate user with read-only DB access and a separate
mechanism for marking processed.
