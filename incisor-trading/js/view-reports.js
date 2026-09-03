/* The reporting calendar: when the company reports, and what it reported.
 *
 * The second surface fed by GET /fundamentals and it costs nothing extra —
 * the filings panel above already paid for that payload, and this asks a
 * different question of the same answer. One fetch, two surfaces.
 *
 * **What it deliberately does not show, and why the shape is what it is.**
 * The obvious version of this names a scheduled earnings date, a consensus
 * estimate and the surprise against it. None of the three is available here:
 * EDGAR knows when a report was filed and never when the next one will be,
 * and a consensus is an analyst product this project does not buy (guide §1
 * rules analyst targets out as a non-goal). So:
 *
 *   - the next report is a **window projected from the company's own filing
 *     rhythm**, labelled projected, with the arithmetic behind it on screen;
 *   - the surprise is replaced by **the same quarter a year earlier**, which
 *     is a fact from the filings rather than a fact about analysts — and is
 *     the better comparison anyway, since earnings are seasonal;
 *   - the dividend column is what was **declared for a quarter**, because the
 *     ex-dividend date is not in a filing. The copy downstairs says so.
 *
 * The one figure carrying direction colour is the year-ago change, and it
 * carries an arrow and an explicit sign with it. Its window is named once in
 * the column header rather than once per row — the watchlist settled that,
 * and four repeats of "1y" down a table is noise.
 *
 * Contract with the markup: a [data-reports] block whose data-state is one of
 * empty / loading / ready / fund / unavailable, holding [data-reports-figure]
 * and [data-reports-note] spans and a [data-reports-rows] table body.
 *
 * Exposes window.IncisorReports for js/view-symbol.js to drive.
 */

