(function (global) {
  'use strict';

  const PREFIX = 'livpbp_feed_log_';
  const MAX_DATES = 7;
  const MAX_ROWS = 500;

  function loadDate(dateStr) {
    try {
      const raw = localStorage.getItem(PREFIX + dateStr);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        console.warn('FeedLog: malformed log for', dateStr);
        return [];
      }
      return parsed.filter((row) => row && typeof row.id === 'string');
    } catch (err) {
      console.warn('FeedLog: failed to parse log for', dateStr, err);
      return [];
    }
  }

  function saveDate(dateStr, rows) {
    try {
      const trimmed = rows.slice(0, MAX_ROWS);
      localStorage.setItem(PREFIX + dateStr, JSON.stringify(trimmed));
      pruneOldDates();
    } catch (err) {
      console.warn('FeedLog: failed to save log for', dateStr, err);
    }
  }

  function pruneOldDates() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.sort().reverse();
    keys.slice(MAX_DATES).forEach((k) => localStorage.removeItem(k));
  }

  global.FeedLog = {
    loadDate,
    saveDate,
  };
})(window);
