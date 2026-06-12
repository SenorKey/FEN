/* FEN Status Station dashboard — polls /api/status and renders. No deps. */

(function () {
    'use strict';

    var POLL_MS = 5000;
    var lastOk = 0;

    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        return n;
    }

    function rel(iso) {
        if (!iso) return '—';
        var s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
        if (s < 60) return Math.round(s) + 's ago';
        if (s < 3600) return Math.round(s / 60) + 'm ago';
        if (s < 86400) return (s / 3600).toFixed(1) + 'h ago';
        return (s / 86400).toFixed(1) + 'd ago';
    }

    function clock(iso) {
        var d = new Date(iso);
        return isNaN(d) ? '—' : d.toLocaleTimeString([], { hour12: false });
    }

    function renderProbes(probes) {
        var box = document.getElementById('service-tiles');
        box.replaceChildren();
        probes.forEach(function (p) {
            var tile = el('div', 'tile ' + (p.status || 'unknown'));
            tile.appendChild(el('div', 'tile-label', p.label));
            tile.appendChild(el('div', 'tile-state',
                (p.status || 'unknown').toUpperCase() +
                (p.latency_ms != null ? ' · ' + p.latency_ms + 'ms' : '')));
            tile.appendChild(el('div', 'tile-meta',
                (p.detail || '') +
                (p.uptime_pct != null ? ' · ' + p.uptime_pct + '% (1h)' : '') +
                (p.last_change ? ' · changed ' + rel(p.last_change) : '')));
            box.appendChild(tile);
        });
    }

    function renderUnits(units) {
        var box = document.getElementById('unit-tiles');
        box.replaceChildren();
        units.forEach(function (u) {
            var cls = u.state === 'active' ? 'up'
                : (u.state === 'unavailable' || u.state === 'unknown') ? 'unknown' : 'down';
            var tile = el('div', 'tile ' + cls);
            tile.appendChild(el('div', 'tile-label', u.unit));
            tile.appendChild(el('div', 'tile-state', u.state));
            box.appendChild(tile);
        });
    }

    function counter(box, num, cap, isError) {
        var c = el('div', 'counter' + (isError ? ' error' : ''));
        c.appendChild(el('div', 'num', String(num)));
        c.appendChild(el('div', 'cap', cap));
        box.appendChild(c);
    }

    function renderCounters(data) {
        var box = document.getElementById('counters');
        box.replaceChildren();
        var db = data.suggest_db || {};
        if (db.ok) {
            counter(box, db.pending, 'pending suggestions');
            counter(box, db.suggestions_today, 'suggestions today');
            counter(box, db.ratings_today, 'ratings today');
        } else {
            counter(box, db.error || 'suggest DB unreachable', 'suggest DB', true);
        }
        var ev = data.events || {};
        if (ev.ok) {
            counter(box, ev.today, 'interactions today');
        } else {
            counter(box, ev.error || 'events DB unreachable', 'events DB', true);
        }
    }

    function feedItem(at, kind, text) {
        var li = el('li');
        li.appendChild(el('span', 't', clock(at)));
        li.appendChild(el('span', 'k k-' + kind, kind));
        li.appendChild(document.createTextNode(text));
        return li;
    }

    function renderJournal(journal) {
        var list = document.getElementById('journal-feed');
        list.replaceChildren();
        (journal.recent || []).forEach(function (e) {
            list.appendChild(feedItem(e.at, e.kind, e.text));
        });
        if (!journal.recent || !journal.recent.length) {
            list.appendChild(el('li', 'feed-empty', 'no journal events yet'));
        }
        document.getElementById('journal-status').textContent = journal.status || '';
    }

    function renderEvents(events) {
        var list = document.getElementById('event-feed');
        list.replaceChildren();
        (events.recent || []).forEach(function (e) {
            var text = e.page + (e.target ? ' — ' + e.target : '') +
                (e.device ? '  [' + e.device + ']' : '');
            list.appendChild(feedItem(e.at, e.type, text));
        });
        if (!events.recent || !events.recent.length) {
            list.appendChild(el('li', 'feed-empty',
                'no interactions in this session yet (feed fills as beacons arrive)'));
        }
    }

    function tick() {
        fetch('/api/status', { cache: 'no-store' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                lastOk = Date.now();
                var u = document.getElementById('updated');
                u.textContent = 'updated ' + clock(data.generated_at);
                u.classList.remove('stale');
                renderProbes(data.probes || []);
                renderUnits(data.units || []);
                renderCounters(data);
                renderJournal(data.journal || {});
                renderEvents(data.events || {});
            })
            .catch(function () {
                var u = document.getElementById('updated');
                u.textContent = 'station unreachable (last ok ' +
                    (lastOk ? rel(new Date(lastOk).toISOString()) : 'never') + ')';
                u.classList.add('stale');
            });
    }

    tick();
    setInterval(tick, POLL_MS);
})();
