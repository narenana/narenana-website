(() => {
  'use strict';
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const layers = [
    ...document.querySelectorAll('.hero-visual > img, .los-gameplay > img'),
    ...document.querySelectorAll('.los-aircraft img, .shopc-img img, .contact-intro > img'),
    ...document.querySelectorAll('.review-section, .catalog-home, .log-home, .videos-section, .contact'),
  ].map(element => ({
    element,
    background: element.matches('section'),
    distance: element.matches('.hero-visual > img') ? 32 : element.matches('.los-gameplay > img') ? 22 : element.matches('section') ? 35 : 7,
  }));
  let frame = 0;
  let enabled = false;
  function paint() {
    frame = 0;
    if (!enabled || document.hidden) return;
    const height = window.innerHeight;
    const mobileScale = window.innerWidth <= 760 ? 0.5 : 1;
    // Measure first, then write: avoid interleaving layout reads and writes.
    const positions = layers.map(layer => {
      const bounds = (layer.background ? layer.element : layer.element.parentElement).getBoundingClientRect();
      const visible = bounds.bottom > -100 && bounds.top < height + 100;
      const progress = Math.max(-1, Math.min(1, (height / 2 - (bounds.top + bounds.height / 2)) / (height / 2 + bounds.height / 2)));
      return { layer, visible, offset: progress * layer.distance * mobileScale };
    });
    positions.forEach(({layer, visible, offset}) => {
      layer.element.classList.toggle('depth-visible', visible);
      if (visible) layer.element.style.setProperty('--depth-y', `${offset.toFixed(2)}px`);
    });
  }
  function schedule() {
    if (enabled && !document.hidden && !frame) frame = requestAnimationFrame(paint);
  }
  function configure() {
    enabled = !preference.matches;
    document.documentElement.classList.toggle('motion-ready', enabled);
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    layers.forEach(({element, background}) => {
      element.classList.toggle(background ? 'depth-section' : 'depth-image', enabled);
      if (!enabled) {
        element.classList.remove('depth-visible');
        element.style.removeProperty('--depth-y');
      }
    });
    if (window.scrollY > 0) schedule();
  }
  window.addEventListener('scroll', schedule, {passive: true});
  window.addEventListener('resize', schedule, {passive: true});
  document.addEventListener('visibilitychange', schedule);
  // Image containers reserve their space; avoid remeasuring the page on every image load.
  preference.addEventListener('change', configure);
  configure();
})();
