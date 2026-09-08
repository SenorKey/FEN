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
