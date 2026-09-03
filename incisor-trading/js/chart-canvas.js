/* The picture the price chart draws: gridlines, the line and its area, the
 * level the window opened at, the point markers, the cursor, and the two axes.
 *
 * Split out of js/view-price-chart.js when that file crossed the 600-line rule
 * (guide §6), along the seam its own header already described. Everything here
 * writes into the four drawing elements and nothing here decides anything: the
 * view picks the range, computes the shape through js/chart-geometry.js and
 * says what the card reads; this turns one shape into nodes.
 *
 * Two things are drawn as HTML over the SVG rather than inside it: the axis
 * labels and the round markers. The plot is stretched to its container with
 * preserveAspectRatio="none", so a circle in that coordinate system comes out
 * an ellipse and text comes out smeared — while an HTML element positioned at
 * a percentage lands in exactly the same place and stays itself. Straight
 * lines are unaffected, so those stay in the SVG where they belong.
 *
 * Exposes window.IncisorChartCanvas.
 */

(function (global) {
    'use strict';

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
     * scale a reader has to interpolate rather than read.
     *
     * It is a request and not a promise: measured across the fixture series,
     * 6M lands six labels and 1Y and 5Y land three, because a 605-to-785 band
     * asks for a step of 30 and the family's next size up is 50. Three labels
     * at 650, 700 and 750 is still a scale you read rather than interpolate,
     * so the jump is left alone. Looked at in the T8 audit; do not "even it
     * out" by adding sizes the family does not have. */
    var PRICE_TICKS = 6;
    var DATE_TICKS = 4;

    /* At or below this many sessions the line is sparse enough that the
     * individual closes are the point, so each one gets a marker. Above it
     * they would merge into a thicker line and say nothing. */
    var DOT_LIMIT = 12;

    /* A drawing surface over one chart's four elements.
     *
     * Built rather than global so the module holds no state of its own: every
     * element it writes to arrives here once, and nothing else can be reached
     * from inside.
     */
    function create(elements, document) {
        var dom = global.IncisorDom;
        var figures = global.IncisorMarketFigures;
        var geometry = global.IncisorChartGeometry;

        var canvas = elements.canvas;
        var marks = elements.marks;
        var scale = elements.scale;
        var dates = elements.dates;

        function svgNode(tag, className) {
            var node = document.createElementNS(SVG_NS, tag);
            node.setAttribute('class', className);
            return node;
        }

        /* Positions an absolutely placed label or marker.
         *
         * Written as custom properties through the CSSOM rather than as a
         * style attribute: a strict Content-Security-Policy (T13) blocks the
         * attribute and not this, and it keeps the arithmetic here and the
         * drawing in the stylesheet.
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

        function horizontal(className, y) {
            var line = svgNode('line', className);
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

        function drawCursorLine() {
            var line = svgNode('line', 'inc-chart-cursor-line');
            line.setAttribute('y1', '0');
            line.setAttribute('y2', String(VIEW_HEIGHT));
            line.setAttribute('x1', '0');
            line.setAttribute('x2', '0');
            line.setAttribute('data-chart-cursor-line', '');
            canvas.appendChild(line);
        }

        /* The first and last markers sit astride the plot border rather than
         * inside it, and that is deliberate: those sessions *are* the window's
         * ends, and the axis labels are pinned to the same two edges, so a
         * marker pulled inward would disagree with the date under it. Looked
         * at in the T8 audit and left; do not inset them. */
        function marker(className) {
            var dot = document.createElement('span');
            dot.className = className;
            marks.appendChild(dot);
            return dot;
        }

        function drawPlot(shape) {
            dom.empty(canvas);
            dom.empty(marks);

            var ticks = geometry.priceTicks(shape.low, shape.high, PRICE_TICKS);
            ticks.values.forEach(function (value) {
                horizontal('inc-chart-grid', shape.yForPrice(value));
            });

            if (shape.area) drawPath('path', 'inc-chart-area', shape.area);
            // The level the window opened at, dashed, exactly as the tile
            // sparklines draw it: it says whether the range ended above or
            // below where it started without the line having to be coloured
            // to say so. See the note in css/market.css.
            horizontal('inc-chart-base', shape.baselineY);
            if (shape.path) drawPath('path', 'inc-chart-line', shape.path);

            if (shape.points.length <= DOT_LIMIT) {
                shape.points.forEach(function (point) {
                    place(marker('inc-chart-dot'), point.x, point.y);
                });
            }

            drawCursorLine();
            marker('inc-chart-cursor-dot')
                .setAttribute('data-chart-cursor-dot', '');
            return ticks;
        }

        function drawScale(shape, ticks) {
            dom.empty(scale);
            ticks.values.forEach(function (value) {
                var label = document.createElement('li');
                label.className = 'inc-chart-scale-label';
                label.textContent =
                    figures.formatToPlaces(value, ticks.decimals);
                place(label, null, shape.yForPrice(value));
                scale.appendChild(label);
            });
        }

        function drawDates(shape, visible) {
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

        return {
            WIDTH: VIEW_WIDTH,
            HEIGHT: VIEW_HEIGHT,
            PADDING: VIEW_PADDING,

            /* One shape, drawn: the plot and both axes together, because an
             * axis that outlived the line beside it would be a scale for a
             * window nobody is looking at. */
            draw: function (shape, visible) {
                var ticks = drawPlot(shape);
                drawScale(shape, ticks);
                drawDates(shape, visible);
            },

            clear: function () {
                dom.empty(canvas);
                dom.empty(marks);
                dom.empty(scale);
                dom.empty(dates);
            },

            /* The crosshair, moved to a point the view has already chosen.
             * Whether it is shown at all is the surface's business and stays
             * in the view. */
            cursorTo: function (point) {
                var line = canvas.querySelector('[data-chart-cursor-line]');
                var dot = marks.querySelector('[data-chart-cursor-dot]');
                if (!line || !dot) return;
                line.setAttribute('x1', String(point.x));
                line.setAttribute('x2', String(point.x));
                place(dot, point.x, point.y);
            }
        };
    }

    global.IncisorChartCanvas = { create: create };
})(typeof window !== 'undefined' ? window : this);
