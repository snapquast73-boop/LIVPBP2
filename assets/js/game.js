/* ============================================================================
 * Game page logic (live "at bat" module, linescore, box, PBP)
 * ==========================================================================*/

import { API, fetchWithRetry } from './api.js';
import { getTeamLogoUrl, getTeamColor, renderCountDots, renderRunnersDiamond, createChip } from './ui.js';
import { HitForecast } from './props.js';

export class GamePage {
  constructor(gamePk) {
    this.gamePk = gamePk;
    this.forecast = new HitForecast();
    this.pollInterval = 500;
    this.statusInterval = 250; // In-review probe
    this.pollTimer = null;
    this.statusTimer = null;
    this.currentPlay = null;
  }

  async init() {
    await this.loadGame();
    this.startPolling();
  }

  async loadGame() {
    try {
      const data = await fetchWithRetry(API.getGameFeed(this.gamePk));
      this.render(data);
    } catch (error) {
      console.error('Failed to load game:', error);
    }
  }

  render(data) {
    const gameData = data.gameData || {};
    const liveData = data.liveData || {};
    
    // At-bat card
    const atBatCard = document.getElementById('at-bat-card');
    if (atBatCard) {
      const currentPlay = liveData.plays?.currentPlay || {};
      const batter = currentPlay.matchup?.batter || {};
      const pitcher = currentPlay.matchup?.pitcher || {};
      
      const perPA = this.forecast.calculatePerPA(batter.stats || {}, pitcher.stats || {}, currentPlay.count || {});
      const tier = this.forecast.getMatchupTier(perPA);
      
      atBatCard.innerHTML = `
        <div class="at-bat-header">
          <h3>${batter.fullName || 'Batter'} vs ${pitcher.fullName || 'Pitcher'}</h3>
          <span class="tier">${tier}</span>
        </div>
        <div class="count-section">
          ${renderCountDots(currentPlay.count || {})}
          ${renderRunnersDiamond(currentPlay.runners || {})}
        </div>
        <div class="forecast-section">
          <p><strong>Hit probability (this PA):</strong> ${(perPA * 100).toFixed(1)}%</p>
          <div class="forecast-bar">
            <div class="forecast-fill" style="width: ${perPA * 100}%"></div>
          </div>
        </div>
      `;
    }
    
    // Linescore
    const linescoreTable = document.getElementById('linescore-table');
    if (linescoreTable) {
      const linescore = liveData.linescore || {};
      linescoreTable.innerHTML = `
        <thead>
          <tr>
            <th>Team</th>
            ${linescore.innings?.map(i => `<th>${i.num}</th>`).join('') || ''}
            <th>R</th>
            <th>H</th>
            <th>E</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${gameData.teams?.away?.team?.name || 'Away'}</td>
            ${linescore.innings?.map(i => `<td>${i.away?.runs || 0}</td>`).join('') || ''}
            <td>${linescore.teams?.away?.runs || 0}</td>
            <td>${linescore.teams?.away?.hits || 0}</td>
            <td>${linescore.teams?.away?.errors || 0}</td>
          </tr>
          <tr>
            <td>${gameData.teams?.home?.team?.name || 'Home'}</td>
            ${linescore.innings?.map(i => `<td>${i.home?.runs || 0}</td>`).join('') || ''}
            <td>${linescore.teams?.home?.runs || 0}</td>
            <td>${linescore.teams?.home?.hits || 0}</td>
            <td>${linescore.teams?.home?.errors || 0}</td>
          </tr>
        </tbody>
      `;
    }
    
    // Box score
    const boxscoreContainer = document.getElementById('boxscore-container');
    if (boxscoreContainer) {
      const boxscore = liveData.boxscore || {};
      // Simplified rendering
      boxscoreContainer.innerHTML = `
        <h3>Box Score</h3>
        <div class="boxscore-teams">
          <div>
            <strong>Away:</strong> ${boxscore.teams?.away?.team?.name || ''}
            <br>
            <small>Hits: ${boxscore.teams?.away?.hits || 0} | Errors: ${boxscore.teams?.away?.errors || 0}</small>
          </div>
          <div>
            <strong>Home:</strong> ${boxscore.teams?.home?.team?.name || ''}
            <br>
            <small>Hits: ${boxscore.teams?.home?.hits || 0} | Errors: ${boxscore.teams?.home?.errors || 0}</small>
          </div>
        </div>
      `;
    }
    
    // Play-by-play
    const pbpContainer = document.getElementById('pbp-container');
    if (pbpContainer) {
      const plays = liveData.plays?.allPlays || [];
      pbpContainer.innerHTML = plays.slice(-10).reverse().map(play => `
        <div class="pbp-entry">
          <strong>${play.result?.description || ''}</strong>
          <small>${play.count?.balls || 0}-${play.count?.strikes || 0}</small>
          ${play.result?.event ? createChip(play.result.event, play.result.event === 'Hit' ? 'hit' : 'out') : ''}
        </div>
      `).join('');
    }
  }

  startPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.statusTimer) clearInterval(this.statusTimer);
    
    this.pollTimer = setInterval(() => this.loadGame(), this.pollInterval);
    this.statusTimer = setInterval(() => this.checkStatus(), this.statusInterval);
  }

  async checkStatus() {
    // Lean probe for review status
    try {
      const data = await fetchWithRetry(API.getGameStatusFields(this.gamePk));
      const status = data.gameData?.status || {};
      const banner = document.getElementById('game-banner');
      
      if (banner) {
        const inReview = status.statusCode?.startsWith('M') || status.statusCode?.startsWith('N') || status.statusCode?.startsWith('IH');
        banner.style.display = inReview ? 'block' : 'none';
        banner.textContent = inReview ? `🚨 ${status.reason || 'Review in progress'}` : '';
      }
    } catch (error) {
      console.error('Status probe failed:', error);
    }
  }

  stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.statusTimer) clearInterval(this.statusTimer);
  }
}
