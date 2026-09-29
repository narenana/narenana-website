(() => {
  'use strict';
  document.getElementById('year').textContent = new Date().getFullYear();
  // The site header is the shared family header (scripts/brand-shell.mjs). Its
  // mobile menu is a native <details>; close it after a link is chosen, since
  // in-page links (Get in touch → #contact) don't navigate away.
  document.querySelectorAll('.nn-mobile').forEach(menu => {
    menu.addEventListener('click', event => { if (event.target.closest('a')) menu.open = false; });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); } });
  });

  const buttons = [...document.querySelectorAll('[data-video-panel]')];
  const latest = document.getElementById('vid-grid');
  const status = document.getElementById('video-status');
  let feedRequested = false;
  function videoCard(video) {
    if (!/^[a-zA-Z0-9_-]{11}$/.test(video.id || '')) return null;
    const card = document.createElement('a');
    card.className = 'vid';
    card.href = 'https://www.youtube.com/watch?v=' + video.id;
    card.target = '_blank'; card.rel = 'noopener';
    const thumb = document.createElement('div'); thumb.className = 'vid-thumb';
    const img = document.createElement('img'); img.src = 'https://i.ytimg.com/vi/' + video.id + '/hqdefault.jpg'; img.alt = ''; img.loading = 'lazy';
    const play = document.createElement('span'); play.className = 'vid-play'; play.textContent = '▶'; play.setAttribute('aria-hidden', 'true');
    thumb.append(img, play);
    const body = document.createElement('div'); body.className = 'vid-body';
    const title = document.createElement('div'); title.className = 'vid-title'; title.textContent = video.title;
    const meta = document.createElement('div'); meta.className = 'vid-meta'; meta.textContent = 'YOUTUBE ↗';
    body.append(title, meta); card.append(thumb, body); return card;
  }
  async function loadLatest() {
    if (feedRequested || latest.querySelector('.vid')) return;
    feedRequested = true; status.textContent = 'Loading the latest flights…'; status.hidden = false;
    try {
      const response = await fetch('/videos.json', {signal: AbortSignal.timeout(8000)});
      if (!response.ok) throw new Error('Feed unavailable');
      const data = await response.json();
      const cards = (Array.isArray(data.videos) ? data.videos : []).slice(0, 6).map(videoCard).filter(Boolean);
      if (!cards.length) throw new Error('No videos');
      latest.replaceChildren(...cards); status.textContent = ''; status.hidden = true;
    } catch {
      status.textContent = 'The latest uploads didn’t load. Watch the featured flights, or go to the YouTube channel.';
      feedRequested = false;
    }
  }
  buttons.forEach(button => button.addEventListener('click', () => {
    buttons.forEach(other => {
      const selected = other === button;
      other.setAttribute('aria-pressed', String(selected));
      document.getElementById(other.dataset.videoPanel).hidden = !selected;
    });
    const showLatest = button.dataset.videoPanel === 'vid-grid';
    status.hidden = !showLatest || !!latest.querySelector('.vid');
    if (showLatest) loadLatest();
  }));
})();

// Keep the real video visible without loading two third-party players at startup.
// The ordinary YouTube link remains usable if scripting is unavailable.
document.querySelectorAll('[data-inline-video]').forEach(poster => {
  poster.addEventListener('click', event => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const id = poster.dataset.inlineVideo;
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return;
    const player = document.createElement('iframe');
    player.title = poster.getAttribute('aria-label');
    player.src = `https://www.youtube-nocookie.com/embed/${id}?rel=0&autoplay=1&playsinline=1`;
    player.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    player.referrerPolicy = 'strict-origin-when-cross-origin';
    player.allowFullscreen = true;
    event.preventDefault();
    poster.replaceWith(player);
    player.focus();
  });
});

// The floating Share button (family/share.js) is fixed bottom-right. On common
// laptop (1366x768, 1280x720) and phone viewports it sits on the hero's "open
// the simulator" link; while the two would overlap, lift the button just above
// the link. It drops back as soon as the hero scrolls away.
(() => {
  const link = document.querySelector('.visual-bottom a');
  if (!link) return;
  let queued = false;
  const place = () => {
    queued = false;
    const button = document.getElementById('nn-share-launcher');
    if (!button) return;
    button.style.bottom = '';
    const b = button.getBoundingClientRect(), l = link.getBoundingClientRect();
    if (b.left < l.right && l.left < b.right && b.top < l.bottom && l.top < b.bottom) {
      button.style.bottom = Math.ceil(innerHeight - l.top + 12) + 'px';
    }
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(place); } };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);
  // The hero settles after the image and fonts load, and share.js injects the
  // button late: re-check on each of those, not just on scroll.
  addEventListener('load', queue);
  document.fonts?.ready.then(queue);
  if ('ResizeObserver' in window) new ResizeObserver(queue).observe(link.closest('.hero-visual') || link);
  new MutationObserver(queue).observe(document.body, { childList: true, subtree: true });
  queue();
})();
