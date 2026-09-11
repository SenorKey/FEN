/* The Trade panel's account summary — what the paper portfolio is worth.
 *
 * The first surface of the game. The dashboard reports what the market did;
 * this reports what the reader's $100,000 did, and it is built entirely here
 * rather than served (DEC-072): until the store has been read there is no
 * true thing to say about a balance, so the served panel holds one sentence
 * and this replaces it.
 *
 * The store is js/portfolio-store.js, the arithmetic js/portfolio-ledger.js,
 * the formatting js/market-figures.js and the network js/market-data.js.
 * Nothing here keeps, computes or fetches anything of its own; it decides
 * what is on screen, which is what lets tests/portfolio_model.jxa.js drive it
 * against a DOM stub.
 *
 * A held position is priced from one /history call, the call a watched row
 * costs, and the latest close in it is the price. Until every position is
 * priced, the figures that need all of them — holdings, total value, the
 * return — show a dash rather than a sum that left one out. Cash and
 * realized gain need no price and are shown at once.
 *
 * It also owns the moment open orders fill. The series fetched to value the
 * portfolio are the same series an order fills from, so once every symbol
 * held or on order has answered, the store settles against them in one pass
 * (js/portfolio-orders.js) and anything listening — the order ticket — is
 * told what filled and what was refused. Settling waits for all of them
 * because fills are applied in the order their prices happened, and a fill
 * applied before an earlier one on another symbol could spend its cash.
 *
 * Contract with the markup: a [data-portfolio] block, holding a served
 * [data-portfolio-fallback] line this hides once it has drawn.
 *
 * Exposes window.IncisorPortfolio, the store and a change signal, for
 * js/view-orders.js and js/view-ticket.js.
 */

