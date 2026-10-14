/* chronicle.js
   Shared by the Case Chronicle hub and every case page under it.
   Nothing here names a case: each block bails out quietly when the
   markup it enhances is absent, so a page that has no ledger, no
   exhibit wash or no corrections form simply does without.

   Every block is an enhancement. A control that only a script can work
   ships hidden or disabled and is brought out by the block that works
   it, so a reader with no JavaScript never meets a dead one. */

'use strict';

/* ── the ledger: every layer at once ──
   One control: open or collapse every depth in the ledger at once.

   Pure enhancement. The drawers are <details>, so they already work
   individually with no script and no pointer. The button stays hidden
   until this file runs, so a reader without JS never sees a dead control. */

(() => {
  const btn = document.getElementById('depth-all');
  const ledger = document.getElementById('ledger');
  if (!btn || !ledger) return;

  const drawers = [...ledger.querySelectorAll('details.drawer')];
  if (!drawers.length) return;

  const label = btn.querySelector('.da-l');
  const OPEN = 'Open every layer';
  const SHUT = 'Collapse everything';

  const allOpen = () => drawers.every((drawer) => drawer.open);

  function sync() {
    const open = allOpen();
    btn.setAttribute('aria-expanded', open);
    btn.classList.toggle('is-open', open);
    label.textContent = open ? SHUT : OPEN;
  }

  btn.addEventListener('click', () => {
    const open = !allOpen();
    for (const drawer of drawers) drawer.open = open;
    sync();
  });

  /* Keep the button honest when drawers are opened one at a time. A
     toggle does not bubble, but it can be heard on its way down, so one
     listener on the ledger hears every drawer in it. */
  ledger.addEventListener('toggle', sync, true);

  btn.hidden = false;
  sync();
})();

/* ── case flow: every card shut to its text ──
   The map is there to be taken in at a glance, so each card is shut to
   its text and opens for the rest, the line over it that says what it
   is and, under it, how it stands and the explanation: from its own
   control, or from a press anywhere on the card that is not on a link
   or a button and is not the end of a text selection. One more control
   opens or shuts them all, and is the ledger's button under another
   label.

   A card with nothing under its text has no control of its own. It
   still has its line to show, so it follows the control that opens
   every card.

   A question that is answered by others holds them inside its own
   card, as parts, and each part opens and shuts like a card. So a
   card's control is the one with no part between it and the card, and
   a press inside a part is the part's and not the card's.

   The rest of every card ships open and the controls ship hidden, so a
   reader with no JavaScript has the whole map written out and no dead
   buttons. This shuts the cards, then arms the transition after a forced
   reflow so the first close is instant. A reflow rather than
   requestAnimationFrame, which is paused in a background tab. */

(() => {
  const flow = document.querySelector('.cf');
  if (!flow) return;

  const FOLD = '.cf-card, .cf-part';
  const wired = [];
  const bare = [];

  const all = flow.querySelector('.cf-all');
  const label = all?.querySelector('.da-l');
  const OPEN = 'Open every card';
  const SHUT = 'Shut every card';

  function set(item, open) {
    item.card.classList.toggle('is-open', open);
    item.btn.setAttribute('aria-expanded', open);
  }

  const allOpen = () => wired.every((item) => item.card.classList.contains('is-open'));

  /* Keeps the button honest when cards are opened one at a time. */
  function sync() {
    if (!all) return;
    const open = allOpen();
    all.setAttribute('aria-expanded', open);
    all.classList.toggle('is-open', open);
    label.textContent = open ? SHUT : OPEN;
  }

  for (const card of flow.querySelectorAll(FOLD)) {
    const btn = [...card.querySelectorAll('.cf-more')].find((b) => b.closest(FOLD) === card);
    if (!btn) {
      bare.push(card);
      continue;
    }

    const item = { card, btn };
    wired.push(item);
    btn.hidden = false;

    const toggle = () => {
      set(item, !card.classList.contains('is-open'));
      sync();
    };

    /* The control is inside the card, so its own press would otherwise
       be heard twice and leave the card as it was. */
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggle();
    });

    card.addEventListener('click', (e) => {
      if (e.target.closest?.('a, button')) return;
      if (e.target.closest?.(FOLD) !== card) return;
      if (window.getSelection()?.toString()) return;
      toggle();
    });
  }

  if (!wired.length) return;

  if (all) {
    all.addEventListener('click', () => {
      const open = !allOpen();
      for (const item of wired) set(item, open);
      for (const card of bare) card.classList.toggle('is-open', open);
      sync();
    });
    all.hidden = false;
  }

  flow.classList.add('js-collapse');
  void flow.offsetHeight;
  flow.classList.add('js-anim');
  sync();
})();

/* ── the two sides: each card shut to its name ──
   A side's card says who it is and what they are in a line, and opens
   for the rest: from its own control, or from a press anywhere on the
   card that is not on a link or a button and is not the end of a text
   selection. The same bargain as the flow's cards. The cards are in the
   masthead on the case page and beside the first entry on the
   chronology's, so each carries its own state rather than taking it
   from whatever it stands in.

   The rest ships open and the control ships hidden, so a reader with no
   JavaScript has both cards written out and no dead button. */

(() => {
  const wired = [];

  for (const card of document.querySelectorAll('.party')) {
    const btn = card.querySelector('.party-more');
    const region = card.querySelector('.party-x');
    if (!btn || !region) continue;

    const label = btn.querySelector('.party-more-l');

    const set = (open) => {
      card.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open);
      label.textContent = open ? 'Less' : 'More';
    };
    const toggle = () => set(!card.classList.contains('is-open'));

    btn.hidden = false;
    set(false);
    card.classList.add('js-collapse');
    wired.push(card);

    /* The control is inside the card, so its own press would otherwise
       be heard twice and leave the card as it was. */
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggle();
    });

    card.addEventListener('click', (e) => {
      if (e.target.closest?.('a, button')) return;
      if (window.getSelection()?.toString()) return;
      toggle();
    });
  }

  if (!wired.length) return;

  /* Armed after a forced reflow, so the first close is instant. */
  void document.body.offsetHeight;
  for (const card of wired) card.classList.add('js-anim');
})();

/* ── chronology: one more layer per card ──
   The detail ships open and the toggles ship hidden, so a reader with no
   JavaScript gets everything and no dead controls. This collapses them,
   then arms the transition after a forced reflow so the initial close is
   instant rather than a page-load animation.

   Each button also says what is behind it. A drawer that holds a
   citation and nothing else is not "more", it is the source, so the
   button says Source. Any other drawer says how many documents it links
   to, so a reader knows the sources are there before opening anything. */

