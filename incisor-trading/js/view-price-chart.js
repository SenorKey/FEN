/* The price chart: a line of daily closes over a chosen range.
 *
 * Driven rather than self-starting, which makes it the odd one out among the
 * view modules. js/view-index-strip.js and js/view-symbol.js each own a
 * request; this one owns none. The series it draws is the same /history
 * payload the quote panel already has in hand, so the panel hands it over and
 * the chart costs nothing upstream — see the note on ranges in
 * js/chart-geometry.js.
 *
 * The arithmetic is js/chart-geometry.js and the formatting is
 * js/market-figures.js. Nothing here computes a coordinate or a number; it
 * decides what goes on screen, which is what lets the whole thing be driven
 * from a DOM stub with no browser (tests/chart_model.jxa.js).
 *
 * Two things are drawn as HTML over the SVG rather than inside it: the axis
 * labels and the round markers. The plot is stretched to its container with
 * preserveAspectRatio="none", so a circle in that coordinate system comes out
 * an ellipse and text comes out smeared — while an HTML element positioned at
 * a percentage lands in exactly the same place and stays itself. Straight
 * lines are unaffected, so those stay in the SVG where they belong.
 *
 * Contract with the markup: a [data-chart] figure whose data-state is one of
 * empty / ready / unavailable, holding [data-chart-range] buttons, a
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

    var SVG_NS = 'http://www.w3.org/2000/svg';

    /* Drawing units, matched to the viewBox in the markup. Not pixels: the
     * plot is stretched to whatever width it lands in, and the height is set
     * in CSS, so these only ever set proportions. */
    var VIEW_WIDTH = 720;
    var VIEW_HEIGHT = 240;
    var VIEW_PADDING = 10;

    /* Six rather than four. The 1/2/2.5/5/10 step family jumps hard, so
     * asking for four levels across a typical price band rounds the step up
     * far enough to land only two labels on the axis — and two labels is a
     * scale a reader has to interpolate rather than read. */
    var PRICE_TICKS = 6;
    var DATE_TICKS = 4;

    /* At or below this many sessions the line is sparse enough that the
     * individual closes are the point, so each one gets a marker. Above it
     * they would merge into a thicker line and say nothing. */
    var DOT_LIMIT = 12;

    /* ── State ──────────────────────────────────────────────────── */

    var symbol = '';
    var series = [];
    var activeRange = geometry ? geometry.DEFAULT_RANGE : '6M';

    var visible = [];
    var shape = null;
    var cursor = null;

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
    var rows = chart && chart.querySelector('[data-chart-rows]');

    /* ── Drawing ────────────────────────────────────────────────── */

    function svgNode(tag, className) {
        var node = document.createElementNS(SVG_NS, tag);
        node.setAttribute('class', className);
        return node;
    }

    /* Positions an absolutely placed label or marker.
     *
     * Written as custom properties through the CSSOM rather than as a style
     * attribute, the way the range markers already are: a strict
     * Content-Security-Policy (T13) blocks the attribute and not this, and it
     * keeps the arithmetic here and the drawing in the stylesheet.
     */
    function place(node, x, y) {
        if (x !== null) {
            node.style.setProperty('--inc-chart-x',
                ((x / VIEW_WIDTH) * 100).toFixed(3) + '%');
        }
        if (y !== null) {
            node.style.setProperty('--inc-chart-y',
                ((y / VIEW_HEIGHT) * 100).toFixed(3) + '%');
        }
    }

    function drawGridline(y) {
        var line = svgNode('line', 'inc-chart-grid');
        line.setAttribute('x1', '0');
        line.setAttribute('x2', String(VIEW_WIDTH));
        line.setAttribute('y1', String(y));
        line.setAttribute('y2', String(y));
        canvas.appendChild(line);
    }

    function drawPath(tag, className, d) {
        var node = svgNode(tag, className);
        node.setAttribute('d', d);
        canvas.appendChild(node);
    }

    /* The level the window opened at, dashed, exactly as the tile sparklines
     * draw it. It is what says whether the range ended above or below where it
     * started without the line having to be coloured to say so — see the note
     * in css/market.css about why direction colour stays off both. */
    function drawBaseline(y) {
        var line = svgNode('line', 'inc-chart-base');
        line.setAttribute('x1', '0');
        line.setAttribute('x2', String(VIEW_WIDTH));
        line.setAttribute('y1', String(y));
        line.setAttribute('y2', String(y));
        canvas.appendChild(line);
    }

    function drawCursorLine() {
        var line = svgNode('line', 'inc-chart-cursor-line');
        line.setAttribute('y1', '0');
        line.setAttribute('y2', String(VIEW_HEIGHT));
        line.setAttribute('x1', '0');
        line.setAttribute('x2', '0');
        line.setAttribute('data-chart-cursor-line', '');
        canvas.appendChild(line);
    }

    function marker(className) {
        var dot = document.createElement('span');
        dot.className = className;
        marks.appendChild(dot);
        return dot;
    }

    function drawPlot() {
        dom.empty(canvas);
        dom.empty(marks);

        var ticks = geometry.priceTicks(shape.low, shape.high, PRICE_TICKS);
        ticks.values.forEach(function (value) {
            drawGridline(shape.yForPrice(value));
        });

        if (shape.area) drawPath('path', 'inc-chart-area', shape.area);
        drawBaseline(shape.baselineY);
        if (shape.path) drawPath('path', 'inc-chart-line', shape.path);

        if (shape.points.length <= DOT_LIMIT) {
            shape.points.forEach(function (point) {
                place(marker('inc-chart-dot'), point.x, point.y);
            });
        }

        drawCursorLine();
        marker('inc-chart-cursor-dot').setAttribute('data-chart-cursor-dot', '');
        return ticks;
    }

    /* ── Axis labels ────────────────────────────────────────────── */

    function drawScale(ticks) {
        dom.empty(scale);
        ticks.values.forEach(function (value) {
            var label = document.createElement('li');
            label.className = 'inc-chart-scale-label';
            label.textContent = figures.formatToPlaces(value, ticks.decimals);
            place(label, null, shape.yForPrice(value));
            scale.appendChild(label);
        });
    }

    function drawDates() {
        dom.empty(dates);
        var withYear = geometry.usesYearLabels(visible);
        var ticks = geometry.dateTicks(visible, DATE_TICKS);

        ticks.forEach(function (tick, index) {
            var label = document.createElement('li');
            label.className = 'inc-chart-date-label';
            label.textContent = figures.formatAxisDate(tick.date, withYear);
            // The first and last labels are pinned to the ends rather than
            // centred on their own tick, which would hang half of each one
            // off the side of the plot.
            label.setAttribute('data-chart-edge',
                index === 0 ? 'start'
                    : (index === ticks.length - 1 ? 'end' : 'middle'));
            place(label, shape.points[tick.index].x, null);
            dates.appendChild(label);
        });
    }

    /* ── Words ──────────────────────────────────────────────────── */

    function fill(selector, value) {
        dom.fill(chart, selector, value);
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

        var line = canvas.querySelector('[data-chart-cursor-line]');
        var dot = marks.querySelector('[data-chart-cursor-dot]');
        var showing = index !== null;
        plot.setAttribute('data-chart-tracking', showing ? 'true' : 'false');
        if (!line || !dot) return;

        var point = shape.points[at];
        line.setAttribute('x1', String(point.x));
        line.setAttribute('x2', String(point.x));
        place(dot, point.x, point.y);
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
        shape = geometry.plot(visible, VIEW_WIDTH, VIEW_HEIGHT, VIEW_PADDING);

        if (!shape) {
            unavailable(symbol);
            return;
        }

        var ticks = drawPlot();
        drawScale(ticks);
        drawDates();
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
        dom.empty(canvas);
        dom.empty(marks);
        dom.empty(scale);
        dom.empty(dates);
        if (rows) dom.empty(rows);
        // Hidden here rather than styled out with the rest of the ready-state
        // furniture: it is a claim about a series that is no longer loaded,
        // and a stale one would outlive the chart it described.
        renderShortfall(null, true);
        plot.setAttribute('aria-label', message);
        fill('[data-chart-message]', message);
        chart.setAttribute('data-state', state);
    }

    /* ── The API js/view-symbol.js drives ───────────────────────── */

    function show(ticker, bars) {
        if (!Array.isArray(bars) || bars.length === 0) {
            unavailable(ticker);
            return;
        }
        symbol = ticker;
        series = bars;
        render();
    }

    /* The quote arrived and the series did not. The panel above still has a
     * price to show, so this says what is missing rather than the whole
     * lookup failing — and says it in the chart's own space, so the panel
     * does not change height. */
    function unavailable(ticker) {
        symbol = ticker || '';
        blank('unavailable', 'No price history for ' + (ticker || 'this symbol')
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

    function onPointerMove(event) {
        if (!shape) return;
        var box = plot.getBoundingClientRect();
        if (!box || !(box.width > 0)) return;
        var x = ((event.clientX - box.left) / box.width) * VIEW_WIDTH;
        var index = geometry.indexAtX(x, VIEW_WIDTH, shape.points.length);
        if (index >= 0 && index !== cursor) setCursor(index);
    }

    function onPointerLeave() {
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
        if (!dom || !figures || !geometry) return;

        var buttons = chart.querySelector('[data-chart-ranges]');
        if (buttons) buttons.addEventListener('click', onRangeClick);

        plot.addEventListener('pointermove', onPointerMove);
        plot.addEventListener('pointerleave', onPointerLeave);
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
