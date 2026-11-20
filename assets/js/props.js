/* ============================================================================
 * Two-sided hit model, stat cache, Props & Matchup tab
 * ==========================================================================*/

export class HitForecast {
  constructor() {
    this.cache = new Map();
  }

  // Log5 model implementation
  calculatePerPA(batterStats, pitcherStats, count = { balls: 0, strikes: 0 }) {
    const leagueBaseline = 0.245;
    
    // Simplified log5 calculation
    const batterRate = batterStats?.expectedStatistics?.avg || leagueBaseline;
    const pitcherRate = pitcherStats?.expectedStatistics?.avg || leagueBaseline;
    
    // Log5 formula: (A * (1 - B)) / (A * (1 - B) + B * (1 - A))
    const numerator = batterRate * (1 - pitcherRate);
    const denominator = numerator + pitcherRate * (1 - batterRate);
    
    let baseRate = denominator > 0 ? numerator / denominator : leagueBaseline;
    
    // Count adjustment
    const balls = count.balls || 0;
    const strikes = count.strikes || 0;
    
    if (balls === 3 && strikes < 2) baseRate *= 1.1; // 3-ball factor
    else if (strikes === 2) baseRate *= 0.8; // 2-strike factor
    
    // Clamp
    return Math.max(0.13, Math.min(0.62, baseRate));
  }

  calculateNPA(perPA, remainingPAs) {
    // 1 - (1 - perPA)^remainingPAs
    return 1 - Math.pow(1 - perPA, remainingPAs);
  }

  getMatchupTier(rate) {
    if (rate >= 0.50) return 'Elite';
    if (rate >= 0.35) return 'Favorable';
    if (rate >= 0.25) return 'Neutral';
    if (rate >= 0.18) return 'Tough';
    return 'Pitcher\'s edge';
  }
}
