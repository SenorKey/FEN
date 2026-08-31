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

    /* The drawing, the window it covers and the words a screen reader gets
     * instead of it are js/sparkline.js — the watchlist rows draw the same
     * line from the same payload, so it is written down once. */
    var spark = window.IncisorSparkline;

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
        if (svg && spark) {
            spark.draw(svg, figures.closingPrices(payload.bars, spark.DAYS),
                tile.getAttribute('data-tile'));
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
        if (svg && spark) spark.unavailable(svg, tile.getAttribute('data-tile'));
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
