// Subtle image depth; content and controls stay fixed in their sections.
(() => {
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const images = [...document.querySelectorAll('[data-drift], .los-gameplay img, .vid-thumb img')];
  let queued = false;
  function paint() {
    queued = false;
    for (const image of images) {
      if (media.matches) { image.style.removeProperty('transform'); continue; }
      const box = image.parentElement.getBoundingClientRect();
      if (box.bottom < -100 || box.top > innerHeight + 100) continue;
      const progress = Math.max(-1, Math.min(1, (innerHeight / 2 - box.top - box.height / 2) / innerHeight));
      image.style.transform = `translateY(${progress * (innerWidth < 700 ? 10 : 24)}px) scale(1.055)`;
    }
  }
  function request() { if (!queued) { queued = true; requestAnimationFrame(paint); } }
  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', request);
  media.addEventListener('change', paint);
  paint();
})();
