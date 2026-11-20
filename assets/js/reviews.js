/* ============================================================================
 * Challenge & replay review parser (Manager, Crew Chief, ABS)
 * ==========================================================================*/

export const REVIEW_TYPES = {
  MANAGER: 'MA', // Manager challenge
  CREW_CHIEF: 'MF', // Crew chief review
  UMPIRE: 'NH', // Umpire review
  ABS: 'MJ', // ABS pitch challenge
  BOUNDARY: 'NH', // Boundary call
};

export function parseReview(reviewDetails) {
  const code = reviewDetails?.code || '';
  const type = Object.keys(REVIEW_TYPES).find(k => REVIEW_TYPES[k] === code) || 'UNKNOWN';
  
  return {
    type,
    code,
    reason: reviewDetails?.reason || '',
    outcome: reviewDetails?.outcome || '',
    description: reviewDetails?.description || '',
    atBatIndex: reviewDetails?.atBatIndex || 0,
    gamePk: reviewDetails?.gamePk || 0,
    firstSeen: Date.now(),
    lastSeen: Date.now(),
  };
}

export function shouldAlertForReview(review) {
  // All types alert except UNKNOWN
  return review.type !== 'UNKNOWN';
}

export function visibleInAllFeed(review) {
  // All types visible in All feed
  return review.type !== 'UNKNOWN';
}

export function getChallengeCounters(gameData) {
  const away = gameData?.review?.away || {};
  const home = gameData?.review?.home || {};
  
  const absAway = gameData?.absChallenges?.away || {};
  const absHome = gameData?.absChallenges?.home || {};
  
  return {
    manager: {
      away: { used: away.used || 0, remaining: away.remaining || 0 },
      home: { used: home.used || 0, remaining: home.remaining || 0 },
    },
    abs: {
      away: { 
        usedSuccessful: absAway.usedSuccessful || 0,
        usedFailed: absAway.usedFailed || 0,
        remaining: absAway.remaining || 0,
      },
      home: {
        usedSuccessful: absHome.usedSuccessful || 0,
        usedFailed: absHome.usedFailed || 0,
        remaining: absHome.remaining || 0,
      },
    },
  };
}
