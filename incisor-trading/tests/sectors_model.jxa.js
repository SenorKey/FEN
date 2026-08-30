/* Exercises the sector grid outside a browser.
 *
 * Two things worth checking without a browser, and one that cannot be.
 *
 * The bar axis is pure — values in, fractions out — so it runs against
 * hand-computed numbers with nothing stubbed. It is where the visual claim of
 * this surface actually lives: an axis computed from the wrong end produces a
 * ranking that looks entirely plausible and is wrong, which no screenshot
 * would catch and no server test could see.
 *
 * The view runs against the DOM stub in dom_stub.jxa.js with the data module
 * replaced, driven by real clicks on the window buttons. That covers the
 * things the surface promises: one request answers every window, a window
 * with no figure sorts to the bottom rather than being treated as flat, and
 * the failed state says so rather than leaving an empty list.
 *
 * What it cannot cover is whether eleven bars read as a ranking at 375px.
 * tools/shoot.py does that, and the screenshots are the evidence.
 *
 * Promises are the awkward part, as in every runner here: a scheduled JXA run
 * has no event loop to drain a microtask queue, so the synchronous stand-in
 * below settles as it is built. Sound, because nothing under test is
 * concurrent — the grid makes one request and re-reads it from then on.
 *
 * Run by test_sectors.py. Arguments: <page-dir>
 */

