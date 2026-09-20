/* Exercises the client's network seam outside a browser.
 *
 * js/market-data.js is the one place the page talks to the service, and the
 * property checked here is the one no view can check for itself: a URL
 * already out is asked for once, however many surfaces want it. On a Trade
 * tab holding SPY the index strip, the portfolio, the equity curve and its
 * benchmark each ask for the same daily series in the same tick, and before
 * D22 that was four round trips.
 *
 * The claim cannot be seen by a promise that settles as it is built — the
 * second caller would arrive after the first had already finished — so the
 * fetch stub here stays genuinely pending, which is what a network is. Each
 * request is kept by URL so a test can settle one and leave another out,
 * which is the case that separates single-flight from a cache.
 *
 * What it does not check is anything either side of the seam: the readers
 * have their own runners, and whether a surface then draws the answer is
 * tools/shoot.py's job.
 *
 * Run by test_market_data.py. Arguments: <page-dir>
 */

function run(argv) {
    'use strict';
    ObjC.import('Foundation');

    function read(path) {
        return $.NSString.stringWithContentsOfFileEncodingError(
            path, $.NSUTF8StringEncoding, null).js;
    }

    var pageDir = argv[0];
    var results = [];
    var failed = 0;

    function check(name, condition, detail) {
        results.push({ test: name, pass: !!condition, detail: detail || '' });
        if (!condition) failed++;
    }

    function equal(name, actual, expected) {
        check(name, actual === expected,
            'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
    }

    function report() {
        return JSON.stringify({ failed: failed, total: results.length, results: results });
    }

    /* ── Two promises, because the seam needs both ──────────────── */

    /* `Settled` stands in for the global Promise, the way every other runner
     * here uses it: it settles as it is built, which is all the module's own
     * `Promise.reject` and the stub's `json()` need. */
    function Settled(state, value) {
        this.state = state;
        this.value = value;
    }
    function wrap(value) {
        return value instanceof Settled ? value : new Settled('ok', value);
    }
    Settled.prototype.then = function (onOk, onFail) {
        var handler = this.state === 'ok' ? onOk : onFail;
        if (!handler) return this;
        try {
            return wrap(handler(this.value));
        } catch (error) {
            return new Settled('fail', error);
        }
    };
    Settled.resolve = function (value) { return wrap(value); };
    Settled.reject = function (value) { return new Settled('fail', value); };

    /* `Pending` is the fetch itself, and the only reason this runner exists:
     * a request that has not answered yet is the state in which a second
     * caller can join a first. */
    function Pending() {
        this.handlers = [];
    }
    Pending.prototype.then = function (onOk, onFail) {
        var next = new Pending();
        this.handlers.push({ ok: onOk, fail: onFail, next: next });
        return next;
    };
    /* Adopts a promise a handler returns, the way a real one does. Without
     * it the client's `response.json().then(...)` inside a `.then(...)` would
     * hand the next link a promise object where the parsed payload should be,
     * and the reader would call that malformed — a bug in this harness that
     * would read exactly like a bug in the page. */
    Pending.prototype.settle = function (state, value) {
        this.handlers.forEach(function (handler) {
            var run = state === 'ok' ? handler.ok : handler.fail;
            if (!run) {
                handler.next.settle(state, value);
                return;
            }
            var out;
            try {
                out = run(value);
            } catch (error) {
                handler.next.settle('fail', error);
                return;
            }
            if (out && typeof out.then === 'function') {
                out.then(function (settled) {
                    handler.next.settle('ok', settled);
                }, function (error) {
                    handler.next.settle('fail', error);
                });
            } else {
                handler.next.settle('ok', out);
            }
        });
        this.handlers = [];
    };

    /* ── The module under test ──────────────────────────────────── */

    var requested = [];
    var pending = {};

    function fetchStub(url) {
        requested.push(url);
        pending[url] = new Pending();
        return pending[url];
    }

    var dataWindow = {
        fetch: fetchStub,
        setTimeout: function () { return 1; },
        clearTimeout: function () { }
    };

    var data;
    try {
        (new Function('window', 'Promise', 'AbortController',
            read(pageDir + '/js/market-data.js')))(dataWindow, Settled, null);
        data = dataWindow.IncisorMarketData;
        check('market-data.js parses and runs', !!data);
    } catch (error) {
        check('market-data.js parses and runs', false, String(error));
        return report();
    }

    function routeUrl(route, symbol) {
        return data.BASE + '/' + route + '?symbol=' + symbol;
    }

    /* A daily series, minimal but shaped the way readHistory insists on. */
    function historyBody(symbol) {
        return {
            symbol: symbol, source: 'fixture', stale: false,
            fetched_at: '2026-08-27T12:00:00Z',
            history: { bars: [
                { date: '2026-08-26', open: 100, high: 101, low: 99,
                    close: 100.5, volume: 1000 },
                { date: '2026-08-27', open: 100.5, high: 102, low: 100,
                    close: 101.25, volume: 1200 }
            ] }
        };
    }

    function answer(target, body) {
        pending[target].settle('ok', {
            ok: true, status: 200,
            json: function () { return Settled.resolve(body); }
        });
    }

    /* Ends anything still out before the next case.
     *
     * The module's map is keyed by URL and outlives this harness's own
     * bookkeeping, so a request left hanging here would be joined by the next
     * case and no fetch would be made — the run would then measure the
     * leftover rather than the case. A browser never reaches that state
     * because withTimeout aborts at TIMEOUT_MS, which is the same settling
     * this stands in for. */
    function reset() {
        Object.keys(pending).forEach(function (url) {
            pending[url].settle('fail', new Error('abandoned'));
        });
        requested = [];
        pending = {};
    }

    /* ── One load asks for a series once ────────────────────────── */

    /* The four callers D22 names, in the order the Trade tab starts them and
     * inside one tick, which is the only arrangement that can show this. */
    reset();
    var strip = data.history('SPY');
    var portfolio = data.history('SPY');
    var curve = data.history('SPY');
    var benchmark = data.history('SPY');

    equal('four surfaces asking for one series make one request',
        requested.length, 1);
    equal('and it is the series they asked for', requested[0],
        routeUrl('history', 'SPY'));

    /* Every caller is answered by that one reply. They are deliberately not
     * handed one object: each reads the shared payload itself, so a surface
     * gets its own checked bars and cannot be reached by what another does
     * with them. */
    var envelopes = [];
    [strip, portfolio, curve, benchmark].forEach(function (request) {
        request.then(function (envelope) {
            envelopes.push(envelope);
        }, function (error) {
            envelopes.push({ failed: error && error.kind });
        });
    });

    answer(routeUrl('history', 'SPY'), historyBody('SPY'));

    /* Read defensively, because the case this is here to catch leaves three
     * of the four callers waiting on requests of their own that nothing
     * settles. Reaching into an envelope that never arrived would end the run
     * with a TypeError, and a crash reports none of the checks below it. */
    equal('one reply answers all four', envelopes.length, 4);
    equal('every one of them with the same closing price',
        envelopes.map(function (envelope) {
            if (!envelope.bars) return 'unanswered';
            return envelope.bars[envelope.bars.length - 1].close;
        }).join(','), '101.25,101.25,101.25,101.25');
    check('and each with bars of its own, not one shared array',
        envelopes.length === 4 && envelopes[0].bars !== envelopes[1].bars);

    /* ── A different question is a different request ────────────── */

    reset();
    data.history('SPY');
    data.history('QQQ');
    equal('a different symbol is its own request', requested.length, 2);

    reset();
    data.history('SPY');
    data.quote('SPY');
    data.fundamentals('SPY');
    equal('and so is a different route for the same symbol',
        requested.length, 3);

    /* ── Sharing the request, never the answer ──────────────────── */

    /* A settled entry is dropped, so the next asker gets a fresh request.
     * Holding the answer would leave a surface showing a figure that had
     * stopped being refreshed, with nothing on the page to expire it — the
     * service caches, and that is where the caching belongs (DEC-003). */
    reset();
    data.history('SPY');
    answer(routeUrl('history', 'SPY'), historyBody('SPY'));
    equal('the reply took one request', requested.length, 1);

    data.history('SPY');
    equal('a settled request is not held for the next caller',
        requested.length, 2);

    /* A failure is dropped just as readily. One left behind would hand its
     * rejection to every later caller of that URL, which is the bug this
     * kind of memo reliably grows — so it is asserted rather than trusted. */
    reset();
    var outcome = '';
    data.history('SPY').then(function () { outcome = 'resolved'; },
        function (error) { outcome = error && error.kind; });

    pending[routeUrl('history', 'SPY')].settle('fail', new Error('network down'));
    equal('a failed request rejects its caller with a kind', outcome, 'offline');

    data.history('SPY');
    equal('and a rejected request is not handed to the next caller',
        requested.length, 2);

    /* ── The route that has always shared ───────────────────────── */

    /* The filings panel and the reporting calendar are started in the same
     * tick by js/view-symbol.js and read one response. That sharing predates
     * D22 and was folded into the seam by it, so one guard now covers both. */
    reset();
    data.fundamentals('AAPL');
    data.fundamentals('AAPL');
    equal('two surfaces reading one lookup make one request',
        requested.length, 1);

    /* ── A request never made is never shared ───────────────────── */

    /* A symbol failing the whitelist is rejected before a URL exists, so a
     * bad one cannot leave an entry behind for a good one to join. */
    reset();
    var rejected = '';
    data.history('not a symbol').then(null, function (error) {
        rejected = error && error.kind;
    });
    equal('a symbol that fails the whitelist never becomes a request',
        requested.length, 0);
    equal('and says why', rejected, 'invalid_symbol');

    return report();
}
