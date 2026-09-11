/* Open orders: what may be placed, and when and at what price it fills.
 *
 * Pure, like js/portfolio-ledger.js — orders, bars and a clock in; answers
 * out. js/portfolio-store.js keeps the orders; this decides what they mean.
 *
 * **Forward fill** (guide section 12). Prices here are delayed, so an order
 * filled at the price on screen would be a bet placed after the race. An
 * order therefore fills at the first price that happened *after* it was
 * placed, and never the one the reader was looking at.
 *
 * The data is daily bars, so "the first price after" needs every price to
 * have a moment. A bar has two that are known exactly: its open, at 9:30am
 * ET, and its close, at 4:00pm ET or 1:00pm on an early close — which
 * js/market-clock.js works out per date. An order placed during a session
 * fills at that session's close. One placed while the market is closed
 * queues and fills at the next open, which is the market-hours gate without
 * a separate rule: there is no price to fill at until then.
 *
 * A limit order uses the rest of the bar too. For a session the order was
 * open through from the opening bell, a buy limit fills at the open if the
 * open was at or under the limit, and otherwise at the limit if the day's low
 * reached it — recorded at the close, because a daily bar says a price was
 * touched but not when. A session the order joined halfway through offers
 * only its close, since its low may have come before the order existed.
 *
 * **Held back.** A buy holds back cash while it is open, so two orders cannot
 * spend one balance. A limit holds back shares at the limit, the most it can
 * cost. A market order's price is unknown until it fills, so it holds back
 * the last close plus MARKET_BUFFER; a price that gaps past even that is
 * refused when it fills, and the reader is told why. A sell holds back the
 * shares it would sell.
 *
 * Exposes window.IncisorPortfolioOrders.
 */