function run(argv) {
    'use strict';
    ObjC.import('Foundation');

    function read(path) {
        return $.NSString.stringWithContentsOfFileEncodingError(
            path, $.NSUTF8StringEncoding, null).js;
    }

    var pageDir = argv[0];
    var results = [];
    var failed = 0;

    function check(name, condition, detail) {
        results.push({ test: name, pass: !!condition, detail: detail || '' });
        if (!condition) failed++;
    }

    function equal(name, actual, expected) {
        check(name, actual === expected,
            'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
    }

    function same(name, actual, expected) {
        equal(name, JSON.stringify(actual), JSON.stringify(expected));
    }

    function close(name, actual, expected, tolerance) {
        check(name, Math.abs(actual - expected) < tolerance,
            'expected ~' + expected + ', got ' + actual);
    }

    function report() {
        return JSON.stringify({ failed: failed, total: results.length, results: results });
    }

    /* ── A promise that settles as it is built ──────────────────── */

    function Settled(state, value) {
        this.state = state;
        this.value = value;
    }
    function wrap(value) {
        return value instanceof Settled ? value : new Settled('ok', value);
    }
    Settled.prototype.then = function (onOk, onFail) {
        var handler = this.state === 'ok' ? onOk : onFail;
        if (!handler) return this;
        try {
            return wrap(handler(this.value));
        } catch (error) {
            return new Settled('fail', error);
        }
    };
    Settled.resolve = function (value) { return wrap(value); };
    Settled.reject = function (value) { return new Settled('fail', value); };

    /* ── Modules under test ─────────────────────────────────────── */

    var stub = {};
    var figures;
    try {
        (new Function('exports', read(pageDir + '/tests/dom_stub.jxa.js')))(stub);
        var box = {};
        (new Function('window', read(pageDir + '/js/market-figures.js')))(box);
        figures = box.IncisorMarketFigures;
        check('the pure modules parse and run', !!figures);
    } catch (error) {
        check('the pure modules parse and run', false, String(error));
        return report();
    }
    var El = stub.El;

    /* ── The data client's sector reader ────────────────────────── */

    var requested = [];
    var nextResponse = null;

    function fetchStub(url) {
        requested.push(url);
        if (nextResponse.reject) return Settled.reject(nextResponse.reject);
        return Settled.resolve({
            status: nextResponse.status || 200,
            ok: nextResponse.ok !== false,
            json: function () { return Settled.resolve(nextResponse.body); }
        });
    }

    var dataWindow = {
        fetch: fetchStub,
        setTimeout: function () { return 1; },
        clearTimeout: function () { }
    };

    var data;
    try {
        (new Function('window', 'Promise', 'AbortController',
            read(pageDir + '/js/market-data.js')))(dataWindow, Settled, null);
        data = dataWindow.IncisorMarketData;
        check('market-data.js parses and runs', !!data);
    } catch (error) {
        check('market-data.js parses and runs', false, String(error));
        return report();
    }

    function sectorRow(symbol, name, changes, available) {
        return {
            symbol: symbol,
            name: name,
            available: available !== false,
            last_close: 100,
            changes: changes
        };
    }

    function gridPayload(overrides) {
        var payload = {
            source: 'fixture',
            delay: 'end-of-day',
            stale: false,
            fetched_at: '2026-08-27T12:00:00Z',
            sectors: {
                as_of: '2026-08-26',
                windows: ['1M', '3M', 'YTD', '1Y'],
                window_labels: {
                    '1M': 'one month', '3M': 'three months',
                    'YTD': 'year to date', '1Y': 'one year'
                },
                sectors: [
                    sectorRow('XLK', 'Technology',
                        { '1M': -0.77, '3M': -6.98, 'YTD': 12.88, '1Y': 13.47 }),
                    sectorRow('XLF', 'Financials',
                        { '1M': -5.44, '3M': -6.48, 'YTD': -0.68, '1Y': 10.8 }),
                    sectorRow('XLB', 'Materials',
                        { '1M': 3.85, '3M': 12.46, 'YTD': 22.01, '1Y': 33.35 }),
                    sectorRow('XLE', 'Energy',
                        { '1M': null, '3M': null, 'YTD': null, '1Y': null }, false)
                ],
                unavailable: ['XLE']
            }
        };
        Object.keys(overrides || {}).forEach(function (key) {
            payload[key] = overrides[key];
        });
        return payload;
    }

    function askGrid(response) {
        nextResponse = response;
        return data.sectors();
    }

    requested = [];
    var good = askGrid({ body: gridPayload() });
    equal('a good grid resolves', good.state, 'ok');
    equal('the request goes to our own service, by relative path',
        requested[requested.length - 1], '/api/incisor/sectors');
    equal('and takes no arguments at all',
        requested[requested.length - 1].indexOf('?'), -1);
    equal('every row comes back', good.value.rows.length, 4);
    equal('the shared date comes back', good.value.asOf, '2026-08-26');
    equal('the windows come back', good.value.windows.length, 4);
    equal('a window carries a label that can be read aloud',
        good.value.windowLabels['1M'], 'one month');
    equal('the source is carried through so the page can label it',
        good.value.source, 'fixture');

    var noSource = askGrid({ body: gridPayload({ source: undefined }) });
    equal('a payload with no source field is refused', noSource.state, 'fail');

    var noWindows = askGrid({
        body: gridPayload({ sectors: { windows: [], sectors: [] } }) });
    equal('a grid offering no windows is refused', noWindows.state, 'fail');

    var junkWindow = askGrid({
        body: gridPayload({ sectors: {
            as_of: 'x', windows: ['1M', '../../etc'], sectors: [] } }) });
    equal('a window name that is not one is dropped',
        junkWindow.value.windows.length, 1);

    var badRow = gridPayload();
    badRow.sectors.sectors = [
        sectorRow('XLK', 'Technology', { '1M': 1 }),
        { symbol: 'not a ticker', name: 'Nope', changes: {} },
        { symbol: 'XLF', name: '', changes: {} }
    ];
    var dropped = askGrid({ body: badRow });
    equal('a row that fails its check is dropped, not the whole grid',
        dropped.value.rows.length, 1);

    var textChange = gridPayload();
    textChange.sectors.sectors = [sectorRow('XLK', 'Technology', { '1M': '12%' })];
    equal('a change that is not a number becomes unknown, never a string',
        askGrid({ body: textChange }).value.rows[0].changes['1M'], null);

    equal('an unreachable service is a failure',
        askGrid({ reject: new Error('boom') }).state, 'fail');
    equal('a non-ok response is a failure',
        askGrid({ ok: false, status: 503, body: {} }).state, 'fail');

    /* ── The view ───────────────────────────────────────────────── */

    /* The served markup, as index.html ships it. Built here rather than
     * parsed out of the page for the reason the watchlist runner gives: this
     * is the contract the view documents, and test_sectors.py separately
     * asserts the page still carries it. */
    function buildPanel(windowNames, pressedName) {
        var panel = new El('section', { 'data-sectors': '',
            'data-state': 'loading' });
        var lit = pressedName || 'YTD';

        var windows = new El('div', { 'data-sector-windows': '' });
        (windowNames || ['1M', '3M', 'YTD', '1Y']).forEach(function (name) {
            windows.appendChild(new El('button', {
                'data-sector-window': name,
                'aria-pressed': name === lit ? 'true' : 'false'
            }));
        });
        panel.appendChild(windows);

        var legend = new El('p', {});
        legend.appendChild(new El('span', { 'data-sector-legend-window': '' }));
        panel.appendChild(legend);

        panel.appendChild(new El('ol', { 'data-sector-list': '' }));
        panel.appendChild(new El('p', { 'data-sector-message': '' }));

        var provenance = new El('p', { 'data-sector-provenance': '',
            'data-provenance-state': 'pending' });
        provenance.appendChild(new El('span',
            { 'data-sector-provenance-message': '' }));
        panel.appendChild(provenance);
        return panel;
    }

    /* Drives the real view and hands back everything a test needs to look at.
     * `answer` is a payload, or {error: ...} for a service that is not there. */
    function mount(answer, windowNames, pressedName) {
        var panel = buildPanel(windowNames, pressedName);
        var documentStub = stub.makeDocument([panel]);
        var calls = 0;

        var windowStub = {
            IncisorMarketFigures: figures,
            IncisorMarketData: {
                sectors: function () {
                    calls++;
                    if (!answer || answer.error) {
                        return Settled.reject(new Error('offline'));
                    }
                    return Settled.resolve(answer);
                }
            }
        };

        (new Function('window', read(pageDir + '/js/dom.js')))(windowStub);
        (new Function('document', 'window',
            read(pageDir + '/js/view-sectors.js')))(documentStub, windowStub);

        return {
            panel: panel,
            api: windowStub.IncisorSectors,
            calls: function () { return calls; },
            rows: function () {
                return panel.querySelector('[data-sector-list]').children;
            },
            symbols: function () {
                return this.rows().map(function (item) {
                    return item.getAttribute('data-sector-row');
                });
            },
            text: function (selector) {
                var node = panel.querySelector(selector);
                return node ? node.textContent : null;
            },
            button: function (name) {
                return panel.querySelector('[data-sector-window="' + name + '"]');
            },
            /* The stub does not bubble — the view binds one listener on the
             * button group and reads event.target — so a click names its own
             * target the way a real bubbled event would. */
            press: function (name) {
                var button = this.button(name);
                panel.querySelector('[data-sector-windows]')
                    .fire('click', { target: button });
                return button;
            }
        };
    }

    /* The parsed payload the view is handed, which is what data.sectors()
     * resolves to rather than the raw envelope. */
    var parsed = askGrid({ body: gridPayload() }).value;

    var view = mount(parsed);
    equal('the grid asks the service once', view.calls(), 1);
    equal('the panel reports itself ready',
        view.panel.getAttribute('data-state'), 'ready');
    equal('every sector gets a row', view.rows().length, 4);

    same('rows are ranked best first for the pressed window',
        view.symbols(), ['XLB', 'XLK', 'XLF', 'XLE']);
    equal('the legend names the pressed window in words',
        view.text('[data-sector-legend-window]'), 'year to date');

    var top = view.rows()[0];
    equal('a rising row is marked up', top.getAttribute('data-direction'), 'up');
    equal('a rising row is marked ready', top.getAttribute('data-state'), 'ready');
    equal('a row names its sector',
        top.querySelector('.inc-sector-label').textContent, 'Materials');
    equal('and names the fund the figure came from',
        top.querySelector('.inc-sector-fund').textContent, 'XLB');
    equal('the figure is signed and carries its unit',
        top.querySelector('.inc-delta-pct').textContent, '+22.01%');
    equal('the figure carries an arrow, so direction is not colour alone',
        top.querySelector('.inc-arrow').textContent, '▲');
    equal('and says which window it covers, aloud',
        top.querySelector('.inc-offscreen').textContent, 'over year to date');
    equal('the bar is decorative and says so',
        top.querySelector('.inc-sector-bar').getAttribute('aria-hidden'), 'true');

    var falling = view.rows()[2];
    equal('a falling row is marked down',
        falling.getAttribute('data-direction'), 'down');
    equal('a falling row uses a real minus sign, not a hyphen',
        falling.querySelector('.inc-delta-pct').textContent, '−0.68%');

    var unknown = view.rows()[3];
    equal('a sector with no figure sorts to the bottom',
        unknown.getAttribute('data-sector-row'), 'XLE');
    equal('and is marked missing rather than flat',
        unknown.getAttribute('data-state'), 'missing');
    equal('and says so in words rather than showing a zero',
        unknown.querySelector('.inc-sector-missing').textContent, 'unavailable');
    check('and carries no percentage at all',
        unknown.querySelector('.inc-delta-pct') === null);

    check('the provenance line says the numbers are generated',
        view.text('[data-sector-provenance-message]').indexOf('Sample data') === 0,
        view.text('[data-sector-provenance-message]'));
    check('and says how many sectors are missing',
        view.text('[data-sector-provenance-message]').indexOf('1 is unavailable') !== -1,
        view.text('[data-sector-provenance-message]'));

    /* ── Pressing a window ──────────────────────────────────────── */

    view.press('1M');
    equal('pressing a window makes no further request', view.calls(), 1);
    equal('the pressed button says it is pressed',
        view.button('1M').getAttribute('aria-pressed'), 'true');
    equal('and the one before it says it is not',
        view.button('YTD').getAttribute('aria-pressed'), 'false');
    same('the ranking is recomputed for the new window',
        view.symbols(), ['XLB', 'XLK', 'XLF', 'XLE']);
    equal('the legend follows the window',
        view.text('[data-sector-legend-window]'), 'one month');

    view.press('3M');
    same('a window where the order genuinely differs is ordered differently',
        view.symbols(), ['XLB', 'XLF', 'XLK', 'XLE']);

    view.press('3M');
    equal('pressing the window already on screen changes nothing',
        view.button('3M').getAttribute('aria-pressed'), 'true');

    /* ── The axis ───────────────────────────────────────────────── */

    var api = view.api;
    check('the view exports its axis for checking', !!api && !!api.axisFor);

    function rowsWith(values) {
        return values.map(function (value, at) {
            return { symbol: 'X' + at, changes: { W: value } };
        });
    }

    /* All positive: zero sits at the left end, because the axis is seeded at
     * zero on both sides and only grows past it where the data does. */
    var rising = api.axisFor(rowsWith([2, 6, 10]), 'W');
    equal('an all-positive window puts zero at the left end', rising.zeroAt, 0);
    close('and reaches past the largest mover, not up to it',
        rising.highest, 10.6, 0.001);

    var falling2 = api.axisFor(rowsWith([-2, -6, -10]), 'W');
    equal('an all-negative window puts zero at the right end',
        falling2.zeroAt, 1);

    var mixed = api.axisFor(rowsWith([-5, 5]), 'W');
    close('a symmetric window puts zero in the middle', mixed.zeroAt, 0.5, 0.001);

    var lopsided = api.axisFor(rowsWith([-1, 9]), 'W');
    check('a lopsided window puts zero where zero falls',
        lopsided.zeroAt > 0.05 && lopsided.zeroAt < 0.15,
        'zeroAt ' + lopsided.zeroAt);

    var quiet = api.axisFor(rowsWith([0.1, 0.2]), 'W');
    check('a window where nothing moved is not stretched to fill the track',
        quiet.span >= 2, 'span ' + quiet.span);

    check('a window with no figures has no axis',
        api.axisFor(rowsWith([null, null]), 'W') === null);

    /* ── Bar spans ──────────────────────────────────────────────── */

    var span = api.barSpan(10, rising);
    close('the largest bar starts at zero', span.start, 0, 0.001);
    close('and reaches most of the track, short of the end',
        span.width, 10 / 10.6, 0.001);

    var half = api.barSpan(5, rising);
    close('half the move is half the length', half.width, 5 / 10.6, 0.001);

    var down = api.barSpan(-5, mixed);
    check('a falling bar starts left of the zero line',
        down.start < mixed.zeroAt, 'start ' + down.start);
    close('and a fall the size of a rise is the same length',
        down.width, api.barSpan(5, mixed).width, 0.001);

    equal('a bar with no figure has no span', api.barSpan(null, rising), null);
    equal('a bar with no axis has no span', api.barSpan(5, null), null);

    /* ── Failure ────────────────────────────────────────────────── */

    var down2 = mount({ error: true });
    equal('a service that cannot be reached leaves the panel in error',
        down2.panel.getAttribute('data-state'), 'error');
    equal('and draws no rows at all', down2.rows().length, 0);
    check('and says so where the list would have been',
        down2.text('[data-sector-message]').indexOf('unavailable') !== -1,
        down2.text('[data-sector-message]'));
    equal('and hides the provenance line rather than repeating the message',
        down2.panel.querySelector('[data-sector-provenance]').hidden, true);
    equal('and stops inviting a press that would rank nothing',
        down2.button('1M').disabled, true);

    /* ── A window the service does not offer ────────────────────── */

    var narrow = mount(parsed, ['1M', 'NOPE'], 'NOPE');
    equal('a window the payload does not carry is disabled',
        narrow.button('NOPE').disabled, true);
    equal('and the grid falls back to one it does carry',
        narrow.button('1M').getAttribute('aria-pressed'), 'true');
    check('and still draws its rows', narrow.rows().length > 0);

    /* ── A page without the surface ─────────────────────────────── */

    try {
        var bare = { querySelector: function () { return null; },
            createElement: function () { return new El('div', {}); } };
        (new Function('document', 'window',
            read(pageDir + '/js/view-sectors.js')))(bare, {});
        check('the view runs on a page with no sector markup', true);
    } catch (error) {
        check('the view runs on a page with no sector markup', false,
            String(error));
    }

    var unlit = mount(parsed, ['1M', '3M', 'YTD', '1Y'], 'none-of-them');
    equal('a page shipped with no window pressed still loads the grid',
        unlit.panel.getAttribute('data-state'), 'ready');
    equal('and lights the first window it offers',
        unlit.button('1M').getAttribute('aria-pressed'), 'true');

    try {
        var lonely = buildPanel();
        (new Function('document', 'window', read(pageDir + '/js/view-sectors.js')))(
            stub.makeDocument([lonely]), {});
        equal('the view leaves the served markup alone with no helpers loaded',
            lonely.getAttribute('data-state'), 'loading');
    } catch (error) {
        check('the view leaves the served markup alone with no helpers loaded',
            false, String(error));
    }

    return report();
}

