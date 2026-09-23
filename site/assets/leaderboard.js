(() => {
  'use strict';
  const course = document.getElementById('race-course');
  const aircraft = document.getElementById('race-aircraft');
  const refresh = document.getElementById('race-refresh');
  const status = document.getElementById('race-status');
  const table = document.getElementById('race-table');
  const rows = document.getElementById('race-rows');
  const podium = document.getElementById('race-podium');
  const challenge = document.getElementById('race-challenge-text');
  if (!course || !aircraft || !refresh || !status || !table || !rows || !podium || !challenge) return;
  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function podiumPilot(entry, leader) {
    const card = element('li', 'podium-pilot podium-place-' + entry.rank);
    card.value = entry.rank;
    const medal = element('span', 'podium-medal', ['','01 / GOLD','02 / SILVER','03 / BRONZE'][entry.rank]);
    const avatar = element('span', 'podium-avatar', (entry.name.trim().replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2) || 'P').toUpperCase());
    avatar.setAttribute('aria-hidden', 'true');
    const identity = element('div', 'podium-identity');
    identity.append(medal, avatar, element('h3', 'podium-name', entry.name));
    const plinth = element('div', 'podium-plinth');
    const time = element('div', 'podium-time', (entry.time_ms / 1000).toFixed(2));
    time.append(element('small', '', 's'));
    const numeral = element('span', 'podium-numeral', String(entry.rank));
    numeral.setAttribute('aria-hidden', 'true');
    plinth.append(element('span', 'podium-lap-label', entry.rank === 1 ? 'THE TIME TO BEAT' : 'BEST LAP'), time, element('span', 'podium-gap', entry.rank === 1 ? 'FASTEST ON THIS BOARD' : '+' + ((entry.time_ms - leader.time_ms) / 1000).toFixed(2) + 's to the leader'), numeral);
    card.append(identity, plinth);
    return card;
  }
  let generation = 0;
  let controller;
  refresh.hidden = false;
  async function load() {
    const current = ++generation;
    controller?.abort();
    controller = new AbortController();
    const requestController = controller;
    const timeout = setTimeout(() => requestController.abort(), 8000);
    table.hidden = true;
    rows.replaceChildren();
    podium.hidden = true;
    podium.replaceChildren();
    challenge.textContent = 'Fly through the green start arch. Set a lap. Give the podium something to worry about.';
    status.textContent = 'Loading current standings…';
    refresh.disabled = true;
    try {
      const params = new URLSearchParams({ course: course.value, aircraft: aircraft.value, limit: '5' });
      const response = await fetch('https://fpvsim-leaderboard.narenana.workers.dev/board?' + params, { signal: requestController.signal });
      if (!response.ok) throw new Error('Leaderboard unavailable');
      const data = await response.json();
      if (current !== generation) return;
      if (!Array.isArray(data.entries)) throw new Error('Invalid standings');
      const entries = data.entries.slice(0, 5);
      if (!entries.every(entry => typeof entry.name === 'string' && Number.isFinite(entry.time_ms) && entry.time_ms > 0 && Number.isInteger(entry.rank) && entry.rank > 0)) throw new Error('Invalid lap');
      document.getElementById('race-caption').textContent = `The chasing pack: ${course.selectedOptions[0].textContent}, ${aircraft.selectedOptions[0].textContent}`;
      podium.setAttribute('aria-label', `Podium: ${course.selectedOptions[0].textContent}, ${aircraft.selectedOptions[0].textContent}`);
      const leaders = entries.slice(0, 3);
      for (const entry of leaders) podium.append(podiumPilot(entry, entries[0]));
      podium.hidden = leaders.length === 0;
      if (leaders.length) challenge.textContent = `The benchmark: ${(leaders[0].time_ms / 1000).toFixed(2)}s on ${course.selectedOptions[0].textContent} in the ${aircraft.selectedOptions[0].textContent}. How close can you get?`;
      for (const entry of entries.slice(3)) {
        const row = document.createElement('tr');
        const values = [String(entry.rank).padStart(2, '0'), entry.name, (entry.time_ms / 1000).toFixed(2), entry.rank === 1 ? '—' : '+' + ((entry.time_ms - entries[0].time_ms) / 1000).toFixed(2)];
        for (const value of values) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); }
        rows.append(row);
      }
      table.hidden = entries.length <= 3;
      status.textContent = entries.length ? `Checked ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} · ${Number.isInteger(data.total) ? data.total + ' pilots on this board' : 'Current standings'}` : 'No laps yet for this course and aircraft. Set the first time.';
    } catch {
      if (current !== generation) return;
      status.textContent = 'Standings are unavailable right now. Try Refresh or open the full leaderboard.';
    } finally {
      clearTimeout(timeout);
      if (current === generation) refresh.disabled = false;
    }
  }
  course.addEventListener('change', load);
  aircraft.addEventListener('change', load);
  refresh.addEventListener('click', load);
  load();
})();
