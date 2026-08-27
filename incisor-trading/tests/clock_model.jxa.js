/* Exercises the real market clock outside a browser.
 *
 * js/market-clock.js is pure — a Date in, a session out — so it needs no DOM
 * at all, only a JavaScript engine with Intl timezone support. JavaScriptCore
 * ships with macOS via osascript and has one, which is what lets a scheduled
 * session verify a client-side module it can never open in a browser.
 *
 * The cases below are the T5 acceptance criteria: a hardcoded set of instants
 * covering every phase boundary, both sides of daylight saving, a weekend, a
 * full holiday and an early-close half day.
 *
 * Run by test_market_clock.py. Arguments: <page-dir>
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

    var windowStub = {};
    try {
        (new Function('window', read(pageDir + '/js/market-clock.js')))(windowStub);
        check('market-clock.js parses and runs', true);
    } catch (error) {
        check('market-clock.js parses and runs', false, String(error));
        return JSON.stringify({ failed: failed, total: results.length, results: results });
    }

    var clock = windowStub.IncisorMarketClock;

    function at(iso) {
        return clock.sessionAt(new Date(iso));
    }

    /* ── Phase boundaries ────────────────────────────────────────
     * Thursday 27 August 2026, a plain trading day in EDT (UTC-4).
     * Eastern wall time is the UTC time minus four hours. */

    var boundaries = [
        ['03:59', '07:59:00Z', 'closed'],
        ['04:00 pre-market opens', '08:00:00Z', 'pre'],
        ['09:29', '13:29:00Z', 'pre'],
        ['09:30 regular open', '13:30:00Z', 'open'],
        ['15:59', '19:59:00Z', 'open'],
        ['16:00 regular close', '20:00:00Z', 'post'],
        ['19:59', '23:59:00Z', 'post'],
        ['20:00 after hours ends', '2026-08-28T00:00:00Z', 'closed']
    ];

    boundaries.forEach(function (row) {
        var iso = row[1].indexOf('T') === -1 ? '2026-08-27T' + row[1] : row[1];
        equal('phase at ' + row[0], at(iso).phase, row[2]);
    });

    /* ── Countdown targets ─────────────────────────────────────── */

    equal('an open market counts down to the close',
        at('2026-08-27T14:30:00Z').next.event, 'close');
    equal('the close it counts down to is 4pm Eastern',
        at('2026-08-27T14:30:00Z').next.at.toISOString(), '2026-08-27T20:00:00.000Z');
    equal('pre-market counts down to today’s open',
        at('2026-08-27T12:00:00Z').next.at.toISOString(), '2026-08-27T13:30:00.000Z');
    equal('after hours counts down to the next day’s open',
        at('2026-08-27T21:00:00Z').next.at.toISOString(), '2026-08-28T13:30:00.000Z');

    /* ── Weekends ────────────────────────────────────────────────
     * Saturday 29 and Sunday 30 August 2026. */

    equal('Saturday is closed', at('2026-08-29T16:00:00Z').phase, 'closed');
    check('Saturday is not a trading day', at('2026-08-29T16:00:00Z').isTradingDay === false);
    check('Saturday is flagged as a weekend, not a holiday',
        at('2026-08-29T16:00:00Z').isWeekend === true
        && at('2026-08-29T16:00:00Z').holiday === null);
    equal('Saturday counts down to Monday’s open',
        at('2026-08-29T16:00:00Z').next.at.toISOString(), '2026-08-31T13:30:00.000Z');
    equal('Sunday counts down to Monday’s open',
        at('2026-08-30T16:00:00Z').next.at.toISOString(), '2026-08-31T13:30:00.000Z');
    equal('Friday after hours skips the weekend',
        at('2026-08-28T21:00:00Z').next.at.toISOString(), '2026-08-31T13:30:00.000Z');

    /* ── A full holiday ──────────────────────────────────────────
     * Thanksgiving, Thursday 26 November 2026. */

    var thanksgiving = at('2026-11-26T15:00:00Z');
    equal('Thanksgiving is closed', thanksgiving.phase, 'closed');
    equal('Thanksgiving is named', thanksgiving.holiday, 'Thanksgiving Day');
    check('a holiday is not a weekend', thanksgiving.isWeekend === false);
    check('a holiday has no pre-market either',
        at('2026-11-26T13:00:00Z').phase === 'closed');

    /* ── An early close ──────────────────────────────────────────
     * Black Friday, 27 November 2026, in EST (UTC-5). 1pm ET = 18:00Z. */

    var halfDay = at('2026-11-27T17:30:00Z');
    equal('the half day is open at 12:30pm', halfDay.phase, 'open');
    check('the half day is flagged as an early close', halfDay.isEarlyClose === true);
    equal('the half day closes at 1pm Eastern',
        halfDay.next.at.toISOString(), '2026-11-27T18:00:00.000Z');
    equal('after 1pm the half day is in after hours',
        at('2026-11-27T18:30:00Z').phase, 'post');
    equal('the half day’s after hours ends at 5pm Eastern',
        at('2026-11-27T22:30:00Z').phase, 'closed');
    check('a normal day is not flagged as an early close',
        at('2026-08-27T14:30:00Z').isEarlyClose === false);

    /* ── Daylight saving ─────────────────────────────────────────
     * The open is 13:30Z in summer and 14:30Z in winter. A fixed offset
     * would get one of these two wrong. */

    equal('the summer open is 13:30 UTC',
        at('2026-07-15T12:00:00Z').next.at.toISOString(), '2026-07-15T13:30:00.000Z');
    equal('the winter open is 14:30 UTC',
        at('2026-01-15T12:00:00Z').next.at.toISOString(), '2026-01-15T14:30:00.000Z');

    /* ── Computed holidays ───────────────────────────────────────
     * Every rule in the calendar, checked against published NYSE closures. */

    var holidays2026 = clock.holidaysOf(2026);
    equal('2026 has ten full closures', Object.keys(holidays2026).length, 10);
    equal('Good Friday is Easter minus two days', holidays2026['4-3'], 'Good Friday');
    equal('MLK Day is the third Monday of January',
        holidays2026['1-19'], 'Martin Luther King, Jr. Day');
    equal('Memorial Day is the last Monday of May', holidays2026['5-25'], 'Memorial Day');
    equal('Labor Day is the first Monday of September',
        holidays2026['9-7'], 'Labor Day');
    equal('a Saturday holiday is observed on the Friday before',
        holidays2026['7-3'], 'Independence Day');

    var holidays2027 = clock.holidaysOf(2027);
    equal('a Sunday holiday is observed on the Monday after',
        holidays2027['7-5'], 'Independence Day');
    equal('Good Friday moves with Easter across years',
        holidays2027['3-26'], 'Good Friday');

    /* The documented exception: the exchange does not close on December 31st
     * when New Year's Day falls on a Saturday. */
    var holidays2028 = clock.holidaysOf(2028);
    check('a Saturday New Year is not observed at all',
        holidays2028['1-1'] === undefined && holidays2028['12-31'] === undefined,
        JSON.stringify(Object.keys(holidays2028)));
    equal('that year has nine closures rather than ten',
        Object.keys(holidays2028).length, 9);

    /* A holiday outranks an early close: when Independence Day is observed on
     * July 3rd, that day is shut, not short. */
    var julyThird = at('2026-07-03T17:30:00Z');
    equal('an observed holiday beats the early-close rule', julyThird.phase, 'closed');
    check('and is reported as the holiday', julyThird.holiday === 'Independence Day'
        && julyThird.isEarlyClose === false);

    equal('Christmas Eve is an early close when it is a weekday',
        clock.earlyClosesOf(2026)['12-24'], true);

    /* ── Countdown formatting ────────────────────────────────────
     * Two units, largest first: any more is noise on a number nobody
     * watches to the end. */

    equal('seconds show under an hour', clock.formatCountdown(125), '2m 05s');
    equal('minutes are padded', clock.formatCountdown(3 * 3600 + 4 * 60), '3h 04m');
    equal('hours show under a day', clock.formatCountdown(3600), '1h 00m');
    equal('days show above a day', clock.formatCountdown(2 * 86400 + 5 * 3600), '2d 5h');
    equal('zero is not an error', clock.formatCountdown(0), '0m 00s');
    equal('a nonsense countdown renders as a dash', clock.formatCountdown(-1), '—');

    /* ── The countdown agrees with the target ────────────────────
     * seconds and `at` are computed separately, so they can disagree. */

    var now = new Date('2026-08-27T14:30:00Z');
    var session = clock.sessionAt(now);
    equal('seconds matches the interval to the target instant',
        session.next.seconds, Math.round((session.next.at - now) / 1000));

    check('sessionAt defaults to now rather than throwing',
        typeof clock.sessionAt().phase === 'string');

    /* ── The view ────────────────────────────────────────────────
     * The logic being right is only half of it — the shell decides what a
     * reader actually sees, and its holiday and early-close wordings are
     * branches the pure module never exercises. sessionAt is stubbed so each
     * case is reachable; formatCountdown stays real, so the strings below are
     * the strings the page renders.
     */

    function renderWith(session) {
        var state = { textContent: 'US market' };
        var detail = { textContent: 'Regular hours' };
        var attributes = {};
        var clockNode = {
            querySelector: function (selector) {
                if (selector === '[data-clock-state]') return state;
                if (selector === '[data-clock-detail]') return detail;
                return null;
            },
            getAttribute: function (name) { return attributes[name] || null; },
            setAttribute: function (name, value) { attributes[name] = value; }
        };
        var documentStub = {
            querySelector: function (selector) {
                return selector === '[data-clock]' ? clockNode : null;
            },
            getElementById: function () { return null; }
        };
        var windowStub = {
            IncisorMarketClock: {
                sessionAt: function () { return session; },
                formatCountdown: clock.formatCountdown
            },
            setInterval: function () { return 0; }
        };

        (new Function('document', 'window', read(pageDir + '/incisor.js')))(
            documentStub, windowStub);

        return { state: state.textContent, detail: detail.textContent,
                 phase: attributes['data-phase'] };
    }

    var openView = renderWith({
        phase: 'open', label: 'Open', holiday: null, isEarlyClose: false,
        next: { event: 'close', seconds: 5400 }
    });
    equal('an open market reads as open', openView.state, 'Open');
    equal('an open market counts down to the close in words',
        openView.detail, 'Closes in 1h 30m');
    equal('the phase reaches the element for styling', openView.phase, 'open');

    var closedView = renderWith({
        phase: 'closed', label: 'Closed', holiday: null, isEarlyClose: false,
        next: { event: 'open', seconds: 61200 }
    });
    equal('a closed market counts down to the open',
        closedView.detail, 'Opens in 17h 00m');

    var holidayView = renderWith({
        phase: 'closed', label: 'Closed', holiday: 'Thanksgiving Day',
        isEarlyClose: false, next: { event: 'open', seconds: 84600 }
    });
    check('a holiday is named rather than left as a bare countdown',
        holidayView.detail.indexOf('Thanksgiving Day') === 0, holidayView.detail);

    var earlyView = renderWith({
        phase: 'open', label: 'Open', holiday: null, isEarlyClose: true,
        next: { event: 'close', seconds: 1800 }
    });
    check('an early close is called out, not just counted down',
        earlyView.detail.indexOf('early close') !== -1, earlyView.detail);

    /* The shell must survive the clock module being absent: the served markup
     * already says something true, and overwriting it with nothing would be
     * worse than leaving it alone. */
    var survived = true;
    try {
        var untouched = { textContent: 'Regular hours 9:30am – 4:00pm ET' };
        (new Function('document', 'window', read(pageDir + '/incisor.js')))(
            {
                querySelector: function (selector) {
                    return selector === '[data-clock]' ? {
                        querySelector: function () { return untouched; },
                        getAttribute: function () { return null; },
                        setAttribute: function () {}
                    } : null;
                },
                getElementById: function () { return null; }
            },
            { setInterval: function () { return 0; } });
        survived = untouched.textContent === 'Regular hours 9:30am – 4:00pm ET';
    } catch (error) {
        survived = false;
        check('the shell survives a missing clock module', false, String(error));
    }
    check('a missing clock module leaves the served text alone', survived);

    return JSON.stringify({ failed: failed, total: results.length, results: results });
}
