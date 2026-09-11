/* Open orders: what is waiting to fill, and what filled since last time.
 *
 * The Trade panel's third surface, under the ticket. It lists every order
 * still open with the moment it can first fill, lets the reader cancel one,
 * and says what happened to the orders the page settled on load — a fill the
 * reader is never told about reads as a balance that moved on its own.
 *
 * Built here rather than served (DEC-072). The store is reached through
 * window.IncisorPortfolio, which js/view-portfolio.js owns because it owns
 * the moment orders fill; this redraws whenever that says something changed.
 *
 * It also owns the words an order is described in — "Buy 10 SPY", "at $250.00
 * or less" — and exposes them, so the ticket's confirmation and this list
 * never describe one order two ways.
 *
 * Contract with the markup: a [data-orders] block, empty until this runs.
 *
 * Exposes window.IncisorOpenOrders.
 */

(function (global) {
    'use strict';

    var figures = global.IncisorMarketFigures;
    var clock = global.IncisorMarketClock;
    var portfolio = global.IncisorPortfolio;

    var root = document.querySelector('[data-orders]');

    var eastern = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true
    });

    var REFUSED_AT_FILL = {
        'insufficient-cash': 'it would have cost more than the cash left',
        'insufficient-shares': 'the shares were no longer held'
    };

    var nodes = {};

    function element(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    /* ── The words for an order ─────────────────────────────────── */

    function describe(order) {
        return (order.kind === 'buy' ? 'Buy ' : 'Sell ') + order.shares + ' ' + order.symbol;
    }

    /* "buy 10 SPY" — the same words mid-sentence. Only the verb is lowered;
     * a ticker in lower case is a different string, not the same one quieter. */
    function inSentence(order) {
        return (order.kind === 'buy' ? 'buy ' : 'sell ') + order.shares + ' ' + order.symbol;
    }

    function termsOf(order) {
        if (order.type === 'market') return 'at market';
        return 'at ' + figures.formatMoney(order.limit)
            + (order.kind === 'buy' ? ' or less' : ' or more');
    }

    /* ── Saying when ────────────────────────────────────────────── */

    function easternStamp(iso) {
        var found = {};
        eastern.formatToParts(new Date(iso)).forEach(function (part) {
            found[part.type] = part.value;
        });
        return found.day + ' ' + found.month + ', ' + found.hour + ':' + found.minute
            + (found.dayPeriod || '').toLowerCase() + ' ET';
    }

    /* When an open order can first fill: the open or close after it was
     * placed, and whether that moment has passed. */
    function firstChance(order) {
        var next = clock.sessionAt(new Date(order.placedAt)).next;
        if (!next) return null;
        return { label: 'the ' + figures.formatAxisDate(next.date, false) + ' ' + next.event,
            due: next.at.getTime() <= Date.now() };
    }

    /* A market order past its moment is waiting on data, not on the market:
     * delayed bars publish a close some while after it happens. A limit order
     * past its first chance may simply not have been reached, and nothing
     * here can tell which, so it says only what is true of both. */
    function whenText(order) {
        var chance = firstChance(order);
        if (chance && !chance.due) {
            return (order.type === 'market' ? 'Fills at ' : 'Checked from ') + chance.label;
        }
        if (chance && order.type === 'market') {
            return 'Due at ' + chance.label + '; waiting for that price to be published';
        }
        return 'Open until its limit is reached or you cancel it';
    }

    /* ── Building ───────────────────────────────────────────────── */

    function build() {
        var heading = element('h3', 'inc-section-heading inc-orders-heading', 'Open orders');
        heading.id = 'inc-orders-heading';

        nodes.outcome = element('p', 'inc-orders-outcome');
        nodes.outcome.setAttribute('role', 'status');
        nodes.outcome.hidden = true;

        nodes.status = element('p', 'inc-orders-status');
        nodes.status.setAttribute('role', 'status');
        nodes.status.hidden = true;

        nodes.empty = element('p', 'inc-orders-empty', 'No open orders.');
        nodes.list = element('ul', 'inc-orders');
        nodes.list.setAttribute('aria-labelledby', heading.id);

        nodes.sample = element('p', 'inc-orders-sample', 'The prices on this page are '
            + 'generated samples that never move forward, so an order placed now '
            + 'stays open: no later price will arrive for it to fill at.');
        nodes.sample.hidden = true;

        [heading, nodes.outcome, nodes.status, nodes.empty, nodes.list, nodes.sample]
            .forEach(function (node) { root.appendChild(node); });
    }

    function orderRow(order) {
        var item = element('li', 'inc-order');
        item.appendChild(element('span', 'inc-order-what', describe(order)));
        item.appendChild(element('span', 'inc-order-terms', termsOf(order)
            + ' · placed ' + easternStamp(order.placedAt)));
        item.appendChild(element('span', 'inc-order-when', whenText(order)));

        var cancel = element('button', 'inc-order-cancel', 'Cancel');
        cancel.type = 'button';
        cancel.setAttribute('data-order-cancel', order.id);
        cancel.setAttribute('data-track', 'order-cancel');
        cancel.setAttribute('aria-label', 'Cancel: ' + inSentence(order));
        item.appendChild(cancel);
        return item;
    }

    /* ── Rendering ──────────────────────────────────────────────── */

    function renderOrders() {
        var orders = portfolio.store().orders();
        while (nodes.list.firstChild) nodes.list.removeChild(nodes.list.firstChild);
        orders.forEach(function (order) { nodes.list.appendChild(orderRow(order)); });
        nodes.list.hidden = orders.length === 0;
        nodes.empty.hidden = orders.length > 0;
        nodes.sample.hidden = !(orders.length > 0 && portfolio.isSample());
    }

    function momentOf(fill) {
        var day = figures.formatAxisDate(fill.date, false);
        if (fill.moment === 'limit') return 'at its limit on ' + day;
        return 'at the ' + day + ' ' + fill.moment;
    }

    function outcomeText(outcome) {
        var parts = [];
        if (outcome.filled.length) {
            parts.push('Filled: ' + outcome.filled.map(function (item) {
                return (item.order.kind === 'buy' ? 'bought ' : 'sold ') + item.order.shares
                    + ' ' + item.order.symbol + ' at ' + figures.formatMoney(item.fill.price)
                    + ' ' + momentOf(item.fill);
            }).join('; ') + '.');
        }
        outcome.refused.forEach(function (item) {
            parts.push('Refused: ' + inSentence(item.order) + ' at '
                + figures.formatMoney(item.fill.price) + ' ' + momentOf(item.fill)
                + ', because ' + (REFUSED_AT_FILL[item.reason] || 'it broke a trading rule')
                + '.');
        });
        return parts.join(' ');
    }

    /* A settlement's outcome is said once, for the page load that made it;
     * any other change only redraws the list. */
    function onPortfolioChange(outcome) {
        if (outcome && (outcome.filled.length || outcome.refused.length)) {
            nodes.outcome.textContent = outcomeText(outcome);
            nodes.outcome.hidden = false;
        }
        renderOrders();
    }

    function onClick(event) {
        var cancel = event.target.closest('[data-order-cancel]');
        if (!cancel) return;
        var id = cancel.getAttribute('data-order-cancel');
        var order = portfolio.store().orders().filter(function (open) {
            return open.id === id;
        })[0];
        if (!order || !portfolio.store().cancel(id)) return;
        nodes.status.textContent = 'Cancelled: ' + inSentence(order) + ' ' + termsOf(order) + '.';
        nodes.status.hidden = false;
        portfolio.changed();
    }

    function start() {
        if (!root || !figures || !clock || !portfolio || !portfolio.store()) return;
        build();
        root.addEventListener('click', onClick);
        portfolio.onChange(onPortfolioChange);
        renderOrders();

        global.IncisorOpenOrders = {
            describe: describe,
            inSentence: inSentence,
            termsOf: termsOf
        };
    }

    start();
})(typeof window !== 'undefined' ? window : this);
