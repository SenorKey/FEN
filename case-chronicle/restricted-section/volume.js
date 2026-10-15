/* ═══════════════════════════════════════════════
   A volume of the Restricted Section

   One thing a history needs that a case does not: a column whose name
   changes partway down the rail. In Volume I the right column is the
   Zionist movement's until Israel is founded in May 1948. Each phase
   says what the column is called while it is passing, in data-d, and
   this writes that into the bar, the same way chronicle.js writes the
   phase's own name into the bar's left end: read off the last phase to
   have gone up under the bar.

   The bar ships with the name the column has for most of the rail, so
   with no script it is right from 1948 on, and on a phone, where the
   key does not stay on screen, its gloss says what it meant before.
   ═══════════════════════════════════════════════ */

(() => {
  const tl = document.querySelector('.tl');
  const bar = document.querySelector('.tl-key');
  const name = bar?.querySelector('.tk-d .tk-dn');
  if (!tl || !name) return;

  const parts = [...tl.querySelectorAll('.tl-phase')];
  if (!parts.some((p) => p.dataset.d)) return;

  const fallback = name.textContent;
  let shown = fallback;
  let ticking = false;

  function read() {
    ticking = false;

    /* The bar only stays on screen from 901px up. Under that the key is
       an ordinary block at the head of the rail, and keeps its own name. */
    if (getComputedStyle(bar).position !== 'sticky') {
      if (shown !== fallback) name.textContent = shown = fallback;
      return;
    }

    const line = bar.getBoundingClientRect().bottom + 8;
    let now = null;
    for (const part of parts) {
      if (part.getBoundingClientRect().bottom > line) break;
      if (part.dataset.d) now = part.dataset.d;
    }

    /* Above the first phase the reader is looking at the start of the
       rail, which is the first phase's column. */
    const want = now || parts.find((p) => p.dataset.d)?.dataset.d || fallback;
    if (want !== shown) name.textContent = shown = want;
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(read);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  read();
})();
