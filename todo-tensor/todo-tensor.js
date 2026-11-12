/* ToDo Tensor — ranks 0 to 3.

   Every idea is a node with a value from −1 to +1 for each parameter the
   list's owner has named (left pole … right pole), or no value yet. There is
   one scene and one camera; the rank only says how many of those values are
   drawn as axes:

     rank 0  no axes    every node in one point, which opens into a cluster
     rank 1  x          a line; nodes with no value wait in a tray below
     rank 2  x, y       the plane
     rank 3  x, y, z    the plane turns into a cube

   Nothing is rebuilt between ranks: nodes slide along one axis at a time,
   and the cube is a rotation of the plane, so each rank grows out of the
   last. The published list comes from list.json; once a visitor changes
   anything, their copy lives in this browser's localStorage. The address
   carries the rank and the focused idea, and can carry a whole arrangement
   (#data=…) so one can be shared without a server. */

(() => {
  'use strict';

  const STORE = 'todo-tensor:v2';
  const STORE_V1 = 'todo-tensor:v1';
  const SEED = '/todo-tensor/list.json';
  const MAX_RANK = 3;
  const NEW_TEXT = 'New idea';

  const FONT = '"Bricolage Grotesque", sans-serif';
  const FONT_LABEL = `13px ${FONT}`;
  const FONT_CAPS = `600 11px ${FONT}`;
  const CAPS_SPACING = '0.18em';

  // The picture
  const HUD_H = 56;          // px kept clear at the top for the rank line, and at the bottom at rank 0
  const TRAY_H = 112;        // px kept clear at the bottom for the tray, from rank 1 up
  const EDGE = 60;           // px the axes stay short of the two sides, in all
  const CLUSTER_PX = 34;     // least spacing between nodes in the opened cell
  const CLUSTER_MAX = 64;    // most
  const GOLDEN = 2.39996323; // the golden angle in radians: each node in the cluster turns this much further
  const SWARM_R = 5;         // px: half the distance two dots keep on the line
  const DOT = 3;             // px radius of a node
  const LABEL_MAX = 44;      // letters of an idea shown beside its dot
  const LABEL_MIN = 8;       // fewer letters than this say nothing, so no label at all
  const DIST = 2.4;          // camera distance, world units, once perspective is on
  const PERSP = 0.5;         // how much of that perspective the cube shows
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 1.6;
  const CUBE_VIEW = { yaw: -0.6, pitch: 0.4, zoom: 0.8 };
  const FACES = {
    xy: { yaw: 0, pitch: 0 },
    xz: { yaw: 0, pitch: -Math.PI / 2 },
    yz: { yaw: Math.PI / 2, pitch: 0 },
  };

  // The hand
  const HIT_CELL = 18;       // px: how near the closed point counts as on it
  const HIT_NODE = 11;       // px: how near a node counts as on it
  const DRAG_PX = 4;         // px moved before a press is a drag
  const ORBIT = 0.006;       // radians per px when turning the cube
  const PITCH_MAX = 1.55;    // radians: the cube never quite turns over
  const WHEEL = 0.0015;      // zoom per px of wheel
  const TAP_MS = 350;        // two taps on empty space this close together…
  const TAP_PX = 20;         // …and this near each other add an idea there

  const $ = (id) => document.getElementById(id);
  const space = document.querySelector('.tt-space');
  const scene = $('tt-scene');
  const canvas = $('tt-canvas');
  const ctx = canvas.getContext('2d');
  const rankBtns = [...document.querySelectorAll('.tt-rank-btn')];
  const rankWord = $('tt-rank-word');
  const facesBox = $('tt-faces');
  const faceBtns = [...facesBox.querySelectorAll('.tt-face')];
  const panelToggle = $('tt-panel-toggle');
  const tray = $('tt-tray');
  const trayLabel = $('tt-tray-label');
  const trayNodes = $('tt-tray-nodes');
  const card = $('tt-card');
  const paramsBox = $('tt-params');
  const paramRows = $('tt-param-rows');
  const paramsNote = $('tt-params-note');
  const paramAdd = $('tt-param-add');
  const list = $('tt-list');
  const form = $('tt-add');
  const input = $('tt-new');
  const count = $('tt-count');
  const empty = $('tt-empty');
  const status = $('tt-status');
  const live = $('tt-live');
  const toast = $('tt-toast');
  const toastMsg = $('tt-toast-msg');
  const undoBtn = $('tt-undo');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = window.matchMedia('(hover: none)');   // a finger, so no keyboard pops up uninvited

  const SAVED_NOTE = 'Your changes are saved in this browser only.';

  const state = { params: [], items: [] };
  let rank = 0;
  let open = false;        // rank 0: the cell has been opened into its cluster
  let focusId = null;
  let hoverId = null;      // a node id, or 'cell' over the closed point
  let face = null;         // 'xy' | 'xz' | 'yz' while the cube is seen square on
  let panelOpen = true;    // the panel starts open (shut on a phone, where it is a sheet over half the screen)
  let booting = true;      // while the page is being set up, every move is instant
  let shared = null;       // the #data= string while a shared arrangement is on show
  let toastTimer = 0;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const round3 = (v) => Math.round(v * 1000) / 1000;

  /* ── Data ── */

  const uid = () =>
    (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);

  const word = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 40) : '');

  // Accepts { params, items } (the v2 file), { items } or a bare array of
  // items (the v1 file, which only ever lived in this browser), and drops
  // anything malformed.
  function clean(raw) {
    const params = [];
    const seenP = new Set();
    for (const p of (raw && Array.isArray(raw.params)) ? raw.params : []) {
      if (!p || typeof p !== 'object') continue;
      const id = typeof p.id === 'string' && p.id ? p.id : 'p' + (params.length + 1);
      if (seenP.has(id)) continue;
      seenP.add(id);
      params.push({ id, left: word(p.left), right: word(p.right) });
    }

    const arr = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.items) ? raw.items : []);
    const seen = new Set();
    const items = [];
    for (const x of arr) {
      if (!x || typeof x.text !== 'string' || !x.text.trim()) continue;
      let id = typeof x.id === 'string' && x.id ? x.id : uid();
      if (seen.has(id)) id = uid();
      seen.add(id);
      const scores = {};
      if (x.scores && typeof x.scores === 'object' && !Array.isArray(x.scores)) {
        for (const k in x.scores) if (isNum(x.scores[k])) scores[k] = clamp(x.scores[k], -1, 1);
      }
      items.push({ id, text: x.text.trim().slice(0, 300), done: !!x.done, scores });
    }
    return { params, items };
  }

  function readLocal() {
    try {
      const s = localStorage.getItem(STORE) || localStorage.getItem(STORE_V1);
      return s ? clean(JSON.parse(s)) : null;
    } catch {
      return null;
    }
  }

  async function readSeed() {
    try {
      const r = await fetch(SEED, { cache: 'no-cache' });
      return r.ok ? clean(await r.json()) : clean(null);
    } catch {
      return clean(null);
    }
  }

  // Blank parameters at the tail (unnamed, holding no values) are left out,
  // so opening rank 3 just to look around leaves no trace in the saved copy.
  function payload() {
    const used = new Set();
    for (const it of state.items) for (const k in it.scores) used.add(k);
    const params = state.params.slice();
    while (params.length) {
      const p = params[params.length - 1];
      if (p.left || p.right || used.has(p.id)) break;
      params.pop();
    }
    return { version: 2, params, items: state.items };
  }

  const itemMap = new Map();   // id → item, rebuilt whenever the items change (syncNodes)
  const byId = (id) => itemMap.get(id);
  const indexOf = (id) => state.items.findIndex((i) => i.id === id);
  const shownParams = () => state.params.slice(0, rank);
  const isPlaced = (item) => shownParams().every((p) => isNum(item.scores[p.id]));

  // The parameter a control belongs to: a row in the panel or a slider in the list.
  const paramOf = (el) => {
    const host = el.closest('[data-param]');
    return host ? state.params.find((p) => p.id === host.dataset.param) : null;
  };

  function newParam() {
    let k = state.params.length + 1;
    while (state.params.some((p) => p.id === 'p' + k)) k++;
    return { id: 'p' + k, left: '', right: '' };
  }

  function ensureParams(n) {
    while (state.params.length < n) state.params.push(newParam());
  }

  /* ── The address ──
     #rank=2&idea=<id> opens the page there. #data=… carries a whole list, so
     a link can show an arrangement with no server behind it; the visitor's
     own saved list is left alone until they change something. */

  const b64url = (s) => {
    let bin = '';
    for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  const unb64url = (s) =>
    new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));

  const readHash = () => new URLSearchParams(location.hash.slice(1));

  function hashFor(data) {
    const q = new URLSearchParams();
    if (rank) q.set('rank', String(rank));
    if (focusId) q.set('idea', focusId);
    if (data) q.set('data', data);
    return q.toString();
  }

  function writeHash() {
    if (booting) return;
    const s = hashFor(shared);
    history.replaceState(null, '', location.pathname + location.search + (s ? '#' + s : ''));
  }

  const shareLink = () => location.origin + location.pathname + '#' + hashFor(b64url(JSON.stringify(payload())));

  /* ── Saving, and one step back ──
     Every save remembers the payload before it. Cmd/Ctrl+Z swaps the two, so
     pressing it again redoes. Typing a pole word is one change, not one per
     letter: saves that share a merge key keep the same step back. */

  let lastSaved = '';      // the payload as last written
  let undoJSON = null;     // the payload before the latest change
  let mergeKey = null;
  let undone = false;

  function persist() {
    lastSaved = JSON.stringify(payload());
    try {
      localStorage.setItem(STORE, lastSaved);
      status.textContent = SAVED_NOTE;
    } catch {
      status.textContent = 'This browser won’t save changes, so they will be gone when you leave.';
    }
    shared = null;
    writeHash();
  }

  function save(merge) {
    const prev = lastSaved;
    persist();
    if (lastSaved === prev) return;   // nothing changed
    if (!merge || merge !== mergeKey) undoJSON = prev;
    mergeKey = merge || null;
    undone = false;
  }

  function undo() {
    if (!undoJSON) { announce('Nothing to undo'); return; }
    let data;
    try { data = clean(JSON.parse(undoJSON)); } catch { undoJSON = null; return; }
    const cur = lastSaved;
    const before = state.params.length;
    Object.assign(state, data);
    undoJSON = cur;
    mergeKey = null;
    undone = !undone;
    persist();
    hideToast();
    // a parameter came or went: the rank follows it
    if (state.params.length !== before) {
      const r = Math.min(MAX_RANK, state.params.length);
      if (r !== rank) setRank(r);
    }
    ensureParams(rank);
    renderParams();
    render();
    if (focusId && !byId(focusId)) setFocus(null, true);
    relayout({ dur: 400 });
    announce(undone ? 'Undid the last change. Press again to redo it.' : 'Redone.');
  }

  /* ── Tweens: small timed steps that share one animation frame ──
     Each tween has a tag; a new one with the same tag replaces the old. The
     frame loop only paints when a tween moved or something asked for a
     paint, so a tween waiting out its delay costs nothing. */

  const tweens = new Map();
  let rafId = 0;
  let dirty = false;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const linear = (t) => t;

  function tween(o) {
    const instant = reduced.matches || booting;
    const tw = { ...o, t0: performance.now() + (instant ? 0 : o.delay || 0), dur: instant ? 0 : o.dur };
    tweens.set(o.tag, tw);
    schedule();
    return tw;
  }

  const cancel = (tag) => tweens.delete(tag);
  const running = (tag) => tweens.has(tag);

  function schedule() {
    if (!rafId) rafId = requestAnimationFrame(frame);
  }

  // Something other than a tween changed: paint on the next frame.
  function kick() {
    dirty = true;
    schedule();
  }

  function frame(now) {
    rafId = 0;
    let stepped = false;
    for (const tw of tweens.values()) {
      if (now < tw.t0) continue;
      const t = tw.dur > 0 ? Math.min(1, (now - tw.t0) / tw.dur) : 1;
      tw.step((tw.ease || easeOut)(t), t);
      stepped = true;
      if (t >= 1) {
        if (tweens.get(tw.tag) === tw) tweens.delete(tw.tag);
        if (tw.done) tw.done();
      }
    }
    if (stepped || dirty || drag) {
      dirty = false;
      draw();
    }
    if (tweens.size || drag) schedule();
  }

  /* ── Scene: the view, the camera, the nodes ── */

  const view = { w: 0, h: 0, cx: 0, cy: 0, S: 1, dpr: 1, avail: 0, bottom: HUD_H, trayRect: null };
  const cam = { yaw: 0, pitch: 0, persp: 0, zoom: 1 };
  const axisA = [0, 0, 0];   // how far each axis has faded in
  let labelMix = 1;          // labels fade out while nodes move, back in when they settle
  let pulse = -1;            // the one-time ring around the closed cell

  const nodes = new Map();   // id → node

  function syncNodes() {
    itemMap.clear();
    state.items.forEach((item, i) => {
      itemMap.set(item.id, item);
      let n = nodes.get(item.id);
      if (!n) {
        n = { id: item.id, item, i, pos: [0, 0, 0], from: [0, 0, 0], to: [0, 0, 0], alpha: 0, shown: false, tray: false, sx: 0, sy: 0, sz: 0, k: 1 };
        nodes.set(item.id, n);
      }
      n.item = item;
      n.i = i;
    });
    for (const id of nodes.keys()) if (!itemMap.has(id)) nodes.delete(id);
  }

  // World → camera space: turn around y (yaw), then around x (pitch).
  function rot([x, y, z]) {
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
  }

  function unrot([x1, y2, z2]) {
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const y = y2 * cp + z2 * sp, z1 = -y2 * sp + z2 * cp;
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    return [x1 * cy - z1 * sy, y, x1 * sy + z1 * cy];
  }

  const kOf = (z2) => 1 + cam.persp * (DIST / (DIST - z2) - 1);

  function project(p) {
    const [x1, y2, z2] = rot(p);
    const k = kOf(z2);
    return { x: view.cx + x1 * view.S * k, y: view.cy - y2 * view.S * k, z: z2, k };
  }

  // Screen → world, in the plane facing the camera at depth z2.
  function unproject(px, py, z2 = 0) {
    const k = kOf(z2);
    return unrot([(px - view.cx) / (view.S * k), (view.cy - py) / (view.S * k), z2]);
  }

  const axisPoint = (a, s) => [a === 0 ? s : 0, a === 1 ? s : 0, a === 2 ? s : 0];

  const scale = () => 0.42 * Math.min(view.w - EDGE, view.avail) * cam.zoom;

  // The picture is centred between what is kept clear above (the rank line)
  // and below: the tray from rank 1 up, the same as above at rank 0, so the
  // closed point sits dead centre.
  function layoutView() {
    view.avail = Math.max(120, view.h - HUD_H - view.bottom);
    view.cx = view.w / 2;
    view.cy = HUD_H + view.avail / 2;
    view.S = scale();
  }

  function reserveTo(px, dur) {
    const from = view.bottom;
    if (from === px) return;
    tween({
      tag: 'reserve', dur,
      step: (t) => { view.bottom = from + (px - from) * t; layoutView(); },
      done: retarget,
    });
  }

  // Where the tray is, measured once per change rather than once per frame.
  function measureTray() {
    if (tray.hidden) { view.trayRect = null; return; }
    const t = tray.getBoundingClientRect(), s = scene.getBoundingClientRect();
    view.trayRect = { x: t.left - s.left, y: t.top - s.top - 6, w: t.width, h: t.height + 6 };
  }

  function resize() {
    const r = scene.getBoundingClientRect();
    if (!r.width || !r.height) return;
    view.w = r.width;
    view.h = r.height;
    view.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(view.w * view.dpr);
    canvas.height = Math.round(view.h * view.dpr);
    layoutView();
    measureTray();
    cardKey = null;
    retarget();
    draw();
  }

  /* ── Layout: where every node belongs at this rank ── */

  // The accurate-beeswarm idea: each value stays exact along the line, and a
  // dot that would overlap one already placed moves sideways by the least
  // that frees it.
  function swarm(xs, r) {
    const order = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
    const placed = [];
    const ys = new Array(xs.length).fill(0);
    const d2 = 4 * r * r;
    for (const i of order) {
      const x = xs[i];
      const cands = [0];
      for (const p of placed) {
        const dx = x - p.x;
        if (dx * dx < d2) {
          const h = Math.sqrt(d2 - dx * dx);
          cands.push(p.y + h, p.y - h);
        }
      }
      cands.sort((a, b) => Math.abs(a) - Math.abs(b));
      let y = 0;
      for (const c of cands) {
        if (placed.every((p) => (x - p.x) ** 2 + (c - p.y) ** 2 >= d2 - 1e-6)) { y = c; break; }
      }
      placed.push({ x, y });
      ys[i] = y;
    }
    return ys;
  }

  function targets() {
    const out = new Map();
    if (rank === 0) {
      const n = state.items.length;
      // a sunflower spiral: evenly packed, no physics needed. A short list
      // spreads wide enough for its labels, a long one packs tighter, and
      // the outer ring always stays inside the picture.
      let gap = clamp(420 / Math.sqrt(n + 1), CLUSTER_PX, CLUSTER_MAX);
      if (n > 1) gap = Math.max(10, Math.min(gap, (Math.min(view.avail, view.w - EDGE) / 2 - 40) / Math.sqrt(n - 1)));
      state.items.forEach((it, i) => {
        let to = [0, 0, 0];
        if (open) {
          const r = (gap * Math.sqrt(i)) / view.S;
          const a = i * GOLDEN;
          to = [r * Math.cos(a), r * Math.sin(a), 0];
        }
        out.set(it.id, { to, tray: false });
      });
      return out;
    }
    const ps = shownParams();
    const placed = state.items.filter(isPlaced);
    const ys = rank === 1 ? swarm(placed.map((it) => it.scores[ps[0].id] * view.S), SWARM_R) : null;
    placed.forEach((it, i) => {
      out.set(it.id, {
        to: [
          it.scores[ps[0].id],
          rank >= 2 ? it.scores[ps[1].id] : ys[i] / view.S,
          rank >= 3 ? it.scores[ps[2].id] : 0,
        ],
        tray: false,
      });
    });
    for (const it of state.items) if (!out.has(it.id)) out.set(it.id, { to: null, tray: true });
    return out;
  }

  function fadeNode(n, to) {
    const from = n.alpha;
    if (from === to) return;
    tween({ tag: 'a:' + n.id, dur: 400, step: (t) => { n.alpha = from + (to - from) * t; } });
  }

  // win: for each axis, the slice of the move during which it travels.
  function relayout({ instant = false, dur = 600, delay = 0, win = [[0, 1], [0, 1], [0, 1]] } = {}) {
    syncNodes();
    const tg = targets();
    for (const [id, n] of nodes) {
      const t = tg.get(id);
      n.tray = t.tray;
      if (n.tray) {
        if (n.shown) { n.shown = false; fadeNode(n, 0); }
        continue;
      }
      n.to = t.to;
      if (!n.shown) {
        n.shown = true;
        n.pos = t.to.slice();
        fadeNode(n, 1);
      }
      n.from = n.pos.slice();
    }
    cancel('motion');
    cancel('glide');
    cancel('label');
    if (instant || reduced.matches || booting) {
      for (const n of nodes.values()) if (n.shown) n.pos = n.to.slice();
      labelMix = 1;
    } else {
      tween({
        tag: 'motion', dur, delay, ease: linear,
        step: (t) => {
          for (const n of nodes.values()) {
            if (!n.shown) continue;
            for (let a = 0; a < 3; a++) {
              const [s, e] = win[a];
              const u = e > s ? clamp((t - s) / (e - s), 0, 1) : 1;
              n.pos[a] = n.from[a] + (n.to[a] - n.from[a]) * easeOut(u);
            }
          }
        },
      });
      tween({
        tag: 'label', dur, delay, ease: linear,
        step: (t) => { labelMix = t < 0.15 ? 1 - t / 0.15 : t < 0.75 ? 0 : (t - 0.75) / 0.25; },
      });
    }
    renderTray();
    kick();
  }

  // On resize only the pixel-based parts of the layout change (the cluster
  // spacing, the swarm), so the goals move but a move in flight is kept.
  function retarget() {
    const tg = targets();
    const moving = running('motion');
    for (const [id, n] of nodes) {
      const t = tg.get(id);
      if (!t || t.tray || !n.shown) continue;
      n.to = t.to;
      if (!moving) n.pos = t.to.slice();
    }
    kick();
  }

  /* ── Drawing ── */

  const widths = new Map();   // text → px, measured once per font

  function setFont(capsFont) {
    ctx.font = capsFont ? FONT_CAPS : FONT_LABEL;
    ctx.letterSpacing = capsFont ? CAPS_SPACING : '0px';
  }

  function textW(s, capsFont = false) {
    const key = (capsFont ? 'c|' : 'l|') + s;
    let w = widths.get(key);
    if (w === undefined) {
      setFont(capsFont);
      w = ctx.measureText(s).width;
      widths.set(key, w);
    }
    return w;
  }

  const labelOf = (text) => (text.length > LABEL_MAX ? text.slice(0, LABEL_MAX - 1).trimEnd() + '…' : text);
  const fmt = (v) => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(2);

  let drawn = [];   // nodes in the order they were painted, far to near

  function draw() {
    const { w, h, dpr } = view;
    if (!w) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';

    // axes
    for (let a = 0; a < 3; a++) {
      if (axisA[a] < 0.01) continue;
      const p = project(axisPoint(a, -1)), q = project(axisPoint(a, 1));
      ctx.globalAlpha = 0.16 * axisA[a];
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }

    // nodes, projected and sorted far to near
    drawn = [];
    for (const n of nodes.values()) {
      if (n.alpha < 0.01 && !n.shown) continue;
      const p = project(n.pos);
      n.sx = p.x; n.sy = p.y; n.sz = p.z; n.k = p.k;
      drawn.push(n);
    }
    drawn.sort((a, b) => a.sz - b.sz);

    const closed = rank === 0 && !open && !running('motion');
    const dimOthers = !!focusId;
    const poles = polePositions();

    if (closed) {
      // every node is in the same place: one point
      ctx.globalAlpha = 1;
      dot(view.cx, view.cy, DOT, false);
      if (pulse >= 0) {
        ctx.globalAlpha = (1 - pulse) * 0.34;
        ring(view.cx, view.cy, DOT + pulse * 26);
      }
      if (hoverId === 'cell') {
        ctx.globalAlpha = 0.34;
        caps(`${state.items.length} ${state.items.length === 1 ? 'idea' : 'ideas'}`, view.cx, view.cy + 20, 'center', 'top');
      }
    } else {
      const key = hoverId && hoverId !== 'cell' ? hoverId : focusId;
      if (rank === 3 && key) {
        const n = nodes.get(key);
        if (n && n.shown) dropLines(n);
      }
      for (const n of drawn) {
        const isKey = n.id === focusId || n.id === hoverId || (drag && drag.id === n.id);
        ctx.globalAlpha = n.alpha * (dimOthers && !isKey ? 0.34 : 1);
        const r = DOT * (rank === 3 ? Math.max(0.5, n.k) : 1);
        if (n.id === focusId) {
          dot(n.sx, n.sy, r + 1.5, n.item.done);
          ctx.globalAlpha = n.alpha * 0.34;
          ring(n.sx, n.sy, r + 6);
        } else {
          dot(n.sx, n.sy, n.id === hoverId ? r + 1 : r, n.item.done);   // the hovered one swells a little
        }
      }
      drawLabels(dimOthers, poles);
    }

    drawPoles(poles);

    // a node on the move: the ghost of one carried out of the tray, and
    // under either kind, the values it will take where it is now
    if (drag && drag.moved && (drag.kind === 'tray' || drag.kind === 'node')) {
      let at = null, pos = null;
      if (drag.kind === 'tray') {
        const item = byId(drag.id);
        ctx.globalAlpha = 1;
        dot(drag.x, drag.y, DOT, item && item.done);
        if (item) {
          ctx.globalAlpha = 0.6;
          setFont(false);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(labelOf(item.text), drag.x + 10, drag.y);
        }
        at = { x: drag.x, y: drag.y };
        pos = unproject(drag.x, drag.y, 0);
      } else {
        const n = nodes.get(drag.id);
        if (n) { at = { x: n.sx, y: n.sy }; pos = n.pos; }
      }
      if (at) readout(at.x, at.y, pos);
    }

    ctx.globalAlpha = 1;
    if (!card.hidden) positionCard();
  }

  // The values a carried node is about to take, faint, under its label.
  function readout(x, y, pos) {
    const parts = [];
    shownParams().forEach((p, a) => { if (!(rank === 1 && a > 0)) parts.push(fmt(clamp(pos[a], -1, 1))); });
    if (!parts.length) return;
    ctx.globalAlpha = 0.34;
    setFont(true);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(parts.join('   '), x + 10, y + 9);
    ctx.letterSpacing = '0px';
  }

  function dot(x, y, r, hollow) {
    ctx.beginPath();
    ctx.arc(x, y, hollow ? r - 0.5 : r, 0, Math.PI * 2);
    if (hollow) ctx.stroke(); else ctx.fill();
  }

  function ring(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Small capitals, letter-spaced: the pole words, the count on the closed point.
  function caps(text, x, y, align, baseline) {
    setFont(true);
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(text.toUpperCase(), x, y);
    ctx.letterSpacing = '0px';
  }

  // Depth cues for one node only: its lines down to the three axis planes,
  // and its shadows where they land. The rest of the picture stays empty.
  function dropLines(n) {
    const [x, y, z] = n.pos;
    const feet = [[x, y, 0], [x, 0, z], [0, y, z]];
    for (const f of feet) {
      const p = project(f);
      ctx.globalAlpha = n.alpha * 0.16;
      ctx.beginPath();
      ctx.moveTo(n.sx, n.sy);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.globalAlpha = n.alpha * 0.34;
      dot(p.x, p.y, 2, false);
    }
  }

  // Semantic zoom by hand: a label is drawn only where it has room, on
  // whichever side of its dot has more, cut short when neither side can
  // hold all of it. The focused, hovered and carried nodes always get
  // theirs; the rest take turns in list order, and a hidden one shows up
  // on hover.
  function drawLabels(dimOthers, poles) {
    if (labelMix < 0.01) return;
    const order = drawn.slice().sort((a, b) => prio(a) - prio(b));
    const fixed = poles.map((p) => p.rect);
    fixed.push({ x: 0, y: 0, w: view.w, h: HUD_H });                               // the rank line
    if (!(window.innerWidth <= 760 && view.trayRect)) fixed.push({ x: 0, y: view.h - 44, w: 130, h: 44 });   // the name
    if (view.trayRect) fixed.push(view.trayRect);
    const rects = fixed.slice();
    // room on one side of a dot, stopping short of anything fixed in its row
    const roomTo = (n, side) => {
      let room = side === 'right' ? view.w - 12 - (n.sx + 10) : n.sx - 10 - 12;
      for (const o of fixed) {
        if (o.y > n.sy + 8 || o.y + o.h < n.sy - 8) continue;
        if (side === 'right' && o.x > n.sx) room = Math.min(room, o.x - 6 - (n.sx + 10));
        if (side === 'left' && o.x + o.w < n.sx) room = Math.min(room, n.sx - 10 - (o.x + o.w + 6));
      }
      return room;
    };
    setFont(false);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (const n of order) {
      if (!n.shown || n.alpha < 0.5) continue;
      if (n.id === focusId && !card.hidden) continue;   // the card carries its words
      const must = n.id === focusId || n.id === hoverId || (drag && drag.kind === 'node' && drag.id === n.id);
      // dots stand alone at every rank: a label shows only for the one pointed at (or being carried)
      if (n.id !== hoverId && !(drag && drag.kind === 'node' && drag.id === n.id)) continue;
      if (rank === 1) {
        // above the line, centred on its dot, so it never runs along the line over the other dots
        const t = fit(labelOf(n.item.text), view.w - 24);
        if (!t) continue;
        const tw = textW(t);
        const x = clamp(n.sx - tw / 2, 12, view.w - 12 - tw);
        ctx.globalAlpha = labelMix * n.alpha * (n.item.done ? 0.7 : 1);
        ctx.fillText(t, x, n.sy - 18);
        continue;
      }
      const full = labelOf(n.item.text);
      // a label stops short of the fixed words; a focused or hovered one may
      // run over them, but only when neither side holds all of it
      const fw = textW(full);
      const cutR = roomTo(n, 'right'), cutL = roomTo(n, 'left');
      const roomR = must && fw > cutR ? view.w - 12 - (n.sx + 10) : cutR;
      const roomL = must && fw > cutL ? n.sx - 10 - 12 : cutL;
      let pick = null;
      for (const side of (roomR >= roomL ? ['right', 'left'] : ['left', 'right'])) {
        const room = side === 'right' ? roomR : roomL;
        if (room < 40) continue;
        const s = fit(full, room);
        if (!s) continue;
        const tw = textW(s);
        const x = side === 'right' ? n.sx + 10 : n.sx - 10 - tw;
        const r = { x, y: n.sy - 8, w: tw, h: 16 };
        const blocked = rects.some((o) => overlap(r, o))
          || drawn.some((o) => o !== n && o.shown && o.sx > r.x - 5 && o.sx < r.x + r.w + 5 && o.sy > r.y - 5 && o.sy < r.y + r.h + 5);
        if (!blocked) { pick = { s, x, r }; break; }
        if (must && !pick) pick = { s, x, r };
      }
      if (!pick) continue;
      rects.push(pick.r);
      ctx.globalAlpha = labelMix * n.alpha * (must ? 1 : dimOthers ? 0.34 : 0.6) * (n.item.done ? 0.7 : 1);
      ctx.fillText(pick.s, pick.x, n.sy);
    }
  }

  const prio = (n) => (n.id === focusId ? -2 : n.id === hoverId ? -1 : n.i);
  const overlap = (a, b) => a.x < b.x + b.w + 6 && a.x + a.w + 6 > b.x && a.y < b.y + b.h + 2 && a.y + a.h + 2 > b.y;

  const fitCache = new Map();

  // The longest start of s, with an ellipsis, that fits the room. Cached by
  // 8px steps of room, and fitted to the step's floor so nothing overruns.
  function fit(s, room) {
    if (textW(s) <= room) return s;
    const bucket = Math.floor(room / 8) * 8;
    const key = s + '|' + bucket;
    let out = fitCache.get(key);
    if (out !== undefined) return out;
    let lo = 0, hi = s.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (textW(s.slice(0, mid).trimEnd() + '…') <= bucket) lo = mid; else hi = mid - 1;
    }
    out = lo >= LABEL_MIN ? s.slice(0, lo).trimEnd() + '…' : '';
    fitCache.set(key, out);
    return out;
  }

  // The pole words sit just past each axis end, on the side the axis points
  // to; in the cube they face the camera wherever it turns. None is let run
  // off the sides of the picture.
  function polePositions() {
    const out = [];
    for (let a = 0; a < 3; a++) {
      const p = state.params[a];
      if (axisA[a] < 0.01 || !p) continue;
      for (const s of [-1, 1]) {
        const text = (s < 0 ? p.left : p.right).toUpperCase();
        if (!text) continue;
        const e = project(axisPoint(a, s)), f = project(axisPoint(a, s * 1.3));
        let dx = f.x - e.x, dy = f.y - e.y;
        const len = Math.hypot(dx, dy);
        if (len < 1) continue;   // this axis points straight at the camera
        dx /= len; dy /= len;
        const horiz = Math.abs(dx) > Math.abs(dy);
        const align = horiz ? (dx > 0 ? 'left' : 'right') : 'center';
        const baseline = horiz ? 'middle' : (dy > 0 ? 'top' : 'alphabetic');
        let x = e.x + dx * 14;
        const y = e.y + dy * 14;
        const w = textW(text, true);
        const rect = {
          x: align === 'left' ? x : align === 'right' ? x - w : x - w / 2,
          y: baseline === 'middle' ? y - 6 : baseline === 'top' ? y : y - 11,
          w, h: 12,
        };
        const shift = rect.x < 12 ? 12 - rect.x : rect.x + w > view.w - 12 ? view.w - 12 - (rect.x + w) : 0;
        rect.x += shift;
        x += shift;
        out.push({ text, x, y, align, baseline, alpha: 0.34 * axisA[a], rect });
      }
    }
    return out;
  }

  function drawPoles(poles) {
    for (const p of poles) {
      ctx.globalAlpha = p.alpha;
      caps(p.text, p.x, p.y, p.align, p.baseline);
    }
  }

  /* ── Camera ── */

  function camTo(to, dur, delay = 0, done) {
    const from = { yaw: cam.yaw, pitch: cam.pitch, zoom: cam.zoom };
    let dyaw = (to.yaw ?? from.yaw) - from.yaw;
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));   // the short way round
    const dpitch = (to.pitch ?? from.pitch) - from.pitch;
    const dzoom = (to.zoom ?? from.zoom) - from.zoom;
    tween({
      tag: 'cam', dur, delay, ease: easeInOut,
      step: (t) => {
        cam.yaw = from.yaw + dyaw * t;
        cam.pitch = from.pitch + dpitch * t;
        if (dzoom) { cam.zoom = from.zoom + dzoom * t; view.S = scale(); }
      },
      done,
    });
  }

  function perspTo(to, dur, delay = 0) {
    const from = cam.persp;
    tween({ tag: 'persp', dur, delay, step: (t) => { cam.persp = from + (to - from) * t; } });
  }

  function axisTo(a, to, dur, delay = 0) {
    const from = axisA[a];
    if (from === to) return;
    tween({ tag: 'axis' + a, dur, delay, step: (t) => { axisA[a] = from + (to - from) * t; } });
  }

  // Pressing a face turns the cube square on to it; pressing it again also
  // brings the zoom back.
  function setFace(f) {
    const again = f && f === face;
    face = f;
    faceBtns.forEach((b) => b.classList.toggle('is-on', b.dataset.face === f));
    document.body.classList.toggle('tt-free', rank === 3 && !face);
    if (f) camTo(again ? { ...FACES[f], zoom: CUBE_VIEW.zoom } : FACES[f], 700);
  }

  // The wheel, or two fingers, zoom the cube. While the camera is on its
  // way somewhere the zoom waits.
  function zoomBy(factor) {
    if (rank !== 3 || running('cam')) return;
    cam.zoom = clamp(cam.zoom * factor, ZOOM_MIN, ZOOM_MAX);
    layoutView();
    kick();
  }

  canvas.addEventListener('wheel', (e) => {
    if (rank !== 3) return;
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    zoomBy(Math.exp(-dy * WHEEL));
  }, { passive: false });

  /* ── Ranks ── */

  const RANK_NOTE = [
    'Rank 0. Every idea in one point. Click the point to open it.',
    'Rank 1. Name both ends of the parameter in the panel, then drag ideas from the tray onto the line.',
    'Rank 2. A second parameter crosses the first. Dropping an idea on the plane sets both values.',
    'Rank 3. The plane turns into a cube. Drag the empty space to turn it, scroll to zoom, or pick a face.',
  ];

  function setRank(r) {
    r = clamp(r, 0, MAX_RANK);
    if (r === rank) return;
    const prev = rank;
    rank = r;
    ensureParams(r);
    setFocus(null, true);
    if (r === 0) open = false;

    // stage the move so the eye can follow: one axis at a time, and the cube
    // is a turn of the plane, not a flight of points
    let dur = 600, delay = 0, win = [[0, 1], [0, 1], [0, 1]];
    if (prev === 0 && r === 1) { dur = 800; win = [[0, 0.65], [0.45, 1], [0.45, 1]]; }
    else if (prev === 2 && r === 3) { delay = 1000; }
    else if (r > prev + 1 || r < prev - 1) { dur = 800; }

    reserveTo(r === 0 ? HUD_H : TRAY_H, dur);
    for (let a = 0; a < 3; a++) axisTo(a, a < r ? 1 : 0, 350, a < r && a >= prev ? delay : 0);

    if (r === 3 && prev !== 3) {
      camTo(CUBE_VIEW, 1000);
      perspTo(PERSP, 600, delay + dur);
      setFace(null);
    } else if (prev === 3) {
      perspTo(0, 300);
      camTo({ yaw: 0, pitch: 0, zoom: 1 }, 1000, r === 2 ? dur : 0);
      setFace(null);
    }

    relayout({ dur, delay, win });

    rankBtns.forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.rank === r)));
    rankWord.textContent = `Rank ${r}`;
    facesBox.hidden = r !== 3;
    canvas.setAttribute('aria-label', `Rank ${r}: ideas drawn as nodes${r ? ` along ${r} ${r === 1 ? 'parameter' : 'parameters'}` : ' in one point'}. The same ideas are listed in the panel.`);
    renderParams();
    render();
    if (r > 0 && !panelOpen) setPanel(true);
    if (r > prev && !coarse.matches && !booting) {
      const blank = paramRows.querySelector('.tt-param:not(.is-hidden) .tt-pole[data-side="left"]:placeholder-shown');
      if (blank) blank.focus({ preventScroll: true });
    }
    writeHash();
    if (!booting) announce(RANK_NOTE[r]);
  }

  function bloom() {
    open = true;
    relayout({ dur: 700 });
    announce(`${state.items.length} ideas. Click one to open it, or the empty space to close the point.`);
  }

  function collapse() {
    setFocus(null, true);
    open = false;
    relayout({ dur: 500 });
  }

  /* ── Focus and the card ── */

  function setFocus(id, quiet) {
    if (id === focusId) return;
    focusId = id;
    for (const el of document.querySelectorAll('.tt-item.is-focus, .tt-tray-node.is-focus')) el.classList.remove('is-focus');
    if (id) {
      for (const el of document.querySelectorAll(`.tt-list [data-id="${CSS.escape(id)}"], .tt-tray-node[data-id="${CSS.escape(id)}"]`)) el.classList.add('is-focus');
      const row = list.querySelector(`[data-id="${CSS.escape(id)}"]`);
      if (row && panelOpen) row.scrollIntoView({ block: 'nearest', behavior: reduced.matches ? 'auto' : 'smooth' });
    }
    renderCard();
    writeHash();
    if (!quiet && id) {
      const item = byId(id);
      if (item) announce(item.text);
    }
    kick();
  }

  function renderCard() {
    const item = focusId && byId(focusId);
    cardKey = null;
    if (!item) { card.hidden = true; card.textContent = ''; return; }
    card.textContent = '';
    card.append(row(item, true));
    card.hidden = false;
    positionCard();
  }

  let cardKey = null;   // where the card was last put, so a still picture costs no layout

  function positionCard() {
    const n = nodes.get(focusId);
    if (!n) return;
    const key = n.tray ? 'tray' : `${n.sx},${n.sy}`;
    if (key === cardKey) return;
    cardKey = key;
    let ax, ay;
    if (n.tray) {
      const el = trayNodes.querySelector(`[data-id="${CSS.escape(n.id)}"]`);
      if (!el) return;
      const r = el.getBoundingClientRect(), s = scene.getBoundingClientRect();
      ax = r.left + r.width / 2 - s.left;
      ay = r.top - s.top - 10 - card.offsetHeight;
    } else {
      ax = n.sx;
      ay = n.sy;
    }
    const cw = card.offsetWidth, ch = card.offsetHeight;
    let x = n.tray ? ax - cw / 2 : ax + 16;
    let y = n.tray ? ay : ay - 18;
    if (!n.tray && x + cw > view.w - 12) x = ax - 16 - cw;
    x = clamp(x, 12, Math.max(12, view.w - cw - 12));
    y = clamp(y, 12, Math.max(12, view.h - ch - 12));
    card.style.setProperty('--x', `${Math.round(x)}px`);
    card.style.setProperty('--y', `${Math.round(y)}px`);
  }

  /* ── Hover: a dot and its row light up together ── */

  function setHover(id) {
    canvas.style.cursor = id ? 'pointer' : (rank === 3 ? 'grab' : '');
    if (id === hoverId) return;
    hoverId = id;
    for (const el of list.querySelectorAll('.is-hover')) el.classList.remove('is-hover');
    if (id && id !== 'cell') {
      const row = list.querySelector(`[data-id="${CSS.escape(id)}"]`);
      if (row) row.classList.add('is-hover');
    }
    kick();
  }

  list.addEventListener('pointerover', (e) => {
    if (rowDrag) return;
    const row = e.target.closest('.tt-item');
    if (row) setHover(row.dataset.id);
  });
  list.addEventListener('pointerleave', () => { if (!rowDrag) setHover(null); });
  list.addEventListener('focusin', (e) => {
    const row = e.target.closest('.tt-item');
    if (row) setHover(row.dataset.id);
  });
  list.addEventListener('focusout', (e) => {
    if (!list.contains(e.relatedTarget)) setHover(null);
  });

  /* ── Pointer work on the scene ── */

  let drag = null;
  const pointers = new Map();   // pointerId → {x, y} of every finger on the scene, for the pinch
  let lastTap = null;           // the last tap on empty space: two in a row add an idea there

  const scenePoint = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const pinchSpan = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  function hit(x, y) {
    for (let i = drawn.length - 1; i >= 0; i--) {
      const n = drawn[i];
      if (n.shown && Math.hypot(n.sx - x, n.sy - y) <= HIT_NODE) return n;
    }
    return null;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const { x, y } = scenePoint(e);
    pointers.set(e.pointerId, { x, y });
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
    if (pointers.size === 2 && rank === 3 && (!drag || drag.kind !== 'tray')) {
      // a second finger: whatever the first was doing becomes a pinch
      if (drag && drag.kind === 'node' && drag.moved) relayout({ dur: 200 });
      cancel('cam');
      drag = { kind: 'pinch', d0: pinchSpan(), z0: cam.zoom, moved: true };
      kick();
      return;
    }
    if (drag) return;
    const closed = rank === 0 && !open;
    if (closed) {
      drag = { kind: 'cell', pid: e.pointerId, inside: Math.hypot(x - view.cx, y - view.cy) <= HIT_CELL };
    } else {
      const n = hit(x, y);
      if (n && rank > 0) drag = { kind: 'node', pid: e.pointerId, id: n.id, x0: x, y0: y, z2: n.sz, moved: false };
      else if (n) drag = { kind: 'pick', pid: e.pointerId, id: n.id };
      else if (rank === 3) drag = { kind: 'orbit', pid: e.pointerId, x0: x, y0: y, yaw: cam.yaw, pitch: cam.pitch, moved: false };
      else drag = { kind: 'bg', pid: e.pointerId };
    }
    kick();
  });

  canvas.addEventListener('pointermove', (e) => {
    const { x, y } = scenePoint(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x, y });
    if (!drag) {
      if (rank === 0 && !open) setHover(Math.hypot(x - view.cx, y - view.cy) <= HIT_CELL ? 'cell' : null);
      else { const n = hit(x, y); setHover(n ? n.id : null); }
      return;
    }
    if (drag.kind === 'pinch') {
      if (pointers.size === 2) {
        cam.zoom = clamp(drag.z0 * pinchSpan() / drag.d0, ZOOM_MIN, ZOOM_MAX);
        layoutView();
      }
      kick();
      return;
    }
    if (e.pointerId !== drag.pid) return;
    if (drag.kind === 'node') {
      if (!drag.moved && Math.hypot(x - drag.x0, y - drag.y0) < DRAG_PX) return;
      drag.moved = true;
      const n = nodes.get(drag.id);
      const p = unproject(x, y, drag.z2).map((v) => clamp(v, -1, 1));
      if (rank === 1) p[1] = n.pos[1];   // on the line, the swarm offset is not a value
      if (rank <= 2) p[2] = 0;
      n.pos = p;
      canvas.style.cursor = 'grabbing';
    } else if (drag.kind === 'orbit') {
      if (!drag.moved && Math.hypot(x - drag.x0, y - drag.y0) < DRAG_PX) return;
      drag.moved = true;
      cancel('cam');
      cam.yaw = drag.yaw + (x - drag.x0) * ORBIT;
      cam.pitch = clamp(drag.pitch + (y - drag.y0) * ORBIT, -PITCH_MAX, PITCH_MAX);
      if (face) setFace(null);
      canvas.style.cursor = 'grabbing';
    }
    kick();
  });

  function endScenePointer(e) {
    pointers.delete(e.pointerId);
    if (!drag || drag.kind === 'tray') return;
    if (drag.kind === 'pinch') {
      if (pointers.size < 2) drag = null;
      kick();
      return;
    }
    if (e.pointerId !== drag.pid) return;
    const d = drag;
    drag = null;
    canvas.style.cursor = '';
    if (e.type === 'pointercancel') {
      if (d.kind === 'node' && d.moved) relayout({ dur: 200 });   // back to where its values put it
      kick();
      return;
    }
    const { x, y } = scenePoint(e);
    if (d.kind === 'cell') {
      if (d.inside) bloom();
    } else if (d.kind === 'pick') {
      setFocus(focusId === d.id ? null : d.id);
    } else if (d.kind === 'node') {
      if (d.moved) commitPos(nodes.get(d.id));
      else setFocus(focusId === d.id ? null : d.id);
    } else if (!d.moved) {
      // empty space: one tap closes what is open; two in a row add an idea here
      const now = performance.now();
      if (rank > 0 && lastTap && now - lastTap.t < TAP_MS && Math.hypot(x - lastTap.x, y - lastTap.y) < TAP_PX) {
        lastTap = null;
        addAt(x, y);
      } else {
        lastTap = { t: now, x, y };
        if (focusId) setFocus(null, true);
        else if (rank === 0 && open) collapse();
      }
    }
    kick();
  }

  canvas.addEventListener('pointerup', endScenePointer);
  canvas.addEventListener('pointercancel', endScenePointer);
  canvas.addEventListener('pointerleave', () => { if (!drag) setHover(null); });

  // Where a node was dropped is its value on each shown parameter.
  function commitPos(n) {
    const item = n && byId(n.id);
    if (!item) return;
    shownParams().forEach((p, a) => {
      if (rank === 1 && a > 0) return;
      item.scores[p.id] = round3(clamp(n.pos[a], -1, 1));
    });
    commit({ dur: 350 });
    announce(`Placed “${item.text}”`);
  }

  // Two taps on empty space put a new idea there, with the values that spot
  // means, and open its card to be written.
  function addAt(x, y) {
    const pos = unproject(x, y, 0).map((v) => clamp(v, -1, 1));
    if (rank <= 2) pos[2] = 0;
    const item = { id: uid(), text: NEW_TEXT, done: false, scores: {} };
    shownParams().forEach((p, a) => { if (!(rank === 1 && a > 0)) item.scores[p.id] = round3(pos[a]); });
    state.items.unshift(item);
    commit({ dur: 400 });
    setFocus(item.id, true);
    const btn = card.querySelector('.tt-text');
    if (btn) startEdit(btn.closest('.tt-item'), true);
    announce('A new idea, placed here. Type what it is.');
  }

  /* ── Tray ── */

  function renderTray() {
    const waiting = state.items.filter((it) => { const n = nodes.get(it.id); return n && n.tray; });
    tray.hidden = rank === 0 || waiting.length === 0;
    scene.classList.toggle('has-tray', !tray.hidden);
    document.body.classList.toggle('tt-has-tray', !tray.hidden);
    trayLabel.textContent = `unplaced · ${waiting.length}`;
    trayNodes.textContent = '';
    for (const it of waiting) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tt-tray-node' + (it.done ? ' is-done' : '') + (it.id === focusId ? ' is-focus' : '');
      b.dataset.id = it.id;
      b.title = it.text;
      const d = document.createElement('span');
      d.className = 'tt-dot';
      const t = document.createElement('span');
      t.className = 'tt-tray-text';
      t.textContent = it.text;
      b.append(d, t);
      trayNodes.append(b);
    }
    measureTray();
    cardKey = null;
  }

  trayNodes.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.tt-tray-node');
    if (!el || drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const { x, y } = scenePoint(e);
    drag = { kind: 'tray', id: el.dataset.id, el, x0: x, y0: y, x, y, moved: false };
    el.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  trayNodes.addEventListener('pointermove', (e) => {
    if (!drag || drag.kind !== 'tray') return;
    const { x, y } = scenePoint(e);
    drag.x = x; drag.y = y;
    if (!drag.moved) {
      const dx = x - drag.x0, dy = y - drag.y0;
      if (Math.hypot(dx, dy) < DRAG_PX) return;
      // a finger moving sideways is scrolling the tray; the browser takes it from here
      if (e.pointerType !== 'mouse' && Math.abs(dx) > Math.abs(dy)) return;
      drag.moved = true;
      drag.el.classList.add('is-lifted');
      document.body.classList.add('tt-dragging');
    }
    kick();
  });

  function endTrayPointer(e) {
    if (!drag || drag.kind !== 'tray') return;
    const d = drag;
    drag = null;
    document.body.classList.remove('tt-dragging');
    d.el.classList.remove('is-lifted');
    if (e.type === 'pointercancel') { kick(); return; }
    if (!d.moved) { setFocus(focusId === d.id ? null : d.id); return; }
    const t = tray.getBoundingClientRect(), s = scene.getBoundingClientRect();
    const overTray = e.clientX >= t.left && e.clientX <= t.right && e.clientY >= t.top - 8 && e.clientY <= t.bottom;
    const inScene = e.clientX >= s.left && e.clientX <= s.right && e.clientY >= s.top && e.clientY <= s.bottom;
    if (!inScene || overTray) { kick(); return; }
    const n = nodes.get(d.id);
    if (!n) return;
    n.pos = unproject(d.x, d.y, 0).map((v) => clamp(v, -1, 1));
    if (rank <= 2) n.pos[2] = 0;
    n.shown = true;
    n.alpha = 1;
    n.tray = false;
    commitPos(n);
  }

  trayNodes.addEventListener('pointerup', endTrayPointer);
  trayNodes.addEventListener('pointercancel', endTrayPointer);

  // Enter or Space on a pill (a click with no pointer behind it) opens the idea.
  trayNodes.addEventListener('click', (e) => {
    if (e.detail !== 0) return;
    const el = e.target.closest('.tt-tray-node');
    if (el) setFocus(focusId === el.dataset.id ? null : el.dataset.id);
  });

  /* ── Panel: parameters ── */

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function svg(viewBox, size, build) {
    const s = document.createElementNS(SVG_NS, 'svg');
    s.setAttribute('viewBox', viewBox);
    s.setAttribute('width', size);
    s.setAttribute('height', size);
    s.setAttribute('aria-hidden', 'true');
    build(s);
    return s;
  }

  function shape(s, tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    s.append(el);
  }

  const gripIcon = () => svg('0 0 10 16', 14, (s) => {
    for (const cy of [3, 8, 13]) for (const cx of [3, 7]) shape(s, 'circle', { cx, cy, r: 1.3, fill: 'currentColor' });
  });

  const checkIcon = () => svg('0 0 12 12', 12, (s) => {
    shape(s, 'path', { d: 'M2.5 6.2 5 8.6 9.6 3.6', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  });

  const crossIcon = () => svg('0 0 12 12', 12, (s) => {
    shape(s, 'path', { d: 'M3 3l6 6M9 3 3 9', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round' });
  });

  const swapIcon = () => svg('0 0 14 14', 14, (s) => {
    shape(s, 'path', { d: 'M2 5h10M9 2l3 3-3 3M12 9H2m3-3L2 9l3 3', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  });

  function iconButton(cls, label, icon) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tt-icon ' + cls;
    b.setAttribute('aria-label', label);
    b.append(icon());
    return b;
  }

  // Every parameter has a row, the ones past the rank dimmed: they keep their
  // names and values, and come back when the rank does.
  function renderParams() {
    paramRows.textContent = '';
    state.params.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'tt-param' + (i >= rank ? ' is-hidden' : '');
      row.dataset.param = p.id;
      if (i >= rank) row.title = `Not drawn at rank ${rank}. Press ${i + 1} to show it.`;
      const n = document.createElement('span');
      n.className = 'tt-param-n';
      n.textContent = String(i + 1);
      const name = p.left || p.right ? `${p.left || '—'} to ${p.right || '—'}` : `parameter ${i + 1}`;
      row.append(
        n,
        pole(p, 'left', i),
        iconButton('tt-swap', `Swap the ends of ${name}`, swapIcon),
        pole(p, 'right', i),
        iconButton('tt-param-remove', `Remove ${name}`, crossIcon),
      );
      paramRows.append(row);
      for (const f of row.querySelectorAll('.tt-pole')) fitPole(f);
    });
    updateNote();
    paramAdd.hidden = state.params.length >= MAX_RANK;
  }

  function updateNote() {
    const text = !state.params.length
      ? 'Add a parameter to spread the ideas along a line.'
      : shownParams().some((p) => !p.left && !p.right)
        ? (rank === 1
          ? 'Name the two ends of the line, in your own words. Then drag ideas from the tray onto it.'
          : 'Name the two ends of the new axis.')
        : '';
    paramsNote.textContent = text;
    paramsNote.hidden = !text;
  }

  // Where `field-sizing: content` is missing, size the field to its wrapped text.
  function fitPole(f) {
    if (CSS.supports('field-sizing', 'content')) return;
    f.style.height = 'auto';
    f.style.height = f.scrollHeight + 'px';
  }

  function pole(p, side, i) {
    const f = document.createElement('textarea');   // a field that wraps; Enter still just finishes
    f.rows = 1;
    f.className = 'tt-pole';
    f.dataset.side = side;
    f.maxLength = 40;
    f.spellcheck = false;
    f.value = p[side];
    f.placeholder = side === 'left' ? 'left end' : 'right end';
    f.setAttribute('aria-label', `Parameter ${i + 1}, ${side} end`);
    f.setAttribute('enterkeyhint', 'done');
    return f;
  }

  function addParam() {
    if (state.params.length >= MAX_RANK) return;
    const p = newParam();
    state.params.push(p);
    if (state.params.length > rank) setRank(state.params.length);   // which draws the new axis and asks for its names
    else renderParams();
    const f = paramRows.querySelector(`[data-param="${CSS.escape(p.id)}"] .tt-pole`);
    if (f && !coarse.matches) f.focus({ preventScroll: true });
    announce(`Parameter ${state.params.length} added. Name its two ends.`);
  }

  function removeParam(p) {
    const i = state.params.indexOf(p);
    if (i < 0) return;
    const name = p.left || p.right ? `${p.left || '—'} to ${p.right || '—'}` : `parameter ${i + 1}`;
    // a blank parameter holding no values was never in the saved copy, so
    // there is nothing to undo about removing it
    const mattered = p.left || p.right || state.items.some((it) => isNum(it.scores[p.id]));
    state.params.splice(i, 1);
    for (const it of state.items) delete it.scores[p.id];
    if (finishEdit) finishEdit();
    save();
    if (state.params.length < rank) setRank(state.params.length);
    else { renderParams(); render(); relayout({ dur: 500 }); }
    if (mattered) showToast(`Removed ${name}`);
    else announce(`Removed ${name}`);
  }

  paramAdd.addEventListener('click', addParam);

  paramsBox.addEventListener('input', (e) => {
    const f = e.target.closest('.tt-pole');
    if (!f) return;
    const p = paramOf(f);
    if (!p) return;
    p[f.dataset.side] = word(f.value);
    fitPole(f);
    save(`pole:${p.id}:${f.dataset.side}`);
    for (const s of document.querySelectorAll(`.tt-slider[data-param="${CSS.escape(p.id)}"]`)) decorateSlider(s, p);
    updateNote();
    kick();
  });

  paramsBox.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('.tt-pole')) { e.preventDefault(); e.target.blur(); }
  });

  paramsBox.addEventListener('click', (e) => {
    const b = e.target.closest('.tt-swap, .tt-param-remove');
    if (!b) return;
    const p = paramOf(b);
    if (!p) return;
    if (b.matches('.tt-param-remove')) { removeParam(p); return; }
    [p.left, p.right] = [p.right, p.left];
    // the words change ends, so every value changes sign and nothing moves in meaning
    for (const it of state.items) if (isNum(it.scores[p.id])) it.scores[p.id] = -it.scores[p.id];
    renderParams();
    commit({ dur: 500 });
    const again = paramRows.querySelector(`[data-param="${CSS.escape(p.id)}"] .tt-swap`);
    if (again) again.focus();
  });

  /* ── Panel: the list ── */

  function textButton(item) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tt-text';
    b.textContent = item.text;
    b.title = 'Edit';
    return b;
  }

  // The spoken names of a row's controls, which carry the idea's text.
  function describe(el, item) {
    const grip = el.querySelector('.tt-grip');
    if (grip) grip.setAttribute('aria-label', `Move “${item.text}”. Drag, or press the up and down arrow keys.`);
    el.querySelector('.tt-check .tt-sr').textContent = `Done: ${item.text}`;
    el.querySelector('.tt-remove').setAttribute('aria-label', `Remove “${item.text}”`);
  }

  function row(item, isCard) {
    const el = document.createElement(isCard ? 'div' : 'li');
    el.className = 'tt-item' + (item.done ? ' is-done' : '')
      + (!isCard && item.id === focusId ? ' is-focus' : '')
      + (!isCard && item.id === hoverId ? ' is-hover' : '');
    el.dataset.id = item.id;

    if (!isCard) {
      const grip = document.createElement('button');
      grip.type = 'button';
      grip.className = 'tt-grip';
      grip.append(gripIcon());
      el.append(grip);
    }

    const check = document.createElement('label');
    check.className = 'tt-check';
    const tick = document.createElement('input');
    tick.type = 'checkbox';
    tick.checked = item.done;
    const box = document.createElement('span');
    box.className = 'tt-box';
    box.append(checkIcon());
    const name = document.createElement('span');
    name.className = 'tt-sr';
    check.append(tick, box, name);

    const body = document.createElement('div');
    body.className = 'tt-body';
    body.append(textButton(item));
    const ps = shownParams();
    if (ps.length) {
      const sl = document.createElement('div');
      sl.className = 'tt-sliders';
      for (const p of ps) sl.append(slider(item, p));
      body.append(sl);
    }

    el.append(check, body, iconButton('tt-remove', '', crossIcon));
    describe(el, item);
    return el;
  }

  function slider(item, p) {
    const s = document.createElement('div');
    s.className = 'tt-slider';
    s.dataset.param = p.id;
    s.setAttribute('role', 'slider');
    s.tabIndex = 0;
    s.setAttribute('aria-valuemin', '-1');
    s.setAttribute('aria-valuemax', '1');
    const l = document.createElement('span');
    l.className = 'tt-slider-pole';
    const track = document.createElement('span');
    track.className = 'tt-slider-track';
    const thumb = document.createElement('span');
    thumb.className = 'tt-slider-thumb';
    track.append(thumb);
    const r = document.createElement('span');
    r.className = 'tt-slider-pole';
    s.append(l, track, r);
    decorateSlider(s, p, item.scores[p.id]);
    return s;
  }

  function decorateSlider(s, p, v) {
    if (v === undefined) {
      const host = s.closest('.tt-item');
      const item = host && byId(host.dataset.id);
      v = item ? item.scores[p.id] : undefined;
    }
    const has = isNum(v);
    const poles = s.querySelectorAll('.tt-slider-pole');
    poles[0].textContent = p.left || '—';
    poles[1].textContent = p.right || '—';
    s.classList.toggle('is-unset', !has);
    s.querySelector('.tt-slider-thumb').style.setProperty('--v', `${((has ? v : 0) + 1) * 50}%`);
    s.setAttribute('aria-label', `${p.left || 'left end'} to ${p.right || 'right end'}`);
    if (has) {
      s.setAttribute('aria-valuenow', v.toFixed(2));
      const side = v < 0 ? p.left : p.right;
      s.setAttribute('aria-valuetext', v === 0 ? 'in the middle' : `${Math.round(Math.abs(v) * 100)}% toward ${side || (v < 0 ? 'the left end' : 'the right end')}`);
    } else {
      s.removeAttribute('aria-valuenow');
      s.setAttribute('aria-valuetext', 'not placed');
    }
  }

  function tally() {
    const done = state.items.filter((i) => i.done).length;
    count.textContent = state.items.length ? `${done} of ${state.items.length} done` : '';
    empty.hidden = state.items.length > 0;
  }

  // focus: { id, sel, host } of the control to put the cursor back on.
  // An edit still open is finished first, so nothing typed is lost.
  function render(focus) {
    if (finishEdit) finishEdit();
    syncNodes();
    list.textContent = '';
    for (const item of state.items) list.append(row(item));
    tally();
    renderCard();
    renderTray();
    if (focus) {
      const host = focus.host === 'card' ? card : list;
      const el = host.querySelector(`[data-id="${CSS.escape(focus.id)}"] ${focus.sel}`);
      if (el) el.focus({ preventScroll: true });
    }
  }

  // Every change goes the same way: save it, redraw the words, move the dots.
  function commit({ dur = 400, focus, merge } = {}) {
    if (finishEdit) finishEdit();
    save(merge);
    render(focus);
    relayout({ dur });
  }

  function announce(msg) {
    live.textContent = '';
    requestAnimationFrame(() => { live.textContent = msg; });
  }

  /* ── Add ── */

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim().slice(0, 300);
    if (!text) return;
    state.items.unshift({ id: uid(), text, done: false, scores: {} });
    commit({ dur: 500 });
    input.value = '';
    announce(`Added “${text}”`);
  });

  /* ── Check off, edit, remove, set a value: the same in the list and the card ── */

  function onChange(e) {
    if (!e.target.matches('.tt-check input')) return;
    const el = e.target.closest('.tt-item');
    const item = byId(el.dataset.id);
    if (!item) return;
    item.done = e.target.checked;
    save();
    render({ id: item.id, sel: '.tt-check input', host: el.parentElement === card ? 'card' : 'list' });
    kick();
  }

  function onClick(e) {
    const text = e.target.closest('.tt-text');
    if (text) return startEdit(text.closest('.tt-item'));
    const remove = e.target.closest('.tt-remove');
    if (remove) return removeItem(remove.closest('.tt-item').dataset.id);
  }

  for (const host of [list, card]) {
    host.addEventListener('change', onChange);
    host.addEventListener('click', onClick);
    host.addEventListener('pointerdown', onSliderDown);
    host.addEventListener('keydown', onSliderKey);
  }

  let finishEdit = null;   // ends the edit in progress, if there is one

  function startEdit(el, selectAll) {
    const item = byId(el.dataset.id);
    if (!item) return;
    if (finishEdit) finishEdit();
    const btn = el.querySelector('.tt-text');
    const field = document.createElement('input');
    field.type = 'text';
    field.className = 'tt-edit';
    field.maxLength = 300;
    field.value = item.text;
    field.setAttribute('aria-label', 'Edit idea');
    field.setAttribute('enterkeyhint', 'done');
    btn.replaceWith(field);
    field.focus();
    if (selectAll) field.select();
    else field.setSelectionRange(field.value.length, field.value.length);

    // Only the field is swapped back, never the whole list, so a click that
    // ended the edit still lands on whatever it was aimed at.
    let finished = false;
    const finish = (keep, refocus) => {
      if (finished) return;
      finished = true;
      if (finishEdit === done) finishEdit = null;
      const v = field.value.trim();
      const changed = keep && v && v !== item.text;
      if (changed) {
        item.text = v;
        save();
        describe(el, item);
      }
      const b = textButton(item);
      field.replaceWith(b);
      if (refocus) b.focus();
      if (changed) {
        const other = el.parentElement === card ? list : card;
        const twin = other.querySelector(`[data-id="${CSS.escape(item.id)}"] .tt-text`);
        if (twin) twin.textContent = item.text;
        renderTray();
        kick();
      }
    };
    const done = () => finish(true, false);
    finishEdit = done;

    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true, true); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false, true); }
    });
    field.addEventListener('blur', done);
  }

  function removeItem(id) {
    const i = indexOf(id);
    if (i < 0) return;
    const [item] = state.items.splice(i, 1);
    if (focusId === id) setFocus(null, true);
    const next = state.items[i] || state.items[i - 1];
    commit({ dur: 400, focus: next ? { id: next.id, sel: '.tt-text', host: 'list' } : null });
    if (!next) input.focus();
    showToast(`Removed “${item.text}”`);
  }

  function showToast(msg) {
    toastMsg.textContent = msg;
    toast.hidden = false;
    announce(`${msg}. Undo is available.`);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 7000);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    toast.hidden = true;
  }

  undoBtn.addEventListener('click', undo);

  /* Sliders: drag along the hairline, or use the arrow keys. */

  let sliding = false;

  function sliderValue(s, clientX) {
    const r = s.querySelector('.tt-slider-track').getBoundingClientRect();
    return round3(clamp(((clientX - r.left) / r.width) * 2 - 1, -1, 1));
  }

  const sliderFocus = (s, item, p) => ({ id: item.id, sel: `.tt-slider[data-param="${CSS.escape(p.id)}"]`, host: s.closest('.tt-card') ? 'card' : 'list' });

  // live: the thumb and the dot follow, but nothing is saved yet.
  // glide: the first press on the hairline eases the node over to it; every
  // move after that follows the pointer with no delay at all.
  function setScore(item, p, v, { live = false, glide = false, focus } = {}) {
    if (v === null) delete item.scores[p.id]; else item.scores[p.id] = v;
    for (const s of document.querySelectorAll(`.tt-item[data-id="${CSS.escape(item.id)}"] .tt-slider[data-param="${CSS.escape(p.id)}"]`)) decorateSlider(s, p, v === null ? undefined : v);
    // the node slides to its new place, except under a dragging pointer, which it follows live
    const n = nodes.get(item.id);
    const a = shownParams().indexOf(p);
    if (live) {
      if (n && n.shown && v !== null && a >= 0 && !(rank === 1 && a > 0)) {
        if (glide) {
          const from = n.pos[a];
          tween({ tag: 'glide', dur: 220, step: (t) => { n.pos[a] = from + (v - from) * t; } });
        } else {
          cancel('glide');
          n.pos[a] = v;
        }
      }
      kick();
    } else commit({ dur: 450, focus });
  }

  function onSliderDown(e) {
    const s = e.target.closest('.tt-slider');
    if (!s || sliding || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const item = byId(s.closest('.tt-item').dataset.id);
    const p = paramOf(s);
    if (!item || !p) return;
    e.preventDefault();
    s.setPointerCapture(e.pointerId);
    s.classList.add('is-dragging');
    sliding = true;
    setScore(item, p, sliderValue(s, e.clientX), { live: true, glide: true });
    const move = (ev) => setScore(item, p, sliderValue(s, ev.clientX), { live: true });
    const up = () => {
      s.removeEventListener('pointermove', move);
      s.removeEventListener('pointerup', up);
      s.removeEventListener('pointercancel', up);
      s.classList.remove('is-dragging');
      sliding = false;
      setScore(item, p, item.scores[p.id], { focus: sliderFocus(s, item, p) });
      announce(`${item.text}: ${s.getAttribute('aria-valuetext')}`);
    };
    s.addEventListener('pointermove', move);
    s.addEventListener('pointerup', up);
    s.addEventListener('pointercancel', up);
  }

  function onSliderKey(e) {
    const s = e.target.closest('.tt-slider');
    if (!s) return;
    const item = byId(s.closest('.tt-item').dataset.id);
    const p = paramOf(s);
    if (!item || !p) return;
    const cur = isNum(item.scores[p.id]) ? item.scores[p.id] : 0;
    let v;
    switch (e.key) {
      case 'ArrowLeft': case 'ArrowDown': v = clamp(cur - 0.05, -1, 1); break;
      case 'ArrowRight': case 'ArrowUp': v = clamp(cur + 0.05, -1, 1); break;
      case 'Home': v = -1; break;
      case 'End': v = 1; break;
      case 'Backspace': case 'Delete': v = null; break;
      default: return;
    }
    e.preventDefault();
    setScore(item, p, v === null ? null : round3(v), { focus: sliderFocus(s, item, p) });
  }

  /* ── Reorder with the keyboard ── */

  list.addEventListener('keydown', (e) => {
    const grip = e.target.closest('.tt-grip');
    if (!grip) return;
    const d = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (!d) return;
    e.preventDefault();
    const id = grip.closest('.tt-item').dataset.id;
    const i = indexOf(id);
    const j = i + d;
    if (j < 0 || j >= state.items.length) return;
    const [item] = state.items.splice(i, 1);
    state.items.splice(j, 0, item);
    commit({ dur: 400, focus: { id, sel: '.tt-grip', host: 'list' } });
    announce(`Moved to ${j + 1} of ${state.items.length}`);
  });

  /* ── Reorder by dragging ──
     Pointer events, so a mouse and a finger work the same. The row follows
     the pointer; when its middle passes a neighbour's middle it swaps places
     in the list, and the neighbours slide to their new spots. */

  let rowDrag = null;
  const panelScroll = document.querySelector('.tt-panel-scroll');

  list.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('.tt-grip');
    if (!grip || rowDrag) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const li = grip.closest('.tt-item');
    const listTop = list.getBoundingClientRect().top;
    // Capture on the list, not the grip: moving the row in the page would
    // make the browser drop a capture held by anything inside it.
    list.setPointerCapture(e.pointerId);
    rowDrag = {
      li,
      y: e.clientY,
      grab: e.clientY - (listTop + li.offsetTop),
      from: [...list.children].indexOf(li),
      raf: 0,
    };
    li.classList.add('is-dragging');
    document.body.classList.add('tt-dragging');
    list.addEventListener('pointermove', onRowMove);
    list.addEventListener('pointerup', endRowDrag);
    list.addEventListener('pointercancel', endRowDrag);
    list.addEventListener('lostpointercapture', endRowDrag);
    rowDrag.raf = requestAnimationFrame(autoScroll);
  });

  function onRowMove(e) {
    if (!rowDrag) return;
    rowDrag.y = e.clientY;
    placeRow();
  }

  function placeRow() {
    const { li } = rowDrag;
    const top = rowDrag.y - list.getBoundingClientRect().top - rowDrag.grab;
    const mid = top + li.offsetHeight / 2;

    let before = null;
    for (const s of list.children) {
      if (s === li) continue;
      if (mid < s.offsetTop + s.offsetHeight / 2) { before = s; break; }
    }

    if (li.nextElementSibling !== before) {
      const others = [...list.children].filter((s) => s !== li);
      const was = new Map(others.map((s) => [s, s.getBoundingClientRect().top]));
      list.insertBefore(li, before);
      if (!reduced.matches) {
        for (const s of others) {
          s.getAnimations().forEach((a) => a.cancel());
          const dy = was.get(s) - s.getBoundingClientRect().top;
          if (dy) s.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }],
            { duration: 170, easing: 'cubic-bezier(.2,.7,.3,1)' });
        }
      }
    }

    li.style.transform = `translateY(${top - li.offsetTop}px)`;
  }

  // Near the top or bottom of the panel, keep scrolling so a row can be
  // carried past what is on screen.
  function autoScroll() {
    if (!rowDrag) return;
    const edge = 72;
    const r = panelScroll.getBoundingClientRect();
    let v = 0;
    if (rowDrag.y < r.top + edge) v = -(r.top + edge - rowDrag.y) / 5;
    else if (rowDrag.y > r.bottom - edge) v = (rowDrag.y - (r.bottom - edge)) / 5;
    if (v) {
      panelScroll.scrollBy(0, v);
      placeRow();
    }
    rowDrag.raf = requestAnimationFrame(autoScroll);
  }

  function endRowDrag() {
    if (!rowDrag) return;
    const d = rowDrag;
    rowDrag = null;
    cancelAnimationFrame(d.raf);
    list.removeEventListener('pointermove', onRowMove);
    list.removeEventListener('pointerup', endRowDrag);
    list.removeEventListener('pointercancel', endRowDrag);
    list.removeEventListener('lostpointercapture', endRowDrag);

    const offset = d.li.style.transform;
    d.li.style.transform = '';
    if (offset && !reduced.matches) {
      d.li.animate([{ transform: offset }, { transform: 'none' }], { duration: 140, easing: 'ease-out' });
    }
    d.li.classList.remove('is-dragging');
    document.body.classList.remove('tt-dragging');

    const order = [...list.children].map((s) => s.dataset.id);
    state.items = order.map((id) => byId(id)).filter(Boolean);
    const to = order.indexOf(d.li.dataset.id);
    if (to !== d.from) {
      save();
      relayout({ dur: 400 });
      announce(`Moved to ${to + 1} of ${state.items.length}`);
    }
  }

  /* ── Foot ── */

  async function copyText(text, okNote) {
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = okNote;
    } catch {
      status.textContent = 'This browser blocked copying.';
    }
  }

  $('tt-copy').addEventListener('click', () => {
    copyText(JSON.stringify(payload(), null, 2) + '\n', 'Copied. Paste it into todo-tensor/list.json to publish this list.');
  });

  $('tt-link').addEventListener('click', () => {
    copyText(shareLink(), 'Link copied. Whoever opens it sees this arrangement; their own list stays theirs.');
  });

  $('tt-reset').addEventListener('click', async () => {
    if (!window.confirm('Replace your list and parameters in this browser with the published ones?')) return;
    try { localStorage.removeItem(STORE); localStorage.removeItem(STORE_V1); } catch { /* nothing saved */ }
    const prev = lastSaved;
    Object.assign(state, await readSeed());
    ensureParams(rank);
    setFocus(null, true);
    // not saved: a visitor with no copy of their own keeps seeing the live
    // published list. Undo still brings their old copy back.
    lastSaved = JSON.stringify(payload());
    undoJSON = prev;
    mergeKey = null;
    undone = false;
    shared = null;
    renderParams();
    render();
    relayout({ dur: 500 });
    writeHash();
    status.textContent = 'Back to the published list.';
    announce('Back to the published list');
  });

  /* ── The corners: rank, faces, panel ── */

  rankBtns.forEach((b) => b.addEventListener('click', () => setRank(+b.dataset.rank)));
  faceBtns.forEach((b) => b.addEventListener('click', () => setFace(b.dataset.face)));

  function setPanel(on) {
    panelOpen = on;
    space.classList.toggle('has-panel', on);
    panelToggle.setAttribute('aria-expanded', String(on));
    const verb = on ? 'Hide' : 'Show';
    panelToggle.setAttribute('aria-label', `${verb} the side panel`);
    panelToggle.title = `${verb} the side panel`;
  }

  panelToggle.addEventListener('click', () => setPanel(!panelOpen));

  document.addEventListener('keydown', (e) => {
    const t = e.target instanceof Element ? e.target : document.body;
    const typing = t.matches('input, textarea, [role="slider"]');
    if (e.key === 'Escape') {
      if (typing) return;
      if (focusId) { setFocus(null, true); kick(); }
      else if (rank === 0 && open) collapse();
      return;
    }
    if (typing || drag || rowDrag || sliding) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.altKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (mod || e.altKey) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); setRank(rank + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setRank(rank - 1); }
  });

  /* ── Start ── */

  new ResizeObserver(resize).observe(scene);
  if (document.fonts && document.fonts.load) {
    document.fonts.load(FONT_LABEL).then(() => { widths.clear(); fitCache.clear(); kick(); }).catch(() => {});
  }

  // on a phone the panel is a sheet over half the screen, so it starts shut there
  if (window.matchMedia('(max-width: 760px)').matches) setPanel(false);

  (async () => {
    const q = readHash();
    let data = null;
    if (q.has('data')) {
      try { data = clean(JSON.parse(unb64url(q.get('data')))); shared = q.get('data'); } catch { data = null; }
    }
    if (!data) {
      const local = readLocal();
      data = local !== null ? local : await readSeed();
    }
    Object.assign(state, data);
    lastSaved = JSON.stringify(payload());
    syncNodes();
    for (const n of nodes.values()) { n.alpha = 1; n.shown = true; }
    resize();
    relayout({ instant: true });
    renderParams();
    render();
    const r = clamp(parseInt(q.get('rank'), 10) || 0, 0, MAX_RANK);
    if (r) setRank(r);
    const idea = q.get('idea');
    if (idea && byId(idea)) setFocus(idea, true);
    booting = false;
    writeHash();
    if (shared) status.textContent = 'A shared arrangement. Your own saved list stays as it was until you change something here.';
    // one quiet ring, so the point reads as something to open
    tween({
      tag: 'pulse', dur: 1600, delay: 900, ease: linear,
      step: (t) => { pulse = rank === 0 && !open ? t : -1; },
      done: () => { pulse = -1; },
    });
  })();
})();
