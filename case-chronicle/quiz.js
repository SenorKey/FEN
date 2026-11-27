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

  const questions = [...root.querySelectorAll('.qz-q')];
  const end = root.querySelector('.qz-end');
  const types = new Map(
    [...root.querySelectorAll('.qz-types [data-type]')].map((li) => [li.dataset.type, li])
  );

  /* ── the run ── */

  const store = {
    get(k) { try { return sessionStorage.getItem(`qz:${QUIZ}:${k}`); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(`qz:${QUIZ}:${k}`, v); } catch { /* private mode */ } },
    del(k) { try { sessionStorage.removeItem(`qz:${QUIZ}:${k}`); } catch { /* private mode */ } },
  };

  function newRun() {
    const b = new Uint8Array(12);
    crypto.getRandomValues(b);
    return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  }

  let run = store.get('run');
  if (!/^[0-9a-f]{24}$/.test(run || '')) { run = newRun(); store.set('run', run); }

  let answers = {};
  try { answers = JSON.parse(store.get('answers') || '{}') || {}; } catch { answers = {}; }

  const save = () => store.set('answers', JSON.stringify(answers));

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
      /* Set after it is in the page, so the bar grows from nothing. */
      requestAnimationFrame(() => requestAnimationFrame(() => f.style.setProperty('--w', `${pct}%`)));
    }
    return wrap;
  }

  function line(text) {
    const p = document.createElement('p');
    p.className = 'qz-crowd-n';
    p.textContent = text;
    return p;
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
    const crowd = q.querySelector('.qz-crowd');
    crowd.hidden = true;
    crowd.replaceChildren();
  }

  async function count(q, choice) {
    const crowd = q.querySelector('.qz-crowd');
    const head = document.createElement('p');
    head.className = 'qz-crowd-h';
    head.textContent = 'How readers answered';
    crowd.replaceChildren(head, line('Counting…'));
    crowd.hidden = false;

    let reply;
    try {
      reply = await post(ANSWER_URL, { q: q.dataset.q, choice });
    } catch {
      /* The service is down or refused it. The explanation still
         stands, so the numbers just are not shown. */
      crowd.hidden = true;
      return;
    }

    const total = reply.total || 0;
    if (!reply.counts) {
      crowd.replaceChildren(head, line('Not enough answers yet to show how other readers chose. Check back once more people have taken it.'));
      return;
    }
    const pct = shares(reply.counts, CHOICES);
    crowd.replaceChildren(
      head,
      bars(CHOICES.map((k) => ({ key: k, label: WORDS[k], pct: pct[k] })), choice),
      line(readers(total)),
    );
  }

  for (const q of questions) {
    q.addEventListener('change', (e) => {
      const r = e.target.closest('.qz-r');
      if (!r || !r.checked || answers[q.dataset.q]) return;
      answers[q.dataset.q] = r.value;
      save();
      lock(q, r.value);
      count(q, r.value);
      settle();
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

  function missing() {
    return questions.filter((q) => !answers[q.dataset.q]);
  }

  function showWait(left) {
    resH.textContent = 'Your reader type';
    resT.hidden = true;
    resLine.hidden = true;
    resDist.hidden = true;
    if (left.length === questions.length) {
      const a = document.createElement('a');
      a.href = `#${left[0].id}`;
      a.textContent = 'Start with question 1';
      resWait.replaceChildren(document.createTextNode('Answer all ten to see your reader type. '), a, document.createTextNode('.'));
      resWait.hidden = false;
      return;
    }
    resWait.replaceChildren(
      document.createTextNode(left.length === 1
        ? 'Answer the last question to see your reader type. Still to go: '
        : 'Answer all ten to see your reader type. Still to go: ')
    );
    left.forEach((q, i) => {
      const a = document.createElement('a');
      a.href = `#${q.id}`;
      a.textContent = `question ${questions.indexOf(q) + 1}`;
      if (i) resWait.append(document.createTextNode(i === left.length - 1 ? ' and ' : ', '));
      resWait.append(a);
    });
    resWait.append(document.createTextNode('.'));
    resWait.hidden = false;
  }

  async function distribution(type) {
    const head = document.createElement('p');
    head.className = 'qz-crowd-h';
    head.textContent = 'How everyone landed';
    resDist.replaceChildren(head, line('Counting…'));
    resDist.hidden = false;

    let reply;
    try {
      reply = await post(RESULT_URL, { label: type });
    } catch {
      resDist.hidden = true;
      return;
    }

    const total = reply.total || 0;
    if (!reply.counts) {
      resDist.replaceChildren(head, line('Not enough finished quizzes yet to show how everyone else landed.'));
      return;
    }
    const keys = [...types.keys()];
    const pct = shares(reply.counts, keys);
    resDist.replaceChildren(
      head,
      bars(keys.map((k) => ({ key: k, label: types.get(k).querySelector('b').textContent, pct: pct[k] })), type),
      line(`${total.toLocaleString('en-US')} finished ${total === 1 ? 'quiz' : 'quizzes'} so far`),
    );
  }

  let shown = null;

  function settle() {
    const left = missing();
    if (left.length) { shown = null; showWait(left); return; }

    const { type, tilt } = typeOf();
    if (shown === type) return;
    shown = type;

    const li = types.get(type);
    resWait.hidden = true;
    resH.textContent = li.querySelector('b').textContent;
    resT.replaceChildren(...[...li.querySelector('span').childNodes].map((n) => n.cloneNode(true)));
    resT.hidden = false;

    const at = 50 + Math.max(-5, Math.min(5, tilt)) * 10;
    resLine.querySelector('.qz-line-dot').style.setProperty('--at', `${at}%`);
    resLine.classList.toggle('is-hollow', type === 'fence-sitter' || type === 'made-for-you');
    resLine.hidden = false;
    again.hidden = false;

    distribution(type);
  }

  again.addEventListener('click', () => {
    answers = {};
    save();
    run = newRun();
    store.set('run', run);
    shown = null;
    questions.forEach(unlock);
    again.hidden = true;
    settle();
    /* Back up to the first question, which is all that shows now. The
       address is cleared rather than set to #q1, which it may already
       be, and setting it again would not move the page. */
    history.replaceState(null, '', location.pathname + location.search);
    questions[0].scrollIntoView({ block: 'start' });
  });

  /* ── on the way in ──
     The browser may put back radios it remembers from before a reload
     or from the back button, and those may not be this run's. The run
     is what counts, so the page is made to agree with it. An answer
     put back from the run is sent again: the service already has it,
     so it counts nothing twice and sends the totals back to draw. */
  function restore() {
    for (const q of questions) {
      const choice = answers[q.dataset.q];
      if (choice && CHOICES.includes(choice)) {
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