(() => {
  const tl = document.querySelector('.tl');
  if (!tl) return;

  let wired = 0;

  for (const card of tl.querySelectorAll('.tl-c')) {
    const btn = card.querySelector('.tl-more');
    const region = card.querySelector('.tl-x');
    if (!btn || !region) continue;

    const label = btn.querySelector('.tl-more-l');
    const links = region.querySelectorAll('.cite-doc').length;
    const bare = !region.querySelector('.tl-x-t') && !!region.querySelector('.tl-cite');
    const shut = bare ? (links > 1 ? 'Sources' : 'Source') : 'More';

    if (links && !bare) {
      const count = document.createElement('span');
      count.className = 'tl-more-n';
      count.textContent = links === 1 ? '1 source' : `${links} sources`;
      btn.append(count);
    }

    label.textContent = shut;
    btn.hidden = false;
    btn.setAttribute('aria-expanded', 'false');
    wired++;

    btn.addEventListener('click', () => {
      const open = card.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', open);
      label.textContent = open ? 'Less' : shut;
    });
  }

  if (!wired) return;

  tl.classList.add('js-collapse');

  /* Commit the collapsed state before the transition exists, so the initial
     close is instant. A forced reflow rather than requestAnimationFrame:
     rAF is paused in a background tab, which would leave the page
     un-animated until it was first looked at. */
  void tl.offsetHeight;
  tl.classList.add('js-anim');
})();

/* ── chronology: which part of the case is on screen ──
   On a wide screen the key stays put as a bar over the chronology,
   naming each side over its column. Its left end says which part of the
   case is passing underneath, read off the page's own dividers: the
   last one to have gone up under the bar.

   The span this writes into ships empty and stays empty without
   JavaScript, so there is no dead label. On a narrow screen the bar is
   an ordinary key and the span is not displayed, so nothing is
   measured there. */

(() => {
  const tl = document.querySelector('.tl');
  const bar = document.querySelector('.tl-key');
  const here = bar?.querySelector('.tk-here');
  if (!tl || !here) return;

  const parts = tl.querySelectorAll('.tl-phase');
  if (!parts.length) return;

  let shown = null;
  let ticking = false;

  function read() {
    ticking = false;

    /* display:none leaves an element with no offsetParent. */
    if (!here.offsetParent) return;

    const line = bar.getBoundingClientRect().bottom + 8;
    let now = null;
    for (const part of parts) {
      if (part.getBoundingClientRect().bottom > line) break;
      now = part;
    }
    if (now === shown) return;
    shown = now;

    const name = now?.querySelector('.tl-phase-l');
    here.textContent = name ? name.textContent.replace(/\s+/g, ' ').trim() : '';
    here.classList.toggle('is-on', !!name);
  }

  /* One read per frame at most, and only geometry: nothing here writes
     anything that could move the dividers it is measuring. */
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(read);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  read();
})();

/* ── exhibit wash: the parallax ──
   The two strips of recreated exhibits are translated at a fraction of
   the scroll, so the argument moves over evidence that lags behind it.
   Left and right run at different rates: the two sides of this case do
   not keep step anywhere else either.

   Transform only, written inside a frame, so the whole thing stays on
   the compositor and never triggers layout. */

(() => {
  const layer = document.querySelector('.exhibits');
  if (!layer) return;

  const cols = [
    { strip: document.querySelector('.ex-col-p .ex-strip'), rate: 0.42 },
    { strip: document.querySelector('.ex-col-d .ex-strip'), rate: 0.30 }
  ];
  if (!cols[0].strip || !cols[1].strip) return;

  const slow = window.matchMedia('(prefers-reduced-motion: reduce)');
  let bound = false;
  let ticking = false;
  let pending = false;

  /* A strip that only moves at 42% of the scroll still has to be under
     the viewport when the page has run out. Measure one pass of the
     cards, then lay down as many copies as the page is long enough to
     need. The layer is fixed, so none of this can feed back into the
     document height it is measuring. */
  function fill(col) {
    if (col.seed === undefined) {
      col.seed = col.strip.innerHTML;
      col.unit = col.strip.offsetHeight;
    }
    if (!col.unit) return;

    const run = document.documentElement.scrollHeight - window.innerHeight;
    const need = run * col.rate + window.innerHeight + 240;
    const copies = Math.max(1, Math.ceil(need / col.unit));
    if (copies === col.copies) return;

    col.strip.innerHTML = col.seed.repeat(copies);
    col.copies = copies;
  }

  function place() {
    const y = window.scrollY;
    for (const col of cols) {
      col.strip.style.transform = `translateY(${(-y * col.rate).toFixed(2)}px)`;
    }
    ticking = false;
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(place);
  }

  /* Off below 1280px, where the layer is display:none and there is no
     outer page to wash, and off for a reader who has asked for less
     movement — in that case the CSS leaves the strips visible but
     still, which is the point of the setting. */
  function sync() {
    pending = false;

    const on = !slow.matches && window.getComputedStyle(layer).display !== 'none';

    if (on && !bound) {
      window.addEventListener('scroll', onScroll, { passive: true });
      bound = true;
    } else if (!on && bound) {
      window.removeEventListener('scroll', onScroll);
      bound = false;
    }

    if (!on) {
      for (const col of cols) col.strip.style.transform = '';
      return;
    }

    for (const col of cols) fill(col);
    place();
  }

  function resync() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(sync);
  }

  window.addEventListener('resize', resync);

  /* The ledger drawers and the chronology cards both change the height
     of the page as they open, which changes how much strip is needed.
     Watching the body catches those, and web-font swap, without either
     control having to know this layer exists. */
  new ResizeObserver(resync).observe(document.body);

  slow.addEventListener('change', resync);

  sync();
})();

/* ── back to top ──
   The button is needed exactly when the top of the page is not on
   screen, which is what an IntersectionObserver on the masthead reports
   directly. No scroll handler, nothing per frame.

   It ships with the hidden attribute and is only revealed here, so a
   reader with no JavaScript never sees a dead control - the same
   bargain as the section pills above. The anchor itself would work
   without any of this; what needs the script is knowing when to offer
   it. */

(() => {
  const btn = document.querySelector('.to-top');
  const mast = document.querySelector('.masthead');
  if (!btn || !mast) return;

  btn.hidden = false;

  /* Section navigation steps aside by exactly the width of this button,
     and CSS has no way to ask for that, so it is published here as a
     custom property. Measured rather than hardcoded: the label is one
     line of mono, and its width moves with the reader's base font size,
     with zoom, and with whether the web font has arrived yet. */
  const publishWidth = () => {
    document.documentElement.style.setProperty('--totop-w', `${btn.offsetWidth}px`);
  };

  publishWidth();

  /* Re-measured whenever any of that can have changed. Watching the
     button itself rather than the window, because the things that change
     its width mostly are not resizes: the mono face arriving, the
     reader's base font size, page zoom. A ResizeObserver catches all of
     them and nothing else. Publishing the width cannot change the
     button's own size, so this cannot feed back on itself. */
  new ResizeObserver(publishWidth).observe(btn);

  /* The class on the root is what lets the section pill step aside for
     this button, and only while it is actually out: without it the pill
     would sit beside an empty slot for the first screen of the page. */
  new IntersectionObserver((entries) => {
    const out = !entries.at(-1).isIntersecting;
    btn.classList.toggle('is-on', out);
    document.documentElement.classList.toggle('has-to-top', out);
  }).observe(mast);
})();

