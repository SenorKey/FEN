/* Matching and ranking for the symbol search box.
 *
 * Pure, like js/market-clock.js and js/market-figures.js: a catalogue and a
 * query in, an ordered list out. No DOM, no network, no clock. Search runs on
 * every keystroke against a table already in memory, and it stays that way —
 * the provider's own symbol-search endpoint would spend an upstream call per
 * keypress, which the 22-a-day budget rules out entirely.
 *
 * The ranking is the whole substance of the module, and it exists because the
 * obvious implementation is wrong in a way people notice. A plain substring
 * filter puts "V" (Visa) behind every other ticker containing a V, and buries
 * "T" (AT&T) under two dozen names with a T in them. So matches are placed in
 * tiers and only sorted within a tier: what you typed exactly comes first,
 * then what starts with it, then what merely contains it.
 *
 * Names are matched at word boundaries as well as at the front, because
 * "depot" should find The Home Depot and "coca" should find The Coca-Cola
 * Company. Leading articles are extremely common in registered company names
 * and nobody searches for them.
 *
 * Exposes window.IncisorSymbolSearch.
 */

(function (global) {
    'use strict';

    /* Enough to be worth scrolling, few enough to read without. Beyond this
     * the right answer is a better query, not a longer list. */
    var DEFAULT_LIMIT = 8;

    /* The same whitelist the service applies at its edge, so a free-typed
     * ticker that could never be asked for is refused here rather than
     * becoming a request that 400s. */
    var SYMBOL_PATTERN = /^[A-Z][A-Z.\-]{0,9}$/;

    /* Split a name into the words a search might start from. Punctuation is a
     * separator rather than part of a word: "Coca-Cola" has to be findable as
     * "cola", and "Amazon.com" as "com" costs nothing to allow. */
    var WORD_SPLIT = /[^a-z0-9]+/;

    /* Tier numbers, smallest first. Named so the comparison below reads as
     * what it means rather than as arithmetic on magic numbers. */
    var EXACT_SYMBOL = 0;
    var SYMBOL_PREFIX = 1;
    var NAME_WORD_PREFIX = 2;
    var NAME_ANYWHERE = 3;
    var SYMBOL_ANYWHERE = 4;
    var NO_MATCH = 5;

    function normalise(query) {
        return typeof query === 'string' ? query.trim() : '';
    }

    /* Whether a query could be a ticker worth asking the service about.
     *
     * This is what lets the box accept a symbol that is not in the catalogue:
     * the table is a set of names to search by, not the list of everything
     * that exists, and in live mode the provider answers for far more than it
     * holds. The service decides whether the symbol resolves; this only
     * decides whether asking is well-formed.
     */
    function looksLikeSymbol(query) {
        return SYMBOL_PATTERN.test(normalise(query).toUpperCase());
    }

    function asSymbol(query) {
        return normalise(query).toUpperCase();
    }

    function tierFor(entry, upper, lower) {
        var symbol = entry.symbol;
        if (symbol === upper) return EXACT_SYMBOL;
        if (symbol.indexOf(upper) === 0) return SYMBOL_PREFIX;

        var name = String(entry.name || '').toLowerCase();
        var words = name.split(WORD_SPLIT);
        for (var index = 0; index < words.length; index++) {
            if (words[index] && words[index].indexOf(lower) === 0) {
                return NAME_WORD_PREFIX;
            }
        }

        if (name.indexOf(lower) !== -1) return NAME_ANYWHERE;
        if (symbol.indexOf(upper) !== -1) return SYMBOL_ANYWHERE;
        return NO_MATCH;
    }

    /* The catalogue entries matching `query`, best first.
     *
     * An empty query returns nothing rather than everything. The results list
     * is a response to typing, and opening it with the whole table would make
     * the first keystroke look like it narrowed something rather than like it
     * searched.
     */
    function match(entries, query, limit) {
        var upper = asSymbol(query);
        if (!Array.isArray(entries) || upper === '') return [];

        var lower = upper.toLowerCase();
        var found = [];

        entries.forEach(function (entry) {
            if (!entry || typeof entry.symbol !== 'string') return;
            var tier = tierFor(entry, upper, lower);
            if (tier !== NO_MATCH) found.push({ tier: tier, entry: entry });
        });

        found.sort(function (left, right) {
            if (left.tier !== right.tier) return left.tier - right.tier;
            // Within a tier, alphabetical by ticker. Arbitrary, but stable and
            // predictable — the same query always produces the same order,
            // which matters when the list is being driven by arrow keys.
            return left.entry.symbol < right.entry.symbol ? -1 : 1;
        });

        return found.slice(0, limit > 0 ? limit : DEFAULT_LIMIT)
            .map(function (row) { return row.entry; });
    }

    /* The catalogue row for an exact ticker, or null. Used to name a symbol
     * that was typed rather than picked out of the list. */
    function lookup(entries, symbol) {
        if (!Array.isArray(entries)) return null;
        var upper = asSymbol(symbol);
        for (var index = 0; index < entries.length; index++) {
            if (entries[index] && entries[index].symbol === upper) {
                return entries[index];
            }
        }
        return null;
    }

    global.IncisorSymbolSearch = {
        DEFAULT_LIMIT: DEFAULT_LIMIT,
        match: match,
        lookup: lookup,
        looksLikeSymbol: looksLikeSymbol,
        asSymbol: asSymbol
    };
})(typeof window !== 'undefined' ? window : this);
