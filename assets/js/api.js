(function (global) {
  'use strict';

  const BASE_V1 = 'https://statsapi.mlb.com/api/v1';
  const BASE_V11 = 'https://statsapi.mlb.com/api/v1.1';

  async function fetchJSON(url) {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) {
      throw new Error(`StatsAPI ${res.status} for ${url}`);
    }
    return res.json();
  }

  async function getSchedule(dateStr) {
    const hydrate = [
      'team',
      'linescore',
      'probablePitcher',
      'decisions',
      'review',
      'flags',
      'gameInfo',
    ].join(',');
    const url = `${BASE_V1}/schedule?sportId=1&date=${encodeURIComponent(dateStr)}&hydrate=${hydrate}`;
    return fetchJSON(url);
  }

  async function getGameLive(gamePk) {
    const url = `${BASE_V11}/game/${encodeURIComponent(gamePk)}/feed/live`;
    return fetchJSON(url);
  }

  global.MLBAPI = {
    BASE_V1,
    BASE_V11,
    fetchJSON,
    getSchedule,
    getGameLive,
  };
})(window);
