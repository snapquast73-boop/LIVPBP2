/* Game-page regression checks, run in jsdom against recorded official payloads.
 * No network access is used or needed.
 *
 *   node tools/game-page-test.mjs
 *
 * Covers four defects found on the live GitHub Pages site on 2026-11-22 and
 * recorded in COORDINATION.md ("Claim and scope - 1066de74") and on flagged.html:
 *
 *   1. the box score listed every pitcher inside the BATTERS table with blank
 *      stat cells (official `teams.*.batters` includes the pitchers), and
 *      dropped the official `note` (pinch hitter) and `allPositions` trail;
 *   2. an unknown gamePk rendered an empty shell that claimed success, because
 *      the API answers HTTP 200 with `gameData.game.pk: 0` for an unknown id;
 *   3. the page had no lean per-game review-status probe, so the review banner
 *      could not appear until the full 1-2 MB feed had downloaded;
 *   4. a Final game was re-read only every 30 s, so post-Final Official Scorer
 *      rulings / scoring changes were missed instead of being re-scanned inside
 *      the documented 30-minute grace window.
 *
 * Fixtures:
 *   tools/fixtures/boxscore-824027.json  official /boxscore response, trimmed
 *   tools/fixtures/feed-824027.json      official /feed/live response, trimmed
 *   tools/fixtures/game-status.json      official /gameStatus review entries
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { REPO_ROOT, readFixture } from './lib/browser-env.mjs';

const feed = readFixture('feed-824027.json');
const boxscore = readFixture('boxscore-824027.json');
const gameStatus = readFixture('game-status.json');

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

/** The feed fixture with its box score replaced by the recorded official one. */
function feedWithOfficialBoxscore() {
  const copy = JSON.parse(JSON.stringify(feed));
  copy.liveData.boxscore = { teams: JSON.parse(JSON.stringify(boxscore.teams)) };
  return copy;
}

/**
 * Standard fetch stub. `opts.feed` is the full feed, `opts.probe` the payload
 * the lean status probe receives (defaults to a copy of the feed's gameData),
 * `opts.unknownGame` makes the API answer the unknown-id shape.
 */
function makeFetch(calls, opts = {}) {
  return (url) => {
    const target = String(url);
    calls.push(target);
    if (target.includes('/gameStatus')) return jsonResponse(gameStatus);
    if (target.includes('/eventTypes')) return jsonResponse([]);
    if (target.includes('/feed/live')) {
      // The lean probe is the ONLY feed/live request that carries a `fields`
      // projection; the full feed is requested unprojected.
      const isProbe = /[?&]fields=/.test(target);
      if (isProbe) {
        if (opts.probe) return jsonResponse({ gameData: opts.probe });
        return jsonResponse({ gameData: (opts.feed || feed).gameData });
      }
      if (opts.unknownGame) return jsonResponse({ gameData: { game: { pk: 0 }, status: {} } });
      return jsonResponse(opts.feed || feed);
    }
    if (target.includes('/people/') && target.includes('stats=')) {
      const isPitching = target.includes('group=pitching');
      return jsonResponse({
        stats: [{
          type: { displayName: 'season' },
          group: { displayName: isPitching ? 'pitching' : 'hitting' },
          splits: [{ season: '2026', stat: isPitching ? { hits: 92, atBats: 420 } : { hits: 144, atBats: 523 } }],
        }],
      });
    }
    if (target.includes('/api/feed-log')) return Promise.reject(new Error('static hosting'));
    return jsonResponse({}, 404);
  };
}

function waitFor(fn, timeoutMs) {
  // Generous by default: several checks must wait out a real poll interval
  // (the lean status probe runs every STATUS_PROBE_MS = 5 s).
  const limit = Date.now() + (timeoutMs || 12000);
  return new Promise((resolve, reject) => {
    (function tick() {
      let value;
      try { value = fn(); } catch (err) { value = false; }
      if (value) return resolve(value);
      if (Date.now() > limit) return reject(new Error('timeout waiting for condition'));
      setTimeout(tick, 20);
    })();
  });
}

