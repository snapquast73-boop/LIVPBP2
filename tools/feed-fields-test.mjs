/* Regression checks for the Replay Feed's StatsAPI `fields` projection and
 * pitch-level review binding (session 9a7095ef).
 * Run: node tools/feed-fields-test.mjs   (network-free, no dependencies)
 *
 * Why: the live Replay Feed labelled every review "Replay Review · Unknown"
 * and counted 0 ABS challenges because `FEED_FIELDS` listed `reviewDetails`
 * but not its children, and the StatsAPI then returns `reviewDetails: {}`:
 *   https://statsapi.mlb.com/api/v1.1/game/824027/feed/live?fields=liveData,plays,allPlays,about,atBatIndex,reviewDetails
 * Listing the children returns them:
 *   https://statsapi.mlb.com/api/v1.1/game/824027/feed/live?fields=liveData,plays,allPlays,about,atBatIndex,reviewDetails,isOverturned,inProgress,reviewType,challengeTeamId,player,id
 *
 * The plate-appearance fixture below copies values from the official payload
 * for game 825078, atBatIndex 26 (Miguel Rojas, 2026-06-01, LAD @ AZ):
 *   https://statsapi.mlb.com/api/v1.1/game/825078/feed/live?fields=liveData,plays,allPlays,atBatIndex,playEvents,index,isPitch,type,pitchNumber,details,description,code,playId,reviewDetails,reviewType,isOverturned
 *   https://statsapi.mlb.com/api/v1.1/game/825078/feed/live?fields=liveData,plays,allPlays,atBatIndex,playEvents,index,reviewDetails,isOverturned,inProgress,reviewType,challengeTeamId
 * Pitches 3 and 4 (playEvents index 3 and 4) each carry their own overturned
 * MJ review; the play-level review (final pitch) was confirmed. `details` on a
 * play event carries no `playIndex`; the event position is `playEvents[].index`.
 * Fields not shown in those responses are omitted, never invented. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createSandbox, loadScripts, readFixture, REPO_ROOT } from './lib/browser-env.mjs';

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

/* ---------------------------------------------------- FEED_FIELDS contents */

const feedSrc = fs.readFileSync(path.join(REPO_ROOT, 'assets/js/reviews-feed.js'), 'utf8');
const m = feedSrc.match(/var FEED_FIELDS = \[([\s\S]*?)\]\.join/);
const FEED_FIELDS = new Set(m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : []);

check('FEED_FIELDS is found in reviews-feed.js', () => {
  assert.ok(FEED_FIELDS.size > 0, 'FEED_FIELDS array not found');
});

check('FEED_FIELDS lists every reviewDetails child the parser reads', () => {
  for (const key of ['reviewDetails', 'isOverturned', 'inProgress', 'reviewType', 'challengeTeamId']) {
    assert.ok(FEED_FIELDS.has(key), 'missing ' + key);
  }
});

check('FEED_FIELDS lists the play-event position and runner link', () => {
  for (const key of ['playEvents', 'index', 'runners', 'details', 'playIndex', 'isScoringEvent']) {
    assert.ok(FEED_FIELDS.has(key), 'missing ' + key);
  }
});

check('FEED_FIELDS lists the team-name keys used by the challenger fallback', () => {
  for (const key of ['teams', 'teamName', 'clubName', 'shortName', 'name', 'abbreviation']) {
    assert.ok(FEED_FIELDS.has(key), 'missing ' + key);
  }
});

/* ------------------------------------------- pitch-level review extraction */

const ctx = createSandbox();
loadScripts(ctx, ['assets/js/ui.js', 'assets/js/api.js', 'assets/js/reviews.js']);
const Reviews = ctx.Reviews;
Reviews.buildStatusMap(readFixture('game-status.json'));

const pitch = (index, pitchNumber, description, code, extra = {}) => ({
  details: { description, code },
  index,
  pitchNumber,
  isPitch: true,
  type: 'pitch',
  ...extra,
});

const feed = {
  gameData: {
    game: { pk: 825078 },
    teams: {
      away: { id: 119, abbreviation: 'LAD' },
      home: { id: 109, abbreviation: 'AZ' },
    },
  },
  liveData: {
    plays: {
      allPlays: [
        {
          atBatIndex: 26,
          about: { atBatIndex: 26, halfInning: 'top', inning: 4 },
          result: {
            description: 'Miguel Rojas challenged (pitch result), call on the field was confirmed: Miguel Rojas called out on strikes.',
          },
          reviewDetails: { isOverturned: false, inProgress: false, reviewType: 'MJ', challengeTeamId: 119 },
          playEvents: [
            pitch(0, 1, 'Called Strike', 'C'),
            { details: { description: 'Batter Timeout.' }, index: 1, isPitch: false, type: 'action' },
            pitch(2, 2, 'Ball', 'B'),
            pitch(3, 3, 'Ball', 'B', {
              reviewDetails: { isOverturned: true, inProgress: false, reviewType: 'MJ', challengeTeamId: 119 },
            }),
            pitch(4, 4, 'Ball', 'B', {
              reviewDetails: { isOverturned: true, inProgress: false, reviewType: 'MJ', challengeTeamId: 119 },
            }),
            pitch(5, 5, 'Called Strike', 'C'),
            pitch(6, 6, 'Called Strike', 'C'),
          ],
        },
      ],
    },
  },
};

const items = JSON.parse(JSON.stringify(Reviews.extractGameReviews(feed)));

check('three distinct ABS challenges in one plate appearance are all kept', () => {
  assert.equal(items.length, 3, 'got ' + items.length + ' rows');
});

check('every row is classified as an ABS challenge from reviewType MJ', () => {
  for (const it of items) {
    assert.equal(it.category, 'abs');
    assert.equal(it.reviewType, 'MJ');
  }
});

check('outcomes follow isOverturned (two overturned pitches, one confirmed play)', () => {
  const outcomes = items.map((it) => it.outcome).sort();
  assert.deepEqual(outcomes, ['Call Stands / Confirmed', 'Overturned', 'Overturned']);
});

check('pitch-level rows are bound to their playEvents index and pitch number', () => {
  const ev = items.filter((it) => it.reviewScope === 'event')
    .map((it) => it.pitchNumber).sort();
  assert.deepEqual(ev, [3, 4]);
});

check('challenger resolves to the challenging team via challengeTeamId', () => {
  for (const it of items) assert.equal(it.challengerAbbr, 'LAD');
});

console.log('\nfeed-fields-test: ' + passed + ' checks passed');
