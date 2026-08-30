/* The watchlist's stored list, and the order it is shown in.
 *
 * Pure in the way js/market-clock.js and js/market-figures.js are pure: it
 * holds no DOM, opens no network, and reads no global. The one thing it
 * cannot avoid touching is storage, so storage is handed to it rather than
 * fetched — which is what lets the whole module be driven in JavaScriptCore
 * against a stub that returns nonsense, or throws, or has been wiped between
 * two calls (tests/watchlist_model.jxa.js).
 *
 * Everything read back out of storage is untrusted (guide section 5). A
 * visitor's own browser is not an attacker, but a stored blob is the one
 * input to this page that survives a deploy, and it can be edited by hand, be
 * left behind by an older schema, or belong to a different site on the same
 * origin. So a blob is validated field by field and a blob that fails is
 * replaced rather than repaired — `recovered` says it happened, and the view
 * says so on screen instead of silently starting empty.
 *
 * Exposes window.IncisorWatchlistStore.
 */

(function (global) {
    'use strict';

    var KEY = 'incisor.watchlist';

    /* Bumped when the stored shape changes. A blob at any other version is
     * not migrated — there is nothing here worth migrating, a watchlist is
     * eight tickers a reader can retype — it is discarded like any other blob
     * that fails validation. T14's portfolio is the one that will need a real
     * migration path, and it should not inherit a fake one from here. */
    var VERSION = 1;

    /* Eight, and the number comes from the upstream budget rather than from
     * taste. The free tier allows 25 calls a day and the page spends 22 of
     * them (DECISIONS.md): four go to the index strip, and every watched
     * symbol costs one more /history call — the same single call a tile
     * costs, because a daily series carries its own latest quote. Eight
     * leaves ten for symbol lookups, which are two calls each. A symbol
     * already on the strip costs nothing at all: the service caches per
     * symbol, so watching SPY is answered from the same row the tile filled.
     */
    var LIMIT = 8;

    /* The same whitelist the service applies and js/market-data.js repeats.
     * Stated a third time on purpose: this module is the boundary where a
     * string from storage becomes something the page will put in a URL, and
     * a boundary that trusts another boundary is not one. */
    var SYMBOL_PATTERN = /^[A-Z][A-Z.\-]{0,9}$/;

    var SORT_KEYS = ['symbol', 'price', 'change'];
    var SORT_DIRECTIONS = ['asc', 'desc'];

    var DEFAULT_SORT = { key: 'symbol', dir: 'asc' };

    function isFiniteNumber(value) {
        return typeof value === 'number' && isFinite(value);
    }

    /* ── Validation ─────────────────────────────────────────────── */

    /* The stored symbol list, or null if this is not one.
     *
     * Null rather than a filtered list when the shape is wrong, and a
     * filtered list when only some entries are: a blob that is not an array
     * tells us nothing was ever stored correctly, while an array holding one
     * bad ticker is a list with one bad ticker in it. The first is a reset
     * worth announcing and the second is not.
     */
    function readSymbols(raw) {
        if (!Array.isArray(raw)) return null;
        var seen = [];
        raw.forEach(function (entry) {
            if (typeof entry !== 'string') return;
            var symbol = entry.toUpperCase();
            if (!SYMBOL_PATTERN.test(symbol)) return;
            if (seen.indexOf(symbol) !== -1) return;
            if (seen.length >= LIMIT) return;
            seen.push(symbol);
        });
        return seen;
    }

    /* A stored sort, falling back a field at a time. An unreadable direction
     * does not cost the reader their column choice. */
    function readSort(raw) {
        if (!raw || typeof raw !== 'object') return null;
        var key = SORT_KEYS.indexOf(raw.key) === -1 ? DEFAULT_SORT.key : raw.key;
        var dir = SORT_DIRECTIONS.indexOf(raw.dir) === -1
            ? DEFAULT_SORT.dir : raw.dir;
        return { key: key, dir: dir };
    }

    /* ── Ordering ───────────────────────────────────────────────── */

    /* Rows in the reader's chosen order.
     *
     * A row is `{symbol, price, change}` — whatever the view has, which for a
     * symbol still loading is a symbol and two nulls. Two rules do not flip
     * with the direction, and both are deliberate:
     *
     * A row with no figure sorts last either way. Sorting descending by price
     * should not fill the top of the table with the symbols that have no
     * price yet; "unknown" is not a small number, and treating it as one
     * would make the sort say something false about the data.
     *
     * Ties break on the symbol, ascending, always — including when the column
     * itself is pointing the other way. The tie-break is a stabiliser rather
     * than part of the sort: without it two symbols at the same price swap
     * places on every redraw, and letting it flip with the direction would
     * mean pressing "Last" twice reordered rows whose price never differed.
     * The symbol column is the one case where the same comparison *is* the
     * sort, so it is applied there separately and does flip.
     */
    function byTicker(left, right) {
        if (left.symbol === right.symbol) return 0;
        return left.symbol < right.symbol ? -1 : 1;
    }

    function sorted(rows, sort) {
        var order = readSort(sort) || DEFAULT_SORT;
        var sign = order.dir === 'desc' ? -1 : 1;

        return rows.slice().sort(function (left, right) {
            if (order.key === 'symbol') return byTicker(left, right) * sign;

            var a = left[order.key];
            var b = right[order.key];
            var aKnown = isFiniteNumber(a);
            var bKnown = isFiniteNumber(b);
            if (aKnown !== bKnown) return aKnown ? -1 : 1;
            if (aKnown && a !== b) return (a - b) * sign;
            return byTicker(left, right);
        });
    }

    /* ── The stored list ────────────────────────────────────────── */

    /* Opens the watchlist over one storage object.
     *
     * `storage` is anything with getItem/setItem/removeItem, or null. Every
     * call is wrapped: a private window, a browser set to block site data and
     * a storage quota that is already full all throw on access rather than
     * returning nothing, and a page that lets that reach the caller has lost
     * a feature to an exception nobody can see.
     *
     * A storage that cannot be written is not a failed watchlist. The list
     * still works for the session, in memory, and `available` is what lets
     * the view say the part that is actually lost — that it will be gone on
     * reload.
     */
    function open(storage) {
        var symbols = [];
        var sort = { key: DEFAULT_SORT.key, dir: DEFAULT_SORT.dir };
        var recovered = false;

        /* Decided here rather than at the first write. Handed no storage at
         * all, this list is already known not to survive a reload, and the
         * view says so — waiting for a write to discover it meant the notice
         * appeared only after the reader had added something, which is one
         * symbol too late to be a warning. */
        var available = Boolean(storage);

        function readText() {
            if (!storage) return null;
            try {
                return storage.getItem(KEY);
            } catch (error) {
                available = false;
                return null;
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

            var list = blob && typeof blob === 'object' && blob.v === VERSION
                ? readSymbols(blob.symbols) : null;
            if (list === null) {
                // Something was stored and it is not ours. Replaced rather
                // than left in place: the next write would overwrite it
                // anyway, and doing it now means the reader is told once,
                // when it happened.
                recovered = true;
                save();
                return;
            }
            symbols = list;
            sort = readSort(blob.sort) || sort;
        }

        function save() {
            if (!storage) {
                available = false;
                return;
            }
            try {
                storage.setItem(KEY, JSON.stringify({
                    v: VERSION,
                    symbols: symbols,
                    sort: sort
                }));
                available = true;
            } catch (error) {
                // Out of quota, or site data blocked. The list is still
                // correct in memory for this session, so nothing is undone
                // here — only the promise that it survives a reload.
                available = false;
            }
        }

        load();

        return {
            LIMIT: LIMIT,

            /* Whether this list will still be here after a reload. False for
             * a blocked or full storage, and read by the view rather than
             * thrown, because the feature works either way. */
            isPersistent: function () { return available; },

            /* True when a stored blob was discarded on load. The view shows a
             * notice for it: a watchlist that quietly comes back empty looks
             * like the page lost the reader's work, which is exactly what it
             * did, and saying so is the difference between a bug and a
             * reset. */
            wasRecovered: function () { return recovered; },

            symbols: function () { return symbols.slice(); },
            sort: function () { return { key: sort.key, dir: sort.dir }; },
            isFull: function () { return symbols.length >= LIMIT; },

            has: function (symbol) {
                return symbols.indexOf(symbol) !== -1;
            },

            /* One of 'added', 'present', 'full' or 'invalid'. A word rather
             * than a boolean because the view says something different for
             * each, and a false that could mean three things is a message the
             * caller has to guess at. */
            add: function (symbol) {
                if (typeof symbol !== 'string') return 'invalid';
                var wanted = symbol.toUpperCase();
                if (!SYMBOL_PATTERN.test(wanted)) return 'invalid';
                if (symbols.indexOf(wanted) !== -1) return 'present';
                if (symbols.length >= LIMIT) return 'full';
                symbols.push(wanted);
                save();
                return 'added';
            },

            remove: function (symbol) {
                var at = symbols.indexOf(String(symbol).toUpperCase());
                if (at === -1) return false;
                symbols.splice(at, 1);
                save();
                return true;
            },

            setSort: function (key, dir) {
                sort = readSort({ key: key, dir: dir }) || sort;
                save();
                return this.sort();
            },

            clear: function () {
                symbols = [];
                save();
            }
        };
    }

    global.IncisorWatchlistStore = {
        KEY: KEY,
        VERSION: VERSION,
        LIMIT: LIMIT,
        SORT_KEYS: SORT_KEYS,
        open: open,
        sorted: sorted
    };
})(typeof window !== 'undefined' ? window : this);
