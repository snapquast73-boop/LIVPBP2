#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function testAsync(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log('1. Checking JS syntax across all scripts...');
const jsFiles = [
  'server.mjs',
  'assets/js/api.js',
  'assets/js/ui.js',
  'assets/js/feed-log.js',
  'assets/js/reviews.js',
  'assets/js/props.js',
  'assets/js/scoreboard.js',
  'assets/js/game.js',
  'assets/js/reviews-feed.js',
];
for (const rel of jsFiles) {
  test(`syntax: ${rel}`, () => {
    execFileSync(process.execPath, ['--check', path.join(ROOT, rel)], { stdio: 'pipe' });
  });
}

console.log('\n2. Testing MLBAPI (429 Retry-After throttle & URLs)...');
const MLBAPI = require(path.join(ROOT, 'assets/js/api.js'));
test('SPORT_ID defaults to 1 (MLB)', () => {
  assert.equal(MLBAPI.SPORT_ID, 1);
});
test('parseRetryAfterMs clamps between 1s and 5min, defaults to 60s', () => {
  assert.equal(MLBAPI.parseRetryAfterMs(null), 60000);
  assert.equal(MLBAPI.parseRetryAfterMs('0'), 1000);
  assert.equal(MLBAPI.parseRetryAfterMs('15'), 15000);
  assert.equal(MLBAPI.parseRetryAfterMs('999'), 300000);
});
await testAsync('HTTP 429 activates self-throttle cooldown', async () => {
  MLBAPI.resetRateLimit();
  const mockFetch429 = async () => ({
    ok: false,
    status: 429,
    headers: { get: (k) => (k.toLowerCase() === 'retry-after' ? '5' : null) },
  });
  await assert.rejects(
    () => MLBAPI.fetchJSON('https://statsapi.mlb.com/api/v1/schedule', { fetch: mockFetch429 }),
    /429/
  );
  assert.ok(MLBAPI.getRateLimitRemainingMs() > 0 && MLBAPI.getRateLimitRemainingMs() <= 5000);
  // Subsequent call must short-circuit without calling fetch
  let called = false;
  await assert.rejects(
    () => MLBAPI.fetchJSON('https://statsapi.mlb.com/api/v1/schedule', {
      fetch: async () => { called = true; return { ok: true, status: 200, json: async () => ({}) }; },
    }),
    /rate-limited/
  );
  assert.equal(called, false);
  MLBAPI.resetRateLimit();
});

console.log('\n3. Testing UI (official gameStatus registry & visual helpers)...');
const UI = require(path.join(ROOT, 'assets/js/ui.js'));
globalThis.UI = UI;

test('isReviewStatus matches official M*, N*, IH codes and rejects non-review codes', () => {
  assert.equal(UI.isReviewStatus({ statusCode: 'IH', codedGameState: 'I', detailedState: 'Instant Replay' }), true);
  assert.equal(UI.isReviewStatus({ statusCode: 'MA', codedGameState: 'M', detailedState: 'Manager challenge: Tag play' }), true);
  assert.equal(UI.isReviewStatus({ statusCode: 'MJ', codedGameState: 'M', detailedState: 'Player challenge: Pitch Result' }), true);
  assert.equal(UI.isReviewStatus({ statusCode: 'NH', codedGameState: 'N', detailedState: 'Umpire review: Home run' }), true);
  assert.equal(UI.isReviewStatus({ statusCode: 'NJ', codedGameState: 'N', detailedState: 'Umpire Challenge: Pitch Result' }), true);
  assert.equal(UI.isReviewStatus({ statusCode: 'I', codedGameState: 'I', detailedState: 'In Progress' }), false);
  assert.equal(UI.isReviewStatus({ statusCode: 'F', codedGameState: 'F', detailedState: 'Final' }), false);
  assert.equal(UI.isReviewStatus({ statusCode: 'IR', codedGameState: 'I', detailedState: 'Delayed: Rain' }), false);
});

test('describeReviewStatus maps official reasons & categories', () => {
  assert.deepEqual(
    UI.describeReviewStatus({ statusCode: 'IH', codedGameState: 'I' }).category,
    'review'
  );
  assert.equal(UI.describeReviewStatus({ statusCode: 'NH', codedGameState: 'N' }).category, 'boundary');
  assert.equal(UI.describeReviewStatus({ statusCode: 'NH', codedGameState: 'N' }).reason, 'Home run');
  assert.equal(UI.describeReviewStatus({ statusCode: 'MJ', codedGameState: 'M' }).category, 'abs');
  assert.equal(UI.describeReviewStatus({ statusCode: 'MC', codedGameState: 'M' }).category, 'challenge');
  assert.equal(UI.describeReviewStatus({ statusCode: 'MC', codedGameState: 'M' }).reason, 'Force play');
});