/* ── terms: from the page into the glossary ──
   Each marked word is already a working anchor into the glossary, so
   this adds only what an anchor cannot do: open the panel, bring the
   entry into view inside its own scroll, and light it so the eye lands
   on the right row rather than merely the right panel.

   The default is prevented, which means the URL is left alone. Nobody
   wants a page of citations to fill their history with #t-deposition,
   and the reader's place on a twenty-screen page is worth more than a
   linkable fragment. */

(() => {
  const gloss = document.querySelector('.gloss');
  const panel = document.querySelector('.gloss-p');
  if (!gloss || !panel) return;

  const unlight = () => panel.querySelector('.is-found')?.classList.remove('is-found');

  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a.term');
    if (!a) return;

    const row = document.getElementById(a.dataset.term)?.parentElement;
    if (!row) return;                       /* let the anchor do its own work */

    e.preventDefault();
    gloss.open = true;

    /* Reading clientHeight after opening forces the layout the scroll
       position depends on. */
    panel.scrollTop = row.offsetTop - (panel.clientHeight / 2) + (row.offsetHeight / 2);

    /* One entry lit at a time. The reflow between taking the class off
       and putting it back restarts the flare when the same term is asked
       for twice. */
    unlight();
    void row.offsetWidth;
    row.classList.add('is-found');
  });

  /* The entry stays lit for as long as the panel is open, and the panel
     can be closed three ways: its own button, Escape, or a press outside
     it. This is the one place that hears about all of them. Opened again
     from the button, the glossary is a list with nothing singled out. */
  gloss.addEventListener('toggle', () => {
    if (!gloss.open) unlight();
  });

  /* Escape closes it, the way every other panel on the web does. */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && gloss.open) {
      gloss.open = false;
      gloss.querySelector('.gloss-b').focus();
    }
  });

  /* So does a press anywhere outside it. A press, not a click and not a
     pointerdown: a finger put down to scroll the page ends in
     pointercancel and never reaches pointerup, so reading on with the
     definition still open works on a phone; and a mouse that travels
     between down and up is selecting text, not dismissing anything.
     Pointer events rather than click because Safari on iOS does not
     send a click from plain text to the document at all.

     A marked word is left to the handler above, which is about to want
     the panel open. Focus is not moved: the reader has just said where
     their attention is. */
  const SLOP = 6;
  let down = null;

  document.addEventListener('pointerdown', (e) => {
    down = gloss.open && !gloss.contains(e.target)
      ? { x: e.clientX, y: e.clientY }
      : null;
  });

  document.addEventListener('pointerup', (e) => {
    const from = down;
    down = null;
    if (!from || !gloss.open || gloss.contains(e.target)) return;
    if (e.target.closest?.('a.term')) return;
    if (Math.abs(e.clientX - from.x) > SLOP || Math.abs(e.clientY - from.y) > SLOP) return;
    gloss.open = false;
  });
})();

/* ── the locked door ──
   A courtroom is locked until the court has sat in it. The case page
   says so itself: data-door-lock goes on the slot its Courtroom door
   stands in for as long as the case's courtroom page lists no day in
   court, and comes off when the first one is added. Nothing here
   checks. The two pages are edited by the same hand.

   Behind a locked door there is still a room, drawn and mostly empty,
   and a reader who wants to see it can break the lock. That lasts as
   long as the page does. Nothing is remembered, so the lock is back on
   a reload, in a new tab, and whenever the reader comes back to the
   page: it says something about the case, and that is as true the
   second time as the first.

   The lock is hung here rather than in the markup, so a reader with no
   JavaScript gets a plain link to the room and never a padlock with
   nothing to take it off.

   The hub has a door of its own that wears the same lock, and wears it
   always: its slot carries data-door-lock for good, not until a first
   hearing. That door has no words under it and names its own padlock,
   so both of those are only handled here when they are there. */

(() => {
  const slot = document.querySelector('[data-door-lock]');
  if (!slot) return;

  const door = slot.querySelector('.door');
  const btn = slot.querySelector('.door-unlock');
  const label = slot.querySelector('.door-go-l');
  if (!door || !btn) return;

  const href = door.getAttribute('href');
  /* What the door says when it is only a door, kept to put back. */
  const words = label ? label.textContent : '';
  let locked = false;
  let leaving;

  /* Locked: no href, so the door is neither a link nor a tab stop, and
     the padlock is the one control on it. */
  function lock() {
    clearTimeout(leaving);
    locked = true;
    door.removeAttribute('href');
    if (label) label.textContent = 'Locked · no hearing yet';
    slot.classList.remove('is-unlocked');
    slot.classList.add('is-locked');
    btn.classList.remove('is-broken', 'is-rattled');
    btn.hidden = false;
  }

  /* The broken lock, cleared off the floor. Not if the door has been
     locked again in the meantime: a timer set before the reader left
     can come due after they are back. */
  function gone() {
    if (!locked) btn.hidden = true;
  }

  if (!btn.hasAttribute('aria-label')) btn.setAttribute('aria-label', 'Unlock the Courtroom View');
  lock();

  /* Trying the door rattles the lock, which is how a reader who has not
     noticed the padlock finds out where it is. */
  door.addEventListener('click', () => {
    if (!locked) return;
    btn.classList.remove('is-rattled');
    void btn.offsetWidth;
    btn.classList.add('is-rattled');
  });

  btn.addEventListener('click', () => {
    if (!locked) return;
    locked = false;
    btn.classList.remove('is-rattled');

    door.setAttribute('href', href);
    if (label) label.textContent = words;
    slot.classList.remove('is-locked');
    /* Unlocked by the reader, as against never locked: the stylesheet
       brings the light up behind the transom for one and not the
       other. */
    slot.classList.add('is-unlocked');
    btn.classList.add('is-broken');

    /* The button is about to leave, and focus must not leave with it.
       The door is taller than a small screen, and the reader is already
       looking at it, so the page is not to be moved to show it. */
    door.focus({ preventScroll: true });

    /* For a reader with motion turned down, where the stylesheet cuts
       the fall to nothing and the event may not be worth waiting on. */
    leaving = setTimeout(gone, 1100);
  });

  btn.addEventListener('animationend', (e) => {
    if (e.target === btn) gone();
  });

  /* Back from somewhere else, on a page the browser kept as it was
     left: unlocked, and as likely as not with the door standing open.
     The leaves are given the half second they take to shut before the
     lock goes back on them. */
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) setTimeout(lock, 500);
  });
})();

