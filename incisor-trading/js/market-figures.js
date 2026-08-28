/* Number and geometry helpers for the market surfaces.
 *
 * Pure, like js/market-clock.js: values in, values out, no DOM, no clock, no
 * network. That is what lets a scheduled session verify it without a browser.
 *
 * Two jobs. First, turning a series of daily bars into the figures a tile
 * shows — the last close, what it moved, and by what percentage — because a
 * daily series already contains its own quote and asking upstream for one
 * separately would spend a second call to learn what we were told the first
 * time. On a 25-calls-a-day tier that arithmetic is the whole design.
 *
 * Second, formatting. Numbers are the content of this page (guide section 13),
 * so they are formatted in one place with one set of rules: two decimals on a
 * price, an explicit sign on anything that moved, a real minus sign rather
 * than a hyphen, and tabular figures doing the aligning in CSS.
 *
 * Exposes window.IncisorMarketFigures. No build step, so this is a plain
 * script with a namespace object rather than a module.
 */

(function (global) {
    'use strict';

    var MINUS = '−';
    var DASH = '—';

    /* The arrow is what keeps direction legible without colour (guide §13),
     * so it travels with the direction rather than being chosen at the call
     * site where it could be forgotten. */
    var ARROWS = {
        up: '▲',
        down: '▼',
        flat: '▬'
    };

    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    var priceFormat = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    function isFiniteNumber(value) {
        return typeof value === 'number' && isFinite(value);
    }

    /* ── Figures from a series ──────────────────────────────────── */

    /* The latest bar and what it moved against the one before it.
     *
     * `change` is null rather than zero when there is no earlier bar to
     * compare against: a series one bar long does not tell us the move was
     * flat, it tells us nothing, and rendering that as 0.00 would be inventing
     * a fact. The view shows an em dash for it.
     */
    function quoteFromBars(bars) {
        if (!Array.isArray(bars) || bars.length === 0) return null;

        var last = bars[bars.length - 1];
        var earlier = bars.length > 1 ? bars[bars.length - 2] : null;
        if (!last || !isFiniteNumber(last.close)) return null;

        var previousClose = earlier && isFiniteNumber(earlier.close)
            ? earlier.close : null;
        var change = previousClose === null ? null : last.close - previousClose;
        var percent = null;
        if (change !== null && previousClose !== 0) {
            percent = (change / previousClose) * 100;
        }

        return {
            close: last.close,
            previousClose: previousClose,
            change: change,
            changePercent: percent,
            date: typeof last.date === 'string' ? last.date : ''
        };
    }

    /* Closing prices from the most recent `count` bars, oldest first. */
    function closingPrices(bars, count) {
        if (!Array.isArray(bars)) return [];
        var window = count > 0 ? bars.slice(-count) : bars.slice();
        var closes = [];
        window.forEach(function (bar) {
            if (bar && isFiniteNumber(bar.close)) closes.push(bar.close);
        });
        return closes;
    }

    function direction(value) {
        if (!isFiniteNumber(value) || value === 0) return 'flat';
        return value > 0 ? 'up' : 'down';
    }

    function arrowFor(value) {
        return ARROWS[direction(value)];
    }

    /* ── Formatting ─────────────────────────────────────────────── */

    function formatPrice(value) {
        if (!isFiniteNumber(value)) return DASH;
        return priceFormat.format(value);
    }

    /* Signed, and signed explicitly: a plus on a rise is what makes the value
     * readable in greyscale alongside the arrow. */
    function formatSigned(value) {
        if (!isFiniteNumber(value)) return DASH;
        var sign = value > 0 ? '+' : (value < 0 ? MINUS : '');
        return sign + priceFormat.format(Math.abs(value));
    }

    function formatPercent(value) {
        if (!isFiniteNumber(value)) return DASH;
        var sign = value > 0 ? '+' : (value < 0 ? MINUS : '');
        return sign + priceFormat.format(Math.abs(value)) + '%';
    }

    /* '2026-08-26' -> '26 Aug 2026', without going through Date.
     *
     * new Date('2026-08-26') is parsed as UTC midnight and then displayed in
     * the local zone, so anywhere west of Greenwich it renders as the 25th.
     * A trading date that is off by one is worse than no date at all. */
    function formatBarDate(iso) {
        if (typeof iso !== 'string') return DASH;
        var match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
        if (!match) return DASH;
        var month = MONTHS[parseInt(match[2], 10) - 1];
        if (!month) return DASH;
        return parseInt(match[3], 10) + ' ' + month + ' ' + match[1];
    }

    /* ── Sparkline geometry ─────────────────────────────────────── */

    function round(value) {
        return Math.round(value * 100) / 100;
    }

    /* An SVG path for a series of closes, plus the y of its opening level.
     *
     * The baseline matters as much as the line: it is the level the change is
     * measured from, so drawing it lets a reader see "above where it started"
     * without relying on the line's colour to say so.
     *
     * A perfectly flat series has no range to scale against, so it is drawn
     * down the middle rather than dividing by zero and producing NaN — which
     * SVG renders as nothing at all, silently.
     */
    function sparkline(closes, width, height, padding) {
        if (!Array.isArray(closes) || closes.length < 2) return null;
        var pad = padding || 0;
        var usable = height - (pad * 2);
        if (!(width > 0) || !(usable > 0)) return null;

        var low = Math.min.apply(null, closes);
        var high = Math.max.apply(null, closes);
        var span = high - low;

        function yFor(value) {
            if (span === 0) return round(pad + (usable / 2));
            return round(pad + (1 - ((value - low) / span)) * usable);
        }

        var points = closes.map(function (close, index) {
            var x = round((index / (closes.length - 1)) * width);
            return x + ',' + yFor(close);
        });

        var opening = closes[0];
        var closing = closes[closes.length - 1];

        return {
            path: 'M' + points.join('L'),
            baselineY: yFor(opening),
            low: low,
            high: high,
            openingClose: opening,
            closingClose: closing,
            change: closing - opening,
            changePercent: opening === 0 ? null : ((closing - opening) / opening) * 100
        };
    }

    global.IncisorMarketFigures = {
        DASH: DASH,
        quoteFromBars: quoteFromBars,
        closingPrices: closingPrices,
        direction: direction,
        arrowFor: arrowFor,
        formatPrice: formatPrice,
        formatSigned: formatSigned,
        formatPercent: formatPercent,
        formatBarDate: formatBarDate,
        sparkline: sparkline
    };
})(typeof window !== 'undefined' ? window : this);
