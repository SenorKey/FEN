/* The paper portfolio's arithmetic: what a list of trades adds up to.
 *
 * Pure, like js/market-figures.js — no DOM, no storage, no clock, no network.
 * js/portfolio-store.js decides what is kept and whether it can be believed;
 * this decides what it means.
 *
 * The ledger is the portfolio. Cash, positions, cost basis and realized P/L
 * are never stored; they are worked out by replaying every trade from the
 * starting balance, every time. Stored totals beside the trades that produced
 * them would be two records of one fact, and a blob where they disagree has
 * no right answer — replaying leaves nothing to disagree with. It is also the
 * only shape the later phases can build on: an equity curve needs holdings as
 * they stood on each past date, and a split is one more kind of entry.
 *
 * Money is whole cents. A trade's extended amount is rounded to the cent
 * once, the way a broker settles it, and every total after that is integer
 * addition — floating-point dollars drift by fractions of a cent over a few
 * hundred trades, and a balance that reads $99,999.99 after buying and
 * selling the same shares at the same price is exactly the kind of number
 * that makes a reader distrust every other one. Prices stay as the service
 * sent them, because a sub-dollar share is quoted past the cent.
 *
 * Cost basis is the average cost. A sale removes its proportional share of
 * what the position cost, rounded to the cent, so the sale that closes a
 * position takes all that is left and no residue stays behind on shares
 * nobody holds. Per-lot
 * accounting (FIFO) changes realized P/L only for tax purposes, and there is
 * no tax here; average cost is the one number every positions screen shows.
 *
 * Exposes window.IncisorPortfolioLedger.
 */

