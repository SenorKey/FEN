/* Exercises the index summary strip outside a browser.
 *
 * Three modules, three ways. js/market-figures.js is pure, so it runs against
 * hand-computed values with nothing stubbed. js/market-data.js is the network
 * seam, so it runs against a fake fetch. js/view-index-strip.js runs against
 * a DOM stub with the data module replaced, which is what lets the render,
 * the failure state and the mixed state all be checked deterministically.
 *
 * Promises are the awkward part: a scheduled JXA run has no event loop to
 * drain a microtask queue, so a real Promise would leave every assertion
 * checking a pending value. The synchronous stand-in below settles as it is
 * built, which is sound here because nothing under test is actually
 * concurrent — it fans out four independent requests and counts the answers.
 *
 * Run by test_index_strip.py. Arguments: <page-dir>
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

    /* ── Figures ────────────────────────────────────────────────── */

    var figures;
    try {
        var figuresWindow = {};
        (new Function('window', read(pageDir + '/js/market-figures.js')))(figuresWindow);
        figures = figuresWindow.IncisorMarketFigures;
        check('market-figures.js parses and runs', !!figures);
    } catch (error) {
        check('market-figures.js parses and runs', false, String(error));
        return report();
    }

    function bar(date, close) {
        return { date: date, open: close, high: close, low: close,
            close: close, volume: 1000 };
    }

    /* The real numbers from the committed SPY fixture, so the arithmetic is
     * checked against the data the page will actually be handed. */
    var spy = [bar('2026-08-24', 737.0765), bar('2026-08-25', 739.2547),
        bar('2026-08-26', 733.4011)];
    var quote = figures.quoteFromBars(spy);

    equal('the latest close is the last bar', quote.close, 733.4011);
    close('the change is measured against the bar before it',
        quote.change, -5.8536, 0.0001);
    close('the percentage change matches the fixture quote',
        quote.changePercent, -0.7918, 0.0005);
    equal('the quote carries the trading day', quote.date, '2026-08-26');

    var single = figures.quoteFromBars([bar('2026-08-26', 100)]);
    equal('a one-bar series has a price', single.close, 100);
    equal('a one-bar series has no change, rather than a change of zero',
        single.change, null);

    check('an empty series has no quote', figures.quoteFromBars([]) === null);
    check('a missing series has no quote', figures.quoteFromBars(null) === null);
    check('a bar with a non-numeric close has no quote',
        figures.quoteFromBars([{ date: '2026-08-26', close: 'oops' }]) === null);

    var zeroBase = figures.quoteFromBars([bar('a', 0), bar('b', 5)]);
    equal('a zero previous close yields no percentage rather than infinity',
        zeroBase.changePercent, null);

    var many = [];
    for (var index = 0; index < 90; index++) many.push(bar('d' + index, index));
    equal('closingPrices returns the most recent window',
        figures.closingPrices(many, 30).length, 30);
    equal('closingPrices takes the end of the series, not the start',
        figures.closingPrices(many, 30)[29], 89);
    equal('closingPrices drops a bar it cannot read',
        figures.closingPrices([bar('a', 1), { date: 'b' }, bar('c', 3)], 30).length, 2);

    equal('a rise is up', figures.direction(1.2), 'up');
    equal('a fall is down', figures.direction(-1.2), 'down');
    equal('no move is flat', figures.direction(0), 'flat');
    equal('an unknown move is flat', figures.direction(null), 'flat');
    equal('up carries a filled up arrow', figures.arrowFor(1), '▲');
    equal('down carries a filled down arrow', figures.arrowFor(-1), '▼');
    equal('flat carries a bar, not an arrow', figures.arrowFor(0), '▬');

    equal('a price is grouped and shown to two places',
        figures.formatPrice(1234.5), '1,234.50');
    equal('a rise is explicitly signed', figures.formatSigned(2.5), '+2.50');
    equal('a fall uses a real minus sign, not a hyphen',
        figures.formatSigned(-2.5), '−2.50');
    equal('an unchanged value is signed with nothing',
        figures.formatSigned(0), '0.00');
    equal('a percentage carries its sign and its unit',
        figures.formatPercent(-0.4567), '−0.46%');
    equal('an unknown price is an em dash', figures.formatPrice(null), '—');
    equal('an unknown change is an em dash', figures.formatSigned(undefined), '—');

    equal('a trading date reads as a date',
        figures.formatBarDate('2026-08-26'), '26 Aug 2026');
    check('a trading date is not shifted a day west by the local zone',
        figures.formatBarDate('2026-08-26').indexOf('25 ') === -1,
        'got ' + figures.formatBarDate('2026-08-26'));
    equal('the first of the month has no leading zero',
        figures.formatBarDate('2026-01-01'), '1 Jan 2026');
    equal('an unparseable date is an em dash',
        figures.formatBarDate('not-a-date'), '—');
    equal('a nonsense month is an em dash',
        figures.formatBarDate('2026-13-01'), '—');

    /* ── Sparkline geometry ─────────────────────────────────────── */

    var shape = figures.sparkline([10, 30, 20], 120, 34, 3);
    var points = shape.path.replace('M', '').split('L').map(function (pair) {
        var parts = pair.split(',');
        return { x: parseFloat(parts[0]), y: parseFloat(parts[1]) };
    });

    equal('every close becomes a point', points.length, 3);
    equal('the line starts at the left edge', points[0].x, 0);
    equal('the line ends at the right edge', points[2].x, 120);
    check('x advances left to right',
        points[0].x < points[1].x && points[1].x < points[2].x);
    check('the highest close sits highest on screen',
        points[1].y < points[0].y && points[1].y < points[2].y,
        'ys: ' + points.map(function (p) { return p.y; }).join(','));
    equal('the lowest close sits at the bottom of the padded box',
        points[0].y, 31);
    equal('the highest close sits at the top of the padded box',
        points[1].y, 3);
    equal('the baseline is drawn at the opening close',
        shape.baselineY, points[0].y);
    close('the period change is last minus first', shape.change, 10, 0.0001);
    close('the period percentage is measured off the opening close',
        shape.changePercent, 100, 0.0001);

    var flat = figures.sparkline([50, 50, 50], 120, 34, 3);
    check('a flat series still draws', !!flat);
    check('a flat series has no NaN in its path', flat.path.indexOf('NaN') === -1,
        flat.path);
    equal('a flat series is drawn down the middle',
        flat.path.split('L')[0], 'M0,17');
    equal('a flat series has no percentage move', flat.changePercent, 0);

    check('a single close is not a trend',
        figures.sparkline([5], 120, 34, 3) === null);
    check('no closes is not a trend', figures.sparkline([], 120, 34, 3) === null);
    check('a box with no height is refused',
        figures.sparkline([1, 2], 120, 4, 3) === null);

    /* ── The data client ────────────────────────────────────────── */

    var requested = [];
    var nextResponse = null;

    function fetchStub(url) {
        requested.push(url);
        if (nextResponse.reject) return Settled.reject(nextResponse.reject);
        return Settled.resolve({
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

    function envelope(overrides) {
        var payload = {
            symbol: 'SPY',
            source: 'fixture',
            delay: 'end-of-day',
            stale: false,
            fetched_at: '2026-08-27T12:00:00Z',
            history: {
                symbol: 'SPY',
                bars: [
                    { date: '2026-08-25', open: 1, high: 2, low: 0.5,
                        close: 656.8264, volume: 10 },
                    { date: '2026-08-26', open: 1, high: 2, low: 0.5,
                        close: 657.1995, volume: 11 }
                ]
            }
        };
        Object.keys(overrides || {}).forEach(function (key) {
            payload[key] = overrides[key];
        });
        return payload;
    }

    function ask(symbol, response) {
        nextResponse = response;
        return data.history(symbol);
    }

    var good = ask('SPY', { body: envelope() });
    equal('a good payload resolves', good.state, 'ok');
    equal('the request goes to our own service, by relative path',
        requested[requested.length - 1], '/api/incisor/history?symbol=SPY');
    equal('the bars come back parsed', good.value.bars.length, 2);
    equal('the last bar is the latest close', good.value.bars[1].close, 657.1995);
    equal('the source is carried through so the page can label it',
        good.value.source, 'fixture');
    equal('staleness is carried through', good.value.stale, false);

    requested = [];
    var bad = data.history('spy; DROP TABLE');
    equal('a symbol that is not a ticker is refused', bad.state, 'fail');
    equal('and refused before it becomes a request', requested.length, 0);
    equal('the refusal names itself', bad.value.kind, 'invalid_symbol');

    equal('a non-ok response is a failure',
        ask('SPY', { ok: false, body: {} }).state, 'fail');
    equal('an unreachable service is a failure',
        ask('SPY', { reject: new Error('boom') }).state, 'fail');
    equal('an unreachable service is reported as offline',
        ask('SPY', { reject: new Error('boom') }).value.kind, 'offline');

    var wrongSymbol = ask('SPY', { body: envelope({ symbol: 'QQQ' }) });
    equal('a payload for another symbol is refused', wrongSymbol.state, 'fail');
    equal('and refused as malformed', wrongSymbol.value.kind, 'malformed');

    equal('a payload with no source field is refused',
        ask('SPY', { body: envelope({ source: undefined }) }).state, 'fail');
    equal('an empty series is refused',
        ask('SPY', { body: envelope({ history: { bars: [] } }) }).state, 'fail');
    equal('a series that is not an array is refused',
        ask('SPY', { body: envelope({ history: { bars: 'nope' } }) }).state, 'fail');
    equal('a bar with a non-numeric close is refused',
        ask('SPY', { body: envelope({ history: { bars: [{ date: 'x', close: 'y' }] } })
        }).state, 'fail');
    equal('a bar with no date is refused',
        ask('SPY', { body: envelope({ history: { bars: [{ close: 1 }] } }) }).state,
        'fail');

    /* ── The view ───────────────────────────────────────────────── */

    var SVG_NS = 'http://www.w3.org/2000/svg';

    function El(tag, attrs) {
        this.tag = tag;
        this.attrs = attrs || {};
        this.children = [];
        this.parent = null;
        this.textContent = '';
        this.namespace = null;
        var self = this;
        this.classList = {
            add: function () {
                var list = self.classes();
                Array.prototype.forEach.call(arguments, function (name) {
                    if (list.indexOf(name) === -1) list.push(name);
                });
                self.attrs['class'] = list.join(' ');
            },
            remove: function () {
                var drop = Array.prototype.slice.call(arguments);
                self.attrs['class'] = self.classes().filter(function (name) {
                    return drop.indexOf(name) === -1;
                }).join(' ');
            }
        };
    }

    El.prototype.classes = function () {
        return (this.attrs['class'] || '').split(' ').filter(function (name) {
            return name.length > 0;
        });
    };
    El.prototype.getAttribute = function (name) {
        return Object.prototype.hasOwnProperty.call(this.attrs, name)
            ? this.attrs[name] : null;
    };
    El.prototype.setAttribute = function (name, value) {
        this.attrs[name] = String(value);
    };
    El.prototype.matches = function (selector) {
        if (selector.charAt(0) === '[') {
            return Object.prototype.hasOwnProperty.call(
                this.attrs, selector.slice(1, -1));
        }
        if (selector.charAt(0) === '.') {
            return this.classes().indexOf(selector.slice(1)) !== -1;
        }
        return false;
    };
    El.prototype.querySelectorAll = function (selector) {
        var found = [];
        (function walk(node) {
            node.children.forEach(function (child) {
                if (child.matches(selector)) found.push(child);
                walk(child);
            });
        })(this);
        return found;
    };
    El.prototype.querySelector = function (selector) {
        var found = this.querySelectorAll(selector);
        return found.length ? found[0] : null;
    };
    El.prototype.appendChild = function (child) {
        child.parent = this;
        this.children.push(child);
        this.firstChild = this.children[0];
        return child;
    };
    El.prototype.removeChild = function (child) {
        this.children = this.children.filter(function (node) {
            return node !== child;
        });
        this.firstChild = this.children.length ? this.children[0] : null;
        return child;
    };

    function buildTile(symbol) {
        var tile = new El('li', { 'class': 'inc-tile', 'data-tile': symbol,
            'data-state': 'pending' });
        tile.appendChild(new El('p', { 'class': 'inc-tile-price',
            'data-tile-price': '' }));
        var change = new El('p', { 'class': 'inc-tile-change inc-flat',
            'data-tile-change': '' });
        change.appendChild(new El('span', { 'class': 'inc-arrow',
            'data-tile-arrow': '' }));
        change.appendChild(new El('span', { 'class': 'inc-delta',
            'data-tile-delta': '' }));
        change.appendChild(new El('span', { 'class': 'inc-delta-pct',
            'data-tile-pct': '' }));
        tile.appendChild(change);
        tile.appendChild(new El('svg', { 'class': 'inc-spark',
            'data-tile-spark': '', 'aria-label': 'not loaded' }));
        return tile;
    }

    /* Drives the real view with a stubbed data module and returns what ended
     * up on screen. `answers` maps a symbol to a payload or to an error. */
    function render(symbols, answers) {
        var strip = new El('ul', { 'data-index-strip': '' });
        symbols.forEach(function (symbol) {
            strip.appendChild(buildTile(symbol));
        });

        var provenance = new El('p', { 'data-provenance': '',
            'data-provenance-state': 'pending' });
        provenance.appendChild(new El('span', { 'data-provenance-message': '' }));

        var roots = [strip, provenance];
        var documentStub = {
            querySelector: function (selector) {
                for (var index = 0; index < roots.length; index++) {
                    if (roots[index].matches(selector)) return roots[index];
                }
                return null;
            },
            getElementById: function () { return null; },
            createElementNS: function (ns, tag) {
                var element = new El(tag, {});
                element.namespace = ns;
                return element;
            }
        };

        var windowStub = {
            setInterval: function () { return 0; },
            IncisorMarketFigures: figures,
            IncisorMarketData: {
                history: function (symbol) {
                    var answer = answers[symbol];
                    return answer && answer.error
                        ? Settled.reject(answer.error)
                        : Settled.resolve(answer);
                }
            }
        };

        (new Function('window', read(pageDir + '/js/dom.js')))(windowStub);
        (new Function('document', 'window',
            read(pageDir + '/js/view-index-strip.js')))(documentStub, windowStub);

        return { strip: strip, provenance: provenance,
            tiles: strip.querySelectorAll('[data-tile]') };
    }

    function loaded(symbol, closes, source, stale) {
        var bars = closes.map(function (value, index) {
            return bar('2026-08-' + (10 + index), value);
        });
        return { symbol: symbol, source: source || 'fixture',
            delay: 'end-of-day', stale: !!stale, bars: bars };
    }

    var view = render(['SPY', 'QQQ'], {
        SPY: loaded('SPY', [700, 730.2547, 733.4011]),
        QQQ: loaded('QQQ', [580, 575.5, 571.8])
    });

    equal('a filled tile says so', view.tiles[0].getAttribute('data-state'), 'ready');
    equal('the price is written into the tile',
        view.tiles[0].querySelector('[data-tile-price]').textContent, '733.40');
    equal('the change is written into the tile',
        view.tiles[0].querySelector('[data-tile-delta]').textContent, '+3.15');
    equal('the percentage is written into the tile',
        view.tiles[0].querySelector('[data-tile-pct]').textContent, '+0.43%');

    var down = view.tiles[1];
    check('a fall is coloured as a fall',
        down.querySelector('[data-tile-change]').classes().indexOf('inc-down') !== -1,
        down.querySelector('[data-tile-change]').attrs['class']);
    equal('a fall also carries a down arrow, so colour is never the only signal',
        down.querySelector('[data-tile-arrow]').textContent, '▼');
    check('the rising tile is not left carrying the falling class',
        view.tiles[0].querySelector('[data-tile-change]')
            .classes().indexOf('inc-up') !== -1);

    var spark = view.tiles[0].querySelector('[data-tile-spark]');
    equal('the sparkline is drawn as two shapes', spark.children.length, 2);
    equal('the opening level is drawn first', spark.children[0].tag, 'line');
    equal('the line itself is a path', spark.children[1].tag, 'path');
    equal('the path is created in the SVG namespace',
        spark.children[1].namespace, SVG_NS);
    check('the path has real geometry',
        spark.children[1].getAttribute('d').indexOf('M0,') === 0,
        spark.children[1].getAttribute('d'));
    check('the sparkline is not coloured by its own direction, which would '
        + 'contradict the day change beside it',
        spark.getAttribute('data-direction') === null);
    check('the sparkline says which way it went in words, for a screen reader',
        spark.getAttribute('aria-label').indexOf('up') !== -1,
        spark.getAttribute('aria-label'));

    check('the provenance line says the prices are generated',
        view.provenance.querySelector('[data-provenance-message]')
            .textContent.indexOf('generated') !== -1,
        view.provenance.querySelector('[data-provenance-message]').textContent);
    check('the provenance line dates the data',
        view.provenance.querySelector('[data-provenance-message]')
            .textContent.indexOf('12 Aug 2026') !== -1,
        view.provenance.querySelector('[data-provenance-message]').textContent);
    equal('the provenance state marks it as sample data',
        view.provenance.getAttribute('data-provenance-state'), 'sample');

    var live = render(['SPY'], { SPY: loaded('SPY', [1, 2], 'live') });
    equal('live data is not labelled as a sample',
        live.provenance.getAttribute('data-provenance-state'), 'live');
    check('live data is labelled as delayed',
        live.provenance.querySelector('[data-provenance-message]')
            .textContent.indexOf('Delayed') === 0,
        live.provenance.querySelector('[data-provenance-message]').textContent);

    var stale = render(['SPY'], { SPY: loaded('SPY', [1, 2], 'live', true) });
    equal('a stale answer is marked stale',
        stale.provenance.getAttribute('data-provenance-state'), 'stale');
    check('a stale answer says it could not be refreshed',
        stale.provenance.querySelector('[data-provenance-message]')
            .textContent.indexOf('could not be refreshed') !== -1);

    var mixed = render(['SPY', 'QQQ'], {
        SPY: loaded('SPY', [700, 733.4011]),
        QQQ: { error: new Error('offline') }
    });
    equal('a tile that failed says so', mixed.tiles[1].getAttribute('data-state'),
        'error');
    equal('a failed tile says unavailable in its own space',
        mixed.tiles[1].querySelector('[data-tile-delta]').textContent, 'unavailable');
    equal('a failed tile shows no price',
        mixed.tiles[1].querySelector('[data-tile-price]').textContent, '—');
    equal('the tile beside it is unaffected',
        mixed.tiles[0].getAttribute('data-state'), 'ready');
    check('the provenance line counts what is missing',
        mixed.provenance.querySelector('[data-provenance-message]')
            .textContent.indexOf('1 tile is unavailable') !== -1,
        mixed.provenance.querySelector('[data-provenance-message]').textContent);

    var dead = render(['SPY', 'QQQ'], {
        SPY: { error: new Error('offline') },
        QQQ: { error: new Error('offline') }
    });
    equal('with the service down the strip reports it',
        dead.provenance.getAttribute('data-provenance-state'), 'error');
    check('and says so in words a reader understands',
        dead.provenance.querySelector('[data-provenance-message]')
            .textContent.indexOf('Market data unavailable') === 0,
        dead.provenance.querySelector('[data-provenance-message]').textContent);
    equal('every tile shows its own failure',
        dead.tiles.filter(function (tile) {
            return tile.getAttribute('data-state') === 'error';
        }).length, 2);

    var short = render(['SPY'], { SPY: loaded('SPY', [100]) });
    equal('a one-bar series still prices the tile',
        short.tiles[0].querySelector('[data-tile-price]').textContent, '100.00');
    equal('a one-bar series shows no change rather than inventing one',
        short.tiles[0].querySelector('[data-tile-delta]').textContent, '—');
    equal('a one-bar series draws no sparkline',
        short.tiles[0].querySelector('[data-tile-spark]').children.length, 0);

    /* The view has to survive a page with no strip on it at all — that is
     * every other tab's problem the moment the markup is restructured. It
     * also has to survive js/dom.js failing to load, which is the same
     * degradation every module here promises in its header. */
    var bare = {
        querySelector: function () { return null; },
        getElementById: function () { return null; }
    };
    try {
        (new Function('document', 'window',
            read(pageDir + '/js/view-index-strip.js')))(bare, {});
        check('the view runs on a page with no strip', true);
    } catch (error) {
        check('the view runs on a page with no strip', false, String(error));
    }

    try {
        var stripOnly = new El('ul', { 'data-index-strip': '' });
        stripOnly.appendChild(buildTile('SPY'));
        (new Function('document', 'window',
            read(pageDir + '/js/view-index-strip.js')))(
            {
                querySelector: function (selector) {
                    return stripOnly.matches(selector) ? stripOnly : null;
                },
                getElementById: function () { return null; }
            },
            { IncisorMarketFigures: figures, IncisorMarketData: { history: null } });
        check('the view leaves the served markup alone with no helpers loaded',
            stripOnly.querySelector('[data-tile-price]').textContent === '');
    } catch (error) {
        check('the view leaves the served markup alone with no helpers loaded',
            false, String(error));
    }

    return report();
}
