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

/* ── the periods, kept to hand ──
   A slim copy of the masthead's row of periods, the years alone, that
   comes out from under the nav once the row has gone up behind it and
   stays for the rest of the page, so any period is one tap away. The
   period passing under the bars is marked, read the same way as the
   column's name above. Built here rather than written into the page, so
   every volume gets it from its own row. See volume.css. */
(() => {
  const row = document.querySelector('.vol-eras');
  const nav = document.querySelector('.site-nav');
  if (!row || !nav) return;

  const links = [...row.querySelectorAll('a[href^="#"]')];
  const parts = links.map((a) => document.getElementById(a.hash.slice(1)));
  if (!links.length || parts.some((p) => !p)) return;

  const strip = document.createElement('nav');
  strip.className = 'vol-jump';
  strip.setAttribute('aria-label', 'Jump to a period');
  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  wrap.style.setProperty('--n', links.length);

  const copies = links.map((a) => {
    const c = document.createElement('a');
    c.href = a.hash;
    const y = a.querySelector('.vol-era-y')?.textContent || a.textContent;
    const t = a.querySelector('.vol-era-t')?.textContent || '';
    c.title = t;
    c.innerHTML = '<span class="vol-jump-y"></span><span class="vol-jump-t"></span>';
    c.firstChild.textContent = y;
    c.lastChild.textContent = t ? ', ' + t : '';
    wrap.append(c);
    return c;
  });

  strip.append(wrap);
  const head = row.closest('header');
  if (head) head.after(strip);
  else document.body.append(strip);
  document.body.classList.add('vol-jump-on');

  let on = false;
  let current = -1;
  let ticking = false;

  function read() {
    ticking = false;

    const top = nav.getBoundingClientRect().bottom;
    const want = row.getBoundingClientRect().bottom <= top;
    if (want !== on) {
      on = want;
      strip.classList.toggle('is-on', on);
    }

    /* A period is passing once it is up as far as a jump to it would
       bring it, which is its scroll margin: clear of the nav, the strip
       and, on a wide screen, the bar over the rail. */
    let now = -1;
    parts.forEach((p, k) => {
      const margin = parseFloat(getComputedStyle(p).scrollMarginTop) || 0;
      if (p.getBoundingClientRect().top <= margin + 2) now = k;
    });

    if (now !== current) {
      copies[current]?.removeAttribute('aria-current');
      if (now >= 0) copies[now].setAttribute('aria-current', 'true');
      current = now;
    }
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
