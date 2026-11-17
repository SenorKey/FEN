#!/usr/bin/env bash
# Puts the Hire Me assistant's service in front of Ollama. Run it on the
# server, from the repo, after the git pull that brought this file:
#
#     sudo bash hire-me/server/deploy.sh
#
# Safe to run again: each step checks whether it is already done. It
# changes the Apache config only after a backup, and puts the backup back
# if Apache does not accept the new one. DEPLOYMENT.md says what each step
# is for and how to undo it.

set -euo pipefail

REPO=/var/www/frontendneeded.com
CONF=/etc/httpd/conf.d/frontendneeded.com-le-ssl.conf
UNIT=/etc/systemd/system/hire-me-chat.service
PORT=8792
SITE=frontendneeded.com

if [ "$(id -u)" != 0 ]; then
    echo "Run it with sudo: sudo bash hire-me/server/deploy.sh"
    exit 1
fi
cd "$REPO"

echo "1/5  Installing and starting the service"
install -m 644 hire-me/server/hire-me-chat.service "$UNIT"
systemctl daemon-reload
systemctl enable hire-me-chat >/dev/null 2>&1
systemctl restart hire-me-chat

echo "2/5  Waiting for it to answer"
ok=
for _ in $(seq 1 30); do
    if health=$(curl -fsS "http://127.0.0.1:$PORT/chat/health" 2>/dev/null); then ok=1; break; fi
    sleep 0.5
done
if [ -z "$ok" ]; then
    echo "     It did not come up. Nothing in Apache was changed. Its log:"
    journalctl -u hire-me-chat -n 30 --no-pager
    exit 1
fi
echo "     $health"

echo "3/5  Pointing Apache's /api/chat at it"
if grep -q "127.0.0.1:$PORT/chat" "$CONF"; then
    echo "     Already done."
    backup=
else
    backup="$CONF.bak-hire-me-chat-$(date +%Y%m%d-%H%M%S)"
    cp -p "$CONF" "$backup"
    echo "     Backup: $backup"
    python3 - "$CONF" <<'PY'
import sys
path = sys.argv[1]
s = open(path).read()

old_comment = "    # Reverse proxy: route /api/chat to local Ollama\n"
new_comment = ("    # Reverse proxy: /api/chat goes to the Hire Me assistant (hire-me/server/chat.py),\n"
               "    # the only thing that talks to Ollama. See hire-me/server/DEPLOYMENT.md.\n")
old_block = (
    "    <Location /api/chat>\n"
    "        ProxyPass http://127.0.0.1:11434/api/chat\n"
    "        ProxyPassReverse http://127.0.0.1:11434/api/chat\n"
    "        Require all granted\n"
    "    </Location>\n"
)
new_block = (
    "    <Proxy http://127.0.0.1:8792/*>\n"
    "        Require all granted\n"
    "    </Proxy>\n"
    "    <Location /api/chat>\n"
    "        ProxyPass http://127.0.0.1:8792/chat flushpackets=on timeout=180\n"
    "        ProxyPassReverse http://127.0.0.1:8792/chat\n"
    "        Require all granted\n"
    "    </Location>\n"
)
deny = (
    "# The Hire Me assistant's source and prompt are never served as pages.\n"
    '<Directory "/var/www/frontendneeded.com/hire-me/server">\n'
    "    Require all denied\n"
    "</Directory>\n"
    "\n"
)

if s.count(old_block) != 1:
    sys.exit("     The /api/chat block is not the one this script knows, so it changed nothing.\n"
             "     Make the change by hand from hire-me/server/apache-snippet.conf.")
s = s.replace(old_block, new_block, 1)
s = s.replace(old_comment, new_comment, 1)
if 'hire-me/server">' not in s:
    end = s.rfind("</VirtualHost>")
    if end < 0:
        sys.exit("     No </VirtualHost> in the file; changed nothing.")
    s = s[:end] + deny + s[end:]
open(path, "w").write(s)
PY
fi

echo "4/5  Checking Apache's config"
if ! apachectl configtest; then
    if [ -n "${backup:-}" ]; then
        cp -p "$backup" "$CONF"
        echo "     Apache refused it, so the backup is back in place. Nothing was reloaded."
    fi
    exit 1
fi
systemctl reload httpd
sleep 1

echo "5/5  Checking it from the outside, through Apache"
via=(--resolve "$SITE:443:127.0.0.1" -s)
code=$(curl "${via[@]}" -o /dev/null -w '%{http_code}' "https://$SITE/api/chat/health")
echo "     /api/chat/health            $code   (want 200)"
code=$(curl "${via[@]}" -o /dev/null -w '%{http_code}' "https://$SITE/hire-me/server/chat.py")
echo "     /hire-me/server/chat.py     $code   (want 403)"
model=$(curl "${via[@]}" -X POST "https://$SITE/api/chat" \
    -H 'Content-Type: application/json' -H "Origin: https://$SITE" \
    -d '{"model":"dolphin-mistral","messages":[{"role":"user","content":"Reply with just the word ok."}]}' \
    | head -1 | python3 -c 'import sys,json; print(json.loads(sys.stdin.read() or "{}").get("model","no answer"))' 2>/dev/null || echo "no answer")
echo "     asked for dolphin-mistral, got: $model   (want llama3)"
code=$(curl "${via[@]}" -o /dev/null -w '%{http_code}' -X POST "https://$SITE/api/chat" \
    -H 'Content-Type: application/json' -d '{"messages":[{"role":"user","content":"hi"}]}')
echo "     no Origin (a script)         $code   (want 403)"

echo
echo "Done. Its log:  journalctl -u hire-me-chat -f"
