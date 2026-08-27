/* App shell for /incisor-trading.
 *
 * Right now this is only the tab controller for the three page modes
 * (Dashboard / Trade / Learn). Data fetching, the portfolio and the market
 * clock arrive in later tasks and get their own modules under js/ once this
 * file outgrows one screen.
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
