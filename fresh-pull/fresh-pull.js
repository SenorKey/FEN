// The demo on /fresh-pull: click the toolbar icon and the made-up data in
// the little browser clears, the way the extension clears the real thing.
// The badge goes "…", then a check mark, then away, as it does in Chrome.

document.addEventListener('DOMContentLoaded', () => {
  const demo = document.querySelector('.fp-demo');
  if (!demo) return;

  const icon = demo.querySelector('.fp-icon');
  const badge = demo.querySelector('.fp-badge');
  const status = demo.querySelector('.fp-status');
  const counts = [...demo.querySelectorAll('.fp-stash .n')];
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let busy = false;
  let round = 0; // bumped on reset, so a late frame from an old count stops

  const wait = (ms) => new Promise((done) => setTimeout(done, still ? 0 : ms));

  function setBadge(text, colour) {
    badge.textContent = text;
    badge.style.setProperty('--badge', colour);
  }

  function countDown(ms) {
    if (still) {
      counts.forEach((el) => { el.textContent = '0'; });
      return;
    }
    const start = performance.now();
    const mine = round;
    requestAnimationFrame(function step(now) {
      if (mine !== round) return;
      const left = Math.max(0, 1 - (now - start) / ms);
      counts.forEach((el) => { el.textContent = Math.round(el.dataset.n * left); });
      if (left > 0) requestAnimationFrame(step);
    });
  }

  icon.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    demo.classList.add('tried');
    status.textContent = '';

    setBadge('…', '#5b6b58');
    demo.classList.add('sweeping');
    countDown(650);
    await wait(750);

    demo.classList.remove('sweeping');
    demo.classList.add('clean');
    setBadge('✓', '#2c7f12');
    demo.classList.add('reloading');
    status.textContent = 'Cleared, and the tab reloaded.';
    await wait(2000);

    setBadge('', '');
    demo.classList.remove('reloading');
    await wait(1400);

    // Put the data back so it can be tried again.
    round += 1;
    counts.forEach((el) => { el.textContent = el.dataset.n; });
    demo.classList.remove('clean');
    status.textContent = '';
    busy = false;
  });
});
