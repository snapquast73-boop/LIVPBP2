/* Deterministic, network-free checks for assets/js/reviews.js.
 * Run: node tools/review-test.mjs
 *
 * Fixtures are shaped from live StatsAPI responses verified 2026-11-20; see
 * docs/verification-report.md §3–§6 for the request URLs and raw evidence. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSandbox, loadScripts, readFixture } from './lib/browser-env.mjs';

// Objects created inside the vm sandbox belong to another realm, so compare
// them structurally through JSON instead of relying on prototype identity.
function same(actual, expected, msg) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), msg);
}

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('ok   ' + name);
  } catch (err) {
    console.error('FAIL ' + name + '\n     ' + err.message);
    process.exitCode = 1;
  }
}

const ctx = createSandbox();
loadScripts(ctx, ['assets/js/ui.js', 'assets/js/api.js', 'assets/js/reviews.js']);
const Reviews = ctx.Reviews;

const registry = readFixture('game-status.json');
const feed = readFixture('feed-824027.json');

check('gameStatus registry builds a code lookup', () => {
  const map = Reviews.buildStatusMap(registry);
  assert.equal(map.MA.detailedState, 'Manager challenge: Tag play');
  assert.equal(map.IH.detailedState, 'Instant Replay');
  assert.equal(Reviews.statusInfo('MJ').reason, 'Pitch Result');
});

check('review status detection reads registry codes, not words', () => {
  ['MA', 'MH', 'MJ', 'NH', 'NJ', 'IH'].forEach((code) => {
    assert.equal(Reviews.isReviewStatus(code), true, code + ' should be a review state');
  });
  ['I', 'F', 'S', 'PW', ''].forEach((code) => {
    assert.equal(Reviews.isReviewStatus(code), false, code + ' should not be a review state');
  });
});

check('review categories follow the registry labels', () => {
  assert.equal(Reviews.categoryFromStatus('MJ').category, 'abs');
  assert.equal(Reviews.categoryFromStatus('NJ').category, 'abs');
  assert.equal(Reviews.categoryFromStatus('MA').category, 'challenge');
  assert.equal(Reviews.categoryFromStatus('NH').category, 'review');
  assert.equal(Reviews.categoryFromStatus('IH').category, 'review');
  assert.equal(Reviews.classifyReview({ reviewType: 'MA', reason: 'Tag play' }).category, 'challenge');
  assert.equal(Reviews.classifyReview({ reviewType: 'NH', reason: 'Home run' }).category, 'boundary');
});

check('review parser finds play-level and event-level reviews exactly once', () => {
  const items = Reviews.extractGameReviews(feed);
  assert.equal(items.length, 2, 'expected 2 review entries, got ' + items.length + ': ' +
    items.map((i) => i.id).join(', '));
  const abs = items.find((i) => i.category === 'abs');
  const mgr = items.find((i) => i.category === 'challenge');
  assert.ok(abs, 'ABS entry missing');
  assert.ok(mgr, 'manager-challenge entry missing');
  assert.equal(abs.reviewType, 'MJ');
  assert.equal(abs.outcome, 'Overturned');
  assert.equal(mgr.reviewType, 'MA');
  assert.equal(mgr.inProgress, true);
  assert.equal(mgr.outcome, 'Under Review');
});

check('runs-at-risk uses only scoring movements tied to the reviewed event', () => {
  const mgr = Reviews.extractGameReviews(feed).find((i) => i.category === 'challenge');
  assert.equal(mgr.runsAtRisk, 1);
  same(mgr.scoreBefore, { away: 0, home: 1 });
  same(mgr.scoreActual, { away: 0, home: 2 });
  same(mgr.possibleAfter, { away: 0, home: 1 });
});

check('a pitch review with no playIndex claims no runs at risk', () => {
  const f = JSON.parse(JSON.stringify(feed));
  const play = f.liveData.plays.allPlays[1];
  delete play.reviewDetails;
  play.playEvents[1].reviewDetails = {
    reviewType: 'MJ', challengeTeamId: 115, isOverturned: false, inProgress: true,
  };
  play.runners[0].details.isScoringEvent = true;
  const entry = Reviews.extractGameReviews(f)[0];
  assert.equal(entry.reviewScope, 'event');
  assert.equal(entry.runsAtRisk, 0, 'without a pitch playIndex nothing may be claimed');
  assert.equal(entry.possibleAfter, null);
});

check('reason text falls back to the official gameStatus registry', () => {
  const abs = Reviews.extractGameReviews(feed).find((i) => i.category === 'abs');
  assert.equal(abs.reason, 'Pitch Result', 'MJ reason comes from GET /api/v1/gameStatus');
});

check('official counters are read as-is, never derived', () => {
  const snap = Reviews.counterSnapshot(feed);
  assert.equal(snap.mgr.home.used, 1);
  assert.equal(snap.mgr.home.remaining, 0);
  assert.equal(snap.abs.away.usedSuccessful, 2);
  assert.equal(snap.abs.away.usedFailed, 2);
  assert.equal(snap.abs.away.remaining, 0);
  assert.equal(
    Reviews.counterLine(snap, 'home', 'LAA', 'abs'),
    'LAA: 1 ABS challenge left now (1 successful · 1 failed)'
  );
  assert.equal(
    Reviews.counterLine(snap, 'home', 'LAA', 'mgr'),
    'LAA: 0 manager challenges left now (1 used)'
  );
  assert.equal(Reviews.countersSummary(snap, 'COL', 'LAA'), 'Challenges left: COL 1 MGR · 0 ABS — LAA 0 MGR · 1 ABS');
});

check('missing counters produce no line instead of a zero-filled one', () => {
  const empty = { available: false, mgr: {}, abs: {} };
  assert.equal(Reviews.counterLine(empty, 'home', 'LAA', 'abs'), '');
  assert.equal(Reviews.countersSummary(empty, 'COL', 'LAA'), '');
});

check('official-scorer pending rulings come from the API event types', () => {
  const pendingFeed = {
    gameData: { game: { pk: 1 }, teams: { away: { abbreviation: 'A' }, home: { abbreviation: 'B' } } },
    liveData: {
      plays: {
        allPlays: [{
          about: { atBatIndex: 4, inning: 3, halfInning: 'top' },
          result: { description: 'Ground ball, ruling pending', awayScore: 1, homeScore: 0 },
          matchup: { batter: { id: 1, fullName: 'Batter' }, pitcher: { id: 2, fullName: 'Pitcher' } },
          playEvents: [{
            details: {
              eventType: 'os_ruling_pending_primary',
              description: 'Official Scorer Ruling Pending',
            },
          }],
        }],
      },
    },
  };
  const rows = Reviews.extractPendingRulings(pendingFeed);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].category, 'os_pending');
  assert.equal(rows[0].label, 'Official Scorer Ruling Pending');
});

check('scoring changes need an observable reclassification', () => {
  const snap1 = Reviews.snapshotPlays(feed);
  const edited = JSON.parse(JSON.stringify(feed));
  edited.liveData.plays.allPlays[1].result.eventType = 'error';
  edited.liveData.plays.allPlays[1].result.event = 'Error';
  edited.liveData.plays.allPlays[1].result.isOut = false;
  const snap2 = Reviews.snapshotPlays(edited);
  const diff = Reviews.diffSnapshots(snap1, snap2);
  assert.equal(diff.changes.length, 1, 'hit -> error should be one scoring change');
  assert.equal(diff.changes[0].from.eventType, 'double');
  assert.equal(diff.changes[0].to.eventType, 'error');
  assert.equal(diff.irregularities.length, 0);

  const softEdit = JSON.parse(JSON.stringify(feed));
  softEdit.liveData.plays.allPlays[1].result.description += ' (RBI credited)';
  const softDiff = Reviews.diffSnapshots(snap1, Reviews.snapshotPlays(softEdit));
  assert.equal(softDiff.changes.length, 0);
  assert.equal(softDiff.irregularities.length, 1);
  assert.equal(softDiff.irregularities[0].category, 'irregularity');
});

check('a play vanishing from the payload is an irregularity, not silence', () => {
  const snap1 = Reviews.snapshotPlays(feed);
  const removed = JSON.parse(JSON.stringify(feed));
  removed.liveData.plays.allPlays.pop();
  const diff = Reviews.diffSnapshots(snap1, Reviews.snapshotPlays(removed));
  assert.equal(diff.irregularities.length, 1);
  assert.match(diff.irregularities[0].label, /disappeared/);
});

check('a used counter moving backwards is an irregularity', () => {
  const a = { available: true, mgr: { away: { used: 2, remaining: 0 }, home: { used: 0, remaining: 1 } }, abs: {} };
  const b = { available: true, mgr: { away: { used: 1, remaining: 1 }, home: { used: 0, remaining: 1 } }, abs: {} };
  const out = Reviews.diffCounters(a, b);
  assert.equal(out.length, 1);
  assert.equal(out[0].category, 'irregularity');
  assert.match(out[0].detail, /went from 2 to 1/);
});

/*
 * The Replay Feed asks for a `fields=` projection, and that projection is
 * leaf-name based: naming `reviewDetails` alone answers `"reviewDetails": {}`
 * (verified 2026-11-20 —
 * https://statsapi.mlb.com/api/v1.1/game/824027/feed/live?fields=liveData,plays,allPlays,playEvents,reviewDetails
 * returned empty objects, while adding the four leaf names returned
 * {"isOverturned":false,"inProgress":false,"reviewType":"MF","challengeTeamId":108}).
 * Without them every row on the live page degraded to "Replay Review / Unknown",
 * so the leaves are asserted here.
 */
check('the Replay Feed projection names the reviewDetails leaves', () => {
  const src = readFileSync(new URL('../assets/js/reviews-feed.js', import.meta.url), 'utf8');
  const start = src.indexOf('var FEED_FIELDS = [');
  const list = src.slice(start, src.indexOf('].join', start));
  for (const leaf of ['reviewDetails', 'reviewType', 'challengeTeamId', 'isOverturned', 'inProgress']) {
    assert.ok(list.includes("'" + leaf + "'"),
      leaf + ' missing from FEED_FIELDS — the API would return reviewDetails as {}');
  }
});

console.log('\nreview-test: ' + passed + ' checks passed');
