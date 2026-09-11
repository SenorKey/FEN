/* Exercises the paper portfolio outside a browser.
 *
 * Three modules. js/portfolio-ledger.js is pure arithmetic, checked against a
 * scenario worked out by hand in cents — the figures below were computed on
 * paper before the module existed, not read back out of it. js/portfolio-
 * store.js is pure apart from the storage it is handed, so it runs against
 * stubs that hold every kind of corrupt blob, throw on access, or refuse
 * writes. js/view-portfolio.js runs against dom_stub.jxa.js.
 *
 * "Survives a reload" is checked the way a reload works: one store records
 * trades, is thrown away, and a second is opened over the same storage.
 *
 * The migration path is exercised twice: `migrate` driven directly with
 * steps written here, and the shipped store opened over a version 1 blob,
 * from before open orders existed, which is the first real migration.
 *
 * Run by test_portfolio.py. Arguments: <page-dir>
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

    /* ── A promise that settles as it is built ──────────────────── */

    function Settled(state, value) {
        this.state = state;
        this.value = value;
    }
    function wrap(value) {
        return value instanceof Settled ? value : new Settled('ok', value);
    }
    Settled.prototype.then = function (onOk, onFail) {
        if (this.state === 'pending') return this;
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
    Settled.never = function () { return new Settled('pending'); };

    /* ── Modules under test ─────────────────────────────────────── */

    var STORE_SOURCE = read(pageDir + '/js/portfolio-store.js');
    var stub = {};
    var box = {};
    try {
        (new Function('exports', read(pageDir + '/tests/dom_stub.jxa.js')))(stub);
        (new Function('window', read(pageDir + '/js/market-figures.js')))(box);
        (new Function('window', read(pageDir + '/js/portfolio-ledger.js')))(box);
        (new Function('window', read(pageDir + '/js/portfolio-orders.js')))(box);
        (new Function('window', STORE_SOURCE))(box);
        check('the modules parse and run', !!box.IncisorPortfolioLedger
            && !!box.IncisorPortfolioStore);
    } catch (error) {
        check('the modules parse and run', false, String(error));
        return report();
    }
    var ledger = box.IncisorPortfolioLedger;
    var storage = box.IncisorPortfolioStore;
    var figures = box.IncisorMarketFigures;
    var El = stub.El;

    var START = 10000000;
    var AT = '2026-09-11T14:31:07.000Z';

    function trade(kind, symbol, shares, price) {
        return { kind: kind, symbol: symbol, shares: shares, price: price, at: AT };
    }

    /* Applies trades in order and fails the named check on the first refusal. */
    function afterTrades(name, trades) {
        var state = ledger.emptyState(START);
        for (var index = 0; index < trades.length; index++) {
            var result = ledger.apply(state, trades[index]);
            if (result.error) {
                check(name + ' - trade ' + index + ' applies', false, result.error);
                return state;
            }
            state = result.state;
        }
        return state;
    }

    /* ── Amounts ────────────────────────────────────────────────── */

    equal('an amount is rounded to the cent once', ledger.amountFor(10, 190.12), 190120);
    equal('a sub-dollar price keeps its precision until the total',
        ledger.amountFor(3, 0.1234), 37);
    equal('the starting balance is $100,000 in cents', ledger.STARTING_CASH, START);

    /* ── The hand-computed scenario ─────────────────────────────── */

    /* Worked on paper, in cents:
     *
     *   buy  10 SPY @ 500.00  -> 500,000   cash 9,500,000   SPY 10 cost 500,000
     *   buy   5 SPY @ 520.10  -> 260,050   cash 9,239,950   SPY 15 cost 760,050
     *   sell  6 SPY @ 530.00  -> 318,000   cost sold round(760,050 x 6/15)
     *                                        = 304,020, realized +13,980
     *                                      cash 9,557,950   SPY 9 cost 456,030
     *   sell  9 SPY @ 490.00  -> 441,000   closing, cost sold 456,030,
     *                                        realized -15,030 -> total -1,050
     *                                      cash 9,998,950   no position
     *
     * And the invariant that checks the whole thing: with nothing held, cash
     * less the starting balance is exactly the realized gain.
     */
    var scenario = [
        trade('buy', 'SPY', 10, 500.00),
        trade('buy', 'SPY', 5, 520.10),
        trade('sell', 'SPY', 6, 530.00),
        trade('sell', 'SPY', 9, 490.00)
    ];

    var step1 = afterTrades('scenario', scenario.slice(0, 1));
    equal('scenario: the first buy leaves 9,500,000', step1.cash, 9500000);
    same('scenario: and ten shares costing 500,000', step1.positions.SPY,
        { shares: 10, cost: 500000 });

    var step2 = afterTrades('scenario', scenario.slice(0, 2));
    equal('scenario: the second buy leaves 9,239,950', step2.cash, 9239950);
    same('scenario: fifteen shares costing 760,050', step2.positions.SPY,
        { shares: 15, cost: 760050 });
    equal('scenario: an average cost of $506.70',
        ledger.valuation(step2, {}).rows[0].averageCost, 506.7);

    var step3 = afterTrades('scenario', scenario.slice(0, 3));
    equal('scenario: a partial sale realizes 13,980', step3.realized, 13980);
    equal('scenario: and leaves 9,557,950', step3.cash, 9557950);
    same('scenario: with nine shares costing 456,030', step3.positions.SPY,
        { shares: 9, cost: 456030 });

    var step4 = afterTrades('scenario', scenario);
    equal('scenario: closing the position realizes -1,050 in all', step4.realized, -1050);
    equal('scenario: and leaves 9,998,950', step4.cash, 9998950);
    same('scenario: with nothing held', step4.positions, {});
    equal('scenario: cash less the start is the realized gain',
        step4.cash - START, step4.realized);
    equal('scenario: four trades counted', step4.trades, 4);

    /* ── Cents do not drift ─────────────────────────────────────── */

    var roundTrip = afterTrades('round trip',
        [trade('buy', 'AAPL', 7, 13.37), trade('sell', 'AAPL', 7, 13.37)]);
    equal('buying and selling at one price returns every cent', roundTrip.cash, START);
    equal('and realizes nothing', roundTrip.realized, 0);

    var churn = [];
    for (var lap = 0; lap < 300; lap++) {
        churn.push(trade('buy', 'QQQ', 3, 0.1 + 0.2));
        churn.push(trade('sell', 'QQQ', 3, 0.1 + 0.2));
    }
    var churned = afterTrades('churn', churn);
    equal('six hundred trades at a float-hostile price drift by nothing',
        churned.cash, START);

    var thirds = afterTrades('thirds', [trade('buy', 'DIA', 3, 100.01),
        trade('sell', 'DIA', 1, 100.01), trade('sell', 'DIA', 1, 100.01),
        trade('sell', 'DIA', 1, 100.01)]);
    equal('a position sold in thirds leaves no cost behind', thirds.cash, START);
    equal('and no realized residue', thirds.realized, 0);

    /* ── The rules a trade is judged by ─────────────────────────── */

    var base = ledger.emptyState(START);
    var overspend = ledger.apply(base, trade('buy', 'SPY', 1000, 101));
    equal('a buy past the cash is refused', overspend.error, 'insufficient-cash');
    equal('and changes nothing', base.cash, START);

    var allIn = ledger.apply(base, trade('buy', 'SPY', 1000, 100));
    equal('a buy of exactly the cash is allowed', allIn.state && allIn.state.cash, 0);

    equal('selling what is not held is refused',
        ledger.apply(base, trade('sell', 'SPY', 1, 100)).error, 'insufficient-shares');
    equal('selling more than is held is refused',
        ledger.apply(step1, trade('sell', 'SPY', 11, 100)).error, 'insufficient-shares');
    equal('a refused sale leaves the position alone', step1.positions.SPY.shares, 10);

    var invalid = {
        'no shares': { shares: 0 },
        'a fractional share': { shares: 1.5 },
        'negative shares': { shares: -1 },
        'shares as text': { shares: '10' },
        'a price that is not a number': { price: NaN },
        'a zero price': { price: 0 },
        'a negative price': { price: -5 },
        'a price past any real share': { price: 1e9 },
        'a price as text': { price: '500' },
        'a lowercase symbol': { symbol: 'spy' },
        'markup as a symbol': { symbol: '<img src=x>' },
        'a short sale': { kind: 'short' },
        'no timestamp': { at: undefined },
        'a timestamp in another format': { at: 'Sep 11 2026' }
    };
    Object.keys(invalid).forEach(function (name) {
        var entry = trade('buy', 'SPY', 1, 100);
        Object.keys(invalid[name]).forEach(function (field) {
            entry[field] = invalid[name][field];
        });
        equal('a trade with ' + name + ' is invalid',
            ledger.apply(base, entry).error, 'invalid');
    });
    equal('a trade that is not an object is invalid',
        ledger.apply(base, 'buy SPY').error, 'invalid');

    var extra = trade('buy', 'SPY', 1, 100);
    extra.note = 'carried along';
    same('an entry keeps its five fields and nothing else',
        Object.keys(ledger.apply(base, extra).entry), ['kind', 'symbol', 'shares', 'price', 'at']);

    /* ── Replaying ──────────────────────────────────────────────── */

    var replayed = ledger.replay(scenario, START);
    equal('a replay reaches the same cash as the trades did', replayed.state.cash, step4.cash);
    equal('and the same realized gain', replayed.state.realized, step4.realized);
    equal('and keeps every entry', replayed.ledger.length, 4);
    same('an empty ledger is the starting balance', ledger.replay([], START).state,
        ledger.emptyState(START));

    equal('a ledger with one invalid entry replays to nothing',
        ledger.replay([scenario[0], trade('buy', 'spy', 1, 1)], START), null);
    equal('a ledger that sells before it buys replays to nothing',
        ledger.replay([scenario[2], scenario[0]], START), null);
    equal('a ledger that is not a list replays to nothing',
        ledger.replay({ 0: scenario[0] }, START), null);
    [0, -5, 1.5, '10000000', null].forEach(function (cash) {
        equal('a starting balance of ' + JSON.stringify(cash) + ' replays to nothing',
            ledger.replay([], cash), null);
    });

    /* ── Valuing ────────────────────────────────────────────────── */

    /* 10 SPY for 500,000 and 5 QQQ for 200,000; cash 9,300,000. At SPY 510
     * and QQQ 390: SPY is worth 510,000 (+10,000, +2%), QQQ 195,000 (-5,000,
     * -2.5%), holdings 705,000, total 10,005,000, +5,000 or +0.05%. */
    var two = afterTrades('two positions',
        [trade('buy', 'SPY', 10, 500), trade('buy', 'QQQ', 5, 400)]);
    var marked = ledger.valuation(two, { SPY: 510, QQQ: 390 });
    same('rows come in symbol order', marked.rows.map(function (row) {
        return row.symbol;
    }), ['QQQ', 'SPY']);
    equal('a position is worth its shares at the price', marked.rows[1].marketValue, 510000);
    equal('its unrealized gain is worth less cost', marked.rows[1].unrealized, 10000);
    equal('as a percentage of its cost', marked.rows[1].unrealizedPercent, 2);
    equal('a loss is negative', marked.rows[0].unrealized, -5000);
    equal('and so is its percentage', marked.rows[0].unrealizedPercent, -2.5);
    equal('holdings add up', marked.holdings, 705000);
    equal('cash is unchanged by prices', marked.cash, 9300000);
    equal('the total is cash and holdings', marked.total, 10005000);
    equal('the return is the total less the start', marked.totalReturn, 5000);
    equal('as a percentage of the start', marked.totalReturnPercent, 0.05);
    equal('unrealized sums the positions', marked.unrealized, 5000);
    equal('nothing has been realized', marked.realized, 0);

    var partial = ledger.valuation(two, { SPY: 510 });
    equal('an unpriced position has no value', partial.rows[0].marketValue, null);
    equal('but keeps its cost', partial.rows[0].cost, 200000);
    equal('holdings are unknown, not short by one', partial.holdings, null);
    equal('so is the total', partial.total, null);
    equal('and the return', partial.totalReturn, null);
    equal('and its percentage', partial.totalReturnPercent, null);
    equal('and unrealized', partial.unrealized, null);
    equal('cash is still known', partial.cash, 9300000);
    equal('realized is still known', partial.realized, 0);

    equal('a zero price counts as unknown',
        ledger.valuation(two, { SPY: 510, QQQ: 0 }).total, null);

    var idle = ledger.valuation(ledger.emptyState(START), {});
    equal('an all-cash portfolio holds nothing', idle.holdings, 0);
    equal('and is worth its start', idle.total, START);
    equal('with a return of zero', idle.totalReturnPercent, 0);

    /* ── Storage stubs ──────────────────────────────────────────── */

    function memoryStorage(seed) {
        var held = seed === undefined ? {} : seed;
        return {
            held: held,
            writes: 0,
            getItem: function (key) {
                return Object.prototype.hasOwnProperty.call(held, key)
                    ? held[key] : null;
            },
            setItem: function (key, value) {
                this.writes++;
                held[key] = String(value);
            },
            removeItem: function (key) { delete held[key]; }
        };
    }

    function hostileStorage() {
        return {
            getItem: function () { throw new Error('SecurityError'); },
            setItem: function () { throw new Error('SecurityError'); },
            removeItem: function () { throw new Error('SecurityError'); }
        };
    }

    function fullStorage(seed) {
        var held = memoryStorage(seed);
        held.setItem = function () { throw new Error('QuotaExceededError'); };
        return held;
    }

    function seeded(text) {
        var seed = {};
        seed[storage.KEY] = text;
        return memoryStorage(seed);
    }

    function blobText(trades, version, cash, orders) {
        var v = version === undefined ? storage.VERSION : version;
        var blob = { v: v, startingCash: cash === undefined ? START : cash, ledger: trades };
        if (v !== 1) blob.orders = orders || [];
        return JSON.stringify(blob);
    }

    function stored(held) {
        var text = held.held[storage.KEY];
        return text === undefined ? null : JSON.parse(text);
    }

    /* ── The stored portfolio ───────────────────────────────────── */

    var emptyBox = memoryStorage();
    var fresh = storage.open(emptyBox);
    equal('a first visit opens a fresh portfolio', fresh.status(), 'fresh');
    equal('which will persist', fresh.isPersistent(), true);
    equal('and writes nothing merely by opening', emptyBox.writes, 0);
    equal('it starts with $100,000 in cash', fresh.state().cash, START);

    equal('a trade is recorded', fresh.record(scenario[0]), 'recorded');
    equal('and written through', emptyBox.writes, 1);
    same('the stored shape is the version, the start, the ledger and the orders',
        Object.keys(stored(emptyBox)), ['v', 'startingCash', 'ledger', 'orders']);
    fresh.record(scenario[1]);

    var reloaded = storage.open(emptyBox);
    equal('a reload restores it', reloaded.status(), 'restored');
    same('with the same ledger', reloaded.ledger(), fresh.ledger());
    same('and the same state', reloaded.state(), fresh.state());

    var before = emptyBox.writes;
    equal('a refused trade says why', reloaded.record(trade('buy', 'SPY', 10000, 500)),
        'insufficient-cash');
    equal('and writes nothing', emptyBox.writes, before);
    equal('and records nothing', reloaded.ledger().length, 2);

    var handed = reloaded.state();
    handed.cash = 1;
    handed.positions.SPY.shares = 9999;
    equal('the state handed out is a copy', reloaded.state().cash, 9239950);
    equal('down to the positions', reloaded.state().positions.SPY.shares, 15);
    var copied = reloaded.ledger();
    copied[0].price = 1;
    equal('so is the ledger', reloaded.ledger()[0].price, 500);

    reloaded.reset();
    equal('a reset returns the cash', reloaded.state().cash, START);
    same('and stores an empty ledger', stored(emptyBox).ledger, []);

    /* ── Blobs that cannot be believed ──────────────────────────── */

    var corrupt = {
        'text that is not JSON': 'portfolio',
        'an empty object': '{}',
        'null': 'null',
        'a list': '[]',
        'a version and nothing else': '{"v":1}',
        'a ledger that is not a list': blobText({ 0: scenario[0] }),
        'a ledger that sells first': blobText([scenario[2]]),
        'a ledger with a bad entry': blobText([trade('buy', 'SPY', 1.5, 100)]),
        'version zero': blobText([], 0),
        'a version as text': blobText([], '1'),
        'a fractional version': blobText([], 1.5),
        'a starting balance of zero': blobText([], undefined, 0),
        'orders that are not a list': blobText([], undefined, undefined, { 0: 1 }),
        'an order that is not one': blobText([], undefined, undefined,
            [{ id: 'o1', kind: 'short' }]),
        'two orders sharing an id': blobText([], undefined, undefined, [
            { id: 'o1', kind: 'buy', symbol: 'SPY', shares: 1, type: 'market',
                limit: null, reference: 500, placedAt: AT },
            { id: 'o1', kind: 'buy', symbol: 'QQQ', shares: 1, type: 'market',
                limit: null, reference: 400, placedAt: AT }])
    };
    Object.keys(corrupt).forEach(function (name) {
        var held = seeded(corrupt[name]);
        var opened = storage.open(held);
        equal(name + ' is recovered', opened.status(), 'recovered');
        equal(name + ' opens at the starting balance', opened.state().cash, START);
        equal(name + ' is replaced at once', held.writes, 1);
        equal(name + ' is told about once',
            storage.open(held).status(), 'restored');
    });

    /* ── A blob from a newer page ───────────────────────────────── */

    var newerText = blobText([scenario[0]], storage.VERSION + 1);
    var newerBox = seeded(newerText);
    var newer = storage.open(newerBox);
    equal('a newer blob is recognised', newer.status(), 'newer');
    equal('and is not claimed to persist', newer.isPersistent(), false);
    equal('the page runs on a fresh portfolio', newer.state().cash, START);
    equal('trading still works, in memory', newer.record(scenario[0]), 'recorded');
    newer.reset();
    equal('and nothing overwrote the newer blob', newerBox.held[storage.KEY], newerText);
    equal('not once', newerBox.writes, 0);

    /* ── Storage that fails ─────────────────────────────────────── */

    var blocked = null;
    try {
        blocked = storage.open(hostileStorage());
        check('blocked storage does not throw on open', true);
    } catch (error) {
        check('blocked storage does not throw on open', false, String(error));
    }
    if (blocked) {
        equal('blocked storage opens fresh', blocked.status(), 'fresh');
        equal('and says it will not persist', blocked.isPersistent(), false);
        equal('but still trades', blocked.record(scenario[0]), 'recorded');
        equal('in memory', blocked.state().cash, 9500000);
    }

    equal('no storage at all does not persist', storage.open(null).isPersistent(), false);

    var full = storage.open(fullStorage(seeded(blobText([scenario[0]])).held));
    equal('a full storage still reads', full.status(), 'restored');
    equal('a write refused by quota still trades', full.record(scenario[1]), 'recorded');
    equal('but stops claiming to persist', full.isPersistent(), false);
    equal('and the trade holds in memory', full.state().positions.SPY.shares, 15);

    /* ── The migration runner ───────────────────────────────────── */

    var steps = {
        1: function (old) {
            return { v: 2, startingCash: old.startingCash, ledger: old.ledger, orders: [] };
        },
        2: function (old) {
            return { v: 3, startingCash: old.startingCash, ledger: old.ledger,
                orders: old.orders, splits: [] };
        }
    };
    var v1 = { v: 1, startingCash: START, ledger: [] };
    same('a blob is carried through every step in order',
        storage.migrate(v1, steps, 3),
        { v: 3, startingCash: START, ledger: [], orders: [], splits: [] });
    equal('a blob already current is returned as it is', storage.migrate(v1, steps, 1), v1);
    equal('a gap in the steps is refused', storage.migrate(v1, { 2: steps[2] }, 3), null);
    equal('a step that throws is refused', storage.migrate(v1,
        { 1: function () { throw new Error('bad step'); } }, 2), null);
    equal('a step that skips a version is refused', storage.migrate(v1,
        { 1: function () { return { v: 3 }; } }, 3), null);
    equal('a step that returns nothing is refused', storage.migrate(v1,
        { 1: function () { return null; } }, 2), null);
    equal('a blob with no version is refused', storage.migrate({}, steps, 3), null);
    equal('something that is not a blob is refused', storage.migrate('v1', steps, 3), null);

    /* The first real migration: a portfolio saved before orders existed. */
    var oldBox = seeded(blobText([scenario[0]], 1));
    var migrated = storage.open(oldBox);
    equal('a version 1 portfolio is restored through its migration',
        migrated.status(), 'restored');
    equal('with its trades intact', migrated.state().positions.SPY.shares, 10);
    same('and no open orders', migrated.orders(), []);
    equal('and is written back at the new version', stored(oldBox).v, storage.VERSION);
    same('with an empty order list', stored(oldBox).orders, []);
    equal('once', oldBox.writes, 1);
    storage.open(oldBox);
    equal('so the step does not run again on the next load', oldBox.writes, 1);

    /* ── The view ───────────────────────────────────────────────── */

    function bars(closes) {
        return closes.map(function (close, at) {
            return { date: '2026-09-' + (8 + at), open: close, high: close,
                low: close, close: close, volume: 1000 };
        });
    }

    function payloadFor(symbol, closes) {
        return { symbol: symbol, source: 'fixture', delay: 'end-of-day',
            stale: false, bars: bars(closes) };
    }

    /* The markup the view documents: a root and the served fallback line. */
    function buildRoot() {
        var root = new El('div', { 'class': 'inc-folio', 'data-portfolio': '',
            'data-state': 'pending' });
        root.appendChild(new El('p', { 'class': 'inc-empty',
            'data-portfolio-fallback': '' }));
        return root;
    }

    /* Drives the real view. `answers` maps a symbol to a payload, 'never'
     * for a request that does not settle, or nothing for one that fails. */
    function mount(held, answers, without) {
        var root = buildRoot();
        var asked = [];
        var windowStub = {
            localStorage: held,
            IncisorMarketFigures: figures,
            IncisorMarketData: {
                history: function (symbol) {
                    asked.push(symbol);
                    var answer = answers ? answers[symbol] : null;
                    if (answer === 'never') return Settled.never();
                    return answer ? Settled.resolve(answer) : Settled.reject(new Error('offline'));
                }
            }
        };
        var documentStub = stub.makeDocument([root]);
        (new Function('window', read(pageDir + '/js/dom.js')))(windowStub);
        (new Function('window', read(pageDir + '/js/market-clock.js')))(windowStub);
        (new Function('window', read(pageDir + '/js/portfolio-ledger.js')))(windowStub);
        (new Function('window', read(pageDir + '/js/portfolio-orders.js')))(windowStub);
        if (without !== 'store') {
            (new Function('window', STORE_SOURCE))(windowStub);
        }
        (new Function('document', 'window',
            read(pageDir + '/js/view-portfolio.js')))(documentStub, windowStub);

        function text(className) {
            var node = root.querySelector('.' + className);
            return node ? node.textContent : null;
        }
        function values() {
            return root.querySelectorAll('.inc-folio-value').map(function (node) {
                return node.children.length
                    ? node.children.map(function (child) { return child.textContent; }).join('')
                    : node.textContent;
            });
        }
        function change() {
            var node = root.querySelector('.inc-folio-change');
            return node.children.slice(0, 2).map(function (child) {
                return child.textContent;
            }).join('');
        }
        /* The asides in figure order: cash, holdings, realized, unrealized. */
        function aside(index) {
            return root.querySelectorAll('.inc-folio-aside')[index].textContent;
        }
        return { root: root, asked: asked, text: text, values: values, change: change,
            aside: aside,
            node: function (className) { return root.querySelector('.' + className); } };
    }

    /* Every coloured figure the view built carries an arrow glyph. */
    function everyColourHasAnArrow(root) {
        return root.querySelectorAll('.inc-up').concat(root.querySelectorAll('.inc-down'))
            .every(function (node) { return node.querySelector('.inc-arrow') !== null; });
    }

    var first = mount(memoryStorage());
    equal('view: the served fallback is hidden once drawn',
        first.root.querySelector('[data-portfolio-fallback]').hidden, true);
    same('view: a fresh portfolio shows total, cash, holdings and two gains',
        first.values(), ['$100,000.00', '$100,000.00', '$0.00', '▬$0.00', '▬$0.00']);
    equal('view: the return is flat and says so in figures', first.change(),
        '▬$0.00 (0.00%)');
    equal('view: and names its window', first.node('inc-folio-change')
        .querySelector('.inc-period').textContent, 'since start');
    check('view: a flat return is coloured flat',
        first.node('inc-folio-change').classList.contains('inc-flat'));
    equal('view: no positions', first.aside(1), 'No positions');
    equal('view: nothing held back with no open orders', first.aside(0), '');
    equal('view: no trades yet', first.text('inc-folio-activity'), 'No trades yet.');
    equal('view: no notice for a first visit', first.node('inc-folio-notice').hidden, true);
    equal('view: the notice is announced', first.node('inc-folio-notice')
        .getAttribute('role'), 'status');
    equal('view: no provenance line for an all-cash portfolio',
        first.node('inc-provenance').hidden, true);
    equal('view: an all-cash portfolio asks for no prices', first.asked.length, 0);
    equal('view: and is ready', first.root.getAttribute('data-state'), 'ready');

    var lost = mount(seeded('portfolio'));
    equal('view: a recovered portfolio is announced', lost.node('inc-folio-notice').hidden,
        false);
    check('view: saying it could not be read',
        /could not be read/.test(lost.text('inc-folio-notice')));
    check('view: before the figures it explains',
        lost.root.children.indexOf(lost.node('inc-folio-notice'))
            < lost.root.children.indexOf(lost.node('inc-folio-figures')));

    var ahead = mount(seeded(newerText));
    check('view: a newer blob is announced as left untouched',
        /newer version[\s\S]*left untouched/.test(ahead.text('inc-folio-notice')));

    var privateWindow = mount(hostileStorage());
    check('view: blocked storage is announced',
        /not storing site data/.test(privateWindow.text('inc-folio-notice')));

    var holdingTwo = blobText([trade('buy', 'SPY', 10, 500), trade('buy', 'QQQ', 5, 400)]);
    var priced = mount(seeded(holdingTwo), {
        SPY: payloadFor('SPY', [505, 510]),
        QQQ: payloadFor('QQQ', [395, 390])
    });
    same('view: each held symbol is priced once', priced.asked.slice().sort(), ['QQQ', 'SPY']);
    same('view: held positions are marked to their last close', priced.values(),
        ['$100,050.00', '$93,000.00', '$7,050.00', '▬$0.00', '▲+$50.00']);
    equal('view: the return is signed and pointed', priced.change(), '▲+$50.00 (+0.05%)');
    check('view: and coloured up', priced.node('inc-folio-change').classList.contains('inc-up'));
    check('view: every coloured figure carries an arrow', everyColourHasAnArrow(priced.root));
    equal('view: two positions', priced.aside(1), '2 positions');
    equal('view: two trades', priced.text('inc-folio-activity'), '2 trades so far.');
    equal('view: priced figures state where the prices came from',
        priced.node('inc-provenance').hidden, false);
    check('view: as sample data', /^Sample data/.test(priced.node('inc-provenance')
        .children[1].textContent));
    equal('view: and is ready', priced.root.getAttribute('data-state'), 'ready');

    var halfPriced = mount(seeded(holdingTwo), { SPY: payloadFor('SPY', [505, 510]) });
    same('view: one unpriced position dashes everything that needs it',
        halfPriced.values(), ['—', '$93,000.00', '—', '▬$0.00', '—']);
    equal('view: including the return', halfPriced.change(), '—');
    check('view: and says why, counting one', /One held position could not be priced/
        .test(halfPriced.text('inc-folio-activity')));
    var offline = mount(seeded(holdingTwo), {});
    check('view: or counting several', /2 held positions could not be priced/
        .test(offline.text('inc-folio-activity')));
    equal('view: with no provenance for a total it could not make',
        halfPriced.node('inc-provenance').hidden, true);
    equal('view: and is unpriced', halfPriced.root.getAttribute('data-state'), 'unpriced');

    var waiting = mount(seeded(holdingTwo), { SPY: 'never', QQQ: 'never' });
    equal('view: still waiting for prices is pricing, not failed',
        waiting.root.getAttribute('data-state'), 'pricing');
    check('view: and does not claim a price failed',
        !/could not be priced/.test(waiting.text('inc-folio-activity')));

    var lonely = new El('div', {});
    try {
        (new Function('document', 'window', read(pageDir + '/js/view-portfolio.js')))(
            stub.makeDocument([lonely]), { IncisorMarketFigures: figures });
        check('view: with no panel on the page it does nothing', lonely.children.length === 0);
    } catch (error) {
        check('view: with no panel on the page it does nothing', false, String(error));
    }

    var noStore = mount(memoryStorage(), null, 'store');
    equal('view: with the store missing the served line stays',
        noStore.root.querySelector('[data-portfolio-fallback]').hidden, false);
    equal('view: and nothing is built over it', noStore.root.children.length, 1);

    return report();
}
