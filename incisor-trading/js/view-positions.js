/* What the portfolio holds, and every trade that got it there.
 *
 * Two tables under the account summary. The holdings table is the portfolio
 * position by position — the summary says the reader is up $353.72, this says
 * which holding that came from. The trade log is the ledger itself, printed:
 * the record every figure on this tab is replayed from (DEC-082), so a reader
 * who does not believe a number can follow it back to the trades that made it.
 *
 * Built here rather than served (DEC-072), and both tables are written from
 * state the page already holds. Nothing here fetches: prices come from
 * js/view-portfolio.js, which owns the requests the Trade tab makes, so a
 * second surface showing the same holdings costs nothing upstream (DEC-032).
 *
 * Two tables and one module because they are one thing twice over — the same
 * store, the same redraw, and the log is where the holdings came from. The
 * curve is js/view-performance.js, which is separate because it fetches.
 *
 * Sorting is deliberately absent. The watchlist sorts because it is a list
 * the reader assembled and has to scan; a holdings table is short by
 * construction — six symbols may be in play (DEC-086) — and a trade log has
 * one true order, which is the order the trades happened in.
 *
 * Contract with the markup: a [data-positions] block and a [data-trade-log]
 * block, both empty until this runs.
 */

(function (global) {
    'use strict';

    var dom = global.IncisorDom;
    var figures = global.IncisorMarketFigures;
    var ledgerMath = global.IncisorPortfolioLedger;
    var portfolio = global.IncisorPortfolio;

    var positionsRoot = document.querySelector('[data-positions]');
    var logRoot = document.querySelector('[data-trade-log]');

    /* The trade log's newest entries, and a control for the rest.
     *
     * A ledger grows without bound and every row of it is in the DOM at once,
     * so the whole of a long history would be hundreds of rows under a table
     * nobody scrolled to. Twelve is about a screen on a phone; the button
     * shows the rest and says how many, rather than paginating something a
     * reader may genuinely want to read end to end. */
    var LOG_PREVIEW = 12;

    var eastern = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', month: 'short', day: 'numeric',
        year: 'numeric'
    });

    var nodes = {};
    var showingAll = false;

    function element(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    /* A cell. Every figure column is aligned in the stylesheet rather than by
     * a class per cell, the way .inc-watch-table does it: alignment is a
     * property of the column, and a class on the cell is the same rule
     * written once per row forever.
     *
     * `label` is the column's full name, carried on the cell so the stylesheet
     * can put it back when the header row goes. Below 560px these tables stop
     * being tables and become one block per row, because six money columns do
     * not fit a phone and the alternative was type small enough to win the
     * pixel count and lose the reader — on a page whose numbers are the
     * content (guide section 13). The label is the long spelling, not the
     * header's abbreviation: the row has the width for it once it is a block,
     * and DEC-074 only ever shortened a label to save a column.
     */
    function cell(tag, text, label) {
        var node = element(tag, null, text);
        if (tag === 'th') {
            node.scope = 'row';
            node.setAttribute('role', 'rowheader');
        } else {
            node.setAttribute('role', 'cell');
        }
        if (label) node.setAttribute('data-label', label);
        return node;
    }

    /* Every table role written out, at every width.
     *
     * `display: block` is what makes the mobile layout work, and it is also
     * what drops a table's implicit roles: a browser stops exposing a block
     * <table> as a table, and the rows and cells go with it. Stated explicitly
     * they survive the change, and at desktop each one matches the role the
     * element already had — so this costs nothing where the table is a table
     * and is the whole of the semantics where it is not.
     */
    function role(node, name) {
        node.setAttribute('role', name);
        return node;
    }

    function headerRow(labels) {
        var row = role(element('tr'), 'row');
        labels.forEach(function (label) {
            var head = role(element('th'), 'columnheader');
            head.scope = 'col';
            if (label.short) {
                // DEC-074: where the label is wider than every figure under
                // it the label shortens, never the data, and the accessible
                // name stays the long one. Both spellings ship.
                head.appendChild(element('span', 'inc-offscreen', label.text));
                var brief = element('span', null, label.short);
                brief.setAttribute('aria-hidden', 'true');
                head.appendChild(brief);
            } else {
                head.textContent = label.text;
            }
            row.appendChild(head);
        });
        return row;
    }

    function table(className, scrollClass, caption, labels) {
        var box = element('div', scrollClass);
        var node = role(element('table', className), 'table');
        node.appendChild(element('caption', 'inc-offscreen', caption));
        var thead = role(element('thead'), 'rowgroup');
        thead.appendChild(headerRow(labels));
        node.appendChild(thead);
        var body = role(element('tbody'), 'rowgroup');
        node.appendChild(body);
        box.appendChild(node);
        return { box: box, body: body };
    }

    /* A signed figure with its arrow, so direction survives grayscale and
     * colour blindness (guide section 13). */
    function gainCell(cents, percent, label) {
        var node = role(element('td'), 'cell');
        node.setAttribute('data-label', label);
        var arrow = element('span', 'inc-arrow');
        arrow.setAttribute('aria-hidden', 'true');
        var dollars = cents === null ? null : cents / 100;
        arrow.textContent = dollars === null ? '' : figures.arrowFor(dollars);
        node.appendChild(arrow);
        node.appendChild(element('span', null, figures.formatSignedMoney(dollars)));
        if (percent !== null && percent !== undefined) {
            node.appendChild(element('span', 'inc-positions-percent',
                figures.formatPercent(percent)));
        }
        dom.setDirection(node, figures.direction(dollars));
        return node;
    }

    /* ── Holdings ───────────────────────────────────────────────── */

    function buildHoldings() {
        var heading = element('h3', 'inc-section-heading', 'Holdings');
        heading.id = 'inc-positions-heading';

        var built = table('inc-positions', 'inc-positions-scroll',
            'Every position held, with what it cost and what it is worth now', [
            { text: 'Symbol' },
            { text: 'Shares' },
            { text: 'Average cost', short: 'Avg cost' },
            { text: 'Last price', short: 'Price' },
            { text: 'Market value', short: 'Value' },
            { text: 'Unrealized gain', short: 'Gain' }
        ]);
        nodes.holdings = built.body;
        nodes.holdingsBox = built.box;

        nodes.holdingsEmpty = element('p', 'inc-empty',
            'No shares held. A filled buy order puts its position here.');

        positionsRoot.appendChild(heading);
        positionsRoot.appendChild(nodes.holdingsEmpty);
        positionsRoot.appendChild(built.box);
    }

    function holdingRow(row) {
        var tr = role(element('tr'), 'row');
        tr.appendChild(cell('th', row.symbol));
        tr.appendChild(cell('td', String(row.shares), 'Shares'));
        tr.appendChild(cell('td', figures.formatMoney(row.averageCost),
            'Average cost'));
        tr.appendChild(cell('td', figures.formatMoney(row.price), 'Last price'));
        tr.appendChild(cell('td', row.marketValue === null
            ? figures.DASH : figures.formatMoney(row.marketValue / 100),
            'Market value'));
        tr.appendChild(gainCell(row.unrealized, row.unrealizedPercent,
            'Unrealized gain'));
        return tr;
    }

    function renderHoldings(value) {
        while (nodes.holdings.firstChild) {
            nodes.holdings.removeChild(nodes.holdings.firstChild);
        }
        value.rows.forEach(function (row) {
            nodes.holdings.appendChild(holdingRow(row));
        });
        nodes.holdingsBox.hidden = value.rows.length === 0;
        nodes.holdingsEmpty.hidden = value.rows.length > 0;
    }

    /* ── The trade log ──────────────────────────────────────────── */

    function buildLog() {
        var heading = element('h3', 'inc-section-heading', 'Trade log');
        heading.id = 'inc-log-heading';

        nodes.logNote = element('p', 'inc-panel-note', 'Every trade this '
            + 'portfolio has made, newest first. The figures above are '
            + 'replayed from this list each time the page opens — it is '
            + 'the record, not a copy of one.');

        var built = table('inc-trade-log', 'inc-log-scroll',
            'Every trade made, newest first', [
            { text: 'Date' },
            { text: 'Trade' },
            { text: 'Shares' },
            { text: 'Price' },
            { text: 'Amount' }
        ]);
        nodes.log = built.body;
        nodes.logBox = built.box;

        nodes.logEmpty = element('p', 'inc-empty',
            'No trades yet. The order ticket below opens the first one.');

        nodes.more = element('button', 'inc-log-more');
        nodes.more.type = 'button';
        nodes.more.setAttribute('data-track', 'trade-log-expand');
        nodes.more.hidden = true;

        logRoot.appendChild(heading);
        logRoot.appendChild(nodes.logNote);
        logRoot.appendChild(nodes.logEmpty);
        logRoot.appendChild(built.box);
        logRoot.appendChild(nodes.more);
    }

    function easternDay(iso) {
        var found = {};
        eastern.formatToParts(new Date(iso)).forEach(function (part) {
            found[part.type] = part.value;
        });
        return found.day + ' ' + found.month + ' ' + found.year;
    }

    function logRow(entry) {
        var tr = role(element('tr'), 'row');
        tr.appendChild(cell('th', easternDay(entry.at)));

        var what = role(element('td'), 'cell');
        what.setAttribute('data-label', 'Trade');
        what.appendChild(element('span', 'inc-log-kind',
            entry.kind === 'buy' ? 'Bought' : 'Sold'));
        what.appendChild(element('span', 'inc-log-symbol', entry.symbol));
        tr.appendChild(what);

        tr.appendChild(cell('td', String(entry.shares), 'Shares'));
        tr.appendChild(cell('td', figures.formatMoney(entry.price), 'Price'));
        // A buy leaves the account and a sell comes into it, so the sign is
        // the cash flow rather than a gain. Without it two rows reading
        // "$21,000.00" are the same figure doing opposite things.
        var amount = ledgerMath.amountFor(entry.shares, entry.price) / 100;
        tr.appendChild(cell('td', figures.formatSignedMoney(
            entry.kind === 'buy' ? -amount : amount), 'Amount'));
        return tr;
    }

    function moreText(hidden) {
        if (showingAll) return 'Show the 12 most recent only';
        return 'Show ' + hidden + (hidden === 1 ? ' older trade' : ' older trades');
    }

    function renderLog() {
        var ledger = portfolio.store().ledger().slice().reverse();
        var shown = showingAll ? ledger : ledger.slice(0, LOG_PREVIEW);

        while (nodes.log.firstChild) nodes.log.removeChild(nodes.log.firstChild);
        shown.forEach(function (entry) { nodes.log.appendChild(logRow(entry)); });

        nodes.logBox.hidden = ledger.length === 0;
        nodes.logNote.hidden = ledger.length === 0;
        nodes.logEmpty.hidden = ledger.length > 0;

        var hidden = ledger.length - shown.length;
        nodes.more.hidden = hidden === 0 && !showingAll;
        nodes.more.textContent = moreText(hidden);
        nodes.more.setAttribute('aria-expanded', showingAll ? 'true' : 'false');
    }

    /* ── Wiring ─────────────────────────────────────────────────── */

    function render() {
        var store = portfolio.store();
        renderHoldings(ledgerMath.valuation(store.state(), portfolio.prices()));
        renderLog();
    }

    function onMoreClick() {
        showingAll = !showingAll;
        renderLog();
        // Focus stays on the button, which has just changed its own label —
        // moving it into the rows would leave a screen reader somewhere it
        // did not ask to be.
        nodes.more.focus();
    }

    function start() {
        // No roots, or a module that failed to load: the panel keeps whatever
        // the document served, which claims nothing about a portfolio.
        if (!positionsRoot || !logRoot || !dom || !figures || !ledgerMath
                || !portfolio || !portfolio.store()) {
            return;
        }

        buildHoldings();
        buildLog();
        nodes.more.addEventListener('click', onMoreClick);
        portfolio.onChange(render);
        render();
    }

    start();
})(typeof window !== 'undefined' ? window : this);
