/* The sector grid — which slices of the market have led, and by how much.
 *
 * The dashboard's fourth surface, and the only one that ranks. The strip says
 * what the market did, the quote card says what one symbol did, the watchlist
 * says what yours did; this says what the market did *underneath* the index,
 * which is the question the four tiles cannot answer no matter how long you
 * look at them.
 *
 * One request answers all four windows. /sectors sends forty-four figures
 * rather than eleven series, so pressing 1M after YTD re-sorts what is already
 * here and costs nothing — the same bargain js/view-price-chart.js strikes
 * with one series and five ranges. Why the grid has no one-day window, and why
 * its series are refreshed weekly, is written down in server/sectors.py: the
 * budget is 22 upstream calls a day and this surface is eleven of them.
 *
 * The bar is the point of the surface. Eleven percentages in a column is a
 * lookup; eleven lengths against a shared zero line is a shape, and the shape
 * is readable before a single figure has been. It is decorative — everything
 * it shows, the figure beside it says in words — so it is aria-hidden, and
 * the ordered list carries the ranking for a reader who never sees it.
 *
 * The arithmetic that matters is the server's. What is left here is the bar
 * axis, which is pure and is exported so it can be checked without a browser
 * (tests/sectors_model.jxa.js).
 *
 * Contract with the markup: a [data-sector] block whose data-state is one of
 * loading / ready / error, holding [data-sector-windows] buttons carrying
 * [data-sector-window], an empty [data-sector-list], a [data-sector-message]
 * and a [data-sector-provenance] line.
 *
 * Exposes window.IncisorSectors.
 */

