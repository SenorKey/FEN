/* ═══════════════════════════════════════════════
   wfpc.js — /wfpc
   frontendneeded.com

   Two small things for the capture on this page, both
   optional — with no script the page shows the finished
   capture and a plausible readout.

   1. The region readout under the selection reports the
      selection's real size and position, the way the app
      reports the region you drew.
   2. The ▸ Capture tab replays the read.
   ═══════════════════════════════════════════════ */

(function () {
    var marquee = document.querySelector('.marquee');
    if (!marquee) return;

    var readout = document.querySelector('[data-region]');
    var button = marquee.querySelector('.recapture');

    function measure() {
        if (!readout) return;
        var r = marquee.getBoundingClientRect();
        readout.textContent =
            Math.round(r.width) + '×' + Math.round(r.height) +
            ' at (' + Math.round(r.left + window.scrollX) + ', ' + Math.round(r.top + window.scrollY) + ')';
    }

    measure();
    window.addEventListener('resize', measure);
    if ('ResizeObserver' in window) {
        new ResizeObserver(measure).observe(marquee);
    }

    if (button) {
        button.hidden = false;
        button.addEventListener('click', function () {
            // Dropping the class strips the read's animations; the forced
            // reflow commits that, so adding it back starts them over.
            marquee.classList.remove('is-scanning');
            void marquee.offsetWidth;
            marquee.classList.add('is-replay', 'is-scanning');
        });
    }
})();