(function (global) {
    'use strict';

    var dom = global.IncisorDom;
    var data = global.IncisorMarketData;
    var figures = global.IncisorMarketFigures;

    var panel = document.querySelector('[data-reports]');
    var body = panel && panel.querySelector('[data-reports-body]');
    var rows = panel && panel.querySelector('[data-reports-rows]');

    /* Which symbol is on screen, so a slow answer for one the reader has
     * moved on from is dropped rather than overwriting the one they are
     * looking at. The same guard every view here keeps. */
    var showing = null;

    function setState(state) {
        panel.setAttribute('data-state', state);
        if (body) body.hidden = state !== 'ready';
    }

    function say(message) {
        dom.fill(panel, '[data-reports-message]', message);
    }

    function nameSymbol(symbol) {
        var slot = panel.querySelector('[data-reports-symbol]');
        if (!slot) return;
        slot.textContent = symbol || '';
        slot.hidden = !symbol;
    }

    function setFigure(name, value, note) {
        dom.fill(panel, '[data-reports-figure="' + name + '"]', value);
        dom.fill(panel, '[data-reports-note="' + name + '"]', note || '');
    }

    function cell(tag, className) {
        var node = document.createElement(tag);
        node.className = className;
        return node;
    }

    /* ── The lead pair ──────────────────────────────────────────── */

    /* How long this company takes to report, in a phrase.
     *
     * Singular and plural spelled out rather than "day(s)", because a figure
     * this surface asks the reader to reason with is worth a sentence that
     * reads properly. */
    function lagPhrase(days) {
        if (days === null || days === undefined) return '';
        return days === 1 ? '1 day after the close'
            : days + ' days after the close';
    }

    function renderLast(last) {
        if (!last) return;
        var opening = last.form
            ? 'A ' + last.form + ' for the quarter ending '
            : 'For the quarter ending ';
        var parts = [];
        if (last.end) parts.push(opening + figures.formatBarDate(last.end));
        var lag = lagPhrase(last.lagDays);
        if (lag) parts.push('filed ' + lag);
        setFigure('last', figures.formatBarDate(last.filed),
            parts.join(', ') + '.');
    }

    /* The projected window, and the arithmetic that produced it.
     *
     * The note is not decoration. A date on a page is read as a date the
     * company gave, and this one was worked out here from eight public
     * filings — so what it was worked out from is stated beside it, and the
     * word "projected" sits in the label rather than in the small print. */
    function renderNext(next) {
        if (!next) {
            setFigure('next', figures.DASH,
                'Not enough filing history to describe a pattern, so nothing '
                + 'is projected. One report is not a rhythm.');
            return;
        }
        setFigure('next',
            figures.formatBarDate(next.earliest) + ' – '
                + figures.formatBarDate(next.latest),
            'Projected here, not announced. Its quarters run about '
                + next.cadenceDays + ' days apart, and its last '
                + next.basisReports + ' reports were filed '
                + next.lagMin + ' to ' + next.lagMax
                + ' days after a quarter closed. Companies set their own date '
                + 'and can move it.');
    }

    /* ── The table ──────────────────────────────────────────────── */

    /* The year-ago comparison, built the way every directional figure on this
     * page is built: an arrow, an explicitly signed percentage and a colour,
     * so the direction survives greyscale and colour blindness (§13).
     *
     * An absent comparison is an em dash and not a zero. A quarter with no
     * matching quarter behind it — the oldest one a filer has, or one either
     * side of a missed filing — has no change, and a 0.0% would state that it
     * earned the same. */
    function changeCell(quarter) {
        var wrapper = cell('td', 'inc-reports-change');
        if (quarter.epsChange === null || quarter.epsChange === undefined) {
            wrapper.textContent = figures.DASH;
            return wrapper;
        }

        var line = cell('p', 'inc-reports-delta');
        var arrow = cell('span', 'inc-arrow');
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = figures.arrowFor(quarter.epsChange);
        line.appendChild(arrow);

        var percent = cell('span', 'inc-delta-pct');
        percent.textContent = figures.formatPercent(quarter.epsChange * 100);
        line.appendChild(percent);

        var from = cell('span', 'inc-reports-from');
        from.textContent = 'from ' + figures.formatPrice(quarter.epsYearAgo);
        line.appendChild(from);

        dom.setDirection(line, figures.direction(quarter.epsChange));
        wrapper.appendChild(line);
        return wrapper;
    }

    /* A date in both spellings, with css/reports.css showing one.
     *
     * Five columns of dates and figures do not fit 390px at the full
     * spelling, and the two ways out of that are both worse: scrolling puts
     * the dividend column off the side of a phone, where a reader has no
     * reason to think there is one, and dropping a column loses a fact
     * outright. Two spellings and a media query keeps every column at every
     * width, which is what the watchlist manages with five of its own.
     *
     * The hidden one is `display: none` rather than off-screen text, so a
     * screen reader is read one date and not the same date twice. */
    function dateInto(node, iso) {
        var full = cell('span', 'inc-reports-date-full');
        full.textContent = figures.formatBarDate(iso);
        node.appendChild(full);

        var short = cell('span', 'inc-reports-date-short');
        short.textContent = figures.formatShortBarDate(iso);
        node.appendChild(short);
        return node;
    }

    function buildRow(quarter) {
        var tr = document.createElement('tr');
        tr.className = 'inc-reports-row';

        var head = cell('th', 'inc-reports-period');
        head.setAttribute('scope', 'row');
        dateInto(head, quarter.end);
        tr.appendChild(head);

        tr.appendChild(dateInto(cell('td', 'inc-reports-filed'),
            quarter.filed));

        var eps = cell('td', 'inc-reports-eps');
        eps.textContent = figures.formatPrice(quarter.eps);
        tr.appendChild(eps);

        tr.appendChild(changeCell(quarter));

        var dividend = cell('td', 'inc-reports-dividend');
        dividend.textContent = figures.formatPrice(quarter.dividend);
        tr.appendChild(dividend);
        return tr;
    }

    function renderRows(quarters) {
        dom.empty(rows);
        for (var index = 0; index < quarters.length; index++) {
            rows.appendChild(buildRow(quarters[index]));
        }
    }

    /* ── Provenance ─────────────────────────────────────────────── */

    /* Worded for filings rather than for prices, like the panel above it. In
     * fixture mode every figure here is invented and the page has to say so;
     * that is the field this line exists for (guide §10). */
    function renderProvenance(envelope) {
        var line = panel.querySelector('[data-reports-provenance]');
        if (!line) return;

        if (!envelope) {
            line.setAttribute('data-provenance-state', 'error');
            dom.fill(line, '[data-reports-provenance-message]',
                'Filing dates unavailable. The service could not be reached.');
            return;
        }

        var sample = envelope.source === 'fixture';
        line.setAttribute('data-provenance-state', sample ? 'sample' : 'live');
        dom.fill(line, '[data-reports-provenance-message]', sample
            ? 'Sample data · invented filings, not real reports or dates.'
            : (envelope.stale
                ? 'Filing dates from SEC EDGAR · last refreshed some time ago.'
                : 'Filing dates from SEC EDGAR.'));
    }

    /* ── Rendering ──────────────────────────────────────────────── */

    function blank() {
        setFigure('last', figures.DASH, '');
        setFigure('next', figures.DASH, '');
        dom.empty(rows);
    }

    function render(symbol, envelope) {
        blank();
        nameSymbol(symbol);

        if (!envelope.reporting) {
            // Every ETF on this page lands here and it is the ordinary
            // answer, not a failure. A fund files no quarterly report, so
            // there is no calendar to show and no table to leave empty.
            setState('fund');
            say('No company files for ' + symbol + ', so there is no '
                + 'reporting calendar. A fund holds shares in companies that '
                + 'each report on their own schedule.');
            renderProvenance(envelope);
            return;
        }

        renderLast(envelope.reporting.last);
        renderNext(envelope.reporting.next);
        renderRows(envelope.reporting.quarters);
        setState('ready');
        say('What ' + symbol + ' has reported, and when it filed each one.');
        renderProvenance(envelope);
    }

    /* ── The API js/view-symbol.js drives ───────────────────────── */

    function show(symbol) {
        showing = symbol;
        blank();
        nameSymbol(symbol);
        setState('loading');
        say('Reading when ' + symbol + ' last reported…');

        data.fundamentals(symbol).then(function (envelope) {
            if (showing !== symbol) return;
            render(symbol, envelope);
        }, function () {
            if (showing !== symbol) return;
            blank();
            setState('unavailable');
            say('The filing dates for ' + symbol + ' could not be loaded. The '
                + 'prices above are unaffected — they come from a different '
                + 'service.');
            renderProvenance(null);
        });
    }

    function reset() {
        showing = null;
        blank();
        setState('empty');
        nameSymbol(null);
        say('Look up a symbol above to see when it last reported.');
    }

    function start() {
        if (!panel || !body || !rows) return;
        if (!dom || !data || !figures) return;
        global.IncisorReports = { show: show, reset: reset };
    }

    start();
})(typeof window !== 'undefined' ? window : this);
