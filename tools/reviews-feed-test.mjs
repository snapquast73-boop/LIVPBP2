/* Deterministic, network-free checks for the Replay Feed's persistence and
 * merge helpers (assets/js/feed-log.js + assets/js/reviews.js).
 * Run: node tools/reviews-feed-test.mjs */
import assert from 'node:assert/strict';
import { createSandbox, loadScripts, readFixture } from './lib/browser-env.mjs';

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
loadScripts(ctx, ['assets/js/ui.js', 'assets/js/api.js', 'assets/js/reviews.js', 'assets/js/feed-log.js']);
const FeedLog = ctx.FeedLog;
const Reviews = ctx.Reviews;
const feed = readFixture('feed-824027.json');

function row(id, timestamp, extra) {
  return Object.assign({ id, timestamp, category: 'challenge', label: 'Manager Challenge' }, extra || {});
}

check('normalize drops malformed rows and sorts newest first', () => {
  const log = FeedLog.normalize({
    v: 1,
    date: '2026-06-01',
    entries: [
      row('a', '2026-06-01T10:00:00Z'),
      { id: 42 },
      null,
      row('b', '2026-06-01T12:00:00Z'),
      row('a', '2026-06-01T10:00:00Z'),
    ],
  }, '2026-06-01');
  assert.equal(log.entries.length, 2);
  assert.equal(log.entries[0].id, 'b');
  assert.equal(log.v, 1);
});

check('merge is idempotent and keeps the newest copy of a row', () => {
  const a = FeedLog.normalize({
    v: 1, date: '2026-06-01',
    entries: [row('x', '2026-06-01T10:00:00Z', { outcome: 'Under Review' })],
  }, '2026-06-01');
  const b = FeedLog.normalize({
    v: 1, date: '2026-06-01',
    entries: [row('x', '2026-06-01T10:05:00Z', { outcome: 'Overturned' })],
  }, '2026-06-01');
  const merged = FeedLog.mergeLogs(a, b);
  assert.equal(merged.entries.length, 1);
  assert.equal(merged.entries[0].outcome, 'Overturned');
  const again = FeedLog.mergeLogs(merged, merged);
  assert.equal(again.entries.length, 1);
});

check('a date log round-trips through localStorage', () => {
  const log = FeedLog.normalize({
    v: 1, date: '2026-06-01',
    entries: [row('one', '2026-06-01T11:00:00Z')],
    snapshots: { 824027: { gamePk: 824027, plays: {} } },
  }, '2026-06-01');
  FeedLog.saveDate('2026-06-01', log);
  const back = FeedLog.loadDate('2026-06-01');
  assert.equal(back.entries.length, 1);
  assert.equal(back.entries[0].id, 'one');
  assert.equal(back.snapshots['824027'].gamePk, 824027);
});

check('the row cap is enforced', () => {
  const entries = [];
  for (let i = 0; i < 600; i += 1) entries.push(row('r' + i, '2026-06-01T10:00:' + String(i % 60).padStart(2, '0') + 'Z'));
  const log = FeedLog.normalize({ v: 1, date: '2026-06-01', entries }, '2026-06-01');
  assert.equal(log.entries.length, FeedLog.MAX_ROWS);
});

check('review entries survive a JSON round-trip intact (refresh restores rows)', () => {
  const items = Reviews.extractGameReviews(feed);
  const log = FeedLog.normalize({ v: 1, date: '2026-06-01', entries: items }, '2026-06-01');
  FeedLog.saveDate('2026-06-01', log);
  const restored = FeedLog.loadDate('2026-06-01');
  assert.equal(restored.entries.length, items.length);
  const restoredIds = restored.entries.map((e) => e.id).sort();
  assert.equal(JSON.stringify(restoredIds), JSON.stringify(items.map((e) => e.id).sort()));
});

check('snapshots from one game do not collide with another game', () => {
  const snapA = Reviews.snapshotPlays(feed);
  const feedB = JSON.parse(JSON.stringify(feed));
  feedB.gameData.game.pk = 555;
  const snapB = Reviews.snapshotPlays(feedB);
  const store = {};
  store[String(snapA.gamePk)] = snapA;
  store[String(snapB.gamePk)] = snapB;
  assert.equal(Object.keys(store).length, 2);
  const diff = Reviews.diffSnapshots(store['555'], snapB);
  assert.equal(diff.changes.length, 0);
});

console.log('\nreviews-feed-test: ' + passed + ' checks passed');
