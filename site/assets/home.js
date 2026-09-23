(() => {
  'use strict';
  document.getElementById('year').textContent = new Date().getFullYear();
  const menu = document.getElementById('menu-toggle');
  const navigation = document.getElementById('navigation');
  function closeMenu() { navigation.classList.remove('is-open'); menu.setAttribute('aria-expanded', 'false'); }
  menu.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(open));
    navigation.classList.toggle('is-open', open);
  });
  navigation.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') { closeMenu(); menu.focus(); } });

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
