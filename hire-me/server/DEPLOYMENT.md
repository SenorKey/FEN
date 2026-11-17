# Hire Me assistant: setup and runbook

The assistant on `/hire-me/` is Llama 3 in Ollama on the server's RTX 2070
Super. This folder is the service that stands between the web and Ollama.
Before it, Apache passed `/api/chat` straight to Ollama, so anyone with a
script could run any model on the box (including the uncensored
`dolphin-mistral`), write their own instructions, ask for a huge context or
an endless answer, and send as many requests at once as they liked.

```
Browser ──POST /api/chat──> Apache ──proxy──> chat.py (Flask, gunicorn) ──> Ollama
         {messages}          :443             127.0.0.1:8792                127.0.0.1:11434
```

What `chat.py` decides, whatever the request says:

| | |
|---|---|
| Model and settings | `llama3`, 8192-token window, temperature 0.3, at most 512 tokens an answer |
| Instructions | Built from `prompt.txt` and the page's own lines in `../index.html`; a `system` message in the request is dropped |
| Size | Question up to 300 characters; the last 6 messages of the conversation |
| Volume | 20 questions an hour per address, 200 an hour for the whole site |
| GPU | One answer at a time; 4 more may wait up to 20 seconds, the rest hear "busy" at once |
| Who | Only requests whose Origin is the site (the page); a script without it gets 403 |
| Stop | When the reader presses Stop or leaves, the request to Ollama is closed, so the GPU stops too |

The answer streams through untouched, so the page is as fast as before.
What it cannot do: stop someone asking off-topic questions through the page
within those limits. It caps what one person can cost.

A refusal comes back as JSON with a `say` sentence, which the page shows in
the answer area ("You've asked a lot of questions this hour…").

## Files

| File | What it is |
|---|---|
| `chat.py` | The service. Also `GET /chat/health` (prompt builds, Ollama answers) |
| `prompt.txt` | The assistant's instructions and the facts the page does not show. Edit the wording here, the facts on the page. `#` lines are notes, never sent |
| `hire-me-chat.service` | systemd unit (a throwaway `DynamicUser`, read-only, one worker) |
| `apache-snippet.conf` | The Apache change, written out |
| `config.env.example` | Optional settings for `/etc/hire-me-chat/config.env` |
| `deploy.sh` | Does the first setup below in one go |

`prompt.txt` and `index.html` are reread when they change, so a `git pull`
reaches the assistant without a restart. A change to `chat.py` needs one.

## First setup

From the repo on the server, after the pull that brought this folder:

```
sudo bash hire-me/server/deploy.sh
```

It installs and starts the service, waits for `/chat/health`, backs up the
vhost config, points `/api/chat` at port 8792, adds a `Require all denied`
for this folder, runs `apachectl configtest` (and puts the backup back if
that fails), reloads Apache, and checks four things through Apache: health
200, this folder 403, a request for `dolphin-mistral` answered by `llama3`,
a request with no Origin 403. Safe to run twice.

Optional: alerts to Discord, or keeping the model loaded longer.

```
sudo mkdir -p /etc/hire-me-chat
sudo cp hire-me/server/config.env.example /etc/hire-me-chat/config.env
sudo chmod 600 /etc/hire-me-chat/config.env
sudoedit /etc/hire-me-chat/config.env
sudo systemctl restart hire-me-chat
```

## Day to day

```
journalctl -u hire-me-chat -f          # one line per question: address, tokens, how it ended
systemctl status hire-me-chat
curl -s http://127.0.0.1:8792/chat/health
```

The log records the address, the number of messages, tokens and time. It
does not record what was asked.

## Undo

Put the old block back in the vhost config (the backup is next to it,
`*.bak-hire-me-chat-*`), then:

```
sudo apachectl configtest && sudo systemctl reload httpd
sudo systemctl disable --now hire-me-chat
```

The page now sends only the conversation, so with Ollama answering
directly it would have no instructions. Roll `hire-me/` back to the commit
before the service as well.

## Local preview

`hire-me/.claude/serve.py` answers `/api/chat` with a canned stand-in. To
try the real service instead, tunnel the server's Ollama to port 11435 and:

```
ALLOWED_ORIGIN=http://localhost:8766 OLLAMA_URL=http://127.0.0.1:11435 \
PYTHONDONTWRITEBYTECODE=1 python3 hire-me/server/chat.py 8792
HIRE_ME_CHAT=http://127.0.0.1:8792 python3 hire-me/.claude/serve.py
```

`python chat.py` runs Werkzeug's development server. When a reader hangs up
mid-answer, Werkzeug skips closing the response; `chat.py` frees the GPU
anyway (the stream's own `finally`, and a stale-slot takeover after
`ANSWER_WALL_SEC` + 30 s). Production runs gunicorn, which closes it.