async function renderGamePage({ query = '?gamePk=824027', until, fetchOpts = {} } = {}) {
  const html = fs.readFileSync(path.join(REPO_ROOT, 'game.html'), 'utf8');
  const calls = [];
  const errors = [];
  const dom = new JSDOM(html, {
    url: 'https://example.test/game.html' + query,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const win = dom.window;
  openWindows.push(win);
  win.fetch = makeFetch(calls, fetchOpts);
  win.addEventListener('error', (ev) => errors.push('window error: ' + (ev.message || ev.type)));
  win.console.error = (...args) => { errors.push('console.error: ' + args.map(String).join(' ')); };
  const scripts = Array.from(win.document.querySelectorAll('script[src]'))
    .map((s) => s.getAttribute('src'));
  for (const src of scripts) {
    win.eval(fs.readFileSync(path.join(REPO_ROOT, src), 'utf8'));
  }
  win.document.dispatchEvent(new win.Event('DOMContentLoaded', { bubbles: true }));
  if (until) await waitFor(() => until(win));
  return { dom, win, calls, errors };
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

/* ------------------------------------------------------------------ 1. box score */

await run('box score separates the batting order from the pitching staff', async () => {
  const page = await renderGamePage({
    until: (win) => (win.document.getElementById('boxscore-wrap').textContent || '').includes('Freeland'),
    fetchOpts: { feed: feedWithOfficialBoxscore() },
  });
  const doc = page.win.document;
  const tables = Array.from(doc.querySelectorAll('#boxscore-wrap table'));
  assert.ok(tables.length >= 4, 'each team must render a batting and a pitching table');
  // Table 0 = COL batting, 1 = COL pitching, 2 = LAA batting, 3 = LAA pitching.
  const colBat = tables[0].textContent;
  const colPit = tables[1].textContent;

  // Official COL batting order is nine players; the four pitchers are in
  // `batters` too but must NOT appear in the batting table.
  for (const pitcher of ['Kyle Freeland', 'Seth Halvorsen', 'Jaden Hill', 'Antonio Senzatela']) {
    assert.doesNotMatch(colBat, new RegExp(pitcher),
      pitcher + ' is a pitcher and must not be listed as a batter');
    assert.match(colPit, new RegExp(pitcher), pitcher + ' must appear in the pitching table');
  }
  // No batting row may be a hollow row (name only, every stat cell blank).
  const colBatRows = Array.from(tables[0].querySelectorAll('tbody tr'));
  for (const row of colBatRows) {
    const cells = Array.from(row.querySelectorAll('td')).map((td) => td.textContent.trim());
    assert.ok(cells.slice(3, 9).some((c) => c !== '' && c !== '0'),
      'batting row for "' + cells[1] + '" has no stats at all — ' +
      'the API only reports a batting line for players who actually batted');
  }
  // Pinch hitter must be marked with the official `note` and show PH in the
  // position trail, which is what an official box score prints.
  const stevens = colBatRows.find((r) => r.textContent.includes('Chad Stevens'));
  assert.ok(stevens, 'the pinch hitter must appear in the batting table');
  assert.match(stevens.textContent, /a-/, 'the official `note` marker must be shown');
  assert.match(stevens.textContent, /PH-2B/, 'the allPositions trail must be shown');
  assert.deepEqual(page.errors, [], 'page must not log errors');
  page.win.close();
});

await run('box score falls back to team.batters when battingOrder is absent', async () => {
  // Older/partial payloads carry `batters` but no `battingOrder` array; the
  // renderer must still order by the per-player battingOrder field.
  const fallback = feedWithOfficialBoxscore();
  delete fallback.liveData.boxscore.teams.away.battingOrder;
  const page = await renderGamePage({
    until: (win) => (win.document.getElementById('boxscore-wrap').textContent || '').includes('Freeland'),
    fetchOpts: { feed: fallback },
  });
  const doc = page.win.document;
  const colBat = doc.querySelectorAll('#boxscore-wrap table')[0].textContent;
  assert.match(colBat, /Jake McCarthy/, 'the batting table still renders from `batters`');
  assert.doesNotMatch(colBat, /Kyle Freeland/, 'pitchers are still excluded without battingOrder');
  page.win.close();
});

await run('a two-way player appears in both the batting and pitching tables', async () => {
  // Verified against official game 822971 (DET @ TB, 2026-06-02): Ben Williamson
  // (ID 810938) is listed with `position.abbreviation: "P"`, has
  // `stats.batting: {atBats: 3, hits: 1}` AND 1.0 IP in the pitching lines.
  // An official box score lists him in both places, so the renderer must not
  // decide "pitcher" from `position` alone.
  //   https://statsapi.mlb.com/api/v1/game/822971/boxscore
  const twoWay = feedWithOfficialBoxscore();
  const away = twoWay.liveData.boxscore.teams.away;
  away.players.ID810938 = {
    person: { id: 810938, fullName: 'Ben Williamson' },
    position: { abbreviation: 'P' },
    battingOrder: '901',
    stats: { batting: { atBats: 3, hits: 1, runs: 0, rbi: 0, baseOnBalls: 0, strikeOuts: 0 },
      pitching: { inningsPitched: '1.0', hits: 0, runs: 0, earnedRuns: 0, baseOnBalls: 1, strikeOuts: 0 } },
    allPositions: [{ abbreviation: 'P' }],
  };
  away.batters = away.batters.concat([810938]);
  away.pitchers = away.pitchers.concat([810938]);
  const page = await renderGamePage({
    until: (win) => (win.document.getElementById('boxscore-wrap').textContent || '').includes('Williamson'),
    fetchOpts: { feed: twoWay },
  });
  const doc = page.win.document;
  const tables = Array.from(doc.querySelectorAll('#boxscore-wrap table'));
  assert.match(tables[0].textContent, /Ben Williamson/,
    'a player with a real batting line must be in the batting table even if he pitched');
  assert.match(tables[1].textContent, /Ben Williamson/,
    'the same player must also be in the pitching table');
  page.win.close();
});

await run('box score still lists the starting lineup before the first pitch', async () => {
  // A Preview/Scheduled game has `battingOrder` set but no at-bats yet. Every
  // starter must still be listed (with blank stat cells, which is the correct
  // official state), while the pitchers must not leak into the batting table.
  const preview = feedWithOfficialBoxscore();
  preview.gameData.status = {
    abstractGameState: 'Preview', codedGameState: 'S', detailedState: 'Scheduled',
    statusCode: 'S', abstractGameCode: 'P',
  };
  for (const side of ['away', 'home']) {
    Object.keys(preview.liveData.boxscore.teams[side].players).forEach((key) => {
      const p = preview.liveData.boxscore.teams[side].players[key];
      if (p.stats && p.stats.batting && !p.stats.batting.note) p.stats.batting = {};
    });
  }
  const page = await renderGamePage({
    until: (win) => (win.document.getElementById('boxscore-wrap').textContent || '').includes('McCarthy'),
    fetchOpts: { feed: preview },
  });
  const doc = page.win.document;
  const colBatRows = Array.from(doc.querySelectorAll('#boxscore-wrap table')[0].querySelectorAll('tbody tr'));
  const names = colBatRows.map((r) => r.querySelectorAll('td')[1].textContent.trim());
  // The nine players in official `team.battingOrder` must ALL be listed even
  // though every stat is blank, plus the pinch hitter, plus the two starters
  // who share a lineup slot with a substitute (slot "201"/"701" — the payload
  // keeps the replaced starter in `battingOrder`, which an official box score
  // also prints). What must NOT happen is a pitcher appearing as a batter.
  for (const starter of ['Jake McCarthy', 'TJ Rumfield', 'Hunter Goodman', 'Troy Johnston',
    'Willi Castro', 'Ezequiel Tovar', 'Sterlin Thompson', 'Kyle Karros']) {
    assert.ok(names.some((n) => n.indexOf(starter) === 0),
      starter + ' is in the official batting order and must be listed before his first PA');
  }
  assert.ok(names.some((n) => n.indexOf('Chad Stevens') === 0), 'the pinch hitter is listed');
  for (const pitcher of ['Kyle Freeland', 'Seth Halvorsen', 'Jaden Hill', 'Antonio Senzatela']) {
    assert.ok(!names.some((n) => n.indexOf(pitcher) === 0),
      pitcher + ' is a pitcher and must never be a batting row, with or without at-bats');
  }
  page.win.close();
});

/* -------------------------------------------------------- 2. unknown gamePk */

await run('an unknown gamePk says so instead of rendering an empty shell', async () => {
  const page = await renderGamePage({
    query: '?gamePk=999999999',
    until: (win) => (win.document.getElementById('main').textContent || '').includes('Game not found'),
    fetchOpts: { unknownGame: true },
  });
  const doc = page.win.document;
  const main = doc.getElementById('main').textContent;
  assert.match(main, /Game not found/);
  assert.match(main, /999999999/, 'the message names the id that was not found');
  assert.match(main, /gameData\.game\.pk: 0/, 'the message states the API evidence');
  assert.doesNotMatch(main, /Linescore not available yet/,
    'the empty placeholder shell must be replaced');
  assert.equal(doc.getElementById('loading').classList.contains('show'), false,
    'the loading spinner must be dismissed');
  // Polling must stop: one more round trip would return the same answer.
  const before = page.calls.filter((c) => c.includes('/feed/live')).length;
  await new Promise((r) => setTimeout(r, 1200));
  const after = page.calls.filter((c) => c.includes('/feed/live')).length;
  assert.equal(after, before, 'the page must not keep polling an unknown game');
  page.win.close();
});

/* -------------------------------------------- 3. lean review-status probe */

await run('review banner is painted from the lean status probe alone', async () => {
  // Models the real race: MLB flips `status.statusCode` the instant a review is
  // CALLED, but the play description (and therefore `reviewDetails`, which is
  // what the full feed parser reads) is only written when the review RESOLVES.
  // So the live feed below carries no review at all, while the lean probe
  // already reports the official "Manager challenge: Tag play" status.
  const liveFeed = feedWithOfficialBoxscore();
  liveFeed.gameData.status = {
    abstractGameState: 'Live', codedGameState: 'L', detailedState: 'In Progress',
    statusCode: 'IR', abstractGameCode: 'L',
  };
  // Strip every review detail from the full feed (the play text is not written yet).
  const strip = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(strip); return; }
    delete node.reviewDetails;
    Object.keys(node).forEach((k) => strip(node[k]));
  };
  strip(liveFeed.liveData.plays);
  const probe = {
    game: liveFeed.gameData.game,
    status: {
      abstractGameState: 'Live', codedGameState: 'M',
      detailedState: 'Manager challenge: Tag play', statusCode: 'MA',
      reason: 'Tag play', abstractGameCode: 'L',
    },
  };
  const page = await renderGamePage({
    until: (win) => (win.document.getElementById('live-review-banner-wrap').textContent || '')
      .includes('Under review now'),
    fetchOpts: { feed: liveFeed, probe },
  });
  const banner = page.win.document.getElementById('live-review-banner-wrap').textContent;
  assert.match(banner, /Under review now/);
  assert.match(banner, /Manager challenge: Tag play/, 'the official detailedState is shown verbatim');
  assert.match(banner, /Tag play/, 'the official reason is shown verbatim');
  assert.match(banner, /MA/, 'the official status code is quoted so it can be checked');
  // The probe must be a projected request, not a second full feed.
  const probeCalls = page.calls.filter((c) => c.includes('/feed/live') &&
    /[?&]fields=/.test(c));
  assert.ok(probeCalls.length >= 1, 'the lean status probe must be issued');
  assert.ok(decodeURIComponent(probeCalls[0]).includes('statusCode,reason'),
    'the probe must project the fields it reads');
  page.win.close();
});

await run('the status probe is not used for a Final game', async () => {
  const page = await renderGamePage({
    until: (win) => (win.document.getElementById('boxscore-wrap').textContent || '').includes('Freeland'),
    fetchOpts: { feed: feedWithOfficialBoxscore() },
  });
  // Allow any probe scheduled by an earlier (Live-looking) state to settle.
  await new Promise((r) => setTimeout(r, 300));
  const probeCalls = page.calls.filter((c) => c.includes('/feed/live') && /[?&]fields=/.test(c));
  assert.equal(probeCalls.length, 0,
    'a Final game flips review status no more, so the probe is skipped entirely');
  page.win.close();
});

/* ------------------------------------------ 4. post-Final re-scan window */

await run('a Final game is re-read inside the documented grace window', async () => {
  // Before the fix this page waited the flat FINAL_POLL_MS (30 s) after the
  // first Final response, so a ruling published seconds after the last pitch
  // was never seen. Tier 1 of the grace window is 1 s.
  const page = await renderGamePage({
    until: (win) => (win.document.getElementById('boxscore-wrap').textContent || '').includes('Freeland'),
    fetchOpts: { feed: feedWithOfficialBoxscore() },
  });
  const count = () => page.calls.filter((c) => c.includes('/feed/live') &&
    !/[?&]fields=/.test(c)).length;
  const first = count();
  assert.ok(first >= 1, 'the first load fetches the feed');
  await waitFor(() => count() > first, 6000);
  assert.ok(count() > first, 'the Final game must be re-read within the 1 s first tier');
  assert.deepEqual(page.errors.filter((e) => !/feed-log|static hosting/i.test(e)), [],
    'no page errors while re-scanning');
  page.win.close();
});

openWindows.forEach((win) => { try { win.close(); } catch (err) { /* ignore */ } });
console.log('\ngame-page-test: ' + passed + ' checks passed, ' + failures.length + ' failed');
process.exit(failures.length ? 1 : 0);
