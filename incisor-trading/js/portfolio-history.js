/* What the portfolio was worth on each past day, against doing nothing.
 *
 * Pure, like js/portfolio-ledger.js — no DOM, no storage, no network. The
 * ledger says what the portfolio is worth *now*; this replays it forwards one
 * trading day at a time and says what it was worth on each day it existed,
 * which is the only thing that can be drawn as a line.
 *
 * This is what the ledger was shaped for. Because cash, positions and cost
 * are replayed rather than stored (DEC-082), asking what was held on some
 * past Tuesday costs nothing more than stopping the replay there — no second
 * record to keep in step, and no history to have failed to write down at the
 * time.
 *
 * **The benchmark is the whole starting balance in SPY, held throughout.**
 * Guide section 12 asks for a buy-and-hold comparison rather than a
 * leaderboard, and the question it answers is the useful one: did any of this
 * trading beat having bought the market once and gone to sleep? It is scaled
 * from the ratio of closes rather than bought as whole shares — the reader
 * must buy whole shares and the benchmark need not, which is a real
 * difference and the reason it is stated on screen as "the whole $100,000".
 * Whole shares would leave a few hundred dollars of the benchmark in cash,
 * making it lag by an amount that is an artefact of SPY's share price rather
 * than anything about the market.
 *
 * Money is whole cents throughout, for the reason js/portfolio-ledger.js
 * gives. A value is cash plus every holding marked at that day's close, and
 * the benchmark is rounded the same way, so the two lines are the same kind
 * of number and their difference is exact.
 *
 * Exposes window.IncisorPortfolioHistory.
 */

