/* Deterministic checks for the "nothing scheduled" state.
 *
 * The site runs on a real calendar clock, so a visitor opening it on a day with
 * no MLB games (the off-season) must be told that clearly instead of seeing a
 * terse "No games found" that reads like a broken page. The reference build
 * says "No games scheduled for <date>." — see
 * https://snapquast73-boop.github.io/POSTSSNALRT/ .
 *
 * Run: node tools/empty-state-test.mjs   (needs `npm i jsdom`)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { REPO_ROOT, readFixture } from './lib/browser-env.mjs';

const emptySchedule = {
  copyright: 'trimmed copy of the official empty-slate response',
  totalItems: 0, totalGames: 0, dates: [],
};
const gameStatus = readFixture('game-status.json');

let passed = 0;
const failures = [];
const windows = [];

const jsonResponse = (payload) => Promise.resolve({
  ok: true, status: 200, headers: { get: () => null },
  json: () => Promise.resolve(payload),
});

async function render(pageFile, query) {
  const html = fs.readFileSync(path.join(REPO_ROOT, pageFile), 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://example.test/' + pageFile + query,
    runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const win = dom.window;
  windows.push(win);
  win.fetch = (url) => {
    const target = String(url);
    if (target.includes('/api/v1/schedule')) return jsonResponse(emptySchedule);
    if (target.includes('/gameStatus')) return jsonResponse(gameStatus);
    if (target.includes('/api/feed-log')) return Promise.reject(new Error('static hosting'));
    return jsonResponse({}, 404);
  };
  win.console.error = () => {};
  for (const src of Array.from(win.document.querySelectorAll('script[src]')).map((s) => s.getAttribute('src'))) {
    win.eval(fs.readFileSync(path.join(REPO_ROOT, src), 'utf8'));
  }
  win.document.dispatchEvent(new win.Event('DOMContentLoaded', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 500));
  return win;
}

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log('ok   ' + name);
  } catch (err) {
    failures.push(name);
    console.error('FAIL ' + name + '\n     ' + err.message);
    process.exitCode = 1;
  }
}

await check('scoreboard says no games are scheduled on an empty date', async () => {
  const win = await render('index.html', '?date=2026-11-22');
  const text = win.document.getElementById('game-list').textContent;
  assert.match(text, /No games scheduled for .*2026/i,
    'expected "No games scheduled for <date>", got: ' + JSON.stringify(text));
  assert.doesNotMatch(text, /No games found/, 'the generic "found" wording reads like a failure');
  assert.match(win.document.getElementById('status-line').textContent, /0 game\(s\)/);
  win.close();
});

await check('scoreboard keeps the filter wording when a date has games', async () => {
  const html = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
  const win = new JSDOM(html, {
    url: 'https://example.test/index.html?date=2026-06-01',
    runScripts: 'outside-only', pretendToBeVisual: true,
  }).window;
  windows.push(win);
  const schedule = readFixture('schedule-2026-06-01.json');
  win.fetch = (url) => {
    const target = String(url);
    if (target.includes('/api/v1/schedule')) return jsonResponse(schedule);
    if (target.includes('/gameStatus')) return jsonResponse(gameStatus);
    if (target.includes('/api/feed-log')) return Promise.reject(new Error('static hosting'));
    return jsonResponse({}, 404);
  };
  win.console.error = () => {};
  for (const src of Array.from(win.document.querySelectorAll('script[src]')).map((s) => s.getAttribute('src'))) {
    win.eval(fs.readFileSync(path.join(REPO_ROOT, src), 'utf8'));
  }
  win.document.dispatchEvent(new win.Event('DOMContentLoaded', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 500));
  const liveBtn = Array.from(win.document.querySelectorAll('#tabs .tab-btn'))
    .find((b) => b.textContent.startsWith('Live'));
  liveBtn.dispatchEvent(new win.Event('click', { bubbles: true }));
  const finaleBtn = Array.from(win.document.querySelectorAll('#tabs .tab-btn'))
    .find((b) => b.textContent.startsWith('Final'));
  finaleBtn.dispatchEvent(new win.Event('click', { bubbles: true }));
  const opened = win.document.getElementById('game-list').textContent;
  assert.match(opened, /Angels/, 'the Final filter still lists the Final game');
  win.close();
});

await check('replay feed explains an empty slate without implying an error', async () => {
  const win = await render('reviews.html', '?date=2026-11-22');
  const text = win.document.getElementById('feed-list').textContent;
  assert.match(text, /No games scheduled for/i, 'expected the off-day wording, got: ' + JSON.stringify(text));
  assert.doesNotMatch(text, /No matching review events/, 'off-days are not a filter miss');
  win.close();
});

windows.forEach((win) => { try { win.close(); } catch (err) { /* ignore */ } });
console.log('\nempty-state-test: ' + passed + ' checks passed');
process.exit(failures.length ? 1 : 0);
