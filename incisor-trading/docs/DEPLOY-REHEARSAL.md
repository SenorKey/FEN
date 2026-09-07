# Incisor Trading — deploy rehearsal (T26b)

**A trial install, not a promotion.** The page stays hidden throughout: it keeps
`noindex,nofollow`, it is not in the nav, and it is not in `sitemap.xml`. The
point is to find the faults that only exist where the code actually runs.

Written 2026-09-07, before the first attempt. **The product of this task is the
list of faults it finds**, not a successful install — each one gets filed.

Everything below runs on the Fedora box. The routine cannot do any of it
(hard rule 5), so it is Key's to work through.

---

## 0. The blocker to know about first

**`main` has no `incisor-trading/` directory.** The server pulls `main`, so a
normal `git pull origin main` gets none of this. All 102 commits are on
`incisor-dev`.

`incisor-dev` fully contains `main`, so checking it out on the server serves the
same site plus the hidden page — nothing else changes. **Return to `main` when
the rehearsal is done**, or the daily pull habit starts doing something
unexpected.

---

## 1. Prerequisites

The unit runs `/usr/bin/gunicorn`, not a venv — the same shape as the
preside-by-side service, which already needs these three packages. Confirm
rather than assume:

```bash
which gunicorn && python3 -c "import flask, requests; print('flask', flask.__version__)"
```

If anything is missing, that is fault number one — record it, then
`sudo dnf install python3-flask python3-requests python3-gunicorn`.

---

## 2. Get the code onto the box

```bash
cd /var/www/frontendneeded.com && git fetch origin && git checkout incisor-dev && git pull
```

---

## 3. Service account and directories

```bash
sudo useradd --system --no-create-home --shell /sbin/nologin incisor 2>/dev/null; sudo mkdir -p /var/lib/incisor-trading /etc/incisor-trading && sudo chown incisor:incisor /var/lib/incisor-trading && sudo chmod 750 /var/lib/incisor-trading
```

---

## 4. Configuration

```bash
sudo cp /var/www/frontendneeded.com/incisor-trading/server/config.env.example /etc/incisor-trading/config.env && sudo chown root:incisor /etc/incisor-trading/config.env && sudo chmod 640 /etc/incisor-trading/config.env
```

Then edit `/etc/incisor-trading/config.env`:

- `INCISOR_DATA_SOURCE=fixture` — **leave it.** No upstream call is made, no
  quota is spent, and no provider licence question is touched. The rehearsal is
  about the plumbing.
- `UPSTREAM_API_KEY=REPLACE_ME` — leave it. Unused in fixture mode.
- `EDGAR_CONTACT` — set a real address. Unused in fixture mode too, but SEC
  EDGAR 403s without one, so it may as well be right now.
- `DB_PATH` — leave. D4 made this key actually work; the rehearsal exercises it.

---

## 5. Install and start the service

```bash
sudo cp /var/www/frontendneeded.com/incisor-trading/server/incisor-trading.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now incisor-trading && sudo systemctl status incisor-trading --no-pager
```

If it failed to start:

```bash
sudo journalctl -u incisor-trading -n 50 --no-pager
```

`ProtectSystem=strict` plus `ReadWritePaths=/var/lib/incisor-trading` means the
service can write nowhere else. A permissions failure here is a real finding
about the unit, not something to work around by loosening the hardening.

---

## 6. Prove the service works before Apache is involved

```bash
curl -s http://127.0.0.1:8789/health; echo; curl -s -H "Origin: https://frontendneeded.com" "http://127.0.0.1:8789/history?symbol=SPY" | head -c 200; echo
```

Expect `{"service":"incisor-trading","source":"fixture","status":"ok",...}` and
then a JSON payload of daily bars. **If this works and step 8 does not, the
fault is in Apache or SELinux, not in the service** — which is the whole reason
this step is separate.

---

## 7. SELinux — the expected fault

Fedora blocks httpd from opening network connections by default, so `mod_proxy`
cannot reach `127.0.0.1:8789` until this is set:

```bash
getsebool httpd_can_network_connect
```

If `off`:

```bash
sudo setsebool -P httpd_can_network_connect 1
```

To see what SELinux actually denied, rather than guessing:

```bash
sudo ausearch -m avc -ts recent
```

---

## 8. Apache

Paste the contents of `incisor-trading/server/apache-snippet.conf` inside the
existing `<VirtualHost *:443>` for `frontendneeded.com`, then:

```bash
sudo apachectl configtest && sudo systemctl reload httpd
```

---

## 9. Verify through Apache

```bash
curl -s -H "Origin: https://frontendneeded.com" "https://frontendneeded.com/api/incisor/history?symbol=SPY" | head -c 200; echo
```

Then all five proxied routes answer and `/health` does not:

```bash
for r in "quote?symbol=SPY" "history?symbol=SPY" "symbols" "sectors" "fundamentals?symbol=AAPL"; do printf "%-28s %s\n" "$r" "$(curl -s -o /dev/null -w '%{http_code}' -H 'Origin: https://frontendneeded.com' "https://frontendneeded.com/api/incisor/$r")"; done; printf "%-28s %s\n" "health (expect 404)" "$(curl -s -o /dev/null -w '%{http_code}' https://frontendneeded.com/api/incisor/health)"
```

---

## 10. The source directories must not be served

`server`, `docs`, `tests` and `tools` are each denied twice — in the vhost and
by their own `.htaccess`. All four should be 403:

```bash
for d in server/incisor.py docs/AGENT-GUIDE.md tests/test_page.py tools/shoot.py; do printf "%-24s %s\n" "$d" "$(curl -s -o /dev/null -w '%{http_code}' "https://frontendneeded.com/incisor-trading/$d")"; done
```

**Anything that is not 403 or 404 is a finding**, and a security one.

---

## 11. The page itself

Open `https://frontendneeded.com/incisor-trading/` and check:

- it renders, with tiles, sectors, search, chart and watchlist
- the console is clean
- `view-source:` still shows `<meta name="robots" content="noindex,nofollow">`
- it is **not** in the nav, and **not** in `sitemap.xml`
- it looks right on a phone on the real connection, not just in emulation

---

## 12. Finish

Leave the service running if you want to keep looking at the page — it is
hidden and costs nothing. **Return the checkout to `main` either way:**

```bash
cd /var/www/frontendneeded.com && git checkout main
```

To undo the service entirely:

```bash
sudo systemctl disable --now incisor-trading
```

---

## 13. Record what happened

Every fault, with what it actually said. That list is what this task exists to
produce, and it is worth more than a clean run — a clean run means the next
fifteen faults are still ahead, found all at once on a day that matters.

Paste the results back and they get filed as `[defect]` items, which the routine
takes before feature work.
