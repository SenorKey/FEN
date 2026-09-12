/* The equity curve: what the trading did, against having done nothing.
 *
 * The Trade tab's last surface and the only one that answers the question the
 * game is actually for — not "am I up?", which the summary answers, but "am I
 * up by more than buying the market once and leaving it alone?" A reader up
 * 3% in a month that SPY spent up 5% has lost to the alternative, and no
 * figure above this one says so.
 *
 * The arithmetic is js/portfolio-history.js and the geometry is
 * js/chart-geometry.js — the same plot() the price chart draws through, given
 * an explicit scale so both lines share one axis. Nothing here computes a
 * coordinate or a value: it decides what is on screen and what the card says
 * about it, which is what lets tests/performance_model.jxa.js drive it
 * against a DOM stub.
 *
 * It is the one surface on this tab that fetches. The holdings table and the
 * trade log read what js/view-portfolio.js already has, but a curve needs a
 * series for every symbol the ledger has *ever* touched — a position bought
 * and sold in March is part of what the line did in March — and those are not
 * symbols in play any more. So it asks for what is missing and no more, and
 * refuses past js/portfolio-history.js's symbol limit rather than drawing a
 * line with a holding left out of it.
 *
 * Contract with the markup: a [data-performance] block whose data-state is
 * one of pending / loading / ready / unavailable, empty until this runs.
 */

