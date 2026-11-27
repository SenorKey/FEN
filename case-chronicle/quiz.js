/* ═══════════════════════════════════════════════
   Case Intuition Quiz

   The page works without this file. Every question, every answer and
   every explanation is in the markup, and quiz.css shows them as the
   reader picks. This adds the two things that cannot be done there:

     - how other readers answered: each pick is sent to the service
       behind /api/suggest/quiz/answer, which counts it and sends the
       totals back, and those are drawn under the explanation
     - the reader type at the end, worked out from the picks against
       what the record shows, and how many readers came out the
       same (the other types are never named)

   It also locks a question once its answer has been sent, so the
   numbers count first answers rather than second thoughts, and it
   paces the quiz: Start opens the first question, and each Next the
   step after.

   Everything about the case is read from the page: the questions and
   what the record shows on each from their attributes, the seven
   reader types, their lines and their pictures from the list at the
   end. Nothing here names a case, so another case's quiz page can load
   this as it is.

   A run is one go at the quiz in one tab: an id made up here and kept
   in sessionStorage with the answers, so a reload carries on where it
   was and the service can tell a reload from a second reader. Take it
   again starts a new run. Nothing is kept once the tab is closed.

   ── what can be in which state ──

   Each of these has one function that writes it, and nothing else
   touches the parts it owns:

     the run              load() from sessionStorage, newRun(), answer()
                          and reach(). sessionStorage is the truth; the
                          variables below are a copy of it. "reached"
                          is the furthest step opened: -1 before Start,
                          0 for question 1, up to the number of
                          questions for the end card. It never passes a
                          question not yet answered.

     what shows           setMode(), data-mode on .qz, one of:
                            intro   the way in and nothing else, on
                                    arriving from a link, even with a
                                    run saved
                            quiz    every step up to reached, marked
                                    .is-open for quiz.css
                          Start moves to quiz. So does a reload or the
                          Back button, for a run already begun.

     a numbers panel      paint(). Both the panel under an answer
     (.qz-crowd, and      and Readers who landed here. data-state says
      .qz-dist)           which it is in:
                            (none)  never asked: asked for once it is
                                    on screen with something to count
                            off       hidden, nothing in it
                            counting  "Counting…" while the reply
                                      is on its way
                            few       the service answered, but
                                      with too few readers to split
                            split     the bars
                          A failed request goes back to off, and is not
                          asked again until the page is loaded again.

     the end card         paintEnd(). data-state on .qz-end:
                            empty   nothing worked out yet
                            result  data-type names the reader type:
                                    its line, its dot, its picture,
                                    Readers who landed here and
                                    Take it again
                          The result is worked out, drawn and sent to
                          the service when the card is opened, not
                          before, so it is only ever counted for a
                          reader who has seen it.

   The service is only asked about what is on screen: an answer's
   numbers once its question is open, the result once the end card is.
   A reply is drawn only if the run that asked is still the run
   (current()), so one sent before Take it again, or before the Back
   button brought this page back, can't draw over what the reader is
   doing now.
   ═══════════════════════════════════════════════ */

