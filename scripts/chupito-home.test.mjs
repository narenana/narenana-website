// File-only homepage content checks: no server, service binding or live data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const home = await readFile(new URL('../site/index.html', import.meta.url), 'utf8');
const block = (pattern, label) => {
  const match = home.match(pattern);
  assert.ok(match, label);
  return match[1];
};

test('the pilot paths introduce Chupito as a distinct experimental simulator preview', () => {
  const pilots = block(/<section class="pilot-paths\b[^>]*>([\s\S]*?)<\/section>/, 'pilot paths exist');
  assert.match(pilots, /href="\/nanawing\/aircraft\/#chupito">TBS Chupito · Experimental preview<\/a>/);
  assert.match(pilots, /Agile 800 mm wing with a 6S setup/);
  assert.match(pilots, /not yet on the live leaderboards/);
  assert.doesNotMatch(home, /https:\/\/sim\.narenana\.com\/\?[^"]*aircraft=chupito/);
});

test('the released fleet stays Spectre-first and separate from the Chupito preview', () => {
  const lineup = block(/<a href="\/nanawing\/aircraft\/">([^<]+)<\/a>/, 'released aircraft link exists');
  assert.deepEqual(lineup.split(', '), ['WUDFLY Spectre', 'Nanawing One', 'Morok UAV', 'Sukhoi S-70 Okhotnik']);
  assert.doesNotMatch(lineup, /Chupito/);
});

test('the live board selector still offers only the four released aircraft', () => {
  const options = block(/<select id="race-aircraft">([\s\S]*?)<\/select>/, 'aircraft board selector exists');
  assert.deepEqual([...options.matchAll(/<option value="([^"]+)"/g)].map(([, id]) => id),
    ['sukhoi', 'desertwing', 'morok', 'spectre']);
  assert.doesNotMatch(options, /chupito/i);
});

test('the real Chupito shopping card remains distinct from the simulator preview', () => {
  const shop = block(/<a class="shopc" href="https:\/\/www\.narenana\.com\/wings\/tbs-chupito\/">([\s\S]*?)<\/a>/, 'real Chupito product card exists');
  assert.match(shop, /alt="TBS Chupito"/);
  assert.match(shop, /See prices and stock/);
  assert.doesNotMatch(shop, /Experimental preview|leaderboard|aircraft=chupito/);
});
