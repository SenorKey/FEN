/* First-party interaction beacon for the FEN Status Station.
 *
 * Sends three event types to /api/event (Apache-proxied to the status
 * station on 127.0.0.1:8788 — see status-station/server/apache-snippet.conf):
 *
 *   pageview — once per load, target = document title
 *   nav      — clicks on buttons/links inside the site nav/header
 *   click    — clicks on any other button or link
 *
 * Payload is {type, page, target} only. No cookies, no IDs, no raw UA —
 * the server derives a coarse device summary and stores nothing else.
 * Every send is fire-and-forget; telemetry must never break the page.
 */

(function () {
    'use strict';

    var ENDPOINT = '/api/event';
    var MAX_PER_LOAD = 60; // runaway-loop guard; a human won't hit this
    var sent = 0;

    function post(type, target) {
        if (sent >= MAX_PER_LOAD) return;
        sent++;
        var payload = JSON.stringify({
            type: type,
            page: location.pathname.slice(0, 120),
            target: (target || '').slice(0, 160)
        });
        try {
            if (navigator.sendBeacon &&
                navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'application/json' }))) {
                return;
            }
        } catch (e) { /* fall through to fetch */ }
        try {
            fetch(ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload,
                keepalive: true
            }).catch(function () { /* swallow */ });
        } catch (e) { /* swallow — never surface telemetry errors */ }
    }

    function label(elem) {
        var text = elem.getAttribute('data-track') ||
            elem.getAttribute('aria-label') ||
            elem.id ||
            (elem.textContent || '').trim().replace(/\s+/g, ' ');
        return (text || '<' + elem.tagName.toLowerCase() + '>').slice(0, 80);
    }

    document.addEventListener('click', function (e) {
        var elem = e.target && e.target.closest
            ? e.target.closest('button, a, [data-track]')
            : null;
        if (!elem) return;
        var isNav = !!elem.closest('nav, .site-nav, .site-header');
        post(isNav ? 'nav' : 'click', label(elem));
    }, { capture: true, passive: true });

    post('pageview', document.title);
})();
