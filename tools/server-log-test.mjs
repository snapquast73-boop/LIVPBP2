/* End-to-end check of the optional persistence server (server.mjs).
 *
 *   node tools/server-log-test.mjs
 *
 * Boots the real server on a scratch port with a scratch DATA_DIR, then writes
 * and reads back the log over HTTP. It exists because the merge used to require
 * a nested `entry.review` object that no Replay Feed row has, so every accepted
 * write was silently dropped (`entriesCount: 0`) even though the response said
 * `ok: true`.
 *
 * The server is not used by GitHub Pages — this protects the local/self-hosted
 * mode only.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REPO_ROOT } from './lib/browser-env.mjs';

const PORT = 8177;
const DATE = '2026-06-01';
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'livpbp-log-'));
const base = 'http://127.0.0.1:' + PORT;

// The exact flat shape the Replay Feed writes: dedupe key is `row.id`.
const rowA = {
  id: '824027:21:pitch5:MJ',
  gamePk: 824027,
  category: 'abs',
  label: 'ABS Challenge',
  inProgress: false,
  runsAtRisk: 0,
};
const rowB = {
  id: '824027:89:play:MF',
  gamePk: 824027,
  category: 'challenge',
  label: 'Manager Challenge',
  inProgress: false,
  runsAtRisk: 0,
};

let passed = 0;
const failures = [];
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

function startServer() {
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: REPO_ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  return { child, log: () => out };
}

async function waitForServer(handle, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(base + '/api/health');
      if (res.ok) return;
    } catch (err) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start:\n' + handle.log());
}

async function post(entries) {
  const res = await fetch(base + '/api/feed-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ v: 1, date: DATE, entries }),
  });
  assert.equal(res.status, 200, 'POST /api/feed-log answers 200');
  return res.json();
}

async function get() {
  const res = await fetch(base + '/api/feed-log?date=' + DATE);
  assert.equal(res.status, 200, 'GET /api/feed-log answers 200');
  return res.json();
}

let handle = startServer();
await waitForServer(handle);

await run('the server stores the flat rows the Replay Feed actually writes', async () => {
  const saved = await post([rowA, rowB]);
  assert.equal(saved.ok, true);
  assert.equal(saved.entriesCount, 2, 'both rows are stored, not dropped');
  const log = await get();
  assert.equal(log.entries.length, 2);
  assert.deepEqual(log.entries.map((e) => e.id).sort(), [rowA.id, rowB.id].sort());
});

await run('re-posting the same id updates the row instead of duplicating it', async () => {
  await post([{ ...rowA, inProgress: true }]);
  const log = await get();
  assert.equal(log.entries.length, 2, 'still two rows');
  const updated = log.entries.find((e) => e.id === rowA.id);
  assert.equal(updated.inProgress, true, 'the newer observation wins');
  assert.equal(updated.label, 'ABS Challenge', 'a sparse update does not blank existing fields');
});

await run('the log survives a server restart', async () => {
  handle.child.kill('SIGTERM');
  await new Promise((r) => handle.child.once('exit', r));
  handle = startServer();
  await waitForServer(handle);
  const log = await get();
  assert.equal(log.entries.length, 2, 'rows are read back from disk');
});

await run('a legacy nested-shape row still merges', async () => {
  const legacy = { gamePk: 824027, review: { id: 'legacy-1', inProgress: false } };
  const saved = await post([legacy]);
  assert.equal(saved.entriesCount, 3, 'the older shape is accepted, not discarded');
});

handle.child.kill('SIGTERM');
await new Promise((r) => handle.child.once('exit', r));
fs.rmSync(dataDir, { recursive: true, force: true });

console.log('\nserver-log-test: ' + passed + ' checks passed, ' + failures.length + ' failed');
if (failures.length) process.exitCode = 1;
