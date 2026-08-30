/* Exercises the watchlist outside a browser.
 *
 * Two modules. js/watchlist-store.js is pure apart from the storage object it
 * is handed, so it runs against stubs that return nonsense, throw on every
 * access, or have been wiped between two calls — which is the only way the T9
 * acceptance criteria can be checked at all without a browser: the list has to
 * survive a reload, and a cleared or blocked localStorage must not throw.
 * js/view-watchlist.js runs against the DOM stub in dom_stub.jxa.js, driven by
 * real clicks on the sort headers, the remove buttons and the Watch toggle.
 *
 * "Survives a reload" is checked the way a reload actually works: one store is
 * written through, thrown away, and a second one opened over the same storage.
 * A stub that kept the list in the module rather than in storage would pass
 * every other assertion here and fail that one.
 *
 * Promises are the awkward part, for the same reason as in strip_model.jxa.js:
 * a scheduled JXA run has no event loop to drain a microtask queue. The
 * synchronous stand-in below settles as it is built, which is sound because
 * nothing under test is concurrent — the view fans out one request per watched
 * symbol and redraws as each answers.
 *
 * Run by test_watchlist.py. Arguments: <page-dir>
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
    var storage;
    try {
        (new Function('exports', read(pageDir + '/tests/dom_stub.jxa.js')))(stub);
        var box = {};
        (new Function('window', read(pageDir + '/js/market-figures.js')))(box);
        (new Function('window', read(pageDir + '/js/watchlist-store.js')))(box);
        figures = box.IncisorMarketFigures;
        storage = box.IncisorWatchlistStore;
        check('the pure modules parse and run', !!figures && !!storage);
    } catch (error) {
        check('the pure modules parse and run', false, String(error));
        return report();
    }
    var El = stub.El;

    /* ── Storage stubs ──────────────────────────────────────────── */

    /* A localStorage that behaves. `box.seen` counts writes, because a store
     * that never persists and a store that persists correctly are otherwise
     * indistinguishable from the outside. */
    function memoryStorage(seed) {
        var held = seed === undefined ? {} : seed;
        return {
            held: held,
            writes: 0,
            getItem: function (key) {
                return Object.prototype.hasOwnProperty.call(held, key)
                    ? held[key] : null;
            },
            setItem: function (key, value) {
                this.writes++;
                held[key] = String(value);
            },
            removeItem: function (key) { delete held[key]; }
        };
    }

    /* A private window, or a browser told to block site data: the property
     * access itself throws, and so does every method on it. */
    function hostileStorage() {
        return {
            getItem: function () { throw new Error('SecurityError'); },
            setItem: function () { throw new Error('SecurityError'); },
            removeItem: function () { throw new Error('SecurityError'); }
        };
    }

    /* Storage that reads fine and refuses every write, which is what a full
     * quota looks like. */
    function fullStorage(seed) {
        var box = memoryStorage(seed);
        box.setItem = function () { throw new Error('QuotaExceededError'); };
        return box;
    }

    function stored(box) {
        var text = box.held[storage.KEY];
        return text === undefined ? null : JSON.parse(text);
    }

    function blob(symbols, sort, version) {
        var payload = { v: version === undefined ? storage.VERSION : version,
            symbols: symbols };
        if (sort) payload.sort = sort;
        var box = {};
        box[storage.KEY] = JSON.stringify(payload);
        return box;
    }

    /* ── The stored list ────────────────────────────────────────── */

    var fresh = storage.open(memoryStorage());
    same('a fresh watchlist is empty', fresh.symbols(), []);
    equal('a fresh watchlist persists', fresh.isPersistent(), true);
    equal('a fresh watchlist recovered nothing', fresh.wasRecovered(), false);
    same('a fresh watchlist sorts by symbol, ascending', fresh.sort(),
        { key: 'symbol', dir: 'asc' });

    equal('a symbol is added', fresh.add('AAPL'), 'added');
    equal('and is then present', fresh.has('AAPL'), true);
    equal('adding it twice is refused as already present', fresh.add('AAPL'),
        'present');
    equal('a lowercase ticker is accepted and normalised', fresh.add('spy'),
        'added');
    equal('and stored uppercase', fresh.has('SPY'), true);
    equal('a string that is not a ticker is refused', fresh.add('nope; DROP'),
        'invalid');
    equal('so is a number', fresh.add(7), 'invalid');
    equal('so is nothing at all', fresh.add(null), 'invalid');
    same('and none of them reached the list', fresh.symbols(), ['AAPL', 'SPY']);

    equal('a symbol is removed', fresh.remove('AAPL'), true);
    equal('removing one that is not there says so', fresh.remove('AAPL'), false);
    same('and the rest are untouched', fresh.symbols(), ['SPY']);

    /* ── The cap ────────────────────────────────────────────────── */

    var capped = storage.open(memoryStorage());
    var alphabet = 'ABCDEFGHIJKLM'.split('');
    alphabet.slice(0, storage.LIMIT).forEach(function (letter) {
        capped.add(letter + letter);
    });
    equal('the list fills to the cap', capped.symbols().length, storage.LIMIT);
    equal('and says it is full', capped.isFull(), true);
    equal('one more is refused', capped.add('ZZ'), 'full');
    equal('and the cap is not exceeded', capped.symbols().length, storage.LIMIT);
    equal('removing one makes room again', capped.remove('AA') && capped.isFull(),
        false);
    equal('and the freed slot can be used', capped.add('ZZ'), 'added');

    /* ── Reload ─────────────────────────────────────────────────── */

    var disk = memoryStorage();
    var first = storage.open(disk);
    first.add('QQQ');
    first.add('AAPL');
    first.setSort('change', 'desc');

    var second = storage.open(disk);
    same('a watchlist survives being reopened over the same storage',
        second.symbols(), ['QQQ', 'AAPL']);
    same('and so does the chosen sort', second.sort(),
        { key: 'change', dir: 'desc' });
    equal('the stored blob carries its schema version',
        stored(disk).v, storage.VERSION);

    /* ── Untrusted storage ──────────────────────────────────────── */

    var junk = storage.open(memoryStorage({ 'incisor.watchlist': 'not json{' }));
    same('a blob that is not JSON is discarded', junk.symbols(), []);
    equal('and the reader is told it happened', junk.wasRecovered(), true);

    var wrongShape = storage.open(memoryStorage(
        { 'incisor.watchlist': '{"v":1,"symbols":"SPY"}' }));
    same('a symbol list that is not a list is discarded',
        wrongShape.symbols(), []);
    equal('and that is announced too', wrongShape.wasRecovered(), true);

    var oldVersion = storage.open(memoryStorage(blob(['SPY'], null, 0)));
    same('a blob from another schema version is discarded',
        oldVersion.symbols(), []);
    equal('and announced', oldVersion.wasRecovered(), true);

    var dirty = storage.open(memoryStorage(
        blob(['SPY', 'spy', 'not a ticker', 7, null, 'QQQ'])));
    same('a list with bad entries keeps the good ones', dirty.symbols(),
        ['SPY', 'QQQ']);
    equal('and is not announced as a reset, because it was not one',
        dirty.wasRecovered(), false);

    /* Forty distinct, genuinely valid tickers. Letters only: the whitelist
     * allows no digits, so a generated list with a counter in it would be
     * rejected symbol by symbol and the cap would never be reached — which
     * is a test that passes for the wrong reason in the other direction. */
    var overLong = [];
    for (var index = 0; index < 40; index++) {
        overLong.push(String.fromCharCode(65 + Math.floor(index / 26))
            + String.fromCharCode(65 + (index % 26)));
    }
    var flooded = storage.open(memoryStorage(blob(overLong)));
    equal('a stored list longer than the cap is truncated to it',
        flooded.symbols().length, storage.LIMIT);

    var badSort = storage.open(memoryStorage(
        blob(['SPY'], { key: 'javascript:alert(1)', dir: 'sideways' })));
    same('an unreadable sort falls back a field at a time', badSort.sort(),
        { key: 'symbol', dir: 'asc' });
    same('without costing the list', badSort.symbols(), ['SPY']);

    /* ── Storage that is not there ──────────────────────────────── */

    var blocked = storage.open(hostileStorage());
    same('a storage that throws on read leaves an empty list',
        blocked.symbols(), []);
    equal('and is known not to persist before anything is written',
        blocked.isPersistent(), false);
    equal('a storage that throws is reported as not persistent',
        blocked.isPersistent(), false);
    equal('and it is not reported as a discarded list, which it was not',
        blocked.wasRecovered(), false);
    equal('adding still works for this session', blocked.add('SPY'), 'added');
    same('and the list is correct in memory', blocked.symbols(), ['SPY']);

    var absent = storage.open(null);
    /* Asked before anything is written, which is the whole point: the notice
     * is a warning, and a warning that only appears after the reader has
     * added a symbol has already missed the moment it was for. This assertion
     * passed for the wrong reason while `available` was decided at the first
     * write — it was checked after an add. */
    equal('no storage at all is known not to persist before any write',
        absent.isPersistent(), false);
    equal('and does not throw when written to anyway', absent.add('SPY'),
        'added');
    equal('and still reports that it will not survive a reload',
        absent.isPersistent(), false);

    var noRoom = storage.open(fullStorage());
    equal('a storage that refuses writes still accepts a symbol',
        noRoom.add('SPY'), 'added');
    same('and keeps it for the session', noRoom.symbols(), ['SPY']);
    equal('but reports that it will not survive a reload',
        noRoom.isPersistent(), false);

    /* ── Ordering ───────────────────────────────────────────────── */

    function row(symbol, price, change) {
        return { symbol: symbol, price: price, change: change };
    }

    function order(rows, sort) {
        return storage.sorted(rows, sort).map(function (entry) {
            return entry.symbol;
        });
    }

    var deck = [row('SPY', 733.40, -0.79), row('AAPL', 232.10, 1.42),
        row('QQQ', 571.80, -0.64)];

    same('sorted by symbol, ascending', order(deck, { key: 'symbol', dir: 'asc' }),
        ['AAPL', 'QQQ', 'SPY']);
    same('sorted by symbol, descending',
        order(deck, { key: 'symbol', dir: 'desc' }), ['SPY', 'QQQ', 'AAPL']);
    same('sorted by price, ascending', order(deck, { key: 'price', dir: 'asc' }),
        ['AAPL', 'QQQ', 'SPY']);
    same('sorted by price, descending', order(deck, { key: 'price', dir: 'desc' }),
        ['SPY', 'QQQ', 'AAPL']);
    same('sorted by change, descending',
        order(deck, { key: 'change', dir: 'desc' }), ['AAPL', 'QQQ', 'SPY']);

    var withUnknowns = [row('AAPL', 232.10, 1.42), row('IWM', null, null),
        row('SPY', 733.40, -0.79)];
    same('a row with no price sorts last, ascending',
        order(withUnknowns, { key: 'price', dir: 'asc' }),
        ['AAPL', 'SPY', 'IWM']);
    same('and still last descending, because unknown is not a small number',
        order(withUnknowns, { key: 'price', dir: 'desc' }),
        ['SPY', 'AAPL', 'IWM']);

    var tied = [row('SPY', 100, 0), row('AAPL', 100, 0), row('QQQ', 100, 0)];
    same('ties break on the symbol, so the order never wobbles',
        order(tied, { key: 'price', dir: 'asc' }), ['AAPL', 'QQQ', 'SPY']);
    same('and break the same way descending, for the same reason',
        order(tied, { key: 'price', dir: 'desc' }), ['AAPL', 'QQQ', 'SPY']);

    var original = [row('SPY', 1, 1), row('AAPL', 2, 2)];
    storage.sorted(original, { key: 'price', dir: 'desc' });
    equal('sorting does not reorder the array it was given',
        original[0].symbol, 'SPY');

    /* ── The view ───────────────────────────────────────────────── */

    function span(hook) {
        var attrs = {};
        attrs[hook] = '';
        return new El('span', attrs);
    }

    /* The served markup, as the page ships it. Built here rather than parsed
     * out of index.html so the runner states the contract it depends on —
     * test_watchlist.py asserts the page actually carries the same hooks. */
    function buildPanel() {
        var panel = new El('section', { 'data-watchlist': '',
            'data-state': 'empty' });

        ['symbol', 'price', 'change'].forEach(function (key) {
            var column = new El('th', { 'data-watchlist-column': '',
                'aria-sort': key === 'symbol' ? 'ascending' : 'none' });
            var button = new El('button', { 'data-watchlist-sort': key,
                'data-track': 'watchlist-sort',
                'aria-pressed': key === 'symbol' ? 'true' : 'false' });
            column.appendChild(button);
            panel.appendChild(column);
        });

        panel.appendChild(new El('tbody', { 'data-watchlist-rows': '' }));
        panel.appendChild(span('data-watchlist-count'));
        panel.appendChild(span('data-watchlist-notice'));

        var provenance = new El('p', { 'data-watchlist-provenance': '',
            'data-provenance-state': 'pending' });
        provenance.appendChild(span('data-watchlist-provenance-message'));
        panel.appendChild(provenance);
        return panel;
    }

    function buildWatch() {
        var watch = new El('div', { 'data-watch': '' });
        watch.hidden = true;
        var button = new El('button', { 'data-watch-toggle': '',
            'data-track': 'watchlist-toggle', 'aria-pressed': 'false',
            'aria-disabled': 'false' });
        button.appendChild(span('data-watch-toggle-label'));
        watch.appendChild(button);
        watch.appendChild(span('data-watch-note'));
        return watch;
    }

    function bars(closes) {
        return closes.map(function (close, at) {
            return { date: '2026-08-' + (20 + at), open: close, high: close,
                low: close, close: close, volume: 1000 };
        });
    }

    function payloadFor(symbol, closes, source) {
        return { symbol: symbol, source: source || 'fixture',
            delay: 'end-of-day', stale: false, bars: bars(closes) };
    }

    /* Drives the real view and hands back everything a test needs to look at.
     * `answers` maps a symbol to a payload, or to {error: ...}. */
    function mount(box, answers) {
        var panel = buildPanel();
        var watch = buildWatch();
        var documentStub = stub.makeDocument([panel, watch]);
        var asked = [];

        var windowStub = {
            localStorage: box,
            IncisorMarketFigures: figures,
            IncisorMarketData: {
                history: function (symbol) {
                    asked.push(symbol);
                    var answer = answers ? answers[symbol] : null;
                    if (!answer) return Settled.reject(new Error('offline'));
                    return answer.error
                        ? Settled.reject(answer.error)
                        : Settled.resolve(answer);
                }
            }
        };

        (new Function('window', read(pageDir + '/js/dom.js')))(windowStub);
        (new Function('window', read(pageDir + '/js/watchlist-store.js')))(windowStub);
        (new Function('document', 'window',
            read(pageDir + '/js/view-watchlist.js')))(documentStub, windowStub);

        return {
            panel: panel,
            watch: watch,
            asked: asked,
            api: windowStub.IncisorWatchlist,
            toggle: watch.querySelector('[data-watch-toggle]'),
            rows: function () {
                return panel.querySelector('[data-watchlist-rows]').children;
            },
            symbols: function () {
                return this.rows().map(function (tr) {
                    return tr.getAttribute('data-watch-row');
                });
            },
            text: function (selector) {
                var node = panel.querySelector(selector);
                return node ? node.textContent : null;
            },
            sortButton: function (key) {
                return panel.querySelector('[data-watchlist-sort="' + key + '"]');
            },
            /* The stub does not bubble — every listener these views bind
             * is on a container and reads event.target — so a click names
             * its target and is fired at the element listening for it. */
            press: function (node) {
                panel.fire('click', { target: node });
            },
            pressRow: function (node) {
                panel.querySelector('[data-watchlist-rows]')
                    .fire('click', { target: node });
            }
        };
    }

    /* An empty list, which is what every first visit sees. */
    var empty = mount(memoryStorage(), {});
    equal('an empty watchlist says it is empty',
        empty.panel.getAttribute('data-state'), 'empty');
    equal('and draws no rows', empty.rows().length, 0);
    equal('and asks for nothing upstream', empty.asked.length, 0);
    equal('and shows no count', empty.text('[data-watchlist-count]'), '');
    equal('the provenance line stays hidden with nothing to date',
        empty.panel.querySelector('[data-watchlist-provenance]').hidden, true);
    equal('the Watch toggle is hidden until a symbol is offered',
        empty.watch.hidden, true);

    /* A stored list, loaded and priced — the reload case, end to end. */
    var view = mount(memoryStorage(blob(['SPY', 'AAPL'])), {
        SPY: payloadFor('SPY', [739.2547, 733.4011]),
        AAPL: payloadFor('AAPL', [230.00, 232.10])
    });

    equal('a stored watchlist comes back filled',
        view.panel.getAttribute('data-state'), 'ready');
    equal('one call per watched symbol, and no more', view.asked.length, 2);
    same('every stored symbol gets a row', view.symbols(), ['AAPL', 'SPY']);
    equal('the row carries the last close',
        view.rows()[1].querySelector('.inc-watch-price').textContent,
        '733.40');
    equal('the count says how much room is left',
        view.text('[data-watchlist-count]'), '2 of 8 symbols.');
    equal('the provenance line appears once the rows have settled',
        view.panel.querySelector('[data-watchlist-provenance]').hidden, false);
    check('and says the prices are generated',
        view.text('[data-watchlist-provenance-message]')
            .indexOf('generated') !== -1,
        view.text('[data-watchlist-provenance-message]'));
    equal('nothing is announced about storage when nothing went wrong',
        view.panel.querySelector('[data-watchlist-notice]').hidden, true);

    var fall = view.rows()[1].querySelector('.inc-watch-delta');
    check('a fall is coloured as a fall',
        fall.classes().indexOf('inc-down') !== -1, fall.attrs['class']);
    check('and carries a down arrow, so colour is never the only signal',
        fall.querySelector('.inc-arrow').textContent === '▼');
    var rise = view.rows()[0].querySelector('.inc-watch-delta');
    check('a rise is coloured as a rise',
        rise.classes().indexOf('inc-up') !== -1, rise.attrs['class']);
    equal('and is explicitly signed', rise.querySelector('.inc-delta').textContent,
        '+2.10');

    /* Telemetry hygiene, on a control the served page never contains — the
     * page test cannot see a button that is built at runtime, and this one
     * carries a ticker in its accessible name. */
    var remove = view.rows()[0].querySelector('[data-watch-remove]');
    equal('the remove button names its symbol for a screen reader',
        remove.getAttribute('aria-label'), 'Remove AAPL from the watchlist');
    equal('and reports itself to the beacon generically',
        remove.getAttribute('data-track'), 'watchlist-remove');
    check('so no ticker can reach the telemetry endpoint',
        remove.getAttribute('data-track').indexOf('AAPL') === -1);

    /* Removing, and that the removal is persisted rather than only drawn. */
    var box = memoryStorage(blob(['SPY', 'AAPL']));
    var removing = mount(box, {
        SPY: payloadFor('SPY', [739.25, 733.40]),
        AAPL: payloadFor('AAPL', [230.00, 232.10])
    });
    removing.pressRow(removing.rows()[0].querySelector('[data-watch-remove]'));
    same('a removed symbol leaves the table', removing.symbols(), ['SPY']);
    same('and leaves storage, so the reload agrees', stored(box).symbols,
        ['SPY']);
    removing.pressRow(removing.rows()[0].querySelector('[data-watch-remove]'));
    equal('removing the last one returns the empty state',
        removing.panel.getAttribute('data-state'), 'empty');

    /* Sorting. */
    var sortBox = memoryStorage(blob(['SPY', 'AAPL', 'QQQ']));
    var sorting = mount(sortBox, {
        SPY: payloadFor('SPY', [739.25, 733.40]),
        AAPL: payloadFor('AAPL', [230.00, 232.10]),
        QQQ: payloadFor('QQQ', [575.50, 571.80])
    });
    same('the default order is by symbol', sorting.symbols(),
        ['AAPL', 'QQQ', 'SPY']);

    sorting.press(sorting.sortButton('price'));
    same('pressing a numeric column opens it biggest first', sorting.symbols(),
        ['SPY', 'QQQ', 'AAPL']);
    equal('and the column says which way it is sorted',
        sorting.sortButton('price').closest('[data-watchlist-column]')
            .getAttribute('aria-sort'), 'descending');
    equal('while the column it left says it is not sorted',
        sorting.sortButton('symbol').closest('[data-watchlist-column]')
            .getAttribute('aria-sort'), 'none');

    sorting.press(sorting.sortButton('price'));
    same('pressing it again flips the direction', sorting.symbols(),
        ['AAPL', 'QQQ', 'SPY']);
    equal('and says so', sorting.sortButton('price')
        .closest('[data-watchlist-column]').getAttribute('aria-sort'),
        'ascending');
    same('the chosen sort is persisted, so a reload keeps it',
        stored(sortBox).sort, { key: 'price', dir: 'asc' });

    sorting.press(sorting.sortButton('change'));
    same('the change column also opens biggest first', sorting.symbols(),
        ['AAPL', 'QQQ', 'SPY']);

    /* A symbol the service cannot price. */
    var partial = mount(memoryStorage(blob(['SPY', 'AAPL'])), {
        SPY: payloadFor('SPY', [739.25, 733.40]),
        AAPL: { error: new Error('offline') }
    });
    equal('a row whose call failed still exists', partial.symbols().length, 2);
    equal('and says so in its own space',
        partial.rows()[0].querySelector('.inc-watch-delta').textContent,
        'unavailable');
    equal('and shows no price it does not have',
        partial.rows()[0].querySelector('.inc-watch-price').textContent,
        '—');
    equal('the row beside it is unaffected',
        partial.rows()[1].getAttribute('data-state'), 'ready');
    equal('and the table is settled rather than loading forever',
        partial.panel.getAttribute('data-state'), 'ready');

    /* The Watch toggle. */
    var toggleBox = memoryStorage();
    var toggling = mount(toggleBox, { SPY: payloadFor('SPY', [739.25, 733.40]) });
    toggling.api.offer('SPY');
    equal('offering a symbol shows the toggle', toggling.watch.hidden, false);
    equal('which starts unpressed', toggling.toggle.getAttribute('aria-pressed'),
        'false');
    equal('and reads as an invitation',
        toggling.watch.querySelector('[data-watch-toggle-label]').textContent,
        'Watch');
    equal('and names the symbol it would act on',
        toggling.toggle.getAttribute('aria-label'), 'Watch SPY');

    toggling.toggle.fire('click');
    equal('pressing it adds the symbol', toggling.symbols()[0], 'SPY');
    equal('and the button reports the new state',
        toggling.toggle.getAttribute('aria-pressed'), 'true');
    equal('and says what it is now doing',
        toggling.watch.querySelector('[data-watch-toggle-label]').textContent,
        'Watching');
    equal('and offers the way back out',
        toggling.toggle.getAttribute('aria-label'), 'Stop watching SPY');
    same('and it is persisted', stored(toggleBox).symbols, ['SPY']);
    equal('and the row was priced without a second page load',
        toggling.rows()[0].querySelector('.inc-watch-price').textContent,
        '733.40');

    toggling.toggle.fire('click');
    same('pressing it again removes the symbol', toggling.symbols(), []);
    same('and that is persisted too', stored(toggleBox).symbols, []);

    toggling.api.offer(null);
    equal('withdrawing the symbol hides the toggle again',
        toggling.watch.hidden, true);

    /* The toggle at the cap. */
    var eight = [];
    for (var seat = 0; seat < storage.LIMIT; seat++) {
        eight.push('W' + String.fromCharCode(65 + seat));
    }
    var full = mount(memoryStorage(blob(eight)), {});
    full.api.offer('SPY');
    equal('a full list refuses a new symbol in the accessibility tree',
        full.toggle.getAttribute('aria-disabled'), 'true');
    check('and says why, where the button describes itself',
        full.watch.querySelector('[data-watch-note]').textContent
            .indexOf('full') !== -1,
        full.watch.querySelector('[data-watch-note]').textContent);
    full.toggle.fire('click');
    equal('and pressing it anyway changes nothing', full.symbols().length,
        storage.LIMIT);
    equal('the count says the list is full',
        full.text('[data-watchlist-count]'),
        'Full at 8 symbols. Remove one to add another.');

    full.api.offer(eight[0]);
    equal('a symbol already watched is never refused, full or not',
        full.toggle.getAttribute('aria-disabled'), 'false');

    /* Storage the browser will not let us write. */
    var noStore = mount(hostileStorage(), {});
    equal('a blocked storage does not stop the watchlist rendering',
        noStore.panel.getAttribute('data-state'), 'empty');
    equal('and the reader is warned it will not persist',
        noStore.panel.querySelector('[data-watchlist-notice]').hidden, false);
    check('in words that say what is actually lost',
        noStore.text('[data-watchlist-notice]').indexOf('reload') !== -1,
        noStore.text('[data-watchlist-notice]'));

    var wiped = mount(memoryStorage({ 'incisor.watchlist': '{{{' }), {});
    equal('a discarded blob is announced',
        wiped.panel.querySelector('[data-watchlist-notice]').hidden, false);
    check('and says the list was cleared rather than blaming the browser',
        wiped.text('[data-watchlist-notice]').indexOf('cleared') !== -1,
        wiped.text('[data-watchlist-notice]'));

    /* Degradation, the promise every module on this page makes in its header. */
    var bare = {
        querySelector: function () { return null; },
        getElementById: function () { return null; },
        createElement: function () { return new El('div', {}); }
    };
    try {
        (new Function('document', 'window',
            read(pageDir + '/js/view-watchlist.js')))(bare, {});
        check('the view runs on a page with no watchlist markup', true);
    } catch (error) {
        check('the view runs on a page with no watchlist markup', false,
            String(error));
    }

    try {
        var lonely = buildPanel();
        var quiet = { IncisorWatchlist: 'untouched' };
        (new Function('document', 'window',
            read(pageDir + '/js/view-watchlist.js')))(
            stub.makeDocument([lonely]), quiet);
        check('the view leaves the served markup alone with no helpers loaded',
            lonely.getAttribute('data-state') === 'empty'
                && quiet.IncisorWatchlist === 'untouched');
    } catch (error) {
        check('the view leaves the served markup alone with no helpers loaded',
            false, String(error));
    }

    return report();
}
