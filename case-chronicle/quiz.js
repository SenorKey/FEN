/* ═══════════════════════════════════════════════
   Case Intuition Quiz

   The page works without this file. Every question, every answer and
   every explanation is in the markup, and quiz.css shows them as the
   reader picks. This adds the two things that cannot be done there:

     - how other readers answered: each pick is sent to the service
       behind /api/suggest/quiz/answer, which counts it and sends the
       totals back, and those are drawn under the explanation
     - the reader type at the end, worked out from the picks against
       what the record shows, and how everyone else's came out

   It also locks a question once its answer has been sent, so the
   numbers count first answers rather than second thoughts.

   Everything about the case is read from the page: the questions and
   what the record shows on each from their attributes, the seven
   reader types and their lines from the list at the end. Nothing here
   names a case, so another case's quiz page can load this as it is.

   A run is one go at the quiz in one tab: an id made up here and kept
   in sessionStorage with the answers, so a reload carries on where it
   was and the service can tell a reload from a second reader. Take it
   again starts a new run. Nothing is kept once the tab is closed.

   ── what can be in which state ──

   Each of these has one function that writes it, and nothing else
   touches the parts it owns:

     the run              load() from sessionStorage, newRun(), and
                          answer(). sessionStorage is the truth; the
                          two variables below are a copy of it.

     a numbers panel      paint(). Both the panel under an answer
     (.qz-crowd, and      and How everyone landed. data-state says
      .qz-dist)           which it is in:
                            off       hidden, nothing in it
                            counting  "Counting…" while the reply
                                      is on its way
                            few       the service answered, but
                                      with too few readers to split
                            split     the bars
                          A failed request goes back to off.

     the end card         paintEnd(). data-state on .qz-end:
                            waiting   questions still to answer
                            result    a reader type, its line, the
                                      distribution, and Take it again

   A reply from the service is drawn only if the run that asked is
   still the run (current()), so an answer sent before Take it again,
   or before the Back button brought this page back, can't draw over
   what the reader is doing now.
   ═══════════════════════════════════════════════ */

