/* chronicle.js
   Shared by the Case Chronicle hub and every case page under it.
   Nothing here names a case: each block bails out quietly when the
   markup it enhances is absent, so a page that has no ledger, no
   exhibit wash or no corrections form simply does without.

   One control: open or collapse every depth in the ledger at once.

   Pure enhancement. The drawers are <details>, so they already work
   individually with no script and no pointer. The button stays hidden
   until this file runs, so a reader without JS never sees a dead control. */

(function () {
  'use strict';

  var btn = document.getElementById('depth-all');
  var ledger = document.getElementById('ledger');
  if (!btn || !ledger) return;

  var drawers = ledger.querySelectorAll('details.drawer');
  if (!drawers.length) return;

  var label = btn.querySelector('.da-l');
  var OPEN = 'Open every layer';
  var SHUT = 'Collapse everything';

  function allOpen() {
    for (var i = 0; i < drawers.length; i++) {
      if (!drawers[i].open) return false;
    }
    return true;
  }

  function sync() {
    var open = allOpen();
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.classList.toggle('is-open', open);
    label.textContent = open ? SHUT : OPEN;
  }

  btn.addEventListener('click', function () {
    var open = !allOpen();
    for (var i = 0; i < drawers.length; i++) drawers[i].open = open;
    sync();
  });

  /* Keep the button honest when drawers are opened one at a time. */
  for (var i = 0; i < drawers.length; i++) {
    drawers[i].addEventListener('toggle', sync);
  }

  btn.hidden = false;
  sync();
})();

/* ── chronology: one more layer per card ──
   The detail ships open and the toggles ship hidden, so a reader with no
   JavaScript gets everything and no dead controls. This collapses them,
   then arms the transition a frame later so the initial close is instant
   rather than a page-load animation. */

