/* Exercises the equity curve's view outside a browser.
 *
 * js/portfolio-history.js does the arithmetic and history_model.jxa.js checks
 * it against figures worked out by hand. This checks the other half, which
 * had no runner at all until D21: what js/view-performance.js *says* about
 * that arithmetic — the state it declares, the reason it gives when there is
 * no line, the verdict sentence and the key figures when there is one, and
 * which series it asks the network for and how often.
 *
 * js/view-portfolio.js is mounted beside it because that is the arrangement
 * it ships in: the curve reads the store and the Trade tab's series through
 * it, and fetches only what that module is not already pricing.
 *
 * The week is history_model.jxa.js's, Monday 14 to Friday 18 September 2026,
 * so the figures below are the ones that file already derived on paper.
 *
 * Run by test_performance.py. Arguments: <page-dir>
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

    function same(name, actual, expected) {
        equal(name, JSON.stringify(actual), JSON.stringify(expected));
    }

    function report() {
        return JSON.stringify({ failed: failed, total: results.length, results: results });
    }

    /* A promise that settles in place, the stand-in every runner here uses:
     * nothing below is testing asynchrony, only what is drawn once an
     * answer is in. */
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

    /* An answer that has not come back yet, released by the test. The one
     * state Settled cannot reach is "asked and waiting", and the view has a
     * state of its own for exactly that. */
    function Waiting() {
        this.handlers = [];
    }
    Waiting.prototype.then = function (onOk, onFail) {
        this.handlers.push({ ok: onOk, fail: onFail });
    };
    Waiting.prototype.answer = function (value) {
        this.handlers.forEach(function (pair) { pair.ok(value); });
    };

    /* ── Modules under test ─────────────────────────────────────── */

    var MODULES = ['/js/dom.js', '/js/market-clock.js', '/js/market-figures.js',
        '/js/chart-geometry.js', '/js/portfolio-ledger.js',
        '/js/portfolio-orders.js', '/js/portfolio-store.js',
        '/js/portfolio-history.js'];
    var stub = {};
    var box = {};
    try {
        (new Function('exports', read(pageDir + '/tests/dom_stub.jxa.js')))(stub);
        MODULES.forEach(function (path) {
            (new Function('window', read(pageDir + path)))(box);
        });
        check('the modules parse and run', !!box.IncisorPortfolioHistory
            && !!box.IncisorChartGeometry && !!box.IncisorPortfolioStore);
    } catch (error) {
        check('the modules parse and run', false, String(error));
        return report();
    }
    var storage = box.IncisorPortfolioStore;
    var El = stub.El;
    var START = 10000000;

    /* ── The week ───────────────────────────────────────────────── */

    var WEEK = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17',
        '2026-09-18'];

    function payload(dates, closes) {
        return { symbol: 'X', source: 'fixture', delay: 'end-of-day', stale: false,
            bars: dates.map(function (date, at) {
                return { date: date, open: closes[at], high: closes[at],
                    low: closes[at], close: closes[at], volume: 1000 };
            }) };
    }

    // The closing bell, 16:00 ET, while daylight saving is in force.
    function at(date) { return date + 'T20:00:00.000Z'; }

    function trade(kind, symbol, shares, price, when) {
        return { kind: kind, symbol: symbol, shares: shares, price: price, at: when };
    }

    function memoryStorage(seed) {
        var held = seed || {};
        return {
            getItem: function (key) {
                return Object.prototype.hasOwnProperty.call(held, key)
                    ? held[key] : null;
            },
            setItem: function (key, value) { held[key] = String(value); },
            removeItem: function (key) { delete held[key]; }
        };
    }

    function seeded(trades) {
        var seed = {};
        seed[storage.KEY] = JSON.stringify({ v: storage.VERSION,
            startingCash: START, ledger: trades, orders: [] });
        return memoryStorage(seed);
    }

    /* The two roots index.html serves, empty as documented. `answers` maps a
     * symbol to a payload, a Waiting, or nothing — which is a refusal. Every
     * request is counted, whichever module made it. */
    function mount(held, answers, patch) {
        var folio = new El('div', { 'class': 'inc-folio', 'data-portfolio': '',
            'data-state': 'pending' });
        folio.appendChild(new El('p', { 'class': 'inc-empty',
            'data-portfolio-fallback': '' }));
        var root = new El('div', { 'class': 'inc-perf-block', 'data-performance': '' });

        var asked = {};
        var windowStub = {
            localStorage: held,
            IncisorMarketData: {
                history: function (symbol) {
                    asked[symbol] = (asked[symbol] || 0) + 1;
                    var answer = answers[symbol];
                    if (answer instanceof Waiting) return answer;
                    return answer ? new Settled('ok', answer)
                        : new Settled('fail', new Error('offline'));
                }
            }
        };
        var documentStub = stub.makeDocument([folio, root]);
        MODULES.forEach(function (path) {
            (new Function('window', read(pageDir + path)))(windowStub);
        });
        if (patch) patch(windowStub);
        (new Function('document', 'window',
            read(pageDir + '/js/view-portfolio.js')))(documentStub, windowStub);
        (new Function('document', 'window',
            read(pageDir + '/js/view-performance.js')))(documentStub, windowStub);

        function text(className) {
            var node = root.querySelector('.' + className);
            return node ? node.textContent : null;
        }

        return {
            root: root,
            asked: asked,
            portfolio: windowStub.IncisorPortfolio,
            state: function () { return root.getAttribute('data-state'); },
            message: function () { return root.querySelector('.inc-empty'); },
            note: function () { return root.querySelector('.inc-panel-note'); },
            figure: function () { return root.querySelector('.inc-perf-figure'); },
            plot: function () { return root.querySelector('.inc-perf-plot'); },
            verdict: function () { return text('inc-perf-verdict'); },
            keyFigures: function () {
                return root.querySelectorAll('.inc-perf-key-figure');
            },
            labels: function (className) {
                return root.querySelectorAll('.' + className).map(function (node) {
                    return node.textContent;
                });
            }
        };
    }

    /* A reason's whole state: what is said, what is shown, what is declared. */
    function refuses(name, view, state, message) {
        equal(name + ': the block declares it', view.state(), state);
        equal(name + ': the reader is told why', view.message().textContent, message);
        equal(name + ': and the line is not drawn', view.figure().hidden, true);
        equal(name + ': with the reason shown', view.message().hidden, false);
    }

    /* ── Behind: history_model.jxa.js's week ────────────────────── */

    /* AAPL bought at Tuesday's close, part-sold at Thursday's. The portfolio
     * ends at 10,140,000 and the benchmark at 10,300,000, both from
     * 10,000,000: trading made $1,400.00 and holding SPY made $3,000.00. */
    var SPY = payload(WEEK, [500, 510, 505, 520, 515]);
    var AAPL = payload(WEEK, [200, 210, 220, 215, 230]);
    var behind = mount(seeded([
        trade('buy', 'AAPL', 100, 210, at('2026-09-15')),
        trade('sell', 'AAPL', 40, 215, at('2026-09-17'))
    ]), { SPY: SPY, AAPL: AAPL });

    equal('a curve that can be drawn declares itself ready', behind.state(), 'ready');
    equal('and shows the line', behind.figure().hidden, false);
    equal('with no reason beside it', behind.message().hidden, true);
    equal('and the note saying what the benchmark is', behind.note().hidden, false);
    equal('the verdict states the gap and names the window', behind.verdict(),
        'Over 14 Sep 2026 to 18 Sep 2026 your trading is $1,600.00 behind '
        + 'buying SPY once and holding it.');
    same('the key figures say what each side did',
        behind.keyFigures().map(function (node) { return node.textContent; }),
        ['+$1,400.00 (+1.40%)', '+$3,000.00 (+3.00%)']);
    check('both gains are marked as rises, whatever the verdict',
        behind.keyFigures().every(function (node) {
            return node.classes().indexOf('inc-up') !== -1;
        }));
    equal('the plot describes itself to a screen reader',
        behind.plot().getAttribute('aria-label'),
        'Two lines from 14 Sep 2026 to 18 Sep 2026. Your portfolio +$1,400.00, '
        + 'SPY bought and held +$3,000.00. Both started at $100,000.00. The '
        + 'figures beside the key say the same thing.');
    equal('it draws the starting balance and both lines',
        behind.plot().children.map(function (node) { return node.tag; }).join(' '),
        'line path path');
    same('the reader’s own line is drawn last, on top where they cross',
        behind.plot().children.slice(1).map(function (node) {
            return node.getAttribute('class');
        }), ['inc-perf-line-theirs', 'inc-perf-line-mine']);
    same('the axis names only where the line starts and stops',
        behind.labels('inc-perf-date-label'), ['14 Sep', '18 Sep']);
    check('the scale is labelled in whole dollars, not abbreviated',
        behind.labels('inc-perf-scale-label').length >= 2
            && behind.labels('inc-perf-scale-label').every(function (label) {
                return /^\$[0-9,]+$/.test(label);
            }), JSON.stringify(behind.labels('inc-perf-scale-label')));

    /* SPY is not held, so the portfolio never asked for it; the curve did. */
    equal('the benchmark is asked for once', behind.asked.SPY, 1);
    equal('the sample flag is raised by what the curve fetched',
        behind.portfolio.isSample(), true);

    /* ── Ahead, and level ───────────────────────────────────────── */

    /* The same trades against a benchmark that fell: 10,000,000 x 490/500
     * = 9,800,000, so holding SPY lost $2,000.00 and trading is $3,400.00
     * ahead of it. */
    var ahead = mount(seeded([
        trade('buy', 'AAPL', 100, 210, at('2026-09-15')),
        trade('sell', 'AAPL', 40, 215, at('2026-09-17'))
    ]), { SPY: payload(WEEK, [500, 500, 500, 500, 490]), AAPL: AAPL });
    equal('a gap in the reader’s favour says ahead', ahead.verdict(),
        'Over 14 Sep 2026 to 18 Sep 2026 your trading is $3,400.00 ahead of '
        + 'buying SPY once and holding it.');
    check('and the benchmark’s loss is marked as one',
        ahead.keyFigures()[1].classes().indexOf('inc-down') !== -1);

    /* The whole balance in SPY, bought on the 14th at its close: the one
     * portfolio that must match the benchmark to the cent. */
    var level = mount(seeded([
        trade('buy', 'SPY', 200, 500, at('2026-09-14'))
    ]), { SPY: payload(WEEK, [500, 500, 510, 505, 520]) });
    equal('a portfolio that is the benchmark comes out level', level.verdict(),
        'Over 14 Sep 2026 to 18 Sep 2026 your trading and buying SPY once came '
        + 'out level, to the cent.');

    /* ── Every reason there is no line ──────────────────────────── */

    var bare = mount(memoryStorage(), {});
    refuses('no trades', bare, 'pending', 'Your first trade starts this chart. It '
        + 'compares what your portfolio did with what the whole $100,000 would '
        + 'have done in SPY over the same days.');
    equal('no trades: the note is hidden, since the reason already says it',
        bare.note().hidden, true);
    equal('no trades: and nothing is fetched to say so', bare.asked.SPY, undefined);

    /* One bar, and a trade before it: no baseline session, one point. */
    var short = mount(seeded([trade('buy', 'AAPL', 10, 200, '2026-09-18T15:00:00.000Z')]),
        { SPY: payload(['2026-09-18'], [515]), AAPL: payload(['2026-09-18'], [230]) });
    refuses('too short', short, 'unavailable', 'This chart needs two days of '
        + 'trading to draw a line. It will appear once the market has closed again.');
    equal('too short: the note stays, since the chart is coming', short.note().hidden,
        false);

    var missing = mount(seeded([trade('buy', 'AAPL', 10, 200, at('2026-09-15'))]),
        { SPY: SPY });
    refuses('missing prices', missing, 'unavailable', 'Prices for one of the '
        + 'symbols you have traded could not be loaded, so this chart would be '
        + 'missing part of what your portfolio was worth.');

    var noBenchmark = mount(seeded([trade('buy', 'AAPL', 10, 200, at('2026-09-15'))]),
        { AAPL: AAPL });
    refuses('no benchmark', noBenchmark, 'unavailable', 'SPY’s prices could not be '
        + 'loaded, so there is nothing to compare against.');

    /* Bars dated only on a weekend: no session to value the portfolio on. */
    var WEEKEND = ['2026-09-19', '2026-09-20'];
    var noSessions = mount(seeded([trade('buy', 'AAPL', 10, 200, at('2026-09-15'))]),
        { SPY: payload(WEEKEND, [515, 515]), AAPL: payload(WEEKEND, [230, 230]) });
    refuses('no sessions', noSessions, 'unavailable', 'No trading day in your '
        + 'history could be priced yet.');

    /* Stored in an order that replays, stamped in one that does not: the
     * sell carries the earlier time. The store judges the ledger in its own
     * order; the curve walks it by time. */
    var unreplayable = mount(seeded([
        trade('buy', 'AAPL', 10, 200, at('2026-09-16')),
        trade('sell', 'AAPL', 10, 210, at('2026-09-15'))
    ]), { SPY: SPY, AAPL: AAPL });
    refuses('unreplayable', unreplayable, 'unavailable', 'Your trade history could '
        + 'not be replayed day by day.');

    /* A reason this view has never heard of still gets a sentence. */
    var unknown = mount(seeded([trade('buy', 'AAPL', 10, 200, at('2026-09-15'))]),
        { SPY: SPY, AAPL: AAPL }, function (windowStub) {
            windowStub.IncisorPortfolioHistory.curve = function () {
                return { reason: 'a-reason-added-later' };
            };
        });
    refuses('an unknown reason', unknown, 'unavailable', 'This chart is unavailable.');

    /* Thirteen symbols, one past the limit the curve can price. */
    var SYMBOLS = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG', 'HHH', 'III',
        'JJJ', 'KKK', 'LLL', 'MMM'];
    var wide = {};
    SYMBOLS.forEach(function (symbol) { wide[symbol] = payload(WEEK, [10, 10, 10, 10, 10]); });
    wide.SPY = SPY;
    var tooMany = mount(seeded(SYMBOLS.map(function (symbol) {
        return trade('buy', symbol, 1, 10, at('2026-09-15'));
    })), wide);
    refuses('too many symbols', tooMany, 'unavailable', 'You have traded 13 symbols, '
        + 'and this chart can price 12. Drawing it without one of them would show '
        + 'a portfolio you never had.');
    equal('too many symbols: the curve asks for nothing it cannot use',
        tooMany.asked.SPY, undefined);

    /* ── Asking, waiting, and not asking again ──────────────────── */

    /* A position bought and sold before today is not in play, so the
     * portfolio does not price it — the curve must, or the line has a hole. */
    var spyLater = new Waiting();
    var closed = mount(seeded([
        trade('buy', 'AAPL', 10, 200, at('2026-09-15')),
        trade('sell', 'AAPL', 10, 220, at('2026-09-16'))
    ]), { SPY: spyLater, AAPL: AAPL });
    equal('a closed-out symbol is asked for by the curve itself', closed.asked.AAPL, 1);
    equal('while an answer is on its way the block says it is loading',
        closed.state(), 'loading');
    equal('with no reason shown, since nothing has failed', closed.message().hidden,
        true);
    equal('and no line yet', closed.figure().hidden, true);
    spyLater.answer(SPY);
    equal('the curve draws once the last answer lands', closed.state(), 'ready');

    /* The failure in DEC-064's shape: a redraw that re-asks for what already
     * failed would send a request per ticket keystroke, and look fine. */
    noBenchmark.portfolio.changed();
    noBenchmark.portfolio.changed();
    noBenchmark.portfolio.changed();
    equal('a symbol whose request failed is not asked for again on redraw',
        noBenchmark.asked.SPY, 1);
    equal('and the reason stays on screen', noBenchmark.state(), 'unavailable');
    behind.portfolio.changed();
    equal('nor is one that answered', behind.asked.SPY, 1);

    /* ── Nothing to draw into ───────────────────────────────────── */

    var lonely = new El('div', {});
    try {
        (new Function('document', 'window', read(pageDir + '/js/view-performance.js')))(
            stub.makeDocument([lonely]), {});
        check('with no root on the page it does nothing', lonely.children.length === 0);
    } catch (error) {
        check('with no root on the page it does nothing', false, String(error));
    }

    return report();
}
