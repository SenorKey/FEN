/* Exercises the reporting calendar outside a browser.
 *
 * Two things, and the risk is not evenly split between them.
 *
 * The **reader** is ordinary: a payload with a calendar, one without, one
 * with reports and no projection. Absence is a shape here rather than a
 * failure, the same rule the filings reader follows beside it.
 *
 * The **view** is where this surface can mislead rather than merely break,
 * which is why most of what follows is about wording and not about numbers.
 * A projected window rendered without the word "projected" is a date a reader
 * will take as announced; a year-ago change rendered as 0.0% when there is no
 * year-ago figure states that a company earned the same; and a fund rendered
 * with an empty table answers a question about a company with the furniture
 * of one. All three look fine in a screenshot.
 *
 * The one thing checked here that is not the calendar's own is the request
 * sharing. Two surfaces read one response and both are started in the same
 * tick, so a lookup must make one request and not two — a claim that lives in
 * js/market-data.js and can only be seen by asking twice.
 *
 * What it cannot cover is whether five columns read as a table at 375px.
 * tools/shoot.py does that, and the screenshots are the evidence.
 *
 * Promises: a scheduled JXA run has no event loop, so the stand-in settles as
 * it is built. Sound, because nothing here is concurrent.
 *
 * Run by test_reports_panel.py. Arguments: <page-dir>
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

    function contains(name, haystack, needle) {
        check(name, typeof haystack === 'string' && haystack.indexOf(needle) > -1,
            'expected to find ' + JSON.stringify(needle) + ' in '
                + JSON.stringify(haystack));
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
    var DASH = figures.DASH;

    /* Everything a node and its descendants say, joined.
     *
     * The stub's `textContent` is a plain property rather than a getter that
     * walks children, which is right — it implements what the views use, and
     * a view only ever writes it. A test reading a row built out of five
     * cells needs the other direction, so it is done here rather than by
     * teaching the shared stub a browser behaviour nothing shipped depends
     * on. */
    function textOf(node) {
        if (!node) return '';
        var own = node.textContent || '';
        return node.children.reduce(function (text, child) {
            return text + ' ' + textOf(child);
        }, own).trim();
    }

    /* ── The data client's reader ───────────────────────────────── */

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

    function quarter(end, filed, eps, dividend, yearAgo, change) {
        return { end: end, filed: filed, form: '10-Q', eps: eps,
            dividend: dividend, eps_year_ago: yearAgo, eps_change: change };
    }

    function reportingBody() {
        return {
            last: { end: '2026-06-27', filed: '2026-08-08', form: '10-Q',
                lag_days: 42 },
            next: { period_end: '2026-09-26', earliest: '2026-11-03',
                latest: '2026-11-08', lag_min: 38, lag_max: 43,
                basis_reports: 4, cadence_days: 91 },
            quarters: [
                quarter('2026-06-27', '2026-08-08', 2.00, 0.26, 1.95, 0.025641),
                quarter('2026-03-28', '2026-05-07', 1.80, 0.26, 1.55, 0.161290),
                quarter('2025-12-27', '2026-02-08', 1.81, 0.26, 1.44, 0.256944),
                quarter('2025-09-27', '2025-11-04', 1.51, 0.26, 1.34, 0.126866)
            ]
        };
    }

    function payload(reporting) {
        return {
            symbol: 'AAPL', source: 'fixture', stale: false,
            fetched_at: '2026-08-27T12:00:00Z',
            fundamentals: {
                filings: null, measures: null,
                reporting: reporting === undefined ? reportingBody() : reporting
            }
        };
    }

    function ask(response, symbol) {
        nextResponse = response;
        return data.fundamentals(symbol || 'AAPL');
    }

    var good = ask({ body: payload() });
    equal('a calendar comes back', good.state, 'ok');
    equal('the last report is read', good.value.reporting.last.filed,
        '2026-08-08');
    equal('and renamed the way every other reader renames a field',
        good.value.reporting.last.lagDays, 42);
    equal('the projected window is read',
        good.value.reporting.next.earliest, '2026-11-03');
    equal('four quarters come through', good.value.reporting.quarters.length, 4);
    equal('with their year-ago figure',
        good.value.reporting.quarters[0].epsYearAgo, 1.95);

    var fund = ask({ body: payload(null) });
    equal('a fund with no calendar still resolves', fund.state, 'ok');
    equal('and its calendar is absent rather than empty',
        fund.value.reporting, null);

    var noProjection = ask({ body: payload({
        last: { end: '2026-06-27', filed: '2026-08-08', form: '10-Q',
            lag_days: 42 },
        next: null,
        quarters: [quarter('2026-06-27', '2026-08-08', 2.00, null, null, null)]
    }) });
    equal('a company with one report still resolves', noProjection.state, 'ok');
    equal('and its projection is absent',
        noProjection.value.reporting.next, null);

    var halfWindow = ask({ body: payload({
        last: null, next: { earliest: '2026-11-03' }, quarters: []
    }) });
    equal('a window missing one end is refused rather than half drawn',
        halfWindow.value.reporting.next, null);

    var notAList = ask({ body: payload({ last: null, next: null,
        quarters: 'soon' }) });
    equal('a calendar whose quarters are not a list is refused',
        notAList.value.reporting, null);

    var badFigure = ask({ body: payload({ last: null, next: null,
        quarters: [quarter('2026-06-27', '2026-08-08', 'lots', null,
            null, null)] }) });
    equal('a figure that is not a number becomes unknown, never a string',
        badFigure.value.reporting.quarters[0].eps, null);

    /* One response, two surfaces. Both views are started in the same tick by
     * js/view-symbol.js, so a second ask while the first is in flight has to
     * join it — otherwise every lookup makes this request twice.
     *
     * This is the one claim in the file that a promise settling as it is
     * built cannot show: the memo clears when the request settles, and a
     * synchronous stand-in has settled before the second caller arrives. So
     * the fetch here is left genuinely pending, which is what a network is. */
    var held = null;

    function Pending() {
        this.handlers = [];
    }
    Pending.prototype.then = function (onOk, onFail) {
        var next = new Pending();
        this.handlers.push({ ok: onOk, fail: onFail, next: next });
        return next;
    };
    /* Adopts a promise a handler returns, the way a real one does. Without
     * it the client's `response.json().then(...)` inside a `.then(...)` would
     * hand the next link a promise object where the parsed payload should be,
     * and the reader would call that malformed — which is a bug in this
     * harness that would read exactly like a bug in the page. */
    Pending.prototype.settle = function (state, value) {
        this.handlers.forEach(function (handler) {
            var run = state === 'ok' ? handler.ok : handler.fail;
            if (!run) {
                handler.next.settle(state, value);
                return;
            }
            var out;
            try {
                out = run(value);
            } catch (error) {
                handler.next.settle('fail', error);
                return;
            }
            if (out && typeof out.then === 'function') {
                out.then(function (settled) {
                    handler.next.settle('ok', settled);
                }, function (error) {
                    handler.next.settle('fail', error);
                });
            } else {
                handler.next.settle('ok', out);
            }
        });
        this.handlers = [];
    };

    requested = [];
    dataWindow.fetch = function (url) {
        requested.push(url);
        held = new Pending();
        return held;
    };

    var first = data.fundamentals('AAPL');
    var second = data.fundamentals('AAPL');
    equal('a request already in flight is joined, not repeated',
        requested.length, 1);
    equal('and both callers are handed the same promise', first, second);

    var other = data.fundamentals('MSFT');
    equal('a different symbol is its own request', requested.length, 2);
    check('and its own promise', other !== first);

    /* Once it lands, the next lookup is a fresh request. Holding the settled
     * answer would make the surface show a filing history that had stopped
     * being refreshed, with nothing on the page to expire it — the service
     * caches for a day and that is where the caching belongs. */
    held.settle('ok', { ok: true, status: 200,
        json: function () {
            var body = payload();
            body.symbol = 'MSFT';
            return Settled.resolve(body);
        } });
    requested = [];
    dataWindow.fetch = fetchStub;
    ask({ body: payload() });
    equal('a settled request is not held for the next lookup',
        requested.length, 1);

    /* ── The view ───────────────────────────────────────────────── */

    /* The served markup, as index.html ships it. Built here rather than
     * parsed out of the page, for the reason the other runners give: this is
     * the contract the view documents, and test_reports_panel.py separately
     * asserts the page still carries it. */
    function buildPanel() {
        var panel = new El('section', { 'data-reports': '',
            'data-state': 'empty' });
        panel.appendChild(new El('span', { 'data-reports-symbol': '' }));
        panel.appendChild(new El('p', { 'data-reports-message': '' }));

        var body = new El('div', { 'data-reports-body': '' });
        ['last', 'next'].forEach(function (name) {
            var item = new El('div', {});
            var value = new El('span', {});
            value.setAttribute('data-reports-figure', name);
            item.appendChild(value);
            var note = new El('span', {});
            note.setAttribute('data-reports-note', name);
            item.appendChild(note);
            body.appendChild(item);
        });
        var table = new El('table', {});
        table.appendChild(new El('tbody', { 'data-reports-rows': '' }));
        body.appendChild(table);
        body.hidden = true;
        panel.appendChild(body);

        var provenance = new El('p', { 'data-reports-provenance': '',
            'data-provenance-state': 'pending' });
        provenance.appendChild(new El('span',
            { 'data-reports-provenance-message': '' }));
        panel.appendChild(provenance);
        return panel;
    }

    function mount(answers) {
        var panel = buildPanel();
        var documentStub = stub.makeDocument([panel]);
        var calls = [];

        var windowStub = {
            IncisorMarketFigures: figures,
            IncisorMarketData: {
                fundamentals: function (symbol) {
                    calls.push(symbol);
                    var answer = answers[symbol];
                    if (!answer || answer.error) {
                        return Settled.reject(new Error('offline'));
                    }
                    return Settled.resolve(answer);
                }
            }
        };

        (new Function('window', read(pageDir + '/js/dom.js')))(windowStub);
        (new Function('document', 'window',
            read(pageDir + '/js/view-reports.js')))(documentStub, windowStub);

        return {
            panel: panel,
            api: windowStub.IncisorReports,
            calls: function () { return calls; },
            state: function () { return panel.getAttribute('data-state'); },
            figure: function (name) {
                var node = panel.querySelector(
                    '[data-reports-figure="' + name + '"]');
                return node ? node.textContent : null;
            },
            note: function (name) {
                var node = panel.querySelector(
                    '[data-reports-note="' + name + '"]');
                return node ? node.textContent : null;
            },
            rowsText: function () {
                return textOf(panel.querySelector('[data-reports-rows]'));
            },
            text: function (selector) {
                var node = panel.querySelector(selector);
                return node ? node.textContent : null;
            },
            rows: function () {
                return panel.querySelector('[data-reports-rows]').children;
            },
            rowText: function (index) {
                return textOf(panel.querySelector('[data-reports-rows]')
                    .children[index]);
            },
            bodyHidden: function () {
                return panel.querySelector('[data-reports-body]').hidden;
            }
        };
    }

    var company = ask({ body: payload() }).value;
    var etf = ask({ body: payload(null) }).value;
    var young = noProjection.value;

    var view = mount({ AAPL: company, XLK: etf, NEW: young,
        DEAD: { error: true } });
    check('the view exposes the API the lookup drives', !!view.api);

    equal('it ships in its empty state', view.state(), 'empty');
    equal('and its table ships hidden', view.bodyHidden(), true);

    view.api.show('AAPL');
    equal('a company reaches the ready state', view.state(), 'ready');
    equal('and its table is shown', view.bodyHidden(), false);
    equal('one request per lookup', view.calls().length, 1);

    equal('the last report is the date it was filed',
        view.figure('last'), '8 Aug 2026');
    contains('and the note says which quarter it covered',
        view.note('last'), '27 Jun 2026');
    contains('and how long after the close it landed',
        view.note('last'), '42 days after the close');

    equal('the next report is a window and not a date',
        view.figure('next'), '3 Nov 2026 – 8 Nov 2026');
    contains('the note says it was worked out here',
        view.note('next'), 'Projected here, not announced');
    contains('and shows the arithmetic behind it',
        view.note('next'), '38 to 43 days');
    contains('and says the company can move it',
        view.note('next'), 'can move it');

    equal('a row per reported quarter', view.rows().length, 4);
    contains('the newest quarter is first', view.rowText(0), '27 Jun 2026');
    contains('with the earnings it reported', view.rowText(0), '2.00');
    contains('the change against the same quarter a year earlier',
        view.rowText(0), '+2.56%');
    contains('and the figure that change was measured from',
        view.rowText(0), 'from 1.95');
    contains('a fall carries an explicit minus, not only a colour',
        view.rowText(0), '▲');
    contains('the dividend declared for the quarter',
        view.rowText(0), '0.26');

    /* The one thing this surface can state that no filing said. */
    view.api.show('NEW');
    equal('a company with one report shows no window',
        view.figure('next'), DASH);
    contains('and says why rather than leaving a dash to explain itself',
        view.note('next'), 'One report is not a rhythm');

    view.api.show('XLK');
    equal('a fund reaches its own state rather than an error',
        view.state(), 'fund');
    equal('and shows no table at all', view.bodyHidden(), true);
    contains('saying what a fund is instead',
        view.text('[data-reports-message]'), 'no reporting calendar');

    view.api.show('DEAD');
    equal('a service that is down is not a company state',
        view.state(), 'unavailable');
    contains('and says the prices above are unaffected',
        view.text('[data-reports-message]'), 'prices above are unaffected');

    view.api.reset();
    equal('a cleared lookup goes back to empty', view.state(), 'empty');
    equal('and drops the last symbol it held', view.figure('last'), DASH);

    /* A late answer for a symbol the reader has moved on from. */
    var slow = mount({ AAPL: company, XLK: etf });
    slow.api.show('AAPL');
    slow.api.show('XLK');
    equal('the surface shows the symbol asked for last', slow.state(), 'fund');
    equal('and not the one asked for first', slow.rows().length, 0);

    /* A quarter with no year-ago figure behind it. */
    var lonely = ask({ body: payload({
        last: { end: '2026-06-27', filed: '2026-08-08', form: '10-Q',
            lag_days: 42 },
        next: null,
        quarters: [quarter('2026-06-27', '2026-08-08', 2.00, null, null, null)]
    }) }).value;
    var sparse = mount({ ONE: lonely });
    sparse.api.show('ONE');
    contains('a quarter with nothing to compare against shows an em dash',
        sparse.rowText(0), DASH);
    check('and never a zero, which would say it earned the same',
        sparse.rowText(0).indexOf('0.00%') === -1, sparse.rowText(0));

    return report();
}