(function (global) {
    'use strict';

    var dom = global.IncisorDom;
    var data = global.IncisorMarketData;
    var figures = global.IncisorMarketFigures;
    var geometry = global.IncisorChartGeometry;
    var historyMath = global.IncisorPortfolioHistory;
    var clock = global.IncisorMarketClock;
    var portfolio = global.IncisorPortfolio;

    var root = document.querySelector('[data-performance]');

    var SVG_NS = 'http://www.w3.org/2000/svg';

    /* The drawing's own coordinate space. The SVG scales to its box, so these
     * are a shape rather than a size — the same arrangement js/chart-canvas.js
     * uses, and the reason nothing here reads a pixel off the page. */
    var WIDTH = 720;
    var HEIGHT = 220;
    var PADDING = 10;

    /* Three gridline labels over a 200px box. The price chart asks for more
     * because a reader reads a price off it; nobody reads a balance off this
     * one, they read whether two lines diverged, so the scale only has to
     * establish how much a given height is worth. */
    var SCALE_TICKS = 3;

    /* What a reader is told when the curve cannot be drawn. Each says what is
     * missing rather than that something failed, because every one of these
     * is an ordinary state of a paper portfolio and not an error. */
    var REASONS = {
        'no-trades': 'Your first trade starts this chart. It compares what '
            + 'your portfolio did with what the whole $100,000 would have done '
            + 'in SPY over the same days.',
        'too-short': 'This chart needs two days of trading to draw a line. It '
            + 'will appear once the market has closed again.',
        'missing-prices': 'Prices for one of the symbols you have traded could '
            + 'not be loaded, so this chart would be missing part of what your '
            + 'portfolio was worth.',
        'no-benchmark': 'SPY’s prices could not be loaded, so there is '
            + 'nothing to compare against.',
        'no-sessions': 'No trading day in your history could be priced yet.',
        'unreplayable': 'Your trade history could not be replayed day by day.',
        'unavailable': 'This chart is unavailable.'
    };

    var nodes = {};
    var fetching = false;

    /* symbol -> bars, for the closed-out symbols this module fetched itself.
     * What js/view-portfolio.js holds is read through it and never copied
     * here, so a price that arrives late is seen rather than remembered. */
    var extra = {};

    /* Symbols asked for and answered, however they answered. A symbol whose
     * request failed must not be asked for again on every redraw. */
    var asked = {};

    function element(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function svg(tag, attributes) {
        var node = document.createElementNS(SVG_NS, tag);
        Object.keys(attributes).forEach(function (name) {
            node.setAttribute(name, attributes[name]);
        });
        return node;
    }

    /* ── Building ───────────────────────────────────────────────── */

    function legendEntry(className, label) {
        var item = element('li', 'inc-perf-key');
        var swatch = element('span', 'inc-perf-swatch ' + className);
        swatch.setAttribute('aria-hidden', 'true');
        item.appendChild(swatch);
        item.appendChild(element('span', 'inc-perf-key-label', label));
        var figure = element('span', 'inc-perf-key-figure');
        item.appendChild(figure);
        return { item: item, figure: figure };
    }

    function build() {
        var heading = element('h3', 'inc-section-heading', 'Against buy and hold');
        heading.id = 'inc-perf-heading';

        nodes.note = element('p', 'inc-panel-note', 'Your portfolio against the '
            + 'whole $100,000 put into SPY on the day before your first trade '
            + 'and left alone. The benchmark buys a fraction of a share, which '
            + 'you cannot — that is the only way the two start from the '
            + 'same figure.');

        nodes.message = element('p', 'inc-empty');

        nodes.figure = element('figure', 'inc-perf-figure');

        // Plot and scale in a row, dates under it, the way the price chart
        // arranges the same three parts. A line with no axis shows a shape
        // and hides its size: this one's wiggle could be fifty dollars or
        // five thousand, and js/chart-geometry.js says in as many words that
        // the labels are what make the scale explicit.
        var row = element('div', 'inc-perf-row');
        nodes.plot = svg('svg', {
            viewBox: '0 0 ' + WIDTH + ' ' + HEIGHT,
            preserveAspectRatio: 'none',
            class: 'inc-perf-plot',
            role: 'img'
        });
        row.appendChild(nodes.plot);
        nodes.scale = element('ul', 'inc-perf-scale');
        row.appendChild(nodes.scale);
        nodes.figure.appendChild(row);

        nodes.dates = element('ul', 'inc-perf-dates');
        nodes.figure.appendChild(nodes.dates);

        var legend = element('ul', 'inc-perf-legend');
        nodes.mine = legendEntry('inc-perf-swatch-mine', 'Your portfolio');
        nodes.theirs = legendEntry('inc-perf-swatch-theirs', 'SPY, bought and held');
        legend.appendChild(nodes.mine.item);
        legend.appendChild(nodes.theirs.item);
        nodes.figure.appendChild(legend);

        nodes.verdict = element('figcaption', 'inc-perf-verdict');
        nodes.figure.appendChild(nodes.verdict);

        root.appendChild(heading);
        root.appendChild(nodes.note);
        root.appendChild(nodes.message);
        root.appendChild(nodes.figure);
    }

    /* ── Drawing ────────────────────────────────────────────────── */

    /* One series in the shape plot() reads. The curve is money in cents and a
     * price chart is dollars a share, but the geometry only ever divides one
     * close by another, so the unit never reaches it. */
    function seriesOf(points, key) {
        return points.map(function (point) {
            return { date: point.date, close: point[key] };
        });
    }

    function line(shape, className) {
        return svg('path', { d: shape.path, class: className, fill: 'none' });
    }

    function draw(curve) {
        var mine = seriesOf(curve.points, 'value');
        var theirs = seriesOf(curve.points, 'benchmark');

        // One scale for both, measured across the pair: two lines each
        // scaled to itself can put the loser above the winner.
        var both = [];
        [mine, theirs].forEach(function (series) {
            series.forEach(function (point) { both.push(point.close); });
        });
        var bounds = { low: Math.min.apply(null, both),
            high: Math.max.apply(null, both) };

        var shapeMine = geometry.plot(mine, WIDTH, HEIGHT, PADDING, bounds);
        var shapeTheirs = geometry.plot(theirs, WIDTH, HEIGHT, PADDING, bounds);
        if (!shapeMine || !shapeTheirs || !shapeMine.path || !shapeTheirs.path) {
            return false;
        }

        dom.empty(nodes.plot);

        // The starting balance, which is what both lines began at and the one
        // level on this chart that means something on its own.
        var startY = shapeMine.yForPrice(curve.startingCash);
        nodes.plot.appendChild(svg('line', { x1: 0, x2: WIDTH, y1: startY, y2: startY,
            class: 'inc-perf-baseline' }));

        // The benchmark first, so the reader's own line is the one on top
        // where they cross.
        nodes.plot.appendChild(line(shapeTheirs, 'inc-perf-line-theirs'));
        nodes.plot.appendChild(line(shapeMine, 'inc-perf-line-mine'));

        drawScale(shapeMine, bounds);
        drawDates(curve);
        return true;
    }

    /* A label's position as a percentage of the drawing's height, set as a
     * custom property the way js/chart-canvas.js places the price scale. The
     * SVG scales to its box, so a percentage is the only coordinate that
     * survives the box changing size. */
    function place(node, y) {
        node.style.setProperty('--inc-perf-y',
            ((y / HEIGHT) * 100).toFixed(3) + '%');
    }

    function drawScale(shape, bounds) {
        dom.empty(nodes.scale);
        // Ticked in dollars, not cents: the round numbers a reader wants are
        // round dollars, and niceStep would otherwise land on 2,500 cents.
        var ticks = geometry.priceTicks(bounds.low / 100, bounds.high / 100,
            SCALE_TICKS);
        ticks.values.forEach(function (value) {
            // Exact dollars, not formatBigMoney's "$102.0K" — that rounds a
            // scale whose whole range is a few thousand into three labels a
            // reader cannot tell apart, and js/market-figures.js says as much
            // beside formatMoney: the abbreviation is for revenue nobody will
            // reconcile, and this is a balance checked against real trades.
            var label = element('li', 'inc-perf-scale-label',
                '$' + figures.formatToPlaces(value, ticks.decimals));
            place(label, shape.yForPrice(value * 100));
            nodes.scale.appendChild(label);
        });
    }

    /* Only the two ends. The price chart spaces several dates across its
     * width because a reader hunts for one; here the window is what the
     * sentence below already names, and the axis only has to say where the
     * line starts and stops. */
    function drawDates(curve) {
        dom.empty(nodes.dates);
        [['from', 'inc-perf-date-first'], ['to', 'inc-perf-date-last']]
            .forEach(function (pair) {
                nodes.dates.appendChild(element('li',
                    'inc-perf-date-label ' + pair[1],
                    figures.formatAxisDate(curve[pair[0]], false)));
            });
    }

    /* ── Saying what it shows ───────────────────────────────────── */

    function signed(cents) {
        return figures.formatSignedMoney(cents / 100);
    }

    function keyFigure(entry, change) {
        entry.figure.textContent = signed(change.gain) + ' ('
            + figures.formatPercent(change.percent) + ')';
        dom.setDirection(entry.figure, figures.direction(change.gain));
    }

    /* The sentence the whole surface exists for. It states the gap and what
     * each side did, and it does not tell the reader what to make of it —
     * guide section 11 forbids this page advising anyone, and "you would have
     * done better buying the index" is advice about what to do next dressed
     * as a fact about the past. */
    function verdictText(curve) {
        var span = figures.formatAxisDate(curve.from, true) + ' to '
            + figures.formatAxisDate(curve.to, true);
        if (curve.difference === 0) {
            return 'Over ' + span + ' your trading and buying SPY once came out '
                + 'level, to the cent.';
        }
        var ahead = curve.difference > 0;
        return 'Over ' + span + ' your trading is '
            + figures.formatMoney(Math.abs(curve.difference) / 100)
            + (ahead ? ' ahead of' : ' behind') + ' buying SPY once and holding it.';
    }

    function describePlot(curve) {
        return 'Two lines from ' + figures.formatAxisDate(curve.from, true)
            + ' to ' + figures.formatAxisDate(curve.to, true)
            + '. Your portfolio ' + signed(curve.value.gain)
            + ', SPY bought and held ' + signed(curve.benchmark.gain)
            + '. Both started at ' + figures.formatMoney(curve.startingCash / 100)
            + '. The figures beside the key say the same thing.';
    }

    /* ── Rendering ──────────────────────────────────────────────── */

    function seriesAvailable() {
        var bars = {};
        var wanted = historyMath.symbolsIn(portfolio.store().ledger());
        wanted.push(historyMath.BENCHMARK);
        wanted.forEach(function (symbol) {
            var held = portfolio.barsFor(symbol) || extra[symbol];
            if (held) bars[symbol] = held;
        });
        return bars;
    }

    function unavailable(reason) {
        nodes.message.textContent = REASONS[reason] || REASONS.unavailable;
        nodes.message.hidden = false;
        nodes.figure.hidden = true;
        nodes.note.hidden = reason === 'no-trades';
        root.setAttribute('data-state', reason === 'no-trades' ? 'pending' : 'unavailable');
    }

    function render() {
        var store = portfolio.store();
        var curve = historyMath.curve(store.ledger(), store.state().startingCash,
            seriesAvailable(), clock);

        if (curve.reason) {
            // A symbol that has been asked for and not answered yet is not a
            // missing price, it is a price on its way.
            if (curve.reason === 'missing-prices' && fetching) {
                nodes.message.textContent = '';
                nodes.message.hidden = true;
                nodes.figure.hidden = true;
                nodes.note.hidden = false;
                root.setAttribute('data-state', 'loading');
                return;
            }
            unavailable(curve.reason);
            if (curve.reason === 'too-many-symbols') {
                nodes.message.textContent = 'You have traded ' + curve.symbols
                    + ' symbols, and this chart can price ' + curve.limit
                    + '. Drawing it without one of them would show a portfolio '
                    + 'you never had.';
            }
            return;
        }

        if (!draw(curve)) {
            unavailable('unavailable');
            return;
        }

        keyFigure(nodes.mine, curve.value);
        keyFigure(nodes.theirs, curve.benchmark);
        nodes.verdict.textContent = verdictText(curve);
        nodes.plot.setAttribute('aria-label', describePlot(curve));

        nodes.message.hidden = true;
        nodes.note.hidden = false;
        nodes.figure.hidden = false;
        root.setAttribute('data-state', 'ready');
    }

    /* Series for symbols the ledger touched that the Trade tab is not already
     * pricing — closed-out positions. Asked for once each, however they
     * answer, and the curve is drawn again as they land. */
    function fetchMissing() {
        var store = portfolio.store();
        var wanted = historyMath.symbolsIn(store.ledger());
        wanted.push(historyMath.BENCHMARK);

        var missing = wanted.filter(function (symbol) {
            return !portfolio.barsFor(symbol) && !asked[symbol];
        });
        if (missing.length === 0 || wanted.length > historyMath.SYMBOL_LIMIT) return;

        fetching = true;
        var outstanding = missing.length;
        missing.forEach(function (symbol) {
            asked[symbol] = true;
            data.history(symbol).then(function (payload) {
                extra[symbol] = payload.bars;
                if (payload.source === 'fixture') portfolio.sawSample();
                done();
            }, function () {
                // Silent in the console, like the watchlist's: the failure is
                // stated on screen, and tools/shoot.py fails a run on an error.
                done();
            });
        });

        function done() {
            outstanding -= 1;
            if (outstanding === 0) fetching = false;
            render();
        }
    }

    function start() {
        if (!root || !dom || !data || !figures || !geometry || !historyMath
                || !clock || !portfolio || !portfolio.store()) {
            return;
        }

        build();
        portfolio.onChange(function () {
            render();
            fetchMissing();
        });
        render();
        fetchMissing();
    }

    start();
})(typeof window !== 'undefined' ? window : this);
