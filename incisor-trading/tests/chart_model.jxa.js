/* Exercises the price chart outside a browser.
 *
 * Two modules. js/chart-geometry.js is pure, so it runs against hand-computed
 * coordinates with nothing stubbed. js/view-price-chart.js runs against the
 * DOM stub in dom_stub.jxa.js, driven by real range clicks, pointer moves and
 * arrow keys — which is the only way T8's acceptance criteria can be reached
 * at all without a browser: every range has to render, the hover readout has
 * to track the pointer, and the whole thing has to be usable from the
 * keyboard.
 *
 * What it cannot check is whether the line looks right, whether the axis
 * labels collide at 375px, or whether any of it is legible in light and dark.
 * tools/shoot.py does that, and the screenshots are the evidence.
 *
 * Run by test_price_chart.py. Arguments: <page-dir>
 */

function run(argv) {
    'use strict';
    ObjC.import('Foundation');

    function read(path) {
        return $.NSString.stringWithContentsOfFileEncodingError(
            path, $.NSUTF8StringEncoding, null).js;
    }

    var pageDir = argv[0];
    var results = [];
    var failed = 0;

    function check(name, condition, detail) {
        results.push({ test: name, pass: !!condition, detail: detail || '' });
        if (!condition) failed++;
    }

    function equal(name, actual, expected) {
        check(name, actual === expected,
            'expected ' + JSON.stringify(expected) + ', got '
                + JSON.stringify(actual));
    }

    function close(name, actual, expected, tolerance) {
        check(name, Math.abs(actual - expected) < tolerance,
            'expected ~' + expected + ', got ' + actual);
    }

    function report() {
        return JSON.stringify({ failed: failed, total: results.length,
            results: results });
    }

    /* ── Modules under test ─────────────────────────────────────── */

    var stub = {};
    var geometry;
    var figures;
    try {
        (new Function('exports', read(pageDir + '/tests/dom_stub.jxa.js')))(stub);
        var box = {};
        (new Function('window', read(pageDir + '/js/market-figures.js')))(box);
        (new Function('window', read(pageDir + '/js/chart-geometry.js')))(box);
        geometry = box.IncisorChartGeometry;
        figures = box.IncisorMarketFigures;
        check('the pure modules parse and run', !!geometry && !!figures);
    } catch (error) {
        check('the pure modules parse and run', false, String(error));
        return report();
    }
    var El = stub.El;

    /* ── Fixtures ───────────────────────────────────────────────── */

    /* A ramp with a known low, a known high and a known length, so every
     * assertion below names a fact rather than whatever a loop produced. */
    function ramp(count, from, to) {
        var bars = [];
        for (var index = 0; index < count; index++) {
            var close = count === 1 ? from
                : from + ((to - from) * (index / (count - 1)));
            bars.push({
                date: dayNumber(index),
                open: close - 1,
                high: close + 2,
                low: close - 2,
                close: close,
                volume: 1000000 + index
            });
        }
        return bars;
    }

    /* Sequential calendar dates from 2020-01-01, so a long series spans real
     * years and the axis has something to be ambiguous about. */
    function dayNumber(index) {
        var epoch = Date.UTC(2020, 0, 1) + (index * 86400000);
        return new Date(epoch).toISOString().slice(0, 10);
    }

    /* ── Ranges and windows ─────────────────────────────────────── */

    equal('there are five ranges', geometry.RANGES.length, 5);
    equal('and none of them is 1D — a day of a daily series is one bar',
        geometry.RANGES.filter(function (range) {
            return range.key === '1D';
        }).length, 0);
    equal('the shortest is a week', geometry.RANGES[0].key, '5D');
    equal('the longest is five years',
        geometry.RANGES[geometry.RANGES.length - 1].key, '5Y');
    equal('the default is one the fixtures can fill',
        geometry.DEFAULT_RANGE, '6M');
    equal('an unknown range key resolves to nothing rather than to the first',
        geometry.rangeFor('7Q'), null);

    var year = ramp(260, 100, 200);

    var month = geometry.windowFor(year, 21);
    equal('a month takes 21 sessions', month.bars.length, 21);
    equal('and takes them from the end', month.bars[20].close, 200);
    equal('and reports itself complete', month.complete, true);

    var fiveYears = geometry.windowFor(year, 1260);
    equal('five years of a one-year series is the one year',
        fiveYears.bars.length, 260);
    equal('and says so rather than claiming it filled',
        fiveYears.complete, false);
    equal('an empty series produces an empty window',
        geometry.windowFor([], 21).bars.length, 0);

    equal('a long window labels its axis by month and year',
        geometry.usesYearLabels(year), true);
    equal('a short one labels it by day',
        geometry.usesYearLabels(geometry.windowFor(year, 21).bars), false);

    /* ── Plotting ───────────────────────────────────────────────── */

    var shape = geometry.plot(ramp(5, 100, 200), 720, 240, 10);
    equal('every bar becomes a point', shape.points.length, 5);
    equal('the first point sits on the left edge', shape.points[0].x, 0);
    equal('the last sits on the right edge', shape.points[4].x, 720);
    equal('the middle one sits in the middle', shape.points[2].x, 360);
    equal('the highest close is at the top of the padded box',
        shape.points[4].y, 10);
    equal('the lowest is at the bottom of it', shape.points[0].y, 230);
    equal('the window low is the lowest close', shape.low, 100);
    equal('the window high is the highest', shape.high, 200);
    close('the period change is the whole rise', shape.change, 100, 0.001);
    close('and its percentage is measured off the opening close',
        shape.changePercent, 100, 0.001);
    equal('the path starts with a move', shape.path.slice(0, 1), 'M');
    equal('the area closes back on itself', shape.area.slice(-1), 'Z');
    equal('and drops to the bottom of the box rather than the padded floor',
        shape.area.indexOf('720,240') > -1, true);
    equal('the baseline sits on the opening close',
        shape.baselineY, shape.points[0].y);
    equal('the scale comes back with the shape, so a gridline at a round '
        + 'price lands on the same y the line would at that price',
        shape.yForPrice(150), 120);
    equal('and a tick at the window low lands on the padded floor',
        shape.yForPrice(100), 230);

    var flat = geometry.plot(ramp(5, 150, 150), 720, 240, 10);
    equal('a flat window is drawn down the middle rather than dividing by '
        + 'zero, which SVG renders as nothing at all',
        flat.points[0].y, 120);
    check('and none of its coordinates are NaN', flat.points.every(
        function (point) { return isFinite(point.x) && isFinite(point.y); }));

    var single = geometry.plot(ramp(1, 120, 120), 720, 240, 10);
    equal('a one-bar window is centred', single.points[0].x, 360);
    equal('and has no line, so the view draws the point instead',
        single.path, null);

    equal('a window with no bars does not plot',
        geometry.plot([], 720, 240, 10), null);
    equal('nor does one with a bar that carries no close',
        geometry.plot([{ date: '2026-01-01' }], 720, 240, 10), null);
    equal('nor does a box with no height', geometry.plot(ramp(5, 1, 2), 720, 8,
        10), null);

    /* ── Axes ───────────────────────────────────────────────────── */

    equal('a step rounds up to the 1/2/2.5/5/10 family',
        geometry.niceStep(0.3), 0.5);
    equal('and again an order of magnitude up', geometry.niceStep(23), 25);
    equal('and lands exactly on a member of it', geometry.niceStep(10), 10);

    var ticks = geometry.priceTicks(100, 200, 4);
    check('the price ticks are round numbers',
        ticks.values.every(function (value) { return value % 25 === 0; }),
        JSON.stringify(ticks.values));
    check('and all sit inside the band',
        ticks.values.every(function (value) {
            return value >= 100 && value <= 200;
        }), JSON.stringify(ticks.values));
    equal('a band of whole dollars is labelled without cents',
        ticks.decimals, 0);
    equal('a band of pennies keeps them',
        geometry.priceTicks(6.10, 6.20, 4).decimals, 2);
    equal('a band with no width is one label',
        geometry.priceTicks(150, 150, 4).values.length, 1);

    var when = geometry.dateTicks(ramp(21, 1, 2), 4);
    equal('there are as many date ticks as asked for', when.length, 4);
    equal('the first names the first bar', when[0].index, 0);
    equal('the last names the last', when[3].index, 20);
    equal('a window shorter than the tick count is not padded out',
        geometry.dateTicks(ramp(3, 1, 2), 6).length, 3);
    equal('a five-session window labels every session rather than sampling '
        + 'four of them onto adjacent bars',
        geometry.dateTicks(ramp(5, 1, 2), 4).length, 5);
    check('and those labels are one per bar, in order',
        geometry.dateTicks(ramp(5, 1, 2), 4).every(function (tick, slot) {
            return tick.index === slot;
        }));
    equal('and a single bar is a single tick',
        geometry.dateTicks(ramp(1, 1, 1), 4).length, 1);

    /* ── Reading a point off the plot ───────────────────────────── */

    equal('the left edge reads the first bar',
        geometry.indexAtX(0, 720, 5), 0);
    equal('the right edge reads the last', geometry.indexAtX(720, 720, 5), 4);
    equal('a point between two bars snaps to the nearer',
        geometry.indexAtX(100, 720, 5), 1);
    equal('an x off the left clamps rather than reading nothing',
        geometry.indexAtX(-400, 720, 5), 0);
    equal('and an x off the right clamps too',
        geometry.indexAtX(9000, 720, 5), 4);
    equal('a window of one bar always reads that bar',
        geometry.indexAtX(500, 720, 1), 0);

    /* ── Axis formatting ────────────────────────────────────────── */

    equal('a short window names the day', figures.formatAxisDate('2026-08-26'),
        '26 Aug');
    equal('a long one names the month and the year',
        figures.formatAxisDate('2026-08-26', true), 'Aug ’26');
    equal('a price can be asked for without cents',
        figures.formatToPlaces(612.5, 0), '613');
    equal('or with them', figures.formatToPlaces(612.5, 2), '612.50');
    equal('and a figure that is not one is an em dash',
        figures.formatToPlaces(null, 2), figures.DASH);

    /* ── The view ───────────────────────────────────────────────── */

    /* The served markup, rebuilt as a tree. Kept in step with index.html by
     * test_price_chart.py, which asserts every hook below is on the page. */
    function buildChart() {
        var chart = new El('figure', { 'data-chart': '',
            'data-state': 'empty' });

        var head = new El('figcaption', {});
        var title = new El('p', {});
        var ticker = new El('span', { 'data-chart-symbol': '' });
        ticker.hidden = true;
        var badge = new El('span', { 'data-chart-proxy': '' });
        badge.hidden = true;
        var periodLabel = new El('span', { 'data-chart-period-label': '' });
        periodLabel.textContent = 'Price history';
        title.appendChild(ticker);
        title.appendChild(badge);
        title.appendChild(periodLabel);
        head.appendChild(title);
        var period = new El('p', { 'class': 'inc-flat',
            'data-chart-period': '' });
        period.appendChild(new El('span', { 'data-chart-period-arrow': '' }));
        period.appendChild(new El('span', { 'data-chart-period-delta': '' }));
        period.appendChild(new El('span', { 'data-chart-period-pct': '' }));
        head.appendChild(period);

        var ranges = new El('div', { 'data-chart-ranges': '' });
        var buttons = {};
        geometry.RANGES.forEach(function (range) {
            var button = new El('button', {
                'data-chart-range': range.key,
                'aria-pressed': range.key === geometry.DEFAULT_RANGE
                    ? 'true' : 'false'
            });
            buttons[range.key] = button;
            ranges.appendChild(button);
        });
        head.appendChild(ranges);
        chart.appendChild(head);

        var plot = new El('div', { 'data-chart-plot': '',
            'data-chart-tracking': 'false', 'aria-label': '' });
        plot.appendChild(new El('p', { 'data-chart-message': '' }));
        var canvas = new El('g', { 'data-chart-canvas': '' });
        plot.appendChild(canvas);
        var marks = new El('div', { 'data-chart-marks': '' });
        plot.appendChild(marks);
        chart.appendChild(plot);

        var scale = new El('ul', { 'data-chart-scale': '' });
        var dates = new El('ul', { 'data-chart-dates': '' });
        chart.appendChild(scale);
        chart.appendChild(dates);

        var readout = new El('p', { 'data-chart-readout': '' });
        readout.appendChild(new El('span', { 'data-chart-readout-date': '' }));
        readout.appendChild(new El('span', { 'data-chart-readout-price': '' }));
        var move = new El('span', { 'class': 'inc-flat',
            'data-chart-readout-change': '' });
        move.appendChild(new El('span', { 'data-chart-readout-arrow': '' }));
        move.appendChild(new El('span', { 'data-chart-readout-delta': '' }));
        move.appendChild(new El('span', { 'data-chart-readout-pct': '' }));
        readout.appendChild(move);
        chart.appendChild(readout);

        var shortfall = new El('p', { 'data-chart-shortfall': '' });
        shortfall.hidden = true;
        chart.appendChild(shortfall);

        var table = new El('details', { 'data-chart-table': '' });
        table.open = false;
        var rows = new El('tbody', { 'data-chart-rows': '' });
        table.appendChild(rows);
        chart.appendChild(table);

        return { chart: chart, plot: plot, canvas: canvas, marks: marks,
            scale: scale, dates: dates, readout: readout, table: table,
            rows: rows, buttons: buttons, shortfall: shortfall,
            ticker: ticker, badge: badge };
    }

    function mount() {
        var page = buildChart();
        var doc = stub.makeDocument([page.chart]);
        var windowStub = {
            IncisorDom: null,
            IncisorMarketFigures: figures,
            IncisorChartGeometry: geometry
        };
        (new Function('window', read(pageDir + '/js/dom.js')))(windowStub);
        (new Function('document', 'window', 'global',
            read(pageDir + '/js/view-price-chart.js')))(doc, windowStub,
            windowStub);

        page.api = windowStub.IncisorPriceChart;
        page.state = function () {
            return page.chart.getAttribute('data-state');
        };
        page.text = function (selector) {
            var node = page.chart.querySelector(selector);
            return node ? node.textContent : null;
        };
        page.pressRange = function (key) {
            page.chart.querySelector('[data-chart-ranges]')
                .fire('click', { target: page.buttons[key] });
        };
        page.hoverAt = function (x) {
            page.plot.fire('pointermove', { clientX: x });
        };
        page.key = function (name) {
            return page.plot.fire('keydown', { key: name });
        };
        page.shapes = function (className) {
            return page.canvas.children.filter(function (node) {
                return node.getAttribute('class') === className;
            });
        };
        return page;
    }

    var view = mount();
    check('the view exposes an API for the quote panel to drive', !!view.api);
    equal('and starts with nothing drawn', view.state(), 'empty');

    view.api.show('SPY', year);
    equal('a series puts it in its ready state', view.state(), 'ready');
    equal('and the head names the symbol being charted, which only the plot’s '
        + 'own label used to', view.text('[data-chart-symbol]'), 'SPY');
    equal('and shows it', view.ticker.hidden, false);
    equal('a symbol that stands in for nothing carries no proxy badge',
        view.badge.hidden, true);
    equal('one line is drawn', view.shapes('inc-chart-line').length, 1);
    equal('and one area beneath it', view.shapes('inc-chart-area').length, 1);
    equal('and the opening level, as the tile sparklines draw it',
        view.shapes('inc-chart-base').length, 1);
    equal('the line is created in the SVG namespace, without which it renders '
        + 'as nothing at all',
        view.shapes('inc-chart-line')[0].namespace,
        'http://www.w3.org/2000/svg');
    check('the price scale is labelled', view.scale.children.length > 1);
    check('and so is the date axis', view.dates.children.length > 1);
    equal('the first date label is pinned to the left edge rather than '
        + 'centred half off it',
        view.dates.children[0].getAttribute('data-chart-edge'), 'start');
    equal('and the last to the right edge',
        view.dates.children[view.dates.children.length - 1]
            .getAttribute('data-chart-edge'), 'end');
    equal('the default range is pressed',
        view.buttons['6M'].getAttribute('aria-pressed'), 'true');
    equal('and the others are not',
        view.buttons['1Y'].getAttribute('aria-pressed'), 'false');
    check('the chart describes itself for a screen reader',
        view.plot.getAttribute('aria-label').indexOf('SPY') === 0,
        view.plot.getAttribute('aria-label'));
    check('and the description says which way it went',
        /up|down|unchanged/.test(view.plot.getAttribute('aria-label')));

    /* Every range renders */

    geometry.RANGES.forEach(function (range) {
        view.pressRange(range.key);
        equal(range.key + ' renders', view.state(), 'ready');
        equal('and marks itself pressed',
            view.buttons[range.key].getAttribute('aria-pressed'), 'true');
        check('and draws ' + range.key + ' with a scale',
            view.scale.children.length > 0);
    });

    view.pressRange('5D');
    equal('a five-day window draws its individual closes, because at that '
        + 'length the days are the point rather than the shape',
        view.marks.children.filter(function (node) {
            return node.className === 'inc-chart-dot';
        }).length, 5);
    view.pressRange('1Y');
    equal('a year does not, because they would merge into a thicker line',
        view.marks.children.filter(function (node) {
            return node.className === 'inc-chart-dot';
        }).length, 0);

    /* The shortfall notice */

    view.pressRange('5Y');
    equal('asking for five years of a one-year series says so',
        view.shortfall.hidden, false);
    check('and names what it actually drew',
        view.shortfall.textContent.indexOf('260 sessions') > -1,
        view.shortfall.textContent);
    check('and the heading does not claim five years either',
        view.text('[data-chart-period-label]').indexOf('sessions') > -1,
        view.text('[data-chart-period-label]'));
    view.pressRange('6M');
    equal('a range the series can fill says nothing',
        view.shortfall.hidden, true);
    equal('and names its own period', view.text('[data-chart-period-label]'),
        'Over six months');

    /* The readout */

    equal('the readout starts on the latest close, so it is never an empty '
        + 'row taking up space', view.text('[data-chart-readout-price]'),
        '200.00');
    equal('and the cursor is not shown until something is pointed at',
        view.plot.getAttribute('data-chart-tracking'), 'false');

    view.hoverAt(0);
    equal('hovering the left edge reads the oldest bar in the window',
        view.text('[data-chart-readout-date]'),
        figures.formatBarDate(geometry.windowFor(year, 126).bars[0].date));
    equal('and shows the cursor',
        view.plot.getAttribute('data-chart-tracking'), 'true');
    view.hoverAt(720);
    equal('hovering the right edge reads the newest',
        view.text('[data-chart-readout-price]'), '200.00');
    view.plot.fire('pointerleave', {});
    equal('leaving the plot hides the cursor',
        view.plot.getAttribute('data-chart-tracking'), 'false');
    equal('and leaves the latest close in the readout rather than blanking it',
        view.text('[data-chart-readout-price]'), '200.00');

    /* The keyboard path to the same readout */

    var home = view.key('Home');
    equal('Home reads the oldest bar in the window',
        view.text('[data-chart-readout-date]'),
        figures.formatBarDate(geometry.windowFor(year, 126).bars[0].date));
    equal('and stops the page scrolling with it', home.defaultPrevented, true);
    var before = view.text('[data-chart-readout-price]');
    view.key('ArrowRight');
    check('the right arrow steps forward a session',
        view.text('[data-chart-readout-price]') !== before);
    view.key('ArrowLeft');
    equal('and the left arrow steps back to where it was',
        view.text('[data-chart-readout-price]'), before);
    view.key('ArrowLeft');
    equal('arrowing off the start clamps rather than wrapping round',
        view.text('[data-chart-readout-price]'), before);
    view.key('End');
    equal('End reads the newest', view.text('[data-chart-readout-price]'),
        '200.00');
    equal('and the cursor is shown throughout, so a keyboard reader can see '
        + 'where they are', view.plot.getAttribute('data-chart-tracking'),
        'true');
    view.key('Escape');
    equal('Escape puts it away',
        view.plot.getAttribute('data-chart-tracking'), 'false');
    equal('an unhandled key is left to the browser',
        view.key('a').defaultPrevented, undefined);

    /* The table fallback */

    equal('the table is not built until it is opened', view.rows.children.length,
        0);
    view.table.open = true;
    view.table.fire('toggle', {});
    equal('opening it builds a row per session in the range',
        view.rows.children.length, 126);
    equal('with six columns', view.rows.children[0].children.length, 6);
    equal('the date leads the row as its header',
        view.rows.children[0].children[0].tag, 'th');
    equal('and is scoped to it',
        view.rows.children[0].children[0].getAttribute('scope'), 'row');
    equal('volume is abbreviated rather than printed in full',
        view.rows.children[0].children[5].textContent.slice(-1), 'M');
    view.pressRange('1M');
    equal('changing range while it is open rebuilds it',
        view.rows.children.length, 21);

    /* Failure and reset */

    view.pressRange('5Y');
    equal('the shortfall note is showing before the failure',
        view.shortfall.hidden, false);
    view.api.unavailable('ZZZZ');
    equal('a symbol with no history says so in the chart’s own space',
        view.state(), 'unavailable');
    equal('and the shortfall note goes with the series it described, rather '
        + 'than outliving it', view.shortfall.hidden, true);
    equal('and nothing is left drawn under it', view.canvas.children.length, 0);
    check('and the message names the symbol',
        view.text('[data-chart-message]').indexOf('ZZZZ') > -1,
        view.text('[data-chart-message]'));
    check('and a screen reader is told the same thing',
        view.plot.getAttribute('aria-label').indexOf('ZZZZ') > -1);

    equal('a chart of a symbol with no series names nothing in its head',
        view.ticker.hidden, true);
    equal('and stops naming the window it can no longer draw',
        view.text('[data-chart-period-label]'), 'Price history');

    view.api.show('SPY', year, true);
    equal('a symbol that stands in for an index says so here too, as it does '
        + 'on the tile and the panel', view.badge.hidden, false);

    view.api.show('SPY', year);
    view.api.reset();
    equal('resetting returns it to empty', view.state(), 'empty');
    equal('and takes the symbol out of the head with it',
        view.ticker.hidden, true);
    equal('and clears the axis rather than leaving the last symbol labelled',
        view.scale.children.length, 0);
    equal('and clears the table too', view.rows.children.length, 0);

    view.api.show('SPY', []);
    equal('a series with no bars is unavailable rather than a blank chart',
        view.state(), 'unavailable');

    return report();
}