(function (global) {
    'use strict';

    /* $100,000 (guide section 12). Held by the stored portfolio as well as
     * here, so a portfolio keeps measuring its return against what it
     * actually started with if this default ever changes. */
    var STARTING_CASH = 10000000;

    var KINDS = ['buy', 'sell'];

    /* The service's whitelist, repeated at this boundary for the reason
     * js/watchlist-store.js gives: storage is untrusted and a boundary that
     * trusts another boundary is not one. */
    var SYMBOL_PATTERN = /^[A-Z][A-Z.\-]{0,9}$/;

    /* The dearest US share trades in six figures. A price past this is not
     * one the service sent, and multiplying by it would produce amounts that
     * stop being exact in a double. */
    var MAX_PRICE = 10000000;

    /* A UTC instant to the second or millisecond: what toISOString writes. */
    var TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

    function isFiniteNumber(value) {
        return typeof value === 'number' && isFinite(value);
    }

    function isWholeCount(value) {
        return typeof value === 'number' && Math.floor(value) === value
            && value > 0 && value <= Number.MAX_SAFE_INTEGER;
    }

    function isCents(value) {
        return typeof value === 'number' && Math.floor(value) === value
            && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
    }

    /* What `shares` at `price` costs or raises, in cents, rounded once. */
    function amountFor(shares, price) {
        return Math.round(shares * price * 100);
    }

    /* ── Entries ────────────────────────────────────────────────── */

    /* A ledger entry, or null if this is not one.
     *
     * Copied field by field rather than returned as given, so nothing a
     * stored blob carried beyond these five survives into the page's state.
     */
    function readEntry(raw) {
        if (!raw || typeof raw !== 'object') return null;
        if (KINDS.indexOf(raw.kind) === -1) return null;
        if (typeof raw.symbol !== 'string' || !SYMBOL_PATTERN.test(raw.symbol)) {
            return null;
        }
        if (!isWholeCount(raw.shares)) return null;
        if (!isFiniteNumber(raw.price) || raw.price <= 0 || raw.price > MAX_PRICE) {
            return null;
        }
        if (typeof raw.at !== 'string' || !TIMESTAMP_PATTERN.test(raw.at)) {
            return null;
        }
        return {
            kind: raw.kind,
            symbol: raw.symbol,
            shares: raw.shares,
            price: raw.price,
            at: raw.at
        };
    }

    /* ── Replaying ──────────────────────────────────────────────── */

    function emptyState(startingCash) {
        return {
            startingCash: startingCash,
            cash: startingCash,
            positions: {},
            realized: 0,
            trades: 0
        };
    }

    function copyState(state) {
        var positions = {};
        Object.keys(state.positions).forEach(function (symbol) {
            var held = state.positions[symbol];
            positions[symbol] = { shares: held.shares, cost: held.cost };
        });
        return {
            startingCash: state.startingCash,
            cash: state.cash,
            positions: positions,
            realized: state.realized,
            trades: state.trades
        };
    }

    /* One trade applied to a portfolio: `{state}`, or `{error}` naming the
     * rule it broke.
     *
     * The only place a trade is judged. Replaying a stored ledger and placing
     * a new order both come through here, so an order the ticket accepts is
     * by construction one the next page load can replay — a ticket with its
     * own copy of "enough cash" could let through a trade that turns the
     * reader's whole ledger unreadable on reload.
     *
     * The state handed in is never changed; a refused trade leaves nothing
     * half-applied behind it.
     */
    function apply(state, raw) {
        var entry = readEntry(raw);
        if (!entry) return { error: 'invalid' };

        var amount = amountFor(entry.shares, entry.price);
        var next = copyState(state);
        var held = next.positions[entry.symbol];

        if (entry.kind === 'buy') {
            if (amount > next.cash) return { error: 'insufficient-cash' };
            next.cash -= amount;
            if (!held) held = next.positions[entry.symbol] = { shares: 0, cost: 0 };
            held.shares += entry.shares;
            held.cost += amount;
        } else {
            if (!held || held.shares < entry.shares) {
                return { error: 'insufficient-shares' };
            }
            // Selling the whole position needs no special case: rounding
            // cost x n / n gives back exactly `cost` for any balance this
            // game can reach, so the last sale takes every remaining cent.
            var costSold = Math.round(held.cost * entry.shares / held.shares);
            next.cash += amount;
            next.realized += amount - costSold;
            held.shares -= entry.shares;
            held.cost -= costSold;
            if (held.shares === 0) delete next.positions[entry.symbol];
        }

        next.trades += 1;
        return { state: next, entry: entry };
    }

    /* Every trade in order, from the starting balance: `{state, ledger}`, or
     * null if the ledger does not add up.
     *
     * Null for the whole ledger rather than a state from the entries that
     * did. Dropping one trade changes every figure after it — a sale of
     * shares that were never bought, a balance that was spent twice — so a
     * ledger with one bad entry is not a ledger with one fewer trade, it is
     * a history nobody can vouch for.
     */
    function replay(rawLedger, startingCash) {
        if (!Array.isArray(rawLedger)) return null;
        if (!isCents(startingCash) || startingCash <= 0) return null;

        var state = emptyState(startingCash);
        var ledger = [];
        for (var index = 0; index < rawLedger.length; index++) {
            var result = apply(state, rawLedger[index]);
            if (result.error) return null;
            state = result.state;
            ledger.push(result.entry);
        }
        return { state: state, ledger: ledger };
    }

    /* ── Valuing ────────────────────────────────────────────────── */

    function bySymbol(left, right) {
        if (left === right) return 0;
        return left < right ? -1 : 1;
    }

    /* A portfolio marked to the prices the page holds.
     *
     * `prices` maps a symbol to its latest price; a symbol missing from it
     * is a position whose worth is unknown right now. Such a position still
     * has a row, with its cost, but every total that would need its value is
     * null rather than a sum that silently left it out — a total value short
     * by one holding is a number a reader would believe.
     *
     * Money in cents, like everything here. Percentages are of what was put
     * in: a position's against its cost, the portfolio's against its
     * starting cash.
     */
    function valuation(state, prices) {
        var known = prices || {};
        var holdings = 0;
        var unrealized = 0;
        var complete = true;

        var rows = Object.keys(state.positions).sort(bySymbol).map(function (symbol) {
            var held = state.positions[symbol];
            var price = known[symbol];
            var priced = isFiniteNumber(price) && price > 0;
            var marketValue = priced ? amountFor(held.shares, price) : null;
            var gain = priced ? marketValue - held.cost : null;

            if (priced) {
                holdings += marketValue;
                unrealized += gain;
            } else {
                complete = false;
            }

            return {
                symbol: symbol,
                shares: held.shares,
                cost: held.cost,
                averageCost: held.cost / held.shares / 100,
                price: priced ? price : null,
                marketValue: marketValue,
                unrealized: gain,
                unrealizedPercent: priced && held.cost > 0
                    ? (gain / held.cost) * 100 : null
            };
        });

        var total = complete ? state.cash + holdings : null;
        var gainSinceStart = total === null ? null : total - state.startingCash;

        return {
            rows: rows,
            cash: state.cash,
            holdings: complete ? holdings : null,
            total: total,
            realized: state.realized,
            unrealized: complete ? unrealized : null,
            totalReturn: gainSinceStart,
            totalReturnPercent: gainSinceStart === null
                ? null : (gainSinceStart / state.startingCash) * 100
        };
    }

    global.IncisorPortfolioLedger = {
        STARTING_CASH: STARTING_CASH,
        KINDS: KINDS,
        amountFor: amountFor,
        readEntry: readEntry,
        emptyState: emptyState,
        apply: apply,
        replay: replay,
        valuation: valuation
    };
})(typeof window !== 'undefined' ? window : this);
