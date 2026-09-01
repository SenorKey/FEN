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
                                          [--explain] [--sector-window 1M]
                                          [--watch SPY,QQQ] [--block-storage]

Serves the repo root itself, so no dev server needs to be running. Exits
non-zero if the page logs a console error or overflows horizontally — the two
failures worth blocking a commit on.

Three widths are photographed and a fourth is only measured: with --api, the
page is loaded once more at 320px with a full watchlist and checked for
horizontal overflow. It gets no screenshot because it is one number rather
than a picture, and a fourth image every session is a permanent cost.

--symbol, --range and --search reach a state that only exists after an
interaction: the quote panel and the chart are empty until someone searches,
so without them the only screenshot that could be taken is the one state
nobody is asking about. --range presses one of the chart's range buttons once
a symbol is loaded, which is how a range other than the default gets shot.

--explain opens the fundamentals panel's explanations. They ship closed, so
the state where the page actually teaches something is one no screenshot would
otherwise hold.

--sector-window presses one of the sector grid's windows. The grid ranks
eleven funds, so a window where they all fell is the mirror of one where they
all rose — a different picture of the same surface, and only the default one
gets shot without this.

--watch seeds localStorage before the first navigation, which is the only
way to photograph the watchlist as a returning visitor sees it — a fresh
browser context has no site data, so a list built by clicking would only show
that the click worked. --block-storage makes localStorage throw on access, the
way a private window does, so the degraded state is a picture rather than a
claim.

--chart-no-history is the one state no fixture can produce: a quote that
arrives with no series behind it, which the chart says in its own space rather
than failing the panel. It needs /quote to answer and /history not to, and the
service either has a symbol or does not — so the chart is driven into it
through the API the quote panel drives it with. It is a real state of the real
page in live mode, and it is designed, so it is worth a picture.