(function () {
  'use strict';

  var tl = document.querySelector('.tl');
  if (!tl) return;

  var cards = tl.querySelectorAll('.tl-c');
  var wired = 0;

  for (var i = 0; i < cards.length; i++) {
    (function (card) {
      var btn = card.querySelector('.tl-more');
      var region = card.querySelector('.tl-x');
      if (!btn || !region) return;

      var label = btn.querySelector('.tl-more-l');
      btn.hidden = false;
      btn.setAttribute('aria-expanded', 'false');
      wired++;

      btn.addEventListener('click', function () {
        var open = card.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        label.textContent = open ? 'Less' : 'More';
      });
    })(cards[i]);
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

/* ── exhibit wash: the parallax ──
   The two strips of recreated exhibits are translated at a fraction of
   the scroll, so the argument moves over evidence that lags behind it.
   Left and right run at different rates: the two sides of this case do
   not keep step anywhere else either.

   Transform only, written inside a frame, so the whole thing stays on
   the compositor and never triggers layout. */

(function () {
  'use strict';

  var layer = document.querySelector('.exhibits');
  if (!layer) return;

  var cols = [
    { strip: document.querySelector('.ex-col-p .ex-strip'), rate: 0.42 },
    { strip: document.querySelector('.ex-col-d .ex-strip'), rate: 0.30 }
  ];
  if (!cols[0].strip || !cols[1].strip) return;

  var slow = window.matchMedia('(prefers-reduced-motion: reduce)');
  var bound = false;
  var ticking = false;
  var pending = false;

  /* A strip that only moves at 42% of the scroll still has to be under
     the viewport when the page has run out. Measure one pass of the
     cards, then lay down as many copies as the page is long enough to
     need. The layer is fixed, so none of this can feed back into the
     document height it is measuring. */
  function fill(col) {
    if (col.seed == null) {
      col.seed = col.strip.innerHTML;
      col.unit = col.strip.offsetHeight;
    }
    if (!col.unit) return;

    var run = document.documentElement.scrollHeight - window.innerHeight;
    var need = run * col.rate + window.innerHeight + 240;
    var copies = Math.max(1, Math.ceil(need / col.unit));
    if (copies === col.copies) return;

    var out = '';
    for (var i = 0; i < copies; i++) out += col.seed;
    col.strip.innerHTML = out;
    col.copies = copies;
  }

  function place() {
    var y = window.pageYOffset;
    for (var i = 0; i < cols.length; i++) {
      cols[i].strip.style.transform =
        'translate3d(0,' + (-y * cols[i].rate).toFixed(2) + 'px,0)';
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
      for (var i = 0; i < cols.length; i++) cols[i].strip.style.transform = '';
      return;
    }

    for (var j = 0; j < cols.length; j++) fill(cols[j]);
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
  if (window.ResizeObserver) {
    new ResizeObserver(resync).observe(document.body);
  }

  if (slow.addEventListener) slow.addEventListener('change', resync);

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

(function () {
  'use strict';

  var btn = document.querySelector('.to-top');
  var mast = document.querySelector('.masthead');
  if (!btn || !mast || !window.IntersectionObserver) return;

  btn.hidden = false;

  /* Section navigation steps aside by exactly the width of this button,
     and CSS
     has no way to ask for that, so it is published here as a custom
     property. Measured rather than hardcoded: the label is one line of
     mono, and its width moves with the reader's base font size, with
     zoom, and with whether the web font has arrived yet. Re-measured
     whenever any of that can have changed. */
  function publishWidth() {
    document.documentElement.style.setProperty('--totop-w', btn.offsetWidth + 'px');
  }

  publishWidth();

  /* Watching the button itself rather than the window, because the things
     that change its width mostly are not resizes: the mono face arriving,
     the reader's base font size, page zoom. A ResizeObserver catches all
     of them and nothing else. Publishing the width cannot change the
     button's own size, so this cannot feed back on itself. */
  if (window.ResizeObserver) {
    new ResizeObserver(publishWidth).observe(btn);
  } else {
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(publishWidth);
    window.addEventListener('resize', publishWidth);
  }

  /* The class on the root is what lets the section pill step aside for
     this button, and only while it is actually out: without it the pill
     would sit beside an empty slot for the first screen of the page. */
  new IntersectionObserver(function (entries) {
    var out = !entries[0].isIntersecting;
    btn.classList.toggle('is-on', out);
    document.documentElement.classList.toggle('has-to-top', out);
  }, { threshold: 0 }).observe(mast);
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

(function () {
  'use strict';

  var gloss = document.querySelector('.gloss');
  var panel = document.querySelector('.gloss-p');
  if (!gloss || !panel) return;

  function unlight() {
    var lit = panel.querySelector('.is-found');
    if (lit) lit.classList.remove('is-found');
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a.term') : null;
    if (!a) return;

    var dt = document.getElementById(a.getAttribute('data-term'));
    var row = dt && dt.parentElement;
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
     it. This is the one place that hears about all of them. Opened again from the button, the glossary is a list with
     nothing singled out. */
  gloss.addEventListener('toggle', function () {
    if (!gloss.open) unlight();
  });

  /* Escape closes it, the way every other panel on the web does. */
  document.addEventListener('keydown', function (e) {
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
  var SLOP = 6;
  var down = null;

  document.addEventListener('pointerdown', function (e) {
    down = gloss.open && !gloss.contains(e.target)
      ? { x: e.clientX, y: e.clientY }
      : null;
  });

  document.addEventListener('pointerup', function (e) {
    var from = down;
    down = null;
    if (!from || !gloss.open || gloss.contains(e.target)) return;
    if (e.target.closest && e.target.closest('a.term')) return;
    if (Math.abs(e.clientX - from.x) > SLOP || Math.abs(e.clientY - from.y) > SLOP) return;
    gloss.open = false;
  });
})();

/* ── the locked door ──
   The Courtroom View is a preview of something unfinished, and the door
   to it says so by being locked. The lock is hung here rather than in
   the markup, so a reader with no JavaScript gets a plain link to the
   preview and never a padlock with nothing to take it off.

   Unlocking is remembered, on this browser, for every case: having
   broken one lock the reader has made the decision, and making them
   repeat it four times would turn a small ceremony into a toll. Storage
   is asked for inside a try because a private window may refuse it, in
   which case the lock simply comes back next visit. */

(function () {
  'use strict';

  var slot = document.querySelector('[data-door-lock]');
  if (!slot) return;

  var door = slot.querySelector('.door');
  var btn = slot.querySelector('.door-unlock');
  var label = slot.querySelector('.door-go-l');
  if (!door || !btn || !label) return;

  var KEY = 'cc-courtroom-unlocked';
  var href = door.getAttribute('href');

  function remembered() {
    try { return window.localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }

  if (remembered()) return;

  /* Locked: no href, so the leaf is neither a link nor a tab stop, and
     the padlock is the one control on it. */
  door.removeAttribute('href');
  label.textContent = 'Locked · still being built';
  slot.classList.add('is-locked');
  btn.setAttribute('aria-label', 'Unlock the Courtroom View preview');
  btn.hidden = false;

  /* Trying the door rattles the lock, which is how a reader who has not
     noticed the padlock finds out where it is. */
  var locked = true;
  door.addEventListener('click', function () {
    if (!locked) return;
    btn.classList.remove('is-rattled');
    void btn.offsetWidth;
    btn.classList.add('is-rattled');
  });

  btn.addEventListener('click', function () {
    locked = false;
    btn.classList.remove('is-rattled');
    try { window.localStorage.setItem(KEY, '1'); } catch (e) { /* not remembered, still unlocked */ }

    door.setAttribute('href', href);
    label.textContent = 'Preview';
    slot.classList.remove('is-locked');
    btn.classList.add('is-broken');

    /* The button is about to leave, and focus must not leave with it. */
    door.focus();

    var gone = function () { btn.hidden = true; };
    btn.addEventListener('animationend', function (e) {
      if (e.target === btn) gone();
    });
    /* For a reader with motion turned down, where the stylesheet cuts
       the fall to nothing and the event may not be worth waiting on. */
    setTimeout(gone, 900);
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
   pointer, a finger and the keyboard alike, and what it opens is the
   same row the reader could have read in the list.

   If the chronology cannot be fetched the bar never appears, and the
   page stays what it is without a script: an empty plan and two lists. */

(function () {
  'use strict';

  var root = document.querySelector('.cr');
  if (!root || !window.fetch || !window.DOMParser) return;

  var plan = root.querySelector('.cr-plan');
  var svg = root.querySelector('.cr-svg');
  var bar = root.querySelector('.ct');
  var track = root.querySelector('.ct-track');
  var ticks = root.querySelector('.ct-ticks');
  var line = root.querySelector('.ct-line');
  var prev = root.querySelector('.ct-prev');
  var next = root.querySelector('.ct-next');
  var panel = root.querySelector('.cm');
  var list = root.querySelector('.cr-cast');
  if (!plan || !svg || !bar || !track || !ticks || !line || !prev || !next || !panel || !list) return;

  var legend = root.querySelector('.cr-key');
  var days = root.querySelector('.cr-days');

  var src = root.getAttribute('data-chronology');
  var view = svg.viewBox.baseVal;
  var all = [].slice.call(list.querySelectorAll('.cr-who'));
  var rows = all.filter(function (r) { return !r.classList.contains('cr-about'); });
  var abouts = all.filter(function (r) { return r.classList.contains('cr-about'); });

  var moments = [];
  var index = {};          /* entry id -> position in moments */
  var names = {};          /* side -> the name the chronology's key gives it */
  var sits = {};           /* entry id -> { kind, li }: the days something happened in a room */
  var opens = 0;
  var now = -1;
  var nodes = [];
  var pop = null;
  var pinned = null;
  var via = 'mouse';       /* how the reader last acted: mouse, touch, pen or key */

  function text(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }

  function sideOf(li) {
    var c = li.classList;
    return c.contains('tl-p') ? 'p' : c.contains('tl-d') ? 'd' : c.contains('tl-court') ? 'court' : 'n';
  }

  /* ── reading the chronology ── */
  function read(doc) {
    var key = doc.querySelector('.tl-key');
    if (key) {
      names.p = text(key.querySelector('.tk-p'));
      names.d = text(key.querySelector('.tk-d'));
      names.court = text(key.querySelector('.tk-c'));
    }
    names.n = 'Off the docket';

    var items = doc.querySelectorAll('.tl > li.tl-ev');
    for (var i = 0; i < items.length; i++) {
      var li = items[i];
      var date = li.querySelector('.tl-date');
      var body = li.querySelector('.tl-b');
      var chip = date && date.querySelector('.chip');
      var when = '';
      if (date) {
        var d = date.cloneNode(true);
        var c = d.querySelector('.chip');
        if (c) d.removeChild(c);
        when = text(d);
      }
      index[li.id] = moments.length;
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
    var items = root.querySelectorAll('.cr-sits > li');
    for (var i = 0; i < items.length; i++) {
      var ids = (items[i].getAttribute('data-at') || '').split(/\s+/);
      for (var k = 0; k < ids.length; k++) {
        if (ids[k]) sits[ids[k]] = { kind: items[i].getAttribute('data-kind'), li: items[i] };
      }
    }
  }

  /* court: a sitting in this room. away: it happened in some other
     room. paper: a filing, a written order, or something off the docket. */
  function kindOf(i) {
    var s = sits[moments[i].id];
    return s ? s.kind : 'paper';
  }

  /* ── who is there ──
     A row with no dates is there from the moment the room opens. An
     entry id that the chronology no longer has is treated as no limit,
     so a retitled card leaves someone seated too long, never drops
     them from the room without a trace. */
  function at(attr, row) {
    var out = [];
    var ids = (row.getAttribute(attr) || '').split(/\s+/);
    for (var i = 0; i < ids.length; i++) {
      if (ids[i] && index[ids[i]] != null) out.push(index[ids[i]]);
    }
    return out;
  }

  function present(row, i) {
    if (row.hasAttribute('data-before')) return i < opens;
    if (i < opens) return false;
    if (row.hasAttribute('data-at')) return at('data-at', row).indexOf(i) !== -1;
    if (at('data-not', row).indexOf(i) !== -1) return false;
    var from = at('data-from', row);
    var gone = at('data-gone', row);
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
    if (at('data-away', row).indexOf(i) !== -1) return 'away';
    if (at('data-remote', row).indexOf(i) !== -1) return 'remote';
    if (row.getAttribute('data-in') === '*' || at('data-in', row).indexOf(i) !== -1) return 'in';
    return 'case';
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
    if (seat.indexOf('judge') === 0) return 'bench';
    if (seat.indexOf('stand') === 0) return 'stand';
    return seat.charAt(0) === 'g' ? 'gallery' : seat.charAt(0);
  }

  /* ── the card ── */
  function closePop() {
    if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
    if (pinned) pinned.classList.remove('is-open');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('is-lit');
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
    pop.classList.add('is-pinned');
    pop._hint.textContent = hint(true, how);
    pinned = node;
    node.classList.add('is-open');
  }

  /* Let go, and leave the card up: the pointer or the focus is still on
     the circle, so it is back to being a card that is pointed at. */
  function unstick(how) {
    pop.classList.remove('is-pinned');
    pop._hint.textContent = hint(false, how);
    pinned.classList.remove('is-open');
    pinned = null;
  }

  function openPop(node, pin, how) {
    var row = node._row;
    if (pop && pop._for === node) {
      if (pin) stick(node, how);
      return;
    }
    closePop();

    pop = document.createElement('div');
    pop.className = 'cr-pop';
    pop.setAttribute('aria-hidden', 'true');   /* the button is already described by the row */
    pop.innerHTML = row.innerHTML;
    pop._hint = document.createElement('p');
    pop._hint.className = 'cr-hint';
    pop._hint.textContent = hint(false, how);
    pop.appendChild(pop._hint);
    pop._for = node;
    plan.appendChild(pop);
    row.classList.add('is-lit');

    if (pin) stick(node, how);

    /* Above the seat when there is room, below it when there is not, and
       never off either edge of the plan. */
    var P = plan.getBoundingClientRect();
    var N = node.getBoundingClientRect();
    var w = pop.offsetWidth;
    var h = pop.offsetHeight;
    var cx = N.left + N.width / 2 - P.left;
    var left = Math.max(10, Math.min(P.width - w - 10, cx - w / 2));
    var above = N.top - P.top - h - 14;
    /* "Room" is measured from the foot of the bar of moments, which is
       stuck to the top of the window and would otherwise sit on the card. */
    var clear = bar.getBoundingClientRect().bottom + 10;
    var top = (N.top - h - 14 > clear) ? above : (N.bottom - P.top + 14);
    /* A part of the room can be taller than the window has room for
       either way. Then the card sits over it, at its head. */
    if (N.height > 120 && N.top - h - 14 <= clear) top = N.top - P.top + 14;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  function wire(node) {
    node.addEventListener('pointerenter', function (e) {
      if (e.pointerType === 'mouse' && !pinned) openPop(node, false, 'mouse');
    });
    node.addEventListener('pointerleave', function (e) {
      if (e.pointerType === 'mouse' && !pinned) closePop();
    });
    node.addEventListener('focus', function () { if (!pinned) openPop(node, false, via); });
    node.addEventListener('blur', function () { if (!pinned) closePop(); });
    node.addEventListener('click', function () {
      if (pinned !== node) { openPop(node, true, via); return; }
      /* A second press lets it go. A finger has no "still pointing at
         it" to fall back to, so for a finger letting go is closing. */
      if (via === 'touch') closePop();
      else unstick(via);
    });
  }

  /* Both in the capture phase, so that `via` is already right by the
     time a circle hears about the same press. */
  document.addEventListener('keydown', function (e) {
    via = 'key';
    if (e.key === 'Escape' && pop) closePop();
  }, true);

  document.addEventListener('pointerdown', function (e) {
    via = e.pointerType || 'mouse';
    if (pinned && !pinned.contains(e.target) && !(pop && pop.contains(e.target))) closePop();
  }, true);

  /* ── seating ── */
  function button(row, cls) {
    var node = document.createElement('button');
    node.type = 'button';
    node.className = 'cr-node' + (cls ? ' ' + cls : '');
    node.setAttribute('aria-label', text(row.querySelector('.cr-role')) + ': ' + text(row.querySelector('.cr-name')));
    node.setAttribute('aria-describedby', row.id);
    node._row = row;
    return node;
  }

  function frame(node, x0, y0, x1, y1) {
    node.style.left = (x0 / view.width * 100) + '%';
    node.style.top = (y0 / view.height * 100) + '%';
    node.style.width = ((x1 - x0) / view.width * 100) + '%';
    node.style.height = ((y1 - y0) / view.height * 100) + '%';
  }

  function place(row, st) {
    var seat = row.getAttribute('data-seat');
    /* A jury is a frame round its seats and not a circle, so it does not
       take the circle's three fills. Its dots carry the difference. */
    var node = button(row, seat === 'jury' ? 'cr-node-group' + (st === 'in' ? '' : ' is-ghost') : 'is-' + (st === 'away' ? 'case' : st));
    node.setAttribute('data-side', row.getAttribute('data-side'));

    if (seat === 'jury') {
      /* One frame round the seats this row speaks for. */
      var range = (row.getAttribute('data-jury') || '').split('-');
      var jurors = svg.querySelectorAll('.cr-seat-j');
      var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (var i = 0; i < jurors.length; i++) {
        var n = +jurors[i].getAttribute('data-juror');
        if (n < +range[0] || n > +range[1]) continue;
        var cx = jurors[i].cx.baseVal.value, cy = jurors[i].cy.baseVal.value;
        x0 = Math.min(x0, cx); x1 = Math.max(x1, cx);
        y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
        var side = row.getAttribute('data-side');
        jurors[i].classList.add('is-on');
        if (side !== 'n') jurors[i].classList.add('is-' + side);
        if (st !== 'in') jurors[i].classList.add('is-ghost');
      }
      frame(node, x0 - 19, y0 - 19, x1 + 19, y1 + 19);
    } else {
      var c = svg.querySelector('.cr-seat[data-seat="' + seat + '"]');
      if (!c) return null;
      node.style.left = (c.cx.baseVal.value / view.width * 100) + '%';
      node.style.top = (c.cy.baseVal.value / view.height * 100) + '%';
    }

    plan.appendChild(node);
    wire(node);
    return node;
  }

  /* A part of the room, as one thing to point at: the question mark in
     its corner, and the whole of it as the target. */
  function placeZone(row) {
    var z = svg.querySelector('.cr-zone[data-zone="' + row.getAttribute('data-zone') + '"]');
    if (!z) return null;
    var node = button(row, 'cr-node-zone');
    var x = z.x.baseVal.value, y = z.y.baseVal.value;
    frame(node, x, y, x + z.width.baseVal.value, y + z.height.baseVal.value);
    var q = document.createElement('span');
    q.className = 'cr-q';
    q.setAttribute('aria-hidden', 'true');
    q.textContent = '?';
    node.appendChild(q);
    /* Before the people, so that anyone sitting in this part of the
       room is on top of it and can still be pointed at. */
    plan.insertBefore(node, plan.querySelector('.cr-node'));
    wire(node);
    return node;
  }

  /* The public, where a source says the benches had people on them.
     Spread by a fixed stride so that a few look like a few, and so the
     same moment always draws the same room. */
  function crowd(level) {
    var pubs = svg.querySelectorAll('.cr-pub');
    var want = level === 'full' ? pubs.length : level === 'some' ? Math.round(pubs.length / 2) : level === 'few' ? Math.round(pubs.length / 4) : 0;
    for (var i = 0; i < pubs.length; i++) pubs[i].setAttribute('class', 'cr-pub');
    for (var k = 0; k < want; k++) pubs[(k * 7) % pubs.length].setAttribute('class', 'cr-pub is-on');
  }

  function seatRoom(i) {
    closePop();
    for (var k = 0; k < nodes.length; k++) plan.removeChild(nodes[k]);
    nodes = [];

    var jurors = svg.querySelectorAll('.cr-seat-j');
    for (var j = 0; j < jurors.length; j++) jurors[j].setAttribute('class', 'cr-seat cr-seat-j');

    var kind = kindOf(i);
    var taken = {};
    var any = false;

    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      var here = present(row, i);
      row.hidden = !here;
      if (!here) continue;
      any = true;

      var st = status(row, i);
      row.setAttribute('data-status', st === 'away' ? 'case' : st);
      row._status.textContent = statusText(st, kind);
      /* Only someone actually there fills a part of the room. A person
         who is in the case and not in the room leaves it empty, and
         empty is what the note is for. */
      if (st === 'in' || st === 'remote') taken[zoneOf(row.getAttribute('data-seat'))] = true;

      var node = place(row, st);
      if (node) nodes.push(node);
    }

    /* One note to a part of the room, the first that fits: the specific
       ones are written first in the list. */
    var noted = {};
    var level = '';
    for (var a = 0; a < abouts.length; a++) {
      var note = abouts[a];
      var zone = note.getAttribute('data-zone');
      var when = note.getAttribute('data-when');
      var show = present(note, i) && !noted[zone] &&
                 (!when || when.split(/\s+/).indexOf(kind) !== -1) &&
                 (note.hasAttribute('data-always') || !taken[zone]);
      note.hidden = !show;
      if (!show) continue;
      noted[zone] = true;
      any = true;
      if (zone === 'gallery') level = note.getAttribute('data-crowd') || '';
      var zn = placeZone(note);
      if (zn) nodes.push(zn);
    }
    crowd(level);

    var none = list.querySelector('.cr-empty');
    if (!any && !none) {
      none = document.createElement('li');
      none.className = 'cr-empty';
      none.textContent = 'Nobody yet.';
      list.appendChild(none);
    } else if (any && none) {
      list.removeChild(none);
    }
  }

  /* ── the moment ── */
  function roomLine(i, m) {
    var room = panel.querySelector('.cm-room');
    var s = sits[m.id];
    var tag, body;
    if (i < opens) {
      tag = 'Before the case';
      body = 'This is before the case reached a court, so the room is empty.';
    } else if (s) {
      tag = s.kind === 'court' ? 'In court' : 'Not in this room';
      var t = s.li.querySelector('.cr-sit-t');
      var c = s.li.querySelector('.cr-cite');
      body = (t ? t.innerHTML : '') + (c ? ' <span class="cr-cite">' + c.innerHTML + '</span>' : '');
    } else if (m.side === 'n') {
      tag = 'Outside court';
      body = 'This did not happen in a courtroom. The people drawn are the ones in the case at this point.';
    } else {
      tag = 'On paper';
      body = 'Nothing was heard in court on this date. The step was taken in writing, and the people drawn are the ones in the case at this point.';
    }
    room.innerHTML = '<span class="cm-room-k">' + tag + '</span> ' + body;
    room.setAttribute('data-kind', i < opens ? 'before' : s ? s.kind : 'paper');
  }

  function show(i) {
    i = Math.max(0, Math.min(moments.length - 1, i));
    if (i === now) return;
    now = i;
    var m = moments[i];

    var last = moments.length - 1;
    line.style.left = (last ? i / last * 100 : 50) + '%';
    prev.disabled = i === 0;
    next.disabled = i === last;

    track.setAttribute('aria-valuenow', i + 1);
    track.setAttribute('aria-valuetext', m.date + ': ' + m.title);

    panel.querySelector('.cm-n').textContent = (i + 1) + ' of ' + moments.length;
    panel.querySelector('.cm-date').textContent = m.date;
    var who = panel.querySelector('.cm-who');
    who.textContent = (names[m.side] || '') + (m.ruling ? ' · ' + m.ruling : '');
    who.setAttribute('data-side', m.side);
    panel.querySelector('.cm-h').textContent = m.title;
    panel.querySelector('.cm-b').innerHTML = m.body;
    roomLine(i, m);
    panel.querySelector('.cm-link').href = src + '#' + m.id;

    var areas = svg.querySelectorAll('.cr-area');
    for (var a = 0; a < areas.length; a++) {
      areas[a].classList.toggle('is-acting', i >= opens && areas[a].getAttribute('data-area') === m.side);
    }

    seatRoom(i);
  }

  /* ── the bar ── */
  function build() {
    var last = moments.length - 1;
    var width = ticks.clientWidth || 1;
    var html = '';
    var years = [];
    for (var i = 0; i < moments.length; i++) {
      var m = moments[i];
      var x = (last ? i / last * 100 : 50);
      html += '<i class="ct-tick ct-tick-' + m.side + (m.key ? ' is-key' : '') +
              (i < opens ? ' is-before' : '') + (kindOf(i) === 'court' ? ' is-court' : '') +
              '" style="left:' + x + '%"></i>';

      /* A year is written where it begins. Two that begin within a
         label's width of each other cannot both be read, so the earlier
         one gives way: it is the one with the fewest entries under it. */
      var y = (m.date.match(/\b(19|20)\d\d\b/) || [''])[0];
      if (y && (!years.length || years[years.length - 1].y !== y)) {
        if (years.length && (x - years[years.length - 1].x) / 100 * width < 36) years.pop();
        years.push({ y: y, x: x });
      }
    }
    for (var k = 0; k < years.length; k++) {
      html += '<span class="ct-year' + (years[k].x > 90 ? ' ct-year-end' : '') +
              '" style="left:' + years[k].x + '%">' + years[k].y + '</span>';
    }
    ticks.innerHTML = html;
    ticks.appendChild(line);       /* inside the same inset box as the ticks */
    track.setAttribute('aria-valuemax', moments.length);
  }

  function nearest(clientX) {
    var r = ticks.getBoundingClientRect();
    var t = (clientX - r.left) / r.width;
    return Math.round(Math.max(0, Math.min(1, t)) * (moments.length - 1));
  }

  function controls() {
    prev.addEventListener('click', function () { show(now - 1); });
    next.addEventListener('click', function () { show(now + 1); });

    track.addEventListener('keydown', function (e) {
      var to = null;
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

    var dragging = false;
    track.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      dragging = true;
      bar.classList.add('is-dragging');
      if (track.setPointerCapture) track.setPointerCapture(e.pointerId);
      show(nearest(e.clientX));
    });
    track.addEventListener('pointermove', function (e) {
      if (dragging) show(nearest(e.clientX));
    });
    var stop = function () {
      dragging = false;
      bar.classList.remove('is-dragging');
    };
    track.addEventListener('pointerup', stop);
    track.addEventListener('pointercancel', stop);

    /* The year labels are spaced for a width, so a new width respaces them. */
    window.addEventListener('resize', build);
  }

  fetch(src, { credentials: 'same-origin' }).then(function (res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.text();
  }).then(function (html) {
    read(new DOMParser().parseFromString(html, 'text/html'));
    if (!moments.length) return;

    readSittings();

    var o = index[root.getAttribute('data-opens')];
    opens = o == null ? 0 : o;

    /* Each person's row gets a line saying which of the three they are
       at this moment. Made once, here, and rewritten as the line moves. */
    for (var r = 0; r < rows.length; r++) {
      var st = document.createElement('p');
      st.className = 'cr-status';
      rows[r].insertBefore(st, rows[r].firstChild);
      rows[r]._status = st;
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
  }).catch(function () { /* the page stays a plan and two lists */ });
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

   The form ships without an action, so with no JavaScript it simply does
   not submit rather than navigating somewhere useless. */

(function () {
  'use strict';

  var form = document.getElementById('fix-form');
  if (!form) return;

  var CASE = document.body.getAttribute('data-case') || '';
  if (!CASE) return;          /* no case, nothing to file a correction against */

  var ENDPOINT = '/api/suggest/case';
  var COOLDOWN_MS = 4000;

  var status = document.getElementById('fix-status');
  var send = form.querySelector('.fix-send');
  var detail = form.querySelector('[name="detail"]');
  var source = form.querySelector('[name="source"]');
  var last = 0;

  function say(text, kind) {
    status.textContent = text;
    status.classList.remove('is-error', 'is-success');
    if (kind) status.classList.add('is-' + kind);
  }

  /* "example.com/x" is a link with the scheme left off, not a typo. Say so
     rather than refusing it after the round trip. */
  function bareDomain(v) {
    return /^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)*\.[a-z]{2,}(\/.*)?$/i.test(v);
  }

  source.addEventListener('input', function () {
    var v = source.value.trim();
    var bad = v !== '' && !/^https?:\/\//i.test(v);
    source.classList.toggle('is-invalid', bad);
    if (bad) say(bareDomain(v) ? 'Add https:// to the link, or clear it.' : 'That link needs to start with http:// or https://', 'error');
    else if (status.classList.contains('is-error')) say('', null);
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    if (source.classList.contains('is-invalid')) return;

    var now = Date.now();
    if (now - last < COOLDOWN_MS) return;

    var data = new FormData(form);

    /* Honeypot. Accept and discard, so a bot never learns it was caught. */
    if ((data.get('website') || '').toString().trim() !== '') {
      say('Sent. Thank you.', 'success');
      form.reset();
      return;
    }

    var body = {
      'case': CASE,
      kind: (data.get('kind') || '').toString(),
      detail: (data.get('detail') || '').toString().trim(),
      source: (data.get('source') || '').toString().trim(),
      website: ''
    };

    if (!body.detail) {
      say('Tell me what to look at first.', 'error');
      detail.focus();
      return;
    }

    last = now;
    send.disabled = true;
    var label = send.textContent;
    send.textContent = 'Sending…';
    say('', null);

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (res.ok) return null;
      /* Surface the service's own message when it has one, so the reader
         can fix the thing rather than guess. */
      return res.json().catch(function () { return null; }).then(function (b) {
        throw new Error((b && b.error) || 'HTTP ' + res.status);
      });
    }).then(function () {
      say('Sent. I read all of these.', 'success');
      form.reset();
      source.classList.remove('is-invalid');
    }).catch(function (err) {
      say(err && err.message ? 'Could not send — ' + err.message
                             : 'Could not send — try again in a moment.', 'error');
      last = 0;
    }).then(function () {
      send.disabled = false;
      send.textContent = label;
    });
  });
})();
