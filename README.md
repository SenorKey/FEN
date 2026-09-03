# frontendneeded.com

Personal website for Ki-Jana Panzarella (Key). Self-hosted 24/7 on a
repurposed PC running Fedora Linux with Apache. Deployed via GitHub,
managed through the CLI.

Live at [frontendneeded.com](https://frontendneeded.com)

---

## Stack

- HTML, CSS, vanilla JavaScript
- React (CDN-loaded, no build step) for the Match Analysis tool
- Apache on Fedora Linux (self-hosted)
- GitHub for version control and deployment

## Pages

**Public:**

- `/` — Home / about
- `/hire-me/` — Resume + AI chat (Llama 3 via Ollama, reverse-proxied through Apache)
- `/tarella-notes/` — iOS app showcase
- `/tarella-privacy-policy/` — Privacy policy for Tarella Notes
- `/wfpc/` — Warframe Price Checker
- `/wfpc-privacy-policy/` — Privacy policy for Warframe Price Checker
- `/match-analysis-ad/` — Promo page for the Match Analysis tool
- `/preside-by-side-ad/` — Promo page for Preside by Side (presidential misconduct comparison)
- `/preside-by-side/` — Side-by-side presidential misconduct comparison app
- `/fresh-pull/` — One-click browsing data cleaner for Chrome
- `/trtbench/` — YOLOv8n object-detection benchmarks across PyTorch, ONNX Runtime, and TensorRT

**Hidden / unlisted** (excluded from sitemap and disallowed in robots.txt):

- `/match-analysis/` — Live tactical scouting React app (`noindex,nofollow`)
- `/etc/` — Ephemeral thought collection
- `/diet/` — Personal daily reset checklist
- `/claude-usage/` — Live Claude Code session-window dial (`noindex,nofollow`); reads a
  gitignored `state.json` synced up from the laptop. Sync tooling lives outside this repo
  at `~/.claude/usage-dashboard/` — it names LAN hosts and paths, so it stays off GitHub
- `/gallimaufry/` — Returns 404 via `.htaccess`

Plus a custom `/404.html` for unmatched routes.

## Structure

- `index.html`, `home.css`, `home.js` — Home page at the root
- `assets/css/styles.css` — Shared base styles (golden-ratio shell, nav, typography, gallery)
- `assets/js/gallery.js` — Shared photo-gallery cycler
- `assets/fonts/` — Self-hosted woff2 (DM Sans, Playfair Display)
- `assets/images/` — Site images, OG cards, gallery shots
- One folder per page, each containing `index.html` + a page-specific `.css` (and `.js` where needed)
- Match Analysis lives in `/match-analysis/` as four split JSX files (`app.jsx`, `pitch.jsx`, `scouting-form.jsx`, `timeline.jsx`) loaded in order via Babel-standalone — no bundler

## Deployment

Changes are pushed to GitHub from either machine, then pulled on the server:

```bash
git pull origin main
```

from `/var/www/frontendneeded.com/` on the Fedora machine.

## Local Development

To preview the site locally, run this from the project root:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`. Note: the `/api/chat` endpoint on the hire-me page requires the Ollama instance running on the live server and won't work locally.