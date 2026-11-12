# ToDo Tensor service: setup and runbook

The list on `/todo-tensor/` lives here. Everyone can read it; only the owner,
signed in with one password, can change it. No secret is in this folder: the
password's hash and the cookie key live only in `/etc/todo-tensor/config.env`
on the server.

```
Browser ──GET  /api/todo-tensor/list────> Apache ──proxy──> tensor.py (Flask, gunicorn)
        ──POST /api/todo-tensor/login───>  :443            127.0.0.1:8791
        ──PUT  /api/todo-tensor/list────>                      │
                                                               ▼
                                                SQLite /var/lib/todo-tensor/tensor.db
```

- **Reading** needs nothing. The page falls back to `todo-tensor/list.json`
  if the service is down, and says so.
- **Signing in** sets a cookie (`tt_owner`) that only this API receives. It
  is HttpOnly, Secure, SameSite=Strict, and lasts 30 days. Five wrong
  passwords from one address, or thirty from everyone, lock sign-in for
  fifteen minutes.
- **Saving** needs that cookie, a token the page gets at sign-in, and a
  request from `https://frontendneeded.com`. The server checks the list's
  shape the same way the page does.
- **Every save is kept** as a numbered revision (the last 1000). A save made
  from an out-of-date copy (another device saved first) is refused, and the
  page asks which version to keep.

## Files

In the repo (`todo-tensor/server/`):

| File | What it is |
|---|---|
| `tensor.py` | The service, plus the `hash-password`, `history`, `export` and `dev` commands |
| `requirements.txt` | `flask`, `gunicorn` |
| `config.env.example` | Template for `/etc/todo-tensor/config.env` |
| `todo-tensor.service` | systemd unit |
| `apache-snippet.conf` | The Apache lines to add |
| `.gitignore` | Keeps a real config or a database out of the repo |

On the Fedora server:

| Path | Owner / mode | Contents |
|---|---|---|
| `/etc/todo-tensor/config.env` | `root:tensor 0640` | Cookie key and password hash |
| `/var/lib/todo-tensor/tensor.db` | `tensor:tensor` | The list and its history |
| `/etc/systemd/system/todo-tensor.service` | `root:root 0644` | Copy of the unit |

## First-time setup

On the Fedora box, after `git pull` has brought this folder in:

```bash
cd /var/www/frontendneeded.com

# 1. Python packages. Already there from Preside by Side; harmless to repeat.
sudo dnf install -y python3-flask python3-gunicorn sqlite

# 2. A user for the service, and its two folders.
sudo useradd --system --no-create-home --shell /sbin/nologin tensor
sudo mkdir -p /var/lib/todo-tensor /etc/todo-tensor
sudo chown tensor:tensor /var/lib/todo-tensor
sudo chmod 750 /var/lib/todo-tensor

# 3. The config. Make the two values, then paste them into the file.
python3 -c "import secrets; print(secrets.token_urlsafe(48))"   # → TENSOR_SECRET_KEY
python3 todo-tensor/server/tensor.py hash-password               # → TENSOR_OWNER_HASH (asks for the password twice)
sudo cp todo-tensor/server/config.env.example /etc/todo-tensor/config.env
sudoedit /etc/todo-tensor/config.env
sudo chown root:tensor /etc/todo-tensor/config.env
sudo chmod 640 /etc/todo-tensor/config.env

# 4. The service. On its first start it copies list.json in as revision 1.
sudo cp todo-tensor/server/todo-tensor.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now todo-tensor
sudo systemctl status todo-tensor

# 5. Apache: paste the lines from todo-tensor/server/apache-snippet.conf
#    into the <VirtualHost *:443> block, next to the /api/suggest lines.
sudoedit /etc/httpd/conf.d/frontendneeded.com-le-ssl.conf
sudo apachectl configtest
sudo systemctl reload httpd
```

A password manager can make and keep the password. Use at least 12
characters; `hash-password` refuses shorter ones.

### Smoke test

```bash
curl -s https://frontendneeded.com/api/todo-tensor/list | head -c 300   # the list, as JSON
curl -s https://frontendneeded.com/api/todo-tensor/session              # {"owner":false}
curl -si https://frontendneeded.com/todo-tensor/server/tensor.py | head -1   # 403: the source isn't served
```

Then open `/todo-tensor/`, choose **Owner sign-in** at the foot of the side
panel, sign in, and add an idea. The status line should say "Saved" with
the time. Open the page in a private window: the idea is there, with no
editing controls.

## Day to day

```bash
# Deploying a new version of tensor.py
cd /var/www/frontendneeded.com && git pull origin main
sudo systemctl restart todo-tensor

# Logs (sign-ins are logged with the address)
sudo journalctl -u todo-tensor -e

# The saved versions, newest first; print one
sudo -u tensor env CONFIG_FILE=/etc/todo-tensor/config.env python3 todo-tensor/server/tensor.py history
sudo -u tensor env CONFIG_FILE=/etc/todo-tensor/config.env python3 todo-tensor/server/tensor.py export 12
```

**Change the password:** run `hash-password` again, replace
`TENSOR_OWNER_HASH` in the config, and `sudo systemctl restart todo-tensor`.
Browsers that are already signed in stay signed in.

**Sign every browser out** (a lost phone, say): replace `TENSOR_SECRET_KEY`
with a new one and restart.

**Go back to an earlier version:** `export <rev>` prints it. Sign in on the
page, copy that JSON somewhere safe, and paste its ideas back in; or stop
the service and insert it as a new revision with `sqlite3`.

**Refresh the fallback copy:** `list.json` is what visitors see while the
service is down. Signed in, choose **Copy as JSON**, paste it over
`todo-tensor/list.json` in the repo, commit and push. Do it now and then;
nothing breaks if it is old.

## Backups

The database is not in git. Back it up with SQLite's own copy command,
which is safe while the service runs:

```bash
sudo -u tensor sqlite3 /var/lib/todo-tensor/tensor.db ".backup '/var/lib/todo-tensor/tensor-$(date +%F).db'"
```

It holds the last 1000 versions of the list, so one backup now and then
covers a lot.

## Trying it on the laptop

```bash
status-station/server/.venv/bin/python todo-tensor/server/tensor.py dev
```

That serves the FEN folder and the API on http://localhost:8790/ (also the
`todo-tensor-dev` entry in `.claude/launch.json`). The password is `dev`,
and the list goes in `todo-tensor/server/dev.db`, which git ignores. Delete
it to start over from `list.json`. Any Python with Flask works; the Status
Station's virtual environment is just the one already on this machine.