/* ── the doors, opening ──
   A door that is a link opens before it is gone through: the leaves
   swing, and the page follows when they have. The swing is the
   stylesheet's. All this does is hold the navigation for as long as it
   takes, and start fetching the page behind the door meanwhile, so the
   half second is spent on the wait rather than added to it.

   It stands aside for anything that is not a plain click on a plain
   link. A click with a modifier held is asking for a new tab or a new
   window and gets one, a locked door has no href and is the lock's
   business, and a reader with motion turned down goes straight
   through.

   A page brought back from the back/forward cache comes back exactly
   as it was left, which is with a door standing open, so the doors are
   shut again when it is shown. */

(() => {
  const doors = document.querySelectorAll('.door');
  if (!doors.length) return;

  /* A little short of the stylesheet's 0.56s. The end of the swing is
     the leaves settling, and the page can go while they do. A heavier
     door says how long it takes in data-swing, by the same rule. */
  const SWING = 520;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)');

  for (const door of doors) {
    door.addEventListener('click', (e) => {
      const href = door.getAttribute('href');
      if (!href) return;
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (still.matches) return;
      /* Already open and waiting on the network: a second press is not
         made to wait for a second swing. */
      if (door.classList.contains('is-open')) return;

      e.preventDefault();
      door.classList.add('is-open');

      const ahead = document.createElement('link');
      ahead.rel = 'prefetch';
      ahead.href = href;
      document.head.append(ahead);

      setTimeout(() => { window.location.href = href; }, Number(door.dataset.swing) || SWING);
    });
  }

  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    for (const door of doors) door.classList.remove('is-open');
  });
})();

/* ── the courtroom ──
   Three things on this page are data and none of them is in this file.
   The people are the list beside the plan: one row each, saying which
   seat, between which entries of the chronology, and at which of them
   a source puts that person in the room. The notes on the parts of the
   room are rows in the same list. The moments are the chronology
   itself, fetched from its own page and read out of its markup, so a
   card added there is a tick here with nobody having to remember to add
   it twice.

   From those the script draws the room for whichever moment the line is
   on. A person is one of three things at any moment: in the room, on a
   screen, or part of the case and not recorded there, which on most
   dates is because the step was taken on paper and nobody was in court
   at all. A part of the room with nobody in it gets a question mark
   that says why.

   Everything drawn is a real button laid over the plan, so it takes a
   pointer, a finger and the keyboard alike, and what it opens is a row
   of the list. The list itself shows only who was in the room at that
   moment; everyone and everything else is on the plan.

   When the bar first comes into view the line moves by itself, to two
   moments picked at random from the ones with somebody in the room and
   then back to where it started, because nothing about a line on a bar
   says it can be moved.

   If the chronology cannot be fetched the bar never appears, and the
   page stays what it is without a script: an empty plan and two lists. */

