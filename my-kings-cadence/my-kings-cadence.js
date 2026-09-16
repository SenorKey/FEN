/* ═══════════════════════════════════════════════
   my-kings-cadence.js — /my-kings-cadence
   frontendneeded.com

   Three views over ESPN's public NFL endpoints:

     week       this week's slate, grouped by local day
     teams      one team's season, bye week included
     standings  AFC / NFC, by division

   Everything runs in the browser. The endpoints below are
   open, keyless and send Access-Control-Allow-Origin: *,
   so the page needs no server of its own and no secret to
   keep — which is what makes it free to run.

   Two things worth knowing about the data:

   1. The scoreboard response carries the league calendar,
      and the calendar is the only honest answer to "what
      week is it". Week 1 of 2026 runs until Sep 16 07:00Z,
      so a Tuesday visitor is still owed last night's game,
      not Thursday's. Guessing from the date would get that
      wrong for two days out of every seven.

   2. A competitor's record is the record as it stands now,
      on both played and unplayed games — so a Week 12 card
      shows what each team has done to date. That is what
      you want on a schedule page, and it is why the record
      is rendered small: it is context, not the subject.
   ═══════════════════════════════════════════════ */

(function () {
    'use strict';

    /* ═══════════════════════════════════════════════
       ENDPOINTS
       ═══════════════════════════════════════════════ */

    var SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
    var WEB = 'https://site.web.api.espn.com/apis/v2/sports/football/nfl';

    /* Cache lifetimes. The scoreboard is short because scores move;
       everything else is measured in minutes because it does not. A
       live game shortens the scoreboard's life further (see poll()). */
    var TTL = {
        scoreboard: 60 * 1000,
        standings: 5 * 60 * 1000,
        schedule: 15 * 60 * 1000
    };

    /* ═══════════════════════════════════════════════
       STATE
       ═══════════════════════════════════════════════ */

    /* The first season with the current 32-team, eight-division shape.
       Before 2002 the standings view's four-divisions-per-conference
       layout simply is not what the league looked like. */
    var FIRST_SEASON = 2002;

    var state = {
        view: 'week',
        year: null,
        /* The season the league is actually in, as distinct from the one
           being looked at. Seeded once, from the bare scoreboard call. */
        currentYear: null,
        seasonType: null,
        week: null,
        /* Where the season actually is right now, so the rail can mark it
           and the "this week" reset has somewhere to go back to. */
        nowType: null,
        nowWeek: null,
        /* Flat, ordered list of navigable weeks across season types. */
        weeks: [],
        teamId: null,
        conference: 'AFC'
    };

    var pollTimer = null;
    var recovering = false;
    var stage = document.getElementById('stage');
    var announcer = document.getElementById('announce');
    var seasonLabel = document.getElementById('season-label');

    /* One short line for a screen reader after each render, in place of
       making the whole panel a live region. */
    function announce(msg) {
        if (announcer) { announcer.textContent = msg; }
    }

    /* ═══════════════════════════════════════════════
       SMALL HELPERS
       ═══════════════════════════════════════════════ */

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function el(html) {
        var t = document.createElement('template');
        t.innerHTML = html.trim();
        return t.content;
    }

    /* Team colours come as bare hex and some of them (Ravens, Jets,
       Steelers black) vanish against this field. Convert to HSL and
       floor the lightness: the hue survives, so the rail still reads
       as that team's colour, but it is always visible. */
    function teamColor(hex, altHex) {
        var c = normalizeHex(hex) || normalizeHex(altHex);
        if (!c) { return 'rgba(238,241,233,0.3)'; }
        var hsl = hexToHsl(c);
        if (hsl.l < 45) { hsl.l = 45; }
        if (hsl.s < 12) { hsl.s = 12; }
        return 'hsl(' + Math.round(hsl.h) + ' ' + Math.round(hsl.s) + '% ' + Math.round(hsl.l) + '%)';
    }

    function normalizeHex(h) {
        if (!h) { return null; }
        h = String(h).replace('#', '').trim();
        if (!/^[0-9a-fA-F]{6}$/.test(h)) { return null; }
        return h;
    }

    function hexToHsl(hex) {
        var r = parseInt(hex.slice(0, 2), 16) / 255;
        var g = parseInt(hex.slice(2, 4), 16) / 255;
        var b = parseInt(hex.slice(4, 6), 16) / 255;
        var max = Math.max(r, g, b), min = Math.min(r, g, b);
        var h = 0, s = 0, l = (max + min) / 2;
        var d = max - min;
        if (d !== 0) {
            s = d / (1 - Math.abs(2 * l - 1));
            if (max === r) { h = ((g - b) / d) % 6; }
            else if (max === g) { h = (b - r) / d + 2; }
            else { h = (r - g) / d + 4; }
            h *= 60;
            if (h < 0) { h += 360; }
        }
        return { h: h, s: s * 100, l: l * 100 };
    }

    /* ── Dates, in the reader's own zone ───────────────────────── */

    var fmtTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
    var fmtDayFull = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    var fmtDayShort = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    var fmtKey = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });

    function zoneLabel() {
        try {
            var parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(new Date());
            for (var i = 0; i < parts.length; i++) {
                if (parts[i].type === 'timeZoneName') { return parts[i].value; }
            }
        } catch (e) { /* fall through */ }
        return 'local time';
    }

    function dayKey(d) { return fmtKey.format(d); }

    /* ═══════════════════════════════════════════════
       FETCH + CACHE

       sessionStorage, so flipping between tabs and weeks in one
       sitting costs nothing, and a new visit starts fresh. Every
       access is guarded: private windows and blocked site data
       make these throw, and a scoreboard is not worth a crash.
       ═══════════════════════════════════════════════ */

    function cacheGet(key, ttl) {
        try {
            var raw = sessionStorage.getItem(key);
            if (!raw) { return null; }
            var box = JSON.parse(raw);
            if (!box || (Date.now() - box.t) > ttl) { return null; }
            return box.v;
        } catch (e) { return null; }
    }

    function cacheSet(key, value) {
        try {
            sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value }));
        } catch (e) { /* quota or disabled — the page works without it */ }
    }

    function getJSON(url, ttl, force) {
        var key = 'mkc:' + url;
        if (!force) {
            var hit = cacheGet(key, ttl);
            if (hit) { return Promise.resolve(hit); }
        }
        return fetch(url, { mode: 'cors', credentials: 'omit' }).then(function (r) {
            if (!r.ok) { throw new Error('HTTP ' + r.status); }
            return r.json();
        }).then(function (data) {
            cacheSet(key, data);
            return data;
        });
    }

    /* ═══════════════════════════════════════════════
       RENDER HELPERS
       ═══════════════════════════════════════════════ */

    function showLoading() {
        stage.setAttribute('aria-busy', 'true');
        stage.innerHTML = '<div class="count" role="status" aria-label="Loading">' +
            '<span></span><span></span><span></span></div>';
    }

    function showError(message, retry) {
        stage.setAttribute('aria-busy', 'false');
        stage.innerHTML = '<div class="state">' +
            '<p class="state-title">No signal from the line</p>' +
            '<p>' + esc(message) + '</p>' +
            '<button type="button" data-retry>Try again</button>' +
            '</div>';
        var btn = stage.querySelector('[data-retry]');
        if (btn) { btn.addEventListener('click', retry); }
    }

    /* The scoreboard serves /500/scoreboard/ne.png and the standings serve
       /500/ne.png — different artwork for the same team, so a club looks
       like two clubs depending on which tab you came from. Collapse every
       ESPN logo URL onto the plain /500/ form. */
    function normalizeLogo(url) {
        if (!url) { return url; }
        return String(url)
            .replace('/500/scoreboard/', '/500/')
            .replace('/500-dark/', '/500/');
    }

    function logoImg(url, abbr, cls) {
        url = normalizeLogo(url);
        if (!url) {
            return '<span class="' + cls + '-fallback">' + esc(abbr || '') + '</span>';
        }
        return '<img class="' + cls + '" src="' + esc(url) + '" alt="" loading="lazy" decoding="async" ' +
            'onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),' +
            '{className:\'' + cls + '-fallback\',textContent:' + JSON.stringify(String(abbr || '')) + '}))">';
    }

    /* ═══════════════════════════════════════════════
       SEASON CALENDAR

       The scoreboard hands back the whole calendar. Flatten it into
       one ordered list of weeks so prev / next walks straight from
       Week 18 into the Wild Card round without special-casing.
       Preseason is left out unless the season is actually in it.
       ═══════════════════════════════════════════════ */

    function buildWeeks(calendar, nowType) {
        var out = [];
        (calendar || []).forEach(function (section) {
            var type = parseInt(section.value, 10);
            if (!type || type === 4) { return; }
            if (type === 1 && nowType !== 1) { return; }
            (section.entries || []).forEach(function (entry) {
                out.push({
                    type: type,
                    week: parseInt(entry.value, 10),
                    label: entry.label || ('Week ' + entry.value),
                    short: entry.alternateLabel || entry.label || '',
                    detail: entry.detail || '',
                    start: entry.startDate,
                    end: entry.endDate
                });
            });
        });
        return out;
    }

    /* ═══════════════════════════════════════════════
       SEASON
       ═══════════════════════════════════════════════ */

    function isCurrentSeason() {
        return state.year != null && state.year === state.currentYear;
    }

    function paintSeasonBar() {
        if (!seasonLabel) { return; }
        var y = state.year;
        if (y == null) { return; }
        seasonLabel.textContent = y + ' Season';
        seasonLabel.classList.toggle('is-past', !isCurrentSeason());

        document.querySelectorAll('[data-season]').forEach(function (b) {
            var step = parseInt(b.dataset.season, 10);
            var target = y + step;
            b.disabled = (target < FIRST_SEASON ||
                (state.currentYear != null && target > state.currentYear));
        });
    }

    function stepSeason(delta) {
        if (state.year == null || state.currentYear == null) { return; }
        var target = state.year + delta;
        if (target < FIRST_SEASON || target > state.currentYear) { return; }
        state.year = target;

        /* Returning to the live season lands on the week the league is in;
           any other season opens at its Week 1, since "now" means nothing
           there. The week list is rebuilt from whatever the next response
           carries, so no stale calendar survives the jump. */
        if (isCurrentSeason()) {
            state.seasonType = state.nowType;
            state.week = state.nowWeek;
        } else {
            state.seasonType = 2;
            state.week = 1;
        }
        state.weeks = [];

        paintSeasonBar();
        switchView(state.view);
    }

    function weekIndex(type, week) {
        for (var i = 0; i < state.weeks.length; i++) {
            if (state.weeks[i].type === type && state.weeks[i].week === week) { return i; }
        }
        return -1;
    }

    /* ═══════════════════════════════════════════════
       WEEK VIEW
       ═══════════════════════════════════════════════ */

    function scoreboardURL() {
        /* Bare, the endpoint answers with whatever week the league is in,
           which is exactly this page's default. Asking for that same week
           explicitly would be a second URL for identical data and a second
           network trip, so the live week keeps using the bare form and
           shares its cache entry with the boot request. */
        if (state.week == null) { return SITE + '/scoreboard'; }
        if (isCurrentSeason() && state.seasonType === state.nowType &&
            state.week === state.nowWeek) {
            return SITE + '/scoreboard';
        }
        return SITE + '/scoreboard?dates=' + state.year +
            '&seasontype=' + state.seasonType + '&week=' + state.week;
    }

    function renderWeek(force) {
        showLoading();
        var url = scoreboardURL();
        getJSON(url, TTL.scoreboard, force).then(function (data) {
            var league = (data.leagues && data.leagues[0]) || {};

            /* Seed the live season position from the first, bare response. */
            if (state.currentYear == null) {
                state.currentYear = (data.season && data.season.year) || new Date().getFullYear();
                state.nowType = (data.season && data.season.type) || 2;
                state.nowWeek = (data.week && data.week.number) || 1;
            }
            if (state.year == null) { state.year = state.currentYear; }
            if (state.week == null) {
                state.seasonType = state.nowType;
                state.week = state.nowWeek;
            }

            /* Every scoreboard response carries the calendar for the season
               it answered for, so the week list is rebuilt from the answer
               rather than cached across a season change. */
            var weeks = buildWeeks(league.calendar, isCurrentSeason() ? state.nowType : 2);
            if (weeks.length) { state.weeks = weeks; }

            /* A hand-edited or stale link can name a week this season does
               not have — 2011 had seventeen, not eighteen. Snap to a real
               one and re-render, once, rather than leaving both arrows
               disabled on an empty slate with no way out. */
            if (state.weeks.length && weekIndex(state.seasonType, state.week) < 0 && !recovering) {
                recovering = true;
                state.seasonType = state.weeks[0].type;
                state.week = state.weeks[0].week;
                renderWeek(force);
                return;
            }
            recovering = false;

            paintSeasonBar();
            paintWeek(data.events || [], data.week || {});
            writeHash();
            poll(data.events || []);
        }).catch(function (err) {
            showError('Could not reach the scoreboard (' + err.message + '). It may be a moment ' +
                'of upstream trouble rather than anything on this end.', function () { renderWeek(true); });
        });
    }

    function paintWeek(events, weekMeta) {
        var idx = weekIndex(state.seasonType, state.week);
        var meta = idx >= 0 ? state.weeks[idx] : { label: 'Week ' + state.week, detail: '' };
        var html = '';

        /* ── Week bar: prev / label / the count rail ── */
        html += '<div class="weekbar">';
        html += '<div class="weeknav">';
        html += '<button type="button" data-step="-1" aria-label="Previous week"' +
            (idx <= 0 ? ' disabled' : '') + '>&#8249;</button>';
        html += '<div class="weeklabel"><div class="wl-week">' + esc(meta.label) + '</div>' +
            (meta.detail ? '<div class="wl-range">' + esc(meta.detail) + '</div>' : '') + '</div>';
        html += '<button type="button" data-step="1" aria-label="Next week"' +
            (idx < 0 || idx >= state.weeks.length - 1 ? ' disabled' : '') + '>&#8250;</button>';
        html += '</div>';

        html += '<div class="rail" role="group" aria-label="Jump to week">';
        var live = isCurrentSeason();
        state.weeks.forEach(function (w) {
            var isNow = live && (w.type === state.nowType && w.week === state.nowWeek);
            var isSel = (w.type === state.seasonType && w.week === state.week);
            html += '<button type="button" class="tick' + (isNow ? ' is-now' : '') + '"' +
                ' data-type="' + w.type + '" data-week="' + w.week + '"' +
                (isSel ? ' aria-current="true"' : '') +
                ' title="' + esc(w.label) + (w.detail ? ' · ' + esc(w.detail) : '') + '">' +
                '<span class="tick-n">' + esc(w.label) + '</span></button>';
        });
        html += '</div></div>';

        /* ── Zone note + "this week" escape hatch ── */
        var strayed = live && !(state.seasonType === state.nowType && state.week === state.nowWeek);
        html += '<p class="zonenote">Times in ' + esc(zoneLabel()) +
            (strayed ? '<button type="button" class="today-btn" data-now>This week</button>' : '') + '</p>';

        /* ── The slate ── */
        if (!events.length) {
            html += '<div class="state"><p class="state-title">Nothing on the card</p>' +
                '<p>No games are scheduled for this week.</p></div>';
            stage.innerHTML = html;
            stage.setAttribute('aria-busy', 'false');
            announce(meta.label + ', ' + state.year + ' season. No games.');
            bindWeek();
            return;
        }

        /* Group by the reader's local calendar day, not ESPN's. A 8:15pm
           Monday kickoff on the west coast is still Monday; the same game
           is Tuesday 01:15 UTC, and grouping on the raw date would file it
           under a day nobody watched it on. */
        var order = [];
        var groups = {};
        var undated = [];
        events.slice().sort(function (a, b) {
            return new Date(a.date) - new Date(b.date);
        }).forEach(function (ev) {
            var comp = (ev.competitions && ev.competitions[0]) || {};
            if (!hasTime(comp)) { undated.push(ev); return; }
            var k = dayKey(new Date(ev.date));
            if (!groups[k]) { groups[k] = []; order.push(k); }
            groups[k].push(ev);
        });

        var todayKey = dayKey(new Date());
        order.forEach(function (k) {
            var when = new Date(groups[k][0].date);
            var heading = fmtDayFull.format(when);
            if (k === todayKey) { heading = 'Today — ' + heading; }
            html += '<section class="daygroup">' +
                '<div class="dayhead"><h2>' + esc(heading) + '</h2><span class="dh-rule"></span></div>' +
                '<div class="games">';
            groups[k].forEach(function (ev) { html += gameCard(ev); });
            html += '</div></section>';
        });

        if (undated.length) {
            html += '<section class="daygroup">' +
                '<div class="dayhead"><h2>Day and time to be announced</h2>' +
                '<span class="dh-rule"></span></div><div class="games">';
            undated.forEach(function (ev) { html += gameCard(ev); });
            html += '</div></section>';
        }

        /* The scoreboard names the teams idle this week; a schedule page
           that cannot answer "why isn't my team on here" is half a page. */
        var byes = (weekMeta && weekMeta.teamsOnBye) || [];
        if (byes.length) {
            html += '<section class="byes"><h2>On bye</h2>';
            byes.forEach(function (t) {
                html += '<span class="bye-team">' +
                    logoImg(t.logo, t.abbreviation, 'logo-sm') +
                    esc(t.shortDisplayName || t.displayName || t.abbreviation || '') + '</span>';
            });
            html += '</section>';
        }

        stage.innerHTML = html;
        stage.setAttribute('aria-busy', 'false');
        announce(meta.label + ', ' + state.year + ' season. ' + events.length + ' games.');
        bindWeek();
    }

    function gameCard(ev) {
        var comp = (ev.competitions && ev.competitions[0]) || {};
        var cs = comp.competitors || [];
        var home = null, away = null;
        cs.forEach(function (c) { if (c.homeAway === 'home') { home = c; } else { away = c; } });
        if (!home || !away) { return ''; }

        var st = (ev.status && ev.status.type) || {};
        var name = st.name || '';
        var state_ = st.state || 'pre';
        var odd = (name === 'STATUS_POSTPONED' || name === 'STATUS_CANCELED' ||
            name === 'STATUS_SUSPENDED' || name === 'STATUS_DELAYED');
        var live = (state_ === 'in' && !odd);
        var done = (state_ === 'post' && !odd);

        /* ── Right-hand status block ── */
        var metaHTML;
        if (odd) {
            metaHTML = '<span class="final">' + esc(st.shortDetail || st.description || 'TBD') + '</span>';
        } else if (live) {
            metaHTML = '<span class="livetag">' + esc(liveClock(ev.status)) + '</span>';
        } else if (done) {
            metaHTML = '<span class="final">' + esc(st.shortDetail || 'Final') + '</span>';
        } else if (!hasTime(comp)) {
            metaHTML = '<span class="kick">TBD</span>';
        } else {
            var net = broadcast(comp);
            metaHTML = '<span class="kick">' + esc(fmtTime.format(new Date(ev.date))) + '</span>' +
                (net ? '<span class="sub">' + esc(net) + '</span>' : '');
        }

        var showScores = live || done;
        return '<article class="game' + (live ? ' is-live' : '') + '">' +
            '<div class="sides">' +
            sideRow(away, 'away', showScores, done) +
            sideRow(home, 'home', showScores, done) +
            '</div>' +
            '<div class="meta">' + metaHTML + '</div>' +
            '</article>';
    }

    function sideRow(c, ha, showScore, done) {
        var t = c.team || {};
        var rec = recordOf(c);
        /* Only dim a loser once the game is actually over — a team trailing
           at the half has not lost anything yet. */
        var lost = done && c.winner === false;
        var won = done && c.winner === true;
        var label = ha === 'home' ? 'Home' : 'Away';

        return '<div class="side' + (lost ? ' lost' : '') + (won ? ' won' : '') +
            '" style="--team:' + teamColor(t.color, t.alternateColor) + '">' +
            '<span class="ha"><span class="ha-long">' + label + '</span>' +
            '<span class="ha-short" aria-hidden="true">' + label.charAt(0) + '</span></span>' +
            logoImg(t.logo, t.abbreviation, 'logo') +
            '<span class="who">' +
            '<span class="name">' + esc(t.shortDisplayName || t.displayName || t.abbreviation || '') + '</span>' +
            (rec ? '<span class="rec">' + esc(rec) + '</span>' : '') +
            '</span>' +
            (showScore ? '<span class="score">' + esc(c.score == null ? '' : c.score) + '</span>' : '') +
            '</div>';
    }

    function recordOf(c) {
        var list = c.records || c.record || [];
        if (!Array.isArray(list)) { return ''; }
        for (var i = 0; i < list.length; i++) {
            var r = list[i];
            if (r.type === 'total' || r.name === 'overall') {
                return r.summary || r.displayValue || '';
            }
        }
        return (list[0] && (list[0].summary || list[0].displayValue)) || '';
    }

    function liveClock(status) {
        var st = status.type || {};
        if (st.name === 'STATUS_HALFTIME') { return 'Half'; }
        if (st.name === 'STATUS_END_PERIOD') { return 'End ' + ordinalPeriod(status.period); }
        var p = status.period || 0;
        var clock = status.displayClock || '';
        if (p > 4) { return (p > 5 ? 'OT' + (p - 4) : 'OT') + (clock ? ' ' + clock : ''); }
        return 'Q' + p + (clock ? ' ' + clock : '');
    }

    function ordinalPeriod(p) {
        if (p > 4) { return 'OT'; }
        return ['', '1st', '2nd', '3rd', '4th'][p] || '';
    }

    /* Late-season kickoffs are not set until the flex window closes, and
       ESPN fills the gap with a placeholder — every Week 18 game carries
       2027-01-10T05:00Z. Rendered naively that becomes a confident
       "11:00 PM" on a day that depends on the reader's time zone, which
       is worse than admitting the time is not known yet. */
    function hasTime(comp) {
        return comp.timeValid !== false;
    }

    function broadcast(comp) {
        var b = comp.broadcasts && comp.broadcasts[0];
        if (b && b.names && b.names.length) { return b.names.join('/'); }
        var g = comp.geoBroadcasts && comp.geoBroadcasts[0];
        if (g && g.media) { return g.media.shortName || g.media.name || ''; }
        return '';
    }

    function bindWeek() {
        stage.querySelectorAll('[data-step]').forEach(function (b) {
            b.addEventListener('click', function () {
                var idx = weekIndex(state.seasonType, state.week) + parseInt(b.dataset.step, 10);
                if (idx < 0 || idx >= state.weeks.length) { return; }
                state.seasonType = state.weeks[idx].type;
                state.week = state.weeks[idx].week;
                renderWeek();
            });
        });
        stage.querySelectorAll('.tick').forEach(function (b) {
            b.addEventListener('click', function () {
                state.seasonType = parseInt(b.dataset.type, 10);
                state.week = parseInt(b.dataset.week, 10);
                renderWeek();
            });
        });
        var now = stage.querySelector('[data-now]');
        if (now) {
            now.addEventListener('click', function () {
                state.seasonType = state.nowType;
                state.week = state.nowWeek;
                renderWeek();
            });
        }
    }

    /* A week with a game in progress refreshes itself; every other week
       is static and is left alone. The timer is cleared on every render
       so switching views never leaves one running behind the page. */
    function poll(events) {
        clearTimeout(pollTimer);
        var anyLive = events.some(function (ev) {
            return ev.status && ev.status.type && ev.status.type.state === 'in';
        });
        if (!anyLive || state.view !== 'week') { return; }
        pollTimer = setTimeout(function () {
            if (state.view === 'week' && !document.hidden) { renderWeek(true); }
            else { poll(events); }
        }, 30000);
    }

    /* ═══════════════════════════════════════════════
       STANDINGS VIEW

       level=3 nests the league as conference → division → team,
       which is the shape the standings are read in. The same
       response also groups all 32 teams by division, so the team
       picker is built from it rather than fetched separately.
       ═══════════════════════════════════════════════ */

    function standingsURL(year) {
        return WEB + '/standings?region=us&lang=en&contentorigin=espn&season=' + year +
            '&type=0&level=3&sort=winpercent';
    }

    function getStandings(force) {
        var year = state.year || new Date().getFullYear();
        return getJSON(standingsURL(year), TTL.standings, force);
    }

    function statOf(entry, name) {
        var stats = entry.stats || [];
        for (var i = 0; i < stats.length; i++) {
            if (stats[i].name === name || stats[i].type === name) { return stats[i]; }
        }
        return null;
    }

    function statVal(entry, name, fallback) {
        var s = statOf(entry, name);
        if (!s) { return fallback === undefined ? '—' : fallback; }
        return s.displayValue != null ? s.displayValue : s.value;
    }

    function statNum(entry, name) {
        var s = statOf(entry, name);
        return s && typeof s.value === 'number' ? s.value : 0;
    }

    /* ESPN returns each division worst-to-best regardless of the sort
       parameter, so the order has to be decided here.

       Prefer playoffSeed. It is a conference-wide seed, so within a
       division the lower seed is always the better-placed team, and it
       already encodes the NFL's real tiebreakers — head-to-head, division
       record, common games. Sorting on point differential instead gets
       genuine ties wrong: Carolina won the 2025 NFC South at 8-9 over two
       other 8-9 teams, and differential would have placed them third.

       The fall-back only runs when a division has no seeds yet, which is
       the case before a season has been played. */
    function sortEntries(entries) {
        var seeded = entries.length > 0 && entries.every(function (e) {
            return statNum(e, 'playoffSeed') > 0;
        });
        return entries.slice().sort(function (a, b) {
            if (seeded) {
                return statNum(a, 'playoffSeed') - statNum(b, 'playoffSeed');
            }
            var d = statNum(b, 'winPercent') - statNum(a, 'winPercent');
            if (d) { return d; }
            d = statNum(b, 'wins') - statNum(a, 'wins');
            if (d) { return d; }
            return statNum(b, 'pointDifferential') - statNum(a, 'pointDifferential');
        });
    }

    function renderStandings(force) {
        showLoading();
        getStandings(force).then(function (data) {
            var confs = data.children || [];
            var conf = null;
            confs.forEach(function (c) {
                if ((c.abbreviation || c.name || '').toUpperCase().indexOf(state.conference) === 0) { conf = c; }
            });
            if (!conf) { conf = confs[0]; }

            var html = '<div class="confswitch" role="group" aria-label="Conference">';
            ['AFC', 'NFC'].forEach(function (k) {
                html += '<button type="button" data-conf="' + k + '" aria-pressed="' +
                    (state.conference === k ? 'true' : 'false') + '">' + k + '</button>';
            });
            html += '</div>';

            if (!conf || !(conf.children || []).length) {
                html += '<div class="state"><p class="state-title">Standings not posted yet</p>' +
                    '<p>The league has not published a table for this season.</p></div>';
                stage.innerHTML = html;
                stage.setAttribute('aria-busy', 'false');
                bindStandings();
                return;
            }

            html += '<div class="divisions">';
            (conf.children || []).forEach(function (div) {
                var entries = sortEntries((div.standings && div.standings.entries) || []);
                html += '<section class="division"><h3>' + esc(div.name || div.abbreviation || '') + '</h3>' +
                    '<table class="stand"><thead><tr>' +
                    '<th scope="col">Team</th>' +
                    '<th scope="col">W</th><th scope="col">L</th><th scope="col">T</th>' +
                    '<th scope="col">Pct</th>' +
                    '<th scope="col" class="opt">PF</th><th scope="col" class="opt">PA</th>' +
                    '<th scope="col" class="opt">Diff</th>' +
                    '<th scope="col">Strk</th>' +
                    '</tr></thead><tbody>';

                entries.forEach(function (e, i) {
                    var t = e.team || {};
                    var logo = (t.logos && t.logos[0] && t.logos[0].href) || '';
                    var diff = statNum(e, 'pointDifferential');
                    var strk = String(statVal(e, 'streak', ''));
                    html += '<tr' + (i === 0 ? ' class="leader"' : '') + '>' +
                        '<td><span class="t-team">' + logoImg(logo, t.abbreviation, 'logo-sm') +
                        '<button type="button" data-team="' + esc(t.id) + '">' +
                        esc(t.shortDisplayName || t.displayName || '') + '</button></span></td>' +
                        '<td class="num-strong">' + esc(statVal(e, 'wins', 0)) + '</td>' +
                        '<td class="num-strong">' + esc(statVal(e, 'losses', 0)) + '</td>' +
                        '<td class="num-dim">' + esc(statVal(e, 'ties', 0)) + '</td>' +
                        '<td>' + esc(statVal(e, 'winPercent', '.000')) + '</td>' +
                        '<td class="opt num-dim">' + esc(statVal(e, 'pointsFor', 0)) + '</td>' +
                        '<td class="opt num-dim">' + esc(statVal(e, 'pointsAgainst', 0)) + '</td>' +
                        '<td class="opt">' + (diff > 0 ? '+' : '') + esc(diff) + '</td>' +
                        '<td class="' + (strk.charAt(0) === 'W' ? 'strk-w' : 'strk-l') + '">' +
                        esc(strk || '—') + '</td>' +
                        '</tr>';
                });

                html += '</tbody></table></section>';
            });
            html += '</div>';

            stage.innerHTML = html;
            stage.setAttribute('aria-busy', 'false');
            paintSeasonBar();
            announce(state.conference + ' standings, ' + state.year + ' season.');
            bindStandings();
            writeHash();
        }).catch(function (err) {
            showError('Could not load the standings (' + err.message + ').',
                function () { renderStandings(true); });
        });
    }

    function bindStandings() {
        stage.querySelectorAll('[data-conf]').forEach(function (b) {
            b.addEventListener('click', function () {
                state.conference = b.dataset.conf;
                renderStandings();
            });
        });
        /* A team name in the table is a way into that team's season. */
        stage.querySelectorAll('[data-team]').forEach(function (b) {
            b.addEventListener('click', function () {
                state.teamId = b.dataset.team;
                switchView('teams');
            });
        });
    }

    /* ═══════════════════════════════════════════════
       TEAMS VIEW
       ═══════════════════════════════════════════════ */

    function renderTeams(force) {
        if (state.teamId) { return renderTeamSeason(force); }

        showLoading();
        getStandings(force).then(function (data) {
            var html = '<div class="pickwrap">';
            (data.children || []).forEach(function (conf) {
                (conf.children || []).forEach(function (div) {
                    var entries = sortEntries((div.standings && div.standings.entries) || []);
                    if (!entries.length) { return; }
                    html += '<section class="pickgroup"><h3>' + esc(div.name || '') + '</h3>' +
                        '<div class="pickgrid">';
                    entries.forEach(function (e) {
                        var t = e.team || {};
                        var logo = (t.logos && t.logos[0] && t.logos[0].href) || '';
                        html += '<button type="button" class="chip" data-team="' + esc(t.id) + '">' +
                            logoImg(logo, t.abbreviation, 'logo-sm') +
                            '<span>' + esc(t.abbreviation || '') + '</span></button>';
                    });
                    html += '</div></section>';
                });
            });
            html += '</div>';

            stage.innerHTML = html;
            stage.setAttribute('aria-busy', 'false');
            paintSeasonBar();
            announce('All teams, ' + state.year + ' season.');
            stage.querySelectorAll('[data-team]').forEach(function (b) {
                b.addEventListener('click', function () {
                    state.teamId = b.dataset.team;
                    renderTeamSeason();
                });
            });
            writeHash();
        }).catch(function (err) {
            showError('Could not load the team list (' + err.message + ').',
                function () { renderTeams(true); });
        });
    }

    function teamScheduleURL(year, type) {
        return SITE + '/teams/' + state.teamId + '/schedule?season=' + year + '&seasontype=' + type;
    }

    function renderTeamSeason(force) {
        showLoading();
        var year = state.year || new Date().getFullYear();

        /* The endpoint answers for one season type at a time and defaults to
           the regular season, so a team's playoff run is simply absent unless
           it is asked for separately. That gap is invisible in September and
           glaring the moment you look back at a finished season. The
           postseason call is allowed to fail on its own: a team that missed
           the playoffs, or a season still in progress, is not an error. */
        Promise.all([
            getJSON(teamScheduleURL(year, 2), TTL.schedule, force),
            getJSON(teamScheduleURL(year, 3), TTL.schedule, force)
                .catch(function () { return null; })
        ]).then(function (both) {
            var data = both[0];
            var post = both[1];

            var t = data.team || {};
            var logo = (t.logos && t.logos[0] && t.logos[0].href) || t.logo || '';

            var events = (data.events || []).map(function (e) { return tag(e, 2); });
            if (post && post.events) {
                events = events.concat(post.events.map(function (e) { return tag(e, 3); }));
            }
            events.sort(function (a, b) {
                return (a._type - b._type) || (weekNum(a) - weekNum(b));
            });

            var html = '<div class="teamhead">' +
                logoImg(logo, t.abbreviation, 'th-logo') +
                '<div><div class="th-name">' + esc(t.displayName || '') + '</div>' +
                '<div class="th-sub">' + esc(year) + ' season' +
                (data.byeWeek ? ' &middot; bye week ' + esc(data.byeWeek) : '') + '</div></div>' +
                '<button type="button" class="th-back" data-allteams>&#8249; All teams</button>' +
                '</div>';

            if (!events.length) {
                html += '<div class="state"><p class="state-title">No schedule yet</p>' +
                    '<p>Nothing has been published for this team this season.</p></div>';
                stage.innerHTML = html;
                stage.setAttribute('aria-busy', 'false');
                paintSeasonBar();
                bindTeamSeason();
                return;
            }

            html += '<p class="zonenote">Times in ' + esc(zoneLabel()) + '</p>';
            html += '<div class="season">';

            var bye = data.byeWeek ? parseInt(data.byeWeek, 10) : null;
            var placed = false;
            events.forEach(function (ev) {
                if (bye && !placed && (ev._type === 3 || weekNum(ev) > bye)) {
                    html += byeRow(bye);
                    placed = true;
                }
                html += seasonRow(ev, t);
            });
            if (bye && !placed) { html += byeRow(bye); }

            html += '</div>';
            stage.innerHTML = html;
            stage.setAttribute('aria-busy', 'false');
            paintSeasonBar();
            announce((t.displayName || 'Team') + ', ' + year + ' season.');
            bindTeamSeason();
            writeHash();
        }).catch(function (err) {
            showError('Could not load that team’s schedule (' + err.message + ').',
                function () { renderTeamSeason(true); });
        });
    }

    function weekNum(ev) {
        return (ev.week && ev.week.number) || 0;
    }

    function tag(ev, type) {
        ev._type = type;
        return ev;
    }

    var POST_LABELS = ['', 'Wild Card', 'Divisional', 'Conf Champ', 'Pro Bowl', 'Super Bowl'];

    /* "Wk 1" twice in one list would be nonsense, so a postseason row is
       labelled by its round instead of its week number. */
    function weekLabel(ev) {
        if (ev._type === 3) {
            return POST_LABELS[weekNum(ev)] || 'Postseason';
        }
        return 'Wk ' + weekNum(ev);
    }

    function byeRow(wk) {
        return '<div class="srow is-bye"><span class="s-wk">Wk ' + esc(wk) + '</span>' +
            '<span class="s-date"></span><span class="s-byelabel">Bye week</span></div>';
    }

    function seasonRow(ev, team) {
        var comp = (ev.competitions && ev.competitions[0]) || {};
        var cs = comp.competitors || [];
        var me = null, opp = null;
        cs.forEach(function (c) {
            if (String((c.team || {}).id) === String(team.id)) { me = c; } else { opp = c; }
        });
        if (!me || !opp) { return ''; }

        var ot = opp.team || {};
        var st = (comp.status && comp.status.type) || (ev.status && ev.status.type) || {};
        var done = st.state === 'post' && st.name === 'STATUS_FINAL';
        var when = new Date(ev.date);
        var atHome = me.homeAway === 'home';

        var timed = hasTime(comp);
        var res;
        if (done) {
            var mine = scoreVal(me), theirs = scoreVal(opp);
            var wl = me.winner === true ? 'W' : (mine === theirs ? 'T' : 'L');
            res = '<span class="wl ' + wl + '">' + wl + '</span>' + esc(mine) + '&ndash;' + esc(theirs);
        } else if (!timed) {
            res = '<span class="upcoming">TBD</span>';
        } else {
            res = '<span class="upcoming">' + esc(fmtTime.format(when)) + '</span>';
        }

        return '<div class="srow' + (ev._type === 3 ? ' is-post' : '') + '">' +
            '<span class="s-wk">' + esc(weekLabel(ev)) + '</span>' +
            '<span class="s-date">' + (timed ? esc(fmtDayShort.format(when)) : '') + '</span>' +
            '<span class="s-opp"><span class="s-at">' + (atHome ? 'vs' : '@') + '</span>' +
            logoImg(ot.logo || (ot.logos && ot.logos[0] && ot.logos[0].href), ot.abbreviation, 'logo-sm') +
            '<span class="s-name">' + esc(ot.shortDisplayName || ot.displayName || ot.abbreviation || '') +
            '</span></span>' +
            '<span class="s-res">' + res + '</span>' +
            '</div>';
    }

    /* The two endpoints disagree on shape: the scoreboard sends a bare
       string, the team schedule sends an object. Take either. */
    function scoreVal(c) {
        if (c.score == null) { return ''; }
        if (typeof c.score === 'object') {
            return c.score.displayValue != null ? c.score.displayValue : c.score.value;
        }
        return c.score;
    }

    function bindTeamSeason() {
        var back = stage.querySelector('[data-allteams]');
        if (back) {
            back.addEventListener('click', function () {
                state.teamId = null;
                renderTeams();
            });
        }
    }

    /* ═══════════════════════════════════════════════
       VIEW SWITCHING + ROUTING

       The hash makes any view shareable: #/2025/week/2/9 or
       #/2025/standings/NFC lands exactly there.

       replaceState, not pushState, and deliberately. Flipping
       through ten weeks would otherwise bury the page under ten
       history entries and the reader would press Back ten times
       to leave. The cost is that Back does not step between
       views — it exits the page, which is what a reference page
       reached from elsewhere should do.
       ═══════════════════════════════════════════════ */

    function switchView(view) {
        state.view = view;
        clearTimeout(pollTimer);

        document.querySelectorAll('.tab').forEach(function (t) {
            var on = t.dataset.view === view;
            t.setAttribute('aria-selected', on ? 'true' : 'false');
            if (on) { stage.setAttribute('aria-labelledby', t.id); }
        });

        if (view === 'week') { renderWeek(); }
        else if (view === 'teams') { renderTeams(); }
        else { renderStandings(); }
    }

    var lastHash = null;

    function writeHash() {
        var y = state.year != null ? '/' + state.year : '';
        var h;
        if (state.view === 'week') { h = '#' + y + '/week/' + state.seasonType + '/' + state.week; }
        else if (state.view === 'teams') { h = '#' + y + (state.teamId ? '/team/' + state.teamId : '/teams'); }
        else { h = '#' + y + '/standings/' + state.conference; }
        lastHash = h;
        if (location.hash !== h) {
            history.replaceState(null, '', h);
        }
    }

    /* replaceState does not fire hashchange, so this only runs when the hash
       changes for a reason of the reader's own — pasting a shared link into
       a tab that already has the page open, or stepping back into a history
       entry from before this load. Without it a pasted link quietly does
       nothing, which reads as a broken page rather than a no-op. */
    function onHashChange() {
        if (location.hash === lastHash) { return; }

        /* Clear anything the incoming link does not itself specify, so the
           link fully describes the view rather than inheriting leftovers. */
        state.teamId = null;
        state.week = null;
        state.seasonType = null;

        if (!readHash()) { return; }

        if (state.year == null ||
            (state.currentYear != null && state.year > state.currentYear)) {
            state.year = state.currentYear;
        }
        if (state.week == null) {
            if (isCurrentSeason()) {
                state.seasonType = state.nowType;
                state.week = state.nowWeek;
            } else {
                state.seasonType = 2;
                state.week = 1;
            }
        }

        state.weeks = [];
        paintSeasonBar();
        switchView(state.view);
    }

    function readHash() {
        var parts = (location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
        if (!parts.length) { return false; }

        /* A leading four-digit group is the season. Links written before
           the season selector existed have none, and still resolve — they
           just mean "the season the league is in". */
        if (/^\d{4}$/.test(parts[0])) {
            var y = parseInt(parts[0], 10);
            if (y >= FIRST_SEASON && y <= 2100) { state.year = y; }
            parts = parts.slice(1);
        }
        if (!parts.length) { return false; }

        if (parts[0] === 'week' && parts.length >= 3) {
            state.view = 'week';
            state.seasonType = parseInt(parts[1], 10);
            state.week = parseInt(parts[2], 10);
            return true;
        }
        if (parts[0] === 'team' && parts[1]) {
            state.view = 'teams';
            state.teamId = parts[1];
            return true;
        }
        if (parts[0] === 'teams') { state.view = 'teams'; state.teamId = null; return true; }
        if (parts[0] === 'standings') {
            state.view = 'standings';
            state.conference = (parts[1] || 'AFC').toUpperCase() === 'NFC' ? 'NFC' : 'AFC';
            return true;
        }
        return false;
    }

    /* ═══════════════════════════════════════════════
       BOOT
       ═══════════════════════════════════════════════ */

    function init() {
        document.querySelectorAll('.tab').forEach(function (t) {
            t.addEventListener('click', function () {
                /* Leaving Teams always returns to the picker, so coming back
                   does not strand the reader inside whichever team they last
                   looked at with no obvious way out. */
                if (t.dataset.view !== 'teams') { state.teamId = null; }
                switchView(t.dataset.view);
            });
        });

        /* Left / right arrows move between tabs, per the WAI-ARIA tabs pattern. */
        var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
        tabs.forEach(function (t, i) {
            t.addEventListener('keydown', function (e) {
                var next = e.key === 'ArrowRight' ? i + 1 : (e.key === 'ArrowLeft' ? i - 1 : null);
                if (next === null) { return; }
                e.preventDefault();
                var target = tabs[(next + tabs.length) % tabs.length];
                target.focus();
                target.click();
            });
        });

        document.querySelectorAll('[data-season]').forEach(function (b) {
            b.addEventListener('click', function () {
                stepSeason(parseInt(b.dataset.season, 10));
            });
        });

        window.addEventListener('hashchange', onHashChange);

        readHash();
        boot();
    }

    /* Where the league actually is has to be settled before anything can
       render: the season selector's upper bound, the "this week" reset and
       the rail's now-marker all depend on it, and only the bare scoreboard
       call knows it. One request, cached, and the week view reuses it. */
    function boot() {
        showLoading();
        getJSON(SITE + '/scoreboard', TTL.scoreboard, false).then(function (data) {
            state.currentYear = (data.season && data.season.year) || new Date().getFullYear();
            state.nowType = (data.season && data.season.type) || 2;
            state.nowWeek = (data.week && data.week.number) || 1;

            if (state.year == null || state.year > state.currentYear) {
                state.year = state.currentYear;
            }

            /* A link that named a season but not a week opens that season at
               its start; the live season opens where the league is. */
            if (state.week == null) {
                if (isCurrentSeason()) {
                    state.seasonType = state.nowType;
                    state.week = state.nowWeek;
                } else {
                    state.seasonType = 2;
                    state.week = 1;
                }
            }

            paintSeasonBar();
            switchView(state.view);
        }).catch(function (err) {
            showError('Could not reach the scoreboard (' + err.message + '). It may be a moment ' +
                'of upstream trouble rather than anything on this end.', boot);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

/* ═══════════════════════════════════════════════
   HASH RAIL — the parallax

   Both sidelines are translated at the same fraction of the
   scroll, so the field drifts past far slower than the slate
   on top of it. One rate for both: a football field is one
   object, and running the two edges at different speeds
   would read as a bug rather than as depth.

   The tick pattern repeats every 80px (see .hr-strip), so the
   offset is wrapped by one period instead of being allowed to
   grow with the document. The strip therefore never has to be
   as tall as the page, and nothing here needs remeasuring when
   a view swaps underneath it.

   Transform only, written inside a frame, so the whole thing
   stays on the compositor and never triggers layout.
   ═══════════════════════════════════════════════ */

(function () {
    'use strict';

    var layer = document.querySelector('.hashrail');
    if (!layer) { return; }

    var strips = Array.prototype.slice.call(layer.querySelectorAll('.hr-strip'));
    if (!strips.length) { return; }

    /* Share of the scroll the field travels. Lower is deeper: at 1 the
       sidelines would ride along with the page and there would be no
       parallax at all, at 0 they would be nailed to the viewport. 0.16
       means the field drifts at about a sixth of the reader's pace, so
       the slate clearly moves over it rather than with it. This is the
       one number to change if the effect wants more or less depth. */
    var RATE = 0.16;
    var PERIOD = 80;   /* px between five-yard ticks — must match the CSS */

    var slow = window.matchMedia('(prefers-reduced-motion: reduce)');
    var bound = false;
    var ticking = false;
    var pending = false;

    function place() {
        var y = window.pageYOffset || document.documentElement.scrollTop || 0;
        var off = -((y * RATE) % PERIOD);
        var t = 'translate3d(0,' + off.toFixed(2) + 'px,0)';
        for (var i = 0; i < strips.length; i++) {
            strips[i].style.transform = t;
        }
        ticking = false;
    }

    function onScroll() {
        if (ticking) { return; }
        ticking = true;
        requestAnimationFrame(place);
    }

    /* Off below 1180px, where the layer is display:none and there is no
       margin to wash, and off for a reader who has asked for less
       movement — the CSS leaves the sidelines visible but still, which
       is the point of the setting. */
    function sync() {
        pending = false;

        var on = !slow.matches &&
            window.getComputedStyle(layer).display !== 'none';

        if (on && !bound) {
            window.addEventListener('scroll', onScroll, { passive: true });
            bound = true;
        } else if (!on && bound) {
            window.removeEventListener('scroll', onScroll);
            bound = false;
        }

        if (!on) {
            for (var i = 0; i < strips.length; i++) { strips[i].style.transform = ''; }
            return;
        }
        place();
    }

    function resync() {
        if (pending) { return; }
        pending = true;
        requestAnimationFrame(sync);
    }

    window.addEventListener('resize', resync, { passive: true });
    if (slow.addEventListener) { slow.addEventListener('change', resync); }
    else if (slow.addListener) { slow.addListener(resync); }

    sync();
})();
