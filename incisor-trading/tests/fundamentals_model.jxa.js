/* Exercises the fundamentals panel outside a browser.
 *
 * Three things, and the first is where the risk is. The panel derives three
 * of its ten figures itself — market cap, price/earnings and dividend yield
 * are each a filing over a price — because the price has to be the one on the
 * card above. That arithmetic is pure and is checked against hand-computed
 * numbers, since a ratio worked out the wrong way produces a figure that
 * looks exactly like one worked out the right way.
 *
 * The second is the data client's reader, whose whole job here is that
 * absence is a shape rather than a failure: a fund has no filings, a
 * newly-listed company has no beta, and neither is an error.
 *
 * The third is the view against the DOM stub, driven by a real click on the
 * explain button. What it covers is what the panel promises: a company shows
 * its figures, a fund says it is a fund instead of showing ten em dashes, a
 * second lookup does not leave the first one's numbers standing, and a
 * filings service that is down says the prices above are unaffected.
 *
 * What it cannot cover is whether ten figures read as a panel at 375px, or
 * whether the explanations are legible once opened. tools/shoot.py does that.
 *
 * Promises are the awkward part, as in every runner here: a scheduled JXA run
 * has no event loop, so the stand-in below settles as it is built. Sound,
 * because nothing under test is concurrent — the panel makes one request per
 * lookup and re-reads it from then on.
 *
 * Run by test_fundamentals_panel.py. Arguments: <page-dir>
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

    /* ── The three figures that need a filing and a price ────────── */

    close('market cap is shares times price',
        figures.marketCap(14840000000, 241.5), 3583860000000, 1);
    equal('a market cap with no share count is unknown',
        figures.marketCap(null, 241.5), null);
    equal('a market cap with no price is unknown',
        figures.marketCap(14840000000, null), null);

    close('price to earnings is price over earnings per share',
        figures.priceToEarnings(241.5, 7.12), 33.918, 0.001);
    equal('no earnings figure means no ratio',
        figures.priceToEarnings(241.5, null), null);
    equal('a company that broke exactly even has no ratio, not an infinity',
        figures.priceToEarnings(241.5, 0), null);
    check('a loss produces a ratio that is not shown',
        figures.formatRatio(figures.priceToEarnings(241.5, -3.0)) === DASH,
        'a negative P/E cannot be compared with the positive ones beside it');

    close('dividend yield is a year of dividends over the price',
        figures.dividendYield(1.04, 241.5), 0.004306, 0.000001);
    equal('a company that declared no dividend has no yield',
        figures.dividendYield(null, 241.5), null);

    /* ── Formatting ─────────────────────────────────────────────── */

    equal('revenue is abbreviated with its unit',
        figures.formatBigMoney(402073341693), '$402.1B');
    equal('a smaller company keeps two decimals',
        figures.formatBigMoney(3583860000), '$3.58B');
    equal('a loss keeps its minus sign',
        figures.formatBigMoney(-2400000000), '−$2.40B');
    equal('an unknown figure is an em dash, never a zero',
        figures.formatBigMoney(null), DASH);

    equal('a margin is a percentage without a plus sign',
        figures.formatMarginPercent(0.4649), '46.5%');
    equal('a negative margin keeps its minus, because a loss is real',
        figures.formatMarginPercent(-0.082), '−8.2%');
    equal('an unknown margin is an em dash, never 0.0%',
        figures.formatMarginPercent(null), DASH);
    equal('a ratio is two decimals with no unit',
        figures.formatRatio(1.1564), '1.16');

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

    function filingsBody() {
        return {
            entity_name: 'Apple Inc.', as_of: '2026-06-27',
            filed: '2026-08-08', form: '10-Q', quarters: 4,
            shares_outstanding: 14840000000, revenue: 402073341693,
            net_income: 105780210511, eps: 7.12, dividends_per_share: 1.04,
            gross_margin: 0.465, operating_margin: 0.318, net_margin: 0.263
        };
    }

    function measuresBody(overrides) {
        var body = { beta: 1.1564, volatility: 0.2431, correlation: 0.8712,
            sessions: 252, benchmark: 'SPY' };
        Object.keys(overrides || {}).forEach(function (key) {
            body[key] = overrides[key];
        });
        return body;
    }

    function payload(overrides) {
        var body = {
            symbol: 'AAPL', source: 'fixture', stale: false,
            fetched_at: '2026-08-27T12:00:00Z',
            fundamentals: {
                filings: filingsBody(),
                measures: measuresBody()
            }
        };
        Object.keys(overrides || {}).forEach(function (key) {
            body[key] = overrides[key];
        });
        return body;
    }

    function ask(response, symbol) {
        nextResponse = response;
        return data.fundamentals(symbol || 'AAPL');
    }

    requested = [];
    var good = ask({ body: payload() });
    equal('a good answer resolves', good.state, 'ok');
    equal('the request goes to our own service, by relative path',
        requested[requested.length - 1],
        '/api/incisor/fundamentals?symbol=AAPL');
    equal('the filings come back', good.value.filings.revenue, 402073341693);
    equal('and are renamed the way every other reader renames them',
        good.value.filings.dividendsPerShare, 1.04);
    close('the beta comes back', good.value.measures.beta, 1.1564, 0.0001);
    close('and the volatility beside it', good.value.measures.volatility,
        0.2431, 0.0001);
    close('and the correlation that says how much the beta explains',
        good.value.measures.correlation, 0.8712, 0.0001);
    equal('the source is carried through so the page can label it',
        good.value.source, 'fixture');

    var fund = ask({ body: payload({ fundamentals: {
        filings: null,
        measures: measuresBody({ beta: 1.18 }) } }) });
    equal('a fund with no filings still resolves', fund.state, 'ok');
    equal('and its filings are absent rather than empty',
        fund.value.filings, null);
    close('while its beta is a real figure', fund.value.measures.beta, 1.18, 0.001);

    var noMeasures = ask({ body: payload({ fundamentals: {
        filings: filingsBody(), measures: null } }) });
    equal('a company with nothing measured from price still resolves',
        noMeasures.state, 'ok');
    equal('and its measures are absent', noMeasures.value.measures, null);

    /* One figure of the three missing is not the same as all three. A
     * benchmark that never moved costs the beta and the correlation and
     * leaves this symbol's own volatility untouched, so a reader that threw
     * the object away on a null beta would blank a figure it was sent. */
    var flatMarket = ask({ body: payload({ fundamentals: {
        filings: null,
        measures: measuresBody({ beta: null, correlation: null }) } }) });
    equal('a measure that is missing on its own is still an answer',
        flatMarket.state, 'ok');
    equal('the beta is absent', flatMarket.value.measures.beta, null);
    close('and the volatility beside it survives',
        flatMarket.value.measures.volatility, 0.2431, 0.0001);

    var noWindow = ask({ body: payload({ fundamentals: {
        filings: null,
        measures: { beta: 1.1, volatility: 0.2 } } }) });
    equal('measures with no window are refused, because the page states one '
        + 'window for all three', noWindow.value.measures, null);

    var partial = ask({ body: payload({ fundamentals: {
        filings: { revenue: 100, eps: 'lots' }, measures: null } }) });
    equal('a figure that is not a number becomes unknown, never a string',
        partial.value.filings.eps, null);

    var wrongSymbol = ask({ body: payload({ symbol: 'MSFT' }) });
    equal('an answer about another symbol is refused', wrongSymbol.state, 'fail');

    var noSource = ask({ body: payload({ source: undefined }) });
    equal('a payload with no source field is refused', noSource.state, 'fail');

    var noBody = ask({ body: payload({ fundamentals: undefined }) });
    equal('a payload with no fundamentals at all is refused',
        noBody.state, 'fail');

    equal('an unreachable service is a failure',
        ask({ reject: new Error('boom') }).state, 'fail');
    equal('a non-ok response is a failure',
        ask({ ok: false, status: 503, body: {} }).state, 'fail');

    /* ── The view ───────────────────────────────────────────────── */

    /* The served markup, as index.html ships it. Built here rather than
     * parsed out of the page for the reason the other runners give: this is
     * the contract the view documents, and test_fundamentals_panel.py
     * separately asserts the page still carries it. */
    var GROUPS = {
        valuation: ['market-cap', 'pe', 'dividend-yield'],
        earned: ['revenue', 'eps', 'shares'],
        margin: ['gross', 'operating', 'net'],
        measured: ['beta', 'volatility', 'correlation']
    };

    function buildPanel() {
        var panel = new El('section', { 'data-fundamental': '',
            'data-state': 'empty' });

        var head = new El('div', {});
        head.appendChild(new El('span', { 'data-fundamental-symbol': '' }));
        head.appendChild(new El('button', { 'data-fundamental-explain': '',
            'aria-expanded': 'false' }));
        panel.appendChild(head);

        panel.appendChild(new El('p', { 'data-fundamental-message': '' }));

        var body = new El('div', { 'data-fundamental-body': '' });
        Object.keys(GROUPS).forEach(function (group) {
            var block = new El('div', {});
            block.setAttribute('data-' + group, '');
            var list = new El('dl', {});
            GROUPS[group].forEach(function (name) {
                var row = new El('div', {});
                var slot = new El('span', {});
                slot.setAttribute('data-' + group + '-figure', name);
                row.appendChild(slot);
                list.appendChild(row);
            });
            block.appendChild(list);
            body.appendChild(block);
        });
        body.hidden = true;
        panel.appendChild(body);

        var provenance = new El('p', { 'data-fundamental-provenance': '',
            'data-provenance-state': 'pending' });
        provenance.appendChild(new El('span',
            { 'data-fundamental-provenance-message': '' }));
        panel.appendChild(provenance);
        return panel;
    }

    /* Drives the real view. `answers` maps a symbol to what the service says
     * about it, or {error: true} for a service that is not there. */
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
            read(pageDir + '/js/view-fundamentals.js')))(documentStub, windowStub);

        return {
            panel: panel,
            api: windowStub.IncisorFundamentals,
            calls: function () { return calls; },
            state: function () { return panel.getAttribute('data-state'); },
            figure: function (group, name) {
                var node = panel.querySelector(
                    '[data-' + group + '-figure="' + name + '"]');
                return node ? node.textContent : null;
            },
            text: function (selector) {
                var node = panel.querySelector(selector);
                return node ? node.textContent : null;
            },
            explainButton: function () {
                return panel.querySelector('[data-fundamental-explain]');
            },
            pressExplain: function () {
                this.explainButton().fire('click', {});
                return this.explainButton();
            },
            bodyHidden: function () {
                return panel.querySelector('[data-fundamental-body]').hidden;
            }
        };
    }

    /* The parsed answers the view is handed, which is what data.fundamentals()
     * resolves to rather than the raw envelope. */
    var company = ask({ body: payload() }).value;
    var etf = ask({ body: payload({ fundamentals: {
        filings: null,
        measures: measuresBody({ beta: 1.18 }) } }) }).value;
    var unfiled = ask({ body: payload({ fundamentals: {
        filings: filingsBody(), measures: null } }) }).value;

    var view = mount({ AAPL: company, XLK: etf, MSFT: unfiled,
        DEAD: { error: true } });
    check('the view exposes the API the lookup drives', !!view.api);

    equal('it ships in its empty state', view.state(), 'empty');
    equal('and its figure list ships hidden', view.bodyHidden(), true);
    equal('no explain control is offered before there is anything to explain',
        view.explainButton().getAttribute('aria-expanded'), 'false');

    view.api.show('AAPL', 241.5);
    equal('a company reaches the ready state', view.state(), 'ready');
    equal('and its list is shown', view.bodyHidden(), false);
    equal('one request per lookup', view.calls().length, 1);
    equal('the message is the company name rather than a sentence',
        view.text('[data-fundamental-message]'), 'Apple Inc.');

    equal('revenue is drawn from the filing',
        view.figure('earned', 'revenue'), '$402.1B');
    equal('shares outstanding is abbreviated the way volume is',
        view.figure('earned', 'shares'), '14.8B');
    equal('earnings per share is a price', view.figure('earned', 'eps'), '7.12');

    /* The three margins, which are the reason this group exists: each is
     * the same sale with one more cost taken off, so they have to fall in
     * order and a reader has to be able to see all three at once. */
    equal('the gross margin is drawn', view.figure('margin', 'gross'), '46.5%');
    equal('the operating margin below it',
        view.figure('margin', 'operating'), '31.8%');
    equal('and the net margin', view.figure('margin', 'net'), '26.3%');

    equal('the beta', view.figure('measured', 'beta'), '1.16');
    equal('the volatility beside it, as a percentage because it is one',
        view.figure('measured', 'volatility'), '24.3%');
    equal('and the correlation, set as a ratio like the beta it qualifies',
        view.figure('measured', 'correlation'), '0.87');

    equal('market cap is the shares this panel was sent times the price it '
        + 'was handed', view.figure('valuation', 'market-cap'), '$3.58T');
    equal('price to earnings uses that same price',
        view.figure('valuation', 'pe'), '33.92');
    equal('so does the dividend yield',
        view.figure('valuation', 'dividend-yield'), '0.4%');

    check('the provenance line says the numbers are invented',
        view.text('[data-fundamental-provenance-message]').indexOf('Sample') === 0,
        view.text('[data-fundamental-provenance-message]'));
    check('and says what the figures cover',
        view.text('[data-fundamental-provenance-message]')
            .indexOf('four reported quarters') > -1,
        view.text('[data-fundamental-provenance-message]'));
    check('and what the price measures cover, because a beta with no window '
        + 'and no benchmark is not a figure — one sentence for all three, '
        + 'because one window produced all three',
        view.text('[data-fundamental-provenance-message]')
            .indexOf('Beta, volatility and correlation measured over 252 '
                + 'sessions against SPY') > -1,
        view.text('[data-fundamental-provenance-message]'));

    /* The explanations. */
    equal('the explanations start closed',
        view.panel.getAttribute('data-explained'), null);
    var pressed = view.pressExplain();
    equal('pressing the button opens them',
        pressed.getAttribute('aria-expanded'), 'true');
    check('and the panel says so, for the stylesheet to key on',
        view.panel.getAttribute('data-explained') !== null);
    check('the button now offers the way back',
        view.text('[data-fundamental-explain]').indexOf('Hide') === 0,
        view.text('[data-fundamental-explain]'));
    view.pressExplain();
    equal('pressing again closes them',
        view.panel.getAttribute('data-explained'), null);

    /* A fund. */
    view.pressExplain();
    view.api.show('XLK', 265.0);
    equal('a fund reaches its own state rather than the ready one',
        view.state(), 'fund');
    check('and says it is a fund rather than showing ten em dashes',
        view.text('[data-fundamental-message]').indexOf('fund') > -1,
        view.text('[data-fundamental-message]'));
    equal('its beta is still a real figure',
        view.figure('measured', 'beta'), '1.18');
    check('and it is not alone there — the group a fund keeps is the whole '
        + 'group measured from price, which is what its own sentence '
        + 'promises is below',
        view.figure('measured', 'volatility') !== DASH
        && view.figure('measured', 'correlation') !== DASH,
        view.figure('measured', 'volatility') + '/'
        + view.figure('measured', 'correlation'));
    equal('every filed figure is blank rather than the last company’s',
        view.figure('earned', 'revenue'), DASH);
    equal('including the margins', view.figure('margin', 'gross'), DASH);
    equal('and the ones derived from a price',
        view.figure('valuation', 'market-cap'), DASH);
    check('the explanations stay open across a lookup, because wanting to '
        + 'know what a margin is does not stop at one company',
        view.panel.getAttribute('data-explained') !== null);
    check('and the provenance describes the beta rather than filings the '
        + 'fund does not have',
        view.text('[data-fundamental-provenance-message]')
            .indexOf('reported quarters') === -1
        && view.text('[data-fundamental-provenance-message]')
            .indexOf('against SPY') > -1,
        view.text('[data-fundamental-provenance-message]'));

    /* A company with filings and no beta. */
    view.api.show('MSFT', 500.0);
    equal('a company with no measurable beta is still ready', view.state(), 'ready');
    equal('and its beta is blank rather than the fund’s',
        view.figure('measured', 'beta'), DASH);
    equal('as are the two measured beside it',
        view.figure('measured', 'volatility'), DASH);
    check('and nothing claims a window it does not have',
        view.text('[data-fundamental-provenance-message]')
            .indexOf('sessions against') === -1,
        view.text('[data-fundamental-provenance-message]'));
    check('while its filed figures are drawn',
        view.figure('earned', 'revenue') !== DASH,
        view.figure('earned', 'revenue'));

    /* A filings service that is not there. */
    view.api.show('DEAD', 100.0);
    equal('an unreachable filings service has its own state',
        view.state(), 'unavailable');
    check('and says the prices above are unaffected, because they come from '
        + 'a different service',
        view.text('[data-fundamental-message]').indexOf('unaffected') > -1,
        view.text('[data-fundamental-message]'));
    equal('no figure is left standing from the last symbol',
        view.figure('earned', 'revenue'), DASH);

    /* Back to nothing. */
    view.api.reset();
    equal('a failed lookup empties the panel', view.state(), 'empty');
    equal('and blanks its figures', view.figure('measured', 'beta'), DASH);

    /* A late answer for a symbol the reader has moved on from. */
    var slow = mount({ AAPL: company, XLK: etf });
    slow.api.show('AAPL', 241.5);
    slow.api.show('XLK', 265.0);
    equal('the panel shows the symbol asked for last', slow.state(), 'fund');
    equal('and not the one asked for first',
        slow.figure('earned', 'revenue'), DASH);

    /* Fewer than four quarters. */
    var shortYear = payload();
    shortYear.fundamentals.filings.quarters = 2;
    var brief = mount({ NEW: ask({ body: shortYear }).value });
    brief.api.show('NEW', 20.0);
    check('a company with two quarters of filings is not told it has a year',
        brief.text('[data-fundamental-provenance-message]')
            .indexOf('2 reported quarters') > -1,
        brief.text('[data-fundamental-provenance-message]'));

    return report();
}
