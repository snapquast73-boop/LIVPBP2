/* Real-payload check: run the parsers against the OFFICIAL 2026-06-01 slate
 * exactly as statsapi.mlb.com returned it, not against the hand-trimmed
 * fixtures. This is the test that would have caught the "All" tab dropping
 * scoring changes and the scoreboard reading `flags`/`leagueRecord` where the
 * API returns neither.
 *
 *   node tools/live-slate-test.mjs
 *
 * Every payload in tools/fixtures/live-2026-06-01/ was downloaded from the URL
 * written in its own `_source` key (see tools/fetch-live-fixtures.mjs), so a
 * failure here means the client disagrees with a response MLB actually served.
 * No network access is used or needed.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, createSandbox, loadScripts } from './lib/browser-env.mjs';

const DIR = path.join(REPO_ROOT, 'tools', 'fixtures', 'live-2026-06-01');

function read(name) {
  const abs = path.join(DIR, name);
  assert.ok(fs.existsSync(abs), 'missing live fixture ' + name + ' — run tools/fetch-live-fixtures.mjs');
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

const schedule = read('schedule.json');
// /api/v1/gameStatus is a top-level ARRAY. JSON cannot hold a sibling
// `_source` key next to an array, so the fixture wraps it — unwrap the same way
// the client must.
const gameStatusDoc = read('game-status.json');
const gameStatus = Array.isArray(gameStatusDoc) ? gameStatusDoc : gameStatusDoc.registry;
const feed = read('feed-824027.json');
const vsPlayer = read('vs-player-660271-622608.json');

let passed = 0;
const failures = [];

function run(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('ok   ' + name);
  } catch (err) {
    failures.push(name);
    console.error('FAIL ' + name + '\n     ' + err.message);
    process.exitCode = 1;
  }
}

function ctx(withProps) {
  const sandbox = createSandbox();
  const files = ['assets/js/api.js', 'assets/js/ui.js', 'assets/js/reviews.js',
    'assets/js/feed-log.js', 'assets/js/reviews-feed.js'];
  if (withProps) files.push('assets/js/props.js');
  loadScripts(sandbox, files);
  return sandbox;
}

run('the live schedule carries leagueRecord and an empty flags object', () => {
  const games = schedule.dates[0].games;
  assert.equal(games.length, 9, 'the 2026-06-01 slate has nine games');
  assert.ok(games[0].teams.away.leagueRecord, 'leagueRecord is present on a finished game');
  assert.equal(typeof games[0].teams.away.leagueRecord.wins, 'number');
  assert.deepEqual(games[0].flags, {}, 'flags comes back as an empty object, not a populated flag set');
});

run('the live game-status registry is an array carrying reason-less rows', () => {
  assert.ok(Array.isArray(gameStatus), 'GET /api/v1/gameStatus is a top-level array');
  assert.ok(gameStatus.length >= 30, 'the review codes alone are 31 rows in the official registry');
  assert.ok(gameStatus.some((r) => !('reason' in r)),
    'several registry rows have no reason key at all — the client must tolerate that');
});

run('every review in the live feed parses with a category and an outcome', () => {
  const s = ctx();
  const rows = s.Reviews.extractGameReviews(feed);
  assert.ok(rows.length >= 2, 'game 824027 holds at least one manager challenge and one ABS challenge');
  rows.forEach((r) => {
    assert.ok(r.category, 'row ' + r.id + ' has a category');
    assert.ok(r.outcome, 'row ' + r.id + ' has an outcome');
    assert.ok(r.label, 'row ' + r.id + ' has a label');
  });
  const abs = rows.filter((r) => r.category === 'abs');
  assert.ok(abs.length >= 1, 'the MJ pitch challenge is classified as ABS');
  const mgr = rows.filter((r) => r.category === 'challenge');
  assert.ok(mgr.length >= 1, 'the MF play challenge is classified as a manager challenge');
});

run('review counters come from the official payload, never zero-filled', () => {
  const s = ctx();
  const rows = s.Reviews.extractGameReviews(feed);
  const abs = rows.find((r) => r.category === 'abs');
  assert.ok(abs, 'an ABS row exists');
  assert.ok(abs.counters && abs.counters.abs, 'the ABS counter object is carried on the row');
  assert.equal(abs.counters.abs.away.usedSuccessful, 2, 'away ABS usedSuccessful reads as-is');
  assert.equal(abs.counters.abs.home.remaining, 1, 'home ABS remaining reads as-is');
});

run('scoring-change diff yields attributable rows from two live scans', () => {
  const s = ctx();
  const before = s.Reviews.snapshotPlays(feed);
  // The same payload with one completed play reclassified: the exact edit MLB's
  // official scorer makes, and the only way a scoring change can be observed.
  const edited = JSON.parse(JSON.stringify(feed));
  const play = edited.liveData.plays.allPlays[0];
  const original = play.result.eventType;
  play.result.eventType = original === 'single' ? 'field_error' : 'single';
  const after = s.Reviews.snapshotPlays(edited);
  const diff = s.Reviews.diffSnapshots(before, after);
  assert.equal(diff.changes.length, 1, 'one reclassified play yields one scoring change');
  const change = diff.changes[0];
  assert.equal(change.category, 'scoring_change');
  assert.equal(change.gamePk, 824027);
  assert.ok(change.description && change.description.length > 10, 'the row carries the observed description');
});

run('the Replay Feed "All" tab keeps the categories its own README lists', () => {
  const s = ctx();
  assert.equal(typeof s.ReplayFeed, 'object', 'reviews-feed.js exposes ReplayFeed for testing');
  const scoringRow = { id: 'x', category: 'scoring_change', inProgress: false };
  const absRow = { id: 'y', category: 'abs', inProgress: false };
  const challengeRow = { id: 'z', category: 'challenge', inProgress: false };
  assert.equal(s.ReplayFeed.inAllTab(scoringRow), true,
    'reviews.html says scoring changes are tracked "in the All feed"');
  assert.equal(s.ReplayFeed.inAllTab(challengeRow), true);
  assert.equal(s.ReplayFeed.inAllTab(absRow), false,
    'ABS keeps its own tab — documented in the original README, L60-66');
});

run('head-to-head reads the career vsPlayerTotal block, not the first season', () => {
  const s = ctx(true);
  const h2h = s.Props.headToHeadFrom(vsPlayer);
  assert.ok(h2h, 'a career line is returned');
  // The career line is 5-for-11 (.455). The first `vsPlayer` split is 2024's
  // 3-for-5 (.600); reading that one instead is the defect this guards.
  assert.equal(h2h.atBats, 11, 'career at-bats, not one season');
  assert.equal(h2h.hits, 5, 'career hits, not one season');
  assert.equal(h2h.scope, 'career');
  assert.ok(Math.abs(h2h.rate - 5 / 11) < 1e-9, 'career rate is hits/atBats');
});

run('remaining plate appearances respect a 7-inning game', () => {
  const s = ctx(true);
  // A doubleheader game is scheduled for 7 innings; `scheduledInnings` is on
  // liveData.linescore. Reading it from gameData.game (which only carries
  // pk/season) made every such game look like a 9-inning one.
  const dh = {
    gameData: { status: { abstractGameState: 'Live' }, game: { pk: 1, season: '2026' } },
    liveData: { linescore: { currentInning: 5, scheduledInnings: 7 } },
  };
  const nine = {
    gameData: { status: { abstractGameState: 'Live' }, game: { pk: 2, season: '2026' } },
    liveData: { linescore: { currentInning: 5, scheduledInnings: 9 } },
  };
  assert.equal(s.Props.estimateRemainingPAs(dh), 1,
    'inning 5 of 7 leaves 3 innings -> round(3 * 0.45) = 1');
  assert.equal(s.Props.estimateRemainingPAs(nine), 2,
    'inning 5 of 9 leaves 5 innings -> round(5 * 0.45) = 2');
  assert.equal(s.Props.estimateRemainingPAs({ gameData: { status: { abstractGameState: 'Final' } } }), 0,
    'a final game has no plate appearances left');
});

run('head-to-head survives a payload with no total block', () => {
  const s = ctx(true);
  const h2h = s.Props.headToHeadFrom({ stats: [vsPlayer.stats[0]] });
  assert.equal(h2h.hits, 5, 'per-season rows are summed (3+2+0)');
  assert.equal(h2h.atBats, 11, 'per-season at-bats are summed (5+3+3)');
  assert.equal(h2h.scope, 'summed-seasons', 'the fallback labels what it did');
  assert.equal(s.Props.headToHeadFrom({ stats: [] }), null,
    'no data means no row, never a zero line');
});

console.log('\nlive-slate-test: ' + passed + ' checks passed, ' + failures.length + ' failed');
if (failures.length) {
  console.error('failed: ' + failures.join('; '));
  process.exitCode = 1;
}
