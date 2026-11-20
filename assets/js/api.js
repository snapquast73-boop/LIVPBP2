(function (global) {
  'use strict';

  const BASE_V1 = 'https://statsapi.mlb.com/api/v1';
  const BASE_V11 = 'https://statsapi.mlb.com/api/v1.1';
  const SPORT_ID = 1;

  const MIN_RETRY_MS = 1000;
  const MAX_RETRY_MS = 300000;
  const DEFAULT_RETRY_MS = 60000;

  let rateLimitedUntil = 0;
  let gameStatusCache = null;
  let gameStatusPromise = null;

  function parseRetryAfterMs(headerVal) {
    if (!headerVal) return DEFAULT_RETRY_MS;
    const trimmed = String(headerVal).trim();
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      const ms = Math.round(parseFloat(trimmed) * 1000);
      return Math.min(MAX_RETRY_MS, Math.max(MIN_RETRY_MS, ms));
    }
    const parsedDate = Date.parse(trimmed);
    if (!Number.isNaN(parsedDate)) {
      const ms = parsedDate - Date.now();
      return Math.min(MAX_RETRY_MS, Math.max(MIN_RETRY_MS, ms));
    }
    return DEFAULT_RETRY_MS;
  }

  function getRateLimitRemainingMs() {
    return Math.max(0, rateLimitedUntil - Date.now());
  }

  function resetRateLimit() {
    rateLimitedUntil = 0;
  }

  async function fetchJSON(url, options) {
    const remaining = getRateLimitRemainingMs();
    if (remaining > 0) {
      const secs = Math.ceil(remaining / 1000);
      const err = new Error(`StatsAPI rate-limited (cooling down ${secs}s)`);
      err.status = 429;
      err.retryAfterMs = remaining;
      throw err;
    }

    const fetchFn = (options && options.fetch) || global.fetch;
    const res = await fetchFn(url, { mode: 'cors' });
    if (res.status === 429) {
      const retryHeader = res.headers && typeof res.headers.get === 'function'
        ? res.headers.get('Retry-After')
        : null;
      const waitMs = parseRetryAfterMs(retryHeader);
      rateLimitedUntil = Date.now() + waitMs;
      const err = new Error(`StatsAPI 429 Too Many Requests — pausing ${Math.ceil(waitMs / 1000)}s`);
      err.status = 429;
      err.retryAfterMs = waitMs;
      throw err;
    }
    if (!res.ok) {
      const err = new Error(`StatsAPI ${res.status} for ${url}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  async function getSchedule(dateStr, sportId) {
    const sid = sportId || SPORT_ID;
    const hydrate = [
      'probablePitcher',
      'linescore',
      'decisions',
      'review',
      'team',
    ].join(',');
    const url = `${BASE_V1}/schedule?sportId=${encodeURIComponent(sid)}&date=${encodeURIComponent(dateStr)}&hydrate=${hydrate}`;
    return fetchJSON(url);
  }

  async function getScheduleStatus(dateStr, sportId) {
    const sid = sportId || SPORT_ID;
    const fields = [
      'dates',
      'games',
      'gamePk',
      'season',
      'status',
      'abstractGameState',
      'codedGameState',
      'detailedState',
      'statusCode',
      'reason',
      'startTimeTBD',
      'abstractGameCode',
    ].join(',');
    const url = `${BASE_V1}/schedule?sportId=${encodeURIComponent(sid)}&date=${encodeURIComponent(dateStr)}&fields=${fields}`;
    return fetchJSON(url);
  }

  async function getGameStatus(gamePk) {
    const fields = [
      'gameData',
      'status',
      'abstractGameState',
      'codedGameState',
      'detailedState',
      'statusCode',
      'reason',
      'startTimeTBD',
      'abstractGameCode',
    ].join(',');
    const url = `${BASE_V11}/game/${encodeURIComponent(gamePk)}/feed/live?fields=${fields}`;
    return fetchJSON(url);
  }

  async function getGameStatusRegistry() {
    if (gameStatusCache) return gameStatusCache;
    if (gameStatusPromise) return gameStatusPromise;
    gameStatusPromise = fetchJSON(`${BASE_V1}/gameStatus`)
      .then((list) => {
        if (Array.isArray(list)) gameStatusCache = list;
        return gameStatusCache;
      })
      .catch(() => null)
      .finally(() => { gameStatusPromise = null; });
    return gameStatusPromise;
  }

  async function getPlayByPlay(gamePk, projected) {
    let url = `${BASE_V1}/game/${encodeURIComponent(gamePk)}/playByPlay`;
    if (projected) {
      const fields = [
        'allPlays',
        'currentPlay',
        'atBatIndex',
        'about',
        'inning',
        'halfInning',
        'isTopInning',
        'isComplete',
        'startTime',
        'endTime',
        'result',
        'event',
        'eventType',
        'description',
        'rbi',
        'awayScore',
        'homeScore',
        'isOut',
        'count',
        'balls',
        'strikes',
        'outs',
        'matchup',
        'batter',
        'pitcher',
        'id',
        'fullName',
        'batSide',
        'pitchHand',
        'code',
        'runners',
        'movement',
        'start',
        'end',
        'isOut',
        'details',
        'isScoringEvent',
        'playIndex',
        'movementReason',
        'runner',
        'reviewDetails',
        'isOverturned',
        'inProgress',
        'reviewType',
        'challengeTeamId',
        'additionalReviews',
        'playEvents',
        'index',
        'isPitch',
        'call',
        'type',
        'pitchData',
        'startSpeed',
        'hitData',
        'launchSpeed',
        'launchAngle',
        'totalDistance',
      ].join(',');
      url += `?fields=${fields}`;
    }
    return fetchJSON(url);
  }

  async function getGameLive(gamePk) {
    const pk = encodeURIComponent(gamePk);
    try {
      return await fetchJSON(`${BASE_V11}/game/${pk}/feed/live`);
    } catch (errV11) {
      if (errV11 && errV11.status === 429) throw errV11;
      try {
        return await fetchJSON(`${BASE_V1}/game/${pk}/feed/live`);
      } catch (errV1) {
        if (errV1 && errV1.status === 429) throw errV1;
        // Fallback bundle: playByPlay + boxscore + linescore
        const [plays, boxscore, linescore] = await Promise.all([
          fetchJSON(`${BASE_V1}/game/${pk}/playByPlay`).catch(() => null),
          fetchJSON(`${BASE_V1}/game/${pk}/boxscore`).catch(() => null),
          fetchJSON(`${BASE_V1}/game/${pk}/linescore`).catch(() => null),
        ]);
        if (!plays && !boxscore && !linescore) throw errV11;
        return {
          gamePk: Number(gamePk),
          gameData: {
            game: { pk: Number(gamePk) },
            teams: boxscore && boxscore.teams ? {
              away: boxscore.teams.away && boxscore.teams.away.team,
              home: boxscore.teams.home && boxscore.teams.home.team,
            } : {},
          },
          liveData: {
            plays: plays || {},
            boxscore: boxscore || {},
            linescore: linescore || {},
          },
        };
      }
    }
  }

  async function getPlayerStats(playerId, group, season) {
    const g = group === 'pitching' ? 'pitching' : 'hitting';
    const seasonPart = season ? `&season=${encodeURIComponent(season)}` : '';
    const url = `${BASE_V1}/people/${encodeURIComponent(playerId)}/stats?stats=expectedStatistics,season,statSplits,gameLog&group=${g}&sitCodes=vl,vr${seasonPart}`;
    return fetchJSON(url);
  }

  async function getHeadToHead(batterId, pitcherId) {
    const url = `${BASE_V1}/people/${encodeURIComponent(batterId)}/stats?stats=vsPlayer&group=hitting&opposingPlayerId=${encodeURIComponent(pitcherId)}`;
    return fetchJSON(url);
  }

  function gameFeedUrl(gamePk) {
    return `${BASE_V11}/game/${encodeURIComponent(gamePk)}/feed/live`;
  }

  function scheduleUrl(dateStr, sportId) {
    return `${BASE_V1}/schedule?sportId=${encodeURIComponent(sportId || SPORT_ID)}&date=${encodeURIComponent(dateStr)}`;
  }

  function playerStatsUrl(playerId, group, season) {
    const g = group === 'pitching' ? 'pitching' : 'hitting';
    const seasonPart = season ? `&season=${encodeURIComponent(season)}` : '';
    return `${BASE_V1}/people/${encodeURIComponent(playerId)}/stats?stats=expectedStatistics,season,statSplits,gameLog&group=${g}&sitCodes=vl,vr${seasonPart}`;
  }

  const api = {
    BASE_V1,
    BASE_V11,
    SPORT_ID,
    parseRetryAfterMs,
    getRateLimitRemainingMs,
    resetRateLimit,
    fetchJSON,
    getSchedule,
    getScheduleStatus,
    getGameStatus,
    getGameStatusRegistry,
    getPlayByPlay,
    getGameLive,
    getPlayerStats,
    getHeadToHead,
    gameFeedUrl,
    scheduleUrl,
    playerStatsUrl,
  };

  global.MLBAPI = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
