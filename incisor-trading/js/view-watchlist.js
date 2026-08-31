/* The watchlist — the symbols a reader chose to keep an eye on.
 *
 * The dashboard's third surface. The strip says what the market did and the
 * quote card says what one symbol did; this says what *your* symbols did, and
 * it is the first thing on the page that remembers anything between visits.
 *
 * It owns two pieces of screen that are not next to each other: the table
 * itself, and the Watch toggle on the quote card. The toggle lives there
 * because that is where the symbol is — a watchlist you can only add to from
 * inside itself would need a second search box — but the logic lives here,
 * so js/view-symbol.js hands over a symbol and knows nothing else about it.
 * That is the same arrangement it already has with the price chart.
 *
 * The list and its ordering are js/watchlist-store.js, the arithmetic is
 * js/market-figures.js, and the network is js/market-data.js. Nothing here
 * stores, sorts, computes or fetches; it decides what goes on screen and
 * when, which is what lets it be driven from a DOM stub with no browser
 * (tests/watchlist_model.jxa.js).
 *
 * One /history call per watched symbol, which is one call and not two: a
 * daily series carries its own latest quote, so the table costs exactly what
 * a tile costs. Symbols already on the strip cost nothing — the service
 * caches per symbol, so watching SPY is answered from the row the tile
 * filled. The eight-symbol cap is where that arithmetic is written down.
 *
 * Contract with the markup: a [data-watchlist] block whose data-state is one
 * of empty / loading / ready, holding a [data-watchlist-rows] tbody, sort
 * buttons carrying [data-watchlist-sort], and the message, notice and
 * provenance lines. Plus a [data-watch] block on the quote card, shipped
 * hidden, holding [data-watch-toggle] and [data-watch-note].
 *
 * Exposes window.IncisorWatchlist.
 */

