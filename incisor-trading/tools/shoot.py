#!/usr/bin/env python3
"""
Headless screenshot + console check for the Incisor Trading page.

Exists because a scheduled session has no interactive browser, and guide §13
makes aesthetics a per-task requirement — work that cannot be looked at cannot
be judged. This drives the copy of Google Chrome already on the machine
(channel="chrome"), so nothing is downloaded and nothing is installed system
wide; the driver lives in the gitignored .devtools venv.

Why Playwright and not `chrome --headless --screenshot`: passing a narrow
--window-size renders the page at that width as a *desktop* browser. Device
emulation never engages, so the result is not what a phone shows and the
difference is large enough to invent overflow bugs that do not exist. See
DECISIONS.md, "narrow headless screenshots are not mobile".

Usage:
    ./.devtools/bin/python tools/shoot.py [--out docs/shots/<name>] [--url ...]

Serves the repo root itself, so no dev server needs to be running. Exits
non-zero if the page logs a console error or overflows horizontally — the two
failures worth blocking a commit on.
"""

import argparse
import contextlib
import functools
import http.server
import pathlib
import socketserver
import sys
import threading

REPO = pathlib.Path(__file__).resolve().parent.parent.parent
PAGE = "/incisor-trading/"

# (label, width, height, emulate_as_mobile)
VIEWPORTS = [
    ("desktop", 1440, 1000, False),
    ("tablet", 768, 1024, False),
    ("mobile", 390, 844, True),
]


# The dev server is static, so the first-party beacon's POST to /api/event
# always 501s here. On the real site Apache proxies that path to the status
# station. Filtering it keeps the console check meaningful instead of always red.
BENIGN_CONSOLE = ("/api/event",)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


@contextlib.contextmanager
def serving(root):
    """A quiet static server on an ephemeral port, torn down on exit."""
    handler = functools.partial(QuietHandler, directory=str(root))
    with socketserver.TCPServer(("127.0.0.1", 0), handler) as httpd:
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        yield f"http://127.0.0.1:{httpd.server_address[1]}"
        httpd.shutdown()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="docs/shots/current")
    ap.add_argument("--url", default=None, help="override; default serves the repo")
    ap.add_argument("--theme", default="dark", choices=["dark", "light"])
    args = ap.parse_args()

    from playwright.sync_api import sync_playwright

    out = (REPO / "incisor-trading" / args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)

    problems = []
    with contextlib.ExitStack() as stack:
        base = args.url or stack.enter_context(serving(REPO))
        pw = stack.enter_context(sync_playwright())
        # channel="chrome" uses the installed Google Chrome — no download.
        browser = pw.chromium.launch(channel="chrome")

        for label, width, height, mobile in VIEWPORTS:
            ctx = browser.new_context(
                viewport={"width": width, "height": height},
                is_mobile=mobile,
                has_touch=mobile,
                device_scale_factor=2 if mobile else 1,
                color_scheme=args.theme,
            )
            page = ctx.new_page()
            errors = []
            # A console message's text omits the offending URL, so the
            # location is appended — BENIGN_CONSOLE matches against it.
            def on_console(m):
                if m.type != "error":
                    return
                where = (m.location or {}).get("url", "")
                errors.append(f"{m.text} [{where}]" if where else m.text)

            page.on("console", on_console)
            page.on("pageerror", lambda e: errors.append(str(e)))

            page.goto(base + PAGE, wait_until="networkidle")

            # Horizontal overflow is a guide §13 violation, so it fails the run
            # rather than being left for a human to spot in an image.
            overflow = page.evaluate(
                "() => {const d=document.documentElement;"
                "return {vw:d.clientWidth, sw:d.scrollWidth};}"
            )
            if overflow["sw"] > overflow["vw"] + 1:
                problems.append(
                    f"{label}: body scrolls horizontally "
                    f"({overflow['sw']}px in a {overflow['vw']}px viewport)"
                )
            for err in errors:
                if any(b in err for b in BENIGN_CONSOLE):
                    continue
                problems.append(f"{label}: console error — {err}")

            page.screenshot(path=str(out / f"{label}.png"), full_page=True)
            print(f"  {label:8} {width}x{height}"
                  f"{' (mobile emulation)' if mobile else ''}"
                  f" -> {out.name}/{label}.png")
            ctx.close()

        browser.close()

    if problems:
        print("\nFAILED:")
        for p in problems:
            print("  -", p)
        return 1
    print("\nNo console errors, no horizontal overflow.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