(async () => {
  const root = document.querySelector('.cr');
  if (!root) return;

  const plan = root.querySelector('.cr-plan');
  const svg = root.querySelector('.cr-svg');
  const bar = root.querySelector('.ct');
  const track = root.querySelector('.ct-track');
  const ticks = root.querySelector('.ct-ticks');
  const line = root.querySelector('.ct-line');
  const prev = root.querySelector('.ct-prev');
  const next = root.querySelector('.ct-next');
  const panel = root.querySelector('.cm');
  const list = root.querySelector('.cr-cast');
  if (!plan || !svg || !bar || !track || !ticks || !line || !prev || !next || !panel || !list) return;

  const legend = root.querySelector('.cr-key');
  const days = root.querySelector('.cr-days');

  /* Everything the line rewrites as it moves is in the page from the
     start, so it is looked up once: the parts of the moment's panel, and
     the parts of the drawing that are filled in or measured. */
  const cm = {
    n: panel.querySelector('.cm-n'),
    date: panel.querySelector('.cm-date'),
    who: panel.querySelector('.cm-who'),
    title: panel.querySelector('.cm-h'),
    body: panel.querySelector('.cm-b'),
    room: panel.querySelector('.cm-room'),
    link: panel.querySelector('.cm-link')
  };
  const areas = [...svg.querySelectorAll('.cr-area')];
  const jurors = [...svg.querySelectorAll('.cr-seat-j')];
  const pubs = [...svg.querySelectorAll('.cr-pub')];
  const seats = new Map();         /* seat name -> its circle on the plan */
  const zones = new Map();         /* part of the room -> its box on the plan */
  for (const c of svg.querySelectorAll('.cr-seat[data-seat]')) {
    if (!seats.has(c.dataset.seat)) seats.set(c.dataset.seat, c);
  }
  for (const z of svg.querySelectorAll('.cr-zone[data-zone]')) {
    if (!zones.has(z.dataset.zone)) zones.set(z.dataset.zone, z);
  }

  const src = root.dataset.chronology;
  const view = svg.viewBox.baseVal;
  const all = [...list.querySelectorAll('.cr-who')];
  const rows = all.filter((row) => !row.classList.contains('cr-about'));
  const abouts = all.filter((row) => row.classList.contains('cr-about'));

  const moments = [];
  const index = new Map();         /* entry id -> position in moments */
  const names = {};                /* side -> the name the chronology's key gives it */
  const sits = new Map();          /* entry id -> { kind, li }: the days something happened in a room */
  const statusLine = new Map();    /* a person's row -> the line saying which of the three they are */
  let opens = 0;
  let now = -1;
  let nodes = [];
  let pop = null;                  /* the card that is up, { el, hint, node }, or nothing */
  let pinned = null;
  let via = 'mouse';               /* how the reader last acted: mouse, touch, pen or key */
  let touring = false;             /* the line is moving by itself, or is waiting to */
  let tourTimer = 0;
  let tourWatch = null;
  let spacedFor = 0;               /* the width of bar the year labels were last spaced for */
  const still = window.matchMedia('(prefers-reduced-motion: reduce)');

  const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

  function sideOf(li) {
    const c = li.classList;
    return c.contains('tl-p') ? 'p' : c.contains('tl-d') ? 'd' : c.contains('tl-court') ? 'court' : 'n';
  }

  /* ── reading the chronology ── */
  function read(doc) {
    const key = doc.querySelector('.tl-key');
    if (key) {
      names.p = text(key.querySelector('.tk-p'));
      names.d = text(key.querySelector('.tk-d'));
      names.court = text(key.querySelector('.tk-c'));
    }
    /* A page can name the fourth lane itself. Where the court gives a
       voice to someone who is neither side, "off the docket" is wrong. */
    names.n = root.dataset.neither || 'Off the docket';

    /* A card that only holds a place, on a case nobody has written yet,
       is not a moment of that case. With nothing else on the rail the
       bar never appears, and the room stays a plan and two lists. */
    for (const li of doc.querySelectorAll('.tl > li.tl-ev:not(.tl-stub)')) {
      const date = li.querySelector('.tl-date');
      const body = li.querySelector('.tl-b');
      const chip = date?.querySelector('.chip');
      let when = '';
      if (date) {
        const d = date.cloneNode(true);
        d.querySelector('.chip')?.remove();
        when = text(d);
      }
      index.set(li.id, moments.length);
      moments.push({
        id: li.id,
        side: sideOf(li),
        key: li.classList.contains('is-key'),
        date: when,
        ruling: text(chip),
        title: text(li.querySelector('.tl-h')),
        body: body ? body.innerHTML : ''
      });
    }
  }

  function readSittings() {
    for (const li of root.querySelectorAll('.cr-sits > li')) {
      for (const id of (li.dataset.at || '').split(/\s+/)) {
        if (id) sits.set(id, { kind: li.dataset.kind, li });
      }
    }
  }

  /* court: a sitting in this room. away: it happened in some other
     room. paper: a filing, a written order, or something off the docket. */
  function kindOf(i) {
    const s = sits.get(moments[i].id);
    return s ? s.kind : 'paper';
  }

  /* ── who is there ──
     A row with no dates is there from the moment the room opens. An
     entry id that the chronology no longer has is treated as no limit,
     so a retitled card leaves someone seated too long, never drops
     them from the room without a trace. */
  function at(attr, row) {
    return (row.getAttribute(attr) || '').split(/\s+/)
      .filter((id) => id && index.has(id))
      .map((id) => index.get(id));
  }

  function present(row, i) {
    if (row.hasAttribute('data-before')) return i < opens;
    if (i < opens) return false;
    if (row.hasAttribute('data-at')) return at('data-at', row).includes(i);
    if (at('data-not', row).includes(i)) return false;
    const from = at('data-from', row);
    const gone = at('data-gone', row);
    if (from.length && i < from[0]) return false;
    if (gone.length && i >= gone[0]) return false;
    return true;
  }

  /* in: a source places them in the room. remote: on a screen.
     case: part of the case at this point, and no more than that. */
  function status(row, i) {
    if (kindOf(i) !== 'court') return 'case';
    /* Known to have been somewhere else, which is more than not known
       to have been here. Drawn the same; said differently. */
    if (at('data-away', row).includes(i)) return 'away';
    if (at('data-remote', row).includes(i)) return 'remote';
    if (row.dataset.in === '*' || at('data-in', row).includes(i)) return 'in';
    return 'case';
  }

  /* Whether anybody is in the room at this moment, in person or on a
     screen: whether the list beside the plan has a person on it. */
  function peopled(i) {
    return rows.some((row) => {
      const st = present(row, i) ? status(row, i) : '';
      return st === 'in' || st === 'remote';
    });
  }

  function statusText(st, kind) {
    if (st === 'in') return 'In the room';
    if (st === 'remote') return 'By video';
    if (st === 'away') return 'Not in the room';
    if (kind === 'court') return 'Not recorded in the room';
    if (kind === 'away') return 'In the case, not in this room';
    return 'In the case, nothing in court on this date';
  }

  function zoneOf(seat) {
    if (seat === 'jury') return 'jury';
    if (seat === 'rep') return 'staff';
    if (seat.startsWith('judge')) return 'bench';
    if (seat.startsWith('stand')) return 'stand';
    return seat[0] === 'g' ? 'gallery' : seat[0];
  }

  /* ── the card ── */
  function closePop() {
    pop?.el.remove();
    pinned?.classList.remove('is-open');
    for (const row of all) row.classList.remove('is-lit');
    pop = null;
    pinned = null;
  }

  /* A card that is only being pointed at goes when the pointer does,
     which is no use to a reader who wants to follow one of its links or
     read it against the list. A press makes it stay. Nothing about a
     circle says so, so the card says it, in its own bottom corner, and
     names the gesture the reader is actually using. */
  function hint(stuck, how) {
    if (stuck) return how === 'touch' ? 'tap to close' : how === 'key' ? 'Enter to unstick' : 'click to unstick';
    return how === 'key' ? 'Enter to stick' : 'click to stick';
  }

  function stick(node, how) {
    pop.el.classList.add('is-pinned');
    pop.hint.textContent = hint(true, how);
    pinned = node;
    node.classList.add('is-open');
  }

  /* Let go, and leave the card up: the pointer or the focus is still on
     the circle, so it is back to being a card that is pointed at. */
  function unstick(how) {
    pop.el.classList.remove('is-pinned');
    pop.hint.textContent = hint(false, how);
    pinned.classList.remove('is-open');
    pinned = null;
  }

  function openPop(node, row, pin, how) {
    if (pop?.node === node) {
      if (pin) stick(node, how);
      return;
    }
    closePop();

    const el = document.createElement('div');
    el.className = 'cr-pop';
    el.setAttribute('aria-hidden', 'true');   /* the button is already described by the row */
    el.innerHTML = row.innerHTML;
    const tip = document.createElement('p');
    tip.className = 'cr-hint';
    tip.textContent = hint(false, how);
    el.append(tip);
    pop = { el, hint: tip, node };
    plan.append(el);
    row.classList.add('is-lit');

    if (pin) stick(node, how);

    /* Above the seat when there is room, below it when there is not, and
       never off either edge of the plan. */
    const P = plan.getBoundingClientRect();
    const N = node.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const cx = N.left + N.width / 2 - P.left;
    const left = Math.max(10, Math.min(P.width - w - 10, cx - w / 2));
    const above = N.top - P.top - h - 14;
    /* "Room" is measured from the foot of the bar of moments, which is
       stuck to the top of the window and would otherwise sit on the card. */
    const clear = bar.getBoundingClientRect().bottom + 10;
    let top = (N.top - h - 14 > clear) ? above : (N.bottom - P.top + 14);
    /* A part of the room can be taller than the window has room for
       either way. Then the card sits over it, at its head. */
    if (N.height > 120 && N.top - h - 14 <= clear) top = N.top - P.top + 14;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  function wire(node, row) {
    node.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse' && !pinned) openPop(node, row, false, 'mouse');
    });
    node.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !pinned) closePop();
    });
    node.addEventListener('focus', () => { if (!pinned) openPop(node, row, false, via); });
    node.addEventListener('blur', () => { if (!pinned) closePop(); });
    node.addEventListener('click', () => {
      if (pinned !== node) { openPop(node, row, true, via); return; }
      /* A second press lets it go. A finger has no "still pointing at
         it" to fall back to, so for a finger letting go is closing. */
      if (via === 'touch') closePop();
      else unstick(via);
    });
  }

  /* Both in the capture phase, so that `via` is already right by the
     time a circle hears about the same press. */
  document.addEventListener('keydown', (e) => {
    via = 'key';
    if (e.key === 'Escape' && pop) closePop();
  }, true);

  document.addEventListener('pointerdown', (e) => {
    via = e.pointerType || 'mouse';
    if (pinned && !pinned.contains(e.target) && !pop?.el.contains(e.target)) closePop();
  }, true);

  /* ── seating ── */
  function button(row, cls) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = cls ? `cr-node ${cls}` : 'cr-node';
    node.setAttribute('aria-label', `${text(row.querySelector('.cr-role'))}: ${text(row.querySelector('.cr-name'))}`);
    node.setAttribute('aria-describedby', row.id);
    return node;
  }

  function frame(node, x0, y0, x1, y1) {
    node.style.left = `${x0 / view.width * 100}%`;
    node.style.top = `${y0 / view.height * 100}%`;
    node.style.width = `${(x1 - x0) / view.width * 100}%`;
    node.style.height = `${(y1 - y0) / view.height * 100}%`;
  }

  function place(row, st) {
    const seat = row.dataset.seat;
    const side = row.dataset.side;
    const jury = seat === 'jury';
    /* A jury is a frame round its seats and not a circle, so it does not
       take the circle's three fills. Its dots carry the difference. */
    const node = button(row, jury
      ? `cr-node-group${st === 'in' ? '' : ' is-ghost'}`
      : `is-${st === 'away' ? 'case' : st}`);
    node.dataset.side = side;

    if (jury) {
      /* One frame round the seats this row speaks for. */
      const [first, last] = (row.dataset.jury || '').split('-').map(Number);
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const juror of jurors) {
        const n = Number(juror.dataset.juror);
        if (n < first || n > last) continue;
        const cx = juror.cx.baseVal.value;
        const cy = juror.cy.baseVal.value;
        x0 = Math.min(x0, cx);
        x1 = Math.max(x1, cx);
        y0 = Math.min(y0, cy);
        y1 = Math.max(y1, cy);
        juror.classList.add('is-on');
        if (side !== 'n') juror.classList.add(`is-${side}`);
        if (st !== 'in') juror.classList.add('is-ghost');
      }
      frame(node, x0 - 19, y0 - 19, x1 + 19, y1 + 19);
    } else {
      const c = seats.get(seat);
      if (!c) return null;
      node.style.left = `${c.cx.baseVal.value / view.width * 100}%`;
      node.style.top = `${c.cy.baseVal.value / view.height * 100}%`;
    }

    plan.append(node);
    wire(node, row);
    return node;
  }

  /* A part of the room, as one thing to point at: the question mark in
     its corner, and the whole of it as the target. */
  function placeZone(row) {
    const z = zones.get(row.dataset.zone);
    if (!z) return null;
    const node = button(row, 'cr-node-zone');
    const x = z.x.baseVal.value;
    const y = z.y.baseVal.value;
    frame(node, x, y, x + z.width.baseVal.value, y + z.height.baseVal.value);
    const q = document.createElement('span');
    q.className = 'cr-q';
    q.setAttribute('aria-hidden', 'true');
    q.textContent = '?';
    node.append(q);
    /* Before the people, so that anyone sitting in this part of the
       room is on top of it and can still be pointed at. */
    plan.insertBefore(node, plan.querySelector('.cr-node'));
    wire(node, row);
    return node;
  }

  /* The public, where a source says the benches had people on them.
     Spread by a fixed stride so that a few look like a few, and so the
     same moment always draws the same room. */
  function crowd(level) {
    const want = level === 'full' ? pubs.length
      : level === 'some' ? Math.round(pubs.length / 2)
      : level === 'few' ? Math.round(pubs.length / 4)
      : 0;
    const on = new Set();
    for (let k = 0; k < want; k++) on.add((k * 7) % pubs.length);
    pubs.forEach((pub, k) => pub.classList.toggle('is-on', on.has(k)));
  }

  function seatRoom(i) {
    closePop();
    for (const node of nodes) node.remove();
    nodes = [];

    for (const juror of jurors) juror.setAttribute('class', 'cr-seat cr-seat-j');

    const kind = kindOf(i);
    const taken = new Set();
    let listed = 0;

    for (const row of rows) {
      const here = present(row, i);
      const st = here ? status(row, i) : '';
      /* The list is who was in the room, in person or on a screen.
         Someone who is in the case and not in the room is still drawn,
         hollow, and their row is what the circle opens. It is only not
         listed. */
      const inRoom = st === 'in' || st === 'remote';
      row.hidden = !inRoom;
      if (!here) continue;
      if (inRoom) listed++;

      row.dataset.status = st === 'away' ? 'case' : st;
      statusLine.get(row).textContent = statusText(st, kind);
      /* Only someone actually there fills a part of the room. A person
         who is in the case and not in the room leaves it empty, and
         empty is what the note is for. */
      if (inRoom) taken.add(zoneOf(row.dataset.seat));

      const node = place(row, st);
      if (node) nodes.push(node);
    }

    /* One note to a part of the room, the first that fits: the specific
       ones are written first in the list. */
    const noted = new Set();
    let level = '';
    for (const note of abouts) {
      const zone = note.dataset.zone;
      const when = note.dataset.when;
      const fits = present(note, i) && !noted.has(zone) &&
                   (!when || when.split(/\s+/).includes(kind)) &&
                   (note.hasAttribute('data-always') || !taken.has(zone));
      /* A note is listed when it is about people: the public, where a
         source says the benches had them. A part of the room that stood
         empty says so on the plan and nowhere else. */
      const crowded = fits && !!note.dataset.crowd;
      note.hidden = !crowded;
      if (!fits) continue;
      noted.add(zone);
      if (crowded) listed++;
      if (zone === 'gallery') level = note.dataset.crowd || '';
      const node = placeZone(note);
      if (node) nodes.push(node);
    }
    crowd(level);

    /* Most moments are steps taken on paper, so most of the time the
       list is this one line, and it says which kind of nobody it is. */
    let none = list.querySelector('.cr-empty');
    if (listed) {
      none?.remove();
    } else {
      if (!none) {
        none = document.createElement('li');
        none.className = 'cr-empty';
        list.append(none);
      }
      none.textContent = i < opens ? 'Nobody yet.'
        : kind === 'court' ? 'Nobody is recorded in the room on this date.'
        : kind === 'away' ? 'Nobody. This did not happen in this room.'
        : 'Nobody. Nothing was heard in court on this date.';
    }
  }

  /* ── the moment ── */
  function roomLine(i, m) {
    const s = sits.get(m.id);
    let tag;
    let body;
    if (i < opens) {
      tag = 'Before the case';
      body = 'This is before the case reached a court, so the room is empty.';
    } else if (s) {
      tag = s.kind === 'court' ? 'In court' : 'Not in this room';
      const t = s.li.querySelector('.cr-sit-t');
      const c = s.li.querySelector('.cr-cite');
      body = (t ? t.innerHTML : '') + (c ? ` <span class="cr-cite">${c.innerHTML}</span>` : '');
    } else if (m.side === 'n') {
      tag = 'Outside court';
      body = 'This did not happen in a courtroom. The people drawn are the ones in the case at this point.';
    } else {
      tag = 'On paper';
      body = 'Nothing was heard in court on this date. The step was taken in writing, and the people drawn are the ones in the case at this point.';
    }
    cm.room.innerHTML = `<span class="cm-room-k">${tag}</span> ${body}`;
    cm.room.dataset.kind = i < opens ? 'before' : s ? s.kind : 'paper';
  }

  function show(to) {
    const last = moments.length - 1;
    const i = Math.max(0, Math.min(last, to));
    if (i === now) return;
    now = i;
    const m = moments[i];

    line.style.left = `${last ? i / last * 100 : 50}%`;
    prev.disabled = i === 0;
    next.disabled = i === last;

    track.setAttribute('aria-valuenow', i + 1);
    track.setAttribute('aria-valuetext', `${m.date}: ${m.title}`);

    cm.n.textContent = `${i + 1} of ${moments.length}`;
    cm.date.textContent = m.date;
    cm.who.textContent = (names[m.side] || '') + (m.ruling ? ` · ${m.ruling}` : '');
    cm.who.dataset.side = m.side;
    cm.title.textContent = m.title;
    cm.body.innerHTML = m.body;
    roomLine(i, m);
    cm.link.href = `${src}#${m.id}`;

    for (const area of areas) {
      area.classList.toggle('is-acting', i >= opens && area.dataset.area === m.side);
    }

    seatRoom(i);
  }

  /* ── the bar ──
     Drawn once, and again only when its width has changed, which is the
     one thing the spacing of the year labels depends on. */
  function build() {
    const width = ticks.clientWidth || 1;
    if (width === spacedFor) return;
    spacedFor = width;

    const last = moments.length - 1;
    const years = [];
    let html = '';
    moments.forEach((m, i) => {
      const x = last ? i / last * 100 : 50;
      html += `<span class="ct-tick ct-tick-${m.side}${m.key ? ' is-key' : ''}` +
              `${i < opens ? ' is-before' : ''}${kindOf(i) === 'court' ? ' is-court' : ''}` +
              `" style="left:${x}%"></span>`;

      /* A year is written where it begins. Two that begin within a
         label's width of each other cannot both be read, so the earlier
         one gives way: it is the one with the fewest entries under it. */
      const y = m.date.match(/\b(19|20)\d\d\b/)?.[0];
      if (y && years.at(-1)?.y !== y) {
        if (years.length && (x - years.at(-1).x) / 100 * width < 36) years.pop();
        years.push({ y, x });
      }
    });
    for (const { y, x } of years) {
      html += `<span class="ct-year${x > 90 ? ' ct-year-end' : ''}" style="left:${x}%">${y}</span>`;
    }
    ticks.innerHTML = html;
    ticks.append(line);       /* inside the same inset box as the ticks */
    track.setAttribute('aria-valuemax', moments.length);
  }

  function nearest(clientX) {
    const r = ticks.getBoundingClientRect();
    const t = (clientX - r.left) / r.width;
    return Math.round(Math.max(0, Math.min(1, t)) * (moments.length - 1));
  }

  function controls() {
    prev.addEventListener('click', () => show(now - 1));
    next.addEventListener('click', () => show(now + 1));

    track.addEventListener('keydown', (e) => {
      let to = null;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') to = now - 1;
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') to = now + 1;
      else if (e.key === 'PageDown') to = now - 5;
      else if (e.key === 'PageUp') to = now + 5;
      else if (e.key === 'Home') to = 0;
      else if (e.key === 'End') to = moments.length - 1;
      if (to === null) return;
      e.preventDefault();
      show(to);
    });

    let dragging = false;
    track.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      endTour();
      dragging = true;
      bar.classList.add('is-dragging');
      track.setPointerCapture(e.pointerId);
      show(nearest(e.clientX));
    });
    track.addEventListener('pointermove', (e) => {
      if (dragging) show(nearest(e.clientX));
    });
    const stop = () => {
      dragging = false;
      bar.classList.remove('is-dragging');
    };
    track.addEventListener('pointerup', stop);
    track.addEventListener('pointercancel', stop);

    /* The year labels are spaced for a width, so a new width respaces
       them. A resize that leaves the width alone, which is what a phone
       sends every time its address bar slides away, redraws nothing. */
    window.addEventListener('resize', build);
  }

  /* ── the first few seconds ──
     The line goes to two moments picked at random and then back to
     where the room opens, which is where it stood to begin with. Both
     are moments with somebody in the room. Most of the bar is steps
     taken on paper, and a line left to land anywhere mostly lands on
     those, and shows the reader an empty room twice. Only a room that
     nobody is recorded in at any other moment is toured the old way,
     through any two moments at all.

     Each stop is far enough from the one before, and the second far
     enough from the start, that all three moves cross a good part of
     the bar: a line that shifts by one tick has not been seen to move.
     Far enough is a quarter of the bar. The days of a trial sit closer
     together than that, so where nothing is a quarter away it is
     halved, and halved again, until something is.

     It waits until the bar is on the screen, since a demonstration
     nobody is looking at is only the room changing behind their back.
     The reader taking over ends it where it stands: a press on anything
     in the view, a key while the focus is in it, or a hand on the line.
     Putting a finger down does not, because that is also how a phone is
     scrolled. A reader who has asked for less motion is not shown it at
     all. */
  function endTour() {
    if (!touring) return;
    touring = false;
    clearTimeout(tourTimer);
    tourWatch?.disconnect();
    tourWatch = null;
    bar.classList.remove('is-touring');
  }

  root.addEventListener('click', endTour, true);
  root.addEventListener('keydown', endTour, true);

  function tour() {
    const last = moments.length - 1;
    if (last < 3 || still.matches) return;

    const every = moments.map((m, i) => i);
    const full = every.filter((i) => i !== opens && peopled(i));
    const pool = full.length ? full : every;

    /* At its last halving the gap is one, which asks only that the
       stop is not a moment the line is already coming from. A room
       with a single sitting has no second stop, and is not given one. */
    const pick = (...from) => {
      for (let gap = Math.max(2, Math.round(last / 4)); gap; gap >>= 1) {
        const ok = pool.filter((i) => from.every((a) => Math.abs(i - a) >= gap));
        if (ok.length) return ok[Math.floor(Math.random() * ok.length)];
      }
      return -1;
    };
    const first = pick(opens);
    const stops = [first, pick(first, opens), opens].filter((i) => i >= 0);

    const hop = () => {
      show(stops.shift());
      /* After the last one, long enough for the line to finish its way
         back before it is given its own speed again. */
      tourTimer = setTimeout(stops.length ? hop : endTour, stops.length ? 1250 : 700);
    };

    const begin = () => {
      bar.classList.add('is-touring');
      tourTimer = setTimeout(hop, 700);
    };

    touring = true;
    tourWatch = new IntersectionObserver((seen) => {
      if (!seen.at(-1).isIntersecting) return;
      tourWatch.disconnect();
      tourWatch = null;
      begin();
    }, { threshold: 0.5 });
    tourWatch.observe(bar);
  }

  let page;
  try {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    page = await res.text();
  } catch {
    return;       /* the page stays a plan and two lists */
  }

  read(new DOMParser().parseFromString(page, 'text/html'));
  if (!moments.length) return;

  readSittings();

  opens = index.get(root.dataset.opens) ?? 0;

  /* Each person's row gets a line saying which of the three they are
     at this moment. Made once, here, and rewritten as the line moves. */
  for (const row of rows) {
    const st = document.createElement('p');
    st.className = 'cr-status';
    row.prepend(st);
    statusLine.set(row, st);
  }

  /* Shown before it is built, because the year labels are spaced by
     the bar's measured width. */
  bar.hidden = false;
  panel.hidden = false;
  if (legend) legend.hidden = false;
  if (days) days.hidden = true;     /* each day now shows under its own moment */
  build();
  controls();

  /* Start where the room first has anyone in it. A reader can step
     back into the empty part; they should not have to step through
     it to find out what this view does. */
  show(opens);
  tour();
})();

