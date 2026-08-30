/* The price chart: a line of daily closes over a chosen range.
 *
 * Driven rather than self-starting, which makes it the odd one out among the
 * view modules. js/view-index-strip.js and js/view-symbol.js each own a
 * request; this one owns none. The series it draws is the same /history
 * payload the quote panel already has in hand, so the panel hands it over and
 * the chart costs nothing upstream — see the note on ranges in
 * js/chart-geometry.js.
 *
 * The arithmetic is js/chart-geometry.js, the formatting is
 * js/market-figures.js and the drawing is js/chart-canvas.js. Nothing here
 * computes a coordinate, formats a number or appends a node: it decides what
 * goes on screen and what the card says about it, which is what lets the whole
 * thing be driven from a DOM stub with no browser (tests/chart_model.jxa.js).
 *
 * Contract with the markup: a [data-chart] figure whose data-state is one of
 * empty / ready / unavailable, holding [data-chart-symbol] and
 * [data-chart-proxy] in its head, [data-chart-range] buttons, a
 * [data-chart-plot] box containing [data-chart-canvas] and [data-chart-marks],
 * the [data-chart-scale] and [data-chart-dates] label lists, a
 * [data-chart-readout], and a [data-chart-table] holding [data-chart-rows].
 *
 * Exposes window.IncisorPriceChart for js/view-symbol.js to call.
 */

