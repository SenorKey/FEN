/* App shell for /incisor-trading.
 *
 * Two things: the tab controller for the three page modes (Dashboard / Trade
 * / Learn), and the view that drives the market clock.
 *
 * Every surface that renders a figure from the market service lives in its
 * own js/view-*.js instead — the strip, the quote panel, and the portfolio
 * views to come. What is left here is the page's furniture: the tabs, and a
 * clock that would say the same thing with no data at all. That is the seam
 * css/market.css is already split along.
 *
 * None of the logic is here either. js/market-clock.js decides what the
 * market is doing; this file only decides what to put on screen and when,
 * which is what lets the clock be tested against fixed datetimes with no DOM.
 *
 * Contract with the markup: a .inc-tablist containing [role=tab] buttons,
 * each with aria-controls pointing at a [role=tabpanel]. Exactly one tab
 * carries aria-selected="true" and tabindex="0" in the served HTML; the
 * rest are tabindex="-1" and their panels carry the `hidden` attribute.
 * That means the page is already in a correct, readable state before this
 * script runs, and stays in one if it never runs at all.
 *
 * Keyboard model is the standard ARIA tabs pattern: arrows move and
 * activate, Home/End jump to the ends, Tab leaves the strip for the panel.
 *
 * Deep-linking a tab from the URL is deliberately left out. It is a real
 * feature, but it belongs with the rest of mode routing rather than bolted
 * onto a skeleton.
 */

(function () {
    'use strict';

    /* ── Market clock ───────────────────────────────────────────── */

    /* Reticks every second. That is only visibly busy in the last hour before
     * an event, because formatCountdown drops to whole minutes above that —
     * and the DOM is only written when the string actually changed, so the
     * common case is a comparison and nothing else. */
    var CLOCK_TICK_MS = 1000;

    function startMarketClock() {
        var clock = document.querySelector('[data-clock]');
        var api = window.IncisorMarketClock;

        // No clock on the page, or the module failed to load. Either way the
        // served markup already says something true about market hours, so
        // leaving it alone is the correct degradation.
        if (!clock || !api) return;

        var stateNode = clock.querySelector('[data-clock-state]');
        var detailNode = clock.querySelector('[data-clock-detail]');
        var reasonNode = clock.querySelector('[data-clock-reason]');
        if (!stateNode || !detailNode || !reasonNode) return;

        /* The answer first, then how long, then why if there is a why.
         *
         *     Closes 4:00pm ET · in 2h 14m
         *     Opens Monday 9:30am ET
         *     Opens tomorrow 9:30am ET · Thanksgiving Day
         *
         * This used to read only "Opens in 2d 10h", which answers the less
         * useful half of the question and made the reader sum two days and
         * ten hours against a timezone nothing on the page named — the served
         * line that did name it is the line this overwrites. Saying when also
         * lets a weekend explain itself, which is why only a holiday still
         * states a reason.
         *
         * The countdown is kept only while the event is today. It earns its
         * width by being live and close; "in 2d 3h" beside "Monday 9:30am ET"
         * is the same fact told worse, and at 375px it was the part pushing
         * the line onto a second and third row.
         */
        function detailFor(session) {
            var verb = session.next.event === 'close' ? 'Closes ' : 'Opens ';
            var detail = verb + session.next.when;
            if (!session.next.sameDay) return detail;
            return detail + ' \u00b7 in ' + api.formatCountdown(session.next.seconds);
        }

        /* Empty on an ordinary day, which is most of them. 1:00pm reads as a
         * mistake unless it is named, and a learner is exactly the reader who
         * would not know half days exist. */
        function reasonFor(session) {
            if (session.holiday) return session.holiday;
            return session.isEarlyClose ? 'early close' : '';
        }

        function render() {
            var session = api.sessionAt(new Date());
            if (!session.next) return;

            var detail = detailFor(session);
            var reason = reasonFor(session);

            // Text only, never markup — and compared before writing, so a
            // once-a-second tick is not a once-a-second reflow.
            if (stateNode.textContent !== session.label) {
                stateNode.textContent = session.label;
            }
            if (detailNode.textContent !== detail) {
                detailNode.textContent = detail;
            }
            if (reasonNode.textContent !== reason) {
                reasonNode.textContent = reason;
                // Hidden rather than empty, so the flex gap goes with it.
                reasonNode.hidden = reason === '';
            }
            if (clock.getAttribute('data-phase') !== session.phase) {
                clock.setAttribute('data-phase', session.phase);
            }
        }

        render();
        window.setInterval(render, CLOCK_TICK_MS);
    }

    startMarketClock();

    /* ── Tabs ───────────────────────────────────────────────────── */

    var tablist = document.querySelector('.inc-tablist');
    if (!tablist) return;

    var tabs = Array.prototype.slice.call(tablist.querySelectorAll('[role="tab"]'));
    if (tabs.length === 0) return;

    function panelFor(tab) {
        var id = tab.getAttribute('aria-controls');
        return id ? document.getElementById(id) : null;
    }

    /* Selects one tab and deselects the rest, moving the roving tabindex with
     * it. `focusTab` is false for a plain click, so the click doesn't fight the
     * browser's own focus handling. */
    function select(tab, focusTab) {
        tabs.forEach(function (candidate) {
            var isTarget = candidate === tab;
            var panel = panelFor(candidate);

            candidate.setAttribute('aria-selected', isTarget ? 'true' : 'false');
            candidate.setAttribute('tabindex', isTarget ? '0' : '-1');
            if (panel) panel.hidden = !isTarget;
        });

        if (focusTab) tab.focus();
    }

    tablist.addEventListener('click', function (event) {
        var tab = event.target.closest('[role="tab"]');
        if (tab) select(tab, false);
    });

    tablist.addEventListener('keydown', function (event) {
        var current = tabs.indexOf(event.target);
        if (current === -1) return;

        var next;
        switch (event.key) {
            case 'ArrowLeft':
                next = (current - 1 + tabs.length) % tabs.length;
                break;
            case 'ArrowRight':
                next = (current + 1) % tabs.length;
                break;
            case 'Home':
                next = 0;
                break;
            case 'End':
                next = tabs.length - 1;
                break;
            default:
                return;
        }

        // Only now, once a key we handle is confirmed, so Tab and the rest
        // keep their native behaviour.
        event.preventDefault();
        select(tabs[next], true);
    });
})();