(function (global) {
    'use strict';

    var dom = global.IncisorDom;
    var data = global.IncisorMarketData;
    var figures = global.IncisorMarketFigures;
    var ledgerMath = global.IncisorPortfolioLedger;
    var orderMath = global.IncisorPortfolioOrders;
    var storage = global.IncisorPortfolioStore;
    var clock = global.IncisorMarketClock;

    var root = document.querySelector('[data-portfolio]');

    var store = null;

    /* symbol -> latest price, for held symbols whose /history answered. */
    var prices = {};

    /* symbols whose /history failed, so their figures are unknown for good
     * this page load rather than still on the way. */
    var failed = {};

    /* The first payload that answered, for the provenance line. */
    var provenancePayload = null;

    /* symbol -> daily bars, for every symbol held or on order that answered.
     * What open orders are settled against. */
    var barsBySymbol = {};

    /* Requests still out. Settling waits for this to reach zero. */
    var outstanding = 0;

    /* Called with a settlement's outcome, or null for any other change. */
    var listeners = [];

    /* The settlement this page load made, handed to a listener that arrives
     * after it: prices can answer before the ticket has subscribed, and a
     * fill the reader is never told about looks like a balance that moved on
     * its own. */
    var settled = null;

    /* Whether any payload this page holds was the generated sample — told to
     * this module by the ticket too, whose lookups it does not see. */
    var sampleSeen = false;

    /* The nodes render() writes into, built once by build(). */
    var nodes = {};

    /* ── Building ───────────────────────────────────────────────── */

    function element(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    /* A labelled figure: a <div> holding its <dt> and <dd>, which is how a
     * <dl> groups a term with its value for styling. */
    function figureGroup(list, className, label) {
        var group = element('div', className);
        group.appendChild(element('dt', 'inc-folio-label', label));
        var value = element('dd', 'inc-folio-value');
        group.appendChild(value);
        list.appendChild(group);
        return { group: group, value: value };
    }

    /* A gain: arrow, signed amount, and what window it covers. The arrow and
     * the sign are what carry direction without colour (guide section 13). */
    function gainParts(value) {
        var arrow = element('span', 'inc-arrow');
        arrow.setAttribute('aria-hidden', 'true');
        var amount = element('span', 'inc-folio-amount');
        value.appendChild(arrow);
        value.appendChild(amount);
        return { node: value, arrow: arrow, amount: amount };
    }

    function build() {
        var list = element('dl', 'inc-folio-figures');

        var total = figureGroup(list, 'inc-folio-total', 'Total value');
        total.value.classList.add('inc-folio-headline');
        var change = element('dd', 'inc-folio-change');
        total.group.appendChild(change);
        nodes.total = total.value;
        nodes.change = gainParts(change);
        nodes.change.period = element('span', 'inc-period', 'since start');
        change.appendChild(nodes.change.period);

        var cash = figureGroup(list, 'inc-folio-part', 'Cash');
        nodes.cash = cash.value;
        nodes.heldBack = element('dd', 'inc-folio-aside');
        cash.group.appendChild(nodes.heldBack);

        var holdings = figureGroup(list, 'inc-folio-part', 'Holdings');
        nodes.holdings = holdings.value;
        nodes.positions = element('dd', 'inc-folio-aside');
        holdings.group.appendChild(nodes.positions);

        var realized = figureGroup(list, 'inc-folio-part', 'Realized gain');
        nodes.realized = gainParts(realized.value);
        realized.group.appendChild(element('dd', 'inc-folio-aside', 'on shares sold'));

        var unrealized = figureGroup(list, 'inc-folio-part', 'Unrealized gain');
        nodes.unrealized = gainParts(unrealized.value);
        unrealized.group.appendChild(element('dd', 'inc-folio-aside', 'on shares held'));

        nodes.activity = element('p', 'inc-folio-activity');

        // Announced when it appears, like the watchlist's: a portfolio that
        // quietly comes back as $100,000 looks like the page losing weeks of
        // the reader's work, which is what happened.
        nodes.notice = element('p', 'inc-folio-notice');
        nodes.notice.setAttribute('role', 'status');
        nodes.notice.hidden = true;

        nodes.provenance = element('p', 'inc-provenance');
        nodes.provenance.hidden = true;
        var dot = element('span', 'inc-provenance-dot');
        dot.setAttribute('aria-hidden', 'true');
        nodes.provenance.appendChild(dot);
        nodes.provenanceMessage = element('span');
        nodes.provenance.appendChild(nodes.provenanceMessage);

        // The notice goes above the figures, unlike the watchlist's. What it
        // explains is the figures themselves — a reader whose weeks of trades
        // were just discarded should not read "$100,000.00" before the reason.
        root.appendChild(nodes.notice);
        root.appendChild(list);
        root.appendChild(nodes.activity);
        root.appendChild(nodes.provenance);
    }

    /* ── Rendering ──────────────────────────────────────────────── */

    function dollars(cents) {
        return cents === null ? null : cents / 100;
    }

    function renderGain(parts, cents) {
        var value = dollars(cents);
        parts.arrow.textContent = value === null ? '' : figures.arrowFor(value);
        parts.amount.textContent = figures.formatSignedMoney(value);
        dom.setDirection(parts.node, figures.direction(value));
    }

    function positionsText(count) {
        if (count === 0) return 'No positions';
        return count === 1 ? '1 position' : count + ' positions';
    }

    function activityText(trades) {
        if (trades === 0) return 'No trades yet.';
        return (trades === 1 ? '1 trade' : trades + ' trades') + ' so far.';
    }

    /* What open buy orders are holding back, under the cash: without it a
     * reader sees a balance the ticket then refuses to spend. */
    function heldBackText(orders) {
        var held = 0;
        var buys = 0;
        orders.forEach(function (order) {
            var amount = orderMath.heldBackFor(order);
            if (amount > 0) {
                held += amount;
                buys += 1;
            }
        });
        if (buys === 0) return '';
        return figures.formatMoney(held / 100) + ' held for '
            + (buys === 1 ? '1 open order' : buys + ' open orders');
    }

    /* What the reader is told about where this portfolio came from. Every
     * status but a plain restore changes something they would otherwise
     * have to notice for themselves. */
    function noticeText() {
        switch (store.status()) {
            case 'recovered':
                return 'A saved portfolio could not be read, so it was cleared '
                    + 'and a new one started with $100,000.';
            case 'newer':
                return 'This browser holds a portfolio saved by a newer version '
                    + 'of this page. It has been left untouched, and nothing '
                    + 'done here will be kept.';
        }
        if (!store.isPersistent()) {
            return 'This browser is not storing site data, so this portfolio '
                + 'will start over when the page reloads.';
        }
        return '';
    }

    function unpricedCount(state) {
        return Object.keys(state.positions).filter(function (symbol) {
            return !Object.prototype.hasOwnProperty.call(prices, symbol);
        }).length;
    }

    /* Only once positions are held and priced: an all-cash portfolio uses no
     * market data, and a line about delayed prices under it would be a claim
     * about figures that are not on screen. */
    function renderProvenance(state) {
        var show = Boolean(provenancePayload) && unpricedCount(state) === 0;
        nodes.provenance.hidden = !show;
        if (!show) return;
        var bars = provenancePayload.bars;
        var summary = figures.provenanceFor(provenancePayload, bars[bars.length - 1].date);
        nodes.provenance.setAttribute('data-provenance-state', summary.state);
        nodes.provenanceMessage.textContent = summary.message;
    }

    function rootState(state) {
        var waiting = Object.keys(state.positions).some(function (symbol) {
            return !Object.prototype.hasOwnProperty.call(prices, symbol) && !failed[symbol];
        });
        if (waiting) return 'pricing';
        return unpricedCount(state) > 0 ? 'unpriced' : 'ready';
    }

    function render() {
        var state = store.state();
        var value = ledgerMath.valuation(state, prices);

        nodes.total.textContent = figures.formatMoney(dollars(value.total));
        nodes.cash.textContent = figures.formatMoney(dollars(value.cash));
        nodes.heldBack.textContent = heldBackText(store.orders());
        nodes.heldBack.hidden = nodes.heldBack.textContent === '';
        nodes.holdings.textContent = figures.formatMoney(dollars(value.holdings));
        nodes.positions.textContent = positionsText(value.rows.length);

        renderGain(nodes.change, value.totalReturn);
        var percent = value.totalReturnPercent === null
            ? '' : ' (' + figures.formatPercent(value.totalReturnPercent) + ')';
        nodes.change.amount.textContent += percent;
        renderGain(nodes.realized, value.realized);
        renderGain(nodes.unrealized, value.unrealized);

        var status = rootState(state);
        var activity = activityText(state.trades);
        if (status === 'unpriced') {
            var missing = unpricedCount(state);
            activity += (missing === 1 ? ' One held position' : ' ' + missing
                + ' held positions') + ' could not be priced, so the figures '
                + 'that need a price are not shown.';
        }
        nodes.activity.textContent = activity;

        var notice = noticeText();
        nodes.notice.textContent = notice;
        nodes.notice.hidden = notice === '';

        renderProvenance(state);
        root.setAttribute('data-state', status);
    }

    /* ── Prices and fills ────────────────────────────────────────── */

    function notify(outcome) {
        listeners.forEach(function (listener) { listener(outcome); });
    }

    /* Every open order whose price has now arrived, filled in one pass. */
    function settleOrders() {
        settled = store.settle(barsBySymbol, clock);
        render();
        notify(settled);
    }

    function answered() {
        outstanding -= 1;
        if (outstanding === 0) settleOrders();
        else render();
    }

    function fetchSymbol(symbol) {
        data.history(symbol).then(function (payload) {
            var quote = figures.quoteFromBars(payload.bars);
            barsBySymbol[symbol] = payload.bars;
            if (payload.source === 'fixture') sampleSeen = true;
            if (quote) {
                prices[symbol] = quote.close;
                if (!provenancePayload) provenancePayload = payload;
            } else {
                failed[symbol] = true;
            }
            answered();
        }, function () {
            // Silent in the console for the watchlist's reason: the failure
            // is stated on screen, and tools/shoot.py fails a run on an error.
            failed[symbol] = true;
            answered();
        });
    }

    /* The module's face to js/view-ticket.js. `changed` is how the ticket
     * says it placed or cancelled something, so the cash held back redraws. */
    function expose() {
        global.IncisorPortfolio = {
            store: function () { return store; },
            onChange: function (listener) {
                listeners.push(listener);
                if (settled) listener(settled);
            },
            changed: function () {
                render();
                notify(null);
            },
            /* Whether the prices this page holds are the generated sample,
             * which never moves forward — so an order placed now never fills. */
            isSample: function () { return sampleSeen; },
            sawSample: function () { sampleSeen = true; }
        };
    }

    /* ── Wiring ─────────────────────────────────────────────────── */

    function start() {
        // No panel, or a module that failed to load: the served line stays,
        // and it says only that the portfolio opens here, which stays true.
        if (!root || !dom || !data || !figures || !ledgerMath || !orderMath
                || !storage || !clock) {
            return;
        }

        // Read once, inside a guard: the property access itself throws in a
        // private window and where site data is blocked.
        var box = null;
        try {
            box = global.localStorage;
        } catch (error) {
            box = null;
        }
        store = storage.open(box);

        build();
        var fallback = root.querySelector('[data-portfolio-fallback]');
        if (fallback) fallback.hidden = true;

        render();
        expose();
        var symbols = orderMath.symbolsInPlay(store.state(), store.orders());
        outstanding = symbols.length;
        symbols.forEach(fetchSymbol);
    }

    start();
})(typeof window !== 'undefined' ? window : this);