test('teamLogoUrl uses dark-theme MLB cap SVG and playerHeadshotUrl uses official 67/current', () => {
  assert.equal(UI.teamLogoUrl(113), 'https://www.mlbstatic.com/team-logos/team-cap-on-dark/113.svg');
  assert.ok(UI.playerHeadshotUrl(682829).includes('/v1/people/682829/headshot/67/current'));
  assert.ok(UI.renderCountDots(3, 2, 1).includes('dot-b'));
  assert.ok(UI.renderBaseDiamond({ first: { fullName: 'Runner' } }).includes('base-on'));
});

console.log('\n4. Testing Reviews parser (real StatsAPI shapes, Runs at Risk, Counters, Scoring Changes)...');
const Reviews = require(path.join(ROOT, 'assets/js/reviews.js'));

const sampleFeed = {
  gamePk: 824877,
  gameData: {
    game: { pk: 824877 },
    teams: {
      away: { id: 115, name: 'Colorado Rockies', abbreviation: 'COL' },
      home: { id: 144, name: 'Atlanta Braves', abbreviation: 'ATL' },
    },
    review: { hasChallenges: true, away: { used: 1, remaining: 0 }, home: { used: 1, remaining: 0 } },
    absChallenges: {
      hasChallenges: true,
      away: { usedSuccessful: 2, usedFailed: 1, remaining: 1 },
      home: { usedSuccessful: 2, usedFailed: 1, remaining: 1 },
    },
  },
  liveData: {
    linescore: { teams: { away: { runs: 4 }, home: { runs: 6 } } },
    plays: {
      allPlays: [
        // Active manager challenge with 1 scoring runner on playIndex 3 and 1 unrelated wild-pitch run on playIndex 1
        {
          about: { atBatIndex: 40, inning: 5, halfInning: 'top', isComplete: false, startTime: '2026-08-28T23:00:00Z' },
          result: { event: 'Single', eventType: 'single', description: 'Runner called safe at home.', awayScore: 4, homeScore: 6 },
          matchup: { batter: { id: 1, fullName: 'Batter A' }, pitcher: { id: 2, fullName: 'Pitcher B' } },
          reviewDetails: { isOverturned: false, inProgress: true, reviewType: 'MA', challengeTeamId: 144 },
          runners: [
            { details: { isScoringEvent: true, playIndex: 1 } }, // earlier wild pitch — must NOT count!
            { details: { isScoringEvent: true, playIndex: 3 } }, // reviewed event — MUST count!
          ],
          playEvents: [
            { index: 0, isPitch: true, count: { balls: 1, strikes: 0, outs: 1 } },
            { index: 1, isPitch: false, count: { balls: 1, strikes: 0, outs: 1 } },
            { index: 2, isPitch: true, count: { balls: 1, strikes: 1, outs: 1 } },
            { index: 3, isPitch: true, count: { balls: 1, strikes: 1, outs: 1 } },
          ],
        },
        // Resolved mid-AB ABS pitch challenge (real shape from 824877 atBatIndex 68)
        {
          about: { atBatIndex: 68, inning: 7, halfInning: 'bottom', isComplete: true, endTime: '2026-08-28T23:30:00Z' },
          result: { event: 'Forceout', eventType: 'force_out', description: 'Grounds into force out.', awayScore: 4, homeScore: 6 },
          matchup: { batter: { id: 3, fullName: 'Ha-Seong Kim' }, pitcher: { id: 4, fullName: 'Pitcher C' } },
          runners: [],
          playEvents: [
            { index: 0, isPitch: true, count: { balls: 0, strikes: 1, outs: 2 }, details: { call: { code: 'C', description: 'Called Strike' } } },
            { index: 1, isPitch: true, count: { balls: 0, strikes: 2, outs: 2 }, details: { call: { code: 'F', description: 'Foul' } } },
            {
              index: 2, isPitch: true, count: { balls: 1, strikes: 2, outs: 2 },
              details: { call: { code: 'B', description: 'Ball' } },
              reviewDetails: { isOverturned: true, inProgress: false, reviewType: 'MJ', challengeTeamId: 144 },
            },
            { index: 3, isPitch: true, count: { balls: 1, strikes: 2, outs: 2 }, details: { call: { code: 'X', description: 'In play, out(s)' } } },
          ],
        },
        // Active boundary call with 0 credited runs
        {
          about: { atBatIndex: 70, inning: 8, halfInning: 'top', isComplete: false, startTime: '2026-08-28T23:40:00Z' },
          result: { event: 'Double', eventType: 'double', description: 'Deep drive off top of wall.', awayScore: 4, homeScore: 6 },
          matchup: { batter: { id: 5, fullName: 'Batter D' }, pitcher: { id: 6, fullName: 'Pitcher E' } },
          reviewDetails: { isOverturned: false, inProgress: true, reviewType: 'NH' },
          runners: [],
          playEvents: [{ index: 0, isPitch: true, count: { balls: 0, strikes: 0, outs: 0 } }],
        },
        // Official scorer pending ruling
        {
          about: { atBatIndex: 72, inning: 8, halfInning: 'top', isComplete: true, endTime: '2026-08-28T23:45:00Z' },
          result: { event: 'Official Scorer Ruling Pending', eventType: 'os_ruling_pending_primary', description: 'Hard grounder off glove.', awayScore: 4, homeScore: 6 },
          matchup: { batter: { id: 7, fullName: 'Batter F' }, pitcher: { id: 6, fullName: 'Pitcher E' } },
          runners: [],
          playEvents: [],
        },
      ],
    },
  },
};

