/* Symbol search and the quote panel it fills.
 *
 * The other half of the dashboard's top: the tiles say what the market did,
 * this says what one thing did. It owns a combobox over the catalogue and a
 * panel of figures for whatever the combobox settles on.
 *
 * The matching is js/symbol-search.js, the arithmetic and formatting are
 * js/market-figures.js, and the network is js/market-data.js. Nothing here
 * computes, ranks or fetches — it decides what goes on screen and when, which
 * is what lets the whole thing be driven from a DOM stub with no browser
 * (tests/symbol_model.jxa.js).
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

    /* Sessions the 52-week range and the average volume are measured over.
     *
     * 252 is a trading year once weekends and holidays are out, and 50 is the
     * conventional window for an average-volume comparison. Both read the tail
     * of whatever series arrived, so a symbol with a shorter history produces
     * a shorter window rather than nothing — and the range's own label says
     * which, because calling five months a 52-week range would be a lie the
     * reader has no way to catch.
     */
    var YEAR_SESSIONS = 252;
    var VOLUME_SESSIONS = 50;

    /* Below this the window is described by its length instead of being called
     * a year. Roughly ten months — close enough that "52-week" is a fair
     * rounding, and far enough that anything shorter is not. */
    var YEAR_ENOUGH = 210;

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
    var figures = window.IncisorMarketFigures;
    var finder = window.IncisorSymbolSearch;

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

    /* A low-to-high band with the last price marked inside it.
     *
     * The marker's position is written as a custom property rather than as a
     * width or an offset, so the arithmetic stays in one module and the
     * drawing stays in the stylesheet. A range that cannot be computed — a
     * symbol that has not moved all day, most often — hides the marker rather
     * than parking it at one end, which would read as a fact.
     */
    function renderRange(range, low, high, value, title) {
        if (!range) return;
        dom.fill(range, '[data-range-low]', figures.formatPrice(low));
        dom.fill(range, '[data-range-high]', figures.formatPrice(high));
        if (title) dom.fill(range, '[data-range-title]', title);

        var track = range.querySelector('[data-range-track]');
        var marker = range.querySelector('[data-range-marker]');
        var position = figures.positionInRange(low, high, value);
        if (!track || !marker) return;

        if (position === null) {
            marker.hidden = true;
            track.removeAttribute('data-range-known');
            return;
        }
        marker.hidden = false;
        track.setAttribute('data-range-known', 'true');
        // Set through the CSSOM rather than as a style attribute: a strict
        // Content-Security-Policy (T13) blocks the attribute and not this.
        track.style.setProperty('--inc-range-position',
            (position * 100).toFixed(2) + '%');
    }

    function rangeTitleFor(sessions) {
        if (sessions >= YEAR_ENOUGH) return '52-week range';
        // Weeks rather than sessions: a reader thinks in calendar time, and
        // "175-session range" asks them to do the conversion themselves.
        return Math.round(sessions / 5) + '-week range';
    }

    function setFigure(name, value) {
        dom.fill(panel, '[data-figure="' + name + '"]', value);
    }

    function renderIdentity(entry, symbol) {
        dom.fill(panel, '[data-quote-symbol]', symbol);
        dom.fill(panel, '[data-quote-name]', entry ? entry.name : symbol);

        var proxy = panel.querySelector('[data-quote-proxy]');
        if (proxy) proxy.hidden = !(entry && entry.tracks);
    }

    function renderChange(quote) {
        dom.fill(panel, '[data-quote-price]', figures.formatPrice(quote.price));
        dom.fill(panel, '[data-quote-delta]', figures.formatSigned(quote.change));
        dom.fill(panel, '[data-quote-pct]',
            figures.formatPercent(quote.changePercent));
        dom.fill(panel, '[data-quote-arrow]', figures.arrowFor(quote.change));
        dom.setDirection(panel.querySelector('[data-quote-change]'),
            figures.direction(quote.change));
    }

    function renderVolume(quote, bars) {
        var average = figures.averageVolume(bars, VOLUME_SESSIONS);
        setFigure('volume', figures.formatVolume(quote.volume));
        setFigure('average-volume', figures.formatVolume(average));
        // Null rather than a ratio when either side is unknown: a multiple
        // computed against a missing average would be a number with nothing
        // behind it, which is worse than an em dash.
        setFigure('relative-volume',
            average && quote.volume !== null
                ? figures.formatMultiple(quote.volume / average)
                : figures.DASH);
    }

    function renderQuote(symbol, entry, quoteEnvelope, historyEnvelope) {
        var quote = quoteEnvelope.quote;
        var bars = historyEnvelope ? historyEnvelope.bars : [];
        var ranges = panel.querySelectorAll('[data-range]');

        renderIdentity(entry, symbol);
        renderChange(quote);

        renderRange(ranges[0], quote.low, quote.high, quote.price, null);

        var year = figures.extremes(bars, YEAR_SESSIONS);
        if (year) {
            renderRange(ranges[1], year.low, year.high, quote.price,
                rangeTitleFor(year.sessions));
        } else {
            renderRange(ranges[1], null, null, null, '52-week range');
        }

        setFigure('open', figures.formatPrice(quote.open));
        setFigure('previous', figures.formatPrice(quote.previousClose));
        renderVolume(quote, bars);

        var summary = figures.provenanceFor(quoteEnvelope, quote.tradingDay);
        var line = panel.querySelector('[data-quote-provenance]');
        if (line) {
            line.setAttribute('data-provenance-state', summary.state);
            dom.fill(line, '[data-quote-provenance-message]', summary.message);
        }

        setState('ready');
    }

    /* ── Looking one up ─────────────────────────────────────────── */

    function failureMessage(kind, symbol) {
        if (kind === 'not_found') {
            return 'No data for ' + symbol + '. '
                + (catalog.exhaustive
                    ? 'This build serves sample data for a handful of symbols; '
                        + 'the search list above is all of them.'
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
        say('Looking up ' + symbol + '…');
        setHint('Looking up ' + symbol + '…');

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
        });
    }

    function choose(symbol) {
        if (!finder.looksLikeSymbol(symbol)) {
            setState('not-found');
            say(failureMessage('invalid_symbol', symbol));
            setHint(adviceFor('invalid_symbol'));
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
        if (!dom || !data || !figures || !finder) return;

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
