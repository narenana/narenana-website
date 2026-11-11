// narenana night pages (homepage, /nanawing2/): header state, reveal-on-scroll, in-view video loops
// and the media switchers. No dependencies, no tracking. Pages work without it: every slide's text,
// links and poster are in the HTML; this only adds motion and switching.
(() => {
  'use strict';
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const still = () => reduce.matches || saveData;

  // Header turns solid once the page scrolls.
  const header = () => document.body.classList.toggle('is-scrolled', scrollY > 24);
  addEventListener('scroll', header, { passive: true });
  header();

  // Reveal blocks as they arrive.
  const reveal = 'IntersectionObserver' in window && new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('in'); reveal.unobserve(entry.target); }
  }, { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.rv').forEach((el) => (reveal ? reveal.observe(el) : el.classList.add('in')));

  // Video loops: <video data-loop poster=…> with <source data-src=… type=…>. Nothing downloads until the
  // video is near the screen; it pauses when it leaves. Reduced motion or Save-Data keeps the poster only.
  // data-src-portrait swaps in a portrait cut on narrow, upright screens (the hero).
  const portrait = matchMedia('(max-width: 760px) and (orientation: portrait)');
  function arm(video) {
    if (video.dataset.armed) return;
    video.dataset.armed = '1';
    for (const source of video.querySelectorAll('source[data-src]')) {
      source.src = (portrait.matches && source.dataset.srcPortrait) || source.dataset.src;
    }
    video.muted = true;
    video.load();
  }
  function play(video) {
    if (still() || video.closest('.slide:not(.on)')) return;
    arm(video);
    const p = video.play();
    if (p && p.catch) p.catch(() => {});
  }
  const loops = [...document.querySelectorAll('video[data-loop]')];
  const watcher = 'IntersectionObserver' in window && new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
      target.dataset.visible = isIntersecting ? '1' : '';
      if (isIntersecting) play(target); else if (!target.paused) target.pause();
    }
  }, { rootMargin: '200px 0px' });
  loops.forEach((video) => {
    video.muted = true;
    if (watcher) watcher.observe(video); else play(video);
  });
  reduce.addEventListener?.('change', () => loops.forEach((v) => (still() ? v.pause() : v.dataset.visible && play(v))));
  document.addEventListener('visibilitychange', () => loops.forEach((v) => (document.hidden ? v.pause() : v.dataset.visible && play(v))));

  // Switchers: a .switch holds .pick items (each with a button inside its heading) and .slide panels
  // in a shared .switch-media. Picking an item shows its slide. On phones each pick shows its own media.
  document.querySelectorAll('.switch').forEach((sw) => {
    const picks = [...sw.querySelectorAll('.pick[data-pick]')];
    const slides = [...sw.querySelectorAll('.switch-media .slide[data-slide]')];
    function select(id, focus) {
      picks.forEach((pick) => {
        const on = pick.dataset.pick === id;
        pick.classList.toggle('on', on);
        const button = pick.querySelector('h3 button');
        if (button) button.setAttribute('aria-pressed', String(on));
        if (on && focus) button?.focus();
      });
      slides.forEach((slide) => {
        const on = slide.dataset.slide === id;
        slide.classList.toggle('on', on);
        slide.setAttribute('aria-hidden', String(!on));
        const video = slide.querySelector('video[data-loop]');
        if (!video) return;
        if (on && video.dataset.visible) play(video); else if (!on && !video.paused) video.pause();
      });
    }
    picks.forEach((pick) => {
      pick.addEventListener('click', (event) => {
        if (event.target.closest('a')) return; // links inside a pick still navigate
        select(pick.dataset.pick);
      });
    });
    const first = picks.find((p) => p.classList.contains('on')) || picks[0];
    if (first) select(first.dataset.pick);
  });
})();