(() => {
  const root = document.querySelector('.qz');
  if (!root) return;

  const QUIZ = root.dataset.quiz;
  const KEY = root.dataset.key || '';
  const STRONG = Number(root.dataset.strong) || 4;
  const MILD = Number(root.dataset.mild) || 2;
  const KNOWER = Number(root.dataset.knower) || 8;
  const FENCE = Number(root.dataset.fence) || 3;

  const ANSWER_URL = '/api/suggest/quiz/answer';
  const RESULT_URL = '/api/suggest/quiz/result';

  const CHOICES = ['yes', 'unsure', 'no'];
  const WORDS = { yes: 'Yes', unsure: 'Unsure', no: 'No' };
  const NUMBERS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six',
    'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

  const questions = [...root.querySelectorAll('.qz-q')];
  const ids = new Set(questions.map((q) => q.dataset.q));
  const end = root.querySelector('.qz-end');
  const types = new Map(
    [...root.querySelectorAll('.qz-types [data-type]')].map((li) => [li.dataset.type, li])
  );

  const all = NUMBERS[questions.length] || String(questions.length);

  /* One quiet line for a screen reader, said once per pick: the
     opening line and the record's answer. The explanation itself is
     read in order after the answers, the way the page reads anyway.
     Made here rather than in the markup, since without this file
     there is nothing to say. */
  const status = document.createElement('p');
  status.className = 'vh';
  status.setAttribute('role', 'status');
  root.append(status);

  /* ── the run ── */

  const store = {
    get(k) { try { return sessionStorage.getItem(`qz:${QUIZ}:${k}`); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(`qz:${QUIZ}:${k}`, v); } catch { /* private mode */ } },
  };

  let run = '';
  let answers = {};

  /* Read the run from sessionStorage. An answer is kept only if it is
     to a question on this page and is one of the three choices, so
     something left from an older version of the page can't lock a
     question nobody has answered. */
  function load() {
    run = store.get('run') || '';
    if (!/^[0-9a-f]{24}$/.test(run)) { newRun(); return; }
    let saved = {};
    try { saved = JSON.parse(store.get('answers') || '{}') || {}; } catch { saved = {}; }
    answers = {};
    for (const [id, choice] of Object.entries(saved)) {
      if (ids.has(id) && CHOICES.includes(choice)) answers[id] = choice;
    }
  }

  function newRun() {
    const b = new Uint8Array(12);
    crypto.getRandomValues(b);
    run = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    answers = {};
    store.set('run', run);
    store.set('answers', '{}');
  }

  function answer(id, choice) {
    answers[id] = choice;
    store.set('answers', JSON.stringify(answers));
  }

  /* For a reply: is the run that asked still the one on the page? */
  const current = (asked) => asked === run;

  /* ── the service ──
     The service decides when there are enough answers to show a split,
     and sends the counts only then (QUIZ_MIN_DISPLAY in suggest.py).
     Until it does, the reply has the total alone. */

  async function post(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quiz: QUIZ, run, v: KEY, ...body }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  /* Shares that add to a hundred. Each is rounded down, and what that
     loses goes to the ones that lost most, so 33.4, 33.3 and 33.3 come
     out 34, 33 and 33 rather than 33, 33 and 33. */
  function shares(counts, keys) {
    const total = keys.reduce((s, k) => s + (counts[k] || 0), 0);
    if (!total) return Object.fromEntries(keys.map((k) => [k, 0]));
    const raw = keys.map((k) => ({ k, x: ((counts[k] || 0) * 100) / total }));
    raw.forEach((r) => { r.n = Math.floor(r.x); });
    let left = 100 - raw.reduce((s, r) => s + r.n, 0);
    [...raw].sort((a, b) => (b.x - b.n) - (a.x - a.n)).forEach((r) => { if (left > 0) { r.n += 1; left -= 1; } });
    return Object.fromEntries(raw.map((r) => [r.k, r.n]));
  }

  function bars(rows, you) {
    const wrap = document.createElement('div');
    wrap.className = 'qz-bars';
    const fills = [];
    for (const { key, label, pct } of rows) {
      const row = document.createElement('div');
      row.className = 'qz-bar' + (key === you ? ' is-you' : '');
      const k = document.createElement('span');
      k.className = 'qz-bar-k';
      k.textContent = label;
      const t = document.createElement('span');
      t.className = 'qz-bar-t';
      const f = document.createElement('span');
      f.className = 'qz-bar-f';
      t.append(f);
      const n = document.createElement('span');
      n.className = 'qz-bar-n';
      n.textContent = `${pct}%`;
      row.append(k, t, n);
      wrap.append(row);
      fills.push([f, pct]);
    }
    /* Widths set after the bars are in the page, so they grow from
       nothing. Two frames, once for the whole set. */
    requestAnimationFrame(() => requestAnimationFrame(() => {
      for (const [f, pct] of fills) f.style.setProperty('--w', `${pct}%`);
    }));
    return wrap;
  }

  function line(text) {
    const p = document.createElement('p');
    p.className = 'qz-crowd-n';
    p.textContent = text;
    return p;
  }

  /* The one writer for a numbers panel. */
  function paint(el, state, { title = '', text = '', rows = null, you = null } = {}) {
    el.dataset.state = state;
    el.hidden = state === 'off';
    if (state === 'off') { el.replaceChildren(); return; }
    const head = document.createElement('p');
    head.className = 'qz-crowd-h';
    head.textContent = title;
    if (state === 'split') el.replaceChildren(head, bars(rows, you), line(text));
    else el.replaceChildren(head, line(state === 'counting' ? 'Counting…' : text));
  }

  const readers = (n) => `${n.toLocaleString('en-US')} ${n === 1 ? 'reader' : 'readers'} so far`;

  /* ── a question ── */

  function lock(q, choice) {
    for (const r of q.querySelectorAll('.qz-r')) {
      r.checked = r.value === choice;
      r.disabled = r.value !== choice;
    }
  }

  function unlock(q) {
    for (const r of q.querySelectorAll('.qz-r')) { r.checked = false; r.disabled = false; }
    paint(q.querySelector('.qz-crowd'), 'off');
  }

  /* Which opening line quiz.css shows for this pick, worked out the
     same way its selectors do. */
  function verdict(q, choice) {
    const rec = q.dataset.record;
    if (rec === 'open') return choice === 'unsure' ? 'match' : `open-${choice}`;
    if (choice === rec) return 'match';
    return choice === 'unsure' ? 'unsure' : 'miss';
  }

  function say(q, choice) {
    const open = q.querySelector(`.qz-v-${verdict(q, choice)}`);
    const stamp = q.querySelector('.cf-stamp');
    status.textContent = [open, stamp]
      .filter(Boolean)
      .map((el) => el.textContent.replace(/\s*·\s*/, ': ').trim())
      .join(' ');
  }

  const HOW = 'How readers answered';

  async function count(q, choice) {
    const crowd = q.querySelector('.qz-crowd');
    const asked = run;
    paint(crowd, 'counting', { title: HOW });

    let reply;
    try {
      reply = await post(ANSWER_URL, { q: q.dataset.q, choice });
    } catch {
      /* The service is down or refused it. The explanation still
         stands, so the numbers just are not shown. */
      if (current(asked)) paint(crowd, 'off');
      return;
    }
    if (!current(asked)) return;

    const total = reply.total || 0;
    if (!reply.counts) {
      paint(crowd, 'few', { title: HOW, text: 'Not enough answers yet to show how other readers chose. Check back once more people have taken it.' });
      return;
    }
    const pct = shares(reply.counts, CHOICES);
    paint(crowd, 'split', {
      title: HOW,
      rows: CHOICES.map((k) => ({ key: k, label: WORDS[k], pct: pct[k] })),
      you: choice,
      text: readers(total),
    });
  }

  for (const q of questions) {
    q.addEventListener('change', (e) => {
      const r = e.target.closest('.qz-r');
      if (!r || !r.checked || answers[q.dataset.q]) return;
      answer(q.dataset.q, r.value);
      lock(q, r.value);
      say(q, r.value);
      count(q, r.value);
      settle();
    });

    /* An arrow key in a group of radios moves and ticks at once, and a
       tick here is final, so from Yes the only way to No would be
       through Unsure. On a question not yet answered the arrows only
       move, and Space picks, the way a click does. */
    q.addEventListener('keydown', (e) => {
      const r = e.target.closest('.qz-r');
      if (!r || answers[q.dataset.q]) return;
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!step || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      const rs = [...q.querySelectorAll('.qz-r')];
      rs[(rs.indexOf(r) + step + rs.length) % rs.length].focus();
    });
  }

  /* ── the reader type ── */

  function lean(q, choice) {
    const side = q.dataset[choice === 'yes' ? 'leanYes' : 'leanNo'];
    return side === 'steven' ? 1 : side === 'doe' ? -1 : 0;
  }

  function typeOf() {
    let match = 0, unsure = 0, tilt = 0;
    for (const q of questions) {
      const choice = answers[q.dataset.q];
      const rec = q.dataset.record;
      if (rec === 'open') {
        if (choice === 'unsure') match += 1;
        else tilt += lean(q, choice);
      } else if (choice === rec) match += 1;
      else if (choice === 'unsure') unsure += 1;
      else tilt += lean(q, choice);
    }

    let type;
    if (tilt >= STRONG) type = 'dgger';
    else if (tilt >= MILD) type = 'destiny-fan';
    else if (tilt <= -STRONG) type = 'destiny-hater';
    else if (tilt <= -MILD) type = 'doe-fan';
    else if (match >= KNOWER) type = 'knower';
    else if (unsure >= FENCE) type = 'fence-sitter';
    else type = 'made-for-you';

    return { type, tilt };
  }

  const resH = end.querySelector('.qz-res-h');
  const resT = end.querySelector('.qz-res-t');
  const resLine = end.querySelector('.qz-line');
  const resDist = end.querySelector('.qz-dist');
  const resWait = end.querySelector('.qz-res-wait');
  const again = end.querySelector('.qz-again');

  function link(q, text) {
    const a = document.createElement('a');
    a.href = `#${q.id}`;
    a.textContent = text;
    return a;
  }

  /* What the wait line says: where to start, or which are left. */
  function waitText(left) {
    if (left.length === questions.length) {
      return [`Answer all ${all} to see your reader type. `, link(left[0], 'Start with question 1'), '.'];
    }
    const out = [left.length === 1
      ? 'Answer the last question to see your reader type. Still to go: '
      : `Answer all ${all} to see your reader type. Still to go: `];
    left.forEach((q, i) => {
      if (i) out.push(i === left.length - 1 ? ' and ' : ', ');
      out.push(link(q, `question ${questions.indexOf(q) + 1}`));
    });
    out.push('.');
    return out;
  }

  /* The one writer for the end card. Each state sets every part, so
     nothing from the other state is left showing. */
  function paintEnd(state, { left = [], type = '', tilt = 0 } = {}) {
    end.dataset.state = state;
    const done = state === 'result';
    resT.hidden = !done;
    resLine.hidden = !done;
    resWait.hidden = done;
    again.hidden = !done;

    if (!done) {
      resH.textContent = 'Your reader type';
      resT.replaceChildren();
      resWait.replaceChildren(...waitText(left));
      paint(resDist, 'off');
      return;
    }

    const li = types.get(type);
    resH.textContent = li.querySelector('b').textContent;
    resT.replaceChildren(...[...li.querySelector('span').childNodes].map((n) => n.cloneNode(true)));
    resWait.replaceChildren();

    const at = 50 + Math.max(-5, Math.min(5, tilt)) * 10;
    resLine.querySelector('.qz-line-dot').style.setProperty('--at', `${at}%`);
    resLine.classList.toggle('is-hollow', type === 'fence-sitter' || type === 'made-for-you');
  }

  const LANDED = 'How everyone landed';

  async function distribution(type) {
    const asked = run;
    paint(resDist, 'counting', { title: LANDED });

    let reply;
    try {
      reply = await post(RESULT_URL, { label: type });
    } catch {
      if (current(asked)) paint(resDist, 'off');
      return;
    }
    if (!current(asked)) return;

    const total = reply.total || 0;
    if (!reply.counts) {
      paint(resDist, 'few', { title: LANDED, text: 'Not enough finished quizzes yet to show how everyone else landed.' });
      return;
    }
    const keys = [...types.keys()];
    const pct = shares(reply.counts, keys);
    paint(resDist, 'split', {
      title: LANDED,
      rows: keys.map((k) => ({ key: k, label: types.get(k).querySelector('b').textContent, pct: pct[k] })),
      you: type,
      text: `${total.toLocaleString('en-US')} finished ${total === 1 ? 'quiz' : 'quizzes'} so far`,
    });
  }

  /* The type last drawn, so answering doesn't post the result twice. */
  let shown = null;

  function settle() {
    const left = questions.filter((q) => !answers[q.dataset.q]);
    if (left.length) { shown = null; paintEnd('waiting', { left }); return; }

    const { type, tilt } = typeOf();
    if (shown === type) return;
    shown = type;
    paintEnd('result', { type, tilt });
    distribution(type);
  }

  again.addEventListener('click', () => {
    newRun();
    shown = null;
    questions.forEach(unlock);
    status.textContent = '';
    settle();
    /* Back up to the first question, which is all that shows now. The
       address is cleared rather than set to #q1, which it may already
       be, and setting it again would not move the page. The button
       has just hidden itself, so the keyboard goes to the first
       answer rather than to the top of the page. */
    history.replaceState(null, '', location.pathname + location.search);
    questions[0].scrollIntoView({ block: 'start' });
    questions[0].querySelector('.qz-r').focus({ preventScroll: true });
  });

  /* ── on the way in ──
     The browser may put back radios it remembers from before a reload
     or from the back button, and those may not be this run's. The run
     is what counts, so the page is made to agree with it. An answer
     put back from the run is sent again: the service already has it,
     so it counts nothing twice, and it sends the totals back to draw.

     A page the Back button brings back whole still has the run it had
     when it was left, and the tab may have started another since, on
     a later visit to this page. So the run is read again first. */
  function restore() {
    load();
    for (const q of questions) {
      const choice = answers[q.dataset.q];
      if (choice) {
        lock(q, choice);
        count(q, choice);
      } else {
        unlock(q);
      }
    }
    shown = null;
    settle();
  }

  restore();
  window.addEventListener('pageshow', (e) => { if (e.persisted) restore(); });
})();
