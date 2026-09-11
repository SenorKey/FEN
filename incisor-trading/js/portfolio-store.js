/* The paper portfolio as it is kept in this browser.
 *
 * Built the way js/watchlist-store.js is: storage is handed in rather than
 * reached for, so tests/portfolio_model.jxa.js can open it over stubs that
 * hold nonsense, throw on every access, or refuse every write. What a stored
 * portfolio *means* is js/portfolio-ledger.js, and what an open order means
 * is js/portfolio-orders.js; this module decides whether a stored portfolio
 * can be believed, and keeps the one in memory written back.
 *
 * What is stored is the balance it started from, the ledger of trades, and
 * the orders still open — the ledger module explains why totals are never
 * kept beside them:
 *
 *     { "v": 2, "startingCash": 10000000,
 *       "ledger": [{ "kind": "buy", "symbol": "SPY", "shares": 10,
 *                    "price": 512.3, "at": "2026-09-11T20:00:00.000Z" }],
 *       "orders": [{ "id": "o3", "kind": "buy", "symbol": "AAPL",
 *                    "shares": 5, "type": "limit", "limit": 250,
 *                    "reference": 261.4, "placedAt": "..." }] }
 *
 * Everything read back is untrusted (guide section 5), and unlike the
 * watchlist this is worth keeping: it is the reader's work, possibly weeks
 * of it. So a blob is read in one of four ways, and each is told to the
 * reader differently:
 *
 *   restored   - it is ours, at this version or one that migrates to it
 *   fresh      - nothing was stored; a new $100,000 portfolio
 *   recovered  - something was stored and cannot be believed, so it was
 *                replaced with a new portfolio and the view says so
 *   newer      - written by a later version of this page than this one
 *
 * The last is the case a rollback produces. If a deploy is reverted, the
 * older page meets portfolios the newer one wrote; discarding them as
 * corrupt would destroy work the next deploy could read. So a newer blob is
 * left exactly where it is and the page runs on a fresh portfolio held in
 * memory, saying that nothing done here will be kept (DEC-083).
 *
 * Exposes window.IncisorPortfolioStore.
 */