(function (global) {
    'use strict';

    var dom = global.IncisorDom;

    /* The same line the index tiles draw, from the same shape of payload:
     * js/sparkline.js owns the drawing and the sentence that stands in for it.
     * A watched row already pays for the whole daily series — the trend is the
     * part of it that was being thrown away. */
    var spark = global.IncisorSparkline;

    /* Which way a column sorts the first time it is pressed.
     *
     * A ticker column wants A to Z, and a column of numbers wants the big
     * ones first: a reader pressing "Change" is asking what moved, and
     * answering with the flattest symbol on the list makes them press it
     * twice every time. Pressing the column it is already on flips it. */
    var FIRST_DIRECTION = { symbol: 'asc', price: 'desc', change: 'desc' };

    var ARIA_SORT = { asc: 'ascending', desc: 'descending' };

    /* ── State ──────────────────────────────────────────────────── */

    var store = null;

    /* symbol -> { symbol, price, change, changePercent, closes, state }. The
     * figures the table draws, kept apart from the stored list: the store
     * knows which symbols are watched and this knows what they are worth, and
     * neither has to be reloaded when the other changes. */
    var figuresBySymbol = {};

    /* The first payload that answered, for the provenance line — the same one
     * the strip and the quote card use, so all three make one claim. */
    var provenancePayload = null;

    /* Which symbol the quote card is showing, or null. */
    var offered = null;

    /* ── Elements ───────────────────────────────────────────────── */

    var panel = document.querySelector('[data-watchlist]');
    var rowsBody = panel && panel.querySelector('[data-watchlist-rows]');
    var watch = document.querySelector('[data-watch]');
    var toggle = watch && watch.querySelector('[data-watch-toggle]');

    var data = global.IncisorMarketData;
    var figures = global.IncisorMarketFigures;
    var storage = global.IncisorWatchlistStore;

    /* ── Rows ───────────────────────────────────────────────────── */

    function cell(tag, className) {
        var node = document.createElement(tag);
        node.className = className;
        return node;
    }

    /* The change figure, built the same way every other surface builds it:
     * an arrow, an explicitly signed number and a percentage, so direction
     * survives greyscale and colour blindness (guide section 13). The window
     * it covers is named once in the column header rather than once per row —
     * a header names every cell beneath it, and repeating "1d" eight times
     * down a table is noise where on a tile it was the missing fact. */
    function changeCell(row) {
        var wrapper = cell('td', 'inc-watch-change');
        var line = cell('p', 'inc-watch-delta');

        if (row.state === 'error') {
            line.className = 'inc-watch-delta inc-watch-missing';
            line.textContent = 'unavailable';
            wrapper.appendChild(line);
            return wrapper;
        }

        var arrow = cell('span', 'inc-arrow');
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = figures.arrowFor(row.change);
        line.appendChild(arrow);

        var delta = cell('span', 'inc-delta');
        delta.textContent = figures.formatSigned(row.change);
        line.appendChild(delta);

        var percent = cell('span', 'inc-delta-pct');
        percent.textContent = figures.formatPercent(row.changePercent);
        line.appendChild(percent);

        dom.setDirection(line, figures.direction(row.change));
        wrapper.appendChild(line);
        return wrapper;
    }

    /* The thirty-session shape behind the one-session figure beside it.
     *
     * The row already paid for this. A watched symbol costs one daily-bars
     * call and the last two bars answer the change column, so the other 250
     * were being fetched, parsed and dropped — while the tile above, on the
     * same single call, drew the line. A reader who deliberately chose these
     * symbols was being told less about them than the strip tells them about
     * four they did not choose.
     *
     * Uncoloured, like every line on this page, and the window it covers is
     * named once in the column header rather than once per row — the same
     * rule the change column follows.
     */
    function trendCell(row) {
        var wrapper = cell('td', 'inc-watch-trend');
        if (!spark) return wrapper;

        var svg = spark.element('inc-watch-spark', row.symbol);
        wrapper.appendChild(svg);

        if (row.state === 'ready' && row.closes) {
            spark.draw(svg, row.closes, row.symbol);
        } else if (row.state === 'error') {
            spark.unavailable(svg, row.symbol);
        }
        return wrapper;
    }

    /* The remove control.
     *
     * The accessible name carries the ticker, because "Remove" repeated eight
     * times down a table names nothing. The data-track deliberately does not:
     * beacon.js prefers data-track over aria-label, and without one the
     * label — ticker and all — would be posted to the telemetry endpoint,
     * which guide section 5 forbids. A reader's watchlist stays in their
     * browser.
     */
    function removeCell(symbol) {
        var wrapper = cell('td', 'inc-watch-actions');
        var button = document.createElement('button');
        button.className = 'inc-watch-remove';
        button.setAttribute('type', 'button');
        button.setAttribute('aria-label', 'Remove ' + symbol + ' from the watchlist');
        button.setAttribute('data-track', 'watchlist-remove');
        button.setAttribute('data-watch-remove', symbol);
        button.textContent = '×';
        wrapper.appendChild(button);
        return wrapper;
    }

    function buildRow(row) {
        var tr = document.createElement('tr');
        tr.className = 'inc-watch-row';
        tr.setAttribute('data-watch-row', row.symbol);
        tr.setAttribute('data-state', row.state);

        var head = cell('th', 'inc-watch-symbol');
        head.setAttribute('scope', 'row');
        head.textContent = row.symbol;
        tr.appendChild(head);

        var price = cell('td', 'inc-watch-price');
        price.textContent = row.state === 'ready'
            ? figures.formatPrice(row.price) : figures.DASH;
        tr.appendChild(price);

        tr.appendChild(changeCell(row));
        tr.appendChild(trendCell(row));
        tr.appendChild(removeCell(row.symbol));
        return tr;
    }

    /* What the table knows about one symbol, which for a symbol still in
     * flight is its name and three unknowns. Built for every watched symbol
     * rather than only the answered ones, so the row appears the moment it is
     * added and fills in place instead of the table growing under the
     * reader. */
    function rowFor(symbol) {
        var known = figuresBySymbol[symbol];
        if (!known) {
            return { symbol: symbol, price: null, change: null,
                changePercent: null, closes: null, state: 'loading' };
        }
        return known;
    }

    /* ── The table ──────────────────────────────────────────────── */

    function setState(state) {
        panel.setAttribute('data-state', state);
    }

    function setSortIndicators() {
        var order = store.sort();
        var buttons = Array.prototype.slice.call(
            panel.querySelectorAll('[data-watchlist-sort]'));
        buttons.forEach(function (button) {
            var key = button.getAttribute('data-watchlist-sort');
            var column = button.closest('[data-watchlist-column]');
            if (!column) return;
            // On the header cell, not the button: aria-sort describes the
            // column, and a screen reader reads it when it enters one.
            column.setAttribute('aria-sort',
                key === order.key ? ARIA_SORT[order.dir] : 'none');
            button.setAttribute('aria-pressed', key === order.key ? 'true' : 'false');
        });
    }

    /* What the reader is told about storage, under the table.
     *
     * Two different things, and only one of them is about this session. A
     * discarded blob is something that already happened and cost them a list;
     * a storage that cannot be written is something that is going to happen
     * when they reload. Both are stated plainly rather than left to be
     * discovered, because a watchlist that silently forgets looks like the
     * page losing their work — which is what it is.
     */
    function noticeText() {
        if (store.wasRecovered()) {
            return 'A saved watchlist could not be read, so it was cleared and '
                + 'started fresh.';
        }
        if (!store.isPersistent()) {
            return 'This browser is not storing site data, so anything added '
                + 'here will be gone when the page reloads.';
        }
        return '';
    }

    function renderNotice() {
        var text = noticeText();
        var node = dom.fill(panel, '[data-watchlist-notice]', text);
        if (node) node.hidden = text === '';
    }

    /* Where these numbers came from, in the same sentence the strip and the
     * quote card use. Hidden until something has actually settled: with no
     * payload the shared wording is "market data unavailable", which is true
     * of a table whose calls all failed and a lie about one still waiting. */
    function renderProvenance(state) {
        var line = panel.querySelector('[data-watchlist-provenance]');
        if (!line) return;
        line.hidden = state !== 'ready';
        if (line.hidden) return;

        var asOf = provenancePayload
            ? provenancePayload.bars[provenancePayload.bars.length - 1].date : '';
        var summary = figures.provenanceFor(provenancePayload, asOf);
        line.setAttribute('data-provenance-state', summary.state);
        dom.fill(line, '[data-watchlist-provenance-message]', summary.message);
    }

    function countSentence(total) {
        var left = store.LIMIT - total;
        if (left === 0) {
            return 'Full at ' + store.LIMIT + ' symbols. Remove one to add another.';
        }
        return total + ' of ' + store.LIMIT + ' symbols.';
    }

    /* Loading until every row has an answer, then ready.
     *
     * Per row rather than per request, so a symbol whose call failed does not
     * leave the table saying it is still loading forever — a failed row is an
     * answer, and it says "unavailable" in its own space. */
    function stateFor(rows) {
        if (rows.length === 0) return 'empty';
        var waiting = rows.some(function (row) {
            return row.state === 'loading';
        });
        return waiting ? 'loading' : 'ready';
    }

    function render() {
        var symbols = store.symbols();
        var rows = storage.sorted(symbols.map(rowFor), store.sort());

        dom.empty(rowsBody);
        rows.forEach(function (row) {
            rowsBody.appendChild(buildRow(row));
        });

        var state = stateFor(rows);
        setState(state);
        dom.fill(panel, '[data-watchlist-count]',
            rows.length === 0 ? '' : countSentence(rows.length));
        setSortIndicators();
        renderNotice();
        renderProvenance(state);
        renderToggle();
    }

    /* ── The Watch toggle on the quote card ─────────────────────── */

    /* The note under the button, which is also the button's description.
     *
     * Empty most of the time. It has something to say only when the answer to
     * pressing the button is "no", and then it has to say why — a control
     * that refuses without a reason is worse than one that is missing. */
    function toggleNote(symbol) {
        if (store.has(symbol)) return '';
        return store.isFull()
            ? 'The watchlist is full at ' + store.LIMIT + ' symbols. Remove one '
                + 'below to add this.'
            : '';
    }

    function renderToggle() {
        if (!toggle) return;
        if (!offered) {
            watch.hidden = true;
            return;
        }
        watch.hidden = false;

        var watching = store.has(offered);
        var note = toggleNote(offered);

        dom.fill(toggle, '[data-watch-toggle-label]', watching ? 'Watching' : 'Watch');
        toggle.setAttribute('aria-pressed', watching ? 'true' : 'false');
        // aria-disabled rather than the real thing: a disabled button leaves
        // the tab order, so a keyboard reader never reaches it and never
        // reaches the sentence explaining why it is refusing. This way they
        // land on it, hear that it is unavailable, and hear the reason it
        // describes itself with.
        toggle.setAttribute('aria-disabled', note === '' ? 'false' : 'true');
        toggle.setAttribute('aria-label',
            (watching ? 'Stop watching ' : 'Watch ') + offered);

        var noteNode = dom.fill(watch, '[data-watch-note]', note);
        if (noteNode) noteNode.hidden = note === '';
    }

    /* ── Loading ────────────────────────────────────────────────── */

    function record(symbol, payload) {
        var quote = payload && figures.quoteFromBars(payload.bars);
        if (!quote) {
            figuresBySymbol[symbol] = { symbol: symbol, price: null, change: null,
                changePercent: null, closes: null, state: 'error' };
            return;
        }
        if (!provenancePayload) provenancePayload = payload;
        figuresBySymbol[symbol] = {
            symbol: symbol,
            price: quote.close,
            change: quote.change,
            changePercent: quote.changePercent,
            // Cut to the window the line draws rather than kept whole: the
            // rest of the series answers no question this table asks, and
            // eight symbols holding a year each is memory with no reader.
            closes: spark ? figures.closingPrices(payload.bars, spark.DAYS) : null,
            state: 'ready'
        };
    }

    function fetchSymbol(symbol) {
        data.history(symbol).then(function (payload) {
            record(symbol, payload);
            render();
        }, function () {
            // Deliberately silent, like the strip: the failure is on screen
            // in the row's own space, and a console error against an offline
            // service is noise in the check that has to stay meaningful
            // (tools/shoot.py fails a run on one).
            record(symbol, null);
            render();
        });
    }

    /* ── Wiring ─────────────────────────────────────────────────── */

    function onSortClick(event) {
        var button = event.target.closest('[data-watchlist-sort]');
        if (!button) return;
        var key = button.getAttribute('data-watchlist-sort');
        var order = store.sort();
        store.setSort(key, key === order.key
            ? (order.dir === 'asc' ? 'desc' : 'asc')
            : FIRST_DIRECTION[key]);
        render();
    }

    function onRowsClick(event) {
        var button = event.target.closest('[data-watch-remove]');
        if (!button) return;
        var symbol = button.getAttribute('data-watch-remove');
        store.remove(symbol);
        delete figuresBySymbol[symbol];
        render();
    }

    function onToggleClick() {
        if (!offered) return;
        if (store.has(offered)) {
            store.remove(offered);
            delete figuresBySymbol[offered];
            render();
            return;
        }
        if (store.add(offered) !== 'added') {
            // Full, or a symbol that is not a ticker. Either way the note
            // already says so and the list is unchanged; re-rendering is what
            // makes the reason appear for a reader who pressed anyway.
            renderToggle();
            return;
        }
        fetchSymbol(offered);
        render();
    }

    /* ── The module's face to js/view-symbol.js ─────────────────── */

    function offer(symbol) {
        offered = typeof symbol === 'string' && symbol ? symbol : null;
        renderToggle();
    }

    function start() {
        // No watchlist markup, or a module that failed to load. The served
        // block says nothing has been added, which stays true either way.
        if (!panel || !rowsBody || !dom || !data || !figures || !storage) return;

        // localStorage is a property access that throws in a private window
        // and where site data is blocked, so it is read here, once, inside a
        // guard, and everything downstream is handed the result.
        var box = null;
        try {
            box = global.localStorage;
        } catch (error) {
            box = null;
        }
        store = storage.open(box);

        panel.addEventListener('click', onSortClick);
        rowsBody.addEventListener('click', onRowsClick);
        if (toggle) toggle.addEventListener('click', onToggleClick);

        // Rendered first, so the stored symbols are on screen as rows before
        // any of them has a price. The table fills in place rather than
        // appearing a row at a time under whatever the reader was reading.
        render();
        store.symbols().forEach(fetchSymbol);

        global.IncisorWatchlist = { offer: offer };
    }

    start();
})(typeof window !== 'undefined' ? window : this);
