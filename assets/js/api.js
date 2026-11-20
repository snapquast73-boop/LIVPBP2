/* ============================================================================
 * MLB StatsAPI client (fetch, retry, fallbacks, formatters)
 *
 * SPORT_ID = 1 (MLB). Minor-league IDs (11-14) also work.
 * ==========================================================================*/

const SPORT_ID = 1; // MLB
const BASE_URL = 'https://statsapi.mlb.com/api/v1';
const LIVE_BASE_URL = 'https://statsapi.mlb.com/api/v1.1';

export const API = {
  // Games for a date
  getSchedule: (date) => `${BASE_URL}/schedule?sportId=${SPORT_ID}&date=${date}&hydrate=probablePitcher,linescore,decisions,review`,
  
  // Review status for whole slate
  getScheduleFields: (date) => `${BASE_URL}/schedule?sportId=${SPORT_ID}&date=${date}&fields=dates,games,gamePk,season,status,abstractGameState,codedGameState,detailedState,statusCode,reason,startTimeTBD,abstractGameCode`,
  
  // Review status for one game
  getGameStatusFields: (gamePk) => `${LIVE_BASE_URL}/game/${gamePk}/feed/live?fields=gameData,status,abstractGameState,codedGameState,detailedState,statusCode,reason,startTimeTBD,abstractGameCode`,
  
  // Official game status registry
  getGameStatusRegistry: () => `${BASE_URL}/gameStatus`,
  
  // Full game state
  getGameFeed: (gamePk) => `${LIVE_BASE_URL}/game/${gamePk}/feed/live`,
  
  // Fallback bundle
  getPlayByPlay: (gamePk) => `${LIVE_BASE_URL}/game/${gamePk}/playByPlay`,
  getBoxscore: (gamePk) => `${LIVE_BASE_URL}/game/${gamePk}/boxscore`,
  getLinescore: (gamePk) => `${LIVE_BASE_URL}/game/${gamePk}/linescore`,
  
  // Team logos
  getTeamLogo: (teamId) => `https://www.mlbstatic.com/team-logos/team-cap-on-dark/${teamId}.svg`,
  
  // Player headshots
  getPlayerHeadshot: (playerId) => `https://img.mlbstatic.com/mlb-photos/image/upload/.../v1/people/${playerId}/headshot/67/current`,
  
  // Player stats
  getPlayerStats: (playerId, season, group = 'hitting') => 
    `${BASE_URL}/people/${playerId}/stats?stats=expectedStatistics,season,statSplits,gameLog&group=${group}&sitCodes=vl,vr&season=${season}`,
  
  // Head-to-head
  getVsStats: (batterId, pitcherId, season) =>
    `${BASE_URL}/people/${batterId}/stats?stats=vsPlayer&group=hitting&opposingPlayerId=${pitcherId}&season=${season}`,
};

// Fetch with retry and fallback
export async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          continue;
        }
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

// Formatters
export function formatScore(score) {
  return score !== null ? score : '—';
}

export function formatInning(inning, state) {
  if (!inning) return '—';
  const suffix = state === 'top' ? '▲' : state === 'bottom' ? '▼' : '';
  return `${suffix} ${inning}`;
}
