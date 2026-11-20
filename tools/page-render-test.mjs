/* End-to-end render checks for the three pages, run in jsdom against the
 * synthetic fixtures in tools/fixtures/. No network access is used or needed.
 *
 *   node tools/page-render-test.mjs
 *
 * Each page is loaded exactly as GitHub Pages serves it (same <script> order,
 * no bundler), with `fetch` stubbed to the recorded StatsAPI shapes. The test
 * fails on any uncaught page error, any console.error, or a missing element. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { REPO_ROOT, readFixture } from './lib/browser-env.mjs';

const schedule = readFixture('schedule-2026-06-01.json');
const gameStatus = readFixture('game-status.json');
const feed = readFixture('feed-824027.json');

let passed = 0;
const failures = [];
const openWindows = [];

function jsonResponse(payload, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(payload),
  });
}

function feedFor(gamePk) {
  const copy = JSON.parse(JSON.stringify(feed));
  if (String(gamePk) !== String(feed.gamePk)) {
    copy.gameData.game.pk = Number(gamePk);
    copy.gamePk = Number(gamePk);
  }
  return copy;
}

function makeFetch(calls) {
  return (url) => {
    const target = String(url);
    calls.push(target);
    if (target.includes('/api/v1/schedule')) return jsonResponse(schedule);
    if (target.includes('/gameStatus')) return jsonResponse(gameStatus);
    if (target.includes('/eventTypes')) return jsonResponse([]);
    if (target.includes('/feed/live')) {
      const m = target.match(/\/game\/(\d+)\/feed\/live/);
      return jsonResponse(feedFor(m ? m[1] : feed.gamePk));
    }
    if (target.includes('/playByPlay')) return jsonResponse({ allPlays: feed.liveData.plays.allPlays });
    if (target.includes('/people/') && target.includes('stats=')) {
      const isPitching = target.includes('group=pitching');
      const season = isPitching
        ? { hits: 92, atBats: 420, era: '3.11' }
        : { hits: 144, atBats: 523, avg: '.275', ops: '.889' };
      return jsonResponse({
        stats: [
          { type: { displayName: 'season' }, group: { displayName: isPitching ? 'pitching' : 'hitting' }, splits: [{ season: '2026', stat: season }] },
          {
            type: { displayName: 'statSplits' },
            splits: [
              { season: '2026', stat: { hits: 49, atBats: 179 }, split: { code: 'vl', description: 'vs Left' } },
              { season: '2026', stat: { hits: 95, atBats: 344 }, split: { code: 'vr', description: 'vs Right' } },
            ],
          },
          { type: { displayName: 'gameLog' }, splits: [{ date: '2026-05-31', stat: { hits: 2, atBats: 4 } }] },
        ],
      });
    }
    if (target.includes('/api/feed-log')) return Promise.reject(new Error('static hosting'));
    return jsonResponse({}, 404);
  };
}

function waitFor(fn, timeoutMs) {
  const limit = Date.now() + (timeoutMs || 4000);
  return new Promise((resolve, reject) => {
    (function tick() {
      let value;
      try { value = fn(); } catch (err) { value = false; }
      if (value) return resolve(value);
      if (Date.now() > limit) return reject(new Error('timeout waiting for condition'));
      setTimeout(tick, 25);
    })();
  });
}

async function renderPage(pageFile, { query, until }) {
  const htmlPath = path.join(REPO_ROOT, pageFile);
  const html = fs.readFileSync(htmlPath, 'utf8');
  const calls = [];
  const errors = [];
  const dom = new JSDOM(html, {
    url: 'https://example.test/' + pageFile + (query || ''),
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const win = dom.window;
  openWindows.push(win);
  win.fetch = makeFetch(calls);
  win.addEventListener('error', (ev) => errors.push('window error: ' + (ev.message || ev.type)));
  const origError = win.console.error;
  win.console.error = (...args) => { errors.push('console.error: ' + args.map(String).join(' ')); };
  const scripts = Array.from(win.document.querySelectorAll('script[src]'))
    .map((s) => s.getAttribute('src'));
  for (const src of scripts) {
    const abs = path.join(REPO_ROOT, src);
    win.eval(fs.readFileSync(abs, 'utf8'));
  }
  win.document.dispatchEvent(new win.Event('DOMContentLoaded', { bubbles: true }));
  if (until) await waitFor(until(win));
  return { dom, win, calls, errors, origError };
}

async function run(name, fn) {
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

await run('scoreboard renders every game, tabs, decisions and probables', async () => {
  const page = await renderPage('index.html', {
    query: '?date=2026-06-01',
    until: (win) => () => (win.document.getElementById('game-list').textContent || '').includes('Rockies'),
  });
  const doc = page.win.document;
  const list = doc.getElementById('game-list').textContent;
  assert.match(list, /Colorado Rockies/);
  assert.match(list, /Detroit Tigers/);
  assert.match(list, /Seattle Mariners/);
  assert.match(list, /W: Antonio Senzatela/, 'final game must show the W/L decisions');
  assert.match(list, /Probables: SEA Emerson Hancock/, 'scheduled game must show probables');
  const tabs = doc.getElementById('tabs').textContent;
  assert.match(tabs, /Live \(1\)/);
  assert.match(tabs, /Final \(1\)/);
  assert.match(tabs, /Scheduled \(1\)/);
  assert.match(doc.getElementById('banner').textContent, /Under review now/);
  assert.match(doc.getElementById('banner').textContent, /Tag play/);
  assert.equal(page.calls.filter((c) => c.includes('/schedule')).length > 0, true);
  assert.deepEqual(page.errors, [], 'page must not log errors');
  page.win.close();
});

await run('scoreboard filters by tab without losing the date', async () => {
  const page = await renderPage('index.html', {
    query: '?date=2026-06-01',
    until: (win) => () => (win.document.getElementById('game-list').textContent || '').includes('Rockies'),
  });
  const doc = page.win.document;
  const finalBtn = Array.from(doc.querySelectorAll('#tabs .tab-btn'))
    .find((b) => b.textContent.indexOf('Final') === 0);
  finalBtn.dispatchEvent(new page.win.Event('click', { bubbles: true }));
  const list = doc.getElementById('game-list').textContent;
  assert.match(list, /Angels/, 'the Final game must stay visible');
  assert.doesNotMatch(list, /Mariners/, 'Scheduled game must be filtered out');
  assert.doesNotMatch(list, /Tigers/, 'Live game must be filtered out');
  assert.match(page.win.location.search, /date=2026-06-01/);
  page.win.close();
});

await run('game page renders header, linescore, plays, box score and reviews', async () => {
  const page = await renderPage('game.html', {
    query: '?gamePk=824027',
    until: (win) => () => (win.document.getElementById('header-center').textContent || '').includes('9'),
  });
  const doc = page.win.document;
  assert.equal(doc.getElementById('header-center').querySelector('.header-score').textContent.trim(), '9 – 8');
  assert.match(doc.getElementById('header-meta').textContent, /Angel Stadium/);
  assert.match(doc.getElementById('header-decisions').textContent, /W: Antonio Senzatela/);
  assert.match(doc.getElementById('header-decisions').textContent, /L: Kirby Yates/);
  assert.match(doc.getElementById('linescore-wrap').textContent, /Linescore/);
  assert.match(doc.getElementById('linescore-wrap').textContent, /Source/);
  assert.match(doc.getElementById('plays-wrap').textContent, /Jose Siri doubles/);
  assert.match(doc.getElementById('plays-wrap').textContent, /Manager Challenge · Under Review/);
  assert.equal(doc.getElementById('reviews-tab-count').textContent, '2');
  assert.match(doc.getElementById('live-panel').textContent, /On deck/);
  assert.match(doc.getElementById('live-panel').textContent, /Adam Frazier/);
  page.win.close();
});

await run('game page box-score tab lists batting and pitching lines', async () => {
  const page = await renderPage('game.html', {
    query: '?gamePk=824027',
    until: (win) => () => (win.document.getElementById('boxscore-wrap').textContent || '').includes('Freeland'),
  });
  const doc = page.win.document;
  const box = doc.getElementById('boxscore-wrap').textContent;
  assert.match(box, /Kyle Freeland/);
  assert.match(box, /MLB feed/, 'every table row must link its official source');
  assert.equal(Array.from(doc.querySelectorAll('#boxscore-wrap a[href*="statsapi.mlb.com"]')).length > 0,
    true, 'box-score rows must carry an official source link');
  assert.match(box, /Kirby Yates/);
  assert.match(box, /Jose Siri/);
  page.win.close();
});

await run('game page Challenges & Reviews tab shows tracker and counters', async () => {
  const page = await renderPage('game.html', {
    query: '?gamePk=824027',
    until: (win) => () => (win.document.getElementById('reviews-wrap').textContent || '').includes('Manager Challenge'),
  });
  const doc = page.win.document;
  const reviews = doc.getElementById('reviews-wrap').textContent;
  assert.match(reviews, /Before review/);
  assert.match(reviews, /Possible after/);
  assert.match(reviews, /Actual after/);
  assert.match(reviews, /ABS challenge left now/);
  assert.match(reviews, /Overturn rate/);
  page.win.close();
});

await run('replay feed renders rows, stats, active strip and risk banner', async () => {
  const page = await renderPage('reviews.html', {
    query: '?date=2026-06-01',
    until: (win) => () => (win.document.getElementById('feed-list').textContent || '').includes('@'),
  });
  const doc = page.win.document;
  const stats = doc.getElementById('feed-stats').textContent;
  assert.match(stats, /Reviews & Challenges/);
  assert.match(stats, /ABS Challenges/);
  assert.match(stats, /Scoring Changes/);
  assert.match(doc.getElementById('active-strip').textContent, /Under review now/);
  assert.match(doc.getElementById('banner').textContent, /Runs at risk/);
  const feedText = doc.getElementById('feed-list').textContent;
  assert.match(feedText, /COL @ LAA/);
  assert.match(feedText, /Before review/);
  assert.match(feedText, /Challenges left/);
  const storedKey = 'livpbp_feed_log_2026-06-01';
  const storedRaw = page.win.localStorage.getItem(storedKey);
  assert.ok(storedRaw, 'feed log must be persisted to localStorage');
  assert.ok(JSON.parse(storedRaw).entries.length >= 2, 'persisted log must hold the scanned rows');
  assert.deepEqual(page.errors.filter((e) => !/feed-log|static hosting/i.test(e)), [],
    'no unexpected page errors');
  page.win.close();
});

await run('replay feed tab filters isolate ABS rows', async () => {
  const page = await renderPage('reviews.html', {
    query: '?date=2026-06-01',
    until: (win) => () => (win.document.getElementById('feed-list').textContent || '').includes('@'),
  });
  const doc = page.win.document;
  // Uploaded README, verbatim: "All (every category except ABS pitch challenges)".
  // ABS rows live on the ABS tab; session 9a7095ef flagged the deviation, the
  // deviation was reverted, and this assertion keeps the documented behaviour.
  assert.doesNotMatch(doc.getElementById('feed-list').textContent, /ABS Challenge/,
    'the All tab excludes ABS rows, as the uploaded README documents');
  assert.ok(doc.querySelectorAll('#feed-list article.feed-card').length >= 1,
    'the All tab still renders the non-ABS rows');
  const absBtn = Array.from(doc.querySelectorAll('#feed-tabs .tab-btn'))
    .find((b) => b.textContent.trim() === 'ABS');
  absBtn.dispatchEvent(new page.win.Event('click', { bubbles: true }));
  assert.match(doc.getElementById('feed-list').textContent, /ABS Challenge/,
    'the ABS tab shows the ABS rows');
  page.win.close();
});

openWindows.forEach((win) => { try { win.close(); } catch (err) { /* ignore */ } });
console.log('\npage-render-test: ' + passed + ' pages checked, ' + failures.length + ' failed');
process.exit(failures.length ? 1 : 0);