/* ── corrections ──
   Posts to the same intake service as the Preside by Side suggestion form,
   on its own route. The gates that matter are all server-side: the cooldown
   below is only there to stop a double-click becoming two rows, and curl
   ignores it entirely.

   Which case the correction is about comes from data-case on <body>, so the
   form itself carries no case-specific markup and a new case page needs no
   new script. The slug is only a claim until the service checks it: the
   route rejects anything not on its own allowlist, which is what decides
   the title the correction arrives under. Sending it here rather than
   asking the reader keeps a third control off a form that already has
   three.

   A form with no action is not inert. Left to itself it submits to its own
   page's address, with everything the reader typed in the query string. So
   the Send button ships disabled, which stops a press and the Enter key
   alike, and this turns it on. With no JavaScript the form says it cannot
   send, and sends nothing. */

(() => {
  const form = document.getElementById('fix-form');
  if (!form) return;

  const CASE = document.body.dataset.case || '';
  if (!CASE) return;          /* no case, nothing to file a correction against */

  const ENDPOINT = '/api/suggest/case';
  const COOLDOWN_MS = 4000;

  const status = document.getElementById('fix-status');
  const send = form.querySelector('.fix-send');
  const detail = form.querySelector('[name="detail"]');
  const source = form.querySelector('[name="source"]');
  let last = 0;

  function say(text, kind) {
    status.textContent = text;
    status.classList.remove('is-error', 'is-success');
    if (kind) status.classList.add(`is-${kind}`);
  }

  /* "example.com/x" is a link with the scheme left off, not a typo. Say so
     rather than refusing it after the round trip. */
  const bareDomain = (v) => /^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)*\.[a-z]{2,}(\/.*)?$/i.test(v);

  source.addEventListener('input', () => {
    const v = source.value.trim();
    const bad = v !== '' && !/^https?:\/\//i.test(v);
    source.classList.toggle('is-invalid', bad);
    if (bad) say(bareDomain(v) ? 'Add https:// to the link, or clear it.' : 'That link needs to start with http:// or https://', 'error');
    else if (status.classList.contains('is-error')) say('', null);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (source.classList.contains('is-invalid')) return;

    const now = Date.now();
    if (now - last < COOLDOWN_MS) return;

    const data = new FormData(form);
    const field = (name) => String(data.get(name) ?? '');

    /* Honeypot. Accept and discard, so a bot never learns it was caught. */
    if (field('website').trim() !== '') {
      say('Sent. Thank you.', 'success');
      form.reset();
      return;
    }

    const body = {
      case: CASE,
      kind: field('kind'),
      detail: field('detail').trim(),
      source: field('source').trim(),
      website: ''
    };

    if (!body.detail) {
      say('Tell me what to look at first.', 'error');
      detail.focus();
      return;
    }

    last = now;
    send.disabled = true;
    const label = send.textContent;
    send.textContent = 'Sending…';
    say('', null);

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        /* Surface the service's own message when it has one, so the reader
           can fix the thing rather than guess. */
        const reply = await res.json().catch(() => null);
        throw new Error(reply?.error || `HTTP ${res.status}`);
      }
      say('Sent. I read all of these.', 'success');
      form.reset();
      source.classList.remove('is-invalid');
    } catch (err) {
      say(err?.message ? `Could not send — ${err.message}`
                       : 'Could not send — try again in a moment.', 'error');
      last = 0;
    } finally {
      send.disabled = false;
      send.textContent = label;
    }
  });

  send.disabled = false;
})();

