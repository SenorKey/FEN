/* The US equity market clock.
 *
 * Answers one question — what is the market doing right now, and when does
 * that change — with no network call and no data. It is pure: hand it a Date,
 * get a session back. Everything it needs is arithmetic over the calendar.
 *
 * Exposes window.IncisorMarketClock. No build step, so this is a plain script
 * with a namespace object rather than a module.
 *
 * Sessions, all in US Eastern:
 *
 *     04:00–09:30  pre-market
 *     09:30–16:00  regular      (13:00 on an early-close day)
 *     16:00–20:00  after hours  (17:00 on an early-close day)
 *
 * Holidays are computed, not listed. A hardcoded table would be correct until
 * the year it wasn't, and it would go stale silently — the page would just
 * quietly claim the market was open on Thanksgiving. Every NYSE holiday has a
 * rule: a fixed date, an nth weekday, or Good Friday, which is Easter minus two
 * days and the reason there is an Easter algorithm in a trading page.
 *
 * Eastern time is resolved with Intl.DateTimeFormat rather than a fixed -5 or
 * -4 offset, so daylight saving is the platform's problem and not ours.
 */

(function (global) {
    'use strict';

    var MINUTE = 60 * 1000;
    var ZONE = 'America/New_York';

    /* Minutes from Eastern midnight. Kept as numbers so comparisons are
     * ordinary arithmetic rather than string or Date juggling. */
    var PRE_OPEN = 4 * 60;
    var REGULAR_OPEN = 9 * 60 + 30;
    var REGULAR_CLOSE = 16 * 60;
    var POST_CLOSE = 20 * 60;
    var EARLY_CLOSE = 13 * 60;
    var EARLY_POST_CLOSE = 17 * 60;

    var PHASES = {
        closed: 'Closed',
        pre: 'Pre-market',
        open: 'Open',
        post: 'After hours'
    };

    var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: ZONE,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });

    /* ── Eastern wall clock ─────────────────────────────────────── */

    function easternParts(date) {
        var found = {};
        parts.formatToParts(date).forEach(function (part) {
            if (part.type !== 'literal') found[part.type] = Number(part.value);
        });
        return {
            year: found.year,
            month: found.month,
            day: found.day,
            // Some implementations render midnight as hour 24.
            minutes: (found.hour % 24) * 60 + found.minute
        };
    }

    /* How far Eastern is from UTC at a given instant, in milliseconds. */
    function easternOffset(date) {
        var wall = easternParts(date);
        var asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, 0, wall.minutes);
        return asUtc - date.getTime();
    }

    /* The instant at which Eastern reads the given wall-clock time.
     *
     * Two passes: the offset depends on the instant, and the instant is what
     * we are solving for. Market hours never sit near the 2am transition, so
     * one correction is always enough — but doing it is cheaper than reasoning
     * about whether it is.
     */
    function instantAt(year, month, day, minutes) {
        var guess = Date.UTC(year, month - 1, day, 0, minutes);
        var instant = guess - easternOffset(new Date(guess));
        return new Date(guess - easternOffset(new Date(instant)));
    }

    /* ── Calendar helpers ───────────────────────────────────────── */

    /* Weekday of an Eastern calendar date, 0 = Sunday. Built from a UTC date
     * so it is a pure calendar question with no zone involved. */
    function weekdayOf(year, month, day) {
        return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    }

    function nthWeekdayOf(year, month, weekday, nth) {
        var first = weekdayOf(year, month, 1);
        return 1 + ((weekday - first + 7) % 7) + (nth - 1) * 7;
    }

    function lastWeekdayOf(year, month, weekday) {
        var days = new Date(Date.UTC(year, month, 0)).getUTCDate();
        return days - ((weekdayOf(year, month, days) - weekday + 7) % 7);
    }

    /* Anonymous Gregorian computus. Returns [month, day] of Easter Sunday. */
    function easterOf(year) {
        var a = year % 19;
        var b = Math.floor(year / 100);
        var c = year % 100;
        var d = Math.floor(b / 4);
        var e = b % 4;
        var f = Math.floor((b + 8) / 25);
        var g = Math.floor((b - f + 1) / 3);
        var h = (19 * a + b - d - g + 15) % 30;
        var i = Math.floor(c / 4);
        var k = c % 4;
        var l = (32 + 2 * e + 2 * i - h - k) % 7;
        var m = Math.floor((a + 11 * h + 22 * l) / 451);
        var month = Math.floor((h + l - 7 * m + 114) / 31);
        return [month, ((h + l - 7 * m + 114) % 31) + 1];
    }

    /* A fixed-date holiday moves off the weekend: Saturday is observed on the
     * Friday before, Sunday on the Monday after. This is the exchange's rule,
     * not a general one — and it is the reason no fixed holiday here can land
     * outside its own month, since only January 1st could move backwards and
     * that case never does (see below). */
    function observed(year, month, day) {
        var weekday = weekdayOf(year, month, day);
        if (weekday === 6) return [month, day - 1];
        if (weekday === 0) return [month, day + 1];
        return [month, day];
    }

    function key(month, day) {
        return month + '-' + day;
    }

    /* Every NYSE full-day closure in a year, as a map from month-day to name. */
    function holidaysOf(year) {
        var easter = easterOf(year);
        var goodFriday = new Date(Date.UTC(year, easter[0] - 1, easter[1] - 2));
        var found = {};

        function add(month, day, name) {
            found[key(month, day)] = name;
        }

        function addObserved(month, day, name) {
            var moved = observed(year, month, day);
            add(moved[0], moved[1], name);
        }

        /* The documented exception to the observance rule: when January 1st
         * falls on a Saturday the exchange does not close on the Friday
         * before, so that year simply has no New Year's closure. Written out
         * rather than left to observed(), which would otherwise compute a
         * January 0th — a key that matches nothing and would give the right
         * answer for the wrong reason. */
        if (weekdayOf(year, 1, 1) !== 6) addObserved(1, 1, 'New Year’s Day');
        add(1, nthWeekdayOf(year, 1, 1, 3), 'Martin Luther King, Jr. Day');
        add(2, nthWeekdayOf(year, 2, 1, 3), 'Washington’s Birthday');
        add(goodFriday.getUTCMonth() + 1, goodFriday.getUTCDate(), 'Good Friday');
        add(5, lastWeekdayOf(year, 5, 1), 'Memorial Day');
        addObserved(6, 19, 'Juneteenth National Independence Day');
        addObserved(7, 4, 'Independence Day');
        add(9, nthWeekdayOf(year, 9, 1, 1), 'Labor Day');
        add(11, nthWeekdayOf(year, 11, 4, 4), 'Thanksgiving Day');
        addObserved(12, 25, 'Christmas Day');
        return found;
    }

    /* Days the market opens and closes at 13:00. Each is the session before a
     * holiday, so each has to be checked against that year's actual calendar
     * rather than assumed — there is no early close when the day before the
     * holiday is itself a weekend. */
    function earlyClosesOf(year) {
        var found = {};
        var thanksgiving = nthWeekdayOf(year, 11, 4, 4);
        found[key(11, thanksgiving + 1)] = true;

        [[7, 3], [12, 24]].forEach(function (pair) {
            var weekday = weekdayOf(year, pair[0], pair[1]);
            if (weekday !== 0 && weekday !== 6) found[key(pair[0], pair[1])] = true;
        });
        return found;
    }

    /* ── Sessions ───────────────────────────────────────────────── */

    function dayInfo(year, month, day) {
        var weekday = weekdayOf(year, month, day);
        var holidays = holidaysOf(year);
        var name = holidays[key(month, day)] || null;
        var isWeekend = weekday === 0 || weekday === 6;
        var earlyClose = !isWeekend && !name
            && earlyClosesOf(year)[key(month, day)] === true;
        return {
            isTradingDay: !isWeekend && !name,
            isWeekend: isWeekend,
            holiday: name,
            isEarlyClose: earlyClose,
            close: earlyClose ? EARLY_CLOSE : REGULAR_CLOSE,
            postClose: earlyClose ? EARLY_POST_CLOSE : POST_CLOSE
        };
    }

    function addDays(year, month, day, count) {
        var moved = new Date(Date.UTC(year, month - 1, day + count));
        return {
            year: moved.getUTCFullYear(),
            month: moved.getUTCMonth() + 1,
            day: moved.getUTCDate()
        };
    }

    /* The next date on which the regular session opens, starting from `from`
     * and looking at most a fortnight ahead. The market never closes for two
     * weeks straight, so running out is a bug rather than a real calendar. */
    function nextTradingDay(from, includeToday) {
        var date = includeToday ? from : addDays(from.year, from.month, from.day, 1);
        for (var step = 0; step < 14; step += 1) {
            if (dayInfo(date.year, date.month, date.day).isTradingDay) return date;
            date = addDays(date.year, date.month, date.day, 1);
        }
        return null;
    }

    function phaseOf(minutes, day) {
        if (!day.isTradingDay) return 'closed';
        if (minutes < PRE_OPEN) return 'closed';
        if (minutes < REGULAR_OPEN) return 'pre';
        if (minutes < day.close) return 'open';
        if (minutes < day.postClose) return 'post';
        return 'closed';
    }

    /* What happens next, and when.
     *
     * While the regular session is running the interesting event is the close;
     * at every other moment it is the next open. Pre-market counts down to
     * today's open; after hours and the small hours count down to the next
     * trading day's.
     */
    function nextEvent(now, wall, day) {
        if (phaseOf(wall.minutes, day) === 'open') {
            return {
                event: 'close',
                at: instantAt(wall.year, wall.month, wall.day, day.close)
            };
        }

        var openToday = day.isTradingDay && wall.minutes < REGULAR_OPEN;
        var date = openToday ? wall : nextTradingDay(wall, false);
        if (!date) return null;

        return {
            event: 'open',
            at: instantAt(date.year, date.month, date.day, REGULAR_OPEN)
        };
    }

    /* The whole public surface: what the market is doing at `now`. */
    function sessionAt(now) {
        var when = now || new Date();
        var wall = easternParts(when);
        var day = dayInfo(wall.year, wall.month, wall.day);
        var phase = phaseOf(wall.minutes, day);
        var next = nextEvent(when, wall, day);

        return {
            phase: phase,
            label: PHASES[phase],
            isTradingDay: day.isTradingDay,
            isWeekend: day.isWeekend,
            holiday: day.holiday,
            isEarlyClose: day.isEarlyClose,
            next: next && {
                event: next.event,
                at: next.at,
                seconds: Math.max(0, Math.round((next.at - when) / 1000))
            }
        };
    }

    /* "2h 14m", "14m 03s", "3d 5h" — the longest unit and the one below it.
     * More than two units is noise on a countdown nobody watches to the end.
     */
    function formatCountdown(seconds) {
        if (!isFinite(seconds) || seconds < 0) return '—';

        var days = Math.floor(seconds / 86400);
        var hours = Math.floor((seconds % 86400) / 3600);
        var minutes = Math.floor((seconds % 3600) / 60);
        var rest = seconds % 60;

        if (days > 0) return days + 'd ' + hours + 'h';
        if (hours > 0) return hours + 'h ' + pad(minutes) + 'm';
        return minutes + 'm ' + pad(rest) + 's';
    }

    function pad(value) {
        return (value < 10 ? '0' : '') + value;
    }

    global.IncisorMarketClock = {
        sessionAt: sessionAt,
        formatCountdown: formatCountdown,
        // Exposed for the tests, and because a holiday list is a genuinely
        // useful thing to be able to ask this module for.
        holidaysOf: holidaysOf,
        earlyClosesOf: earlyClosesOf,
        MINUTE: MINUTE
    };
})(typeof window !== 'undefined' ? window : this);
