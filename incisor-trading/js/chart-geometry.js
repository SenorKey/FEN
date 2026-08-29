/* Geometry for the price chart.
 *
 * Pure, like js/market-clock.js and js/market-figures.js: bars in, coordinates
 * out, no DOM, no clock, no network. That is what lets a scheduled session
 * verify a chart it cannot look at (tests/chart_model.jxa.js), and it is why
 * the drawing lives in js/view-price-chart.js rather than here.
 *
 * Everything is computed in the SVG's own viewBox units rather than in pixels.
 * The chart is stretched to its container with preserveAspectRatio="none", so
 * a y of 120 in a 240-unit box is halfway down at every width — which is what
 * lets the axis labels be positioned as percentages in CSS instead of the page
 * having to measure anything.
 *
 * One series serves every range. GET /history returns the whole cached daily
 * series and the window is taken from its tail, so switching from 1M to 5Y
 * costs nothing upstream — on a budget of 22 calls a day, a chart that
 * re-fetched per range would be a chart with two ranges.
 *
 * Exposes window.IncisorChartGeometry.
 */

(function (global) {
    'use strict';

    /* The ranges the chart offers, shortest first.
     *
     * Counted in trading sessions, because the series is daily bars and a
     * calendar month is not a fixed number of them. 21, 126 and 252 are the
     * conventional session counts for a month, six months and a year.
     *
     * There is no 1D. A day of a daily series is one bar, and a chart of one
     * point is not a chart — a real intraday view needs a separate upstream
     * call per symbol, which the 22-a-day budget cannot carry. See
     * DECISIONS.md; the shortest honest range this data supports is a week.
     */
    var RANGES = [
        { key: '5D', sessions: 5, label: 'five days' },
        { key: '1M', sessions: 21, label: 'one month' },
        { key: '6M', sessions: 126, label: 'six months' },
        { key: '1Y', sessions: 252, label: 'one year' },
        { key: '5Y', sessions: 1260, label: 'five years' }
    ];

    var DEFAULT_RANGE = '6M';

    /* Past this many sessions an axis label of "26 Aug" is ambiguous — the
     * window holds more than one August — so the labels switch to naming the
     * month and the year instead of the day. */
    var YEAR_LABELS_ABOVE = 180;

    function isFiniteNumber(value) {
        return typeof value === 'number' && isFinite(value);
    }

    function round(value) {
        return Math.round(value * 100) / 100;
    }

    /* ── Ranges and windows ─────────────────────────────────────── */

    function rangeFor(key) {
        for (var index = 0; index < RANGES.length; index++) {
            if (RANGES[index].key === key) return RANGES[index];
        }
        return null;
    }

    /* The tail of a series, plus whether it was long enough to fill.
     *
     * `complete` is the honesty field. In fixture mode the committed series is
     * a year long, so asking for five of them returns one — and a button that
     * says 5Y above a year of prices is a claim the reader has no way to
     * check. The view says what it actually got when this comes back false.
     */
    function windowFor(bars, sessions) {
        if (!Array.isArray(bars) || bars.length === 0) {
            return { bars: [], requested: sessions, complete: false };
        }
        var wanted = sessions > 0 ? sessions : bars.length;
        return {
            bars: bars.slice(-wanted),
            requested: wanted,
            complete: bars.length >= wanted
        };
    }

    function usesYearLabels(bars) {
        return Array.isArray(bars) && bars.length > YEAR_LABELS_ABOVE;
    }

    /* ── Plotting ───────────────────────────────────────────────── */

    /* Closing prices as a line, an area beneath it, and the points themselves.
     *
     * Closes only. A daily bar carries a high and a low as well, and drawing
     * those as a band is a different chart with a different lesson in it; the
     * high and the low for the day the reader is on are in the readout and the
     * table instead.
     *
     * The vertical scale spans the window's own low to its own high rather
     * than starting at zero, which is the convention for a price series — a
     * zero-based axis on a stock that has never been near zero spends most of
     * its height saying nothing. The axis labels are what make the scale
     * explicit, so they are not optional decoration.
     *
     * A perfectly flat window has no range to scale against and is drawn down
     * the middle rather than dividing by zero, which SVG renders as nothing at
     * all and does so silently.
     */
    function plot(bars, width, height, padding) {
        if (!Array.isArray(bars) || bars.length === 0) return null;
        var pad = padding || 0;
        var usable = height - (pad * 2);
        if (!(width > 0) || !(usable > 0)) return null;

        var closes = [];
        for (var scan = 0; scan < bars.length; scan++) {
            if (!bars[scan] || !isFiniteNumber(bars[scan].close)) return null;
            closes.push(bars[scan].close);
        }

        var low = Math.min.apply(null, closes);
        var high = Math.max.apply(null, closes);
        var span = high - low;

        function yFor(value) {
            if (span === 0) return round(pad + (usable / 2));
            return round(pad + (1 - ((value - low) / span)) * usable);
        }

        function xFor(index) {
            if (bars.length === 1) return round(width / 2);
            return round((index / (bars.length - 1)) * width);
        }

        var points = bars.map(function (bar, index) {
            return { x: xFor(index), y: yFor(bar.close), bar: bar };
        });

        var steps = points.map(function (point) {
            return point.x + ',' + point.y;
        });

        var opening = closes[0];
        var closing = closes[closes.length - 1];
        var edge = round(height);

        return {
            points: points,
            // The scale itself, not just what it produced. A price-axis tick
            // is a round number that is not in the series and so has no point
            // of its own, and the view would otherwise have to restate this
            // arithmetic to place one — two copies of a formula that has to
            // agree with itself for the gridlines to line up with the line.
            yForPrice: yFor,
            // A single point has no line. The view draws the dot instead, so
            // a one-bar window reads as one price rather than as a failure.
            path: points.length > 1 ? 'M' + steps.join('L') : null,
            area: points.length > 1
                ? 'M' + steps.join('L') + 'L' + points[points.length - 1].x
                    + ',' + edge + 'L' + points[0].x + ',' + edge + 'Z'
                : null,
            baselineY: yFor(opening),
            low: low,
            high: high,
            openingClose: opening,
            closingClose: closing,
            change: closing - opening,
            changePercent: opening === 0 ? null
                : ((closing - opening) / opening) * 100
        };
    }

    /* ── Axes ───────────────────────────────────────────────────── */

    /* The next round number at or above `raw`, from the 1 / 2 / 2.5 / 5 / 10
     * family every hand-drawn axis has used since before computers. */
    function niceStep(raw) {
        if (!(raw > 0)) return 0;
        var magnitude = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
        var scaled = raw / magnitude;
        var step = 10;
        if (scaled <= 1) step = 1;
        else if (scaled <= 2) step = 2;
        else if (scaled <= 2.5) step = 2.5;
        else if (scaled <= 5) step = 5;
        return step * magnitude;
    }

    /* Round price levels inside a low-to-high band, with the precision they
     * need to stay distinct.
     *
     * `decimals` travels with the values because the right precision is a
     * property of the step and not of the price: 610 and 620 want none, and
     * 6.10 and 6.20 want two. Formatting every tick to two decimals turns a
     * three-figure axis into noise, and formatting to none turns a
     * dollar-and-change axis into four labels that all say 6.
     */
    function priceTicks(low, high, count) {
        if (!isFiniteNumber(low) || !isFiniteNumber(high)) {
            return { values: [], decimals: 2 };
        }
        if (high <= low) return { values: [low], decimals: 2 };

        var step = niceStep((high - low) / Math.max(1, count));
        if (!(step > 0)) return { values: [], decimals: 2 };

        var values = [];
        // Multiplied out from the first tick rather than accumulated, so a
        // step of 0.1 does not drift a cent across a dozen labels.
        var first = Math.ceil(low / step);
        var last = Math.floor(high / step);
        for (var multiple = first; multiple <= last; multiple++) {
            values.push(multiple * step);
        }

        var decimals = step >= 1 ? 0 : (step >= 0.1 ? 1 : 2);
        return { values: values, decimals: decimals };
    }

    /* Evenly spaced dates along the window, always including both ends.
     *
     * Indices into the window rather than dates alone, so the view can place
     * each label at the x of the bar it names instead of guessing.
     *
     * A short window is labelled bar by bar rather than sampled. Sampling four
     * ticks out of five sessions rounds two of them onto adjacent bars and
     * leaves the axis bunched at one end, which reads as a fault; five
     * sessions have room for five labels and each one names a day the reader
     * can see a point for.
     */
    function dateTicks(bars, count) {
        if (!Array.isArray(bars) || bars.length === 0) return [];
        if (bars.length === 1) return [{ index: 0, date: bars[0].date }];

        var wanted = bars.length <= count + 2
            ? bars.length : Math.max(2, Math.min(count, bars.length));
        var ticks = [];
        for (var slot = 0; slot < wanted; slot++) {
            var index = Math.round((slot / (wanted - 1)) * (bars.length - 1));
            ticks.push({ index: index, date: bars[index].date });
        }
        return ticks;
    }

    /* ── Reading a point off the chart ──────────────────────────── */

    /* Which bar sits under an x, in viewBox units.
     *
     * The points are evenly spaced by construction, so this is arithmetic
     * rather than a search — which matters because it runs on every pointer
     * move across a window that can hold 1260 of them. Out-of-range x values
     * clamp to an end rather than returning nothing, so the readout keeps up
     * when the pointer runs off the side of the plot.
     */
    function indexAtX(x, width, count) {
        if (!(count > 0) || !(width > 0) || !isFiniteNumber(x)) return -1;
        if (count === 1) return 0;
        var index = Math.round((x / width) * (count - 1));
        return Math.max(0, Math.min(count - 1, index));
    }

    global.IncisorChartGeometry = {
        RANGES: RANGES,
        DEFAULT_RANGE: DEFAULT_RANGE,
        rangeFor: rangeFor,
        windowFor: windowFor,
        usesYearLabels: usesYearLabels,
        plot: plot,
        niceStep: niceStep,
        priceTicks: priceTicks,
        dateTicks: dateTicks,
        indexAtX: indexAtX
    };
})(typeof window !== 'undefined' ? window : this);
