(function (global) {
  'use strict';

  const PREFIX = 'livpbp_feed_log_v1_';
  const LEGACY_PREFIX = 'livpbp_feed_log_';
  const MAX_DATES = 7;
  const MAX_ROWS = 500;
  const WRITE_COALESCE_MS = 1000;

  let backendStatus = 'unknown'; // 'unknown' | 'available' | 'unavailable'
  let backendProbePromise = null;
  const pendingWrites = new Map(); // dateStr -> { timer, log }

  function isValidDateStr(dateStr) {
    return typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
  }

  function emptyLog(dateStr) {
    return {
      v: 1,
      date: dateStr,
      savedAt: Date.now(),
      entries: [],
      order: [],
      snapshots: {},
      irregularities: {},
      grace: {},
      settled: [],
    };
  }

  function makeEntryKey(entry) {
    if (!entry || !entry.review || typeof entry.review !== 'object') return null;
    const rid = entry.review.id || entry.review.atBatIndex;
    if (rid === undefined || rid === null || rid === '') return null;
    return `${entry.gamePk || ''}:${rid}`;
  }

  function sanitizeLog(raw, dateStr) {
    const base = emptyLog(dateStr);
    if (!raw || typeof raw !== 'object') return base;

    // Support legacy flat array from earlier localStorage format
    if (Array.isArray(raw)) {
      const now = Date.now();
      const valid = raw.filter((row) => row && typeof row === 'object' && typeof row.id === 'string');
      if (valid.length !== raw.length) {
        console.warn('FeedLog: dropped malformed legacy entries for', dateStr);
      }
      base.entries = valid.slice(0, MAX_ROWS).map((r) => ({
        gamePk: r.gamePk || null,
        review: r,
        firstSeen: r.firstSeen || now,
        lastSeen: r.lastSeen || now,
        matchupLabel: r.awayAbbr && r.homeAbbr ? `${r.awayAbbr} @ ${r.homeAbbr}` : null,
      }));
      base.order = base.entries.map(makeEntryKey).filter(Boolean);
      return base;
    }

    if (raw.v !== 1) {
      console.warn('FeedLog: unsupported log version for', dateStr);
      return base;
    }

    const entries = [];
    if (Array.isArray(raw.entries)) {
      raw.entries.forEach((e) => {
        if (e && typeof e === 'object' && e.review && typeof e.review === 'object' && typeof e.review.id === 'string') {
          entries.push(e);
        } else {
          console.warn('FeedLog: dropped malformed entry for', dateStr);
        }
      });
    }

    base.savedAt = typeof raw.savedAt === 'number' ? raw.savedAt : Date.now();
    base.entries = entries.slice(0, MAX_ROWS);
    base.order = Array.isArray(raw.order)
      ? raw.order.filter((k) => typeof k === 'string')
      : base.entries.map(makeEntryKey).filter(Boolean);
    base.snapshots = (raw.snapshots && typeof raw.snapshots === 'object' && !Array.isArray(raw.snapshots))
      ? raw.snapshots
      : {};
    base.irregularities = (raw.irregularities && typeof raw.irregularities === 'object' && !Array.isArray(raw.irregularities))
      ? raw.irregularities
      : {};
    base.grace = (raw.grace && typeof raw.grace === 'object' && !Array.isArray(raw.grace))
      ? raw.grace
      : {};
    base.settled = Array.isArray(raw.settled) ? raw.settled : [];
    return base;
  }

  function mergeLogs(existingRaw, incomingRaw, dateStr) {
    const existing = sanitizeLog(existingRaw, dateStr);
    const incoming = sanitizeLog(incomingRaw, dateStr);
    const now = Date.now();

    const entryMap = new Map();
    const orderList = [];

    existing.entries.forEach((e) => {
      const k = makeEntryKey(e);
      if (!k) return;
      entryMap.set(k, e);
      if (!orderList.includes(k)) orderList.push(k);
    });

    incoming.entries.forEach((e) => {
      const k = makeEntryKey(e);
      if (!k) return;
      const prev = entryMap.get(k);
      if (!prev) {
        entryMap.set(k, e);
        if (!orderList.includes(k)) orderList.push(k);
      } else {
        const mergedReview = { ...prev.review, ...e.review };
        // Preserve earliest observed before-review score if already captured
        if (prev.review && prev.review.beforeScore && !e.review.beforeScore) {
          mergedReview.beforeScore = prev.review.beforeScore;
        }
        if (prev.review && prev.review.possibleScore && !e.review.possibleScore) {
          mergedReview.possibleScore = prev.review.possibleScore;
        }
        if (prev.review && Array.isArray(prev.review.history) &&
          (!Array.isArray(e.review.history) || e.review.history.length < prev.review.history.length)) {
          mergedReview.history = prev.review.history;
        }
        entryMap.set(k, {
          gamePk: e.gamePk || prev.gamePk,
          review: mergedReview,
          firstSeen: Math.min(prev.firstSeen || now, e.firstSeen || now),
          lastSeen: Math.max(prev.lastSeen || 0, e.lastSeen || 0, now),
          matchupLabel: e.matchupLabel || prev.matchupLabel || null,
        });
      }
    });

    const mergedEntries = orderList
      .map((k) => entryMap.get(k))
      .filter(Boolean)
      .slice(-MAX_ROWS);

    const mergedSnapshots = { ...existing.snapshots };
    Object.keys(incoming.snapshots).forEach((gpk) => {
      mergedSnapshots[gpk] = {
        ...(mergedSnapshots[gpk] || {}),
        ...(incoming.snapshots[gpk] || {}),
      };
    });

    const mergedIrregularities = { ...existing.irregularities };
    Object.keys(incoming.irregularities).forEach((gpk) => {
      const prevNotes = Array.isArray(mergedIrregularities[gpk]) ? mergedIrregularities[gpk] : [];
      const newNotes = Array.isArray(incoming.irregularities[gpk]) ? incoming.irregularities[gpk] : [];
      const combined = [...prevNotes];
      newNotes.forEach((n) => {
        if (typeof n === 'string' && !combined.includes(n)) combined.push(n);
      });
      mergedIrregularities[gpk] = combined.slice(-30);
    });

    return {
      v: 1,
      date: dateStr,
      savedAt: now,
      entries: mergedEntries,
      order: mergedEntries.map(makeEntryKey).filter(Boolean),
      snapshots: mergedSnapshots,
      irregularities: mergedIrregularities,
      grace: { ...existing.grace, ...incoming.grace },
      settled: Array.from(new Set([...existing.settled, ...incoming.settled])),
    };
  }

  function hasStorage() {
    try {
      return typeof global.localStorage !== 'undefined' && global.localStorage !== null;
    } catch (_) {
      return false;
    }
  }

  function pruneOldDates() {
    if (!hasStorage()) return;
    const keys = [];
    for (let i = 0; i < global.localStorage.length; i += 1) {
      const k = global.localStorage.key(i);
      if (k && (k.startsWith(PREFIX) || k.startsWith(LEGACY_PREFIX))) keys.push(k);
    }
    const v1Keys = keys.filter((k) => k.startsWith(PREFIX)).sort().reverse();
    v1Keys.slice(MAX_DATES).forEach((k) => global.localStorage.removeItem(k));
    const legacyKeys = keys.filter((k) => k.startsWith(LEGACY_PREFIX) && !k.startsWith(PREFIX)).sort().reverse();
    legacyKeys.slice(MAX_DATES).forEach((k) => global.localStorage.removeItem(k));
  }

  function loadLog(dateStr) {
    if (!isValidDateStr(dateStr)) return emptyLog(dateStr || '');
    if (!hasStorage()) return emptyLog(dateStr);
    try {
      const raw = global.localStorage.getItem(PREFIX + dateStr);
      if (raw) return sanitizeLog(JSON.parse(raw), dateStr);
      const legacy = global.localStorage.getItem(LEGACY_PREFIX + dateStr);
      if (legacy) return sanitizeLog(JSON.parse(legacy), dateStr);
      return emptyLog(dateStr);
    } catch (err) {
      console.warn('FeedLog: failed to parse local log for', dateStr, err);
      return emptyLog(dateStr);
    }
  }

  function saveLocalLog(dateStr, log) {
    if (!isValidDateStr(dateStr) || !hasStorage()) return;
    try {
      const clean = sanitizeLog(log, dateStr);
      global.localStorage.setItem(PREFIX + dateStr, JSON.stringify(clean));
      pruneOldDates();
    } catch (err) {
      console.warn('FeedLog: failed to save local log for', dateStr, err);
    }
  }

  async function checkBackend() {
    if (backendStatus !== 'unknown') return backendStatus === 'available';
    if (typeof global.location === 'undefined' || global.location.protocol === 'file:' || typeof global.fetch !== 'function') {
      backendStatus = 'unavailable';
      return false;
    }
    if (backendProbePromise) return backendProbePromise;
    backendProbePromise = global.fetch('/api/health', { cache: 'no-store' })
      .then((res) => {
        const ct = (res.headers && res.headers.get('content-type')) || '';
        backendStatus = (res.ok && ct.includes('application/json')) ? 'available' : 'unavailable';
        return backendStatus === 'available';
      })
      .catch(() => {
        backendStatus = 'unavailable';
        return false;
      })
      .finally(() => { backendProbePromise = null; });
    return backendProbePromise;
  }

  async function fetchRemoteLog(dateStr) {
    if (!isValidDateStr(dateStr)) return loadLog(dateStr);
    const ok = await checkBackend();
    const local = loadLog(dateStr);
    if (!ok) return local;
    try {
      const res = await global.fetch(`/api/feed-log?date=${encodeURIComponent(dateStr)}`, { cache: 'no-store' });
      if (!res.ok) return local;
      const remote = await res.json();
      const merged = mergeLogs(local, remote, dateStr);
      saveLocalLog(dateStr, merged);
      return merged;
    } catch (_) {
      return local;
    }
  }

  function saveLog(dateStr, log) {
    if (!isValidDateStr(dateStr)) return;
    const local = loadLog(dateStr);
    const merged = mergeLogs(local, log, dateStr);
    saveLocalLog(dateStr, merged);

    // Coalesce backend writes to <= 1/s when persistence server is present
    const existingPending = pendingWrites.get(dateStr);
    if (existingPending) {
      existingPending.log = merged;
      return;
    }
    const slot = { log: merged, timer: null };
    slot.timer = setTimeout(async () => {
      pendingWrites.delete(dateStr);
      const ok = await checkBackend();
      if (!ok) return;
      try {
        await global.fetch('/api/feed-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(slot.log),
        });
      } catch (_) {
        // Silent fallback on static hosting / offline
      }
    }, WRITE_COALESCE_MS);
    pendingWrites.set(dateStr, slot);
  }

  function subscribe(dateStr, onUpdate) {
    let es = null;
    let closed = false;
    if (!isValidDateStr(dateStr) || typeof global.EventSource !== 'function') {
      return () => {};
    }
    checkBackend().then((ok) => {
      if (!ok || closed) return;
      try {
        es = new global.EventSource(`/api/feed-log/stream?date=${encodeURIComponent(dateStr)}`);
        es.addEventListener('feed-log', (ev) => {
          try {
            const incoming = JSON.parse(ev.data);
            const merged = mergeLogs(loadLog(dateStr), incoming, dateStr);
            saveLocalLog(dateStr, merged);
            if (typeof onUpdate === 'function') onUpdate(merged);
          } catch (err) {
            console.warn('FeedLog: malformed SSE payload', err);
          }
        });
        es.onerror = () => {
          // EventSource auto-reconnects using server retry hint (3s)
        };
      } catch (_) {
        // Ignore if EventSource fails
      }
    });
    return () => {
      closed = true;
      if (es) es.close();
    };
  }

  // Backward-compatible flat row helpers
  function loadDate(dateStr) {
    const log = loadLog(dateStr);
    return log.entries.map((e) => e.review).filter(Boolean);
  }

  function saveDate(dateStr, rows) {
    if (!isValidDateStr(dateStr) || !Array.isArray(rows)) return;
    const now = Date.now();
    const existing = loadLog(dateStr);
    const entries = rows.slice(0, MAX_ROWS).map((r) => ({
      gamePk: r.gamePk || null,
      review: r,
      firstSeen: r.firstSeen || now,
      lastSeen: r.lastSeen || now,
      matchupLabel: r.awayAbbr && r.homeAbbr ? `${r.awayAbbr} @ ${r.homeAbbr}` : null,
    }));
    saveLog(dateStr, {
      ...existing,
      date: dateStr,
      savedAt: now,
      entries,
      order: entries.map(makeEntryKey).filter(Boolean),
    });
  }

  function getEntriesForGame(dateStr, gamePk) {
    const log = loadLog(dateStr);
    const pkStr = String(gamePk);
    return log.entries
      .filter((e) => String(e.gamePk) === pkStr && e.review)
      .map((e) => e.review);
  }

  function getScoringChangesForGame(dateStr, gamePk) {
    return getEntriesForGame(dateStr, gamePk).filter((r) => r.category === 'scoring_change');
  }

  function resetBackendCheck() {
    backendStatus = 'unknown';
    backendProbePromise = null;
  }

  const feedLog = {
    emptyLog,
    sanitizeLog,
    mergeLogs,
    loadLog,
    saveLog,
    fetchRemoteLog,
    subscribe,
    loadDate,
    saveDate,
    getEntriesForGame,
    getScoringChangesForGame,
    checkBackend,
    resetBackendCheck,
  };

  global.FeedLog = feedLog;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = feedLog;
  }
})(typeof window !== 'undefined' ? window : globalThis);
