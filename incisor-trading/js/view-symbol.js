/* Symbol search and the quote panel it fills.
 *
 * The other half of the dashboard's top: the tiles say what the market did,
 * this says what one thing did. It owns a combobox over the catalogue and a
 * panel of figures for whatever the combobox settles on.
 *
 * This file is the deciding half. js/quote-card.js is the drawing half and
 * holds every write into the card, along with the windows the 52-week range
 * and the volume average are measured over; what is left here is which symbol
 * is on screen, what a failure says, and which sibling surfaces to wake.
 *
 * The matching is js/symbol-search.js, the arithmetic and formatting are
 * js/market-figures.js, and the network is js/market-data.js. The price chart
 * is js/view-price-chart.js, which owns no request of its own — the series
 * fetched here is the series it draws, so it is handed the bars rather than
 * asking for them again. Nothing here computes, ranks or fetches — it decides
 * what goes on screen and when, which is what lets the whole thing be driven
 * from a DOM stub with no browser (tests/symbol_model.jxa.js).
 *
 * Two upstream calls per symbol, and both are needed. /history carries the
 * year the 52-week range is measured over and the average volume today is
 * compared against; /quote carries the day's own open, high, low and volume,
 * which a daily series does not hold for a session still in progress. The
 * tiles deliberately use /history alone — there the second call would buy
 * nothing — so a lookup costs two of the 22 daily calls and a symbol already
 * on the dashboard costs one.
 *
 * Contract with the markup: a [data-search] block holding a [data-search-input]
 * combobox and a [data-search-results] listbox, and a [data-quote] panel whose
 * data-state is one of empty / loading / ready / not-found / error. Every
 * figure ships as an em dash and stays one until the service answers.
 */

