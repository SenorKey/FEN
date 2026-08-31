/* Drawing a sparkline into an SVG element, for every surface that has one.
 *
 * Two surfaces do: the index tiles and the watchlist rows. Both are answering
 * the same question with the same shape from the same payload, so the drawing
 * is written once here rather than a second time in the view that came later.
 *
 * The seam is the one js/chart-canvas.js already runs on — this appends nodes
 * and decides nothing. What the line is *of*, how many days it covers and
 * where it goes are the view's; the geometry is js/market-figures.js. What is
 * left, and what belongs in exactly one place, is the pair of shapes and the
 * sentence a screen reader is given instead of them.
 *
 * Deliberately not coloured by direction, on either surface. The line covers
 * thirty sessions and the change beside it covers one, so colouring both meant
 * a row could show a green arrow above a red line and be entirely correct;
 * see DECISIONS.md. The opening level is drawn instead, and the words below
 * say which way the window went.
 *
 * Exposes window.IncisorSparkline.
 */

(function (global) {
    'use strict';

    var SVG_NS = 'http://www.w3.org/2000/svg';

    /* A month of trading days. Long enough to have a shape, short enough that
     * the shape is about now rather than about the spring. */
    var DAYS = 30;

    /* Drawing units, not pixels: every sparkline is stretched to its
     * container with preserveAspectRatio="none", and the padding keeps the
     * stroke off the edges at whatever width it lands on. */
    var WIDTH = 120;
    var HEIGHT = 34;
    var PADDING = 3;

    var dom = global.IncisorDom;

    /* The line in words, because the picture is the one part of a row a screen
     * reader cannot read. Spelled out rather than punctuated: a plus sign is a
     * reliable signal on screen and an unreliable one aloud. */
    function label(shape, figures, symbol) {
        var way = figures.direction(shape.change);
        if (way === 'flat' || shape.changePercent === null) {
            return symbol + ' thirty-day trend: unchanged over the period';
        }
        return symbol + ' thirty-day trend: ' + way + ' '
            + figures.formatPrice(Math.abs(shape.changePercent))
            + ' percent over the period';
    }

    function line(className, attributes) {
        var node = document.createElementNS(SVG_NS, 'line');
        node.setAttribute('class', className);
        Object.keys(attributes).forEach(function (name) {
            node.setAttribute(name, String(attributes[name]));
        });
        return node;
    }

    /* Replaces an SVG's contents with the shape of `closes`, and names it.
     *
     * Built with createElementNS rather than a markup string because an SVG
     * element created any other way is silently in the wrong namespace and
     * renders as nothing at all.
     *
     * Returns the shape, or null when there was nothing to draw — a series of
     * one bar has no trend, and saying so is the caller's job.
     */
    function draw(svg, closes, symbol) {
        var figures = global.IncisorMarketFigures;
        if (!svg || !dom || !figures) return null;

        dom.empty(svg);

        var shape = figures.sparkline(closes, WIDTH, HEIGHT, PADDING);
        if (!shape) {
            svg.setAttribute('aria-label', symbol + ' has no trend to draw');
            return null;
        }

        // The level the period started at. Without it the line shows the
        // shape of the month but not whether it ended above or below where it
        // began, which is the one thing a reader wants from a sparkline.
        svg.appendChild(line('inc-spark-base', {
            x1: 0, x2: WIDTH, y1: shape.baselineY, y2: shape.baselineY
        }));

        var path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('class', 'inc-spark-line');
        path.setAttribute('d', shape.path);
        svg.appendChild(path);

        svg.setAttribute('aria-label', label(shape, figures, symbol));
        return shape;
    }

    /* A row or tile that could not be priced. The element keeps its reserved
     * space and says why, rather than leaving the last symbol's line on screen
     * under this one's name. */
    function unavailable(svg, symbol) {
        if (!svg || !dom) return;
        dom.empty(svg);
        svg.setAttribute('aria-label', symbol + ' trend unavailable');
    }

    /* An SVG element ready to be drawn into, for the views that build their
     * rows rather than serving them. The served tiles carry the same
     * attributes in the markup, where they are also the reserved space. */
    function element(className, symbol) {
        var svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('class', className);
        svg.setAttribute('viewBox', '0 0 ' + WIDTH + ' ' + HEIGHT);
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', 'Thirty-day trend for ' + symbol
            + ', not loaded');
        return svg;
    }

    global.IncisorSparkline = {
        DAYS: DAYS,
        WIDTH: WIDTH,
        HEIGHT: HEIGHT,
        draw: draw,
        unavailable: unavailable,
        element: element
    };
})(typeof window !== 'undefined' ? window : this);