(function (global) {
    'use strict';

    var ledgerMath = global.IncisorPortfolioLedger;

    var KINDS = ['buy', 'sell'];
    var TYPES = ['market', 'limit'];

    /* Five percent: wide enough for an ordinary overnight gap on anything a
     * learner is likely to buy, narrow enough that a reader putting their
     * whole balance into one market order still gets most of it working. */
    var MARKET_BUFFER = 0.05;

    /* How many different symbols the portfolio may hold or have on order.
     *
     * The call budget, not taste, like the watchlist's eight (DEC-028):
     * every symbol held or on order costs one /history call each time the
     * portfolio is valued. Four tiles and eight watched rows are twelve of
     * the day's 22, and six more leave four — two symbol lookups at two calls
     * each — for a reader with a full watchlist and a full portfolio whose
     * symbols do not overlap at all. Any overlap is free. */
    var SYMBOL_LIMIT = 6;

    var SYMBOL_PATTERN = /^[A-Z][A-Z.\-]{0,9}$/;
    var ID_PATTERN = /^o\d{1,9}$/;
    var TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
    var MAX_PRICE = 10000000;

    function isPrice(value) {
        return typeof value === 'number' && isFinite(value) && value > 0
            && value <= MAX_PRICE;
    }

    function isWholeCount(value) {
        return typeof value === 'number' && Math.floor(value) === value
            && value > 0 && value <= Number.MAX_SAFE_INTEGER;
    }

    /* ── Orders ─────────────────────────────────────────────────── */

    /* An open order, copied field by field, or null if this is not one.
     *
     * `reference` is the last close the reader saw when placing it. It never
     * sets a fill price; it only sizes what a market buy holds back. */
    function readOrder(raw) {
        if (!raw || typeof raw !== 'object') return null;
        if (typeof raw.id !== 'string' || !ID_PATTERN.test(raw.id)) return null;
        if (KINDS.indexOf(raw.kind) === -1) return null;
        if (TYPES.indexOf(raw.type) === -1) return null;
        if (typeof raw.symbol !== 'string' || !SYMBOL_PATTERN.test(raw.symbol)) {
            return null;
        }
        if (!isWholeCount(raw.shares)) return null;
        if (!isPrice(raw.reference)) return null;
        if (raw.type === 'limit' ? !isPrice(raw.limit) : raw.limit !== null) return null;
        if (typeof raw.placedAt !== 'string' || !TIMESTAMP_PATTERN.test(raw.placedAt)) {
            return null;
        }
        return {
            id: raw.id,
            kind: raw.kind,
            symbol: raw.symbol,
            shares: raw.shares,
            type: raw.type,
            limit: raw.type === 'limit' ? raw.limit : null,
            reference: raw.reference,
            placedAt: raw.placedAt
        };
    }

    /* Cents a buy holds back while it is open; nothing for a sell. */
    function heldBackFor(order) {
        if (order.kind !== 'buy') return 0;
        var price = order.type === 'limit'
            ? order.limit : order.reference * (1 + MARKET_BUFFER);
        return ledgerMath.amountFor(order.shares, price);
    }

    /* What is free to use once open orders have held back their share.
     *
     * Cash can come out below zero, and that is not an error: a market buy
     * that filled higher than its reference leaves the orders still open
     * holding back more than is left. Nothing new can be bought until it
     * clears, which is what a figure under zero says.
     */
    function available(state, orders) {
        var cash = state.cash;
        var shares = {};
        Object.keys(state.positions).forEach(function (symbol) {
            shares[symbol] = state.positions[symbol].shares;
        });
        orders.forEach(function (order) {
            cash -= heldBackFor(order);
            if (order.kind === 'sell') {
                shares[order.symbol] = (shares[order.symbol] || 0) - order.shares;
            }
        });
        return { cash: cash, shares: shares };
    }

    function symbolsInPlay(state, orders) {
        var found = Object.keys(state.positions);
        orders.forEach(function (order) {
            if (found.indexOf(order.symbol) === -1) found.push(order.symbol);
        });
        return found.sort();
    }

    /* A new order judged against the portfolio and the orders already open:
     * `{order}`, or `{error}` naming the rule it broke. Refusals are words
     * rather than a boolean, because the ticket says something different
     * for each. */
    function check(state, orders, raw) {
        if (!raw || typeof raw !== 'object') return { error: 'invalid' };
        if (!isWholeCount(raw.shares)) return { error: 'invalid-shares' };
        if (raw.type === 'limit' && !isPrice(raw.limit)) return { error: 'invalid-limit' };
        var order = readOrder(raw);
        if (!order) return { error: 'invalid' };

        var free = available(state, orders);
        if (order.kind === 'buy') {
            var inPlay = symbolsInPlay(state, orders);
            if (inPlay.indexOf(order.symbol) === -1 && inPlay.length >= SYMBOL_LIMIT) {
                return { error: 'symbol-limit' };
            }
            if (heldBackFor(order) > free.cash) return { error: 'insufficient-cash' };
        } else if (order.shares > (free.shares[order.symbol] || 0)) {
            return { error: 'insufficient-shares' };
        }
        return { order: order };
    }

    /* ── Filling ────────────────────────────────────────────────── */

    function acceptable(order, price) {
        if (order.type === 'market') return true;
        return order.kind === 'buy' ? price <= order.limit : price >= order.limit;
    }

    function fill(price, instant, date, moment) {
        return { price: price, at: new Date(instant).toISOString(), date: date,
            moment: moment };
    }

    /* The first price after the order was placed that it would take:
     * `{price, at, date, moment}` with moment one of open / close / limit,
     * or null if the bars do not reach one yet.
     *
     * `bars` is one symbol's daily series; `clock` is js/market-clock.js. A
     * bar on a date the market did not trade is skipped rather than trusted,
     * since it cannot be given a moment.
     */
    function fillFor(order, bars, clock) {
        var placed = Date.parse(order.placedAt);
        var sorted = bars.slice().sort(function (left, right) {
            return left.date < right.date ? -1 : (left.date > right.date ? 1 : 0);
        });

        for (var index = 0; index < sorted.length; index++) {
            var bar = sorted[index];
            var session = clock.sessionOn(bar.date);
            if (!session) continue;
            var open = session.open.getTime();
            var close = session.close.getTime();
            if (close <= placed) continue;

            if (open > placed) {
                if (typeof bar.open === 'number' && acceptable(order, bar.open)) {
                    return fill(bar.open, open, bar.date, 'open');
                }
                if (order.type === 'limit') {
                    var touched = order.kind === 'buy' ? bar.low : bar.high;
                    if (typeof touched === 'number' && acceptable(order, touched)) {
                        return fill(order.limit, close, bar.date, 'limit');
                    }
                }
            }
            if (acceptable(order, bar.close)) {
                return fill(bar.close, close, bar.date, 'close');
            }
        }
        return null;
    }

    /* Every open order whose price has arrived, applied to the portfolio in
     * the order the prices happened.
     *
     * `barsBySymbol` holds the series this page load could fetch; an order
     * whose symbol is missing from it simply stays open. Fills are applied
     * through ledger.apply — the one judge of a trade (DEC-082) — so a buy
     * whose fill costs more than the cash left is refused there, and comes
     * back in `refused` with that rule's name.
     *
     * Returns `{state, entries, filled, refused, open}`: the new portfolio,
     * the ledger entries to append, and what happened to each order.
     */
    function settle(state, orders, barsBySymbol, clock) {
        var due = [];
        var open = [];
        orders.forEach(function (order, position) {
            var bars = barsBySymbol[order.symbol];
            var found = bars ? fillFor(order, bars, clock) : null;
            if (found) {
                due.push({ order: order, fill: found, position: position });
            } else {
                open.push(order);
            }
        });

        due.sort(function (left, right) {
            if (left.fill.at !== right.fill.at) return left.fill.at < right.fill.at ? -1 : 1;
            return left.position - right.position;
        });

        var current = state;
        var entries = [];
        var filled = [];
        var refused = [];
        due.forEach(function (item) {
            var result = ledgerMath.apply(current, {
                kind: item.order.kind,
                symbol: item.order.symbol,
                shares: item.order.shares,
                price: item.fill.price,
                at: item.fill.at
            });
            if (result.error) {
                refused.push({ order: item.order, fill: item.fill, reason: result.error });
                return;
            }
            current = result.state;
            entries.push(result.entry);
            filled.push({ order: item.order, fill: item.fill });
        });

        return { state: current, entries: entries, filled: filled, refused: refused,
            open: open };
    }

    global.IncisorPortfolioOrders = {
        MARKET_BUFFER: MARKET_BUFFER,
        SYMBOL_LIMIT: SYMBOL_LIMIT,
        readOrder: readOrder,
        heldBackFor: heldBackFor,
        available: available,
        symbolsInPlay: symbolsInPlay,
        check: check,
        fillFor: fillFor,
        settle: settle
    };
})(typeof window !== 'undefined' ? window : this);
