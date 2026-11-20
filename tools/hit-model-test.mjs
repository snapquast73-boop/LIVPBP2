/* Deterministic, network-free checks for the two-sided hit model
 * (assets/js/props.js). Run: node tools/hit-model-test.mjs */
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
loadScripts(ctx, ['assets/js/ui.js', 'assets/js/api.js', 'assets/js/props.js']);
const Props = ctx.Props;

const avgBatter = { rate: 0.275, atBats: 520 };
const avgPitcher = { rate: 0.245, atBats: 600 };

check('league anchor is .245 and the count table is complete', () => {
  assert.equal(Props.LEAGUE, 0.245);
  const keys = Object.keys(Props.COUNT_FACTORS);
  assert.equal(keys.length, 12);
  assert.equal(Props.COUNT_FACTORS['3-1'] > Props.COUNT_FACTORS['0-0'], true);
  assert.equal(Props.COUNT_FACTORS['0-2'] < Props.COUNT_FACTORS['0-0'], true);
});

check('log5 pushes equal above-league inputs above the league rate', () => {
  const p = Props.log5(0.30, 0.30, Props.LEAGUE);
  assert.ok(p > 0.30 && p < 0.40, 'expected 0.30–0.40, got ' + p);
  const mid = Props.log5(Props.LEAGUE, Props.LEAGUE, Props.LEAGUE);
  assert.ok(Math.abs(mid - Props.LEAGUE) < 1e-9, 'league vs league must return the league rate');
});

check('realistic matchup lands in the documented 22–30% band', () => {
  const f = Props.compute({ batter: avgBatter, pitcher: avgPitcher });
  assert.ok(f.perPA >= 0.22 && f.perPA <= 0.30, 'got ' + f.perPA.toFixed(3));
  assert.ok(['Elite matchup', 'Favorable', 'Neutral', 'Tough', "Pitcher's edge"].indexOf(f.tier) >= 0);
});

check('per-PA output never leaves the clamp band', () => {
  const stacked = Props.compute({
    batter: { rate: 0.520, atBats: 500 },
    pitcher: { rate: 0.060, atBats: 500 },
    count: { balls: 3, strikes: 0 },
  });
  assert.ok(stacked.perPA <= 0.78 && stacked.perPA >= 0.10, 'stacked case out of band: ' + stacked.perPA);
  const weak = Props.compute({
    batter: { rate: 0.120, atBats: 300 },
    pitcher: { rate: 0.400, atBats: 500 },
    count: { balls: 0, strikes: 2 },
  });
  assert.ok(weak.perPA >= 0.10, 'weak case below band: ' + weak.perPA);
});

check('hitter-friendly inputs beat pitcher-friendly inputs', () => {
  const good = Props.compute({
    batter: { rate: 0.320, atBats: 550 },
    pitcher: { rate: 0.280, atBats: 600 },
  });
  const bad = Props.compute({
    batter: { rate: 0.190, atBats: 550 },
    pitcher: { rate: 0.190, atBats: 600 },
  });
  assert.ok(good.perPA > bad.perPA, 'strong spot must outrank weak spot');
});

check('a two-strike count lowers the per-PA estimate', () => {
  const neutral = Props.compute({ batter: avgBatter, pitcher: avgPitcher, count: { balls: 0, strikes: 0 } });
  const twoStrike = Props.compute({ batter: avgBatter, pitcher: avgPitcher, count: { balls: 0, strikes: 2 } });
  assert.ok(twoStrike.perPA < neutral.perPA, '0-2 must be below 0-0');
  const hitterCount = Props.compute({ batter: avgBatter, pitcher: avgPitcher, count: { balls: 3, strikes: 1 } });
  assert.ok(hitterCount.perPA > neutral.perPA, '3-1 must be above 0-0');
});

check('≥1-hit projection uses remaining plate appearances', () => {
  const f = Props.compute({ batter: avgBatter, pitcher: avgPitcher, remainingPAs: 4 });
  const expected = 1 - Math.pow(1 - f.perPA, 4);
  assert.ok(Math.abs(f.atLeastOne - expected) < 1e-9);
  assert.ok(f.atLeastOne > f.perPA);
  const final = Props.compute({ batter: avgBatter, pitcher: avgPitcher, remainingPAs: 0 });
  assert.equal(final.atLeastOne, 0);
});

check('missing inputs fall back to the league anchor and say so', () => {
  const f = Props.compute({});
  assert.equal(f.notes.length, 3, 'two season fallbacks + the no-platoon note');
  assert.match(f.notes[0], /Batter season input missing/);
  assert.match(f.notes[1], /Pitcher season input missing/);
  assert.ok(Math.abs(f.perPA - Props.LEAGUE) < 0.02, 'fallback must sit near .245, got ' + f.perPA);
  assert.equal(f.drivers.length >= 2, true);
});

check('platoon split moves the estimate in the right direction', () => {
  const base = Props.compute({ batter: avgBatter, pitcher: avgPitcher });
  const withSplit = Props.compute({
    batter: { ...avgBatter, platoon: { rate: 0.340, atBats: 200 } },
    pitcher: avgPitcher,
  });
  assert.ok(withSplit.perPA > base.perPA, 'a strong platoon split must raise the estimate');
});

check('season rate extraction reads the verified stats shape', () => {
  const payload = {
    stats: [{
      type: { displayName: 'season' },
      group: { displayName: 'hitting' },
      splits: [{ season: '2026', stat: { hits: 144, atBats: 523, avg: '.275', ops: '.889' } }],
    }, {
      type: { displayName: 'statSplits' },
      splits: [
        { season: '2026', stat: { hits: 49, atBats: 179 }, split: { code: 'vl', description: 'vs Left' } },
        { season: '2026', stat: { hits: 95, atBats: 344 }, split: { code: 'vr', description: 'vs Right' } },
      ],
    }],
  };
  const season = Props.seasonRateFromSplits(payload, 'hitting');
  assert.ok(Math.abs(season.rate - 144 / 523) < 1e-9);
  assert.equal(season.atBats, 523);
  const vl = Props.platoonFromSplits(payload, 'vl');
  assert.equal(vl.atBats, 179);
});

check('game-log form ignores the modeled game itself', () => {
  const payload = {
    stats: [{
      type: { displayName: 'gameLog' },
      splits: [
        { date: '2026-05-30', stat: { hits: 2, atBats: 4 } },
        { date: '2026-05-31', stat: { hits: 1, atBats: 4 } },
        { date: '2026-06-01', stat: { hits: 4, atBats: 4 } },
      ],
    }],
  };
  const form = Props.formFromGameLog(payload, '2026-06-01', 8);
  assert.equal(form.atBats, 8, 'the 2026-06-01 game must be excluded');
  assert.ok(Math.abs(form.rate - 3 / 8) < 1e-9);
});

check('remaining-PA estimate is zero for a Final game', () => {
  const feed = readFixture('feed-824027.json');
  assert.equal(Props.estimateRemainingPAs(feed), 0);
});

console.log('\nhit-model-test: ' + passed + ' checks passed');
