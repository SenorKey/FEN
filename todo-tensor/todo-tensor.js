/* ToDo Tensor — rank 0.
   The published list comes from list.json. Once a visitor changes anything,
   their copy lives in this browser's localStorage and the published list is
   left alone. Each idea already carries an empty `scores` object: that is
   where its place on each parameter goes when the graph views arrive. */

(() => {
  'use strict';

  const STORE = 'todo-tensor:v1';
  const SEED = '/todo-tensor/list.json';

  const $ = (id) => document.getElementById(id);
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

  const SAVED_NOTE = 'Your changes are saved in this browser only.';

  let items = [];
  let lastRemoved = null;
  let toastTimer = 0;

  /* ── Data ── */

  const uid = () =>
    (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);

  // Accepts { items: [...] } or a bare array; drops anything malformed.
  function clean(raw) {
    const arr = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.items) ? raw.items : []);
    const seen = new Set();
    const out = [];
    for (const x of arr) {
      if (!x || typeof x.text !== 'string' || !x.text.trim()) continue;
      let id = typeof x.id === 'string' && x.id ? x.id : uid();
      if (seen.has(id)) id = uid();
      seen.add(id);
      const scores = x.scores && typeof x.scores === 'object' && !Array.isArray(x.scores) ? x.scores : {};
      out.push({ id, text: x.text.trim().slice(0, 300), done: !!x.done, scores });
    }
    return out;
  }

  function readLocal() {
    try {
      const s = localStorage.getItem(STORE);
      return s ? clean(JSON.parse(s)) : null;
    } catch {
      return null;
    }
  }

  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({ version: 1, items }));
      status.textContent = SAVED_NOTE;
    } catch {
      status.textContent = 'This browser won’t save changes, so they will be gone when you leave.';
    }
  }

  async function readSeed() {
    try {
      const r = await fetch(SEED, { cache: 'no-cache' });
      return r.ok ? clean(await r.json()) : [];
    } catch {
      return [];
    }
  }

  const indexOf = (id) => items.findIndex((i) => i.id === id);

  /* ── Drawing ── */

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function svg(viewBox, size, draw) {
    const s = document.createElementNS(SVG_NS, 'svg');
    s.setAttribute('viewBox', viewBox);
    s.setAttribute('width', size);
    s.setAttribute('height', size);
    s.setAttribute('aria-hidden', 'true');
    draw(s);
    return s;
  }

  function node(s, tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    s.append(el);
  }

  const gripIcon = () => svg('0 0 10 16', 14, (s) => {
    for (const cy of [3, 8, 13]) for (const cx of [3, 7]) node(s, 'circle', { cx, cy, r: 1.3, fill: 'currentColor' });
  });

  const checkIcon = () => svg('0 0 12 12', 12, (s) => {
    node(s, 'path', { d: 'M2.5 6.2 5 8.6 9.6 3.6', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  });

  const crossIcon = () => svg('0 0 12 12', 12, (s) => {
    node(s, 'path', { d: 'M3 3l6 6M9 3 3 9', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round' });
  });

  function textButton(item) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tt-text';
    b.textContent = item.text;
    b.title = 'Edit';
    return b;
  }

  function label(li, item) {
    li.querySelector('.tt-grip').setAttribute('aria-label', `Move “${item.text}”. Drag, or press the up and down arrow keys.`);
    li.querySelector('.tt-check .tt-sr').textContent = `Done: ${item.text}`;
    li.querySelector('.tt-remove').setAttribute('aria-label', `Remove “${item.text}”`);
  }

  function row(item) {
    const li = document.createElement('li');
    li.className = 'tt-item' + (item.done ? ' is-done' : '');
    li.dataset.id = item.id;

    const grip = document.createElement('button');
    grip.type = 'button';
    grip.className = 'tt-grip';
    grip.append(gripIcon());

    const check = document.createElement('label');
    check.className = 'tt-check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = item.done;
    const face = document.createElement('span');
    face.className = 'tt-box';
    face.append(checkIcon());
    const name = document.createElement('span');
    name.className = 'tt-sr';
    check.append(box, face, name);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'tt-remove';
    remove.append(crossIcon());

    li.append(grip, check, textButton(item), remove);
    label(li, item);
    return li;
  }

  function tally() {
    const done = items.filter((i) => i.done).length;
    count.textContent = items.length ? `${done} of ${items.length} done` : '';
    empty.hidden = items.length > 0;
  }

  // focus: [id, selector] of the control to put the cursor back on.
  function render(focus) {
    list.textContent = '';
    for (const item of items) list.append(row(item));
    tally();
    if (focus) {
      const li = list.querySelector(`[data-id="${CSS.escape(focus[0])}"]`);
      const el = li && li.querySelector(focus[1]);
      if (el) el.focus();
    }
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
    items.unshift({ id: uid(), text, done: false, scores: {} });
    save();
    render();
    input.value = '';
    announce(`Added “${text}”`);
  });

  /* ── Check off, edit, remove ── */

  list.addEventListener('change', (e) => {
    if (!e.target.matches('.tt-check input')) return;
    const li = e.target.closest('.tt-item');
    const item = items[indexOf(li.dataset.id)];
    if (!item) return;
    item.done = e.target.checked;
    li.classList.toggle('is-done', item.done);
    save();
    tally();
  });

  list.addEventListener('click', (e) => {
    const text = e.target.closest('.tt-text');
    if (text) return startEdit(text.closest('.tt-item'));
    const remove = e.target.closest('.tt-remove');
    if (remove) return removeItem(remove.closest('.tt-item').dataset.id);
  });

  function startEdit(li) {
    const item = items[indexOf(li.dataset.id)];
    if (!item) return;
    const btn = li.querySelector('.tt-text');
    const field = document.createElement('input');
    field.type = 'text';
    field.className = 'tt-edit';
    field.maxLength = 300;
    field.value = item.text;
    field.setAttribute('aria-label', 'Edit idea');
    field.setAttribute('enterkeyhint', 'done');
    btn.replaceWith(field);
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);

    let finished = false;
    // Only the field is swapped back, never the whole list, so a click that
    // ended the edit still lands on whatever it was aimed at.
    const finish = (keep, refocus) => {
      if (finished) return;
      finished = true;
      const v = field.value.trim();
      if (keep && v && v !== item.text) {
        item.text = v;
        save();
        label(li, item);
      }
      const b = textButton(item);
      field.replaceWith(b);
      if (refocus) b.focus();
    };

    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true, true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false, true); }
    });
    field.addEventListener('blur', () => finish(true, false));
  }

  function removeItem(id) {
    const i = indexOf(id);
    if (i < 0) return;
    const [item] = items.splice(i, 1);
    lastRemoved = { item, index: i };
    save();
    const next = items[i] || items[i - 1];
    render(next ? [next.id, '.tt-text'] : null);
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
    toast.hidden = true;
    lastRemoved = null;
  }

  undoBtn.addEventListener('click', () => {
    if (!lastRemoved) return;
    const { item, index } = lastRemoved;
    items.splice(Math.min(index, items.length), 0, item);
    clearTimeout(toastTimer);
    hideToast();
    save();
    render([item.id, '.tt-text']);
    announce(`Restored “${item.text}”`);
  });

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
    if (j < 0 || j >= items.length) return;
    const [item] = items.splice(i, 1);
    items.splice(j, 0, item);
    save();
    render([id, '.tt-grip']);
    announce(`Moved to ${j + 1} of ${items.length}`);
  });

  /* ── Reorder by dragging ──
     Pointer events, so a mouse and a finger work the same. The row follows
     the pointer; when its middle passes a neighbour's middle it swaps places
     in the list, and the neighbours slide to their new spots. */

  let drag = null;

  list.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('.tt-grip');
    if (!grip || drag) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const li = grip.closest('.tt-item');
    const listTop = list.getBoundingClientRect().top;
    // Capture on the list, not the grip: moving the row in the page would
    // make the browser drop a capture held by anything inside it.
    list.setPointerCapture(e.pointerId);
    drag = {
      li,
      y: e.clientY,
      grab: e.clientY - (listTop + li.offsetTop),
      from: [...list.children].indexOf(li),
      raf: 0,
    };
    li.classList.add('is-dragging');
    document.body.classList.add('tt-dragging');
    list.addEventListener('pointermove', onDragMove);
    list.addEventListener('pointerup', endDrag);
    list.addEventListener('pointercancel', endDrag);
    list.addEventListener('lostpointercapture', endDrag);
    drag.raf = requestAnimationFrame(autoScroll);
  });

  function onDragMove(e) {
    if (!drag) return;
    drag.y = e.clientY;
    place();
  }

  function place() {
    const { li } = drag;
    const top = drag.y - list.getBoundingClientRect().top - drag.grab;
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

  // Near the top or bottom of the window, keep scrolling so a row can be
  // carried past what is on screen.
  function autoScroll() {
    if (!drag) return;
    const edge = 72;
    const h = window.innerHeight;
    let v = 0;
    if (drag.y < edge) v = -(edge - drag.y) / 5;
    else if (drag.y > h - edge) v = (drag.y - (h - edge)) / 5;
    if (v) {
      window.scrollBy(0, v);
      place();
    }
    drag.raf = requestAnimationFrame(autoScroll);
  }

  function endDrag() {
    if (!drag) return;
    const d = drag;
    drag = null;
    cancelAnimationFrame(d.raf);
    list.removeEventListener('pointermove', onDragMove);
    list.removeEventListener('pointerup', endDrag);
    list.removeEventListener('pointercancel', endDrag);
    list.removeEventListener('lostpointercapture', endDrag);

    const offset = d.li.style.transform;
    d.li.style.transform = '';
    if (offset && !reduced.matches) {
      d.li.animate([{ transform: offset }, { transform: 'none' }], { duration: 140, easing: 'ease-out' });
    }
    d.li.classList.remove('is-dragging');
    document.body.classList.remove('tt-dragging');

    const order = [...list.children].map((s) => s.dataset.id);
    const byId = new Map(items.map((i) => [i.id, i]));
    items = order.map((id) => byId.get(id)).filter(Boolean);
    const to = order.indexOf(d.li.dataset.id);
    if (to !== d.from) {
      save();
      announce(`Moved to ${to + 1} of ${items.length}`);
    }
  }

  /* ── Foot ── */

  $('tt-copy').addEventListener('click', async () => {
    const json = JSON.stringify({ version: 1, items }, null, 2) + '\n';
    try {
      await navigator.clipboard.writeText(json);
      status.textContent = 'Copied. Paste it into todo-tensor/list.json to publish this list.';
    } catch {
      status.textContent = 'This browser blocked copying.';
    }
  });

  $('tt-reset').addEventListener('click', async () => {
    if (!window.confirm('Replace your list in this browser with the published one?')) return;
    try { localStorage.removeItem(STORE); } catch { /* nothing saved */ }
    items = await readSeed();
    render();
    status.textContent = 'Back to the published list.';
    announce('Back to the published list');
  });

  /* ── Start ── */

  (async () => {
    const local = readLocal();
    items = local !== null ? local : await readSeed();
    render();
  })();
})();
