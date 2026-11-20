/* ============================================================================
 * Scoreboard page logic
 * ==========================================================================*/

import { API, fetchWithRetry } from './api.js';
import { getTeamLogoUrl, getTeamColor, renderCountDots } from './ui.js';

export class Scoreboard {
  constructor() {
    this.date = new Date().toISOString().split('T')[0];
    this.games = [];
    this.pollInterval = 500;
    this.statusInterval = 125;
    this.pollTimer = null;
    this.statusTimer = null;
  }

  async init() {
    const picker = document.getElementById('date-picker');
    if (picker) {
      picker.value = this.date;
      picker.addEventListener('change', () => this.pickDate(picker.value));
    }
    
    await this.loadGames();
    this.startPolling();
  }

  async loadGames() {
    try {
      const data = await fetchWithRetry(API.getSchedule(this.date));
      this.games = data.dates?.[0]?.games || [];
      this.render();
    } catch (error) {
      console.error('Failed to load games:', error);
    }
  }

  render() {
    const container = document.getElementById('game-list');
    if (!container) return;
    
    container.innerHTML = this.games.map(game => `
      <div class="game-card">
        <div class="game-header">
          <div>
            <img src="${getTeamLogoUrl(game.teams?.away?.team?.id)}" alt="${game.teams?.away?.team?.name}" width="24" height="24">
            <strong>${game.teams?.away?.team?.name || 'Away'}</strong>
            <span>${game.teams?.away?.score || 0}</span>
          </div>
          <div>
            <img src="${getTeamLogoUrl(game.teams?.home?.team?.id)}" alt="${game.teams?.home?.team?.name}" width="24" height="24">
            <strong>${game.teams?.home?.team?.name || 'Home'}</strong>
            <span>${game.teams?.home?.score || 0}</span>
          </div>
          <div class="game-status">${game.status?.detailedState || 'Scheduled'}</div>
        </div>
        <div class="game-details">
          <p><strong>Inning:</strong> ${game.linescore?.currentInning || '—'}</p>
          <p><strong>Count:</strong> ${renderCountDots(game.count || {})}</p>
        </div>
      </div>
    `).join('');
  }

  pickDate(newDate) {
    this.date = newDate;
    this.loadGames();
  }

  prevDay() {
    const d = new Date(this.date);
    d.setDate(d.getDate() - 1);
    this.date = d.toISOString().split('T')[0];
    this.loadGames();
  }

  nextDay() {
    const d = new Date(this.date);
    d.setDate(d.getDate() + 1);
    this.date = d.toISOString().split('T')[0];
    this.loadGames();
  }

  today() {
    this.date = new Date().toISOString().split('T')[0];
    this.loadGames();
  }

  startPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.statusTimer) clearInterval(this.statusTimer);
    
    this.pollTimer = setInterval(() => this.loadGames(), this.pollInterval);
    this.statusTimer = setInterval(() => this.checkStatus(), this.statusInterval);
  }

  async checkStatus() {
    // Status sweep for review ticker
    try {
      const data = await fetchWithRetry(API.getScheduleFields(this.date));
      // Update banner and ticker
      const banner = document.getElementById('banner');
      if (banner) {
        const inReview = data.dates?.[0]?.games?.some(g => g.status?.statusCode?.startsWith('M') || g.status?.statusCode?.startsWith('N') || g.status?.statusCode?.startsWith('IH'));
        banner.style.display = inReview ? 'block' : 'none';
        banner.textContent = inReview ? '🚨 Review in progress!' : '';
      }
    } catch (error) {
      console.error('Status check failed:', error);
    }
  }

  stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.statusTimer) clearInterval(this.statusTimer);
  }
}
