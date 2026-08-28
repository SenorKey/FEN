/* Exercises symbol search and the quote panel outside a browser.
 *
 * Four modules. js/symbol-search.js and the figures added to
 * js/market-figures.js are pure, so they run against hand-computed values with
 * nothing stubbed. js/market-data.js runs against a fake fetch. And
 * js/view-symbol.js runs against the DOM stub in dom_stub.jxa.js, driven by
 * real keystrokes and clicks — which is the only way the T7 acceptance
 * criteria can be checked at all without a browser: results have to be
 * keyboard-navigable, and an unknown symbol has to reach a clean not-found
 * state rather than an error one.
 *
 * Promises are the awkward part, for the same reason as in strip_model.jxa.js:
 * a scheduled JXA run has no event loop to drain a microtask queue. The
 * synchronous stand-in below settles as it is built, which is sound here
 * because nothing under test is concurrent — the view fires two independent
 * requests and renders when both have answered.
 *
 * Run by test_symbol_lookup.py. Arguments: <page-dir>
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
    var finder;
    try {
        (new Function('exports', read(pageDir + '/tests/dom_stub.jxa.js')))(stub);
        var box = {};
        (new Function('window', read(pageDir + '/js/market-figures.js')))(box);
        (new Function('window', read(pageDir + '/js/symbol-search.js')))(box);
        figures = box.IncisorMarketFigures;
        finder = box.IncisorSymbolSearch;
        check('the pure modules parse and run', !!figures && !!finder);
    } catch (error) {
        check('the pure modules parse and run', false, String(error));
        return report();
    }
    var El = stub.El;

    /* ── Search ranking ─────────────────────────────────────────── */

    var CATALOG = [
        { symbol: 'AAPL', name: 'Apple Inc.', kind: 'stock', tracks: null },
        { symbol: 'AMZN', name: 'Amazon.com, Inc.', kind: 'stock', tracks: null },
        { symbol: 'BRK.B', name: 'Berkshire Hathaway Inc.', kind: 'stock',
            tracks: null },
        { symbol: 'HD', name: 'The Home Depot, Inc.', kind: 'stock', tracks: null },
        { symbol: 'KO', name: 'The Coca-Cola Company', kind: 'stock', tracks: null },
        { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', kind: 'etf',
            tracks: 'S&P 500' },
        { symbol: 'T', name: 'AT&T Inc.', kind: 'stock', tracks: null },
        { symbol: 'V', name: 'Visa Inc.', kind: 'stock', tracks: null },
        { symbol: 'VZ', name: 'Verizon Communications Inc.', kind: 'stock',
            tracks: null }
    ];

    function symbolsFor(query, limit) {
        return finder.match(CATALOG, query, limit).map(function (row) {
            return row.symbol;
        });
    }

    equal('an exact ticker comes first, ahead of every ticker containing it',
        symbolsFor('V')[0], 'V');
    equal('a one-letter ticker still finds the names it starts',
        symbolsFor('V').indexOf('VZ') > 0, true);
    equal('an exact ticker beats a name that starts with the same letters',
        symbolsFor('T')[0], 'T');
    equal('a lowercase query finds the same thing', symbolsFor('aapl')[0], 'AAPL');
    equal('surrounding space is ignored', symbolsFor('  aapl  ')[0], 'AAPL');

    equal('a company name matches from its first word',
        symbolsFor('apple')[0], 'AAPL');
    equal('a name matches from a later word, past the article',
        symbolsFor('home')[0], 'HD');
    equal('punctuation inside a name is a word boundary',
        symbolsFor('cola')[0], 'KO');
    equal('a ticker prefix beats a name match',
        symbolsFor('am')[0], 'AMZN');

    equal('an empty query matches nothing rather than everything',
        symbolsFor('').length, 0);
    equal('a whitespace query matches nothing', symbolsFor('   ').length, 0);
    equal('a query nothing matches comes back empty',
        symbolsFor('zzzz').length, 0);
    equal('a symbol with a dot is reachable', symbolsFor('brk')[0], 'BRK.B');
    equal('the result list is capped', symbolsFor('a', 2).length, 2);
    check('the order is stable across repeated calls',
        symbolsFor('a').join() === symbolsFor('a').join());
    equal('a missing catalogue matches nothing',
        finder.match(null, 'AAPL').length, 0);

    equal('a well-formed ticker can be looked up directly',
        finder.looksLikeSymbol('nvda'), true);
    equal('a ticker with a dot is well formed',
        finder.looksLikeSymbol('BRK.B'), true);
    equal('a sentence is not a ticker',
        finder.looksLikeSymbol('what is apple worth'), false);
    equal('an injection attempt is not a ticker',
        finder.looksLikeSymbol("spy'; DROP TABLE--"), false);
    equal('an empty string is not a ticker', finder.looksLikeSymbol(''), false);
    equal('a ticker longer than the whitelist allows is refused',
        finder.looksLikeSymbol('ABCDEFGHIJKL'), false);

    equal('an exact row can be pulled out by ticker',
        finder.lookup(CATALOG, 'spy').name, 'SPDR S&P 500 ETF Trust');
    check('an unlisted ticker has no row',
        finder.lookup(CATALOG, 'ZZZZ') === null);

    /* ── The figures the panel adds ─────────────────────────────── */

    function bar(date, low, high, close, volume) {
        return { date: date, open: close, high: high, low: low,
            close: close, volume: volume };
    }

    var series = [
        bar('2026-08-24', 90, 110, 100, 1000),
        bar('2026-08-25', 80, 105, 95, 3000),
        bar('2026-08-26', 95, 130, 120, 2000)
    ];

    var span = figures.extremes(series, 3);
    equal('the range low is the lowest price traded, not the lowest close',
        span.low, 80);
    equal('the range high is the highest price traded', span.high, 130);
    equal('the range says how many sessions it covers', span.sessions, 3);
    equal('a shorter window is measured over what it has',
        figures.extremes(series, 2).low, 80);
    equal('the window takes the end of the series, not the start',
        figures.extremes(series, 1).low, 95);
    equal('a bar with no high or low falls back to its close',
        figures.extremes([{ date: 'a', close: 42 }], 1).high, 42);
    check('an empty series has no range', figures.extremes([], 3) === null);
    check('a missing series has no range', figures.extremes(null, 3) === null);

    equal('the average volume is the mean over the window',
        figures.averageVolume(series, 3), 2000);
    equal('a bar with no volume is left out of the mean rather than counted '
        + 'as zero',
        figures.averageVolume([bar('a', 1, 1, 1, 100), { date: 'b', close: 1 }], 2),
        100);
    check('a window with no volume at all has no average, rather than zero',
        figures.averageVolume([{ date: 'a', close: 1 }], 2) === null);

    close('a price halfway up its range sits at the middle',
        figures.positionInRange(0, 100, 50), 0.5, 0.0001);
    equal('a price at the low sits at the bottom',
        figures.positionInRange(10, 20, 10), 0);
    equal('a price at the high sits at the top',
        figures.positionInRange(10, 20, 20), 1);
    equal('a price above its own range is clamped rather than running off '
        + 'the end of the bar', figures.positionInRange(10, 20, 25), 1);
    equal('a price below its range is clamped', figures.positionInRange(10, 20, 5), 0);
    check('a range with no width has no position',
        figures.positionInRange(10, 10, 10) === null);
    check('an unknown price has no position',
        figures.positionInRange(10, 20, null) === null);

    equal('millions are abbreviated', figures.formatVolume(93232810), '93.2M');
    equal('billions keep two decimals, where the digit matters',
        figures.formatVolume(1240000000), '1.24B');
    equal('thousands are abbreviated', figures.formatVolume(4300), '4.30K');
    equal('a small count is written out', figures.formatVolume(812), '812');
    equal('zero volume is zero, not an em dash', figures.formatVolume(0), '0');
    equal('an unknown volume is an em dash', figures.formatVolume(null), '—');
    equal('a negative volume is refused rather than drawn',
        figures.formatVolume(-5), '—');

    equal('a multiple carries its unit', figures.formatMultiple(1.324), '1.32×');
    equal('a multiple is not signed, because it is not a direction',
        figures.formatMultiple(0.5), '0.50×');
    equal('an unknown multiple is an em dash', figures.formatMultiple(null), '—');

    equal('sample data is labelled as generated',
        figures.provenanceFor({ source: 'fixture', delay: 'end-of-day' },
            '2026-08-26').state, 'sample');
    check('and says so in words',
        figures.provenanceFor({ source: 'fixture', delay: 'end-of-day' },
            '2026-08-26').message.indexOf('generated') !== -1);
    equal('live data is labelled as delayed',
        figures.provenanceFor({ source: 'live', delay: 'end-of-day' },
            '2026-08-26').state, 'live');
    equal('a stale answer says so',
        figures.provenanceFor({ source: 'live', stale: true }, '2026-08-26').state,
        'stale');
    equal('nothing at all is an error', figures.provenanceFor(null, '').state,
        'error');

    /* ── The data client ────────────────────────────────────────── */

    var requested = [];
    var nextResponse = null;

    function fetchStub(url) {
        requested.push(url);
        if (nextResponse.reject) return Settled.reject(nextResponse.reject);
        return Settled.resolve({
            ok: nextResponse.status === undefined || nextResponse.status === 200,
            status: nextResponse.status === undefined ? 200 : nextResponse.status,
            json: function () {
                return nextResponse.unparseable
                    ? Settled.reject(new Error('not json'))
                    : Settled.resolve(nextResponse.body);
            }
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

    function quotePayload(overrides) {
        var payload = {
            symbol: 'AAPL', source: 'fixture', delay: 'end-of-day',
            stale: false, fetched_at: '2026-08-28T12:00:00Z',
            quote: {
                symbol: 'AAPL', price: 273.78, open: 271.2, high: 275.5,
                low: 269.9, previous_close: 270.4, change: 3.38,
                change_percent: 1.25, volume: 51000000,
                latest_trading_day: '2026-08-26'
            }
        };
        Object.keys(overrides || {}).forEach(function (key) {
            payload[key] = overrides[key];
        });
        return payload;
    }

    function ask(symbol, response) {
        nextResponse = response;
        return data.quote(symbol);
    }

    requested = [];
    var good = ask('AAPL', { body: quotePayload() });
    equal('a quote resolves', good.state, 'ok');
    equal('the request goes to our own service, by relative path',
        requested[0], '/api/incisor/quote?symbol=AAPL');
    equal('the price comes back parsed', good.value.quote.price, 273.78);
    equal('the day high comes back', good.value.quote.high, 275.5);
    equal('the previous close is renamed to our own shape',
        good.value.quote.previousClose, 270.4);
    equal('the trading day comes through', good.value.quote.tradingDay,
        '2026-08-26');
    equal('the source is carried so the page can label it',
        good.value.source, 'fixture');

    var partial = ask('AAPL', { body: quotePayload({
        quote: { symbol: 'AAPL', price: 100, latest_trading_day: '2026-08-26' } }) });
    equal('a quote missing everything but its price still resolves',
        partial.state, 'ok');
    check('and the missing figures are null rather than NaN',
        partial.value.quote.volume === null && partial.value.quote.open === null);

    equal('a quote with no price at all is refused',
        ask('AAPL', { body: quotePayload({ quote: { symbol: 'AAPL' } }) }).state,
        'fail');
    equal('a quote for another symbol is refused',
        ask('AAPL', { body: quotePayload({ symbol: 'MSFT' }) }).state, 'fail');
    equal('a quote with no source field is refused',
        ask('AAPL', { body: quotePayload({ source: undefined }) }).state, 'fail');

    var missing = ask('ZZZZ', { status: 404, body: { error: 'symbol_not_found' } });
    equal('an unknown symbol fails', missing.state, 'fail');
    equal('and fails as not found, which is a different sentence from a '
        + 'service that is down', missing.value.kind, 'not_found');
    equal('a 500 is not a missing symbol',
        ask('AAPL', { status: 500, body: {} }).value.kind, 'http');
    equal('a 404 from something that is not our service is not a missing '
        + 'symbol either — it means we never reached the service',
        ask('AAPL', { status: 404, body: { error: 'Not Found' } }).value.kind,
        'http');
    equal('and neither is a 404 with a body we cannot parse',
        ask('AAPL', { status: 404, body: null, unparseable: true }).value.kind,
        'http');

    requested = [];
    var refused = data.quote('aapl; DROP TABLE');
    equal('a symbol that is not a ticker is refused', refused.state, 'fail');
    equal('and refused before it becomes a request', requested.length, 0);

    requested = [];
    nextResponse = { body: { source: 'fixture', exhaustive: true, symbols: [
        { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', kind: 'etf',
            tracks: 'S&P 500' },
        { symbol: 'AAPL', name: 'Apple Inc.', kind: 'stock', tracks: null },
        { symbol: 'nope', name: 'Lowercase Ltd', kind: 'stock', tracks: null },
        { symbol: 'OK', name: '', kind: 'stock', tracks: null },
        'not an object'
    ] } };
    var listing = data.symbols();
    equal('the catalogue resolves', listing.state, 'ok');
    equal('the catalogue is asked for by relative path',
        requested[0], '/api/incisor/symbols');
    equal('a row that is not a ticker is dropped rather than failing the list',
        listing.value.symbols.length, 2);
    equal('the completeness flag is carried through',
        listing.value.exhaustive, true);
    nextResponse = { body: { symbols: [] } };
    equal('a catalogue that does not claim completeness is not assumed complete',
        data.symbols().value.exhaustive, false);
    nextResponse = { body: { symbols: 'nope' } };
    equal('a catalogue that is not a list is refused',
        data.symbols().state, 'fail');

    /* ── The view ───────────────────────────────────────────────── */

    /* The served markup, rebuilt as a tree. Kept in step with index.html by
     * test_symbol_lookup.py, which asserts every hook below is on the page. */
    function buildPage() {
        var search = new El('div', { 'data-search': '' });
        var input = new El('input', { 'data-search-input': '',
            'aria-expanded': 'false' });
        input.value = '';
        var list = new El('ul', { 'data-search-results': '' });
        list.hidden = true;
        var hint = new El('p', { 'data-search-hint': '' });
        var field = new El('div', {});
        field.appendChild(input);
        field.appendChild(list);
        search.appendChild(field);
        search.appendChild(hint);

        var panel = new El('div', { 'data-quote': '', 'data-state': 'empty' });
        panel.appendChild(new El('p', { 'data-quote-message': '' }));
        var body = new El('div', { 'data-quote-body': '' });
        body.hidden = true;
        panel.appendChild(body);

        body.appendChild(new El('span', { 'data-quote-symbol': '' }));
        body.appendChild(new El('span', { 'data-quote-name': '' }));
        var proxy = new El('span', { 'data-quote-proxy': '' });
        proxy.hidden = true;
        body.appendChild(proxy);
        body.appendChild(new El('p', { 'data-quote-price': '' }));
        var change = new El('p', { 'class': 'inc-flat', 'data-quote-change': '' });
        change.appendChild(new El('span', { 'data-quote-arrow': '' }));
        change.appendChild(new El('span', { 'data-quote-delta': '' }));
        change.appendChild(new El('span', { 'data-quote-pct': '' }));
        body.appendChild(change);

        ['day', 'year'].forEach(function (which) {
            var range = new El('div', { 'data-range': which });
            range.appendChild(new El('p', { 'data-range-title': '' }));
            var track = new El('div', { 'data-range-track': '' });
            track.appendChild(new El('span', { 'data-range-marker': '' }));
            range.appendChild(track);
            var low = new El('span', { 'data-range-low': '' });
            var high = new El('span', { 'data-range-high': '' });
            low.textContent = '—';
            high.textContent = '—';
            range.appendChild(low);
            range.appendChild(high);
            body.appendChild(range);
        });

        ['open', 'previous', 'volume', 'average-volume', 'relative-volume',
            'market-cap', 'pe'].forEach(function (name) {
            var cell = new El('dd', { 'data-figure': name });
            // The served markup ships an em dash in every one of these, so
            // the stub does too — otherwise a figure the view deliberately
            // leaves alone reads as empty rather than as left alone.
            cell.textContent = '—';
            body.appendChild(cell);
        });

        var line = new El('p', { 'data-quote-provenance': '',
            'data-provenance-state': 'pending' });
        line.appendChild(new El('span', { 'data-quote-provenance-message': '' }));
        body.appendChild(line);

        return { search: search, input: input, list: list, hint: hint,
            panel: panel, body: body };
    }

    /* Drives the real view against stubbed modules. `answers` maps a symbol to
     * a quote payload or an error, and `bars` supplies the history. */
    function mount(options) {
        var page = buildPage();
        var doc = stub.makeDocument([page.search, page.panel]);

        /* Real timers, queued rather than fired straight through. The
         * debounce has to be observable: a render queued by a keystroke and
         * left pending across the Enter that follows it is exactly the bug
         * this stub exists to catch. */
        var timers = {};
        var nextTimer = 1;

        var windowStub = {
            setTimeout: function (fn) {
                var id = nextTimer++;
                timers[id] = fn;
                return id;
            },
            clearTimeout: function (id) { delete timers[id]; },
            IncisorDom: null,
            IncisorMarketFigures: figures,
            IncisorSymbolSearch: finder,
            IncisorMarketData: {
                symbols: function () {
                    return options.catalog === false
                        ? Settled.reject(new Error('offline'))
                        : Settled.resolve({
                            symbols: options.catalog || CATALOG,
                            exhaustive: options.exhaustive !== false
                        });
                },
                quote: function (symbol) {
                    var answer = (options.quotes || {})[symbol];
                    if (!answer) {
                        var absent = new Error('not found');
                        absent.kind = 'not_found';
                        return Settled.reject(absent);
                    }
                    return answer.error ? Settled.reject(answer.error)
                        : Settled.resolve(answer);
                },
                history: function (symbol) {
                    var bars = (options.bars || {})[symbol];
                    return bars ? Settled.resolve({ symbol: symbol, bars: bars })
                        : Settled.reject(new Error('offline'));
                }
            }
        };

        (new Function('window', read(pageDir + '/js/dom.js')))(windowStub);
        (new Function('document', 'window', read(pageDir + '/js/view-symbol.js')))(
            doc, windowStub);

        page.document = doc;
        page.flush = function () {
            Object.keys(timers).forEach(function (id) {
                var fn = timers[id];
                delete timers[id];
                if (fn) fn();
            });
        };
        page.type = function (text) {
            page.input.value = text;
            page.input.fire('input', {});
            page.flush();
        };
        page.press = function (key) {
            return page.input.fire('keydown', { key: key, target: page.input });
        };
        page.text = function (selector) {
            var node = page.panel.querySelector(selector);
            return node ? node.textContent : null;
        };
        page.figure = function (name) {
            return page.text('[data-figure="' + name + '"]');
        };
        page.state = function () { return page.panel.getAttribute('data-state'); };
        return page;
    }

    var APPLE = quotePayload();
    APPLE.quote.previousClose = APPLE.quote.previous_close;
    APPLE.quote.changePercent = APPLE.quote.change_percent;
    APPLE.quote.tradingDay = APPLE.quote.latest_trading_day;

    function appleBars() {
        var bars = [];
        for (var day = 0; day < 252; day++) {
            // A year that dips to 200 and peaks at 300, so the 52-week range
            // is a fact the assertions below can name rather than a coincidence
            // of whatever the loop happened to produce.
            var value = day === 10 ? 200 : (day === 20 ? 300 : 250);
            bars.push(bar('2026-01-' + day, value, value, value, 40000000));
        }
        return bars;
    }

    /* Typing and keyboard navigation */

    var view = mount({ quotes: { AAPL: APPLE }, bars: { AAPL: appleBars() } });

    equal('the panel starts empty', view.state(), 'empty');
    equal('the list starts closed', view.list.hidden, true);
    equal('and says so to a screen reader',
        view.input.getAttribute('aria-expanded'), 'false');

    view.type('ap');
    equal('typing opens the list', view.list.hidden, false);
    equal('and says so to a screen reader',
        view.input.getAttribute('aria-expanded'), 'true');
    equal('the match is offered', view.list.children[0].getAttribute('data-symbol'),
        'AAPL');
    equal('the option is a real listbox option',
        view.list.children[0].getAttribute('role'), 'option');
    equal('the ticker is written as text', view.list.children[0].children[0]
        .textContent, 'AAPL');
    equal('so is the company name', view.list.children[0].children[1]
        .textContent, 'Apple Inc.');
    check('the hint counts what was found',
        view.hint.textContent.indexOf('match') !== -1, view.hint.textContent);

    /* Enter with nothing highlighted takes the best match, not the raw text.
     * Typing a company name and pressing Enter has to open the company. */
    var byName = mount({ quotes: { AAPL: APPLE }, bars: { AAPL: appleBars() } });
    byName.type('apple');
    byName.press('Enter');
    equal('enter on a typed company name opens the match rather than looking '
        + 'up a ticker spelled the same way', byName.state(), 'ready');
    equal('and the input becomes the ticker it resolved to',
        byName.input.value, 'AAPL');

    equal('nothing is highlighted until a key moves',
        view.input.getAttribute('aria-activedescendant'), null);
    view.press('ArrowDown');
    equal('arrow down highlights the first option',
        view.list.children[0].getAttribute('aria-selected'), 'true');
    check('and points a screen reader at it',
        view.input.getAttribute('aria-activedescendant') === view.list.children[0].id,
        view.input.getAttribute('aria-activedescendant'));
    check('focus never leaves the input, which is the whole combobox pattern',
        view.press('ArrowDown').defaultPrevented === true);
    view.press('ArrowUp');
    view.press('ArrowUp');
    equal('arrow up from the top wraps to the bottom',
        view.list.children[view.list.children.length - 1]
            .getAttribute('aria-selected'), 'true');
    view.press('Home');
    equal('home jumps to the first option',
        view.list.children[0].getAttribute('aria-selected'), 'true');
    view.press('End');
    equal('end jumps to the last',
        view.list.children[view.list.children.length - 1]
            .getAttribute('aria-selected'), 'true');
    view.press('Escape');
    equal('escape closes the list', view.list.hidden, true);
    equal('and clears the highlight',
        view.input.getAttribute('aria-activedescendant'), null);

    /* Choosing a symbol */

    view.type('ap');
    view.press('ArrowDown');
    view.press('Enter');

    equal('enter on a highlighted option loads it', view.state(), 'ready');
    equal('and closes the list', view.list.hidden, true);
    equal('and fills the input with the chosen ticker', view.input.value, 'AAPL');
    equal('the panel body is shown', view.body.hidden, false);
    equal('the symbol is written in', view.text('[data-quote-symbol]'), 'AAPL');
    equal('the company name is written in', view.text('[data-quote-name]'),
        'Apple Inc.');
    equal('the price is formatted to two places',
        view.text('[data-quote-price]'), '273.78');
    equal('the change is explicitly signed', view.text('[data-quote-delta]'),
        '+3.38');
    equal('the percentage carries its sign and unit',
        view.text('[data-quote-pct]'), '+1.25%');
    equal('a rise carries an up arrow, so colour is never the only signal',
        view.text('[data-quote-arrow]'), '▲');
    check('and the change is coloured as a rise',
        view.panel.querySelector('[data-quote-change]').classList.contains('inc-up'));

    equal('the open is filled in', view.figure('open'), '271.20');
    equal('the previous close is filled in', view.figure('previous'), '270.40');
    equal('the volume is abbreviated', view.figure('volume'), '51.0M');
    equal('the average volume is computed from the series',
        view.figure('average-volume'), '40.0M');
    equal('the day is compared against that average',
        view.figure('relative-volume'), '1.28×');

    equal('market cap is left as the em dash the markup ships, rather than '
        + 'becoming a number nobody checked', view.figure('market-cap'), '—');
    equal('so is the price-to-earnings ratio', view.figure('pe'), '—');

    var ranges = view.panel.querySelectorAll('[data-range]');
    equal('the day range low is the session low',
        ranges[0].querySelector('[data-range-low]').textContent, '269.90');
    equal('the day range high is the session high',
        ranges[0].querySelector('[data-range-high]').textContent, '275.50');
    equal('the 52-week low is the lowest price of the year',
        ranges[1].querySelector('[data-range-low]').textContent, '200.00');
    equal('the 52-week high is the highest',
        ranges[1].querySelector('[data-range-high]').textContent, '300.00');
    equal('a full year of sessions is called a 52-week range',
        ranges[1].querySelector('[data-range-title]').textContent, '52-week range');

    var dayTrack = ranges[0].querySelector('[data-range-track]');
    check('the marker is placed inside the day range',
        dayTrack.style.getPropertyValue('--inc-range-position') === '69.29%',
        dayTrack.style.getPropertyValue('--inc-range-position'));
    equal('and the track knows it has a position to draw',
        dayTrack.getAttribute('data-range-known'), 'true');
    equal('the marker is shown',
        ranges[0].querySelector('[data-range-marker]').hidden, false);

    check('the panel says where its numbers came from',
        view.text('[data-quote-provenance-message]').indexOf('generated') !== -1,
        view.text('[data-quote-provenance-message]'));
    equal('and marks them as sample data',
        view.panel.querySelector('[data-quote-provenance]')
            .getAttribute('data-provenance-state'), 'sample');

    /* A render queued by the last keystroke must not outlive the choice */

    var settled = mount({ quotes: { AAPL: APPLE }, bars: { AAPL: appleBars() } });
    settled.input.value = 'AAPL';
    settled.input.fire('input', {});
    settled.press('Enter');
    settled.flush();
    equal('a render queued before Enter does not re-open the list afterwards',
        settled.list.hidden, true);
    equal('and the panel it filled is still the one on screen',
        settled.state(), 'ready');

    /* Clicking a result */

    var clicked = mount({ quotes: { AAPL: APPLE }, bars: { AAPL: appleBars() } });
    clicked.type('apple');
    clicked.list.fire('click', { target: clicked.list.children[0] });
    equal('clicking a result loads it', clicked.state(), 'ready');
    equal('and fills the input', clicked.input.value, 'AAPL');

    var elsewhere = mount({ quotes: { AAPL: APPLE } });
    elsewhere.type('apple');
    elsewhere.document.fire('click', { target: elsewhere.panel });
    equal('a click outside the search block closes the list',
        elsewhere.list.hidden, true);

    /* A shorter history */

    var shortView = mount({
        quotes: { AAPL: APPLE },
        bars: { AAPL: appleBars().slice(0, 120) }
    });
    shortView.type('apple');
    shortView.press('Enter');
    var shortRange = shortView.panel.querySelectorAll('[data-range]')[1];
    equal('a series shorter than a year is labelled by what it covers, not '
        + 'called a 52-week range',
        shortRange.querySelector('[data-range-title]').textContent, '24-week range');

    /* No history at all */

    var noHistory = mount({ quotes: { AAPL: APPLE } });
    noHistory.type('apple');
    noHistory.press('Enter');
    equal('a quote with no history behind it still renders',
        noHistory.state(), 'ready');
    equal('the price is still there', noHistory.text('[data-quote-price]'),
        '273.78');
    var yearRange = noHistory.panel.querySelectorAll('[data-range]')[1];
    equal('the 52-week range is an em dash rather than a guess',
        yearRange.querySelector('[data-range-low]').textContent, '—');
    equal('and its marker is hidden rather than parked at one end',
        yearRange.querySelector('[data-range-marker]').hidden, true);
    equal('the average volume is an em dash',
        noHistory.figure('average-volume'), '—');
    equal('and so is the comparison against it',
        noHistory.figure('relative-volume'), '—');

    /* Not found */

    var absent = mount({ quotes: { AAPL: APPLE } });
    absent.type('NVDA');
    absent.press('Enter');
    equal('an unknown symbol reaches its own state, not the error state',
        absent.state(), 'not-found');
    check('and says there is no data for it, by name',
        absent.text('[data-quote-message]').indexOf('No data for NVDA') === 0,
        absent.text('[data-quote-message]'));
    check('and explains that this build only holds a few symbols',
        absent.text('[data-quote-message]').indexOf('sample data') !== -1,
        absent.text('[data-quote-message]'));
    equal('the panel body stays hidden', absent.body.hidden, true);
    check('and the hint does not claim to be showing something',
        absent.hint.textContent.indexOf('Showing') === -1,
        absent.hint.textContent);
    check('but does say what to try instead, since another ticker might work',
        absent.hint.textContent.indexOf('Try another') === 0,
        absent.hint.textContent);

    var typed = mount({ quotes: {}, exhaustive: false });
    typed.type('what is apple worth');
    typed.press('Enter');
    equal('something that is not a ticker at all is refused as one',
        typed.state(), 'not-found');
    check('and is told why', typed.text('[data-quote-message]')
        .indexOf('is not a ticker') !== -1, typed.text('[data-quote-message]'));

    /* A free-typed ticker the catalogue does not list */

    var offCatalog = mount({
        quotes: { NVDA: APPLE }, bars: { NVDA: appleBars() }, exhaustive: false
    });
    offCatalog.type('nvda');
    check('a ticker outside the catalogue is offered as a direct lookup',
        offCatalog.hint.textContent.indexOf('press Enter') !== -1
        || offCatalog.hint.textContent.indexOf('Press Enter') !== -1,
        offCatalog.hint.textContent);
    offCatalog.press('Enter');
    equal('and looking it up works', offCatalog.state(), 'ready');
    check('and the hint says what is on screen',
        offCatalog.hint.textContent === 'Showing NVDA.',
        offCatalog.hint.textContent);
    equal('with the ticker standing in for a name we do not have',
        offCatalog.text('[data-quote-name]'), 'NVDA');

    /* The service being down */

    var down = mount({ quotes: { AAPL: { error: new Error('offline') } } });
    down.type('apple');
    down.press('Enter');
    equal('an unreachable service is an error, not a missing symbol',
        down.state(), 'error');
    check('and says the service could not be reached',
        down.text('[data-quote-message]').indexOf('unavailable') !== -1,
        down.text('[data-quote-message]'));
    equal('and does not advise trying another ticker, which would fix nothing',
        down.hint.textContent, '');

    var noCatalog = mount({ catalog: false, quotes: { AAPL: APPLE },
        bars: { AAPL: appleBars() } });
    check('a catalogue that will not load says so',
        noCatalog.hint.textContent.indexOf('could not be loaded') !== -1,
        noCatalog.hint.textContent);
    noCatalog.type('aapl');
    noCatalog.press('Enter');
    equal('and a typed ticker still works without one', noCatalog.state(), 'ready');

    /* Degradations */

    try {
        var bare = {
            querySelector: function () { return null; },
            querySelectorAll: function () { return []; },
            getElementById: function () { return null; },
            addEventListener: function () { }
        };
        (new Function('document', 'window',
            read(pageDir + '/js/view-symbol.js')))(bare, {});
        check('the view runs on a page with no search box on it', true);
    } catch (error) {
        check('the view runs on a page with no search box on it', false,
            String(error));
    }

    return report();
}