/* ── the shelf, for a reader with nothing to point with ──
   A volume's plate comes up when the volume is pointed at, and the plate
   is the only place the hub describes a case. A finger cannot point. It
   can only press, and a press on a link is a visit. So the first tap on
   a volume picks it, which stands its plate up and leaves the reader
   where they are, and a second tap, on the volume or on the plate, goes
   through. The plate is inside its volume's link, so the second tap needs
   nothing from this file.

   A mouse click goes through at once, as it always did, and so does the
   Enter key: both have already had the plate, from the hover or from the
   focus ring. Where the browser says what made the click that is what is
   asked, and where it does not, whether the screen can hover at all.

   A volume nobody has written yet is not a link. It is picked the same
   way and there is nothing to go through to.

   With no JavaScript every volume is a plain link and the first tap
   goes through. */

(() => {
  const rail = document.querySelector('.shelf-rail');
  if (!rail) return;

  const noHover = window.matchMedia('(hover: none)');
  let picked = null;

  rail.addEventListener('click', (e) => {
    const bk = e.target.closest?.('.bk');
    if (!bk || bk === picked) return;
    if (e.detail === 0) return;          /* the keyboard made this click */

    const finger = e.pointerType ? e.pointerType === 'touch' : noHover.matches;
    if (!finger) return;

    picked?.classList.remove('is-picked');
    picked = bk;
    bk.classList.add('is-picked');
    e.preventDefault();
  });
})();
