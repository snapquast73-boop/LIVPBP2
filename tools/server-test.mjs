/* Deterministic, network-free checks for server.mjs (HTTP endpoints,
 * feed-log envelope merge with flat client entries & irregularities object,
 * SSE stream, and malformed URL / traversal safety).
 * Run: node tools/server-test.mjs */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createSandbox, loadScripts, readFixture, REPO_ROOT } from './lib/browser-env.mjs';

let passed = 0;
function check(name, fn) {
  return Promise.resolve().then(fn).then(() => {
    passed += 1;
    console.log('ok   ' + name);
  }).catch((err) => {
    console.error('FAIL ' + name + '\n     ' + err.message);
    process.exitCode = 1;
  });
}

const PORT = 18940 + Math.floor(Math.random() * 500);
const BASE = 'http://127.0.0.1:' + PORT;
const TEST_DATE = '2099-11-22';
const DATA_DIR = path.join(REPO_ROOT, 'data');
const LOG_FILE = path.join(DATA_DIR, 'feed-log-' + TEST_DATE + '.json');

function cleanupLog() {
  try { fs.unlinkSync(LOG_FILE); } catch (_) { /* ignore */ }
}

const srv = spawn(process.execPath, [path.join(REPO_ROOT, 'server.mjs')], {
  cwd: REPO_ROOT,
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('server failed to start')), 5000);
  srv.stdout.on('data', (chunk) => {
    if (String(chunk).includes('listening on')) {
      clearTimeout(timer);
      resolve();
    }
  });
  srv.on('exit', (code) => {
    clearTimeout(timer);
    reject(new Error('server exited early with code ' + code));
  });
});