With --api, /api/incisor/* is forwarded to a running incisor service the way
Apache forwards it in production, so the dashboard can be shot with real
fixture data in it. Without it those requests 404, which is the other shot
worth having: the page has to degrade to a stated "unavailable" rather than
a blank grid, and that is an acceptance criterion rather than an edge case.
"""

import argparse
import contextlib
import json
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
# /api/event is always benign: the beacon POSTs there, Apache proxies it to the
# status station on the real site, and a static server always 501s it.
BENIGN_CONSOLE = ("/api/event",)

# The market service is benign only when it was never wired up. With --api
# passed, a failing call is a real failure and has to be reported — suppressing
# it unconditionally would hide a 500 from the very service being exercised.
BENIGN_WITHOUT_API = (API_PREFIX,)

QUOTE_STATE = '[data-quote][data-state]'


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


CHART_NO_HISTORY = '[data-chart][data-state="unavailable"]'
WATCHLIST_READY = '[data-watchlist][data-state="ready"]'
SECTORS_READY = '[data-sector][data-state="ready"]'
# A company or a fund: both are states the panel settled in and both are worth
# a picture, so the wait is for either rather than for the filled one.
FUNDAMENTALS_SETTLED = ('[data-fundamental][data-state="ready"], '
                        '[data-fundamental][data-state="fund"]')


def drive(page, args, problems, label):
    """Put the page into a state that only exists after an interaction.

    The quote panel is the whole of T7 and it is empty until someone searches,
    so without this the only screenshot the tool could take of it is the one
    state nobody is asking about. Failures are collected rather than raised:
    a state that could not be reached is a finding about the page, and the
    other viewports are still worth shooting.

    Returns the state the quote panel settled in, which decides whether the
    upstream 404 behind a not-found shot is a defect or the subject.
    """
    page.fill(SEARCH_INPUT, args.search or args.symbol)
    try:
        if args.symbol:
            page.press(SEARCH_INPUT, "Enter")
            # Any state the panel settles in, not just a filled one. A symbol
            # with no data behind it settles in not-found, and that is a state
            # worth a screenshot rather than a failure to reach one.
            page.wait_for_selector(SETTLED, timeout=10000)
            if args.range or args.chart_no_history:
                # The chart is a separate surface with its own state, so it
                # is waited for separately: the panel settles before the
                # series it hands over has been drawn.
                page.wait_for_selector(CHART_READY, timeout=10000)
            if args.range:
                page.click('[data-chart-range="%s"]' % args.range)
                page.wait_for_selector(CHART_READY, timeout=10000)
            if args.chart_no_history:
                page.evaluate('symbol => window.IncisorPriceChart'
                              '.unavailable(symbol)', args.symbol)
                page.wait_for_selector(CHART_NO_HISTORY, timeout=10000)
        else:
            page.wait_for_selector("[data-search-results] [role=option]",
                                   timeout=10000)
    except Exception as error:
        problems.append(f"{label}: could not reach the requested state — "
                        f"{type(error).__name__}")

    panel = page.query_selector(QUOTE_STATE)
    return panel.get_attribute("data-state") if panel else None


WATCHLIST_KEY = "incisor.watchlist"

# The stored schema, kept in step with js/watchlist-store.js. A seed written
# at the wrong version is discarded on load and the page correctly shows an
# empty list, which looks exactly like the seeding not working.
WATCHLIST_VERSION = 1


# The narrowest screen this page is checked on, below every viewport it is
# photographed at. Guide §13 is unconditional — the body never scrolls
# horizontally — so §15's 375 is a width to check at and not a floor below
# which the rule stops applying. 320 is where a table's columns run out of
# room first, and it is what D6 was hiding under.
NARROW_WIDTH = 320

# The widest the watchlist ever is: full at its cap of eight, every row priced,
# and the longest ticker the catalogue holds among them. Only symbols with
# committed fixtures, so the rows carry real figures rather than the narrower
# "unavailable" state.
NARROW_WATCHLIST = "BRK.B,XLRE,AAPL,SPY,QQQ,DIA,IWM,XLK"


def check_narrow(browser, base, args, problems):
    """Assert §13's promise at a width no screenshot is taken at.

    Measured rather than photographed: this is one property, it is a number,
    and a fourth set of images every session is a permanent cost in a repo
    served off a home connection.

    It needs the service, and that is not a convenience. With no upstream the
    rows fall back to a short "unavailable" and the table fits — so a run
    without --api would go green against the one state the rule is not about.
    Say so and skip, rather than bank a pass that stands for nothing.
    """
    if not args.api:
        print(f"  narrow   {NARROW_WIDTH}px -> skipped (needs --api; an "
              f"unpriced table is narrower than the rule is about)")
        return
    if args.block_storage:
        print(f"  narrow   {NARROW_WIDTH}px -> skipped (--block-storage "
              f"leaves nothing to seed the watchlist with)")
        return

    ctx = browser.new_context(
        viewport={"width": NARROW_WIDTH, "height": 800},
        is_mobile=True, has_touch=True, device_scale_factor=2,
        color_scheme=args.theme,
    )
    seed_storage(ctx, argparse.Namespace(block_storage=False,
                                         watch=NARROW_WATCHLIST))
    page = ctx.new_page()
    page.goto(base + PAGE, wait_until="networkidle")
    try:
        page.wait_for_selector(WATCHLIST_READY, timeout=10000)
    except Exception as error:
        problems.append(f"narrow: the watchlist never settled — "
                        f"{type(error).__name__}")

    overflow = page.evaluate(
        "() => {const d=document.documentElement;"
        "return {vw:d.clientWidth, sw:d.scrollWidth};}"
    )
    if overflow["sw"] > overflow["vw"] + 1:
        problems.append(
            f"narrow: body scrolls horizontally with a full watchlist "
            f"({overflow['sw']}px in a {overflow['vw']}px viewport)"
        )
    print(f"  narrow   {NARROW_WIDTH}x800 (mobile emulation)"
          f" -> overflow check only, no shot")
    ctx.close()


def seed_storage(ctx, args):
    """Put the browser into a storage state the page cannot reach on its own.

    --watch is the reload path, and it is the only way to photograph it: a
    fresh context starts with empty site data, so a watchlist shot after
    clicking Watch would only prove the click worked. Writing the list before
    the first navigation means the page reads it back exactly as it would on
    a second visit, which is the acceptance criterion.

    --block-storage is the other half. localStorage throws on property access
    in a private window and where site data is blocked, and a page that lets
    that reach the view loses a feature to an exception nobody can see. The
    designed answer is a working list plus a notice saying it will not
    survive a reload, and that is worth a picture.
    """
    if args.block_storage:
        ctx.add_init_script(
            "Object.defineProperty(window, 'localStorage', {"
            "  configurable: true,"
            "  get() { throw new Error('site data is blocked'); }"
            "});"
        )
        return

    if not args.watch:
        return

    symbols = [s.strip().upper() for s in args.watch.split(",") if s.strip()]
    blob = json.dumps({"v": WATCHLIST_VERSION, "symbols": symbols,
                       "sort": {"key": "symbol", "dir": "asc"}})
    ctx.add_init_script(
        "try { window.localStorage.setItem(%s, %s); } catch (e) {}"
        % (json.dumps(WATCHLIST_KEY), json.dumps(blob))
    )


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
    ap.add_argument("--chart-no-history", action="store_true",
                    help="drive the chart into its no-history state once the "
                         "symbol loads — the one state fixtures cannot serve. "
                         "Needs --symbol.")
    ap.add_argument("--watch", default=None,
                    help="seed the watchlist with these symbols before the "
                         "page loads, e.g. --watch SPY,QQQ,AAPL. This is the "
                         "reload path: the list is written to localStorage "
                         "and the page reads it back the way it would on a "
                         "second visit.")
    ap.add_argument("--explain", action="store_true",
                    help="open the fundamentals panel's explanations once a "
                         "symbol is loaded. They are what the panel is for "
                         "and they are shipped closed, so the state that "
                         "teaches is the one no shot would otherwise hold.")
    ap.add_argument("--sector-window", default=None,
                    help="press this window on the sector grid once it has "
                         "loaded, e.g. --sector-window 1M. The grid is "
                         "ranked, so a window where every sector fell draws "
                         "the mirror image of one where they rose, and only "
                         "one of the two is the default.")
    ap.add_argument("--block-storage", action="store_true",
                    help="make localStorage throw on access, the way a "
                         "private window or a browser with site data blocked "
                         "does, so the watchlist's degraded state can be shot.")
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
            seed_storage(ctx, args)

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

            # The symbol whose 404 is the thing being photographed rather
            # than a fault. Shooting the not-found state means asking the
            # service for a symbol it has no data for, and it answers 404 —
            # correctly, and Chrome logs every 404 as a console error. Only
            # the symbol this run asked for is forgiven, and only once the
            # panel has actually reported not-found for it: a 500, or a 404
            # for anything else, still fails the run.
            missing = None
            if args.search or args.symbol:
                if drive(page, args, problems, label) == "not-found":
                    missing = args.symbol

            # A seeded watchlist fetches a row per symbol, so the table is
            # still filling when the rest of the page has settled. Waiting for
            # its own state rather than for the network keeps the shot honest:
            # a row whose call failed reaches "ready" too, and that is a state
            # worth photographing rather than one worth waiting out.
            if args.watch:
                try:
                    page.wait_for_selector(WATCHLIST_READY, timeout=10000)
                except Exception as error:
                    problems.append(f"{label}: the watchlist never settled — "
                                    f"{type(error).__name__}")

            # The filings panel makes its own request once a symbol is
            # looked up, so it is waited for separately from the quote panel
            # that triggers it — and pressed only after it has figures, since
            # the control is styled out until it does.
            if args.explain:
                try:
                    page.wait_for_selector(FUNDAMENTALS_SETTLED, timeout=10000)
                    page.click('[data-fundamental-explain]')
                except Exception as error:
                    problems.append(f"{label}: the filings panel never "
                                    f"settled — {type(error).__name__}")

            # The sector grid fetches on load like the strip does, and its
            # window buttons do nothing until it has rows to re-rank — so the
            # press waits for the grid's own state rather than for the network.
            if args.sector_window:
                try:
                    page.wait_for_selector(SECTORS_READY, timeout=10000)
                    page.click('[data-sector-window="%s"]' % args.sector_window)
                except Exception as error:
                    problems.append(f"{label}: the sector grid never settled — "
                                    f"{type(error).__name__}")

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
                benign = BENIGN_CONSOLE
                if not args.api:
                    benign += BENIGN_WITHOUT_API
                if any(b in err for b in benign):
                    continue
                if missing and f"symbol={missing}" in err:
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

        check_narrow(browser, base, args, problems)
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
