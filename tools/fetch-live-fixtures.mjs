/* Download the official StatsAPI payloads the real-payload test runs against.
 *
 *   node tools/fetch-live-fixtures.mjs
 *
 * Each file in tools/fixtures/live-2026-06-01/ records the exact URL it came
 * from in a `_source` key, so a reviewer can re-fetch and diff it. Run this only
 * when the parsers must be re-checked against a fresh upstream response: the
 * committed copies are what the CI-independent test uses, so the check stays
 * deterministic and needs no network.
 *
 * The 2026-06-01 slate is the one already used throughout this repo's docs and
 * page-render fixtures, which keeps cross-references consistent.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'live-2026-06-01');
const HOST = 'https://statsapi.mlb.com';
const DATE = process.env.LIVE_DATE || '2026-06-01';
const GAME_PK = process.env.LIVE_GAME_PK || '824027';

const FEED_FIELDS = [
  'liveData', 'plays', 'allPlays', 'reviewDetails', 'reviewType',
  'challengeTeamId', 'isOverturned', 'inProgress', 'about', 'atBatIndex', 'inning',
  'halfInning', 'startTime', 'endTime', 'result', 'event', 'eventType', 'description',
  'awayScore', 'homeScore', 'isOut', 'rbi', 'runners', 'details', 'isScoringEvent',
  'movementReason', 'matchup', 'batter', 'pitcher', 'fullName', 'id', 'playEvents',
  'count', 'balls', 'strikes', 'outs', 'pitchNumber', 'isPitch', 'gameData', 'game',
  'pk', 'season', 'gameDate', 'scheduledInnings', 'status', 'detailedState',
  'abstractGameState', 'teams', 'away', 'home', 'abbreviation', 'review', 'used',
  'remaining', 'absChallenges', 'usedSuccessful', 'usedFailed', 'linescore',
  'index', 'teamName', 'clubName', 'shortName', 'name', 'reason', 'player',
].join(',');

const TARGETS = [
  {
    file: 'schedule.json',
    url: HOST + '/api/v1/schedule?sportId=1&date=' + DATE +
      '&hydrate=team,linescore,probablePitcher,decisions,review,flags',
  },
  {
    file: 'schedule-status.json',
    url: HOST + '/api/v1/schedule?sportId=1&date=' + DATE + '&fields=' +
      'dates,games,gamePk,status,abstractGameState,codedGameState,detailedState,' +
      'statusCode,reason,startTimeTBD,abstractGameCode,teams,away,home,team,id,abbreviation',
  },
  {
    file: 'game-status.json',
    url: HOST + '/api/v1/gameStatus',
  },
  {
    file: 'feed-' + GAME_PK + '.json',
    url: HOST + '/api/v1.1/game/' + GAME_PK + '/feed/live?fields=' + FEED_FIELDS,
  },
];

fs.mkdirSync(OUT, { recursive: true });

for (const target of TARGETS) {
  const res = await fetch(target.url);
  if (!res.ok) {
    console.error('HTTP ' + res.status + ' for ' + target.url);
    process.exitCode = 1;
    continue;
  }
  const body = await res.json();
  const payload = (body && typeof body === 'object' && !Array.isArray(body))
    ? Object.assign({ _source: target.url }, body)
    : { _source: target.url, registry: body };
  fs.writeFileSync(path.join(OUT, target.file), JSON.stringify(payload, null, 1) + '\n');
  console.log('wrote ' + target.file + '  <- ' + target.url);
}