test('extractGameReviews accurately classifies, counts strict Runs at Risk, counters, and ABS pitch context', () => {
  const items = Reviews.extractGameReviews(sampleFeed);
  assert.equal(items.length, 4);

  // 1. Active Manager Challenge with strict playIndex run-at-risk = 1 (not 2!)
  const mgr = items[0];
  assert.equal(mgr.category, 'challenge');
  assert.equal(mgr.officialReason, 'Tag play');
  assert.equal(mgr.challengerAbbr, 'ATL');
  assert.equal(mgr.runsAtRisk, 1);
  assert.deepEqual(mgr.beforeScore, { away: 4, home: 6 });
  assert.deepEqual(mgr.possibleScore.ifRemoved, { away: 3, home: 6 });
  assert.ok(mgr.counterLine.includes('ATL: 0 manager challenges left now (1 used)'));

  // 2. Mid-AB ABS pitch review: no end-of-PA actualScore assigned, pitch count 0-2 -> 1-2, challenger Batter
  const abs = items[1];
  assert.equal(abs.category, 'abs');
  assert.equal(abs.actualScore, null);
  assert.equal(abs.absContext.beforeCount, '0-2');
  assert.equal(abs.absContext.afterCount, '1-2');
  assert.equal(abs.challengerRole, 'Batter');
  assert.ok(abs.counterLine.includes('ATL: 1 ABS challenge left now (2 successful · 1 failed)'));

  // 3. Boundary call with 0 credited runs: "Score impact pending", no team counter line
  const bnd = items[2];
  assert.equal(bnd.category, 'boundary');
  assert.equal(bnd.runsAtRisk, 0);
  assert.equal(bnd.counterLine, '');
  assert.ok(bnd.possibleScore.pendingText.includes('Score impact pending'));

  // 4. Official scorer pending ruling: never removes a run
  const os = items[3];
  assert.equal(os.category, 'os_pending');
  assert.equal(os.runsAtRisk, 0);
});

test('Pre-ABS season without absChallenges never zero-fills counters; backwards counter flagged', () => {
  const preAbs = Reviews.extractChallengeCounters({ gameData: { review: { away: { used: 0, remaining: 1 }, home: { used: 1, remaining: 0 } } } });
  assert.equal(preAbs.absChallenges, null);
  assert.equal(Reviews.formatTeamCounterLine('abs', 'away', 'CIN', preAbs), '');
  assert.equal(Reviews.formatBothTeamsCounterSummary('CIN', 'CHC', preAbs), 'Challenges left: CIN 1 MGR — CHC 0 MGR');

  const prev = Reviews.extractChallengeCounters({ gameData: { review: { away: { used: 2, remaining: 0 }, home: { used: 0, remaining: 1 } } } });
  const next = Reviews.extractChallengeCounters({ gameData: { review: { away: { used: 1, remaining: 1 }, home: { used: 0, remaining: 1 } } } });
  const irreg = Reviews.detectCounterIrregularity(prev, next, 'CIN', 'CHC');
  assert.equal(irreg.length, 1);
  assert.ok(irreg[0].includes('moved backwards'));
});

