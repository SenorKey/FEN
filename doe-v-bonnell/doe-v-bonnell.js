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
