/* ═══════════════════════════════════════════════
   hire-me.js — /hire-me/
   frontendneeded.com

   The page works without this file: every line in the stack stands open,
   the lens still changes the paragraph under it (that is CSS), and the
   table's dots are plain links. What this adds, in the order it appears
   below:

     the table   checked against the lines it points at, so a dot cannot
                 outlive its sentence or a sentence go without its dot,
                 and a tip on each dot saying what filled and ring mean
     the lens    which lines stand open, which dots are solid, which
                 starter questions show, and the address (?lens=support)
     following   pick a name in the table and the page becomes that one
                 job or project, down the layers it touches
     the probe   the assistant: built from the page's own text, streamed,
                 stoppable, and it lights the layers its answer drew on
     three questions   the feedback form at the foot

   Nothing here is stored in the browser and nothing identifies a reader.
   ═══════════════════════════════════════════════ */

(() => {
  'use strict';

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const tidy = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  const matrix = $('.matrix');
  const strata = $('#stack');
  if (!matrix || !strata) return;

  const lines = $$('.ev', strata);
  const layers = $$('.layer', strata);
  const heads = $$('thead th[data-entry]', matrix);
  const entries = heads.map((th) => th.dataset.entry);
  const rows = $$('tbody tr', matrix);

  const track = (name, detail) => {
    try { if (typeof window.gtag === 'function') window.gtag('event', name, detail || {}); } catch (e) { /* never break the page for analytics */ }
  };

  /* ═══════════════════════════════════════════════
     THE TABLE

     A cell is found by its line's id, layer-entry. Each cell learns its
     column here so the rest of the file can ask a cell whose it is.

     Then the check. The markup already carries every dot, so with no script
     the table is right as written. But a line added to the page by hand
     should not need the table edited too, and a line taken out should not
     leave a dot pointing at nothing. So the lines are the truth: a cell
     with a line gets a dot if it lacks one, and a dot with no line is
     removed.
     ═══════════════════════════════════════════════ */

  const cells = {};
  const headOf = {};
  heads.forEach((th) => { headOf[th.dataset.entry] = th; });

  rows.forEach((tr) => {
    const layer = tr.dataset.layer;
    const label = tidy($('th b', tr).textContent);
    $$('td', tr).forEach((td, i) => {
      const entry = entries[i];
      if (!entry) return;
      td.dataset.entry = entry;
      const id = `${layer}-${entry}`;
      cells[id] = td;

      const line = document.getElementById(id);
      const dot = $('a', td);
      if (line && !dot) {
        const a = document.createElement('a');
        a.href = `#${id}`;
        a.tabIndex = -1;
        a.setAttribute('aria-label', `${label}: ${tidy($('span', headOf[entry]).textContent)}`);
        td.append(a);
      } else if (!line && dot) {
        dot.remove();
      }
    });
  });

  /* A name under the pointer swells its own dots, so a column can be read
     down without a ruler. */
  const hot = (entry, on) => {
    rows.forEach((tr) => {
      const td = cells[`${tr.dataset.layer}-${entry}`];
      if (td) td.classList.toggle('is-hot', on);
    });
  };
  heads.forEach((th) => {
    th.addEventListener('pointerenter', () => hot(th.dataset.entry, true));
    th.addEventListener('pointerleave', () => hot(th.dataset.entry, false));
  });

  /* ═══════════════════════════════════════════════
     THE LENS

     A line says who it is evidence for in data-lens. Under a lens, the
     lines that match stand open with a dot beside the name; the rest shut
     to their name and can still be opened by hand. Their cells in the table
     turn from dots to rings. "Everything" opens the lot.

     The lens is in the address as ?lens=, so a link can be made for each
     kind of job. It is replaced, not pushed: Back should leave the page,
     not walk back through every lens tried.
     ═══════════════════════════════════════════════ */

  const LENSES = ['automation', 'software', 'support', 'all'];
  const LENS_NAME = { automation: 'Automation', software: 'Software', support: 'Support' };
  const radios = $$('input[name="lens"]');
  const chips = $('#askChips');
  let lens = 'automation';
  let following = null;

  const wants = (line, which) => which === 'all' || (line.dataset.lens || '').split(/\s+/).includes(which);

  /* What a dot means under the lens that is on: said by the tip on hover,
     and added to the dot's own label for a screen reader. */
  function meaning(td) {
    if (lens === 'all') return 'Work I did at this layer.';
    return td.classList.contains('is-off-lens')
      ? `Ring: real work, just not what the ${LENS_NAME[lens]} tab is about.`
      : `Filled: this work counts toward the ${LENS_NAME[lens]} tab.`;
  }

  function setLens(next, opts = {}) {
    if (!LENSES.includes(next)) next = 'automation';
    lens = next;

    lines.forEach((line) => {
      const hit = wants(line, lens);
      line.classList.toggle('is-lens', hit && lens !== 'all');
      if (!following) line.open = hit;
      const td = cells[line.id];
      if (!td) return;
      td.classList.toggle('is-off-lens', !hit);
      const dot = $('a', td);
      if (dot) {
        if (dot.dataset.label == null) dot.dataset.label = dot.getAttribute('aria-label') || '';
        dot.setAttribute('aria-label', `${dot.dataset.label}. ${meaning(td)}`);
      }
    });

    if (chips) {
      $$('button', chips).forEach((b) => b.classList.toggle('is-on', b.dataset.for === lens));
    }

    if (opts.address !== false) {
      const url = new URL(location.href);
      if (lens === 'automation') url.searchParams.delete('lens');
      else url.searchParams.set('lens', lens);
      history.replaceState(null, '', url);
    }
  }

  radios.forEach((r) => {
    r.addEventListener('change', () => {
      if (!r.checked) return;
      setLens(r.value);
      track('hire_me_lens', { lens: r.value });
    });
  });

  /* ── what a dot means, on hover ──
     One tip for the whole table, set beside the dot under the pointer. It
     lives outside the table's scroll box, which would otherwise clip it at
     the edges. Its words are read from the lens at the moment of hovering,
     so they are always about the dot as it is drawn. A mouse only: on a
     touch screen a tap already goes to the line, and a tip would only
     flash on the way there. */

  const tip = document.createElement('div');
  const tipWhere = document.createElement('b');
  const tipSay = document.createElement('span');
  tip.className = 'dot-tip';
  tip.hidden = true;
  tip.setAttribute('aria-hidden', 'true');     /* the dot's own label already says it */
  tip.append(tipWhere, tipSay);
  document.body.append(tip);

  const barH = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bar-h')) || 44;

  function showTip(a) {
    const td = a.closest('td');
    tipWhere.textContent = `${tidy($('span', headOf[td.dataset.entry]).textContent)} · ${tidy($('th b', td.closest('tr')).textContent)}`;
    tipSay.textContent = `${meaning(td)} Click to read it.`;

    tip.style.left = '0px';                    /* measured at full width, then placed */
    tip.style.top = '0px';
    tip.hidden = false;
    const cell = a.getBoundingClientRect();
    const box = tip.getBoundingClientRect();
    const x = cell.left + cell.width / 2;
    const y = cell.top + cell.height / 2;
    const reach = 18;                          /* from the dot's centre to the tip's point */

    let top = y - reach - box.height;
    const below = top < barH() + 8;            /* no room above, under the bar: go under the dot */
    if (below) top = y + reach;
    const left = Math.min(Math.max(8, x - box.width / 2), innerWidth - box.width - 8);

    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
    tip.style.setProperty('--point', `${Math.round(x - left)}px`);
    tip.classList.toggle('is-below', below);
  }

  const hideTip = () => { tip.hidden = true; };

  matrix.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const a = e.target.closest('td a');
    if (a) showTip(a);
  });
  matrix.addEventListener('pointerout', (e) => {
    const a = e.target.closest('td a');
    if (a && !a.contains(e.relatedTarget)) hideTip();
  });
  matrix.addEventListener('click', hideTip);
  document.addEventListener('scroll', hideTip, { capture: true, passive: true });

  /* ═══════════════════════════════════════════════
     FOLLOWING ONE NAME

     The stack is sorted by layer, which is the point of the page and is
     also the wrong order for someone who wants to read about one job. So a
     name in the table turns the page on its side: only that name's lines
     are left, in the layers it touches, top to bottom. The bar that
     appears says whose they are, from the short version's own row, and
     takes it all back. So does Escape, and so does the same name again.
     ═══════════════════════════════════════════════ */

  const bar = $('#follow');
  const barName = $('#followName');
  const barWhat = $('#followWhat');

  function follow(entry, opts = {}) {
    following = entry || null;

    matrix.classList.toggle('is-following', !!following);
    strata.classList.toggle('is-following', !!following);

    heads.forEach((th) => {
      const on = th.dataset.entry === following;
      th.classList.toggle('is-followed', on);
      const a = $('a', th);
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });

    Object.values(cells).forEach((td) => td.classList.toggle('is-followed', td.dataset.entry === following));

    lines.forEach((line) => {
      const on = line.dataset.entry === following;
      line.classList.toggle('is-followed', on);
      if (on) line.open = true;
    });

    layers.forEach((sec) => sec.classList.toggle('has-followed', !!following && !!$('.ev.is-followed', sec)));

    if (following) {
      const rec = document.getElementById(`rec-${following}`);
      barName.textContent = rec ? tidy($('b', rec).textContent) : following;
      const what = rec && $('.rec-what', rec);
      const when = rec && $('.rec-when', rec);
      barWhat.textContent = [what && tidy(what.textContent), when && tidy(when.textContent)].filter(Boolean).join(' · ');
      bar.hidden = false;
      if (opts.scroll !== false) {
        const first = $('.layer.has-followed', strata) || strata;
        first.scrollIntoView({ block: 'start' });
      }
      track('hire_me_follow', { entry: following });
    } else {
      bar.hidden = true;
      setLens(lens, { address: false });   /* put the lines back the way the lens had them */
    }
  }

  heads.forEach((th) => {
    $('a', th).addEventListener('click', (e) => {
      e.preventDefault();
      follow(following === th.dataset.entry ? null : th.dataset.entry);
    });
  });

  $('#followClear').addEventListener('click', () => {
    follow(null);
    $('#matrix').scrollIntoView({ block: 'center' });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && following) follow(null);
  });

  /* ── a dot, a layer's name, or an address with a line in it ──
     Going to a line means it has to be there to arrive at: on the page
     (not hidden by a name being followed) and open (not shut by the lens). */

  function arrive(line) {
    if (following && line.dataset.entry !== following) follow(null, { scroll: false });
    line.open = true;
    line.classList.remove('is-arrived');
    void line.offsetWidth;                 /* so the same line can flash twice */
    line.classList.add('is-arrived');
    line.scrollIntoView({ block: 'center' });
    $('summary', line).focus({ preventScroll: true });
  }

  matrix.addEventListener('click', (e) => {
    const dot = e.target.closest('td a');
    if (dot) {
      const line = document.getElementById(dot.hash.slice(1));
      if (!line) return;
      e.preventDefault();
      arrive(line);
      return;
    }
    /* A layer's name goes to the whole layer, which may be hidden while a
       name is being followed. */
    if (e.target.closest('tbody th a') && following) follow(null, { scroll: false });
  });

  lines.forEach((line) => line.addEventListener('animationend', () => line.classList.remove('is-arrived')));

  /* ═══════════════════════════════════════════════
     THE PROBE

     The assistant is Llama 3 behind /api/chat, which is server/chat.py and
     not Ollama itself. The page sends only the conversation. What the model
     knows is built on the server, from server/prompt.txt and this page's
     own lines in index.html, so an edit to the page needs no second edit.
     The model, its settings and the limits are the server's to choose; a
     refusal comes back with a sentence to show (say), which is shown.

     The answer is streamed. Ollama sends one JSON object a line; the last
     one has done:true and the timings, which become the receipt under the
     answer. If the proxy in front of it holds the lines back and sends
     them together, the same loop reads them just the same, only later.

     Then the answer is read for what it is about. Words that belong to a
     layer light that layer's row in the table; a job or project named
     lights its column. That is a word list below and not a second question
     to the model: a small model asked to tag its own answer gets it wrong
     often enough to be worse than no tags.
     ═══════════════════════════════════════════════ */

  const CHAT = '/api/chat';
  const MODEL_NAME = 'Llama 3 on an RTX 2070 Super';
  const KEEP_TURNS = 6;              /* messages of the conversation sent back each time */
  const GIVE_UP_MS = 90000;
  const SLOW_MS = 4000;

  const probe = $('#ask');
  const form = $('#askForm');
  const input = $('#askInput');
  const send = $('#askSend');
  const out = $('#askOut');
  const receipt = $('#askReceipt');
  const intro = $('.probe-intro', probe);

  let talk = [];
  let busy = false;
  let ctrl = null;

  /* ── what an answer is about ── */

  const LAYER_WORDS = {
    people: ['support', 'call', 'customer', 'technician', 'installer', 'escalat', 'documentation', 'knowledge-base', 'knowledge base', 'team lead', 'stakeholder', 'ticket', 'feedback from'],
    interface: ['html', 'css', 'javascript', 'react', 'swiftui', 'front end', 'front-end', 'frontend', 'accessib', 'pagespeed', 'interface', 'landing page', 'seo', 'core web vitals', 'overlay', 'dashboard'],
    application: ['python', 'flask', 'java ', 'swift', 'automated test', 'tests', 'playwright', 'ocr', 'harness', 'extension', 'root-cause', 'root cause', 'installer through'],
    data: ['sqlite', 'api', 'rest ', 'cach', 'rate limit', 'rate-limit', 'webhook', 'json', 'ga4', 'analytics', 'structured data', 'structured-data', 'espn'],
    ai: ['llama', 'ollama', 'model', 'pytorch', 'onnx', 'tensorrt', 'yolo', 'inference', ' ai ', 'ai-', 'llm', 'scheduleai', 'noteguardai', 'benchmark'],
    systems: ['linux', 'fedora', 'apache', 'systemd', 'server', 'deploy', 'git', 'self-host', 'monitor', 'operating system', 'windows', 'reverse proxy', 'reverse-prox'],
    network: ['cellular', 'vpn', 'ethernet', 'dns', 'tls', 'ssl', 'network', 'connectivity', 'offline', 'wired internet'],
    hardware: ['hardware', 'wiring', 'voltage', 'multimeter', 'circuit', 'firmware', 'low-voltage', 'pcs', ' pc ', 'pos ', 'printer', 'gpu', 'rtx', 'keyboard', 'board']
  };

  const ENTRY_WORDS = {
    cellgate: ['cellgate', 'alarm.com'],
    ceufast: ['ceufast'],
    centralreach: ['centralreach', 'scheduleai', 'noteguardai'],
    topgolf: ['topgolf'],
    fen: ['frontendneeded', 'front end needed', 'fen ', 'this site', 'this page', 'match analysis', 'fresh pull', 'cadence'],
    pbs: ['preside by side'],
    chronicle: ['case chronicle'],
    trtbench: ['trtbench', 'tensorrt', 'yolov8'],
    wfpc: ['wfpc', 'warframe'],
    tarella: ['tarella']
  };

  const rowOf = {};
  rows.forEach((tr) => { rowOf[tr.dataset.layer] = tr; });

  function unlight() {
    rows.forEach((tr) => tr.classList.remove('is-lit'));
    $$('.is-lit-col', matrix).forEach((el) => el.classList.remove('is-lit-col'));
  }

  function light(text) {
    const t = ` ${text.toLowerCase().replace(/[.,;:!?()"]/g, ' ')} `;

    const named = Object.keys(ENTRY_WORDS).filter((entry) => ENTRY_WORDS[entry].some((w) => t.includes(w)));

    const scored = Object.keys(LAYER_WORDS)
      .map((layer) => ({ layer, n: LAYER_WORDS[layer].filter((w) => t.includes(w)).length }))
      .filter((s) => s.n > 0)
      .sort((a, b) => b.n - a.n);

    let lit = scored.slice(0, 3).map((s) => s.layer);

    /* An answer that names a job but uses none of the words: light the
       layers that job has a line in. */
    if (!lit.length && named.length) {
      lit = rows.map((tr) => tr.dataset.layer).filter((layer) => named.some((entry) => document.getElementById(`${layer}-${entry}`)));
    }

    unlight();
    const order = rows.map((tr) => tr.dataset.layer);
    lit = order.filter((layer) => lit.includes(layer));       /* stack order, top down */
    lit.forEach((layer) => rowOf[layer].classList.add('is-lit'));

    named.slice(0, 4).forEach((entry) => {
      headOf[entry].classList.add('is-lit-col');
      rows.forEach((tr) => {
        const td = cells[`${tr.dataset.layer}-${entry}`];
        if (td && $('a', td)) td.classList.add('is-lit-col');
      });
    });

    return lit;
  }

  /* ── drawing the exchange ── */

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function lock(on) {
    busy = on;
    input.disabled = on;
    send.textContent = on ? 'Stop' : 'Ask';
    if (chips) $$('button', chips).forEach((b) => { b.disabled = on; });
  }

  function unreachable() {
    const note = el('p', 'probe-note');
    note.append(
      'The model isn\'t answering right now. Everything it knows is on this page, or you can email me at ',
      Object.assign(el('a', null, 'keypanzarella@gmail.com'), { href: 'mailto:keypanzarella@gmail.com' }),
      '.'
    );
    return note;
  }

  async function ask(question) {
    question = tidy(question).slice(0, 300);
    if (!question || busy) return;

    lock(true);
    unlight();
    intro.hidden = true;
    probe.classList.add('has-answer');
    out.replaceChildren();
    receipt.textContent = 'Asking.';

    const q = el('p', 'probe-q', question);
    const a = el('p', 'probe-a is-live');
    out.append(q, a);

    const messages = talk.concat([{ role: 'user', content: question }]);

    let text = '';
    let last = null;
    let firstAt = 0;
    let stopped = false;
    let failed = false;
    let refusal = '';
    const began = performance.now();

    ctrl = new AbortController();
    const giveUp = setTimeout(() => ctrl.abort(), GIVE_UP_MS);
    const slow = setTimeout(() => {
      if (!firstAt) receipt.textContent = 'Waking the model up. The first answer after a quiet spell takes a little longer.';
    }, SLOW_MS);

    const take = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      if (obj.error) throw new Error(obj.error);
      const piece = obj.message && obj.message.content;
      if (piece) {
        if (!firstAt) { firstAt = performance.now(); receipt.textContent = ''; }
        text += piece;
        a.textContent = text;   /* the box stays on the first words; the reader scrolls */
      }
      if (obj.done) last = obj;
    };

    const takeLine = (line) => {
      line = line.trim();
      if (!line) return;
      let obj;
      try { obj = JSON.parse(line); } catch (e) { return; }   /* half a line is not an error, it is early */
      take(obj);
    };

    try {
      const res = await fetch(CHAT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
        signal: ctrl.signal
      });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        try { err.say = (await res.json()).say; } catch (e) { /* Apache's own error page */ }
        throw err;
      }

      if (res.body && res.body.getReader) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let held = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          held += decoder.decode(value, { stream: true });
          let cut;
          while ((cut = held.indexOf('\n')) >= 0) {
            takeLine(held.slice(0, cut));
            held = held.slice(cut + 1);
          }
        }
        takeLine(held);
      } else {
        take(await res.json());
      }
    } catch (err) {
      if (err && err.name === 'AbortError') stopped = true;
      else { failed = true; refusal = (err && typeof err.say === 'string') ? err.say : ''; }
    } finally {
      clearTimeout(giveUp);
      clearTimeout(slow);
      ctrl = null;
    }

    a.classList.remove('is-live');
    text = text.trim();

    if (!text) {
      /* Nothing came back: say so in the page's own words, and keep the
         question out of the conversation so the next one starts clean. */
      a.remove();
      if (stopped && performance.now() - began < GIVE_UP_MS - 500) {
        receipt.textContent = 'Stopped.';
      } else if (refusal) {
        /* The server's sentence, with the email made a link like unreachable()'s. */
        const mail = 'keypanzarella@gmail.com';
        const [before, after] = refusal.split(mail);
        const note = el('p', 'probe-note', before);
        if (after !== undefined) note.append(Object.assign(el('a', null, mail), { href: `mailto:${mail}` }), after);
        out.append(note);
        receipt.textContent = '';
      } else {
        out.append(unreachable());
        receipt.textContent = '';
      }
      lock(false);
      return;
    }

    a.textContent = text;
    talk = talk.concat([{ role: 'user', content: question }, { role: 'assistant', content: text }]).slice(-KEEP_TURNS);

    const lit = light(`${question} ${text}`);
    if (lit.length) {
      const tags = el('p', 'probe-tags');
      tags.append(el('span', null, 'Where that lives'));
      lit.forEach((layer) => {
        tags.append(Object.assign(el('a', null, tidy($('th b', rowOf[layer]).textContent)), { href: `#${layer}` }));
      });
      out.append(tags);
    }

    /* The receipt. Ollama times itself in nanoseconds; the wait for the
       first word is timed here, because that is the part a reader feels. */
    const bits = [MODEL_NAME];
    if (firstAt) bits.push(`first word in ${((firstAt - began) / 1000).toFixed(1)} s`);
    if (last && last.eval_count && last.eval_duration) {
      bits.push(`${Math.round(last.eval_count / (last.eval_duration / 1e9))} tokens a second`);
    }
    if (stopped) bits.push('stopped');
    else if (failed) bits.push('cut off');
    else if (last && last.done_reason === 'length') bits.push('cut short');
    receipt.textContent = bits.join(' · ');

    lock(false);
    track('hire_me_ask', { lens });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy) { if (ctrl) ctrl.abort(); return; }
    const question = input.value;
    input.value = '';
    ask(question);
  });

  if (chips) {
    chips.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b && !busy) ask(b.textContent);
    });
    chips.hidden = false;
  }

  /* A tag under an answer goes to a layer, which may be hidden. */
  out.addEventListener('click', (e) => {
    if (e.target.closest('.probe-tags a') && following) follow(null, { scroll: false });
  });

  input.disabled = false;
  send.disabled = false;

  /* ── the way back to it ──
     Shown only once the panel has scrolled off the screen. */
  const fab = $('#askFab');
  if (fab && 'IntersectionObserver' in window) {
    new IntersectionObserver((seen) => {
      fab.hidden = seen[0].isIntersecting;
    }).observe(probe);
    fab.addEventListener('click', () => setTimeout(() => input.focus({ preventScroll: true }), 0));
  }

  /* ═══════════════════════════════════════════════
     THREE QUESTIONS

     Same service as the Case Chronicle's notes form and the Preside by
     Side suggestion box, on its own route. Every answer is one of a closed
     set and the service checks it against its own copy, so nothing here
     is trusted; the cooldown only stops a double click becoming two rows.

     A radio cannot normally be un-picked. These can, by pressing the
     picked one again, because "skip this one" has to stay possible after
     a slip of the finger.
     ═══════════════════════════════════════════════ */

  const fb = $('#fb-form');
  if (fb) {
    const ENDPOINT = '/api/suggest/hire-me';
    const COOLDOWN_MS = 4000;
    const status = $('#fb-status');
    const sendFb = $('.fb-send', fb);
    const picked = {};
    let lastSent = 0;

    const say = (text, kind) => {
      status.textContent = text;
      status.classList.remove('is-error', 'is-success');
      if (kind) status.classList.add(`is-${kind}`);
    };

    $$('input[type="radio"]', fb).forEach((r) => {
      r.addEventListener('click', () => {
        if (picked[r.name] === r.value) {
          r.checked = false;
          delete picked[r.name];
        } else {
          picked[r.name] = r.value;
        }
      });
    });

    fb.addEventListener('submit', async (e) => {
      e.preventDefault();

      const now = Date.now();
      if (now - lastSent < COOLDOWN_MS) return;

      const data = new FormData(fb);
      const field = (name) => String(data.get(name) ?? '').trim();

      /* Honeypot. Accept and discard, so a bot never learns it was caught. */
      if (field('website') !== '') {
        say('Sent. Thank you.', 'success');
        fb.reset();
        return;
      }

      const body = {
        best: field('best'),
        role: field('role'),
        reader: field('reader'),
        note: field('note'),
        lens,
        website: ''
      };

      if (!body.best && !body.role && !body.reader && !body.note) {
        say('Pick an answer or leave a note first.', 'error');
        return;
      }

      lastSent = now;
      sendFb.disabled = true;
      const label = sendFb.textContent;
      sendFb.textContent = 'Sending';
      say('', null);

      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) {
          const reply = await res.json().catch(() => null);
          throw new Error((reply && reply.error) || `HTTP ${res.status}`);
        }
        say('Sent. Thank you, I read all of these.', 'success');
        fb.reset();
        Object.keys(picked).forEach((k) => delete picked[k]);
        track('hire_me_feedback', { best: body.best, role: body.role, reader: body.reader });
      } catch (err) {
        /* The browser's own words for a request that never arrived say
           nothing to a reader. Only the service's are passed on. */
        const own = err instanceof TypeError || /^HTTP \d+$/.test(err.message);
        say(own ? 'Could not send. Try again in a moment.' : `Could not send: ${err.message}.`, 'error');
        lastSent = 0;
      } finally {
        sendFb.disabled = false;
        sendFb.textContent = label;
      }
    });

    say('', null);
    sendFb.disabled = false;
  }

  /* ═══════════════════════════════════════════════
     ON ARRIVAL
     ═══════════════════════════════════════════════ */

  const asked = new URLSearchParams(location.search).get('lens');
  if (asked && LENSES.includes(asked)) {
    const r = radios.find((x) => x.value === asked);
    if (r) r.checked = true;
  }
  const checked = radios.find((x) => x.checked);
  setLens(checked ? checked.value : 'automation', { address: false });

  /* An address that names a line: open it and show it, whatever the lens
     did to it a moment ago. */
  const at = location.hash && document.getElementById(location.hash.slice(1));
  if (at && at.classList.contains('ev')) arrive(at);
})();