test('Scoring change snapshotting & diffing detects reclassifications and flags irregularities', () => {
  const plays1 = [
    { about: { atBatIndex: 10, inning: 3, halfInning: 'top', isComplete: true }, result: { event: 'Single', eventType: 'single', isOut: false, rbi: 0, awayScore: 1, homeScore: 0, description: 'Singles to SS.' }, count: { outs: 1 }, runners: [] },
    { about: { atBatIndex: 11, inning: 3, halfInning: 'top', isComplete: true }, result: { event: 'Flyout', eventType: 'field_out', isOut: true, rbi: 0, awayScore: 1, homeScore: 0, description: 'Flies out.' }, count: { outs: 2 }, runners: [] },
    { about: { atBatIndex: 12, inning: 3, halfInning: 'top', isComplete: true }, result: { event: 'Groundout', eventType: 'field_out', isOut: true, rbi: 0, awayScore: 1, homeScore: 0, description: 'Grounds out.' }, count: { outs: 3 }, runners: [] },
  ];
  const plays2 = [
    { about: { atBatIndex: 10, inning: 3, halfInning: 'top', isComplete: true }, result: { event: 'Field Error', eventType: 'field_error', isOut: false, rbi: 0, awayScore: 1, homeScore: 0, description: 'Reaches on E6.' }, count: { outs: 1 }, runners: [{ details: { eventType: 'field_error' } }] },
    { about: { atBatIndex: 11, inning: 3, halfInning: 'top', isComplete: true }, result: { event: 'Flyout', eventType: 'field_out', isOut: true, rbi: 0, awayScore: 1, homeScore: 0, description: 'Flies out sharply to CF.' }, count: { outs: 2 }, runners: [] },
    // play 12 vanished!
  ];
  const s1 = Reviews.snapshotCompletedPlays(plays1);
  const s2 = Reviews.snapshotCompletedPlays(plays2);
  const diff = Reviews.diffPlaySnapshots(s1, s2, { gamePk: 824877, awayAbbr: 'COL', homeAbbr: 'ATL' });
  assert.equal(diff.scoringChanges.length, 1);
  assert.equal(diff.scoringChanges[0].initialCall, 'Single');
  assert.equal(diff.scoringChanges[0].finalRuling, 'Field Error');
  assert.equal(diff.irregularities.length, 2); // description edit + vanished play
});

console.log('\n5. Testing Props (Two-Sided Hit Forecast model)...');
const Props = require(path.join(ROOT, 'assets/js/props.js'));
test('Two-sided hit forecast separates elite vs tough matchups, honors count & Final state, and labels fallbacks', () => {
  const baseline = Props.computeForecast({ batter: { hasData: false }, pitcher: { hasData: false } });
  assert.ok(baseline.fallbackLabel.includes('League baseline'));
  assert.ok(Math.abs(baseline.perPaProb - Props.LEAGUE_HIT_RATE) < 0.01);

  const elite = Props.computeForecast({
    batter: { hasData: true, xba: 0.330, avg: 0.320, sample: 450, splitAvg: 0.350, splitSample: 180, formAvg: 0.400, formSample: 30 },
    pitcher: { hasData: true, xba: 0.305, avg: 0.310, sample: 400, splitAvg: 0.330, splitSample: 160, formAvg: 0.350, formSample: 40 },
    h2h: { avg: 0.450, ab: 20, hits: 9, pa: 22 },
    sameGamePAs: 2,
    balls: 3,
    strikes: 1,
    remainingPAs: 4,
  });
  const tough = Props.computeForecast({
    batter: { hasData: true, xba: 0.195, avg: 0.190, sample: 300, splitAvg: 0.165, splitSample: 120, formAvg: 0.120, formSample: 25 },
    pitcher: { hasData: true, xba: 0.185, avg: 0.180, sample: 500, splitAvg: 0.160, splitSample: 220, formAvg: 0.140, formSample: 40 },
    balls: 0,
    strikes: 2,
    remainingPAs: 3,
  });
  assert.ok(elite.perPaProb > 0.40, `Expected elite prob > 0.40, got ${elite.perPaProb}`);
  assert.ok(tough.perPaProb < 0.16, `Expected tough prob < 0.16, got ${tough.perPaProb}`);
  assert.ok(elite.multiPaProb > 0.85, `Expected elite multi-PA prob > 0.85, got ${elite.multiPaProb}`);

  const finalRes = Props.computeForecast({
    batter: { hasData: true, xba: 0.280, avg: 0.280, sample: 400 },
    pitcher: { hasData: false },
    isFinal: true,
  });
  assert.equal(finalRes.multiPaProb, null);
  assert.ok(finalRes.fallbackLabel.includes('pitcher baseline fallback'));
});

