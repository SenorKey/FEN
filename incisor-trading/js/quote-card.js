/* The quote card: one symbol's figures, drawn.
 *
 * The drawing half of the symbol lookup. js/view-symbol.js decides which
 * symbol is on screen, what to do with a failure and which sibling surfaces to
 * wake; everything below takes an answer that has already arrived and puts it
 * in the card. That is the seam DECISIONS.md names for a surface that outgrows
 * one file — drawing on one side, deciding on the other — and it is the same
 * split js/chart-canvas.js is to js/view-price-chart.js.
 *
 * Nothing here fetches, and nothing here holds state between calls. Every
 * function takes the panel it is writing into, so the module can be handed a
 * detached card in a test and never reaches for one of its own.
 *
 * Contract with the markup: a [data-quote] panel holding [data-quote-*] hooks,
 * two [data-range] bands and [data-figure] values. Text is written through
 * js/dom.js, which is the one place a value from the network becomes something
 * a reader sees.
 *
 * Exposes window.IncisorQuoteCard for js/view-symbol.js to drive.
 */

(function (global) {
    'use strict';

    var dom = global.IncisorDom;
    var figures = global.IncisorMarketFigures;

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

    /* The marker, in words, for a reader who cannot see it.
     *
     * The band is here to say the one thing a low and a high do not, and that
     * was exactly the part a screen reader never got: the marker is decorative
     * and nothing stood in for it, so the band announced two numbers and none
     * of its own meaning. Rounded to whole percent, because the drawing is not
     * precise to a decimal either and reading one would claim it was.
     */
    function positionSentence(position, value) {
        return 'Last price ' + figures.formatPrice(value) + ' sits '
            + Math.round(position * 100) + '% of the way up this range.';
    }

    function rangeTitleFor(sessions) {
        if (sessions >= YEAR_ENOUGH) return '52-week range';
        // Weeks rather than sessions: a reader thinks in calendar time, and
        // "175-session range" asks them to do the conversion themselves.
        return Math.round(sessions / 5) + '-week range';
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
            dom.fill(range, '[data-range-position]', '');
            return;
        }
        marker.hidden = false;
        track.setAttribute('data-range-known', 'true');
        // Set through the CSSOM rather than as a style attribute: a strict
        // Content-Security-Policy (T13) blocks the attribute and not this.
        track.style.setProperty('--inc-range-position',
            (position * 100).toFixed(2) + '%');
        dom.fill(range, '[data-range-position]',
            positionSentence(position, value));
    }

    function renderRanges(panel, quote, bars) {
        var ranges = panel.querySelectorAll('[data-range]');
        renderRange(ranges[0], quote.low, quote.high, quote.price, null);

        var year = figures.extremes(bars, YEAR_SESSIONS);
        if (year) {
            renderRange(ranges[1], year.low, year.high, quote.price,
                rangeTitleFor(year.sessions));
        } else {
            renderRange(ranges[1], null, null, null, '52-week range');
        }
    }

    function setFigure(panel, name, value) {
        dom.fill(panel, '[data-figure="' + name + '"]', value);
    }

    function renderIdentity(panel, entry, symbol) {
        dom.fill(panel, '[data-quote-symbol]', symbol);
        dom.fill(panel, '[data-quote-name]', entry ? entry.name : symbol);

        var proxy = panel.querySelector('[data-quote-proxy]');
        if (proxy) proxy.hidden = !(entry && entry.tracks);
    }

    function renderChange(panel, quote) {
        dom.fill(panel, '[data-quote-price]', figures.formatPrice(quote.price));
        dom.fill(panel, '[data-quote-delta]', figures.formatSigned(quote.change));
        dom.fill(panel, '[data-quote-pct]',
            figures.formatPercent(quote.changePercent));
        dom.fill(panel, '[data-quote-arrow]', figures.arrowFor(quote.change));
        dom.setDirection(panel.querySelector('[data-quote-change]'),
            figures.direction(quote.change));
    }

    function renderVolume(panel, quote, bars) {
        var average = figures.averageVolume(bars, VOLUME_SESSIONS);
        setFigure(panel, 'volume', figures.formatVolume(quote.volume));
        setFigure(panel, 'average-volume', figures.formatVolume(average));
        // Null rather than a ratio when either side is unknown: a multiple
        // computed against a missing average would be a number with nothing
        // behind it, which is worse than an em dash.
        setFigure(panel, 'relative-volume',
            average && quote.volume !== null
                ? figures.formatMultiple(quote.volume / average)
                : figures.DASH);
    }

    function renderProvenance(panel, quoteEnvelope, tradingDay) {
        var summary = figures.provenanceFor(quoteEnvelope, tradingDay);
        var line = panel.querySelector('[data-quote-provenance]');
        if (!line) return;
        line.setAttribute('data-provenance-state', summary.state);
        dom.fill(line, '[data-quote-provenance-message]', summary.message);
    }

    /* Fills the whole card from one answer.
     *
     * `historyEnvelope` may be null: the quote decides whether there is a card
     * at all, and a history that did not arrive degrades the 52-week range and
     * the volume average to em dashes rather than failing the lookup.
     */
    function render(panel, symbol, entry, quoteEnvelope, historyEnvelope) {
        var quote = quoteEnvelope.quote;
        var bars = historyEnvelope ? historyEnvelope.bars : [];

        renderIdentity(panel, entry, symbol);
        renderChange(panel, quote);
        renderRanges(panel, quote, bars);

        setFigure(panel, 'open', figures.formatPrice(quote.open));
        setFigure(panel, 'previous', figures.formatPrice(quote.previousClose));
        renderVolume(panel, quote, bars);
        renderProvenance(panel, quoteEnvelope, quote.tradingDay);
    }

    // Registered only when what it draws with is there, so js/view-symbol.js
    // can check for this module alone rather than re-listing its dependencies.
    if (dom && figures) global.IncisorQuoteCard = { render: render };
})(typeof window !== 'undefined' ? window : this);