(function (global) {
    'use strict';

    var dom = global.IncisorDom;

    /* Space left past the longest bar, as a share of the axis. A bar that
     * runs flush into the end of its track reads as clipped rather than as
     * longest. */
    var HEADROOM = 0.06;

    /* The narrowest span the axis will draw. A window where every sector
     * moved a tenth of a percent is a quiet window, and stretching it to fill
     * the track would draw a dramatic ranking of nothing. */
    var MIN_SPAN_PERCENT = 2;

    /* ── State ──────────────────────────────────────────────────── */

    /* The last payload that answered, or null. Kept because every window is
     * already in it: switching windows re-reads this rather than re-fetching. */
    var loaded = null;

    /* The window on screen. Read from the markup so the served page and the
     * script cannot disagree about which button is pressed. */
    var chosen = null;

    /* ── Elements ───────────────────────────────────────────────── */

    var panel = document.querySelector('[data-sector]');
    var list = panel && panel.querySelector('[data-sector-list]');
    var windows = panel && panel.querySelector('[data-sector-windows]');

    var data = global.IncisorMarketData;
    var figures = global.IncisorMarketFigures;

    /* ── The bar scale ──────────────────────────────────────────── */

    /* The axis every bar in one window is drawn against, or null if nothing
     * in the window has a figure.
     *
     * Zero is always on the axis and rarely in the middle of it. A fixed
     * centre line is the obvious way to draw a diverging bar chart and it
     * wastes half the width every time a window is one-sided — which sector
     * windows usually are: eleven sectors up and two down leaves the entire
     * left half of every row empty grey. So the axis spans the data plus
     * zero, and the zero line lands where zero actually falls. Bars stay
     * comparable because every row shares one axis; they just get the whole
     * track to be compared across.
     *
     * Seeded at zero on both ends, which is what guarantees the zero line is
     * somewhere on the track rather than off the end of an all-positive
     * window.
     *
     * **The trade, worth knowing before anyone "fixes" it.** Because the axis
     * is the window's own range, a bar length means "relative to the biggest
     * mover in this window" and never "this many percent" — the same sector
     * at the same figure draws a different length under a different window.
     * That is why the figure sits on the row in words and the bar is
     * aria-hidden: the bar ranks, and the number measures.
     *
     * Pure, and exported for the same reason js/chart-geometry.js is: it can
     * then be checked against hand-computed values with no DOM at all.
     */
    function axisFor(rows, window) {
        var lowest = 0;
        var highest = 0;
        var seen = false;

        rows.forEach(function (row) {
            var change = row.changes[window];
            if (typeof change === 'number' && isFinite(change)) {
                seen = true;
                lowest = Math.min(lowest, change);
                highest = Math.max(highest, change);
            }
        });
        if (!seen) return null;

        var span = highest - lowest;
        if (span < MIN_SPAN_PERCENT) {
            var short = (MIN_SPAN_PERCENT - span) / 2;
            lowest -= short;
            highest += short;
            span = highest - lowest;
        }

        var headroom = span * HEADROOM;
        if (highest > 0) highest += headroom;
        if (lowest < 0) lowest -= headroom;
        span = highest - lowest;

        return {
            lowest: lowest,
            highest: highest,
            span: span,
            zeroAt: (0 - lowest) / span
        };
    }

    /* Where one bar starts and how far it reaches, both as a fraction of the
     * track. Every bar starts at the zero line and ends at its own value, so
     * a rise and a fall of the same size are the same length in opposite
     * directions. Null when there is no figure to draw. */
    function barSpan(change, axis) {
        if (!axis || typeof change !== 'number' || !isFinite(change)) return null;
        var at = (change - axis.lowest) / axis.span;
        return {
            start: Math.min(at, axis.zeroAt),
            width: Math.abs(at - axis.zeroAt)
        };
    }

    function percent(fraction) {
        return (Math.round(fraction * 1000) / 10) + '%';
    }

    /* Best first, and a row with no figure sorts to the bottom rather than
     * being treated as flat. Unknown is not zero anywhere else on this page
     * and it is not zero here: a fund we could not price has no place in the
     * middle of a ranking it was never measured for. */
    function ranked(rows, window) {
        return rows.slice().sort(function (left, right) {
            var a = left.changes[window];
            var b = right.changes[window];
            var aKnown = typeof a === 'number' && isFinite(a);
            var bKnown = typeof b === 'number' && isFinite(b);
            if (aKnown && bKnown) return b - a;
            if (aKnown) return -1;
            if (bKnown) return 1;
            // Neither is known: hold the server's order so the list does not
            // reshuffle its unavailable rows every time a window is pressed.
            return 0;
        });
    }

    /* ── Rows ───────────────────────────────────────────────────── */

    function element(tag, className) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        return node;
    }

    function nameCell(row) {
        var cell = element('p', 'inc-sector-name');

        var label = element('span', 'inc-sector-label');
        label.textContent = row.name;
        cell.appendChild(label);

        // The fund the figure was actually measured from. A sector name with
        // no ticker beside it would be claiming to measure the sector itself,
        // which no free data source can do.
        var fund = element('span', 'inc-sector-fund');
        fund.textContent = row.symbol;
        cell.appendChild(fund);
        return cell;
    }

    function barCell(change, axis) {
        var track = element('div', 'inc-sector-bar');
        track.setAttribute('aria-hidden', 'true');

        var fill = element('div', 'inc-sector-bar-fill');
        var span = barSpan(change, axis);
        if (span) {
            fill.style.setProperty('--inc-sector-start', percent(span.start));
            fill.style.setProperty('--inc-sector-extent', percent(span.width));
        }
        track.appendChild(fill);
        return track;
    }

    /* The figure, built the way every other surface on this page builds one:
     * an arrow, an explicitly signed number, and the window said aloud. The
     * window is on screen once, above the column, and spoken once per row —
     * a heading two elements up is not read with the figure it labels. */
    function changeCell(change, windowLabel) {
        var cell = element('p', 'inc-sector-change');

        if (typeof change !== 'number' || !isFinite(change)) {
            var missing = element('span', 'inc-sector-missing');
            missing.textContent = 'unavailable';
            cell.appendChild(missing);
            return cell;
        }

        var arrow = element('span', 'inc-arrow');
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = figures.arrowFor(change);
        cell.appendChild(arrow);

        var percent = element('span', 'inc-delta-pct');
        percent.textContent = figures.formatPercent(change);
        cell.appendChild(percent);

        var spoken = element('span', 'inc-offscreen');
        spoken.textContent = 'over ' + windowLabel;
        cell.appendChild(spoken);

        dom.setDirection(cell, figures.direction(change));
        return cell;
    }

    function buildRow(row, window, axis, windowLabel) {
        var change = row.changes[window];
        var known = typeof change === 'number' && isFinite(change);

        var item = element('li', 'inc-sector-row');
        item.setAttribute('data-sector-row', row.symbol);
        item.setAttribute('data-state', known ? 'ready' : 'missing');
        item.setAttribute('data-direction',
            known ? figures.direction(change) : 'flat');

        item.appendChild(nameCell(row));
        item.appendChild(barCell(known ? change : null, axis));
        item.appendChild(changeCell(known ? change : null, windowLabel));
        return item;
    }

    /* ── Drawing ────────────────────────────────────────────────── */

    function draw() {
        if (!loaded || !list) return;

        var rows = loaded.rows;
        var axis = axisFor(rows, chosen);
        var windowLabel = loaded.windowLabels[chosen] || chosen;

        // One zero line for the whole list, set on the list rather than per
        // row: it is a property of the axis, and eleven rows each carrying
        // their own copy is eleven chances for one of them to be wrong.
        list.style.setProperty('--inc-sector-zero',
            axis ? percent(axis.zeroAt) : '0%');

        dom.empty(list);
        ranked(rows, chosen).forEach(function (row) {
            list.appendChild(buildRow(row, chosen, axis, windowLabel));
        });

        dom.fill(panel, '[data-sector-legend-window]', windowLabel);
        panel.setAttribute('data-state', 'ready');
        setMessage('');
    }

    function setMessage(text) {
        dom.fill(panel, '[data-sector-message]', text);
    }

    function provenanceNode() {
        return panel && panel.querySelector('[data-sector-provenance]');
    }

    function setProvenance(state, message) {
        var node = provenanceNode();
        if (!node) return;
        node.hidden = false;
        node.setAttribute('data-provenance-state', state);
        dom.fill(node, '[data-sector-provenance-message]', message);
    }

    function hideProvenance() {
        var node = provenanceNode();
        if (node) node.hidden = true;
    }

    /* The shared provenance sentence, plus the two things only this grid can
     * say: that all eleven rows are measured to one close, and which of them
     * are not there.
     *
     * The sentence itself is js/market-figures.js's, unchanged, for the reason
     * given there — two surfaces wording the same claim separately is how one
     * of them ends up saying something weaker. What is appended is the part
     * that makes this line worth its space beside the strip's: these series
     * are refreshed on a slower cycle than the tiles, so the date can differ,
     * and the whole ranking rests on every row sharing it.
     */
    function provenanceFor(payload) {
        var summary = figures.provenanceFor(payload, payload.asOf);
        var missing = payload.rows.filter(function (row) {
            return !row.available;
        }).length;

        summary.message += ' Every sector is measured to that close';
        summary.message += missing === 0
            ? '.'
            : '; ' + missing + (missing === 1 ? ' is' : ' are') + ' unavailable.';
        return summary;
    }

    /* ── Windows ────────────────────────────────────────────────── */

    /* The window the served markup says is pressed, falling back to the first
     * button offered. The markup is the source of truth so the served page and
     * the script cannot disagree about which button is lit; the fallback is
     * there because a page that shipped with none pressed would otherwise
     * never load the grid at all, and would look exactly like a page whose
     * service was down. */
    function pressed() {
        if (!windows) return null;
        var current = windows.querySelector('[aria-pressed="true"]')
            || windows.querySelector('[data-sector-window]');
        return current ? current.getAttribute('data-sector-window') : null;
    }

    /* Marks the button for the window on screen and unmarks the rest. Called
     * on every press and once on load, because the window can be settled
     * without a press — a page that shipped with none pressed falls back to
     * the first, and a page pressing a window the service does not offer
     * falls back to one it does. Either way the lit button has to end up
     * being the one the list is ranked by. */
    function syncWindows() {
        if (!windows) return;
        var buttons = windows.querySelectorAll('[data-sector-window]');
        Array.prototype.forEach.call(buttons, function (button) {
            var mine = button.getAttribute('data-sector-window') === chosen;
            button.setAttribute('aria-pressed', mine ? 'true' : 'false');
        });
    }

    function choose(window) {
        if (!windows || window === chosen) return;
        chosen = window;
        syncWindows();
        draw();
    }

    /* A window the payload does not carry cannot be pressed. The set is fixed
     * on both sides, so this only fires if the service and the page have
     * drifted apart — in which case a disabled button is a better answer than
     * one that redraws nothing. */
    function enableSupportedWindows(supported) {
        if (!windows) return;
        var buttons = windows.querySelectorAll('[data-sector-window]');
        Array.prototype.forEach.call(buttons, function (button) {
            var name = button.getAttribute('data-sector-window');
            button.disabled = supported.indexOf(name) === -1;
        });
    }

    /* ── Failure ────────────────────────────────────────────────── */

    /* The grid could not be built at all. It says so in the space the list
     * would have filled and keeps its heading, rather than vanishing — a
     * section that disappears on a failed request leaves a reader wondering
     * what used to be there.
     *
     * The provenance line goes with it. A provenance line says where a set of
     * figures came from, and there are no figures: leaving it would put a
     * second sentence with the same content twenty pixels under the first,
     * which is what the strip's identical banner already says once further up
     * the page. The strip keeps its own because its tiles stay on screen
     * holding em dashes, so it still has figures to account for.
     */
    function fail() {
        if (!panel) return;
        if (list) dom.empty(list);
        panel.setAttribute('data-state', 'error');
        setMessage('Sector performance is unavailable. The price service could '
            + 'not be reached, so no sectors are ranked.');
        hideProvenance();
        enableSupportedWindows([]);
    }

    /* ── Start ──────────────────────────────────────────────────── */

    function start() {
        // No grid on the page, or a module that failed to load. The served
        // markup says nothing has loaded, which stays true.
        if (!panel || !list || !data || !figures || !dom) return;

        chosen = pressed();
        if (!chosen) return;

        data.sectors().then(function (payload) {
            loaded = payload;
            enableSupportedWindows(payload.windows);
            if (payload.windows.indexOf(chosen) === -1) {
                chosen = payload.windows[0];
            }
            syncWindows();
            draw();
            var summary = provenanceFor(payload);
            setProvenance(summary.state, summary.message);
        }, function () {
            // Deliberately silent, like the strip: the failure is already on
            // screen in the panel and the line beneath it, and a console error
            // on an offline service is noise in the check that has to stay
            // meaningful (tools/shoot.py fails the run on one).
            fail();
        });
    }

    if (windows) {
        windows.addEventListener('click', function (event) {
            var button = event.target.closest
                ? event.target.closest('[data-sector-window]') : null;
            if (button && !button.disabled) {
                choose(button.getAttribute('data-sector-window'));
            }
        });
    }

    global.IncisorSectors = {
        axisFor: axisFor,
        barSpan: barSpan,
        ranked: ranked,
        start: start
    };

    start();
})(typeof window !== 'undefined' ? window : this);
