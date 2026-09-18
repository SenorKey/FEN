/* Exercises the holdings table and the trade log outside a browser.
 *
 * js/view-positions.js draws both from state the page already holds, so it
 * computes nothing and every check below is about what a reader is shown:
 * which figures land in which column, what a row says when a price is
 * missing, what the empty states claim, and how the log's preview control
 * behaves. The arithmetic behind the figures is portfolio_model.jxa.js's.
 *
 * js/view-portfolio.js is mounted beside it because that is the arrangement
 * it ships in — the positions view reaches the store and the prices only
 * through it, and never fetches (DEC-032).
 *
 * It shipped with T16 and had no runner at all until the 09-17 audit, which
 * is how a position worth exactly what it cost went four sessions reading
 * "▬ $0.00" — a minus sign, in the surface directly below the summary where
 * DEC-093 had already settled that it was one.
 *
 * Run by test_positions.py. Arguments: <page-dir>
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

    /* A promise that settles in place, so a mounted view is fully drawn by
     * the time the next line reads it. The same stand-in the other runners
     * use, and for the same reason: nothing here is testing asynchrony. */
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

    /* ── Modules under test ─────────────────────────────────────── */

    var MODULES = ['/js/market-clock.js', '/js/market-figures.js',
        '/js/portfolio-ledger.js', '/js/portfolio-orders.js',
        '/js/portfolio-store.js'];
    var stub = {};
    var box = {};
    try {
        (new Function('exports', read(pageDir + '/tests/dom_stub.jxa.js')))(stub);
        MODULES.forEach(function (path) {
            (new Function('window', read(pageDir + path)))(box);
        });
        check('the modules parse and run', !!box.IncisorPortfolioStore);
    } catch (error) {
        check('the modules parse and run', false, String(error));
        return report();
    }
    var storage = box.IncisorPortfolioStore;
    var figures = box.IncisorMarketFigures;
    var El = stub.El;
    var START = 10000000;

    /* The stub has no focus, the way tab_model.jxa.js does it. The log's
     * control moves focus to itself after redrawing, so where focus lands is
     * behaviour and not decoration: the rows it just replaced are not
     * somewhere a screen reader asked to be. */
    var focused = [];
    El.prototype.focus = function () { focused.push(this); };

    /* ── The zero-gain marker, alone ────────────────────────────── */

    /* The rule lives in js/market-figures.js so that two surfaces cannot
     * disagree about it, which is exactly what they did. */
    equal('a gain at zero takes no marker', figures.gainArrowFor(0), '');
    equal('a gain with no value takes none either', figures.gainArrowFor(null), '');
    equal('a rise still points up', figures.gainArrowFor(12.5), '▲');
    equal('a fall still points down', figures.gainArrowFor(-12.5), '▼');
    equal('while a market change at zero keeps its flat bar',
        figures.arrowFor(0), '▬');

    /* ── Mounting ───────────────────────────────────────────────── */

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

    function trade(kind, symbol, shares, price, at) {
        return { kind: kind, symbol: symbol, shares: shares, price: price,
            at: at || '2026-06-04T15:02:11.000Z' };
    }

    function memoryStorage(seed) {
        var held = seed === undefined ? {} : seed;
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

    /* The three roots index.html serves for this tab, empty as documented. */
    function mount(held, answers) {
        var folio = new El('div', { 'class': 'inc-folio', 'data-portfolio': '',
            'data-state': 'pending' });
        folio.appendChild(new El('p', { 'class': 'inc-empty',
            'data-portfolio-fallback': '' }));
        var positions = new El('div', { 'class': 'inc-positions-block',
            'data-positions': '' });
        var log = new El('div', { 'class': 'inc-log-block', 'data-trade-log': '' });

        var windowStub = {
            localStorage: held,
            IncisorMarketData: {
                history: function (symbol) {
                    var answer = answers ? answers[symbol] : null;
                    return answer ? Settled.resolve(answer)
                        : Settled.reject(new Error('offline'));
                }
            }
        };
        var documentStub = stub.makeDocument([folio, positions, log]);
        (new Function('window', read(pageDir + '/js/dom.js')))(windowStub);
        MODULES.forEach(function (path) {
            (new Function('window', read(pageDir + path)))(windowStub);
        });
        (new Function('document', 'window',
            read(pageDir + '/js/view-portfolio.js')))(documentStub, windowStub);
        (new Function('document', 'window',
            read(pageDir + '/js/view-positions.js')))(documentStub, windowStub);

        /* dom_stub.jxa.js matches one simple selector at a time — no tag
         * names and no descendant combinators — so the table is walked by
         * structure: scroll box, table, then caption / thead / tbody. */
        function bodyOf(root, className) {
            var table = root.querySelector('.' + className);
            return table.children[table.children.length - 1];
        }

        /* A cell's text, including the cells built from spans — a gain is an
         * arrow, an amount and a percentage, and the stub does not join a
         * node's children the way a browser's textContent does. */
        function textOf(node) {
            if (node.children.length === 0) return node.textContent;
            return node.children.map(textOf).join('');
        }

        /* One row as a reader reads it, left to right: the row header is the
         * first cell and the rest follow it. */
        function rows(root, className) {
            return bodyOf(root, className).children.map(function (row) {
                return row.children.map(textOf);
            });
        }

        return {
            positions: positions,
            log: log,
            holdings: function () { return rows(positions, 'inc-positions'); },
            trades: function () { return rows(log, 'inc-trade-log'); },
            gainCell: function (index) {
                var row = bodyOf(positions, 'inc-positions').children[index];
                return row.children[row.children.length - 1];
            },
            more: function () { return log.querySelector('.inc-log-more'); },
            textOf: textOf,
            empty: function (root) { return root.querySelector('.inc-empty'); },
            text: function (root, className) {
                var node = root.querySelector('.' + className);
                return node ? node.textContent : null;
            }
        };
    }

    /* ── A holding worth exactly what it cost ───────────────────── */

    /* Twenty shares bought at 733.40 and last priced at 733.40: the state of
     * every position between its fill and the next bar (DEC-085). */
    var flat = mount(seeded([trade('buy', 'SPY', 20, 733.40)]),
        { SPY: payloadFor('SPY', [700, 733.40]) });
    same('a position worth what it cost reads as flat, not as a loss',
        flat.holdings(), [['SPY', '20', '$733.40', '$733.40', '$14,668.00',
            '$0.000.00%']]);
    equal('its gain carries no marker to mistake for a minus sign',
        flat.gainCell(0).querySelector('.inc-arrow').textContent, '');
    check('and it is coloured flat rather than down',
        flat.gainCell(0).classes().indexOf('inc-flat') !== -1);

    /* ── Holdings, priced and unpriced ──────────────────────────── */

    var held = mount(seeded([
        trade('buy', 'SPY', 40, 751.57),
        trade('buy', 'AAPL', 60, 258.80),
        trade('sell', 'SPY', 10, 740.00, '2026-07-15T18:30:02.000Z')
    ]), { SPY: payloadFor('SPY', [700, 733.40]),
        AAPL: payloadFor('AAPL', [250, 273.78]) });

    same('holdings are listed by symbol, cost and value beside each other',
        held.holdings(), [
            ['AAPL', '60', '$258.80', '$273.78', '$16,426.80', '▲+$898.80+5.79%'],
            ['SPY', '30', '$751.57', '$733.40', '$22,002.00', '▼−$545.10−2.42%']
        ]);
    check('a rise is marked up', held.gainCell(0).classes().indexOf('inc-up') !== -1);
    check('a fall is marked down', held.gainCell(1).classes().indexOf('inc-down') !== -1);
    check('every coloured gain carries an arrow to survive greyscale',
        held.positions.querySelectorAll('.inc-up')
            .concat(held.positions.querySelectorAll('.inc-down'))
            .every(function (node) {
                var arrow = node.querySelector('.inc-arrow');
                return arrow !== null && arrow.textContent !== '';
            }));
    equal('the table is shown once there is a position',
        held.positions.querySelector('.inc-positions-scroll').hidden, false);
    equal('and its empty line is not', held.empty(held.positions).hidden, true);

    var unpriced = mount(seeded([trade('buy', 'SPY', 40, 751.57)]), {});
    same('a position whose price never came keeps what it knows and dashes '
        + 'the rest', unpriced.holdings(),
        [['SPY', '40', '$751.57', '—', '—', '—']]);
    check('with nothing to colour', unpriced.gainCell(0).classes().indexOf('inc-flat')
        !== -1);

    /* ── The empty states ───────────────────────────────────────── */

    var bare = mount(memoryStorage(), {});
    equal('with nothing held the table is hidden',
        bare.positions.querySelector('.inc-positions-scroll').hidden, true);
    equal('and the reader is told what would fill it',
        bare.empty(bare.positions).textContent,
        'No shares held. A filled buy order puts its position here.');

    /* The ticket sits between the holdings table and this one in index.html,
     * so an empty log that sends the reader downward sends them past it. */
    equal('an empty log points at the ticket, which is above it',
        bare.empty(bare.log).textContent,
        'No trades yet. The order ticket above opens the first one.');
    equal('the log table is hidden with it',
        bare.log.querySelector('.inc-log-scroll').hidden, true);
    equal('and so is the note about replaying it',
        bare.log.querySelector('.inc-panel-note').hidden, true);

    /* ── The trade log ──────────────────────────────────────────── */

    same('trades are listed newest first, with the cash flow signed',
        held.trades(), [
            ['15 Jul 2026', 'SoldSPY', '10', '$740.00', '+$7,400.00'],
            ['4 Jun 2026', 'BoughtAAPL', '60', '$258.80', '−$15,528.00'],
            ['4 Jun 2026', 'BoughtSPY', '40', '$751.57', '−$30,062.80']
        ]);
    check('a buy is not coloured as a loss — the sign is a cash flow, not a gain',
        held.log.querySelectorAll('.inc-down').length === 0
            && held.log.querySelectorAll('.inc-up').length === 0);
    equal('no control while everything fits', held.more().hidden, true);

    /* ── The preview control ────────────────────────────────────── */

    var many = [];
    for (var n = 0; n < 15; n++) {
        many.push(trade('buy', 'SPY', 1, 100 + n,
            '2026-06-' + (n < 9 ? '0' : '') + (n + 1) + 'T15:00:00.000Z'));
    }
    var long = mount(seeded(many), { SPY: payloadFor('SPY', [700, 733.40]) });
    equal('a long ledger shows twelve and offers the rest', long.trades().length, 12);
    equal('saying how many are held back', long.more().textContent,
        'Show 3 older trades');
    equal('and reporting itself collapsed', long.more().getAttribute('aria-expanded'),
        'false');
    equal('the newest is first', long.trades()[0][0], '15 Jun 2026');

    long.more().fire('click');
    equal('pressing it shows every trade', long.trades().length, 15);
    check('and focus stays on the control that changed its own label',
        focused[focused.length - 1] === long.more());
    equal('and offers the way back', long.more().textContent,
        'Show the 12 most recent only');
    equal('now reporting itself expanded', long.more().getAttribute('aria-expanded'),
        'true');
    long.more().fire('click');
    equal('which collapses it again', long.trades().length, 12);

    equal('the control sends no ticker to the beacon',
        long.more().getAttribute('data-track'), 'trade-log-expand');

    /* ── Semantics that survive the mobile layout ───────────────── */

    /* Below 560px the stylesheet makes these tables `display: block`, which
     * drops a table's implicit roles along with its rows and cells (DEC-090).
     * Written out, they survive it. */
    var table = held.positions.querySelector('.inc-positions');
    var body = table.children[table.children.length - 1];
    equal('the holdings table says it is a table', table.getAttribute('role'), 'table');
    equal('its head is a row group', table.children[1].getAttribute('role'), 'rowgroup');
    equal('and so is its body', body.getAttribute('role'), 'rowgroup');
    check('every row says it is a row',
        table.children[1].children.concat(body.children).every(function (row) {
            return row.getAttribute('role') === 'row';
        }));
    check('every column head says it is one',
        table.children[1].children[0].children.every(function (node) {
            return node.getAttribute('role') === 'columnheader';
        }));
    check('every symbol is its row’s header, and every figure a cell',
        body.children.every(function (row) {
            return row.children[0].getAttribute('role') === 'rowheader'
                && row.children.slice(1).every(function (node) {
                    return node.getAttribute('role') === 'cell';
                });
        }));
    same('each cell carries the long label the block layout puts back',
        body.children[0].children.slice(1).map(function (node) {
            return node.getAttribute('data-label');
        }), ['Shares', 'Average cost', 'Last price', 'Market value',
            'Unrealized gain']);
    equal('a shortened column head keeps the long name for a screen reader',
        held.textOf(table.children[1].children[0].children[2]),
        'Average costAvg cost');

    /* ── Nothing to draw into ───────────────────────────────────── */

    var lonely = new El('div', {});
    try {
        (new Function('document', 'window', read(pageDir + '/js/view-positions.js')))(
            stub.makeDocument([lonely]), { IncisorMarketFigures: figures });
        check('with no roots on the page it does nothing', lonely.children.length === 0);
    } catch (error) {
        check('with no roots on the page it does nothing', false, String(error));
    }

    return report();
}