(function (global) {
    'use strict';

    var dom = window.IncisorDom;
    var figures = window.IncisorMarketFigures;
    var geometry = window.IncisorChartGeometry;

    /* ── State ──────────────────────────────────────────────────── */

    var symbol = '';
    var isProxy = false;
    var series = [];
    var activeRange = geometry ? geometry.DEFAULT_RANGE : '6M';

    var visible = [];
    var shape = null;
    var cursor = null;

    /* The label the markup ships with, read once so a cleared chart can go
     * back to it. Without it a failed lookup keeps the last window's name over
     * a plot that no longer draws that window — or any other. */
    var restingLabel = '';

    /* The table is the accessible fallback and it can run to a thousand rows,
     * so it is built when it is opened rather than on every redraw. This is
     * what says the built rows no longer match the range on screen. */
    var tableStale = true;

    /* ── Elements ───────────────────────────────────────────────── */

    var chart = document.querySelector('[data-chart]');
    var plot = chart && chart.querySelector('[data-chart-plot]');
    var canvas = chart && chart.querySelector('[data-chart-canvas]');
    var marks = chart && chart.querySelector('[data-chart-marks]');
    var scale = chart && chart.querySelector('[data-chart-scale]');
    var dates = chart && chart.querySelector('[data-chart-dates]');
    var table = chart && chart.querySelector('[data-chart-table]');
    var ticker = chart && chart.querySelector('[data-chart-symbol]');
    var badge = chart && chart.querySelector('[data-chart-proxy]');

    /* The drawing surface, built in start() once every element it writes to
     * is known to be there. */
    var picture = null;
    var rows = chart && chart.querySelector('[data-chart-rows]');

    /* ── Words ──────────────────────────────────────────────────── */

    function fill(selector, value) {
        dom.fill(chart, selector, value);
    }

    /* Range buttons with nothing to change.
     *
     * A press still moves aria-pressed and redraws nothing when there is no
     * series behind them, which is a control saying it did something it did
     * not. They stay in place rather than disappearing, so the card keeps its
     * shape while the message explains itself.
     */
    function setRangesEnabled(enabled) {
        Array.prototype.forEach.call(
            chart.querySelectorAll('[data-chart-range]'), function (button) {
                button.disabled = !enabled;
            });
    }

    /* Which symbol this is a chart of.
     *
     * The plot's aria-label has said so since T8 and nothing on screen has:
     * the card carries a price, a date and the largest coloured figure on the
     * page, and on a phone the panel that names the symbol is a scroll away.
     * The badge follows the same rule the tile and the panel follow — a proxy
     * is labelled wherever it appears.
     */
    function renderIdentity(showing) {
        if (ticker) {
            ticker.textContent = showing ? symbol : '';
            ticker.hidden = !(showing && symbol);
        }
        if (badge) badge.hidden = !(showing && symbol && isProxy);
    }

    /* What the range moved, in the head. Coloured, unlike the line itself:
     * this is a labelled figure with its own period named beside it, so it
     * cannot be read as contradicting the one-day change above the chart. */
    function renderPeriod(range) {
        fill('[data-chart-period-label]', periodLabel(range));
        fill('[data-chart-period-arrow]', figures.arrowFor(shape.change));
        fill('[data-chart-period-delta]', figures.formatSigned(shape.change));
        fill('[data-chart-period-pct]',
            figures.formatPercent(shape.changePercent));
        dom.setDirection(chart.querySelector('[data-chart-period]'),
            figures.direction(shape.change));
    }

    /* The window the reader is actually looking at, which is not always the
     * one the pressed button names. In fixture mode the committed series is a
     * year long, so 5Y draws one year — and a heading reading "over five
     * years" above it would be a claim the reader has no way to check. */
    function periodLabel(range) {
        if (visible.length >= range.sessions) return 'Over ' + range.label;
        return 'Over the ' + visible.length + ' sessions held';
    }

    /* One day, in the line under the chart. Shows the last close when nothing
     * is being pointed at, so the readout is never an empty row taking up
     * space and never a row that appears and moves the page. */
    function renderReadout(index) {
        var point = shape.points[index];
        var bar = point.bar;
        var previous = index > 0 ? shape.points[index - 1].bar : null;
        var change = previous ? bar.close - previous.close : null;
        var percent = previous && previous.close !== 0
            ? (change / previous.close) * 100 : null;

        fill('[data-chart-readout-date]', figures.formatBarDate(bar.date));
        fill('[data-chart-readout-price]', figures.formatPrice(bar.close));
        fill('[data-chart-readout-arrow]', figures.arrowFor(change));
        fill('[data-chart-readout-delta]', figures.formatSigned(change));
        fill('[data-chart-readout-pct]', figures.formatPercent(percent));
        dom.setDirection(chart.querySelector('[data-chart-readout-change]'),
            figures.direction(change));
    }

    /* The chart in a sentence, because a picture is the one part of this a
     * screen reader cannot read. The table below it holds the numbers; this
     * holds the shape. */
    function describe(range) {
        var way = figures.direction(shape.change);
        var moved = way === 'flat' || shape.changePercent === null
            ? 'unchanged over the period'
            : way + ' ' + figures.formatPrice(Math.abs(shape.changePercent))
                + ' percent over the period';
        return symbol + ' closing prices, ' + periodLabel(range).toLowerCase()
            + '. ' + visible.length + ' sessions from '
            + figures.formatBarDate(visible[0].date) + ' to '
            + figures.formatBarDate(visible[visible.length - 1].date)
            + ', low ' + figures.formatPrice(shape.low)
            + ', high ' + figures.formatPrice(shape.high) + ', ' + moved + '.';
    }

    /* Said out loud only when the button and the picture disagree. The axis
     * shows the dates either way, but a reader who trusts the button and does
     * not read the axis would otherwise be misled by a shorter series than
     * the one they asked for. */
    function renderShortfall(range, complete) {
        var note = chart.querySelector('[data-chart-shortfall]');
        if (!note) return;
        note.hidden = complete;
        note.textContent = complete ? '' : range.key + ' is the whole series '
            + 'held for ' + symbol + ' — ' + visible.length + ' sessions — '
            + 'rather than ' + range.label + '.';
    }

    /* ── The fallback table ─────────────────────────────────────── */

    function cell(tag, text) {
        var node = document.createElement(tag);
        node.textContent = text;
        return node;
    }

    /* The date leads each row and names it, so it is a header scoped to that
     * row rather than a sixth column of figures. */
    function rowHeader(text) {
        var head = cell('th', text);
        head.setAttribute('scope', 'row');
        return head;
    }

    /* Every bar in the window, as a real table.
     *
     * Built on open rather than on every redraw: a five-year window is over a
     * thousand rows, and rebuilding those each time somebody changes range
     * would be a cost paid by everybody to serve the readers who open this.
     */
    function buildTable() {
        dom.empty(rows);
        visible.forEach(function (bar) {
            var row = document.createElement('tr');
            row.appendChild(rowHeader(figures.formatBarDate(bar.date)));
            row.appendChild(cell('td', figures.formatPrice(bar.open)));
            row.appendChild(cell('td', figures.formatPrice(bar.high)));
            row.appendChild(cell('td', figures.formatPrice(bar.low)));
            row.appendChild(cell('td', figures.formatPrice(bar.close)));
            row.appendChild(cell('td', figures.formatVolume(bar.volume)));
            rows.appendChild(row);
        });
        tableStale = false;
    }

    function refreshTable() {
        tableStale = true;
        if (table && table.open) buildTable();
    }

    /* ── The cursor ─────────────────────────────────────────────── */

    function setCursor(index) {
        cursor = index;
        var at = index === null ? shape.points.length - 1 : index;
        renderReadout(at);

        plot.setAttribute('data-chart-tracking',
            index === null ? 'false' : 'true');
        picture.cursorTo(shape.points[at]);
    }

    function moveCursor(step) {
        var from = cursor === null ? shape.points.length - 1 : cursor;
        var to = Math.max(0, Math.min(shape.points.length - 1, from + step));
        setCursor(to);
    }

    /* ── Rendering ──────────────────────────────────────────────── */

    function render() {
        var range = geometry.rangeFor(activeRange);
        var picked = geometry.windowFor(series, range.sessions);
        visible = picked.bars;
        shape = geometry.plot(visible, picture.WIDTH, picture.HEIGHT,
            picture.PADDING);

        if (!shape) {
            unavailable(symbol);
            return;
        }

        picture.draw(shape, visible);
        renderIdentity(true);
        setRangesEnabled(true);
        renderPeriod(range);
        renderShortfall(range, picked.complete);
        plot.setAttribute('aria-label', describe(range));
        setCursor(null);
        refreshTable();
        chart.setAttribute('data-state', 'ready');
    }

    function setRange(key) {
        if (!geometry.rangeFor(key)) return;
        activeRange = key;
        Array.prototype.forEach.call(
            chart.querySelectorAll('[data-chart-range]'), function (button) {
                button.setAttribute('aria-pressed',
                    button.getAttribute('data-chart-range') === key
                        ? 'true' : 'false');
            });
        if (series.length > 0) render();
    }

    /* Back to having nothing to draw. The markup's own empty state is the
     * truth again, so the plot is cleared rather than left showing the last
     * symbol under the name of the next one. */
    function blank(state, message) {
        series = [];
        visible = [];
        shape = null;
        cursor = null;
        picture.clear();
        if (rows) dom.empty(rows);
        // Hidden here rather than styled out with the rest of the ready-state
        // furniture: it is a claim about a series that is no longer loaded,
        // and a stale one would outlive the chart it described.
        renderShortfall(null, true);
        // The head described a window of a series that is no longer loaded.
        // Cleared rather than left standing: the message below it names the
        // symbol, and a stale "over six months" above that names nothing.
        renderIdentity(false);
        setRangesEnabled(false);
        fill('[data-chart-period-label]', restingLabel);
        plot.setAttribute('aria-label', message);
        fill('[data-chart-message]', message);
        chart.setAttribute('data-state', state);
    }

    /* ── The API js/view-symbol.js drives ───────────────────────── */

    function show(name, bars, tracksAnIndex) {
        if (!Array.isArray(bars) || bars.length === 0) {
            unavailable(name);
            return;
        }
        symbol = name;
        isProxy = !!tracksAnIndex;
        series = bars;
        render();
    }

    /* The quote arrived and the series did not. The panel above still has a
     * price to show, so this says what is missing rather than the whole
     * lookup failing — and says it in the chart's own space, so the panel
     * does not change height. */
    function unavailable(name) {
        symbol = name || '';
        blank('unavailable', 'No price history for ' + (name || 'this symbol')
            + '. The chart needs a daily series, and that request did not '
            + 'come back.');
    }

    function reset() {
        symbol = '';
        blank('empty', 'No symbol looked up yet. The chart fills in once you '
            + 'search for one above.');
    }

    /* ── Wiring ─────────────────────────────────────────────────── */

    function onRangeClick(event) {
        var button = event.target.closest('[data-chart-range]');
        if (button) setRange(button.getAttribute('data-chart-range'));
    }

    function readPointer(event) {
        if (!shape) return;
        var box = plot.getBoundingClientRect();
        if (!box || !(box.width > 0)) return;
        var x = ((event.clientX - box.left) / box.width) * picture.WIDTH;
        var index = geometry.indexAtX(x, picture.WIDTH, shape.points.length);
        if (index >= 0 && index !== cursor) setCursor(index);
    }

    /* A finger down is a reading taken, which a move alone is not: a tap
     * never moves far enough to fire one, so without this the whole gesture
     * a phone has produced nothing at all. */
    function onPointerDown(event) {
        readPointer(event);
    }

    function onPointerMove(event) {
        readPointer(event);
    }

    /* A finger lifted is not a pointer moved away.
     *
     * The reading stays for a touch reader, because on a phone the finger is
     * over the chart and the readout is under it — clearing on lift throws
     * the answer away at the moment they look for it. A mouse leaving the
     * plot means they have finished with it, and a blur passes no pointer at
     * all, so both still put the cursor away.
     */
    function onPointerLeave(event) {
        if (event && event.pointerType === 'touch') return;
        if (shape) setCursor(null);
    }

    /* The gesture turned out to be a scroll rather than a read — the plot
     * allows vertical panning over itself — so the reading it took on the way
     * is withdrawn rather than left standing. */
    function onPointerCancel() {
        if (shape) setCursor(null);
    }

    /* The keyboard path to the same readout the pointer gives.
     *
     * The plot is one tab stop and the arrows walk the series, which is the
     * only way somebody who cannot use a pointer reads an individual day off
     * the picture. The table below is the other half of that answer, for a
     * reader who wants the numbers rather than the shape.
     */
    function onKeydown(event) {
        if (!shape) return;
        switch (event.key) {
            case 'ArrowLeft':
                event.preventDefault();
                moveCursor(-1);
                return;
            case 'ArrowRight':
                event.preventDefault();
                moveCursor(1);
                return;
            case 'Home':
                event.preventDefault();
                setCursor(0);
                return;
            case 'End':
                event.preventDefault();
                setCursor(shape.points.length - 1);
                return;
            case 'Escape':
                if (cursor === null) return;
                event.preventDefault();
                setCursor(null);
                return;
            default:
                return;
        }
    }

    function onTableToggle() {
        if (table.open && tableStale && visible.length > 0) buildTable();
    }

    function start() {
        // Nothing to drive, or a module that failed to load. The served markup
        // is an empty chart saying nothing has been looked up, which stays
        // true either way.
        if (!chart || !plot || !canvas || !marks || !scale || !dates) return;
        if (!dom || !figures || !geometry || !window.IncisorChartCanvas) return;

        picture = window.IncisorChartCanvas.create({
            canvas: canvas, marks: marks, scale: scale, dates: dates
        }, document);

        var label = chart.querySelector('[data-chart-period-label]');
        restingLabel = label ? label.textContent : '';

        var buttons = chart.querySelector('[data-chart-ranges]');
        if (buttons) buttons.addEventListener('click', onRangeClick);

        plot.addEventListener('pointerdown', onPointerDown);
        plot.addEventListener('pointermove', onPointerMove);
        plot.addEventListener('pointerleave', onPointerLeave);
        plot.addEventListener('pointercancel', onPointerCancel);
        plot.addEventListener('keydown', onKeydown);
        plot.addEventListener('blur', onPointerLeave);
        if (table) table.addEventListener('toggle', onTableToggle);

        setRange(activeRange);

        global.IncisorPriceChart = {
            show: show,
            unavailable: unavailable,
            reset: reset
        };
    }

    start();
})(typeof window !== 'undefined' ? window : this);
