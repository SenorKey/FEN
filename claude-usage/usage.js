/*
 * usage.js — paints the Claude session-window dial.
 *
 * Reads claude-usage/state.json, a mirror of ~/.claude/usage-state.json
 * rsynced up from the laptop. The original dashboard fetched /state from a
 * little node server; here the file is just a static asset Apache serves, so
 * the only real differences are the URL, a cache-buster, and the fact that
 * there's no server to stamp file_mtime — freshness leans on updated_at,
 * which the status line writes on every tick.
 */

(() => {
  const STATE_URL = '/claude-usage/state.json';
  const FIVE_HOURS = 5 * 60 * 60;
  const FRESH_FOR = 150; // sync runs every 60s; one missed turn isn't "stale"
  const R = 148;
  const CIRC = 2 * Math.PI * R;

  const el = (id) => document.getElementById(id);
  const dial = el('dial'), waiting = el('waiting'), footer = el('footer');
  const ring = el('remaining'), liquid = el('liquid'), meniscus = el('meniscus');
  const clock = el('clock'), consumed = el('consumed');

  ring.style.strokeDasharray = CIRC;
  ring.style.strokeDashoffset = CIRC;

  let state = null;

  async function poll() {
    try {
      const res = await fetch(`${STATE_URL}?t=${Date.now()}`, { cache: 'no-store' });
      // Before the first sync the file is a 404, which arrives as the site's
      // HTML error page — bail rather than feeding that to JSON.parse.
      if (res.ok) state = await res.json();
    } catch {
      // Network hiccup: keep showing what we have and let freshness age out.
    }
    paint();
  }

  function paint() {
    const session = state && state.five_hour;
    const week = state && state.seven_day;
    const have = Boolean(session || week);

    dial.hidden = !have;
    footer.hidden = !have;
    waiting.hidden = have;
    if (!have) return;

    if (session) {
      const pct = clamp(session.used_percentage, 0, 100);
      document.documentElement.style.setProperty('--signal', signalFor(pct));

      // The vessel fills from the bottom as the window is consumed.
      const top = 288 - (256 * pct) / 100;
      liquid.setAttribute('y', top);
      liquid.setAttribute('height', 288 - top);
      meniscus.setAttribute('y', top - 1);

      consumed.innerHTML = `<b>${Math.round(pct)}%</b> of this session used`;
    }

    // The countdown runs off resets_at alone, so it stays correct even once
    // the laptop is closed and the percentage freezes where it stood.
    tick();
    paintWeek(week);
    paintMeta();
  }

  function tick() {
    const session = state && state.five_hour;
    if (!session || !session.resets_at) return;

    const left = session.resets_at - now();

    if (left <= 0) {
      ring.style.strokeDashoffset = 0;
      clock.textContent = 'Window reset';
      clock.classList.add('spent');
      consumed.textContent = 'Next message sets the new figure';
      return;
    }

    clock.classList.remove('spent');
    clock.textContent = hms(left);
    ring.style.strokeDashoffset = CIRC * (1 - clamp(left / FIVE_HOURS, 0, 1));
  }

  function paintWeek(week) {
    if (!week) return;
    const pct = clamp(week.used_percentage, 0, 100);
    el('week-pct').textContent = Math.round(pct) + '%';
    el('week-fill').style.width = pct + '%';

    if (week.resets_at) {
      const left = week.resets_at - now();
      el('week-reset').textContent = left > 0
        ? `resets ${dayLabel(week.resets_at)}, ${coarse(left)} away`
        : 'window reset';
    }
  }

  function paintMeta() {
    el('model').textContent = state.model || '';

    const age = now() - (state.updated_at || 0);
    const node = el('freshness');
    if (age < FRESH_FOR) {
      node.textContent = 'live';
      node.classList.remove('stale');
    } else {
      node.textContent = `last seen ${coarse(age)} ago`;
      node.classList.add('stale');
    }
  }

  /* helpers */
  const now = () => Math.floor(Date.now() / 1000);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));

  function signalFor(pct) {
    if (pct >= 85) return 'var(--rust)';
    if (pct >= 60) return 'var(--amber)';
    return 'var(--jade)';
  }

  function hms(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  function coarse(s) {
    if (s >= 86400) return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
    if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
    if (s >= 60) return `${Math.floor(s / 60)}m`;
    return `${s}s`;
  }

  function dayLabel(epoch) {
    const d = new Date(epoch * 1000);
    return d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  }

  poll();
  setInterval(poll, 5000);
  setInterval(tick, 1000);
})();
