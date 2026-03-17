# frontendneeded.com

Personal website for Ki-Jana Panzarella (Key). Self-hosted 24/7 on a
repurposed PC running Fedora Linux with Apache. Deployed via GitHub,
managed through the CLI.

Live at [frontendneeded.com](https://frontendneeded.com)

---

## Stack

- HTML, CSS, vanilla JavaScript
- Apache on Fedora Linux (self-hosted)
- GitHub for version control and deployment

## Pages

- `/` — Home / about
- `/tarella-notes/` — iOS app showcase
- `/tarella-privacy-policy/` — Privacy policy for Tarella Notes
- `/wfpc/` — Warframe Price Checker (in progress)
- `/hire-me/` — Resume and contact

## Structure

- `css/` — Global styles (`styles.css`) + per-page stylesheets
- `js/` — Per-page JavaScript
- `fonts/` — Self-hosted woff2 files (DM Sans, Playfair Display)
- `images/` — Site images and OG assets

## Deployment

Changes are pushed to GitHub from either machine, then pulled on the server:

```bash
git pull origin main
```

from `/var/www/frontendneeded.com/` on the Fedora machine.