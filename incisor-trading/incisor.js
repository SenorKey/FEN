/* App shell for /incisor-trading.
 *
 * Three things: the tab controller for the three page modes (Dashboard /
 * Trade / Learn), the view that drives the market clock, and the view that
 * fills the index summary strip.
 *
 * None of the logic is here. js/market-clock.js decides what the market is
 * doing, js/market-figures.js does the arithmetic and the formatting, and
 * js/market-data.js is the only thing that touches the network. All three are
 * separately testable without a DOM; this file only decides what to put on
 * screen and when.
 *
 * The portfolio arrives in later tasks and gets its own module under js/.
 *
 * Contract with the markup: a .inc-tablist containing [role=tab] buttons,
 * each with aria-controls pointing at a [role=tabpanel]. Exactly one tab
 * carries aria-selected="true" and tabindex="0" in the served HTML; the
 * rest are tabindex="-1" and their panels carry the `hidden` attribute.
 * That means the page is already in a correct, readable state before this
 * script runs, and stays in one if it never runs at all.
 *
 * Keyboard model is the standard ARIA tabs pattern: arrows move and
 * activate, Home/End jump to the ends, Tab leaves the strip for the panel.
 *
 * Deep-linking a tab from the URL is deliberately left out. It is a real
 * feature, but it belongs with the rest of mode routing rather than bolted
 * onto a skeleton.
 */