(function () {
    'use strict';

    var dom = window.IncisorDom;

    /* Long enough that a fast typist does not fire a render per keystroke,
     * short enough to feel like it is keeping up. Nothing here is a network
     * call, so this is only about how often the list is rebuilt. */
    var TYPING_SETTLE_MS = 90;

    var OPTION_ID_PREFIX = 'inc-search-option-';

    /* ── State ──────────────────────────────────────────────────── */

    var catalog = { symbols: [], exhaustive: false };
    var matches = [];
    var activeIndex = -1;
    var settleTimer = null;

    /* Which lookup the panel is currently showing, so a slow answer for a
     * symbol the reader has already moved on from is dropped rather than
     * overwriting the one they are looking at. */
    var showing = null;

    /* ── Elements ───────────────────────────────────────────────── */

    var search = document.querySelector('[data-search]');
    var panel = document.querySelector('[data-quote]');
    var input = search && search.querySelector('[data-search-input]');
    var results = search && search.querySelector('[data-search-results]');
    var hint = search && search.querySelector('[data-search-hint]');
    var body = panel && panel.querySelector('[data-quote-body]');

    var data = window.IncisorMarketData;
    var finder = window.IncisorSymbolSearch;
    var card = window.IncisorQuoteCard;

    /* Absent if its markup is missing or its modules failed to load, in which
     * case the panel is still a complete answer without it. */
    var chart = window.IncisorPriceChart;

    /* The filings panel, which owns its own request to a different upstream.
     * It is handed the last price rather than the series: three of its
     * figures are a filing divided by a price, and the price has to be the
     * one this card is showing. */
    var filings = window.IncisorFundamentals;

    /* The reporting calendar, fed by the same request the filings panel
     * makes. It is handed no price — nothing on it is a ratio — so it takes
     * the symbol alone, and js/market-data.js joins the two views onto one
     * request rather than making it twice. */
    var reports = window.IncisorReports;

    /* The Watch toggle sits on this card and belongs to the watchlist, the
     * same way the chart sits beside it and owns itself. All this panel does
     * is say which symbol is on screen; whether it is watched, whether the
     * list is full and what the button reads are none of its business. */
    var watchlist = window.IncisorWatchlist;

    /* ── The results list ───────────────────────────────────────── */

    function closeList() {
        // A render is queued on every keystroke, so closing has to cancel the
        // pending one as well. Without this, choosing a symbol closed the list
        // and the debounce re-opened it a moment later, leaving the results
        // sitting on top of the panel they had just filled.
        if (settleTimer) {
            window.clearTimeout(settleTimer);
            settleTimer = null;
        }
        activeIndex = -1;
        matches = [];
        dom.empty(results);
        results.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
    }

    /* One option, built element by element.
     *
     * A company name is an attacker-influenced string that arrived over the
     * network (guide section 5), so every part of it becomes text and none of
     * it becomes markup. The symbol and the name are separate elements rather
     * than one line because they are styled differently and read differently.
     */
    function buildOption(entry, index) {
        var option = document.createElement('li');
        option.className = 'inc-search-option';
        option.id = OPTION_ID_PREFIX + index;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', 'false');
        option.setAttribute('data-symbol', entry.symbol);

        var ticker = document.createElement('span');
        ticker.className = 'inc-search-ticker';
        ticker.textContent = entry.symbol;
        option.appendChild(ticker);

        var name = document.createElement('span');
        name.className = 'inc-search-name';
        name.textContent = entry.name;
        option.appendChild(name);

        if (entry.tracks) {
            var badge = document.createElement('span');
            badge.className = 'inc-proxy';
            badge.textContent = 'proxy';
            option.appendChild(badge);
        }
        return option;
    }

    /* Moves the highlight without moving focus.
     *
     * Focus stays in the input for the whole interaction — that is the point
     * of the combobox pattern, and it is what lets someone keep typing to
     * narrow a list they are already walking. aria-activedescendant is how a
     * screen reader is told which option is current.
     */
    function setActive(index) {
        var options = results.children;
        for (var seat = 0; seat < options.length; seat++) {
            options[seat].setAttribute('aria-selected',
                seat === index ? 'true' : 'false');
        }
        activeIndex = index;
        if (index < 0) {
            input.removeAttribute('aria-activedescendant');
            return;
        }
        input.setAttribute('aria-activedescendant', OPTION_ID_PREFIX + index);
        if (options[index].scrollIntoView) {
            options[index].scrollIntoView({ block: 'nearest' });
        }
    }

    function describe(count, query) {
        if (count === 1) return '1 match. Press Enter to open it.';
        if (count > 1) {
            return count + ' matches. Arrow keys to choose, or Enter for the '
                + 'first.';
        }
        if (catalog.exhaustive) {
            return 'Nothing matches “' + query + '”. This build serves sample '
                + 'data for a handful of symbols, so the list is short.';
        }
        return finder.looksLikeSymbol(query)
            ? 'No name matches. Press Enter to look up ' + finder.asSymbol(query)
                + ' anyway.'
            : 'Nothing matches “' + query + '”.';
    }

    function renderList() {
        var query = input.value;
        matches = finder.match(catalog.symbols, query);

        dom.empty(results);
        matches.forEach(function (entry, index) {
            results.appendChild(buildOption(entry, index));
        });

        var open = matches.length > 0;
        results.hidden = !open;
        input.setAttribute('aria-expanded', open ? 'true' : 'false');
        setActive(-1);

        if (hint) {
            hint.textContent = finder.asSymbol(query) === ''
                ? 'Type a ticker or a company name, then choose from the list '
                    + 'or press Enter.'
                : describe(matches.length, query.trim());
        }
    }

    /* ── The quote panel ────────────────────────────────────────── */

    function setState(state) {
        panel.setAttribute('data-state', state);
        if (body) body.hidden = state !== 'ready';
    }

    function say(message) {
        dom.fill(panel, '[data-quote-message]', message);
    }

    function setHint(message) {
        if (hint) hint.textContent = message;
    }

    function renderQuote(symbol, entry, quoteEnvelope, historyEnvelope) {
        var quote = quoteEnvelope.quote;
        var bars = historyEnvelope ? historyEnvelope.bars : [];

        card.render(panel, symbol, entry, quoteEnvelope, historyEnvelope);

        // The chart draws the series this lookup already has. A history that
        // did not arrive costs the chart and not the quote, so it says so in
        // its own space rather than failing the panel. Whether the symbol is a
        // proxy travels with it: the catalogue entry is here and not there,
        // and the chart names the symbol in its own head now.
        if (chart) {
            if (bars.length > 0) {
                chart.show(symbol, bars, !!(entry && entry.tracks));
            } else {
                chart.unavailable(symbol);
            }
        }

        // Asked for on a quote rather than on a search, for the same reason
        // the Watch button is: a symbol that turned out not to be priceable
        // has no card for the filings to sit under. The price goes with it —
        // see the note where `filings` is declared.
        if (filings) filings.show(symbol, quote.price);
        if (reports) reports.show(symbol);

        // Offered on a quote rather than on a search, so the button never
        // appears beside figures that turned out not to exist.
        if (watchlist) watchlist.offer(symbol);

        setState('ready');
    }

    /* ── Looking one up ─────────────────────────────────────────── */

    /* The symbols this build can answer for, named rather than pointed at.
     *
     * The message used to end "the search list above is all of them", which
     * was true and unhelpful: the lookup that just failed closes that list, so
     * it sent the reader to an empty strip of screen and asked them to guess
     * their way back into it. The tickers themselves fit in the sentence, and
     * a reader holding one can act on it without opening anything.
     */
    function catalogSentence() {
        var names = catalog.symbols.map(function (entry) {
            return entry.symbol;
        });
        if (names.length < 2) {
            return 'This build serves sample data for a short list of symbols.';
        }
        // No count in front of the list: it is redundant beside the names
        // themselves, and a numeral inside a sentence reads as a figure on a
        // page where every other numeral is one.
        return 'This build serves sample data for '
            + names.slice(0, -1).join(', ') + ' and '
            + names[names.length - 1] + '.';
    }

    function failureMessage(kind, symbol) {
        if (kind === 'not_found') {
            return 'No data for ' + symbol + '. '
                + (catalog.exhaustive
                    ? catalogSentence()
                    : 'That ticker is not one the data provider answers for.');
        }
        if (kind === 'invalid_symbol') {
            return symbol + ' is not a ticker. US-listed symbols are letters, '
                + 'with a dot or a hyphen in a few cases.';
        }
        return 'Market data unavailable. The price service could not be '
            + 'reached, so ' + symbol + ' could not be looked up.';
    }

    /* What the hint says after a failed lookup.
     *
     * Never "Showing X" — nothing is being shown. And only advice the reader
     * can act on: trying a different ticker fixes a ticker that does not
     * exist, and fixes nothing at all when the service is down, so in that
     * case the panel's own message is left to speak alone.
     */
    function adviceFor(kind) {
        return kind === 'not_found' || kind === 'invalid_symbol'
            ? 'Try another ticker or company name.' : '';
    }

    /* Reads one symbol and fills the panel.
     *
     * The two requests go out together rather than in sequence: they are
     * independent, and waiting for the first before starting the second would
     * double the time the panel spends in its loading state for no benefit.
     * The quote is the one that decides the outcome — a symbol with no quote
     * has nothing to show — so a failed history degrades the 52-week range and
     * the volume average to em dashes instead of failing the lookup.
     */
    function lookup(symbol) {
        var entry = finder.lookup(catalog.symbols, symbol);
        showing = symbol;
        setState('loading');
        // Said by the panel alone. Both lines carried this string, which put
        // the same sentence on screen twice twenty pixels apart and, now that
        // the panel announces, would have read it out twice as well.
        say('Looking up ' + symbol + '…');
        setHint('');

        var history = data.history(symbol).then(null, function () { return null; });

        data.quote(symbol).then(function (quoteEnvelope) {
            return history.then(function (historyEnvelope) {
                if (showing !== symbol) return null;
                renderQuote(symbol, entry, quoteEnvelope, historyEnvelope);
                setHint('Showing ' + symbol + '.');
                return null;
            });
        }, function (error) {
            if (showing !== symbol) return;
            // Deliberately not logged. The failure is already on screen in
            // words, and a console error on an offline service is noise in the
            // check that has to stay meaningful (tools/shoot.py fails a run on
            // one).
            setState(error && error.kind === 'not_found' ? 'not-found' : 'error');
            say(failureMessage(error && error.kind, symbol));
            setHint(adviceFor(error && error.kind));
            // Cleared rather than left showing the previous symbol's prices
            // under the name of one that has none.
            if (chart) chart.reset();
            if (filings) filings.reset();
            if (reports) reports.reset();
            if (watchlist) watchlist.offer(null);
        });
    }

    function choose(symbol) {
        if (!finder.looksLikeSymbol(symbol)) {
            setState('not-found');
            say(failureMessage('invalid_symbol', symbol));
            setHint(adviceFor('invalid_symbol'));
            if (chart) chart.reset();
            if (filings) filings.reset();
            if (reports) reports.reset();
            if (watchlist) watchlist.offer(null);
            return;
        }
        input.value = finder.asSymbol(symbol);
        closeList();
        lookup(finder.asSymbol(symbol));
    }

    /* ── Wiring ─────────────────────────────────────────────────── */

    /* What Enter acts on: the highlighted option, then the best match, then
     * whatever was typed.
     *
     * The middle step is the one that matters. Typing "apple" and pressing
     * Enter has to open Apple — falling straight through to the typed text
     * would look up a ticker called APPLE and report that no such thing
     * exists, while the right answer sat highlighted-adjacent at the top of
     * the list. Falling through is still what happens when nothing matched,
     * which is how a ticker the catalogue does not list stays reachable.
     */
    function chosenSymbol() {
        if (activeIndex >= 0) return matches[activeIndex].symbol;
        if (matches.length > 0) return matches[0].symbol;
        return input.value;
    }

    function onKeydown(event) {
        var last = matches.length - 1;
        switch (event.key) {
            case 'ArrowDown':
                if (matches.length === 0) return;
                event.preventDefault();
                setActive(activeIndex >= last ? 0 : activeIndex + 1);
                return;
            case 'ArrowUp':
                if (matches.length === 0) return;
                event.preventDefault();
                setActive(activeIndex <= 0 ? last : activeIndex - 1);
                return;
            case 'Home':
                if (matches.length === 0) return;
                event.preventDefault();
                setActive(0);
                return;
            case 'End':
                if (matches.length === 0) return;
                event.preventDefault();
                setActive(last);
                return;
            case 'Enter':
                event.preventDefault();
                choose(chosenSymbol());
                return;
            case 'Escape':
                if (results.hidden) return;
                event.preventDefault();
                closeList();
                return;
            default:
                return;
        }
    }

    function onInput() {
        if (settleTimer) window.clearTimeout(settleTimer);
        settleTimer = window.setTimeout(renderList, TYPING_SETTLE_MS);
    }

    function onResultsClick(event) {
        var option = event.target.closest('[data-symbol]');
        if (option) choose(option.getAttribute('data-symbol'));
    }

    /* A click anywhere else closes the list. Bound on the document because
     * the list has to close for a click that never reaches the search block —
     * which is most of them. */
    function onDocumentClick(event) {
        if (!results.hidden && !search.contains(event.target)) closeList();
    }

    function start() {
        // Nothing to drive, or a module that failed to load. The served markup
        // is a labelled input and an empty panel that says nothing has been
        // looked up, which stays true either way.
        if (!search || !panel || !input || !results) return;
        if (!dom || !data || !finder || !card) return;

        input.addEventListener('input', onInput);
        input.addEventListener('keydown', onKeydown);
        results.addEventListener('click', onResultsClick);
        document.addEventListener('click', onDocumentClick);

        // The catalogue is a local table on our own service, so this costs no
        // upstream quota. Failing to load it leaves search matching nothing,
        // and a typed ticker still works — so it degrades rather than breaks.
        data.symbols().then(function (listed) {
            catalog = listed;
        }, function () {
            if (hint) {
                hint.textContent = 'The symbol list could not be loaded. Type a '
                    + 'ticker and press Enter to look one up.';
            }
        });
    }

    start();
})();