(function (global) {
    'use strict';

    var KEY = 'incisor.portfolio';

    var VERSION = 2;

    /* How a stored blob at an older version becomes one at VERSION.
     *
     * Keyed by the version a step starts from, each step taking a blob at
     * that version and returning one at the next, and they run in order:
     * a v1 blob at VERSION 3 would go through [1] and then [2]. A step never
     * skips a version, so each is written against exactly one shape and none
     * of them has to know the others exist. A change to the stored shape adds
     * its step and bumps VERSION in the same commit; `migrate` refuses a gap
     * rather than guessing across one.
     */
    var MIGRATIONS = {
        // Open orders arrived with the order ticket. A portfolio from before
        // it had none, so it gains an empty list and nothing else changes.
        1: function (old) {
            return { v: 2, startingCash: old.startingCash, ledger: old.ledger, orders: [] };
        }
    };

    var ledgerMath = global.IncisorPortfolioLedger;
    var orderMath = global.IncisorPortfolioOrders;

    function isVersion(value) {
        return typeof value === 'number' && Math.floor(value) === value && value >= 1;
    }

    /* A blob brought up to `target` by `steps`, or null.
     *
     * Null when the blob has no readable version, or when a step it needs is
     * missing, throws, or hands back something that did not advance by
     * exactly one. A migration that fails partway has produced a shape no
     * reader was written for, and the honest outcome of that is the same as
     * any other blob that cannot be read. Newer blobs never reach here.
     */
    function migrate(blob, steps, target) {
        if (!blob || typeof blob !== 'object' || !isVersion(blob.v)) return null;
        var current = blob;
        while (current.v < target) {
            var step = Object.prototype.hasOwnProperty.call(steps, current.v)
                ? steps[current.v] : null;
            if (typeof step !== 'function') return null;
            var from = current.v;
            try {
                current = step(current);
            } catch (error) {
                return null;
            }
            if (!current || typeof current !== 'object' || current.v !== from + 1) {
                return null;
            }
        }
        return current.v === target ? current : null;
    }

    /* Stored open orders, or null if any one of them is not an order or two
     * share an id.
     *
     * Checked for shape only, not re-judged against the cash: an order that
     * fitted when it was placed can stop fitting because another filled
     * higher than expected, and that is a state the portfolio is really in —
     * reading it as corrupt would throw away the reader's work over a price.
     */
    function readOrders(raw) {
        if (!Array.isArray(raw)) return null;
        var seen = {};
        var orders = [];
        for (var index = 0; index < raw.length; index++) {
            var order = orderMath.readOrder(raw[index]);
            if (!order || seen[order.id]) return null;
            seen[order.id] = true;
            orders.push(order);
        }
        return orders;
    }

    /* A blob at VERSION as `{state, ledger, orders}`, or null. Believed only
     * if its whole ledger replays from its starting balance and every open
     * order reads. */
    function readCurrent(blob) {
        if (!blob || blob.v !== VERSION) return null;
        var replayed = ledgerMath.replay(blob.ledger, blob.startingCash);
        var orders = readOrders(blob.orders);
        if (!replayed || !orders) return null;
        return { state: replayed.state, ledger: replayed.ledger, orders: orders };
    }

    function copyOrder(order) {
        return orderMath.readOrder(order);
    }

    /* The next free id: one past the highest in use. Ids only need to be
     * unique among orders still open, and this keeps them short. */
    function nextId(orders) {
        var highest = 0;
        orders.forEach(function (order) {
            highest = Math.max(highest, Number(order.id.slice(1)));
        });
        return 'o' + (highest + 1);
    }

    /* ── The stored portfolio ───────────────────────────────────── */

    /* Opens the portfolio over one storage object.
     *
     * `storage` is anything with getItem/setItem/removeItem, or null, and
     * every access is wrapped: a private window, blocked site data and a full
     * quota all throw rather than returning nothing. A storage that cannot
     * be written does not stop the game, only its surviving a reload, and
     * `isPersistent` is what lets the view say so.
     *
     * Nothing is written merely by opening: a portfolio with no trades is
     * the starting balance and nothing else, so a first visit leaves no site
     * data behind. Writes happen when the portfolio changes, and once on load
     * when a blob has to be replaced or migrated.
     */
    function open(storage) {
        var startingCash = ledgerMath.STARTING_CASH;
        var ledger = [];
        var orders = [];
        var state = ledgerMath.emptyState(startingCash);
        var status = 'fresh';
        var available = Boolean(storage);

        /* False only for a newer blob. It is not ours to overwrite. */
        var writable = true;

        function readText() {
            if (!storage) return null;
            try {
                return storage.getItem(KEY);
            } catch (error) {
                available = false;
                return null;
            }
        }

        function save() {
            if (!storage || !writable) {
                available = false;
                return;
            }
            try {
                storage.setItem(KEY, JSON.stringify({
                    v: VERSION,
                    startingCash: startingCash,
                    ledger: ledger,
                    orders: orders
                }));
                available = true;
            } catch (error) {
                // Out of quota, or site data blocked. The portfolio is still
                // right in memory; only the promise that it survives a reload
                // is lost, and the view says so.
                available = false;
            }
        }

        function load() {
            var text = readText();
            if (text === null || text === undefined || text === '') return;

            var blob = null;
            try {
                blob = JSON.parse(text);
            } catch (error) {
                blob = null;
            }

            if (blob && typeof blob === 'object' && isVersion(blob.v)
                    && blob.v > VERSION) {
                status = 'newer';
                writable = false;
                available = false;
                return;
            }

            var read = readCurrent(migrate(blob, MIGRATIONS, VERSION));
            if (!read) {
                status = 'recovered';
                save();
                return;
            }

            startingCash = read.state.startingCash;
            ledger = read.ledger;
            orders = read.orders;
            state = read.state;
            status = 'restored';
            // A migrated blob is written back at the current version at once,
            // so the step runs on one load rather than on every load after.
            if (blob.v !== VERSION) save();
        }

        load();

        return {
            /* restored, fresh, recovered or newer — see the header. */
            status: function () { return status; },

            /* Whether what is done now will still be here after a reload. */
            isPersistent: function () { return available; },

            /* The replayed portfolio: cash, positions, cost, realized P/L.
             * A copy, so a caller cannot change it behind the ledger. */
            state: function () {
                return ledgerMath.replay(ledger, startingCash).state;
            },

            ledger: function () {
                return ledger.map(ledgerMath.readEntry);
            },

            orders: function () {
                return orders.map(copyOrder);
            },

            /* Cash and shares not held back by open orders. */
            available: function () {
                return orderMath.available(state, orders);
            },

            /* Appends one filled trade directly: 'recorded', or the rule it
             * broke. Judged by the same function a reload replays with. */
            record: function (entry) {
                var result = ledgerMath.apply(state, entry);
                if (result.error) return result.error;
                state = result.state;
                ledger.push(result.entry);
                save();
                return 'recorded';
            },

            /* Opens an order: `{order}` with its id, or `{error}` naming the
             * rule it broke — see portfolio-orders.js `check`. */
            place: function (raw) {
                var draft = {};
                Object.keys(raw || {}).forEach(function (field) {
                    draft[field] = raw[field];
                });
                draft.id = nextId(orders);
                var result = orderMath.check(state, orders, draft);
                if (result.error) return result;
                orders.push(result.order);
                save();
                return { order: copyOrder(result.order) };
            },

            /* Withdraws an open order. False if there was no such order. */
            cancel: function (id) {
                var kept = orders.filter(function (order) { return order.id !== id; });
                if (kept.length === orders.length) return false;
                orders = kept;
                save();
                return true;
            },

            /* Fills every open order whose price has arrived in
             * `barsBySymbol`, and says what happened to each. Written once,
             * after all of them, rather than once per fill. */
            settle: function (barsBySymbol, clock) {
                var result = orderMath.settle(state, orders, barsBySymbol, clock);
                if (result.filled.length === 0 && result.refused.length === 0) {
                    return { filled: [], refused: [] };
                }
                state = result.state;
                ledger = ledger.concat(result.entries);
                orders = result.open;
                save();
                return { filled: result.filled, refused: result.refused };
            },

            /* Back to the starting balance with no trades and no orders. Over
             * a newer blob this is still in memory only. */
            reset: function () {
                startingCash = ledgerMath.STARTING_CASH;
                ledger = [];
                orders = [];
                state = ledgerMath.emptyState(startingCash);
                save();
            }
        };
    }

    global.IncisorPortfolioStore = {
        KEY: KEY,
        VERSION: VERSION,
        migrate: migrate,
        open: open
    };
})(typeof window !== 'undefined' ? window : this);
