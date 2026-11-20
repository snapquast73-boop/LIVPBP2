/* ============================================================================
 * All-games Replay Feed logic (diff helpers + page)
 * ==========================================================================*/

import { parseReview, shouldAlertForReview, visibleInAllFeed } from './reviews.js';

export class ReviewsFeed {
  constructor() {
    this.entries = [];
    this.order = [];
    this.snapshots = {};
    this.irregularities = {};
    this.grace = {};
    this.settled = [];
  }

  addEntry(entry) {
    const key = `${entry.gamePk}:${entry.review.atBatIndex}`;
    if (!this.order.includes(key)) {
      this.order.push(key);
      this.entries.push(entry);
    } else {
      const index = this.order.indexOf(key);
      this.entries[index] = entry;
    }
  }

  render() {
    const container = document.getElementById('feed-container');
    if (!container) return;
    
    container.innerHTML = this.entries
      .filter(e => visibleInAllFeed(e.review))
      .map(e => `
        <div class="feed-entry ${e.review.type.toLowerCase()}">
          <div class="entry-header">
            <strong>${e.review.type} Review</strong>
            <span>${e.review.reason || '—'}</span>
          </div>
          <div class="entry-content">
            ${e.review.description || ''}
          </div>
          <div class="score-tracker">
            <div><strong>Before:</strong> ${e.review.beforeScore || '—'}</div>
            <div><strong>Possible:</strong> ${e.review.possibleScore || '—'}</div>
            <div><strong>Actual:</strong> ${e.review.actualScore || '—'}</div>
          </div>
        </div>
      `).join('');
  }

  // Diff helpers
  diff(newEntries) {
    const added = newEntries.filter(e => !this.order.includes(`${e.gamePk}:${e.review.atBatIndex}`));
    added.forEach(e => this.addEntry(e));
    return added;
  }
}