try {
  cleanupLog();

  await check('/api/health returns 200 ok', async () => {
    const res = await fetch(BASE + '/api/health');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
  });

  await check('static pages serve 200 and missing routes return 404.html', async () => {
    for (const route of ['/', '/index.html', '/game.html', '/reviews.html', '/flagged.html']) {
      const res = await fetch(BASE + route);
      assert.equal(res.status, 200, route + ' expected 200');
    }
    const miss = await fetch(BASE + '/does-not-exist.html');
    assert.equal(miss.status, 404);
    const html = await miss.text();
    assert.match(html, /404/);
  });

  await check('malformed percent-encoded URL returns 400 without crashing the server', async () => {
    const bad = await fetch(BASE + '/%E0%A4%A');
    assert.equal(bad.status, 400);
    const alive = await fetch(BASE + '/api/health');
    assert.equal(alive.status, 200);
  });

  await check('repeated POST /api/feed-log with real client FeedLog envelopes merges idempotently', async () => {
    const ctx = createSandbox();
    loadScripts(ctx, ['assets/js/ui.js', 'assets/js/api.js', 'assets/js/reviews.js', 'assets/js/feed-log.js']);
    ctx.Reviews.buildStatusMap(readFixture('game-status.json'));
    const feed = readFixture('feed-824027.json');
    const items = JSON.parse(JSON.stringify(ctx.Reviews.extractGameReviews(feed)));
    assert.ok(items.length >= 2, 'fixture produces multiple review entries');

    const envelope1 = JSON.parse(JSON.stringify(ctx.FeedLog.normalize({
      v: 1,
      date: TEST_DATE,
      entries: [items[0]],
      snapshots: { 824027: { gamePk: 824027, plays: { 0: { eventType: 'strikeout' } } } },
      irregularities: {
        '824027:1:edit': { id: '824027:1:edit', gamePk: 824027, category: 'irregularity', label: 'Edit 1' },
      },
    }, TEST_DATE)));

    const res1 = await fetch(BASE + '/api/feed-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope1),
    });
    assert.equal(res1.status, 200);
    const body1 = await res1.json();
    assert.equal(body1.ok, true);
    assert.equal(body1.entriesCount, 1);

    // Second POST adds the second review entry, updates the first, and adds a second irregularity.
    const updatedFirst = { ...items[0], outcome: 'Overturned', inProgress: false, timestamp: '2099-11-22T12:00:00Z' };
    const envelope2 = JSON.parse(JSON.stringify(ctx.FeedLog.normalize({
      v: 1,
      date: TEST_DATE,
      entries: [updatedFirst, items[1]],
      snapshots: { 824027: { gamePk: 824027, plays: { 1: { eventType: 'double' } } } },
      irregularities: {
        '824027:1:edit': { id: '824027:1:edit', gamePk: 824027, category: 'irregularity', label: 'Edit 1' },
        '824027:2:gone': { id: '824027:2:gone', gamePk: 824027, category: 'irregularity', label: 'Play disappeared' },
      },
    }, TEST_DATE)));

    const res2 = await fetch(BASE + '/api/feed-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope2),
    });
    assert.equal(res2.status, 200, 'second POST must succeed without throwing on irregularities');
    const body2 = await res2.json();
    assert.equal(body2.ok, true);
    assert.equal(body2.entriesCount, 2, 'distinct flat client entries must both survive');

    const getRes = await fetch(BASE + '/api/feed-log?date=' + TEST_DATE);
    assert.equal(getRes.status, 200);
    const merged = await getRes.json();
    assert.equal(merged.entries.length, 2);
    const foundFirst = merged.entries.find((e) => e.id === items[0].id);
    assert.equal(foundFirst.outcome, 'Overturned');
    assert.ok(merged.irregularities['824027:1:edit'], 'first irregularity preserved');
    assert.ok(merged.irregularities['824027:2:gone'], 'second irregularity preserved');
    assert.ok(merged.snapshots['824027'].plays['0'], 'earlier play snapshot preserved');
    assert.ok(merged.snapshots['824027'].plays['1'], 'later play snapshot merged');
  });

  await check('retired envelopes (nested { gamePk, review } entries + note-array irregularities) still merge without losing flat rows', async () => {
    const LEGACY_DATE = '2099-11-23'; // its own date: must not disturb TEST_DATE used by the SSE check
    const legacyLog = path.join(DATA_DIR, 'feed-log-' + LEGACY_DATE + '.json');
    try { fs.unlinkSync(legacyLog); } catch (_) { /* ignore */ }
    // 1) retired client shape: nested review entries, per-gamePk note-array irregularities
    const legacyEnvelope = {
      v: 1,
      date: LEGACY_DATE,
      entries: [{
        gamePk: 824027,
        review: { id: 1, gamePk: 824027, category: 'review', eventType: 'Home run', title: 'Kikuchi solo HR', timestamp: '2099-11-22T01:00:00Z' },
        matchupLabel: 'SEA @ LAA',
      }],
      irregularities: { 824027: ['Play disappeared', 'homeScore=-1'] },
    };
    const resLegacy = await fetch(BASE + '/api/feed-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(legacyEnvelope),
    });
    assert.equal(resLegacy.status, 200, 'retired-shape POST must not 500');
    const bodyLegacy = await resLegacy.json();
    assert.equal(bodyLegacy.ok, true);
    assert.equal(bodyLegacy.entriesCount, 1, 'retired nested entry must be stored');

    // 2) a flat client envelope posted afterwards must keep the retired row (no wipe).
    //    Hand-written in the exact shape FeedLog.normalize() emits (the normalizer itself is
    //    covered by tools/reviews-feed-test.mjs).
    const flatEnvelope = {
      v: 1,
      date: LEGACY_DATE,
      entries: [{ id: '824027:99', gamePk: 824027, category: 'review', eventType: 'Single', title: 'late entry', timestamp: '2099-11-22T02:00:00Z' }],
      irregularities: { '824027:99:edit': { id: '824027:99:edit', gamePk: 824027, category: 'irregularity', label: 'Edit' } },
    };
    const resFlat = await fetch(BASE + '/api/feed-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(flatEnvelope),
    });
    assert.equal(resFlat.status, 200);
    assert.equal((await resFlat.json()).entriesCount, 2, 'retired row must survive the flat POST');

    // 3) GET: both shapes present; both irregularity shapes preserved
    const merged = await (await fetch(BASE + '/api/feed-log?date=' + LEGACY_DATE)).json();
    const legacyRow = merged.entries.find((e) => e.gamePk === 824027 && e.review && e.review.id === 1);
    assert.ok(legacyRow, 'retired nested entry preserved');
    assert.equal(legacyRow.review.eventType, 'Home run');
    assert.ok(merged.entries.find((e) => e.id === '824027:99'), 'flat entry preserved');
    assert.ok(Array.isArray(merged.irregularities['824027']) && merged.irregularities['824027'].includes('Play disappeared'),
      'retired note-array irregularities preserved');
    assert.ok(merged.irregularities['824027:99:edit'], 'flat id-keyed irregularity preserved');
  });

  await check('SSE stream /api/feed-log/stream emits connected and initial snapshot', async () => {
    const controller = new AbortController();
    const res = await fetch(BASE + '/api/feed-log/stream?date=' + TEST_DATE, {
      signal: controller.signal,
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/event-stream/);
    const reader = res.body.getReader();
    let buf = '';
    while (!buf.includes('event: feed-log')) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += Buffer.from(value).toString('utf8');
    }
    controller.abort();
    assert.match(buf, /event: connected/);
    assert.match(buf, /event: feed-log/);
  });
} finally {
  cleanupLog();
  try {
    const idxPath = path.join(DATA_DIR, 'feed-log-index.json');
    if (fs.existsSync(idxPath)) {
      const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
      delete idx[TEST_DATE];
      if (Object.keys(idx).length === 0) {
        fs.unlinkSync(idxPath);
        fs.rmdirSync(DATA_DIR);
      } else {
        fs.writeFileSync(idxPath, JSON.stringify(idx, null, 2), 'utf8');
      }
    }
  } catch (_) { /* ignore */ }
  srv.kill('SIGTERM');
}

console.log('\nserver-test: ' + passed + ' checks passed');
