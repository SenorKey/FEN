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
    ./.devtools/bin/python tools/shoot.py [--out docs/shots/<name>]
                                          [--api http://127.0.0.1:8789]
                                          [--symbol SPY [--range 5Y]]
                                          [--search app]

Serves the repo root itself, so no dev server needs to be running. Exits
non-zero if the page logs a console error or overflows horizontally — the two
failures worth blocking a commit on.

--symbol, --range and --search reach a state that only exists after an
interaction: the quote panel and the chart are empty until someone searches,
so without them the only screenshot that could be taken is the one state
nobody is asking about. --range presses one of the chart's range buttons once
a symbol is loaded, which is how a range other than the default gets shot.

With --api, /api/incisor/* is forwarded to a running incisor service the way
Apache forwards it in production, so the dashboard can be shot with real
fixture data in it. Without it those requests 404, which is the other shot
worth having: the page has to degrade to a stated "unavailable" rather than
a blank grid, and that is an acceptance criterion rather than an edge case.
"""

import argparse
import contextlib
import functools
import http.server
import pathlib
import socketserver
import sys
import threading
import urllib.error
import urllib.request

REPO = pathlib.Path(__file__).resolve().parent.parent.parent
PAGE = "/incisor-trading/"

# (label, width, height, emulate_as_mobile)
VIEWPORTS = [
    ("desktop", 1440, 1000, False),
    ("tablet", 768, 1024, False),
    ("mobile", 390, 844, True),
]


API_PREFIX = "/api/incisor/"

# Console noise that is about this harness rather than the page.
#
# The beacon POSTs to /api/event, which Apache proxies to the status station
# on the real site and which always 501s against a static server. The market
# service is the same story without --api: Chrome logs a failed request as a
# console error, and the page answering it with a designed "unavailable"
# state is the behaviour being shot, not a defect.
#
# Both match on the request URL, which is appended to the message below, so
# a genuine script error inside market-data.js is still reported — its
# location is the script, not the endpoint.
BENIGN_CONSOLE = ("/api/event", API_PREFIX)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    """Static files, plus the one reverse proxy Apache provides in production.

    `api_base` is None unless --api was passed, in which case a request under
    API_PREFIX is forwarded verbatim and its status, content type and body come
    straight back. Nothing is rewritten: the point is for the page to see the
    same bytes it would see on the real site.
    """

    api_base = None

    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.api_base and self.path.startswith(API_PREFIX):
            self.proxy()
            return
        super().do_GET()

    def proxy(self):
        target = self.api_base + self.path[len(API_PREFIX) - 1:]
        try:
            # Origin is set because the service checks it, the way a browser
            # on the real site would set it to the site's own hostname.
            request = urllib.request.Request(
                target, headers={"Origin": "https://frontendneeded.com"})
            with urllib.request.urlopen(request, timeout=10) as upstream:
                status = upstream.status
                body = upstream.read()
                content_type = upstream.headers.get(
                    "Content-Type", "application/json")
        except urllib.error.HTTPError as error:
            status, body = error.code, error.read()
            content_type = error.headers.get("Content-Type", "application/json")
        except OSError as error:
            print(f"  proxy: {self.path} -> {error}")
            status = 502
            body = b'{"error":"proxy_unreachable"}'
            content_type = "application/json"

        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


SEARCH_INPUT = "[data-search-input]"
SETTLED = ('[data-quote]:not([data-state="loading"])'
           ':not([data-state="empty"])')
CHART_READY = '[data-chart][data-state="ready"]'


def drive(page, args, problems, label):
    """Put the page into a state that only exists after an interaction.

    The quote panel is the whole of T7 and it is empty until someone searches,
    so without this the only screenshot the tool could take of it is the one
    state nobody is asking about. Failures are collected rather than raised:
    a state that could not be reached is a finding about the page, and the
    other viewports are still worth shooting.
    """
    page.fill(SEARCH_INPUT, args.search or args.symbol)
    try:
        if args.symbol:
            page.press(SEARCH_INPUT, "Enter")
            # Any state the panel settles in, not just a filled one. A symbol
            # with no data behind it settles in not-found, and that is a state
            # worth a screenshot rather than a failure to reach one.
            page.wait_for_selector(SETTLED, timeout=10000)
            if args.range:
                # The chart is a separate surface with its own state, so it
                # is waited for separately: the panel settles before the
                # series it hands over has been drawn.
                page.wait_for_selector(CHART_READY, timeout=10000)
                page.click('[data-chart-range="%s"]' % args.range)
                page.wait_for_selector(CHART_READY, timeout=10000)
        else:
            page.wait_for_selector("[data-search-results] [role=option]",
                                   timeout=10000)
    except Exception as error:
        problems.append(f"{label}: could not reach the requested state — "
                        f"{type(error).__name__}")


@contextlib.contextmanager
def serving(root, api_base=None):
    """A quiet static server on an ephemeral port, torn down on exit."""
    handler = functools.partial(QuietHandler, directory=str(root))
    QuietHandler.api_base = api_base.rstrip("/") if api_base else None
    with socketserver.TCPServer(("127.0.0.1", 0), handler) as httpd:
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        yield f"http://127.0.0.1:{httpd.server_address[1]}"
        httpd.shutdown()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="docs/shots/current")
    ap.add_argument("--url", default=None, help="override; default serves the repo")
    ap.add_argument("--api", default=None,
                    help="forward /api/incisor/* to a running service, "
                         "e.g. http://127.0.0.1:8789")
    ap.add_argument("--theme", default="dark", choices=["dark", "light"])
    ap.add_argument("--search", default=None,
                    help="type this into the symbol search and leave the "
                         "results list open, e.g. --search app")
    ap.add_argument("--symbol", default=None,
                    help="look this symbol up before shooting, e.g. --symbol SPY")
    ap.add_argument("--range", default=None,
                    help="press this chart range after the symbol loads, "
                         "e.g. --range 5Y. Needs --symbol.")
    args = ap.parse_args()

    from playwright.sync_api import sync_playwright

    out = (REPO / "incisor-trading" / args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)

    problems = []
    with contextlib.ExitStack() as stack:
        base = args.url or stack.enter_context(serving(REPO, args.api))
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

            if args.search or args.symbol:
                drive(page, args, problems, label)

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

            # animations="disabled" finishes any transition in flight before
            # the shutter, rather than capturing a state the page is only in
            # for 180ms. Without it a shot taken straight after an interaction
            # catches a control halfway between two appearances, which reads
            # as a bug in the page and is a bug in the screenshot.
            page.screenshot(path=str(out / f"{label}.png"), full_page=True,
                            animations="disabled")
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
    print("\nNo console errors, no horizontal overflow"
          f"{' (market service proxied)' if args.api else ''}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