(function () {
    'use strict';

    /* ── Market clock ───────────────────────────────────────────── */

    /* Reticks every second. That is only visibly busy in the last hour before
     * an event, because formatCountdown drops to whole minutes above that —
     * and the DOM is only written when the string actually changed, so the
     * common case is a comparison and nothing else. */
    var CLOCK_TICK_MS = 1000;

    function startMarketClock() {
        var clock = document.querySelector('[data-clock]');
        var api = window.IncisorMarketClock;

        // No clock on the page, or the module failed to load. Either way the
        // served markup already says something true about market hours, so
        // leaving it alone is the correct degradation.
        if (!clock || !api) return;

        var stateNode = clock.querySelector('[data-clock-state]');
        var detailNode = clock.querySelector('[data-clock-detail]');
        if (!stateNode || !detailNode) return;

        function detailFor(session) {
            if (session.holiday) {
                return session.holiday + ' \u00b7 opens in '
                    + api.formatCountdown(session.next.seconds);
            }
            var verb = session.next.event === 'close' ? 'Closes in ' : 'Opens in ';
            var detail = verb + api.formatCountdown(session.next.seconds);
            // Worth saying out loud: on an early-close day the market shuts at
            // 1pm, and a countdown that just runs out is a confusing way to
            // find that out.
            return session.isEarlyClose ? detail + ' \u00b7 early close' : detail;
        }

        function render() {
            var session = api.sessionAt(new Date());
            if (!session.next) return;

            var detail = detailFor(session);

            // Text only, never markup — and compared before writing, so a
            // once-a-second tick is not a once-a-second reflow.
            if (stateNode.textContent !== session.label) {
                stateNode.textContent = session.label;
            }
            if (detailNode.textContent !== detail) {
                detailNode.textContent = detail;
            }
            if (clock.getAttribute('data-phase') !== session.phase) {
                clock.setAttribute('data-phase', session.phase);
            }
        }

        render();
        window.setInterval(render, CLOCK_TICK_MS);
    }

    startMarketClock();

    /* ── Index summary strip ────────────────────────────────────── */

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

    function fillIn(root, selector, value) {
        var node = root.querySelector(selector);
        // Text, never markup: everything written here arrived over the
        // network, and a ticker or a company name is an attacker-influenced
        // string (guide §5). The page tests grep for the markup-writing
        // property by name, so it is not spelled out even in a comment.
        if (node) node.textContent = value;
    }

    function setDirection(node, way) {
        if (!node) return;
        node.classList.remove('inc-up', 'inc-down', 'inc-flat');
        node.classList.add('inc-' + way);
    }

    /* Replaces the sparkline's contents. Built with createElementNS rather
     * than a markup string because an SVG element created any other way is
     * silently in the wrong namespace and renders as nothing. */
    function drawSparkline(svg, closes, figures, symbol) {
        while (svg.firstChild) svg.removeChild(svg.firstChild);

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

        fillIn(tile, '[data-tile-price]', figures.formatPrice(quote.close));
        fillIn(tile, '[data-tile-delta]', figures.formatSigned(quote.change));
        fillIn(tile, '[data-tile-pct]', figures.formatPercent(quote.changePercent));
        fillIn(tile, '[data-tile-arrow]', figures.arrowFor(quote.change));
        setDirection(tile.querySelector('[data-tile-change]'),
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
        fillIn(tile, '[data-tile-price]', figures.DASH);
        fillIn(tile, '[data-tile-delta]', 'unavailable');
        fillIn(tile, '[data-tile-pct]', '');
        fillIn(tile, '[data-tile-arrow]', figures.arrowFor(null));
        setDirection(tile.querySelector('[data-tile-change]'), 'flat');

        var svg = tile.querySelector('[data-tile-spark]');
        if (svg) {
            while (svg.firstChild) svg.removeChild(svg.firstChild);
            svg.setAttribute('aria-label',
                tile.getAttribute('data-tile') + ' trend unavailable');
        }
        tile.setAttribute('data-state', 'error');
    }

    /* Where the numbers came from, in a sentence.
     *
     * The distinction that matters most is the first one: in fixture mode
     * every figure above is generated, and the service says so in `source`
     * rather than the page assuming it. Presenting invented prices as quotes
     * is the failure this line exists to prevent (guide §10). */
    function provenanceFor(payload, figures, missing) {
        if (!payload) {
            return {
                state: 'error',
                message: 'Market data unavailable. The price service could not '
                    + 'be reached, so no prices are shown.'
            };
        }

        var asOf = figures.formatBarDate(payload.bars[payload.bars.length - 1].date);
        var delay = payload.delay || 'delayed';
        var message;
        var state;

        if (payload.source === 'fixture') {
            state = 'sample';
            message = 'Sample data · generated prices, not real quotes · '
                + delay + ' bars to ' + asOf + '.';
        } else if (payload.stale) {
            state = 'stale';
            message = 'Delayed data · ' + delay + ' close, ' + asOf
                + '. This is the last close held; it could not be refreshed.';
        } else {
            state = 'live';
            message = 'Delayed data · ' + delay + ' close, ' + asOf + '.';
        }

        if (missing > 0) {
            message += ' ' + missing + (missing === 1 ? ' tile is' : ' tiles are')
                + ' unavailable.';
        }
        return { state: state, message: message };
    }

    function startIndexStrip() {
        var strip = document.querySelector('[data-index-strip]');
        var data = window.IncisorMarketData;
        var figures = window.IncisorMarketFigures;

        // No strip on the page, or a module that failed to load. The served
        // markup is all em dashes and says nothing has loaded, which is the
        // correct thing for it to keep saying.
        if (!strip || !data || !figures) return;

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
        fillIn(node, '[data-provenance-message]', message);
    }

    startIndexStrip();

    /* ── Tabs ───────────────────────────────────────────────────── */

    var tablist = document.querySelector('.inc-tablist');
    if (!tablist) return;

    var tabs = Array.prototype.slice.call(tablist.querySelectorAll('[role="tab"]'));
    if (tabs.length === 0) return;

    function panelFor(tab) {
        var id = tab.getAttribute('aria-controls');
        return id ? document.getElementById(id) : null;
    }

    /* Selects one tab and deselects the rest, moving the roving tabindex with
     * it. `focusTab` is false for a plain click, so the click doesn't fight the
     * browser's own focus handling. */
    function select(tab, focusTab) {
        tabs.forEach(function (candidate) {
            var isTarget = candidate === tab;
            var panel = panelFor(candidate);

            candidate.setAttribute('aria-selected', isTarget ? 'true' : 'false');
            candidate.setAttribute('tabindex', isTarget ? '0' : '-1');
            if (panel) panel.hidden = !isTarget;
        });

        if (focusTab) tab.focus();
    }

    tablist.addEventListener('click', function (event) {
        var tab = event.target.closest('[role="tab"]');
        if (tab) select(tab, false);
    });

    tablist.addEventListener('keydown', function (event) {
        var current = tabs.indexOf(event.target);
        if (current === -1) return;

        var next;
        switch (event.key) {
            case 'ArrowLeft':
                next = (current - 1 + tabs.length) % tabs.length;
                break;
            case 'ArrowRight':
                next = (current + 1) % tabs.length;
                break;
            case 'Home':
                next = 0;
                break;
            case 'End':
                next = tabs.length - 1;
                break;
            default:
                return;
        }

        // Only now, once a key we handle is confirmed, so Tab and the rest
        // keep their native behaviour.
        event.preventDefault();
        select(tabs[next], true);
    });
})();
