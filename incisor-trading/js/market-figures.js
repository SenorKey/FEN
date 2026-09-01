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

    /* Largest first, so the first threshold a value clears is its unit. */
    var VOLUME_UNITS = [
        { at: 1e12, suffix: 'T' },
        { at: 1e9, suffix: 'B' },
        { at: 1e6, suffix: 'M' },
        { at: 1e3, suffix: 'K' }
    ];

    var priceFormat = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    /* Built on demand and kept, keyed by decimal places. See formatToPlaces. */
    var placeFormats = {};

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

    /* The high and low actually traded across the most recent `count` bars.
     *
     * Intraday extremes, not closing ones: a 52-week range is conventionally
     * the highest and lowest price the thing changed hands at, and a range
     * built from closes alone is narrower than the real one — which would put
     * the current price further inside its own band than it is. A bar missing
     * its high or low falls back to its close rather than being skipped, so a
     * partial series still produces a range instead of nothing.
     */
    function extremes(bars, count) {
        if (!Array.isArray(bars)) return null;
        var window = count > 0 ? bars.slice(-count) : bars.slice();
        var low = null;
        var high = null;
        window.forEach(function (bar) {
            if (!bar) return;
            var floor = isFiniteNumber(bar.low) ? bar.low : bar.close;
            var ceiling = isFiniteNumber(bar.high) ? bar.high : bar.close;
            if (!isFiniteNumber(floor) || !isFiniteNumber(ceiling)) return;
            low = low === null ? floor : Math.min(low, floor);
            high = high === null ? ceiling : Math.max(high, ceiling);
        });
        if (low === null) return null;
        return { low: low, high: high, sessions: window.length };
    }

    /* Mean volume over the most recent `count` bars.
     *
     * Null rather than zero when nothing readable is in the window: a symbol
     * whose volume upstream did not send has an unknown average, and showing
     * a today-versus-average multiple computed off zero would be worse than
     * showing nothing.
     */
    function averageVolume(bars, count) {
        if (!Array.isArray(bars)) return null;
        var window = count > 0 ? bars.slice(-count) : bars.slice();
        var total = 0;
        var counted = 0;
        window.forEach(function (bar) {
            if (bar && isFiniteNumber(bar.volume)) {
                total += bar.volume;
                counted++;
            }
        });
        return counted === 0 ? null : total / counted;
    }

    /* Where a value sits inside a low-to-high band, as 0 to 1.
     *
     * The marker on the range bars is drawn from this, so it is clamped: a
     * price fractionally outside its own 52-week range — which happens on the
     * day a new high is set, before the series that defines the range has
     * caught up — would otherwise position the marker off the end of the bar
     * it belongs to.
     */
    function positionInRange(low, high, value) {
        if (!isFiniteNumber(low) || !isFiniteNumber(high)) return null;
        if (!isFiniteNumber(value) || high <= low) return null;
        return Math.max(0, Math.min(1, (value - low) / (high - low)));
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

    /* Share counts run to nine figures, and nine figures of tabular digits is
     * a number nobody reads. Abbreviated to three significant figures with an
     * explicit unit, which is how every trading screen renders volume. */
    function formatVolume(value) {
        if (!isFiniteNumber(value) || value < 0) return DASH;
        for (var index = 0; index < VOLUME_UNITS.length; index++) {
            var unit = VOLUME_UNITS[index];
            if (value >= unit.at) {
                var scaled = value / unit.at;
                // Two decimals under ten, one above: 1.24B and 93.2M both read
                // at a glance, where 1.2B loses a digit that matters and
                // 93.24M carries one that does not.
                return scaled.toFixed(scaled < 10 ? 2 : 1) + unit.suffix;
            }
        }
        return String(Math.round(value));
    }

    /* '1.32×'. Unsigned on purpose: a multiple of an average is not a
     * direction, and giving it the arrow treatment would imply it was. */
    function formatMultiple(value) {
        if (!isFiniteNumber(value) || value < 0) return DASH;
        return priceFormat.format(value) + '\u00d7';
    }

    /* A price at a chosen precision.
     *
     * Two decimals is right for a quote and wrong for an axis: a scale
     * labelled 610.00 / 620.00 / 630.00 spends four characters per label
     * saying nothing, while a scale of pennies needs every one of them. The
     * caller passes the precision its own step needs — js/chart-geometry.js
     * computes it — and the formatters are kept rather than rebuilt, because
     * this runs once per axis label per redraw.
     */
    function formatToPlaces(value, places) {
        if (!isFiniteNumber(value)) return DASH;
        var digits = Math.max(0, Math.min(4, places || 0));
        if (!placeFormats[digits]) {
            placeFormats[digits] = new Intl.NumberFormat('en-US', {
                minimumFractionDigits: digits,
                maximumFractionDigits: digits
            });
        }
        return placeFormats[digits].format(value);
    }

    /* '$402B'. Money at the scale a company reports it, sharing the units the
     * volume formatter already uses.
     *
     * Separate from formatVolume rather than a flag on it, because the two
     * differ in what they refuse: a negative share count is nonsense and is
     * dashed, while a negative income is a loss and is a figure a reader
     * needs. Revenue and market cap are the only numbers on this page that
     * run to twelve digits, and twelve digits of tabular figures is a number
     * nobody reads.
     */
    function formatBigMoney(value) {
        if (!isFiniteNumber(value)) return DASH;
        var sign = value < 0 ? MINUS : '';
        var size = Math.abs(value);
        for (var index = 0; index < VOLUME_UNITS.length; index++) {
            var unit = VOLUME_UNITS[index];
            if (size >= unit.at) {
                var scaled = size / unit.at;
                return sign + '$' + scaled.toFixed(scaled < 10 ? 2 : 1)
                    + unit.suffix;
            }
        }
        return sign + '$' + priceFormat.format(size);
    }

    /* A fraction as a percentage: 0.465 -> '46.5%'.
     *
     * Unsigned, unlike formatPercent, and that is the point of having two. A
     * margin is a proportion of revenue rather than a move, so giving it the
     * plus and the direction colouring every other percentage on this page
     * carries would say a 46.5% gross margin had risen 46.5%. A negative
     * margin keeps its minus, because a loss is real and the sign is the
     * whole of it.
     */
    function formatMarginPercent(value) {
        if (!isFiniteNumber(value)) return DASH;
        var sign = value < 0 ? MINUS : '';
        return sign + (Math.abs(value) * 100).toFixed(1) + '%';
    }

    /* A ratio at two decimals, with no unit: what a P/E and a beta are.
     *
     * Negative is dashed rather than shown. A price/earnings ratio against a
     * loss is arithmetically fine and financially meaningless — every screen
     * that prints one is printing a number that cannot be compared with the
     * positive ones beside it — so the panel says the figure does not apply
     * and the explanation says why. Beta reaches here already positive for
     * anything this page lists, and a genuinely negative one would be
     * suppressed for a reason that does not hold; it is filed rather than
     * hidden behind a second formatter nobody would find. */
    function formatRatio(value) {
        if (!isFiniteNumber(value) || value < 0) return DASH;
        return priceFormat.format(value);
    }

    /* ── Figures that need both a filing and a price ─────────────── */

    /* Shares times price. The two come from different upstreams and either
     * may be missing, which is the only reason this is a function. */
    function marketCap(shares, price) {
        if (!isFiniteNumber(shares) || !isFiniteNumber(price)) return null;
        return shares * price;
    }

    /* Price over trailing earnings per share.
     *
     * Computed in the browser rather than on the server so it is derived from
     * the price the reader can see on the card above it. A ratio worked out
     * against some other price would be a contradiction a reader would be
     * right to notice and unable to resolve.
     */
    function priceToEarnings(price, earningsPerShare) {
        if (!isFiniteNumber(price) || !isFiniteNumber(earningsPerShare)) {
            return null;
        }
        if (earningsPerShare === 0) return null;
        return price / earningsPerShare;
    }

    /* Trailing dividends per share over price, as a fraction. */
    function dividendYield(dividendsPerShare, price) {
        if (!isFiniteNumber(dividendsPerShare) || !isFiniteNumber(price)) {
            return null;
        }
        if (price === 0) return null;
        return dividendsPerShare / price;
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

    /* The same date, short enough for an axis: '26 Aug', or 'Aug ’26' when
     * the window is long enough that the day is noise and the year is not.
     *
     * Parsed by hand for the same reason formatBarDate is — a trading date
     * that renders a day early west of Greenwich is worse than no date.
     */
    function formatAxisDate(iso, withYear) {
        if (typeof iso !== 'string') return DASH;
        var match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
        if (!match) return DASH;
        var month = MONTHS[parseInt(match[2], 10) - 1];
        if (!month) return DASH;
        if (withYear) return month + ' ’' + match[1].slice(2);
        return parseInt(match[3], 10) + ' ' + month;
    }

    /* ── Provenance ─────────────────────────────────────────────── */

    /* Where a set of numbers came from, in a sentence.
     *
     * The distinction that matters most is the first one: in fixture mode
     * every figure on the page is generated, and the service says so in
     * `source` rather than the page assuming it. Presenting invented prices as
     * quotes is the failure guide section 10 exists to prevent, and it is the
     * kind of failure that looks like nothing at all.
     *
     * Here rather than in a view because both the tiles and the quote panel
     * have to say it, and two surfaces wording the same claim separately is
     * how one of them ends up saying something weaker.
     */
    function provenanceFor(payload, isoDate) {
        if (!payload) {
            return {
                state: 'error',
                message: 'Market data unavailable. The price service could not '
                    + 'be reached, so no prices are shown.'
            };
        }

        var asOf = formatBarDate(isoDate);
        var delay = payload.delay || 'delayed';

        if (payload.source === 'fixture') {
            return {
                state: 'sample',
                message: 'Sample data · generated prices, not real quotes · '
                    + delay + ' bars to ' + asOf + '.'
            };
        }
        if (payload.stale) {
            return {
                state: 'stale',
                message: 'Delayed data · ' + delay + ' close, ' + asOf
                    + '. This is the last close held; it could not be refreshed.'
            };
        }
        return {
            state: 'live',
            message: 'Delayed data · ' + delay + ' close, ' + asOf + '.'
        };
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
        extremes: extremes,
        averageVolume: averageVolume,
        positionInRange: positionInRange,
        formatVolume: formatVolume,
        formatMultiple: formatMultiple,
        direction: direction,
        arrowFor: arrowFor,
        formatPrice: formatPrice,
        formatSigned: formatSigned,
        formatPercent: formatPercent,
        formatBarDate: formatBarDate,
        formatAxisDate: formatAxisDate,
        formatToPlaces: formatToPlaces,
        formatBigMoney: formatBigMoney,
        formatMarginPercent: formatMarginPercent,
        formatRatio: formatRatio,
        marketCap: marketCap,
        priceToEarnings: priceToEarnings,
        dividendYield: dividendYield,
        provenanceFor: provenanceFor,
        sparkline: sparkline
    };
})(typeof window !== 'undefined' ? window : this);
