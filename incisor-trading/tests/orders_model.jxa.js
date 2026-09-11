/* Exercises the order book and the ticket outside a browser.
 *
 * js/portfolio-orders.js is pure, so the forward-fill rule is checked the way
 * the acceptance criterion states it: an order placed against a series fills
 * at the next price after it was placed, never the price on screen. Every
 * expected fill below was read off the three bars by hand, with their ET
 * session times, before the engine ran.
 *
 * The store's place / cancel / settle are driven over a memory storage, and
 * js/view-ticket.js and js/view-orders.js against dom_stub.jxa.js with
 * js/view-portfolio.js beside them — both reach the store only through the
 * portfolio view, so they are tested in the arrangement they ship in. The real js/market-clock.js is used
 * throughout; stubbing the clock would leave the one thing that decides when
 * an order fills untested.
 *
 * Run by test_orders.py. Arguments: <page-dir>
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

    var MODULES = ['/js/market-clock.js', '/js/market-figures.js', '/js/portfolio-ledger.js',
        '/js/portfolio-orders.js', '/js/portfolio-store.js'];
    var stub = {};
    var box = {};
    try {
        (new Function('exports', read(pageDir + '/tests/dom_stub.jxa.js')))(stub);
        MODULES.forEach(function (path) {
            (new Function('window', read(pageDir + path)))(box);
        });
        check('the modules parse and run', !!box.IncisorPortfolioOrders);
    } catch (error) {
        check('the modules parse and run', false, String(error));
        return report();
    }
    var clock = box.IncisorMarketClock;
    var ledger = box.IncisorPortfolioLedger;
    var orders = box.IncisorPortfolioOrders;
    var storage = box.IncisorPortfolioStore;
    var El = stub.El;
    var START = 10000000;

    /* ── Session times ──────────────────────────────────────────── */

    function iso(date) { return date ? date.toISOString() : null; }

    var summer = clock.sessionOn('2026-08-26');
    equal('a summer session opens at 9:30am EDT', iso(summer.open), '2026-08-26T13:30:00.000Z');
    equal('and closes at 4:00pm EDT', iso(summer.close), '2026-08-26T20:00:00.000Z');
    equal('a winter session opens at 9:30am EST',
        iso(clock.sessionOn('2026-12-15').open), '2026-12-15T14:30:00.000Z');
    equal('the day after Thanksgiving closes at 1:00pm',
        iso(clock.sessionOn('2026-11-27').close), '2026-11-27T18:00:00.000Z');
    equal('a Saturday has no session', clock.sessionOn('2026-08-29'), null);
    equal('Labor Day has no session', clock.sessionOn('2026-09-07'), null);
    equal('a date that is not one has no session', clock.sessionOn('26 Aug'), null);
    equal('the next event names the date it lands on',
        clock.sessionAt(new Date('2026-08-25T21:10:00Z')).next.date, '2026-08-26');

    /* ── Filling ────────────────────────────────────────────────── */

    /* Three sessions, read by hand:
     *
     *   24 Aug  open 100 (13:30Z)  high 103  low 99  close 102 (20:00Z)
     *   25 Aug  open 101           high 104  low 97  close  98
     *   26 Aug  open  99           high 100  low 94  close  95
     *
     * A reader looking at this page on the 25th during the session sees 102,
     * the last close. That is the price an order must never get.
     */
    var BARS = [
        { date: '2026-08-24', open: 100, high: 103, low: 99, close: 102 },
        { date: '2026-08-25', open: 101, high: 104, low: 97, close: 98 },
        { date: '2026-08-26', open: 99, high: 100, low: 94, close: 95 }
    ];

    function order(fields) {
        var base = { id: 'o1', kind: 'buy', symbol: 'SPY', shares: 10, type: 'market',
            limit: null, reference: 102, placedAt: '2026-08-25T15:00:00.000Z' };
        Object.keys(fields || {}).forEach(function (key) { base[key] = fields[key]; });
        return base;
    }

    function fillOf(fields, bars) {
        return orders.fillFor(order(fields), bars || BARS, clock);
    }

    var midSession = fillOf({});
    equal('placed mid-session, a market order fills at that close', midSession.price, 98);
    equal('not at the last close on screen', midSession.price !== 102, true);
    equal('at the moment of that close', midSession.at, '2026-08-25T20:00:00.000Z');
    equal('and says it was the close', midSession.moment, 'close');

    var evening = fillOf({ placedAt: '2026-08-25T21:10:00.000Z' });
    equal('placed after the close, it queues for the next open', evening.price, 99);
    equal('at 9:30am ET the next day', evening.at, '2026-08-26T13:30:00.000Z');

    equal('placed on a Saturday, it fills at Monday’s open',
        fillOf({ placedAt: '2026-08-22T16:00:00.000Z' }).price, 100);
    equal('placed after the last bar, nothing has arrived to fill it',
        fillOf({ placedAt: '2026-08-26T21:00:00.000Z' }), null);
    equal('placed exactly at the close, that close is not after it',
        fillOf({ placedAt: '2026-08-25T20:00:00.000Z' }).at, '2026-08-26T13:30:00.000Z');

    var touched = fillOf({ type: 'limit', limit: 96, placedAt: '2026-08-24T21:00:00.000Z' });
    equal('a buy limit the low reaches fills at the limit', touched.price, 96);
    equal('recorded at that session’s close', touched.at, '2026-08-26T20:00:00.000Z');
    equal('and says it was the limit', touched.moment, 'limit');

    var better = fillOf({ type: 'limit', limit: 101.5, placedAt: '2026-08-24T21:00:00.000Z' });
    equal('a buy limit the open is already under fills at the open', better.price, 101);

    equal('joined mid-session, a limit is checked against the close only',
        fillOf({ type: 'limit', limit: 96, placedAt: '2026-08-26T15:00:00.000Z' }).price, 95);
    equal('so a low that may have come before the order does not fill it',
        fillOf({ type: 'limit', limit: 94.5, placedAt: '2026-08-26T15:00:00.000Z' }), null);

    var sold = fillOf({ kind: 'sell', type: 'limit', limit: 103.5,
        placedAt: '2026-08-23T16:00:00.000Z' });
    equal('a sell limit the high reaches fills at the limit', sold.price, 103.5);
    equal('on the first session that reached it', sold.date, '2026-08-25');

    var noOpen = [BARS[0], { date: '2026-08-25', open: null, high: null, low: null,
        close: 98 }];
    equal('a bar with no open fills a queued order at its close',
        fillOf({ placedAt: '2026-08-24T21:00:00.000Z' }, noOpen).price, 98);
    equal('bars out of order are read in date order',
        fillOf({ placedAt: '2026-08-24T21:00:00.000Z' }, BARS.slice().reverse()).price, 101);
    equal('a bar dated on a weekend is skipped, not trusted', fillOf(
        { placedAt: '2026-08-22T16:00:00.000Z' },
        [{ date: '2026-08-23', open: 1, high: 1, low: 1, close: 1 }].concat(BARS)).price, 100);

    /* ── What may be placed ─────────────────────────────────────── */

    var fresh = ledger.emptyState(START);

    equal('a market buy holds back the reference plus 5%',
        orders.heldBackFor(order({})), 107100);
    equal('a limit buy holds back its limit',
        orders.heldBackFor(order({ type: 'limit', limit: 90 })), 90000);
    equal('a sell holds back no cash', orders.heldBackFor(order({ kind: 'sell' })), 0);

    equal('a market buy past the cash once held back is refused',
        orders.check(fresh, [], order({ shares: 1000, reference: 100 })).error,
        'insufficient-cash');
    check('a limit buy of exactly the cash is allowed',
        orders.check(fresh, [], order({ shares: 1000, type: 'limit', limit: 100 })).order);
    var firstLimit = order({ shares: 600, type: 'limit', limit: 100 });
    equal('an open order’s hold counts against the next',
        orders.check(fresh, [firstLimit],
            order({ id: 'o2', shares: 500, type: 'limit', limit: 100 })).error,
        'insufficient-cash');

    equal('selling what is not held is refused',
        orders.check(fresh, [], order({ kind: 'sell' })).error, 'insufficient-shares');
    var holding = ledger.apply(fresh, { kind: 'buy', symbol: 'SPY', shares: 10, price: 100,
        at: '2026-08-24T20:00:00.000Z' }).state;
    var openSell = order({ kind: 'sell', shares: 6 });
    equal('shares already on order to sell are held back',
        orders.check(holding, [openSell], order({ id: 'o2', kind: 'sell', shares: 5 })).error,
        'insufficient-shares');
    check('the rest can still be sold',
        orders.check(holding, [openSell], order({ id: 'o2', kind: 'sell', shares: 4 })).order);

    [0, 1.5, -2, '10'].forEach(function (shares) {
        equal('shares of ' + JSON.stringify(shares) + ' are refused as shares',
            orders.check(fresh, [], order({ shares: shares })).error, 'invalid-shares');
    });
    [0, null, -1, 'ten'].forEach(function (limit) {
        equal('a limit of ' + JSON.stringify(limit) + ' is refused as a limit',
            orders.check(fresh, [], order({ type: 'limit', limit: limit })).error,
            'invalid-limit');
    });
    [{ symbol: 'spy' }, { type: 'stop' }, { placedAt: 'now' }, { limit: 100 },
        { reference: 0 }].forEach(function (fields) {
        equal('an order with ' + JSON.stringify(fields) + ' is invalid',
            orders.check(fresh, [], order(fields)).error, 'invalid');
    });

    var six = ['SPY', 'QQQ', 'DIA', 'IWM', 'AAPL', 'XLK'].map(function (symbol, index) {
        return order({ id: 'o' + (index + 1), symbol: symbol, shares: 1 });
    });
    equal('the portfolio holds six symbols at most, counting open orders',
        orders.check(fresh, six, order({ id: 'o9', symbol: 'XLF', shares: 1 })).error,
        'symbol-limit');
    check('more of a symbol already in play is fine',
        orders.check(fresh, six, order({ id: 'o9', symbol: 'SPY', shares: 1 })).order);
    equal('the limit is six', orders.SYMBOL_LIMIT, 6);

    var overdrawn = orders.available(ledger.emptyState(1000), [order({})]);
    equal('free cash can read below zero rather than lie', overdrawn.cash, 1000 - 107100);

    /* ── Settling ───────────────────────────────────────────────── */

    var QQQ_BARS = [{ date: '2026-08-25', open: 50, high: 51, low: 49, close: 50.5 }];
    var late = order({ id: 'o1', placedAt: '2026-08-25T21:10:00.000Z' });
    var early = order({ id: 'o2', symbol: 'QQQ', reference: 50 });
    var waiting = order({ id: 'o3', symbol: 'DIA' });
    var settled = orders.settle(fresh, [late, early, waiting],
        { SPY: BARS, QQQ: QQQ_BARS }, clock);
    same('fills are applied in the order their prices happened',
        settled.entries.map(function (entry) { return entry.symbol; }), ['QQQ', 'SPY']);
    equal('each at the price it filled at', settled.entries[1].price, 99);
    equal('and the moment it filled', settled.entries[0].at, '2026-08-25T20:00:00.000Z');
    same('an order with no series stays open', settled.open.map(function (item) {
        return item.id;
    }), ['o3']);
    equal('cash pays for both fills', settled.state.cash, START - 50500 - 99000);

    var gapped = [{ date: '2026-08-26', open: 120, high: 121, low: 119, close: 120 }];
    var tooBig = orders.settle(fresh, [order({ shares: 900, reference: 100,
        placedAt: '2026-08-25T21:10:00.000Z' })], { SPY: gapped }, clock);
    equal('a fill that costs more than the cash is refused', tooBig.refused.length, 1);
    equal('by the ledger’s own rule', tooBig.refused[0].reason, 'insufficient-cash');
    equal('and leaves the cash alone', tooBig.state.cash, START);
    equal('and is no longer open', tooBig.open.length, 0);

    /* ── The store ──────────────────────────────────────────────── */

    function memoryStorage() {
        var held = {};
        return {
            held: held,
            writes: 0,
            getItem: function (key) {
                return Object.prototype.hasOwnProperty.call(held, key) ? held[key] : null;
            },
            setItem: function (key, value) { this.writes++; held[key] = String(value); },
            removeItem: function (key) { delete held[key]; }
        };
    }

    function draft(fields) {
        var made = order(fields);
        delete made.id;
        return made;
    }

    var shelf = memoryStorage();
    var store = storage.open(shelf);
    var placed = store.place(draft({}));
    equal('a placed order is given an id', placed.order && placed.order.id, 'o1');
    equal('and written through', shelf.writes, 1);
    equal('the next gets the next id', store.place(draft({ symbol: 'QQQ' })).order.id, 'o2');
    equal('a refused order says why', store.place(draft({ shares: 0 })).error, 'invalid-shares');
    equal('and writes nothing', shelf.writes, 2);
    equal('open orders hold back cash', store.available().cash, START - 107100 * 2);
    same('a reload keeps them', storage.open(shelf).orders().map(function (item) {
        return item.id;
    }), ['o1', 'o2']);
    equal('an order can be cancelled', store.cancel('o1'), true);
    equal('an order that is not there cannot', store.cancel('o9'), false);
    same('and the cancel survives a reload', storage.open(shelf).orders().map(function (item) {
        return item.id;
    }), ['o2']);

    var settleShelf = memoryStorage();
    var settling = storage.open(settleShelf);
    settling.place(draft({ placedAt: '2026-08-25T21:10:00.000Z' }));
    settling.place(draft({ symbol: 'DIA' }));
    var writesBefore = settleShelf.writes;
    var outcome = settling.settle({ SPY: BARS }, clock);
    equal('settling reports what filled', outcome.filled.length, 1);
    equal('writes once for the lot', settleShelf.writes, writesBefore + 1);
    var afterReload = storage.open(settleShelf);
    equal('the fill is in the ledger after a reload', afterReload.ledger()[0].price, 99);
    same('the open order is still open', afterReload.orders().map(function (item) {
        return item.symbol;
    }), ['DIA']);
    var quiet = settleShelf.writes;
    afterReload.settle({ SPY: BARS }, clock);
    equal('settling with nothing due writes nothing', settleShelf.writes, quiet);

    /* ── The ticket ─────────────────────────────────────────────── */

    function payloadFor(symbol, bars) {
        return { symbol: symbol, source: 'fixture', delay: 'end-of-day', stale: false,
            bars: bars };
    }

    /* The portfolio view and the ticket over one storage, the way they ship.
     * `answers` maps a symbol to a payload, an {error} object, or nothing. */
    function mount(shelfFor, answers) {
        var folio = new El('div', { 'data-portfolio': '' });
        folio.appendChild(new El('p', { 'data-portfolio-fallback': '' }));
        var ticket = new El('div', { 'data-ticket': '' });
        var list = new El('div', { 'data-orders': '' });
        var asked = [];
        var windowStub = {
            localStorage: shelfFor,
            IncisorMarketData: {
                history: function (symbol) {
                    asked.push(symbol);
                    var answer = answers[symbol];
                    if (!answer) return Settled.reject({ kind: 'offline' });
                    if (answer.error) return Settled.reject({ kind: answer.error });
                    return Settled.resolve(answer);
                },
                symbols: function () {
                    return Settled.resolve({ symbols: [{ symbol: 'SPY', name: 'SPDR S&P 500' }] });
                }
            }
        };
        var documentStub = stub.makeDocument([folio, ticket, list]);
        (new Function('window', read(pageDir + '/js/dom.js')))(windowStub);
        MODULES.forEach(function (path) {
            (new Function('window', read(pageDir + path)))(windowStub);
        });
        (new Function('document', 'window', read(pageDir + '/js/view-portfolio.js')))(
            documentStub, windowStub);
        (new Function('document', 'window', read(pageDir + '/js/view-orders.js')))(
            documentStub, windowStub);
        (new Function('document', 'window', read(pageDir + '/js/view-ticket.js')))(
            documentStub, windowStub);

        function q(selector) {
            return ticket.querySelector(selector) || list.querySelector(selector);
        }
        return {
            ticket: ticket,
            list: list,
            folio: folio,
            asked: asked,
            q: q,
            text: function (className) { return q('.' + className).textContent; },
            type: function (name, value) {
                var input = q('[data-ticket-' + name + ']');
                input.value = value;
                input.fire(name === 'symbol' ? 'change' : 'input');
            },
            press: function (selector) { ticket.fire('click', { target: q(selector) }); },
            submit: function () { q('.inc-ticket-form').fire('submit'); },
            store: function () { return windowStub.IncisorPortfolio.store(); }
        };
    }

    var SPY = payloadFor('SPY', BARS);
    var t = mount(memoryStorage(), { SPY: SPY, XYZ: { error: 'not_found' } });

    check('the ticket is built', t.q('.inc-ticket-form') !== null);
    equal('it starts on buy', t.q('[data-ticket-side="buy"]').getAttribute('aria-pressed'),
        'true');
    equal('at market', t.q('[data-ticket-type="market"]').getAttribute('aria-pressed'), 'true');
    equal('with the limit field hidden', t.q('[data-ticket-limit]').parent.hidden, true);
    check('every button carries a generic data-track', t.ticket.querySelectorAll('.inc-segment')
        .concat([t.q('.inc-ticket-submit')]).every(function (button) {
            return /^order-[a-z]+$/.test(button.getAttribute('data-track') || '');
        }));
    check('the timing line names the next price, not the one on screen',
        /^Fills at the next price after you place it: the (open|close), /.test(
            t.text('inc-ticket-timing')));
    equal('no open orders yet', t.text('inc-orders-empty'), 'No open orders.');

    t.type('symbol', 'spy ');
    equal('a typed symbol is set in capitals', t.q('[data-ticket-symbol]').value, 'SPY');
    same('and looked up once', t.asked.filter(function (s) { return s === 'SPY'; }), ['SPY']);
    equal('its last close is stated with where it came from', t.text('inc-ticket-quote'),
        'SPY last closed at $95.00 on 26 Aug 2026 · sample data, not a real quote.');

    t.type('shares', '10');
    equal('a market buy states its cost and what it holds back', t.text('inc-ticket-cost'),
        'About $950.00 at the last close. $997.50 is held back until it fills — the last '
        + 'close plus 5%, since a market order’s price is not known until then. '
        + 'Free to spend: $100,000.00.');

    t.submit();
    equal('placing it opens one order', t.store().orders().length, 1);
    check('and says what it did, in the reader’s words',
        /^Order placed: buy 10 SPY at market\. It fills at the (open|close), /.test(
            t.text('inc-ticket-message')));
    equal('the order is listed', t.list.querySelectorAll('.inc-order').length, 1);
    equal('as the reader placed it', t.text('inc-order-what'), 'Buy 10 SPY');
    var cancel = t.q('[data-order-cancel]');
    equal('with a cancel button named for it', cancel.getAttribute('aria-label'),
        'Cancel: buy 10 SPY');
    equal('and a generic data-track', cancel.getAttribute('data-track'), 'order-cancel');
    check('the portfolio shows the cash held back', /^\$997\.50 held for 1 open order$/.test(
        t.folio.querySelectorAll('.inc-folio-aside')[0].textContent));
    check('and the sample note says why it will not fill', !t.q('.inc-orders-sample').hidden);

    t.list.fire('click', { target: cancel });
    equal('cancelling removes it', t.store().orders().length, 0);
    equal('and says which', t.text('inc-orders-status'), 'Cancelled: buy 10 SPY at market.');
    equal('and the list is empty again', t.q('.inc-orders-empty').hidden, false);

    t.press('[data-ticket-side="sell"]');
    equal('the side switches', t.q('[data-ticket-side="sell"]').getAttribute('aria-pressed'),
        'true');
    equal('and the button says so', t.text('inc-ticket-submit'), 'Place sell order');
    equal('the shares field was cleared by the order before',
        t.q('[data-ticket-shares]').value, '');
    t.type('shares', '5');
    t.submit();
    equal('selling what is not held is refused in words', t.text('inc-ticket-message'),
        'You hold no SPY to sell.');

    t.press('[data-ticket-side="buy"]');
    t.type('shares', '1.5');
    t.submit();
    equal('a fractional share is refused in words', t.text('inc-ticket-message'),
        'Enter a whole number of shares, 1 or more.');

    t.type('shares', '2000');
    t.submit();
    equal('an order past the cash says what it holds back and what is free',
        t.text('inc-ticket-message'), 'Not enough cash. This order holds back $199,500.00 '
        + 'until it fills, and $100,000.00 is free to spend.');
    equal('and opens nothing', t.store().orders().length, 0);

    t.press('[data-ticket-type="limit"]');
    equal('a limit order shows its price field', t.q('[data-ticket-limit]').parent.hidden,
        false);
    t.type('shares', '10');
    t.submit();
    equal('a limit order with no limit is refused in words', t.text('inc-ticket-message'),
        'Enter a limit price above zero, like 512.50.');
    t.type('limit', '90');
    equal('a limit buy states what it holds back',
        t.text('inc-ticket-cost').indexOf('At most $900.00 at your limit'), 0);
    check('and when it is checked', /^Checked against every price from the /.test(
        t.text('inc-ticket-timing')));

    t.type('symbol', 'xyz');
    equal('a symbol with no prices says so', t.text('inc-ticket-quote'),
        'No prices for XYZ. Only symbols this page has data for can be traded.');

    /* A portfolio stored with an order placed the evening before the last
     * bar: the page load settles it, and the ticket says what happened. */
    var carried = memoryStorage();
    storage.open(carried).place(draft({ symbol: 'SPY', shares: 20,
        placedAt: '2026-08-25T21:10:00.000Z' }));
    var back = mount(carried, { SPY: SPY });
    equal('an order whose price has arrived fills on load', back.store().orders().length, 0);
    equal('and the ticket says what filled, and at which price',
        back.text('inc-orders-outcome'), 'Filled: bought 20 SPY at $99.00 at the 26 Aug open.');
    equal('the fill is in the portfolio', back.store().state().positions.SPY.shares, 20);

    var lonely = new El('div', { 'data-ticket': '' });
    try {
        (new Function('document', 'window', read(pageDir + '/js/view-ticket.js')))(
            stub.makeDocument([lonely]), { IncisorMarketData: {} });
        equal('with no portfolio on the page the ticket builds nothing',
            lonely.children.length, 0);
    } catch (error) {
        check('with no portfolio on the page the ticket builds nothing', false, String(error));
    }

    return report();
}