test('extractSideInputs picks multi-team combined split and excludes current/future gameLog dates', () => {
  const payload = {
    stats: [
      {
        type: { displayName: 'season' },
        splits: [
          { stat: { avg: '.267', battersFaced: 663 }, numTeams: 2 },
          { stat: { avg: '.245', battersFaced: 344 }, team: { id: 112 } },
          { stat: { avg: '.292', battersFaced: 319 }, team: { id: 121 } },
        ],
      },
      {
        type: { displayName: 'gameLog' },
        splits: [
          { date: '2026-08-20', stat: { hits: 2, atBats: 4 } },
          { date: '2026-08-25', stat: { hits: 1, atBats: 4 } },
          { date: '2026-08-28', stat: { hits: 4, atBats: 4 } }, // game's own date — must be excluded!
        ],
      },
    ],
  };
  const inp = Props.extractSideInputs(payload, 'R', '2026-08-28', true);
  assert.equal(inp.avg, 0.267);
  assert.equal(inp.formSample, 8);
  assert.ok(Math.abs(inp.formAvg - 3 / 8) < 1e-6);
});

console.log('\n6. Testing FeedLog + server.mjs HTTP & SSE persistence end-to-end...');
const FeedLog = require(path.join(ROOT, 'assets/js/feed-log.js'));
test('FeedLog.mergeLogs preserves earliest beforeScore and deduplicates cleanly', () => {
  const logA = {
    v: 1,
    date: '2026-08-28',
    entries: [{ gamePk: 824877, review: { id: 'r1', inProgress: true, beforeScore: { away: 4, home: 6 } }, firstSeen: 100, lastSeen: 100 }],
    snapshots: { '824877': { '1': { eventType: 'single' } } },
    irregularities: { '824877': ['note 1'] },
  };
  const logB = {
    v: 1,
    date: '2026-08-28',
    entries: [{ gamePk: 824877, review: { id: 'r1', inProgress: false, actualScore: { away: 3, home: 6 } }, firstSeen: 200, lastSeen: 200 }],
    snapshots: { '824877': { '2': { eventType: 'walk' } } },
    irregularities: { '824877': ['note 1', 'note 2'] },
  };
  const merged = FeedLog.mergeLogs(logA, logB, '2026-08-28');
  assert.equal(merged.entries.length, 1);
  assert.deepEqual(merged.entries[0].review.beforeScore, { away: 4, home: 6 });
  assert.deepEqual(merged.entries[0].review.actualScore, { away: 3, home: 6 });
  assert.equal(merged.irregularities['824877'].length, 2);
});

await testAsync('server.mjs serves all pages/assets and persists + broadcasts feed-log', async () => {
  const testPort = 18765;
  const testDate = '2099-01-01';
  const testFile = path.join(ROOT, 'data', `feed-log-${testDate}.json`);
  const indexFile = path.join(ROOT, 'data', 'feed-log-index.json');
  const proc = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], {
    env: { ...process.env, PORT: String(testPort) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server start timeout')), 5000);
      proc.stdout.on('data', (chunk) => {
        if (String(chunk).includes('listening on')) {
          clearTimeout(timer);
          resolve();
        }
      });
      proc.on('exit', (code) => { clearTimeout(timer); reject(new Error(`server exited ${code}`)); });
    });

    const base = `http://127.0.0.1:${testPort}`;
    for (const p of ['/index.html', '/game.html', '/reviews.html', '/flagged.html', '/assets/css/style.css', '/assets/js/api.js', '/api/health']) {
      const res = await fetch(`${base}${p}`);
      assert.equal(res.status, 200, `Expected 200 for ${p}, got ${res.status}`);
    }
    const res404 = await fetch(`${base}/nonexistent-page`);
    assert.equal(res404.status, 404);

    const postRes = await fetch(`${base}/api/feed-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        v: 1,
        date: testDate,
        entries: [{ gamePk: 824877, review: { id: 'test-1', label: 'Manager Challenge' }, firstSeen: 1, lastSeen: 2 }],
      }),
    });
    assert.equal(postRes.status, 200);
    const getRes = await fetch(`${base}/api/feed-log?date=${testDate}`);
    const body = await getRes.json();
    assert.equal(body.entries.length, 1);
    assert.equal(body.entries[0].review.id, 'test-1');
  } finally {
    proc.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 150));
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    if (fs.existsSync(indexFile)) {
      try {
        const idx = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
        delete idx[testDate];
        if (Object.keys(idx).length === 0) fs.unlinkSync(indexFile);
        else fs.writeFileSync(indexFile, JSON.stringify(idx, null, 2));
      } catch (_) {}
    }
    const dataDir = path.join(ROOT, 'data');
    if (fs.existsSync(dataDir) && fs.readdirSync(dataDir).length === 0) fs.rmdirSync(dataDir);
  }
});

console.log(`\nAll ${passed} checks passed!`);
