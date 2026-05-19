# Windows PC setup — `/api/chat-big`

The /jobs page sends its main resume/cover-letter requests to a beefier
Ollama instance running on your Windows PC (RTX 4080). This guide gets
that PC ready.

## One-time setup

### 1. Install Ollama for Windows
Grab the installer from <https://ollama.com/download/windows>. It registers
a small tray app that auto-starts when you log in to Windows.

### 2. Set two environment variables

Open **Settings → System → About → Advanced system settings → Environment
Variables**, and under "User variables" add:

| Name | Value | Why |
| --- | --- | --- |
| `OLLAMA_HOST` | `0.0.0.0:11434` | Listen on all network interfaces (not just localhost) so the Fedora PC can reach it. |
| `OLLAMA_KEEP_ALIVE` | `1m` | Unload the model from VRAM 1 minute after the last request. Lets you finish a session on `/jobs` and then immediately reuse the Windows PC for games / normal work without manually unloading anything — just wait ~1 minute and the VRAM frees itself. |

After adding them, **right-click the Ollama tray icon → Quit**, then
relaunch Ollama from the Start menu. (Env vars only get picked up on
process start.)

### 3. Pull the model

Open PowerShell and run:

```powershell
ollama pull mistral-small:22b-instruct-2409-q4_K_M
```

That's about 13 GB. Confirm it landed with `ollama list`. The exact tag
`jobs.js` looks for is `mistral-small:22b-instruct-2409-q4_K_M` — that
quantization fits comfortably in a 4080's 16 GB VRAM with headroom for
the KV cache on a typical job description. If you want a different
quantization, pull that and update `ENDPOINTS.big.model` at the top of
`/jobs/jobs.js` to match.

### 4. Test Ollama is reachable from itself

In the same PowerShell window:

```powershell
curl http://localhost:11434/api/tags
```

You should see a JSON list of installed models. If this fails, Ollama
isn't running — recheck the tray icon.

### 5. Open the firewall

Windows Firewall blocks inbound 11434 by default. Open PowerShell **as
Administrator** and run:

```powershell
New-NetFirewallRule `
  -DisplayName "Ollama (from Fedora PC)" `
  -Direction Inbound `
  -LocalPort 11434 `
  -Protocol TCP `
  -Action Allow `
  -RemoteAddress <FEDORA_PC_LAN_IP>
```

Replace `<FEDORA_PC_LAN_IP>` with your Fedora box's LAN IP. Scoping the rule
to one source IP means no other device on your network can hit this
endpoint — a small but worthwhile hardening step.

### 6. Pin a static LAN IP

In your router's admin page, add a **DHCP reservation** so the Windows
PC always gets the same IP. Use that IP in two places:

- The firewall rule above (as the *remote* address — your Fedora box)
- The `ProxyPass` line in `apache-jobs.conf.example` (as the Windows PC's
  address): replace `<WINDOWS_PC_LAN_IP>` with the reserved IP.

### 7. Test from Fedora

SSH into the Fedora PC and run:

```bash
curl http://<WINDOWS_PC_LAN_IP>:11434/api/tags
```

If you get JSON back, you're done. If it hangs or refuses, check (in
this order):

1. Is Ollama actually running on Windows? (tray icon present)
2. Did `OLLAMA_HOST` get picked up? `Get-Process ollama` in PowerShell —
   if the env var didn't take, the process is still bound to 127.0.0.1.
3. Is the firewall rule active? `Get-NetFirewallRule -DisplayName "Ollama*"`.
4. Are both PCs on the same subnet? `ipconfig` on Windows, `ip addr` on
   Fedora — first three octets should match.

### 8. Reload Apache

```bash
sudo apachectl configtest
sudo systemctl reload httpd
```

Then open `/jobs/` on FEN. Generation should now route to the Windows
PC. The first request after a Windows boot — or after more than ~1
minute of idle, since the model unloads then — has a 10-30s warm-up
while Mistral Small loads into VRAM. Requests within the 1-minute
window stream in under a second.

## Daily routine

1. Power on the Windows PC.
2. Log in (Ollama auto-starts with the tray app on login).
3. Open `/jobs/` and use it normally.

That's it. When you shut down at night, `/jobs/` will show the
"Couldn't reach the Windows PC" prompt the next morning if you forget
step 1 — at which point you can either turn the PC on, or click
**Use local fallback** to run the smaller Fedora model for one request.

## Troubleshooting

**"Couldn't reach the Windows PC" even though it's on.** Apache returns
502 within ~5 seconds when the upstream is unreachable. Run the
`curl http://<WINDOWS_PC_LAN_IP>:11434/api/tags` test from Fedora — if that
works, the issue is in Apache's config (typo in the IP? wrong port?
ProxyPass line missing?). If that fails, the issue is on the Windows
side (Ollama not listening, firewall blocking, IP wrong).

**Streaming is choppy / output appears all at once at the end.** The
`flushpackets=on` flag is missing from the ProxyPass line in Apache, or
mod_proxy_http isn't loaded. Confirm with `httpd -M | grep proxy`.

**First request after idle is slow.** Expected — `OLLAMA_KEEP_ALIVE=1m`
unloads the model 1 minute after the last request. Cold reload on a
4080 is ~10-30s for Mistral Small 22B Q4_K_M. Requests within the
1-minute window are fast. This is the deliberate tradeoff: you give up
a fast cold start in exchange for the GPU being free for games shortly
after using `/jobs`.

**I want the model to stay loaded longer.** Bump `OLLAMA_KEEP_ALIVE` to
e.g. `10m` or `30m` (or `-1` to keep it loaded as long as Ollama runs),
and update the matching `keep_alive` value in the request body inside
`/jobs/jobs.js` (search for `keep_alive: '1m'`). The per-request value
overrides the env var, so both should agree.

**Windows shut itself down for an update overnight.** Set wide Active
Hours in Windows Update settings (e.g. 6am–11pm) to discourage this.
You can also `gpedit.msc → Computer Config → Admin Templates → Windows
Components → Windows Update → No auto-restart with logged on users` if
you want hard control.

**The hire-me page chat stopped working.** Probably means you enabled
auth on `/api/chat` (section 4 in `apache-jobs.conf.example`). Comment
that block out and reload Apache.