(function (global) {
    'use strict';

    var ledgerMath = global.IncisorPortfolioLedger;

    /* The market, for the purposes of the comparison. The dashboard's lead
     * tile and guide section 12's named benchmark, and an ETF proxy rather
     * than the index itself for the reason DEC-003 gives. It is already on
     * screen at the top of the page, so a reader can see what it did. */
    var BENCHMARK = 'SPY';

    /* Distinct symbols a ledger may touch before the curve stops being
     * drawable, and the same kind of number as DEC-028's eight and DEC-086's
     * six: the call budget, not taste.
     *
     * The arithmetic. The curve needs one daily series per symbol the ledger
     * has ever touched, not merely those still held — a position bought and
     * sold in March is part of what the line did in March. Of 22 upstream
     * calls a day (DEC-003), the four tile proxies are already spent and SPY
     * is one of them, so the benchmark is free. The Trade tab's own six
     * symbols in play are fetched whether this surface exists or not. That
     * leaves room for six more closed-out symbols before the tab is costing
     * half the day's budget, and twelve is where that lands.
     *
     * Past it the curve is not drawn and says so. A line missing one symbol's
     * contribution is not a rougher line, it is a wrong one, and the reader
     * has no way to see that it is wrong.
     */
    var SYMBOL_LIMIT = 12;

    function isFiniteNumber(value) {
        return typeof value === 'number' && isFinite(value);
    }

    /* Every symbol the ledger touches, sorted, so the caller knows what to
     * fetch before it can ask for a curve. */
    function symbolsIn(ledger) {
        var seen = {};
        (ledger || []).forEach(function (entry) {
            if (entry && typeof entry.symbol === 'string') seen[entry.symbol] = true;
        });
        return Object.keys(seen).sort();
    }

    /* One symbol's closes, oldest first, as `[{date, close}]`.
     *
     * Bars arrive sorted, but a series assembled from two responses need not
     * be, and every walk below is in date order — so this sorts rather than
     * trusting the caller, the way js/portfolio-orders.js does before it
     * looks for a fill.
     */
    function closesFor(bars) {
        if (!Array.isArray(bars)) return null;
        var closes = [];
        for (var index = 0; index < bars.length; index++) {
            var bar = bars[index];
            if (!bar || typeof bar.date !== 'string') return null;
            if (!isFiniteNumber(bar.close) || bar.close <= 0) return null;
            closes.push({ date: bar.date, close: bar.close });
        }
        if (closes.length === 0) return null;
        closes.sort(function (left, right) {
            return left.date < right.date ? -1 : (left.date > right.date ? 1 : 0);
        });
        return closes;
    }

    /* A cursor over one symbol's closes, walked forwards only.
     *
     * `at(date)` is the last close on or before `date`, or null if the series
     * does not reach back that far. Every caller walks dates in order, so the
     * cursor never rewinds and valuing N days across M symbols stays N + M
     * steps rather than N x M.
     *
     * The last close *on or before* rather than the close on the day: a
     * symbol can be missing a session the benchmark traded — a halt, or a
     * gap in what the provider sent — and carrying the previous close forward
     * is what a holding is actually worth on a day it did not trade.
     */
    function cursor(closes) {
        var index = -1;
        return {
            at: function (date) {
                while (index + 1 < closes.length && closes[index + 1].date <= date) {
                    index += 1;
                }
                return index < 0 ? null : closes[index].close;
            }
        };
    }

    /* ── The curve ──────────────────────────────────────────────── */

    /* What the portfolio and the benchmark were worth on each trading day.
     *
     * Returns `{points, from, to, ...}` where every point is
     * `{date, value, benchmark}` in cents, or `{reason}` naming why no
     * honest line can be drawn — never a line with a hole in it.
     *
     * `barsBySymbol` must hold a series for the benchmark and for every
     * symbol symbolsIn() names. `clock` is js/market-clock.js: a trade's `at`
     * is the market moment it filled (DEC-085), so it belongs to a trading
     * day exactly when it falls at or before that day's closing bell.
     */
    function curve(ledger, startingCash, barsBySymbol, clock) {
        if (!Array.isArray(ledger) || ledger.length === 0) {
            return { reason: 'no-trades' };
        }
        if (!ledgerMath || !clock) return { reason: 'unavailable' };

        var symbols = symbolsIn(ledger);
        if (symbols.length > SYMBOL_LIMIT) {
            return { reason: 'too-many-symbols', symbols: symbols.length,
                limit: SYMBOL_LIMIT };
        }

        var held = barsBySymbol || {};
        var benchmarkCloses = closesFor(held[BENCHMARK]);
        if (!benchmarkCloses) return { reason: 'no-benchmark' };

        var closes = {};
        var missing = [];
        symbols.forEach(function (symbol) {
            var series = closesFor(held[symbol]);
            if (!series) missing.push(symbol);
            else closes[symbol] = series;
        });
        if (missing.length > 0) return { reason: 'missing-prices', missing: missing };

        // The last day every series reaches. A portfolio valued at today's
        // close for one holding and last Tuesday's for another is not a
        // portfolio value, which is DEC-029's newest shared date one surface
        // over.
        var last = benchmarkCloses[benchmarkCloses.length - 1].date;
        symbols.forEach(function (symbol) {
            var series = closes[symbol];
            var end = series[series.length - 1].date;
            if (end < last) last = end;
        });

        var sorted = ledger.slice().sort(function (left, right) {
            return Date.parse(left.at) - Date.parse(right.at);
        });
        var firstAt = Date.parse(sorted[0].at);

        // The baseline: the last session that closed before the first trade,
        // where both lines are the starting balance and neither has done
        // anything yet. Without it the curve opens at whatever the first
        // day's trading produced and the reader has nothing to read it
        // against. A first trade older than the series we hold has no such
        // session, and then the curve opens on the first day it can.
        var days = [];
        var baseline = null;
        for (var scan = 0; scan < benchmarkCloses.length; scan++) {
            var date = benchmarkCloses[scan].date;
            if (date > last) break;
            var session = clock.sessionOn(date);
            if (!session) continue;
            if (session.close.getTime() < firstAt) baseline = date;
            else days.push({ date: date, close: session.close.getTime() });
        }
        if (days.length === 0) return { reason: 'no-sessions' };
        if (baseline !== null) days.unshift({ date: baseline, close: firstAt - 1 });

        var benchmarkCursor = cursor(benchmarkCloses);
        var base = benchmarkCursor.at(days[0].date);
        if (!isFiniteNumber(base) || base <= 0) return { reason: 'no-benchmark' };

        var cursors = {};
        symbols.forEach(function (symbol) { cursors[symbol] = cursor(closes[symbol]); });

        var state = ledgerMath.emptyState(startingCash);
        var next = 0;
        var points = [];

        for (var day = 0; day < days.length; day++) {
            while (next < sorted.length
                    && Date.parse(sorted[next].at) <= days[day].close) {
                var applied = ledgerMath.apply(state, sorted[next]);
                // The ledger has already been replayed once to produce the
                // state on screen, so a refusal here is not a bad trade — it
                // is this walk having applied one in the wrong order.
                if (applied.error) return { reason: 'unreplayable' };
                state = applied.state;
                next += 1;
            }

            var value = state.cash;
            var priced = true;
            var symbolNames = Object.keys(state.positions);
            for (var each = 0; each < symbolNames.length; each++) {
                var close = cursors[symbolNames[each]].at(days[day].date);
                if (!isFiniteNumber(close)) { priced = false; break; }
                value += ledgerMath.amountFor(state.positions[symbolNames[each]].shares,
                    close);
            }
            if (!priced) continue;

            points.push({
                date: days[day].date,
                value: value,
                benchmark: Math.round(startingCash * benchmarkCursor.at(days[day].date)
                    / base)
            });
        }

        if (points.length < 2) return { reason: 'too-short' };

        var opening = points[0];
        var closing = points[points.length - 1];
        return {
            points: points,
            from: opening.date,
            to: closing.date,
            benchmarkSymbol: BENCHMARK,
            startingCash: startingCash,
            value: change(opening.value, closing.value),
            benchmark: change(opening.benchmark, closing.benchmark),
            // What the whole surface exists to say, in one number: the gap
            // between trading and not trading, over the same days.
            difference: (closing.value - opening.value)
                - (closing.benchmark - opening.benchmark)
        };
    }

    function change(from, to) {
        return {
            from: from,
            to: to,
            gain: to - from,
            percent: from === 0 ? null : ((to - from) / from) * 100
        };
    }

    global.IncisorPortfolioHistory = {
        BENCHMARK: BENCHMARK,
        SYMBOL_LIMIT: SYMBOL_LIMIT,
        symbolsIn: symbolsIn,
        curve: curve
    };
})(typeof window !== 'undefined' ? window : this);
