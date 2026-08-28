/* The index summary strip — the four ETF proxy tiles and the line beneath
 * them that says where their numbers came from.
 *
 * Lifted out of incisor.js when the shell outgrew holding every view: this
 * page is a dashboard of surfaces, and each surface that renders market data
 * now owns its own file. incisor.js keeps the tabs and the market clock,
 * neither of which draws a figure from the service — the same seam
 * css/market.css is split along.
 *
 * The arithmetic is js/market-figures.js and the network is js/market-data.js.
 * Nothing here computes or fetches; it decides what goes on screen and when,
 * which is why the whole thing can be driven from a DOM stub with no browser
 * (tests/strip_model.jxa.js).
 *
 * Contract with the markup: a [data-index-strip] list of [data-tile]
 * elements, each carrying the hooks filled in below, and a [data-provenance]
 * line. Every figure ships as an em dash and stays one until the service
 * answers — the page has no prices of its own, and printing plausible numbers
 * it did not fetch is the one thing a market page must never do.
 */

(function () {
    'use strict';

    var dom = window.IncisorDom;

    var SVG_NS = 'http://www.w3.org/2000/svg';

    /* A month of trading days. Long enough to have a shape, short enough that
     * the shape is about now rather than about the spring. */
    var SPARK_DAYS = 30;

    /* The viewBox, matched to the one in the markup. The SVG is stretched to
     * the tile's width with preserveAspectRatio="none", so these are drawing
     * units and not pixels — the padding keeps the stroke off the edges at
     * whatever width it lands on. */
    var SPARK_WIDTH = 120;
    var SPARK_HEIGHT = 34;
    var SPARK_PADDING = 3;

    /* Replaces the sparkline's contents. Built with createElementNS rather
     * than a markup string because an SVG element created any other way is
     * silently in the wrong namespace and renders as nothing. */
    function drawSparkline(svg, closes, figures, symbol) {
        dom.empty(svg);

        var shape = figures.sparkline(closes, SPARK_WIDTH, SPARK_HEIGHT,
            SPARK_PADDING);
        if (!shape) {
            svg.setAttribute('aria-label', symbol + ' has no trend to draw');
            return;
        }

        // The level the period started at. Without it the line shows the
        // shape of the month but not whether it ended above or below where
        // it began, which is the one thing a reader wants from a sparkline.
        var baseline = document.createElementNS(SVG_NS, 'line');
        baseline.setAttribute('class', 'inc-spark-base');
        baseline.setAttribute('x1', '0');
        baseline.setAttribute('x2', String(SPARK_WIDTH));
        baseline.setAttribute('y1', String(shape.baselineY));
        baseline.setAttribute('y2', String(shape.baselineY));
        svg.appendChild(baseline);

        var line = document.createElementNS(SVG_NS, 'path');
        line.setAttribute('class', 'inc-spark-line');
        line.setAttribute('d', shape.path);
        svg.appendChild(line);

        // No direction attribute, and so no direction colour: see the note in
        // css/market.css. The words below are where a reader is told which way
        // the month went, and they are the only place a screen reader can be.
        svg.setAttribute('aria-label', sparklineLabel(shape, figures, symbol));
    }

    /* The sparkline in words, because the picture is the one part of a tile a
     * screen reader cannot read. Spelled out rather than punctuated: a plus
     * sign is a reliable signal on screen and an unreliable one aloud. */
    function sparklineLabel(shape, figures, symbol) {
        var way = figures.direction(shape.change);
        if (way === 'flat' || shape.changePercent === null) {
            return symbol + ' thirty-day trend: unchanged over the period';
        }
        return symbol + ' thirty-day trend: ' + way + ' '
            + figures.formatPrice(Math.abs(shape.changePercent))
            + ' percent over the period';
    }

    function renderTile(tile, payload, figures) {
        var quote = figures.quoteFromBars(payload.bars);
        if (!quote) return false;

        dom.fill(tile, '[data-tile-price]', figures.formatPrice(quote.close));
        dom.fill(tile, '[data-tile-delta]', figures.formatSigned(quote.change));
        dom.fill(tile, '[data-tile-pct]', figures.formatPercent(quote.changePercent));
        dom.fill(tile, '[data-tile-arrow]', figures.arrowFor(quote.change));
        dom.setDirection(tile.querySelector('[data-tile-change]'),
            figures.direction(quote.change));

        var svg = tile.querySelector('[data-tile-spark]');
        if (svg) {
            drawSparkline(svg, figures.closingPrices(payload.bars, SPARK_DAYS),
                figures, tile.getAttribute('data-tile'));
        }

        tile.setAttribute('data-state', 'ready');
        return true;
    }

    /* One tile could not be filled while others could. It says so in its own
     * space rather than disappearing, because a grid that changes shape on a
     * failed request is a worse answer than a tile that admits it. */
    function failTile(tile, figures) {
        dom.fill(tile, '[data-tile-price]', figures.DASH);
        dom.fill(tile, '[data-tile-delta]', 'unavailable');
        dom.fill(tile, '[data-tile-pct]', '');
        dom.fill(tile, '[data-tile-arrow]', figures.arrowFor(null));
        dom.setDirection(tile.querySelector('[data-tile-change]'), 'flat');

        var svg = tile.querySelector('[data-tile-spark]');
        if (svg) {
            dom.empty(svg);
            svg.setAttribute('aria-label',
                tile.getAttribute('data-tile') + ' trend unavailable');
        }
        tile.setAttribute('data-state', 'error');
    }

    /* The shared provenance sentence, plus what is missing from this grid.
     *
     * The sentence itself is js/market-figures.js's, because the quote panel
     * has to make the same claim and two surfaces wording it separately is how
     * one of them ends up saying something weaker. The tile count is the part
     * only a grid of four can say. */
    function provenanceFor(payload, figures, missing) {
        var asOf = payload ? payload.bars[payload.bars.length - 1].date : '';
        var summary = figures.provenanceFor(payload, asOf);
        if (payload && missing > 0) {
            summary.message += ' ' + missing
                + (missing === 1 ? ' tile is' : ' tiles are') + ' unavailable.';
        }
        return summary;
    }

    function startIndexStrip() {
        var strip = document.querySelector('[data-index-strip]');
        var data = window.IncisorMarketData;
        var figures = window.IncisorMarketFigures;

        // No strip on the page, or a module that failed to load. The served
        // markup is all em dashes and says nothing has loaded, which is the
        // correct thing for it to keep saying.
        if (!strip || !data || !figures || !dom) return;

        var tiles = Array.prototype.slice.call(strip.querySelectorAll('[data-tile]'));
        if (tiles.length === 0) return;

        var provenance = document.querySelector('[data-provenance]');
        setProvenance(provenance, 'loading', 'Loading the latest close…');

        var settled = 0;
        var missing = 0;
        var first = null;

        function settle() {
            settled++;
            if (settled < tiles.length) return;
            var summary = provenanceFor(first, figures, missing);
            setProvenance(provenance, summary.state, summary.message);
        }

        tiles.forEach(function (tile) {
            data.history(tile.getAttribute('data-tile')).then(function (payload) {
                if (renderTile(tile, payload, figures)) {
                    if (!first) first = payload;
                } else {
                    missing++;
                    failTile(tile, figures);
                }
                settle();
            }, function () {
                // Deliberately silent. The failure is already on the screen in
                // the tile and the line beneath the grid, and a console error
                // on an offline service is noise in the check that has to stay
                // meaningful (tools/shoot.py fails the run on one).
                missing++;
                failTile(tile, figures);
                settle();
            });
        });
    }

    function setProvenance(node, state, message) {
        if (!node) return;
        node.setAttribute('data-provenance-state', state);
        dom.fill(node, '[data-provenance-message]', message);
    }

    startIndexStrip();
})();
