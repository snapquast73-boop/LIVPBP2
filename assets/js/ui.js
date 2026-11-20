/* ============================================================================
 * Shared UI: team logos, colors, count dots, runners diamond
 * ==========================================================================*/

export const TEAM_COLORS = {
  // MLB team colors (sample, can be expanded)
  109: '#e03131', // Angels
  110: '#000000', // Astros
  111: '#000080', // Athletics
  112: '#e03131', // Blue Jays
  113: '#000080', // Braves
  114: '#000080', // Brewers
  115: '#e03131', // Cardinals
  116: '#000080', // Cubs
  117: '#e03131', // Diamondbacks
  118: '#000080', // Dodgers
  119: '#e03131', // Giants
  120: '#000080', // Indians
  121: '#e03131', // Mariners
  122: '#000080', // Marlins
  123: '#e03131', // Mets
  124: '#000080', // Nationals
  125: '#e03131', // Orioles
  126: '#000080', // Padres
  127: '#e03131', // Phillies
  128: '#000080', // Pirates
  129: '#e03131', // Rangers
  130: '#000080', // Rays
  131: '#e03131', // Red Sox
  133: '#000080', // Rockies
  134: '#e03131', // Royals
  135: '#000080', // Tigers
  136: '#e03131', // Twins
  137: '#000080', // White Sox
  138: '#e03131', // Yankees
  139: '#000080', // Reds
  140: '#e03131', // Guardians
  141: '#000080', // Rockies
  142: '#e03131', // Tigers
  143: '#000080', // Twins
  144: '#e03131', // White Sox
  145: '#000080', // Yankees
  146: '#e03131', // Reds
  147: '#000080', // Guardians
  148: '#e03131', // Rockies
  149: '#000080', // Tigers
  150: '#e03131', // Twins
  151: '#000080', // White Sox
  152: '#e03131', // Yankees
  153: '#000080', // Reds
  154: '#e03131', // Guardians
  155: '#000080', // Rockies
  156: '#e03131', // Tigers
  157: '#000080', // Twins
  158: '#e03131', // White Sox
  159: '#000080', // Yankees
  160: '#e03131', // Reds
  161: '#000080', // Guardians
  162: '#e03131', // Rockies
};

export function getTeamLogoUrl(teamId) {
  return `https://www.mlbstatic.com/team-logos/team-cap-on-dark/${teamId}.svg`;
}

export function getTeamColor(teamId) {
  return TEAM_COLORS[teamId] || '#e03131';
}

export function renderCountDots(count) {
  const balls = count.balls || 0;
  const strikes = count.strikes || 0;
  const outs = count.outs || 0;
  
  return `
    <div class="count-dots">
      <span class="balls">${'●'.repeat(balls)}${'○'.repeat(4 - balls)}</span>
      <span class="strikes">${'●'.repeat(strikes)}${'○'.repeat(3 - strikes)}</span>
      <span class="outs">${'●'.repeat(outs)}${'○'.repeat(3 - outs)}</span>
    </div>
  `;
}

export function renderRunnersDiamond(runners) {
  const on1 = runners?.first || false;
  const on2 = runners?.second || false;
  const on3 = runners?.third || false;
  
  return `
    <div class="runners-diamond">
      <span class="runner-1 ${on1 ? 'active' : ''}">1</span>
      <span class="runner-2 ${on2 ? 'active' : ''}">2</span>
      <span class="runner-3 ${on3 ? 'active' : ''}">3</span>
    </div>
  `;
}

export function createChip(text, type = 'default') {
  const className = `chip chip-${type}`;
  return `<span class="${className}">${text}</span>`;
}
