/* ═══════════════════════════════════════════════════════════════════
   Case Chronicle search

   One search box on every page of the Chronicle, hanging from the
   underside of the nav. What it searches is set by the page it is on:

     /case-chronicle/                     every case: all five pages of each
     /case-chronicle/<case>/              that case's five pages
     /case-chronicle/<case>/<view>/       this page and nothing else

   The first two read the files search/build.py writes (search/*.json),
   fetched the first time the box is used, never before. A view reads
   itself, so it downloads nothing. The Restricted Section has no box
   and is in no file: its door is not to be given away.

   A result is a card: a chronology entry, a flow card, a question in
   the Argument View, a person in the courtroom, a glossary term. Choosing
   one goes to its page if it is not this one, opens whatever the card
   is shut inside (its drawer, its More, the glossary panel, the moment
   in the courtroom when that person is in the room), scrolls it into
   view and marks the words.

   The box rides under the nav, and under the chronology's color key or
   the courtroom's timeline once one of those has stuck under the nav,
   so it never covers either.
   ═══════════════════════════════════════════════════════════════════ */

(() => {
  const ROOT = '/case-chronicle/';

  let path = location.pathname.replace(/index\.html$/, '');
  if (!path.endsWith('/')) path += '/';
  if (!path.startsWith(ROOT) || path.startsWith(`${ROOT}restricted-section/`)) return;

  const nav = document.querySelector('.site-nav');
  const main = document.querySelector('main');
  if (!nav || !main) return;

  const parts = path.slice(ROOT.length).split('/').filter(Boolean);
  let scope = parts.length === 0 ? 'all' : parts.length === 1 ? 'case' : 'page';
  const slug = parts[0];

  /* ── Shared with build.py: keep the two in step ── */
  const UNITS = ['tl-ev', 'tl-phase', 'tl-mark', 'tl-end', 'cf-card', 'cf-part', 'row',
    'cr-who', 'party', 'door-slot', 'note'];
  const UNIT_SEL = `${UNITS.map((c) => `.${c}`).join(', ')}, .gloss-l > div`;
  const SKIP_SEL = [
    'script', 'style', 'svg', 'noscript', 'template', 'nav', 'footer', 'button',
    'input', 'textarea', 'select',
    '.tl-key', '.fix', '.cm', '.cr-days', '.gloss-b', '.crumb', '.row-n',
    '.to-top', '.sect-nav', '[aria-hidden="true"]', '.cs',
  ].join(', ');
  const TITLE_SEL = 'h1, h2, h3, h4, dt, .cr-name, .tl-phase-l, .row-q';
  const META_SEL = '.tl-date, .cf-ban';
  /* Elements that sit inside a line of text. Every other element starts
     and ends a word, so its text is kept apart from what is around it. */
  const INLINE = new Set(['a', 'em', 'strong', 'b', 'i', 'u', 's', 'small', 'sup',
    'sub', 'mark', 'abbr', 'cite', 'code', 'q', 'time', 'kbd', 'var', 'dfn', 'bdi',
    'bdo', 'wbr']);
  /* A ruling stamp is a link set hard against the date it follows. */
  const breaks = (el) => !INLINE.has(el.localName) || el.classList.contains('chip');

  /* The bars that stick under the nav. Once one has, the box hangs
     under it instead. */
  const STICKY_SEL = '.tl-key, .ct';

  const MAX_SHOWN = 60;
  const HANDOFF = 'cc-search-jump';
  const still = matchMedia('(prefers-reduced-motion: reduce)');

  /* ── Folding: case, accents, curly quotes and dashes ──
     One character in, one out, so a place in the folded text is the
     same place in the original. That is what lets a match found in
     folded text be marked in the page. */
  const folded = new Map();
  function foldChar(ch) {
    let f = folded.get(ch);
    if (f !== undefined) return f;
    if (/\s/.test(ch)) f = ' ';
    else if (/[‘’ʼ′]/.test(ch)) f = "'";
    else if (/[“”″]/.test(ch)) f = '"';
    else if (/[‐‑‒–—―−]/.test(ch)) f = '-';
    else f = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()[0] || ' ';
    folded.set(ch, f);
    return f;
  }
  function fold(s) {
    let out = '';
    for (let i = 0; i < s.length; i++) out += foldChar(s[i]);
    return out;
  }

  const squeeze = (s) => s.replace(/\s+/g, ' ').trim();
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function parseQuery(q) {
    const terms = [...new Set(fold(q).split(' ')
      .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
      .filter(Boolean))];
    return {
      terms,
      phrase: terms.length > 1 ? terms.join(' ') : '',
      starts: terms.map((t) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${escRe(t)}`, 'u')),
    };
  }

  /* ── Reading a page into passages, the way build.py does ── */
  function keyOf(el) {
    if (el.id) return el.id;
    if (el.parentElement?.classList.contains('gloss-l')) return el.querySelector('dt[id]')?.id || '';
    const cls = UNITS.find((c) => el.classList.contains(c));
    return cls ? `${cls}:${[...document.querySelectorAll(`.${cls}`)].indexOf(el)}` : '';
  }

  function unitFor(key) {
    if (!key) return null;
    const m = /^([a-z-]+):(\d+)$/.exec(key);
    if (m && UNITS.includes(m[1])) return document.querySelectorAll(`.${m[1]}`)[+m[2]] || null;
    const el = document.getElementById(key);
    return el?.localName === 'dt' ? el.parentElement : el;
  }

  function textOf(el) {
    const out = [];
    (function walk(e) {
      for (const n of e.childNodes) {
        if (n.nodeType === 3) out.push(n.data);
        else if (n.nodeType === 1 && !n.matches(SKIP_SEL)) {
          const b = breaks(n);
          if (b) out.push(' ');
          walk(n);
          if (b) out.push(' ');
        }
      }
    })(el);
    return squeeze(out.join(''));
  }

  function readPage() {
    const found = new Map();
    const get = (k) => {
      let p = found.get(k);
      if (!p) found.set(k, (p = { k, t: '', m: '', parts: [] }));
      return p;
    };
    (function walk(el, unit, near) {
      for (const n of el.childNodes) {
        if (n.nodeType === 3) {
          const k = unit || near;
          if (k && n.data.trim()) get(k).parts.push(n.data);
          else if (k && found.has(k)) found.get(k).parts.push(' ');
          continue;
        }
        if (n.nodeType !== 1 || n.matches(SKIP_SEL)) continue;
        let u = unit;
        let nid = near;
        const k = n.matches(UNIT_SEL) ? keyOf(n) : '';
        if (k) u = k;
        else if (!unit && n.id) nid = n.id;
        if (u && u === unit) {
          const p = get(u);
          if (!p.t && n.matches(TITLE_SEL)) { p.t = textOf(n); continue; }
          if (!p.m && n.matches(META_SEL)) { p.m = textOf(n); continue; }
        }
        const b = breaks(n);
        const own = u || nid;
        if (b && own) get(own).parts.push(' ');
        walk(n, u, nid);
        if (b && own) get(own).parts.push(' ');
      }
    })(document.body, null, null);

    const out = [];
    for (const p of found.values()) {
      const x = squeeze(p.parts.join(''));
      if (p.t || x) out.push({ u: path, v: '', c: '', k: p.k, t: p.t, m: p.m, x });
    }
    return out;
  }

  /* ── The box ── */
  const pageName = squeeze(document.querySelector('h1')?.textContent || '');
  const label = {
    all: 'Search every case',
    case: pageName ? `Search ${pageName}` : 'Search this case',
    page: 'Search this view',
  };

  const box = document.createElement('div');
  box.className = 'cs';
  box.setAttribute('role', 'search');
  box.innerHTML = `
    <label class="cs-tab">
      <svg class="cs-i" viewBox="0 0 16 16" aria-hidden="true"><circle cx="6.8" cy="6.8" r="4.6"/><path d="m10.2 10.2 3.9 3.9"/></svg>
      <input class="cs-in" type="search" autocomplete="off" spellcheck="false"
        role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="cs-list">
      <kbd class="cs-k" aria-hidden="true">/</kbd>
    </label>
    <div class="cs-pop" hidden>
      <p class="cs-stat" role="status" aria-live="polite"></p>
      <ul class="cs-list" id="cs-list" role="listbox"></ul>
    </div>`;
  const input = box.querySelector('.cs-in');
  const pop = box.querySelector('.cs-pop');
  const stat = box.querySelector('.cs-stat');
  const list = box.querySelector('.cs-list');
  input.placeholder = label[scope];
  input.setAttribute('aria-label', label[scope]);
  document.body.append(box);

  /* ── Where it hangs ── */
  let lastTop = -1;
  let under = '';
  function place() {
    const navBottom = nav.getBoundingClientRect().bottom;
    let top = navBottom;
    let on = 'nav';
    for (const bar of document.querySelectorAll(STICKY_SEL)) {
      if (bar.hidden || getComputedStyle(bar).position !== 'sticky') continue;
      const r = bar.getBoundingClientRect();
      if (r.height && r.top <= navBottom + 6 && r.bottom > navBottom + 1 && r.bottom > top) {
        top = r.bottom;
        on = bar.matches('.tl-key') ? 'key' : 'bar';
      }
    }
    top = Math.round(top);
    if (top !== lastTop) {
      box.classList.toggle('cs-glide', lastTop >= 0 && Math.abs(top - lastTop) > 8 && !still.matches);
      box.style.setProperty('--cs-top', `${top}px`);
      lastTop = top;
    }
    if (on !== under) {
      box.dataset.under = on;
      under = on;
    }
  }
  /* Straight from the event: a browser sends scroll at most once a
     frame already, and place() only reads two or three boxes. A drawer
     opening above can move a bar without a scroll, so the page's
     clicks and transitions are listened for as well. */
  addEventListener('scroll', place, { passive: true });
  addEventListener('resize', place);
  document.addEventListener('click', () => setTimeout(place, 0));
  document.addEventListener('transitionend', place);
  place();

  /* ── Loading what to search ── */
  let entries = null;
  let loading = null;
  let total = 0;
  let done = 0;

  function load() {
    if (loading) return loading;
    if (scope === 'page') {
      entries = readPage();
      return (loading = Promise.resolve());
    }
    entries = [];
    loading = fetch(`${ROOT}search/index.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((man) => {
        const cases = scope === 'all' ? man.cases : man.cases.filter((c) => c.s === slug);
        if (!cases.length) throw new Error('no file for this case');
        total = cases.length;
        return Promise.all(cases.map((c, ci) => fetch(`${ROOT}search/${c.s}.json?h=${c.h}`)
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
          .then((data) => {
            let i = 0;
            for (const pg of data.pages) {
              for (const [k, t, m, x] of pg.e) {
                entries.push({ u: pg.u, v: pg.v, c: data.t, k, t, m, x, o: ci * 1e5 + i++ });
              }
            }
          })
          .catch(() => {})
          .finally(() => { done++; if (input.value.trim()) search(); })));
      })
      .catch(() => {
        /* No file for this case: search the page it is on instead. */
        scope = 'page';
        entries = readPage();
      });
    return loading;
  }

  /* ── Matching ── */
  function score(e, q) {
    const ft = (e.ft ??= fold(`${e.t} ${e.m}`));
    const fx = (e.fx ??= fold(e.x));
    let s = 0;
    if (q.phrase) {
      if (ft.includes(q.phrase)) s += 60;
      else if (fx.includes(q.phrase)) s += 30;
    }
    for (let i = 0; i < q.terms.length; i++) {
      const term = q.terms[i];
      const inT = ft.includes(term);
      const inX = fx.includes(term);
      if (!inT && !inX) return 0;
      if (inT) s += q.starts[i].test(ft) ? 18 : 3;
      if (inX) s += q.starts[i].test(fx) ? 4 : 1;
    }
    return s;
  }

  /* Every place a term falls in [from, to) of folded text, merged. */
  function spans(f, terms, from = 0, to = f.length) {
    const hits = [];
    for (const t of terms) {
      for (let at = f.indexOf(t, from); at >= 0 && at + t.length <= to; at = f.indexOf(t, at + 1)) {
        hits.push([at, at + t.length]);
      }
    }
    hits.sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const h of hits) {
      const last = out[out.length - 1];
      if (last && h[0] <= last[1]) last[1] = Math.max(last[1], h[1]);
      else out.push(h);
    }
    return out;
  }

  function marked(text, f, terms, from, to) {
    const frag = document.createDocumentFragment();
    let at = from;
    for (const [a, b] of spans(f, terms, from, to)) {
      if (a > at) frag.append(text.slice(at, a));
      const m = document.createElement('mark');
      m.textContent = text.slice(a, b);
      frag.append(m);
      at = b;
    }
    if (at < to) frag.append(text.slice(at, to));
    return frag;
  }

  function snippet(e, q) {
    const { x } = e;
    const fx = e.fx;
    let at = q.phrase ? fx.indexOf(q.phrase) : -1;
    if (at < 0) {
      const all = q.terms.map((t) => fx.indexOf(t)).filter((i) => i >= 0);
      at = all.length ? Math.min(...all) : 0;
    }
    let a = Math.max(0, at - 70);
    let b = Math.min(x.length, at + 150);
    if (a > 0) {
      const sp = x.indexOf(' ', a);
      if (sp >= 0 && sp < at) a = sp + 1;
    }
    if (b < x.length) {
      const sp = x.lastIndexOf(' ', b);
      if (sp > at) b = sp;
    }
    const frag = document.createDocumentFragment();
    if (a > 0) frag.append('… ');
    frag.append(marked(x, fx, q.terms, a, b));
    if (b < x.length) frag.append(' …');
    return frag;
  }

  /* ── The list ── */
  let shown = [];
  let active = -1;
  let query = null;

  const where = {
    all: 'in any case',
    case: 'in this case',
    page: 'in this view',
  };

  function open(on) {
    pop.hidden = !on;
    input.setAttribute('aria-expanded', on);
    if (!on) setActive(-1);
  }

  function setActive(i) {
    const items = list.children;
    if (items[active]) items[active].classList.remove('is-active');
    active = i;
    if (items[active]) {
      items[active].classList.add('is-active');
      items[active].scrollIntoView({ block: 'nearest' });
      input.setAttribute('aria-activedescendant', items[active].id);
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function hrefOf(e) {
    return e.k && !e.k.includes(':') ? `${e.u}#${e.k}` : e.u;
  }

  function search() {
    const raw = input.value.trim();
    query = parseQuery(raw);
    list.replaceChildren();
    shown = [];
    active = -1;
    if (raw.length < 2 || !query.terms.length) {
      open(false);
      return;
    }
    open(true);
    if (!entries || (scope !== 'page' && !total && !done)) {
      stat.textContent = 'Opening the search…';
      return;
    }

    const hits = [];
    for (const e of entries) {
      const s = score(e, query);
      if (s) hits.push([s, e]);
    }
    hits.sort((a, b) => b[0] - a[0] || (a[1].o ?? 0) - (b[1].o ?? 0));
    shown = hits.slice(0, MAX_SHOWN).map((h) => h[1]);

    const pending = scope === 'all' && done < total ? ` Still opening ${total - done} of ${total} cases.` : '';
    if (!hits.length) {
      stat.textContent = `Nothing matches “${raw}” ${where[scope]}.${pending}`;
    } else {
      const n = hits.length === 1 ? '1 match' : `${hits.length} matches`;
      stat.textContent = `${n} ${where[scope]}${hits.length > MAX_SHOWN ? `, the best ${MAX_SHOWN} shown` : ''}.${pending}`;
    }

    shown.forEach((e, i) => {
      const li = document.createElement('li');
      li.id = `cs-o-${i}`;
      li.setAttribute('role', 'option');
      const a = document.createElement('a');
      a.className = 'cs-r';
      a.href = hrefOf(e);
      a.tabIndex = -1;
      if (scope !== 'page') {
        const w = document.createElement('span');
        w.className = 'cs-r-w';
        w.textContent = scope === 'all' ? `${e.c} · ${e.v}` : e.v;
        a.append(w);
      }
      const title = e.m && e.t ? `${e.m} · ${e.t}` : e.t || e.m;
      if (title) {
        const t = document.createElement('span');
        t.className = 'cs-r-t';
        t.append(marked(title, fold(title), query.terms, 0, title.length));
        a.append(t);
      }
      if (e.x) {
        const x = document.createElement('span');
        x.className = 'cs-r-x';
        x.append(snippet(e, query));
        a.append(x);
      }
      a.addEventListener('click', (ev) => {
        if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button) return;
        ev.preventDefault();
        choose(e);
      });
      li.append(a);
      list.append(li);
    });
  }

  function choose(e) {
    const q = input.value.trim();
    open(false);
    if (e.u === path) {
      input.blur();
      jump(e.k, q);
      return;
    }
    try {
      sessionStorage.setItem(HANDOFF, JSON.stringify({ u: e.u, k: e.k, q, at: Date.now() }));
    } catch { /* private mode: the link still lands on the card's page */ }
    location.href = hrefOf(e);
  }

  /* ── Going to a card ── */
  /* Whether a word ends between two text nodes: some element that is
     not inline closes after the first or opens before the second. */
  function apart(a, b) {
    const above = new Set();
    for (let e = a.parentElement; e; e = e.parentElement) above.add(e);
    let shared = b.parentElement;
    for (; shared && !above.has(shared); shared = shared.parentElement) {
      if (breaks(shared)) return true;
    }
    for (let e = a.parentElement; e && e !== shared; e = e.parentElement) {
      if (breaks(e)) return true;
    }
    return false;
  }

  function textMap(root) {
    const nodes = [];
    const mapN = [];
    const mapO = [];
    let s = '';
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (t) => (t.parentElement?.closest(SKIP_SEL) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let t = tw.nextNode(); t; t = tw.nextNode()) {
      if (nodes.length && s[s.length - 1] !== ' ' && apart(nodes[nodes.length - 1], t)) {
        const prev = nodes.length - 1;
        s += ' ';
        mapN.push(prev);
        mapO.push(Math.max(0, nodes[prev].length - 1));
      }
      nodes.push(t);
      const d = t.data;
      for (let i = 0; i < d.length; i++) {
        const f = foldChar(d[i]);
        if (f === ' ' && (!s || s[s.length - 1] === ' ')) continue;
        s += f;
        mapN.push(nodes.length - 1);
        mapO.push(i);
      }
    }
    return { s, nodes, mapN, mapO };
  }

  function rangesIn(root, q) {
    const m = textMap(root);
    let found = q.phrase ? spans(m.s, [q.phrase]) : [];
    if (!found.length) found = spans(m.s, q.terms);
    return found.slice(0, 200).map(([a, b]) => {
      const r = document.createRange();
      r.setStart(m.nodes[m.mapN[a]], m.mapO[a]);
      r.setEnd(m.nodes[m.mapN[b - 1]], m.mapO[b - 1] + 1);
      return r;
    });
  }

  /* Open whatever the match is shut inside. */
  const FOLDS = [['.tl-c', '.tl-more'], ['.cf-card, .cf-part', '.cf-more'], ['.party', '.party-more']];
  function reveal(el) {
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      if (a.localName === 'details' && !a.open) a.open = true;
    }
    for (const [card, control] of FOLDS) {
      for (let c = el.closest(card); c; c = c.parentElement?.closest(card)) {
        if (c.classList.contains('is-open')) continue;
        const b = [...c.querySelectorAll(control)].find((x) => x.closest(card) === c && !x.hidden);
        b?.click();
      }
    }
    /* A person in the courtroom is listed only while they are in the
       room, so step the line until they are. */
    const row = el.closest('.cr-who');
    if (row && row.closest('[hidden]')) {
      const seen = () => !row.closest('[hidden]');
      for (const dir of ['.ct-next', '.ct-prev']) {
        const step = document.querySelector(dir);
        for (let n = 0; step && !seen() && !step.disabled && n < 500; n++) step.click();
      }
    }
  }

  /* A little above the middle of the window. A short way is glided,
     the page's own manner; a long way is jumped, since gliding past
     ten thousand pixels of other cards only makes the reader wait.
     The second call, once drawers have opened, only corrects. */
  function scrollTo(target, first) {
    if (target.closest?.('.gloss') || target.startContainer?.parentElement?.closest('.gloss')) {
      const el = target.startContainer ? target.startContainer.parentElement : target;
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      return;
    }
    const r = target.getBoundingClientRect();
    if (!r.height && !r.width) return;
    const y = Math.max(0, scrollY + r.top - innerHeight * 0.38);
    const way = Math.abs(y - scrollY);
    if (!first && way < 24) return;
    const glide = first && way < innerHeight * 2 && !still.matches;
    window.scrollTo({ top: y, behavior: glide ? 'smooth' : 'instant' });
  }

  function jump(key, raw, tries = 0) {
    /* The courtroom is built from the chronology after the page loads. */
    const bar = document.querySelector('.ct');
    if (bar?.hidden && tries < 40) {
      setTimeout(() => jump(key, raw, tries + 1), 100);
      return;
    }
    const q = parseQuery(raw);
    if (!q.terms.length) return;
    let unit = unitFor(key);
    let ranges = unit ? rangesIn(unit, q) : [];
    if (!ranges.length) {
      ranges = rangesIn(document.body, q);
      unit = ranges[0]?.startContainer.parentElement.closest(UNIT_SEL) || null;
    }
    const first = ranges[0]?.startContainer.parentElement || unit;
    if (!first) return;
    reveal(first);

    if (window.CSS?.highlights && window.Highlight) {
      CSS.highlights.set('cc-search', new Highlight(...ranges));
    }
    if (unit) {
      unit.classList.remove('cs-lit');
      void unit.offsetWidth;
      unit.classList.add('cs-lit');
      setTimeout(() => unit.classList.remove('cs-lit'), 2400);
    }
    const target = ranges[0] || unit;
    scrollTo(target, true);
    /* Drawers open with a transition, which moves things under the
       scroll. Settle again once they have. */
    setTimeout(() => scrollTo(target, false), 520);
    /* And once the fonts are in, which reflows every line above it. */
    document.fonts?.ready.then(() => setTimeout(() => scrollTo(target, false), 60));
  }

  /* ── Events ── */
  let typing = 0;
  input.addEventListener('input', () => {
    clearTimeout(typing);
    if (!input.value.trim() && window.CSS?.highlights) CSS.highlights.delete('cc-search');
    load().then(() => {
      typing = setTimeout(search, scope === 'all' ? 90 : 40);
    });
  });
  input.addEventListener('focus', () => {
    load().then(() => { if (input.value.trim().length >= 2) search(); });
  });
  box.addEventListener('pointerenter', () => load(), { once: true });

  input.addEventListener('keydown', (e) => {
    const n = list.children.length;
    if (e.key === 'ArrowDown' && n) {
      e.preventDefault();
      if (pop.hidden) search();
      setActive((active + 1) % n);
    } else if (e.key === 'ArrowUp' && n) {
      e.preventDefault();
      setActive(active <= 0 ? n - 1 : active - 1);
    } else if (e.key === 'Enter') {
      const pick = shown[active] || shown[0];
      if (pick && !pop.hidden) {
        e.preventDefault();
        choose(pick);
      }
    } else if (e.key === 'Escape') {
      if (!pop.hidden) open(false);
      else {
        input.value = '';
        if (window.CSS?.highlights) CSS.highlights.delete('cc-search');
        input.blur();
      }
    }
  });

  /* A press outside closes the list, the way the glossary closes. */
  document.addEventListener('pointerdown', (e) => {
    if (!box.contains(e.target)) open(false);
  });

  /* / goes to the box from anywhere that is not itself taking typing. */
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
    e.preventDefault();
    input.focus();
    input.select();
  });

  /* ── Arriving from a result on another page ── */
  let handoff = null;
  try {
    handoff = JSON.parse(sessionStorage.getItem(HANDOFF) || 'null');
    sessionStorage.removeItem(HANDOFF);
  } catch { /* nothing handed over */ }
  if (handoff && handoff.u === path && Date.now() - handoff.at < 60000) {
    input.value = handoff.q;
    /* A timer, not requestAnimationFrame, which a page not yet painted
       (or in a background tab) never runs. */
    const go = () => setTimeout(() => jump(handoff.k, handoff.q), 0);
    /* Once the page's own scripts have run, not once every font and
       tag has arrived: jump() settles again after things move. */
    if (document.readyState === 'loading') addEventListener('DOMContentLoaded', go, { once: true });
    else go();
  }
})();
