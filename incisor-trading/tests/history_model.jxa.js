/* Exercises the equity curve outside a browser.
 *
 * js/portfolio-history.js is pure arithmetic over a ledger and a set of daily
 * series, so it needs no DOM at all — only the real js/portfolio-ledger.js it
 * replays through and the real js/market-clock.js that tells it when a
 * trading day ended.
 *
 * The scenario below was worked out on paper in cents before this file was
 * written, and every expected figure here is that arithmetic rather than a
 * number read back out of the module. It is written out in full in the
 * session's PROGRESS.md entry, which is where T16's acceptance asks for it.
 *
 * Two properties matter more than any single figure and are checked as such:
 * the curve's last point equals what js/portfolio-ledger.js says the
 * portfolio is worth at the same prices — two routes to one number, and a
 * disagreement means one of them is wrong — and the curve is never drawn with
 * a hole in it. Every refusal returns a reason instead.
 *
 * Run by test_history.py. Arguments: <page-dir>
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

    /* ── Modules under test ─────────────────────────────────────── */

    var box = {};
    try {
        (new Function('window', read(pageDir + '/js/market-clock.js')))(box);
        (new Function('window', read(pageDir + '/js/portfolio-ledger.js')))(box);
        (new Function('window', read(pageDir + '/js/portfolio-history.js')))(box);
        check('the modules parse and run', !!box.IncisorPortfolioHistory
            && !!box.IncisorPortfolioLedger && !!box.IncisorMarketClock);
    } catch (error) {
        check('the modules parse and run', false, String(error));
        return report();
    }
    var history = box.IncisorPortfolioHistory;
    var ledger = box.IncisorPortfolioLedger;
    var clock = box.IncisorMarketClock;

    var START = 10000000;

    /* ── The scenario ───────────────────────────────────────────── */

    /* One ordinary week, Monday 14 to Friday 18 September 2026. No holiday
     * falls in it — Labor Day is the 7th — so all five are full sessions and
     * the closing bell is 16:00 ET, which is 20:00Z while daylight saving is
     * in force. */
    function bars(dates, closes) {
        return dates.map(function (date, at) {
            return { date: date, open: closes[at], high: closes[at],
                low: closes[at], close: closes[at], volume: 1000 };
        });
    }

    var WEEK = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17',
        '2026-09-18'];
    var SPY = bars(WEEK, [500, 510, 505, 520, 515]);
    var AAPL = bars(WEEK, [200, 210, 220, 215, 230]);

    function at(date) { return date + 'T20:00:00.000Z'; }

    /* Bought at Tuesday's close, part-sold at Thursday's. */
    var LEDGER = [
        { kind: 'buy', symbol: 'AAPL', shares: 100, price: 210,
            at: at('2026-09-15') },
        { kind: 'sell', symbol: 'AAPL', shares: 40, price: 215,
            at: at('2026-09-17') }
    ];

    var SERIES = { SPY: SPY, AAPL: AAPL };

    var drawn = history.curve(LEDGER, START, SERIES, clock);

    check('a curve is drawn', !drawn.reason, drawn.reason || '');
    equal('it opens on the session before the first trade', drawn.from, '2026-09-14');
    equal('and closes on the last day every series reaches', drawn.to, '2026-09-18');
    equal('one point per session, the baseline included', drawn.points.length, 5);
    equal('and it names the benchmark it used', drawn.benchmarkSymbol, 'SPY');

    /* The hand-computed figures, in cents.
     *
     *   14th  baseline, nothing bought      cash 10,000,000  value 10,000,000
     *   15th  buy 100 AAPL @ 210 = 2,100,000
     *         cash 7,900,000  AAPL 100 @ 210 = 2,100,000     value 10,000,000
     *   16th  cash 7,900,000  AAPL 100 @ 220 = 2,200,000     value 10,100,000
     *   17th  sell 40 @ 215 = 860,000; cost sold
     *         round(2,100,000 x 40/100) = 840,000; realized +20,000
     *         cash 8,760,000  AAPL  60 @ 215 = 1,290,000     value 10,050,000
     *   18th  cash 8,760,000  AAPL  60 @ 230 = 1,380,000     value 10,140,000
     *
     * The benchmark is the whole balance in SPY from the 14th's close of 500:
     *
     *   14th  10,000,000 x 500/500 = 10,000,000
     *   15th  10,000,000 x 510/500 = 10,200,000
     *   16th  10,000,000 x 505/500 = 10,100,000
     *   17th  10,000,000 x 520/500 = 10,400,000
     *   18th  10,000,000 x 515/500 = 10,300,000
     */
    same('every value is the hand-computed one',
        drawn.points.map(function (point) { return point.value; }),
        [10000000, 10000000, 10100000, 10050000, 10140000]);
    same('and every benchmark figure is',
        drawn.points.map(function (point) { return point.benchmark; }),
        [10000000, 10200000, 10100000, 10400000, 10300000]);
    same('with the dates in order',
        drawn.points.map(function (point) { return point.date; }), WEEK);

    check('both lines open at the starting balance',
        drawn.points[0].value === START && drawn.points[0].benchmark === START);
    check('a purchase at the close moves nothing on the day it fills',
        drawn.points[1].value === START);

    /* Gains are cents and exact. A percentage is the one figure here that
     * leaves cents behind — 140000 / 10000000 x 100 is 1.4000000000000001 in
     * a double — so it is checked the way it is shown, to the hundredth. It
     * is never added to anything; js/market-figures.js formats it and that is
     * the end of it. */
    function percent(value) { return Math.round(value * 100) / 100; }

    equal('the portfolio gained $1,400.00', drawn.value.gain, 140000);
    equal('which is 1.4%', percent(drawn.value.percent), 1.4);
    equal('the benchmark gained $3,000.00', drawn.benchmark.gain, 300000);
    equal('which is 3%', percent(drawn.benchmark.percent), 3);
    equal('so the trading trailed it by $1,600.00', drawn.difference, -160000);

    /* The join with T14. Two routes to one number: replaying the whole ledger
     * and valuing it at Friday's closes has to give what the walk gave on
     * Friday, or one of the two is wrong and the reader is shown both. */
    var replayed = ledger.replay(LEDGER, START);
    var valued = ledger.valuation(replayed.state, { AAPL: 230 });
    equal('the last point is what the ledger says the portfolio is worth',
        drawn.points[4].value, valued.total);
    equal('and the curve\'s gain is the ledger\'s total return',
        drawn.value.gain, valued.totalReturn);
    equal('which is realized plus unrealized', valued.totalReturn,
        valued.realized + valued.unrealized);

    /* ── Refusals ───────────────────────────────────────────────── */

    /* Every one of these returns a reason rather than a shorter line. A curve
     * missing a holding's contribution is not rougher, it is wrong, and
     * nothing on screen would show the reader that it is. */
    equal('an empty ledger draws nothing',
        history.curve([], START, SERIES, clock).reason, 'no-trades');
    equal('a ledger whose symbol has no series draws nothing',
        history.curve(LEDGER, START, { SPY: SPY }, clock).reason, 'missing-prices');
    same('and it names which symbol was missing',
        history.curve(LEDGER, START, { SPY: SPY }, clock).missing, ['AAPL']);
    equal('without the benchmark it draws nothing',
        history.curve(LEDGER, START, { AAPL: AAPL }, clock).reason, 'no-benchmark');
    equal('an empty series is not a series',
        history.curve(LEDGER, START, { SPY: [], AAPL: AAPL }, clock).reason,
        'no-benchmark');

    var many = [];
    for (var index = 0; index < history.SYMBOL_LIMIT + 1; index++) {
        many.push({ kind: 'buy', symbol: 'AA' + String.fromCharCode(65 + index),
            shares: 1, price: 1, at: at('2026-09-15') });
    }
    var refused = history.curve(many, START, SERIES, clock);
    equal('past the symbol limit it draws nothing', refused.reason, 'too-many-symbols');
    equal('and says how many were asked for', refused.symbols, history.SYMBOL_LIMIT + 1);
    equal('and what the limit is', refused.limit, history.SYMBOL_LIMIT);

    /* A single session is a dot, not a line, and a reader cannot read a
     * comparison out of one point. */
    var oneDay = history.curve(
        [{ kind: 'buy', symbol: 'AAPL', shares: 1, price: 500,
            at: at('2026-09-18') }],
        START, { SPY: bars(['2026-09-18'], [515]), AAPL: bars(['2026-09-18'], [230]) },
        clock);
    equal('a single session is too short to draw', oneDay.reason, 'too-short');

    /* ── The shared end date ────────────────────────────────────── */

    /* One holding priced to Friday and another to Wednesday is not a
     * portfolio value, so the curve stops where every series reaches. */
    var short = history.curve(LEDGER, START,
        { SPY: SPY, AAPL: bars(WEEK.slice(0, 3), [200, 210, 220]) }, clock);
    equal('the curve stops at the newest date every series shares',
        short.to, '2026-09-16');
    equal('and its last value is that day\'s', short.points[2].value, 10100000);

    /* ── Carrying a close forward ───────────────────────────────── */

    /* A symbol missing a session the benchmark traded is worth its last
     * close, not nothing. Wednesday is dropped from AAPL's series here and
     * Wednesday's value falls back to Tuesday's 210 rather than vanishing. */
    var gapped = history.curve(LEDGER, START,
        { SPY: SPY, AAPL: bars(['2026-09-14', '2026-09-15', '2026-09-17',
            '2026-09-18'], [200, 210, 215, 230]) }, clock);
    equal('a session a holding did not trade keeps its last close',
        gapped.points[2].value, 10000000);
    equal('and the days around it are unchanged', gapped.points[4].value, 10140000);

    /* ── Order and shape ────────────────────────────────────────── */

    var shuffled = history.curve([LEDGER[1], LEDGER[0]], START, SERIES, clock);
    same('a ledger handed over out of order gives the same curve',
        shuffled.points, drawn.points);

    same('the symbols are named for the caller to fetch',
        history.symbolsIn(LEDGER), ['AAPL']);
    same('deduplicated and sorted', history.symbolsIn([
        { symbol: 'QQQ' }, { symbol: 'AAPL' }, { symbol: 'QQQ' }
    ]), ['AAPL', 'QQQ']);
    same('and an empty ledger names none', history.symbolsIn([]), []);

    /* ── A weekend and a holiday ────────────────────────────────── */

    /* The walk asks the clock for each date and skips what was not a session,
     * so a series carrying a Saturday bar does not put a point on a Saturday.
     * Thanksgiving 2026 is the 26th of November, and the 27th is a half day
     * whose bell is 13:00 ET — a session, so it keeps its point. */
    var autumn = ['2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28',
        '2026-11-30'];
    var holiday = history.curve(
        [{ kind: 'buy', symbol: 'AAPL', shares: 10, price: 200,
            at: '2026-11-25T21:00:00.000Z' }],
        START,
        { SPY: bars(autumn, [500, 500, 500, 500, 500]),
            AAPL: bars(autumn, [200, 200, 200, 200, 200]) }, clock);
    same('Thanksgiving and the Saturday get no point',
        holiday.points.map(function (point) { return point.date; }),
        ['2026-11-25', '2026-11-27', '2026-11-30']);

    return report();
}
