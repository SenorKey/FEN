# /jobs server setup

These files run the backend for the `/jobs` page. The Flask service and
Apache config live on the Fedora box; the Ollama instance for the big
model lives on the Windows PC.

## Files

- `jobs-api.py` — Flask service on Fedora. Reads/writes one JSON file. ~150 lines.
- `jobs-api.service` — systemd unit so the Flask service auto-starts.
- `apache-jobs.conf.example` — Apache snippets: basic auth on `/jobs/`,
  reverse-proxy for `/api/jobs-data` (→ Flask) and `/api/chat-big` (→
  the Windows PC's Ollama). **Edit the IP** before pasting.
- `windows-setup.md` — separate walkthrough for the Windows-side setup
  (Ollama install, env vars, firewall, DHCP reservation).

The /jobs page calls two AI endpoints:

| Endpoint | Backend | Use |
| --- | --- | --- |
| `/api/chat`     | Llama 3 on Fedora (already running)            | Metadata extractor (category / company / role) + user-initiated fallback |
| `/api/chat-big` | Mistral Small 22B Q4_K_M on Windows PC (new)   | Main resume + cover letter generation |

If the Windows PC is off, the page shows a "Couldn't reach the Windows
PC" prompt with a button to retry on the local fallback.

## One-time install on the Fedora box

```bash
# 1) Dependencies
sudo dnf install python3-flask httpd-tools

# 2) Place the code
sudo mkdir -p /opt/fen-jobs /var/lib/fen-jobs
sudo cp jobs-api.py /opt/fen-jobs/
sudo chown -R apache:apache /opt/fen-jobs /var/lib/fen-jobs

# 3) Install the systemd unit
sudo cp jobs-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now jobs-api
sudo systemctl status jobs-api    # confirm it's running

# 4) Basic auth credentials (only use -c the very first time)
sudo htpasswd -c /etc/httpd/fen-jobs.htpasswd key

# 5) Apache: edit the Windows IP in apache-jobs.conf.example, then
#    paste everything into your frontendneeded.com vhost file
#    (usually /etc/httpd/conf.d/frontendneeded.com.conf or similar).
sudo apachectl configtest
sudo systemctl reload httpd
```

## Then set up the Windows side

Follow `windows-setup.md`. The short version: install Ollama, set two
env vars (`OLLAMA_HOST=0.0.0.0:11434`, `OLLAMA_KEEP_ALIVE=1m` — short
TTL so the GPU frees ~1 minute after the last `/jobs` request, leaving
the PC ready for games / normal use), pull
`mistral-small:22b-instruct-2409-q4_K_M`, open Windows Firewall port
11434 (scoped to your Fedora IP), pin the Windows PC's LAN IP via DHCP
reservation.

## Verify it works

```bash
# Flask data store, no auth:
curl http://127.0.0.1:8765/

# Flask through Apache, with auth:
curl -u key:yourpassword https://frontendneeded.com/api/jobs-data/

# Windows Ollama, direct (replace IP):
curl http://<WINDOWS_PC_LAN_IP>:11434/api/tags

# Windows Ollama through Apache, with auth:
curl -u key:yourpassword -X POST https://frontendneeded.com/api/chat-big \
  -H 'Content-Type: application/json' \
  -d '{"model":"mistral-small:22b-instruct-2409-q4_K_M","messages":[{"role":"user","content":"hi"}],"stream":false}'
```

Then open `https://frontendneeded.com/jobs/` in your browser. Apache
prompts for the basic auth credentials, then the page loads. Drop a
PDF resume into each of the three master-resume tabs — the page
extracts the text and saves it automatically.

## Where the data lives

Everything is in `/var/lib/fen-jobs/data.json`. To back it up, just copy
that file. To wipe and start over, `sudo rm /var/lib/fen-jobs/data.json`
and the service will recreate an empty one on next write.

## Logs

```bash
sudo journalctl -u jobs-api -f          # Flask data store
sudo journalctl -u httpd -f             # Apache (proxy errors land here)
```

On Windows, Ollama's logs are in `%LOCALAPPDATA%\Ollama\server.log`.

