/* Deterministic, network-free checks for UI.teamAbbr (assets/js/ui.js).
 *
 *   node tools/ui-labels-test.mjs
 *
 * Why this exists: /api/v1/schedule returns `teams.<side>.team` as
 * { id, name, link } — it has no `abbreviation`, even when the request adds
 * `fields=…,abbreviation` (verified against the live API on 2026-11-20:
 * https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2024-10-30&fields=dates,games,gamePk,teams,away,home,team,id,name,abbreviation
 * → {"team":{"id":119,"name":"Los Angeles Dodgers"}}). Card footers and the
 * "under review" banner therefore have to resolve the club code from the
 * official table, not from the schedule payload.
 */
import assert from 'node:assert/strict';
import { createSandbox, loadScripts } from './lib/browser-env.mjs';

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
loadScripts(ctx, ['assets/js/ui.js']);
const UI = ctx.UI;

/* Copied from GET /api/v1/teams?sportId=1 on 2026-11-20. */
const OFFICIAL_ABBR = {
  108: 'LAA', 109: 'AZ', 110: 'BAL', 111: 'BOS', 112: 'CHC', 113: 'CIN', 114: 'CLE',
  115: 'COL', 116: 'DET', 117: 'HOU', 118: 'KC', 119: 'LAD', 120: 'WSH', 121: 'NYM',
  133: 'ATH', 134: 'PIT', 135: 'SD', 136: 'SEA', 137: 'SF', 138: 'STL', 139: 'TB',
  140: 'TEX', 141: 'TOR', 142: 'MIN', 143: 'PHI', 144: 'ATL', 145: 'CWS', 146: 'MIA',
  147: 'NYY', 158: 'MIL',
};

check('every official club id resolves to its official abbreviation', () => {
  for (const [id, abbr] of Object.entries(OFFICIAL_ABBR)) {
    assert.equal(UI.teamAbbr({ team: { id: Number(id), name: 'Team ' + id } }), abbr,
      'schedule shape failed for team ' + id);
    assert.equal(UI.teamAbbr({ id: Number(id), name: 'Team ' + id }), abbr,
      'feed shape failed for team ' + id);
  }
  assert.equal(Object.keys(UI.TEAM_ABBR).length, 30, 'the table must hold exactly the 30 clubs');
});

check('the table matches the official endpoint value for value', () => {
  for (const [id, abbr] of Object.entries(OFFICIAL_ABBR)) {
    assert.equal(UI.TEAM_ABBR[id], abbr, 'table differs from /api/v1/teams for ' + id);
  }
});

check('a payload abbreviation always wins over the table', () => {
  assert.equal(UI.teamAbbr({ id: 147, name: 'New York Yankees', abbreviation: 'NYY' }), 'NYY');
  assert.equal(UI.teamAbbr({ team: { id: 119, name: 'Los Angeles Dodgers', abbreviation: 'ZZZ' } }), 'ZZZ');
});

check('schedule teams no longer fall back to AWY/HOM', () => {
  const scheduleGame = {
    teams: {
      away: { team: { id: 112, name: 'Chicago Cubs' } },
      home: { team: { id: 119, name: 'Los Angeles Dodgers' } },
    },
  };
  assert.equal(UI.teamAbbr(scheduleGame.teams.away), 'CHC');
  assert.equal(UI.teamAbbr(scheduleGame.teams.home), 'LAD');
});

check('an unknown club id degrades to name initials instead of an invented code', () => {
  assert.equal(UI.teamAbbr({ id: 9999, name: 'Foo Bar' }), 'FB');
  assert.equal(UI.teamAbbr(null), '');
  assert.equal(UI.teamAbbr({ id: 0 }), '');
});

console.log('\nui-labels-test: ' + passed + ' checks passed');
