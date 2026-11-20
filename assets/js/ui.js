(function (global) {
  'use strict';

  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function shiftDate(dateStr, deltaDays) {
    const parts = dateStr.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2] + deltaDays);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatDateLabel(dateStr) {
    const parts = dateStr.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function formatTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function teamLogoUrl(teamId) {
    if (!teamId) return '';
    return `https://www.mlbstatic.com/team-logos/${teamId}.svg`;
  }

  /* Official review / challenge detection.
   * The MLB StatsAPI status registry (GET https://statsapi.mlb.com/api/v1/gameStatus)
   * marks a game under review with codedGameState 'M' (manager challenges, incl.
   * MJ/NJ pitch-result challenges), 'N' (umpire reviews / pitch-result challenges)
   * and the statusCode 'IH' (Instant Replay). See the official registry. */
  function isReviewInProgress(status) {
    if (!status || typeof status !== 'object') return false;
    const coded = status.codedGameState;
    const code = status.statusCode;
    return coded === 'M' || coded === 'N' || code === 'IH';
  }

  function reviewStatusLabel(status) {
    if (!status) return '';
    return status.detailedState || status.statusCode || '';
  }

  global.UI = {
    esc,
    todayStr,
    shiftDate,
    formatDateLabel,
    formatTime,
    teamLogoUrl,
    isReviewInProgress,
    reviewStatusLabel,
  };
})(window);
