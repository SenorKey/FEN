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
- `/case-chronicle/` — Court cases read end to end in the order they happened, built from the
  public docket. A hub listing the cases, plus one page per case beneath it. Every case page
  loads `case-chronicle/chronicle.css` and `chronicle.js`, which name no case between them, so
  adding a case is one HTML file. Standalone: they do not load the shared stylesheet, since the
  golden-ratio shell pins the body to 100vh and these are scrolling documents
  - `/case-chronicle/doe-v-bonnell/` — *Doe v. Bonnell II*, from the full public docket. The
    only one with a **Common ground** section; the template for a new case is Chronology, the
    decision tree, Side by side, and Notes
  - `/case-chronicle/depp-v-heard/` — *Depp v. Heard*, from the Fairfax record, the court's own
    published letter opinions, and both parties' deposition transcripts. Carries its own
    stylesheet: the two side inks are sampled off the portraits in its masthead
  - `/doe-v-bonnell/` — where that page used to live. A stub that canonicalises and refreshes
    to the new URL, because the old one is indexed. Replaceable with a one-line Apache 301

**Hidden / unlisted** (excluded from sitemap and disallowed in robots.txt):

- `/match-analysis/` — Live tactical scouting React app (`noindex,nofollow`)
- `/my-kings-cadence/` — NFL schedules, scores and standings (`noindex,nofollow`): the current
  week's slate in the reader's own time zone, any team's season, and the AFC/NFC tables. Any
  season back to 2002 — the first year of the current eight-division shape — can be browsed.
  Reads ESPN's public keyless endpoints straight from the browser, so there is nothing to host
  and nothing to rotate. Standalone page, same reason as `/case-chronicle/`. Deliberately *not*
  in robots.txt: a Disallow would stop crawlers reading its `noindex`
- `/case-chronicle/commonwealth-v-clancy/` — section skeleton (`noindex,nofollow`, and out of
  the sitemap). The masthead docket facts and the Notes are researched and cited; the three
  sections between them are not. Listed on the Chronicle hub as in-progress. Lift the `robots`
  meta and add the URL to `sitemap.xml` on the commit that fills it in
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
- `assets/fonts/` — Self-hosted woff2. Bricolage Grotesque (variable, 200–800) is the
  site face. DM Sans and Playfair Display are still shipped: the Preside by Side,
  Match Analysis and Incisor apps are deliberately pinned to them and do not follow
  the shared stylesheet
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