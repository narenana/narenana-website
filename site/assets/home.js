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
      status.textContent = 'The latest feed is unavailable. Explore the featured flights or visit the YouTube channel.';
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