(() => {
  const root = document.querySelector('.qz');
  if (!root) return;
  /* quiz.css leaves which steps show to .is-open from here. The page
     set .is-js already, before question 1 was drawn, and takes it off
     again at load unless data-ready says this file got all the way to
     its end; that is set last. */
  root.classList.add('is-js');

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
  const ids = new Set(questions.map((q) => q.dataset.q));
  const end = root.querySelector('.qz-end');
  /* The steps the reader goes through, in order: each question, then
     the end card. */
  const steps = [...questions, end];
  const types = new Map(
    [...root.querySelectorAll('.qz-types [data-type]')].map((li) => [li.dataset.type, li])
  );
  const go = root.querySelector('.qz-go');

  const resCard = end.querySelector('.qz-res');
  const resH = end.querySelector('.qz-res-h');
  const resT = end.querySelector('.qz-res-t');
  const resLine = end.querySelector('.qz-line');
  const resDist = end.querySelector('.qz-dist');
  const again = end.querySelector('.qz-again');
  /* Where Next on the last question puts the keyboard. */
  resH.tabIndex = -1;

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
  let reached = -1;
  let mode = 'intro';

  const isAnswered = (q) => Boolean(answers[q.dataset.q]);

  /* Read the run from sessionStorage. An answer is kept only if it is
     to a question on this page and is one of the three choices, so
     something left from an older version of the page can't lock a
     question nobody has answered. How far the reader had got is kept
     between every question answered and the first one not, whatever
     was saved. */
  function load() {
    run = store.get('run') || '';
    if (!/^[0-9a-f]{24}$/.test(run)) { newRun(); return; }
    let saved = {};
    try { saved = JSON.parse(store.get('answers') || '{}') || {}; } catch { saved = {}; }
    answers = {};
    for (const [id, choice] of Object.entries(saved)) {
      if (ids.has(id) && CHOICES.includes(choice)) answers[id] = choice;
    }
    const answered = questions.map(isAnswered);
    const firstOpen = answered.indexOf(false) === -1 ? questions.length : answered.indexOf(false);
    const lastDone = answered.lastIndexOf(true);
    const savedReach = Number.parseInt(store.get('reached'), 10);
    reached = Math.min(Math.max(Number.isNaN(savedReach) ? -1 : savedReach, lastDone), firstOpen);
  }

  function newRun() {
    const b = new Uint8Array(12);
    crypto.getRandomValues(b);
    run = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    answers = {};
    reached = -1;
    store.set('run', run);
    store.set('answers', '{}');
    store.set('reached', '-1');
  }

  function answer(id, choice) {
    answers[id] = choice;
    store.set('answers', JSON.stringify(answers));
  }

  /* Is what sessionStorage holds the run this page is showing? */
  const unchanged = () => store.get('run') === run && store.get('answers') === JSON.stringify(answers);

  /* For a reply: is the run that asked still the one on the page? */
  const current = (asked) => asked === run;

  /* ── what shows ── */

  /* The one writer for which steps are open. Opening a step also asks
     the service for what it shows (show()). */
  function paintSteps() {
    steps.forEach((el, i) => el.classList.toggle('is-open', mode === 'quiz' && i <= reached));
    if (mode === 'quiz') steps.slice(0, reached + 1).forEach(show);
    /* Start says where it will take the reader. */
    go.firstChild.nodeValue = reached < 0 ? 'Start ' : reached >= questions.length ? 'See your result ' : 'Continue ';
  }

  function reach(n) {
    reached = n;
    store.set('reached', String(n));
    paintSteps();
  }

  function setMode(m) {
    mode = m;
    root.dataset.mode = m;
    paintSteps();
  }

  /* How the reader came to this page: 'navigate' for a link, a typed
     address or a bookmark, 'reload', or 'back_forward'. */
  const arrival = () => performance.getEntriesByType?.('navigation')[0]?.type || 'navigate';

  /* Move the page so a step starts just under the nav: a question by
     its "Question 3 of 10" line, the end card by its top. The page's
     own scroll-behavior makes it glide, or jump for a reader who has
     asked for less motion. */
  function goTo(step) {
    (step === end ? end : step.querySelector('.qz-n')).scrollIntoView({ block: 'start' });
  }

  /* The keyboard goes with the reader: to a question's answer, or its
     first answer if it has none yet, or to the reader type's name. */
  function focusOn(step) {
    const to = step === end ? resH : (step.querySelector('.qz-r:checked') || step.querySelector('.qz-r'));
    to.focus({ preventScroll: true });
  }

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

  /* The one writer for a numbers panel. 'new' takes it back to never
     asked, with no data-state at all. */
  function paint(el, state, { title = '', text = '', rows = null, you = null } = {}) {
    if (state === 'new') el.removeAttribute('data-state');
    else el.dataset.state = state;
    el.hidden = state === 'off' || state === 'new';
    if (el.hidden) { el.replaceChildren(); return; }
    const head = document.createElement('p');
    head.className = 'qz-crowd-h';
    head.textContent = title;
    if (state === 'split') el.replaceChildren(head, bars(rows, you), line(text));
    else el.replaceChildren(head, line(state === 'counting' ? 'Counting…' : text));
  }

  const readers = (n) => `${n.toLocaleString('en-US')} ${n === 1 ? 'reader' : 'readers'} so far`;

  /* What an open step asks the service for, once: an answered
     question its numbers, the end card its result. */
  function show(step) {
    if (step === end) { if (questions.every(isAnswered)) showResult(); return; }
    const crowd = step.querySelector('.qz-crowd');
    if (isAnswered(step) && !crowd.dataset.state) count(step, answers[step.dataset.q]);
  }

  /* ── a question ── */

  function lock(q, choice) {
    for (const r of q.querySelectorAll('.qz-r')) {
      r.checked = r.value === choice;
      r.disabled = r.value !== choice;
    }
  }

  function unlock(q) {
    for (const r of q.querySelectorAll('.qz-r')) { r.checked = false; r.disabled = false; }
    paint(q.querySelector('.qz-crowd'), 'new');
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
      if (!r || !r.checked || isAnswered(q)) return;
      answer(q.dataset.q, r.value);
      lock(q, r.value);
      say(q, r.value);
      count(q, r.value);
      /* Up to the top with the question, so the record's answer under
         it and Next at its foot are in view with as little scrolling
         as the screen allows. */
      goTo(q);
    });

    /* Next opens the step after this one and takes the reader to it.
       The link's own jump is replaced, because the step it points at
       is not on the page until it is opened. */
    q.querySelector('.qz-next')?.addEventListener('click', (e) => {
      if (!isAnswered(q)) return;
      e.preventDefault();
      const next = steps[questions.indexOf(q) + 1];
      reach(Math.max(reached, steps.indexOf(next)));
      history.replaceState(null, '', `#${next.id}`);
      goTo(next);
      focusOn(next);
    });

    /* An arrow key in a group of radios moves and ticks at once, and a
       tick here is final, so from Yes the only way to No would be
       through Unsure. On a question not yet answered the arrows only
       move, and Space picks, the way a click does. */
    q.addEventListener('keydown', (e) => {
      const r = e.target.closest('.qz-r');
      if (!r || isAnswered(q)) return;
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
    else if (tilt <= -STRONG) type = 'burnt-bridge';
    else if (tilt <= -MILD) type = 'doe-fan';
    else if (match >= KNOWER) type = 'knower';
    else if (unsure >= FENCE) type = 'fence-sitter';
    else type = 'made-for-you';

    return { type, tilt };
  }

  /* The one writer for the end card. Each state sets every part, so
     nothing from the other is left showing. */
  function paintEnd(state, { type = '', tilt = 0 } = {}) {
    const done = state === 'result';
    end.dataset.state = state;
    if (done) end.dataset.type = type;
    else end.removeAttribute('data-type');
    resT.hidden = !done;
    resLine.hidden = !done;
    again.hidden = !done;
    resCard.querySelector(':scope > .qz-art')?.remove();

    if (!done) {
      resH.textContent = 'Your reader type';
      resT.replaceChildren();
      paint(resDist, 'new');
      return;
    }

    const li = types.get(type);
    const name = li.querySelector('b').textContent;
    /* The type's picture, from the template the page keeps in its
       entry, goes first in the card so it sits behind the words. */
    const art = li.querySelector('template.qz-art-src');
    if (art) resCard.prepend(art.content.cloneNode(true));
    resH.textContent = name;
    resT.replaceChildren(...[...li.querySelector('span').childNodes].map((n) => n.cloneNode(true)));

    /* The dot, and under it the reader's type and no other: what else
       there is to be is left for them to wonder about. Inked for the
       side they lean to, if they lean enough to be called for it. */
    const at = 50 + Math.max(-5, Math.min(5, tilt)) * 10;
    resLine.style.setProperty('--at', `${at}%`);
    resLine.dataset.side = tilt <= -MILD ? 'doe' : tilt >= MILD ? 'steven' : '';
    resLine.querySelector('.qz-line-n span').textContent = name;
    resLine.classList.toggle('is-hollow', type === 'fence-sitter' || type === 'made-for-you');
  }

  /* Worked out, drawn and sent when the end card opens; a card already
     showing this run's type is left as it is. */
  function showResult() {
    const { type, tilt } = typeOf();
    if (end.dataset.type === type) return;
    paintEnd('result', { type, tilt });
    distribution(type);
  }

  const LANDED = 'Readers who landed here';

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
      paint(resDist, 'few', { title: LANDED, text: 'Not enough finished quizzes yet to say how many readers landed here.' });
      return;
    }
    /* One row, the reader's own: its share of every finished quiz. The
       other types stay unnamed, as on the line. */
    const pct = shares(reply.counts, [...types.keys()]);
    paint(resDist, 'split', {
      title: LANDED,
      rows: [{ key: type, label: types.get(type).querySelector('b').textContent, pct: pct[type] }],
      you: type,
      text: `of ${total.toLocaleString('en-US')} finished ${total === 1 ? 'quiz' : 'quizzes'} so far`,
    });
  }

  /* Start opens question 1 and takes the reader to it. Until then the
     way in is all there is, so a reader arriving from a link reads it
     before anything moves. A reader with a run already begun gets back
     everything they had opened, and is taken to the furthest of it. */
  go.addEventListener('click', (e) => {
    e.preventDefault();
    reached = Math.max(reached, 0);
    store.set('reached', String(reached));
    setMode('quiz');
    const to = steps[reached];
    history.replaceState(null, '', `#${to.id}`);
    goTo(to);
    focusOn(to);
  });

  again.addEventListener('click', () => {
    newRun();
    paintEnd('empty');
    questions.forEach(unlock);
    status.textContent = '';
    reach(0);
    /* Back up to the first question, which is all that shows now. The
       button has just hidden itself, so the keyboard goes to the first
       answer rather than to the top of the page. */
    history.replaceState(null, '', location.pathname + location.search);
    goTo(questions[0]);
    focusOn(questions[0]);
  });

  /* ── on the way in ──
     The browser may put back radios it remembers from before a reload
     or from the back button, and those may not be this run's. The run
     is what counts, so the page is made to agree with it, and each
     panel goes back to never asked: what is on screen asks again (the
     service already has the answers, so nothing counts twice), and
     what is not waits until it is. */
  function restore(arrivedBy) {
    load();
    for (const q of questions) {
      const choice = answers[q.dataset.q];
      if (choice) lock(q, choice); else unlock(q);
      paint(q.querySelector('.qz-crowd'), 'new');
    }
    paintEnd('empty');
    setMode(reached >= 0 && arrivedBy !== 'navigate' ? 'quiz' : 'intro');
  }

  restore(arrival());

  /* A link straight to a question, before this visit has started,
     points at something not on the page yet. The browser may already
     have moved toward it, so the link's target is dropped and the
     reader is put back at the top, with the way in. */
  if (mode === 'intro' && steps.some((el) => `#${el.id}` === location.hash)) {
    history.replaceState(null, '', location.pathname + location.search);
    scrollTo({ top: 0, behavior: 'instant' });
  }

  /* A page the Back button brings back whole is just as it was left,
     unless the tab has moved on to another run since, on a later visit
     to this page. Only then is it brought up to date, keeping what it
     was showing. */
  window.addEventListener('pageshow', (e) => {
    if (e.persisted && !unchanged()) restore(mode === 'quiz' ? 'back_forward' : 'navigate');
  });

  /* Last, so the page only keeps quiz.js in charge if all of the above
     ran. */
  root.dataset.ready = '1';
})();
