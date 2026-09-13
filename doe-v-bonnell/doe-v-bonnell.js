/* doe-v-bonnell.js
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
   bargain as the two buttons above. The anchor itself would work
   without any of this; what needs the script is knowing when to offer
   it. */

(function () {
  'use strict';

  var btn = document.querySelector('.to-top');
  var mast = document.querySelector('.masthead');
  if (!btn || !mast || !window.IntersectionObserver) return;

  btn.hidden = false;

  /* Skip ahead steps aside by exactly the width of this button, and CSS
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

  /* The class on the root is what lets Skip ahead step aside for this
     button, and only while it is actually out: without it the skip pill
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
   entry into view inside its own scroll, and light it briefly so the
   eye lands on the right row rather than merely the right panel.

   The default is prevented, which means the URL is left alone. Nobody
   wants a page of citations to fill their history with #t-deposition,
   and the reader's place on a twenty-screen page is worth more than a
   linkable fragment. */

(function () {
  'use strict';

  var gloss = document.querySelector('.gloss');
  var panel = document.querySelector('.gloss-p');
  if (!gloss || !panel) return;

  var clear;

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

    /* Clear whatever is still lit. Cancelling the pending timeout without
       this leaves an earlier row glowing for good, because its own removal
       was the thing being cancelled. */
    var lit = panel.querySelector('.is-found');
    if (lit) lit.classList.remove('is-found');

    /* Restart the animation when the same term is asked for twice. */
    row.classList.remove('is-found');
    void row.offsetWidth;
    row.classList.add('is-found');

    clearTimeout(clear);
    clear = setTimeout(function () { row.classList.remove('is-found'); }, 2100);
  });

  /* Escape closes it, the way every other panel on the web does. */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && gloss.open) {
      gloss.open = false;
      gloss.querySelector('.gloss-b').focus();
    }
  });
})();

/* ── corrections ──
   Posts to the same intake service as the Preside by Side suggestion form,
   on its own route. The gates that matter are all server-side: the cooldown
   below is only there to stop a double-click becoming two rows, and curl
   ignores it entirely.

   The form ships without an action, so with no JavaScript it simply does
   not submit rather than navigating somewhere useless. */

(function () {
  'use strict';

  var form = document.getElementById('fix-form');
  if (!form) return;

  var ENDPOINT = '/api/suggest/doe';
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
