(function (global) {
  'use strict';

  const LIVE_POLL_MS = 5000;
  const REVIEW_POLL_MS = 1500;
  const IDLE_POLL_MS = 30000;
  const FETCH_CONCURRENCY = 6;
  const CHIME_COOLDOWN_MS = 2500;

  let currentDate = UI.todayStr();
  let currentTab = 'all';
  let feedLog = null;
  let activeGamesInReview = []; // [{ gamePk, awayAbbr, homeAbbr, meta, counterSummary }]
  let prevCountersByGame = new Map(); // gamePk -> counters
  let alertedIds = new Set();
  let notifiedRiskIds = new Set();
  let initializedAlertBaseline = false;
  let lastChimeAt = 0;
  let audioCtx = null;

  let soundOn = localStorage.getItem('livpbp_sound') === '1';
  let notifyOn = localStorage.getItem('livpbp_notify') === '1';

  let pollTimer = null;
  let statusTimer = null;
  let countdownTimer = null;
  let nextPollAt = 0;
  let latestRequest = 0;
  let lastGames = [];
  let unsubscribeFeedLog = null;

  function init() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('date') && /^\d{4}-\d{2}-\d{2}$/.test(params.get('date'))) {
      currentDate = params.get('date');
    }

    MLBAPI.getGameStatusRegistry().then((list) => {
      if (list) UI.registerGameStatusList(list);
    });

    feedLog = FeedLog.loadLog(currentDate);
    seedAlertBaselineFromLog();
    syncDateUI();
    bindControls();
    subscribeLog();
    renderAll();
    scanSchedule();

    countdownTimer = setInterval(updateCountdown, 500);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopTimers();
      } else {
        scanSchedule();
      }
    });
  }

  function seedAlertBaselineFromLog() {
    alertedIds.clear();
    notifiedRiskIds.clear();
    if (feedLog && Array.isArray(feedLog.entries)) {
      feedLog.entries.forEach((e) => {
        if (e && e.review && e.review.id) {
          alertedIds.add(e.review.id);
          if (e.review.runsAtRisk > 0) notifiedRiskIds.add(e.review.id);
        }
      });
    }
    initializedAlertBaseline = false;
  }

  function subscribeLog() {
    if (unsubscribeFeedLog) {
      unsubscribeFeedLog();
      unsubscribeFeedLog = null;
    }
    FeedLog.fetchRemoteLog(currentDate).then((merged) => {
      feedLog = merged;
      renderAll();
    });
    unsubscribeFeedLog = FeedLog.subscribe(currentDate, (merged) => {
      feedLog = merged;
      renderAll();
    });
  }

  function stopTimers() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
  }

  function hasLiveGames() {
    return lastGames.some((g) => g.status && g.status.abstractGameState === 'Live');
  }

  function updateCountdown() {
    const cdEl = document.getElementById('countdown');
    if (!cdEl) return;
    if (document.hidden || !nextPollAt) {
      cdEl.textContent = '';
      return;
    }
    const rem = Math.max(0, Math.ceil((nextPollAt - Date.now()) / 1000));
    cdEl.textContent = `${rem}s`;
  }

  function scheduleNextPoll() {
    stopTimers();
    if (document.hidden) return;
    const live = hasLiveGames();
    const rateWait = MLBAPI.getRateLimitRemainingMs();
    const delay = Math.max(rateWait, live ? LIVE_POLL_MS : IDLE_POLL_MS);
    nextPollAt = Date.now() + delay;
    updateCountdown();
    pollTimer = setTimeout(scanSchedule, delay);

    if (live) {
      statusTimer = setTimeout(runStatusSweep, Math.max(rateWait, REVIEW_POLL_MS));
    }
  }

  function syncDateUI() {
    const picker = document.getElementById('date-picker');
    const label = document.getElementById('date-label');
    if (picker) picker.value = currentDate;
    if (label) label.textContent = UI.formatDateLabel(currentDate);
    try {
      if (window.location.protocol !== 'file:') {
        const url = new URL(window.location.href);
        url.searchParams.set('date', currentDate);
        window.history.replaceState(null, '', url.toString());
      }
    } catch (_) {}
  }

  // Synthesized gentle raindrop chime: three soft sine drops blooming into a warm
  // two-note chord (~1.2s) with light echo, sharing a 2.5s cooldown.
  function playRaindropChime() {
    const nowMs = Date.now();
    if (nowMs - lastChimeAt < CHIME_COOLDOWN_MS) return false;
    const Ctx = global.AudioContext || global.webkitAudioContext;
    if (!Ctx) return false;
    try {
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      const t0 = audioCtx.currentTime + 0.02;

      const scheduleTone = (freq, start, dur, gainPeak) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(gainPeak, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + dur + 0.02);
      };

      // 3 soft raindrops
      scheduleTone(659.25, t0, 0.22, 0.07);        // E5
      scheduleTone(783.99, t0 + 0.14, 0.24, 0.08); // G5
      scheduleTone(987.77, t0 + 0.28, 0.30, 0.08); // B5
      // Warm two-note chime + light echo
      scheduleTone(523.25, t0 + 0.42, 0.72, 0.09); // C5
      scheduleTone(783.99, t0 + 0.44, 0.76, 0.08); // G5
      scheduleTone(783.99, t0 + 0.70, 0.50, 0.035); // echo

      lastChimeAt = nowMs;
      return true;
    } catch (_) {
      return false;
    }
  }

  function sendRunRiskNotification(item) {
    if (!notifyOn || !('Notification' in global) || Notification.permission !== 'granted') return;
    try {
      const title = `⚠️ ${item.runsAtRisk} Run${item.runsAtRisk === 1 ? '' : 's'} at Risk — ${item.awayAbbr} @ ${item.homeAbbr}`;
      const scoreText = item.possibleScore && item.possibleScore.ifRemoved
        ? `Stands: ${item.awayAbbr} ${item.possibleScore.stands.away}–${item.homeAbbr} ${item.possibleScore.stands.home} · If removed: ${item.awayAbbr} ${item.possibleScore.ifRemoved.away}–${item.homeAbbr} ${item.possibleScore.ifRemoved.home}`
        : (item.officialReason || item.label);
      const n = new Notification(title, {
        body: `${UI.formatInningShort(item.halfInning, item.inning)} · ${item.label} · ${scoreText}`,
      });
      n.onclick = () => {
        try { window.focus(); } catch (_) {}
      };
    } catch (_) {}
  }

  function bindControls() {
    const soundBtn = document.getElementById('sound-toggle-btn');
    const notifyBtn = document.getElementById('notify-toggle-btn');
    const refreshBtn = document.getElementById('refresh-btn');

    const updateButtons = () => {
      if (soundBtn) soundBtn.textContent = soundOn ? '🔊 Sound On' : '🔇 Sound Off';
      if (notifyBtn) notifyBtn.textContent = notifyOn ? '🔴 Run Alerts On' : '⚪ Run Alerts Off';
    };
    updateButtons();

    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        soundOn = !soundOn;
        localStorage.setItem('livpbp_sound', soundOn ? '1' : '0');
        updateButtons();
        if (soundOn) playRaindropChime();
      });
    }
    if (notifyBtn) {
      notifyBtn.addEventListener('click', async () => {
        if (!notifyOn && 'Notification' in window && Notification.permission === 'default') {
          try { await Notification.requestPermission(); } catch (_) {}
        }
        notifyOn = !notifyOn;
        localStorage.setItem('livpbp_notify', notifyOn ? '1' : '0');
        updateButtons();
      });
    }
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        scanSchedule();
      });
    }
  }

  async function mapWithConcurrency(items, limit, fn) {
    const results = new Array(items.length);
    let nextIdx = 0;
    const workers = [];
    const count = Math.min(limit, items.length);
    for (let w = 0; w < count; w += 1) {
      workers.push((async () => {
        while (nextIdx < items.length) {
          const i = nextIdx++;
          results[i] = await fn(items[i], i);
        }
      })());
    }
    await Promise.all(workers);
    return results;
  }

  async function runStatusSweep() {
    if (document.hidden || !hasLiveGames()) return;
    const reqDate = currentDate;
    try {
      const data = await MLBAPI.getScheduleStatus(reqDate);
      if (reqDate !== currentDate) return;
      const games = (data && data.dates && data.dates[0] && data.dates[0].games) || [];
      const newlyFlagged = [];
      const activeList = [];
      games.forEach((sg) => {
        const meta = UI.describeReviewStatus(sg.status);
        if (!meta) return;
        const full = lastGames.find((x) => x.gamePk === sg.gamePk);
        const awayAbbr = full ? full.teams.away.team.abbreviation : 'AWY';
        const homeAbbr = full ? full.teams.home.team.abbreviation : 'HOM';
        const counters = prevCountersByGame.get(sg.gamePk) || (full ? Reviews.extractChallengeCounters(full) : null);
        activeList.push({
          gamePk: sg.gamePk,
          awayAbbr,
          homeAbbr,
          meta,
          counterSummary: Reviews.formatBothTeamsCounterSummary(awayAbbr, homeAbbr, counters),
        });
        const wasActive = activeGamesInReview.some((x) => x.gamePk === sg.gamePk && x.meta.statusCode === meta.statusCode);
        if (!wasActive) newlyFlagged.push(sg.gamePk);
      });
      activeGamesInReview = activeList;
      renderActiveStrip();
      if (newlyFlagged.length) {
        scanSchedule();
        return;
      }
    } catch (_) {
      // Fall back to regular scan
    } finally {
      if (!document.hidden && hasLiveGames()) {
        statusTimer = setTimeout(runStatusSweep, Math.max(MLBAPI.getRateLimitRemainingMs(), REVIEW_POLL_MS));
      }
    }
  }

  async function scanSchedule() {
    const request = ++latestRequest;
    const statusLine = document.getElementById('status-line');
    const liveDot = document.getElementById('live-dot');
    if (liveDot) liveDot.classList.add('pulsing');
    if (statusLine && (!feedLog || !feedLog.entries.length)) {
      statusLine.textContent = 'Scanning games for reviews, challenges & scoring changes…';
    }

    try {
      const sched = await MLBAPI.getSchedule(currentDate);
      if (request !== latestRequest) return;
      const dates = sched.dates || [];
      const games = dates.length ? (dates[0].games || []) : [];
      lastGames = games;

      // Update official status-based active review strip immediately
      activeGamesInReview = games
        .map((g) => {
          const meta = UI.describeReviewStatus(g.status);
          if (!meta) return null;
          const awayAbbr = g.teams.away.team.abbreviation || 'AWY';
          const homeAbbr = g.teams.home.team.abbreviation || 'HOM';
          const counters = prevCountersByGame.get(g.gamePk) || Reviews.extractChallengeCounters(g);
          return {
            gamePk: g.gamePk,
            awayAbbr,
            homeAbbr,
            meta,
            counterSummary: Reviews.formatBothTeamsCounterSummary(awayAbbr, homeAbbr, counters),
          };
        })
        .filter(Boolean);

      // Prioritize games currently under review first, then live, then final
      const activeOrFinal = games
        .filter((g) => g.status && g.status.abstractGameState !== 'Preview')
        .sort((a, b) => {
          const ar = UI.isReviewStatus(a.status) ? 0 : (a.status.abstractGameState === 'Live' ? 1 : 2);
          const br = UI.isReviewStatus(b.status) ? 0 : (b.status.abstractGameState === 'Live' ? 1 : 2);
          return ar - br;
        });

      const feeds = await mapWithConcurrency(activeOrFinal, FETCH_CONCURRENCY, (g) =>
        MLBAPI.getGameLive(g.gamePk).catch(() => null)
      );
      if (request !== latestRequest) return;

      const now = Date.now();
      const collectedEntries = [];
      const nextSnapshots = { ...(feedLog.snapshots || {}) };
      const nextIrregularities = { ...(feedLog.irregularities || {}) };
      const newAlerts = [];
      const newRiskAlerts = [];

      feeds.forEach((f, idx) => {
        const g = activeOrFinal[idx];
        if (!f || !g) return;
        const gamePk = g.gamePk;
        const awayAbbr = (f.gameData && f.gameData.teams && f.gameData.teams.away && f.gameData.teams.away.abbreviation) ||
          (g.teams.away.team.abbreviation) || 'AWY';
        const homeAbbr = (f.gameData && f.gameData.teams && f.gameData.teams.home && f.gameData.teams.home.abbreviation) ||
          (g.teams.home.team.abbreviation) || 'HOM';

        // Check challenge counter irregularities (backwards used counters)
        const counters = Reviews.extractChallengeCounters(f);
        const prevCounters = prevCountersByGame.get(gamePk);
        const counterIrreg = Reviews.detectCounterIrregularity(prevCounters, counters, awayAbbr, homeAbbr);
        prevCountersByGame.set(gamePk, counters);

        const extracted = Reviews.extractGameReviews(f);
        if (counterIrreg.length) {
          nextIrregularities[String(gamePk)] = Array.from(
            new Set([...(nextIrregularities[String(gamePk)] || []), ...counterIrreg])
          ).slice(-30);
          extracted.forEach((item) => {
            if (item.category === 'challenge' || item.category === 'abs') {
              item.irregularityNote = counterIrreg.join('; ');
            }
          });
        }

        // Official scoring change snapshotting & diffing
        const allPlays = (f.liveData && f.liveData.plays && f.liveData.plays.allPlays) || [];
        const snapNow = Reviews.snapshotCompletedPlays(allPlays);
        const snapPrev = nextSnapshots[String(gamePk)];
        if (snapPrev) {
          const diff = Reviews.diffPlaySnapshots(snapPrev, snapNow, { gamePk, awayAbbr, homeAbbr });
          diff.scoringChanges.forEach((sc) => extracted.push(sc));
          if (diff.irregularities.length) {
            nextIrregularities[String(gamePk)] = Array.from(
              new Set([...(nextIrregularities[String(gamePk)] || []), ...diff.irregularities])
            ).slice(-30);
          }
        }
        nextSnapshots[String(gamePk)] = snapNow;

        extracted.forEach((item) => {
          collectedEntries.push({
            gamePk,
            review: item,
            firstSeen: now,
            lastSeen: now,
            matchupLabel: `${awayAbbr} @ ${homeAbbr}`,
          });
          if (initializedAlertBaseline && !alertedIds.has(item.id)) {
            if (item.runsAtRisk > 0 && item.inProgress) {
              newRiskAlerts.push(item);
            } else if (item.category !== 'abs') {
              newAlerts.push(item);
            }
          } else if (initializedAlertBaseline && item.runsAtRisk > 0 && item.inProgress && !notifiedRiskIds.has(item.id)) {
            newRiskAlerts.push(item);
          }
          alertedIds.add(item.id);
          if (item.runsAtRisk > 0 && item.inProgress) notifiedRiskIds.add(item.id);
        });
      });

      const incomingLog = {
        v: 1,
        date: currentDate,
        savedAt: now,
        entries: collectedEntries,
        order: [],
        snapshots: nextSnapshots,
        irregularities: nextIrregularities,
        grace: feedLog.grace || {},
        settled: feedLog.settled || [],
      };
      feedLog = FeedLog.mergeLogs(feedLog, incomingLog, currentDate);
      FeedLog.saveLog(currentDate, feedLog);

      if (initializedAlertBaseline) {
        if (newRiskAlerts.length) {
          if (soundOn) playRaindropChime();
          newRiskAlerts.forEach(sendRunRiskNotification);
        } else if (newAlerts.length && soundOn) {
          playRaindropChime();
        }
      }
      initializedAlertBaseline = true;

      renderAll();
      if (statusLine) {
        const okCount = feeds.filter(Boolean).length;
        statusLine.textContent = `Updated ${new Date().toLocaleTimeString()} · Scanned ${okCount}/${activeOrFinal.length} game(s)${feeds.includes(null) ? ' · Incomplete: game feed unavailable' : ''}`;
      }
    } catch (err) {
      if (request !== latestRequest) return;
      console.error(err);
      if (statusLine) statusLine.textContent = `Error scanning schedule: ${err.message}`;
    } finally {
      if (liveDot) liveDot.classList.remove('pulsing');
      if (request === latestRequest) scheduleNextPoll();
    }
  }

  function getSortedItems() {
    const entries = (feedLog && Array.isArray(feedLog.entries)) ? feedLog.entries : [];
    return entries
      .map((e) => e.review)
      .filter(Boolean)
      .sort((a, b) => {
        if (a.inProgress !== b.inProgress) return a.inProgress ? -1 : 1;
        return String(b.timestamp || '').localeCompare(String(a.timestamp || ''));
      });
  }

  function renderAll() {
    const items = getSortedItems();
    renderBanner(items);
    renderActiveStrip(items);
    renderStats(items);
    renderTabs(items);
    renderFeed(items);
  }

  function renderBanner(items) {
    const el = document.getElementById('banner');
    if (!el) return;
    const atRisk = items.filter((i) => i.runsAtRisk > 0 && i.inProgress);
    if (!atRisk.length) {
      el.innerHTML = '';
      return;
    }
    const parts = atRisk.map((i) => {
      const stands = i.possibleScore && i.possibleScore.stands
        ? `${i.awayAbbr} ${i.possibleScore.stands.away}–${i.homeAbbr} ${i.possibleScore.stands.home}`
        : '';
      const alt = i.possibleScore && i.possibleScore.ifRemoved
        ? ` (if removed: ${i.awayAbbr} ${i.possibleScore.ifRemoved.away}–${i.homeAbbr} ${i.possibleScore.ifRemoved.home})`
        : '';
      return `<a href="game.html?gamePk=${i.gamePk}"><strong>${UI.esc(i.awayAbbr)} @ ${UI.esc(i.homeAbbr)}</strong></a>: ⚠️ ${i.runsAtRisk} run${i.runsAtRisk === 1 ? '' : 's'} at risk${stands ? ` · ${UI.esc(stands)}${UI.esc(alt)}` : ''}`;
    });
    el.innerHTML = `<div class="banner-box risk-banner">⚠️ <strong>RUNS AT RISK:</strong> ${parts.join(' · ')}</div>`;
  }

  function renderActiveStrip(items) {
    const el = document.getElementById('active-strip');
    if (!el) return;
    const activeItems = (items || []).filter((i) => i.inProgress && i.category !== 'os_pending');
    const byGame = new Map();

    activeGamesInReview.forEach((g) => {
      byGame.set(g.gamePk, {
        gamePk: g.gamePk,
        awayAbbr: g.awayAbbr,
        homeAbbr: g.homeAbbr,
        label: g.meta.label,
        reason: g.meta.reason,
        counterSummary: g.counterSummary,
        runsAtRisk: 0,
      });
    });

    activeItems.forEach((i) => {
      const existing = byGame.get(i.gamePk);
      byGame.set(i.gamePk, {
        gamePk: i.gamePk,
        awayAbbr: i.awayAbbr,
        homeAbbr: i.homeAbbr,
        label: i.label,
        reason: i.officialReason || i.reason,
        counterSummary: i.bothTeamsCounterSummary || (existing && existing.counterSummary) || '',
        runsAtRisk: Math.max(i.runsAtRisk || 0, existing ? existing.runsAtRisk : 0),
      });
    });

    const list = Array.from(byGame.values());
    if (!list.length) {
      el.innerHTML = '';
      return;
    }

    el.innerHTML = `
      <div class="active-strip">
        <div class="active-strip-title">🔴 Under Review Now (${list.length})</div>
        <div class="active-strip-cards">
          ${list.map((g) => `
            <a class="active-chip ${g.runsAtRisk > 0 ? 'risk' : ''}" href="game.html?gamePk=${g.gamePk}">
              <div class="active-chip-top">
                <strong>${UI.esc(g.awayAbbr)} @ ${UI.esc(g.homeAbbr)}</strong>
                <span class="pill pill-review">${UI.esc(g.label)}</span>
                ${g.runsAtRisk > 0 ? `<span class="pill pill-risk">⚠️ ${g.runsAtRisk} RUN${g.runsAtRisk === 1 ? '' : 'S'} AT RISK</span>` : ''}
              </div>
              <div class="active-chip-reason">${UI.esc(g.reason)}</div>
              ${g.counterSummary ? `<div class="active-chip-counters">${UI.esc(g.counterSummary)}</div>` : ''}
            </a>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderStats(items) {
    const el = document.getElementById('feed-stats');
    if (!el) return;
    const nonAbs = items.filter((i) => i.category !== 'abs');
    const absCount = items.filter((i) => i.category === 'abs').length;
    const activeCount = Math.max(
      items.filter((i) => i.inProgress && i.category !== 'os_pending').length,
      activeGamesInReview.length
    );
    const riskCount = items.filter((i) => i.runsAtRisk > 0 && i.inProgress).length;
    const scoringCount = items.filter((i) => i.category === 'scoring_change').length;

    el.innerHTML = `
      <div class="stat-box"><div class="stat-val">${nonAbs.length}</div><div class="stat-lbl">Reviews &amp; Challenges</div></div>
      <div class="stat-box"><div class="stat-val">${absCount}</div><div class="stat-lbl">ABS Challenges</div></div>
      <div class="stat-box"><div class="stat-val">${activeCount}</div><div class="stat-lbl">Under Review</div></div>
      <div class="stat-box"><div class="stat-val">${riskCount}</div><div class="stat-lbl">Runs at Risk</div></div>
      <div class="stat-box"><div class="stat-val">${scoringCount}</div><div class="stat-lbl">Scoring Changes</div></div>
    `;
  }

  function renderTabs(items) {
    const el = document.getElementById('feed-tabs');
    if (!el) return;
    const count = (fn) => items.filter(fn).length;
    const tabs = [
      { id: 'all', label: `All (${count((i) => i.category !== 'abs')})` },
      { id: 'abs', label: `ABS (${count((i) => i.category === 'abs')})` },
      { id: 'challenge', label: `Challenges (${count((i) => i.category === 'challenge')})` },
      { id: 'review', label: `Reviews (${count((i) => i.category === 'review' || i.category === 'os_pending')})` },
      { id: 'boundary', label: `Boundary Calls (${count((i) => i.category === 'boundary')})` },
      { id: 'scoring_change', label: `✏️ Scoring Changes (${count((i) => i.category === 'scoring_change')})` },
      { id: 'active', label: `Under Review (${count((i) => i.inProgress)})` },
      { id: 'risk', label: `⚠️ Runs at Risk (${count((i) => i.runsAtRisk > 0 && i.inProgress)})` },
    ];
    el.innerHTML = tabs
      .map((t) => `<button class="tab-btn ${currentTab === t.id ? 'tab-on' : ''}" data-tab="${t.id}">${t.label}</button>`)
      .join('');
    el.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentTab = btn.dataset.tab;
        renderTabs(items);
        renderFeed(items);
      });
    });
  }

  function renderScoreTracker(i) {
    if (i.category === 'os_pending') return '';
    const fmt = (s) => (s && typeof s.away === 'number' && typeof s.home === 'number')
      ? `${i.awayAbbr} ${s.away} – ${i.homeAbbr} ${s.home}`
      : null;

    const beforeStr = fmt(i.beforeScore) || (i.inProgress ? 'Pending' : 'Not observed before resolution');
    let possibleStr = 'Not observed before resolution';
    if (i.possibleScore) {
      if (i.possibleScore.ifRemoved) {
        possibleStr = `Stands: ${fmt(i.possibleScore.stands)} · If run(s) removed: ${fmt(i.possibleScore.ifRemoved)} (not a prediction)`;
      } else if (i.possibleScore.pendingText) {
        possibleStr = i.possibleScore.pendingText;
      } else if (i.possibleScore.stands) {
        possibleStr = `Stands: ${fmt(i.possibleScore.stands)} (no credited run on reviewed event)`;
      }
    }
    const actualStr = i.inProgress
      ? 'Pending ruling'
      : (fmt(i.actualScore) || (i.category === 'abs' ? 'Mid-at-bat pitch review (no separate play score)' : 'Not exposed'));

    return `
      <div class="score-tracker">
        <div><span class="st-lbl">Before review:</span> <span>${UI.esc(beforeStr)}</span></div>
        <div><span class="st-lbl">Possible after:</span> <span>${UI.esc(possibleStr)}</span></div>
        <div><span class="st-lbl">Actual after:</span> <strong>${UI.esc(actualStr)}</strong></div>
      </div>
    `;
  }

  function renderFeed(items) {
    const el = document.getElementById('feed-list');
    if (!el) return;
    const filtered = items.filter((i) => {
      if (currentTab === 'all') return i.category !== 'abs';
      if (currentTab === 'active') return i.inProgress;
      if (currentTab === 'risk') return i.runsAtRisk > 0 && i.inProgress;
      if (currentTab === 'review') return i.category === 'review' || i.category === 'os_pending';
      return i.category === currentTab;
    });

    if (!filtered.length) {
      el.innerHTML = '<div class="empty-state">No matching review events for this date/filter.</div>';
      return;
    }

    el.innerHTML = filtered.map((i) => {
      const absLine = i.absContext
        ? `<div class="review-meta-line">ABS Pitch Count: <strong>${UI.esc(i.absContext.beforeCount)} → ${UI.esc(i.absContext.afterCount || '—')}</strong> (${UI.esc(i.absContext.callDesc)})${i.challengerRole ? ` · Challenged by: <strong>${UI.esc(i.challengerRole)}</strong>` : ''}</div>`
        : '';
      const counterLine = i.counterLine
        ? `<div class="review-meta-line" title="${UI.esc(i.bothTeamsCounterSummary || '')}">${UI.esc(i.counterLine)}</div>`
        : '';
      const irregLine = i.irregularityNote
        ? `<div class="review-irreg-line">⚠️ ${UI.esc(i.irregularityNote)}</div>`
        : '';
      const matchupCtx = (i.batter || i.pitcher)
        ? `<div class="review-meta-line">${i.batter ? `Batter: ${UI.esc(i.batter)}` : ''}${i.batter && i.pitcher ? ' · ' : ''}${i.pitcher ? `Pitcher: ${UI.esc(i.pitcher)}` : ''}</div>`
        : '';
      const scoringNote = i.category === 'scoring_change'
        ? `<div class="review-meta-line">Initial call: <strong>${UI.esc(i.initialCall || '')}</strong> → Final ruling: <strong>${UI.esc(i.finalRuling || '')}</strong> · <a href="https://www.mlb.com/official-information/scoring-changes" target="_blank" rel="noopener">MLB Scoring Changes</a></div>`
        : '';

      return `
        <article class="feed-card ${i.runsAtRisk > 0 && i.inProgress ? 'risk' : ''}">
          <div class="feed-card-head">
            <div>
              <strong>${UI.esc(i.awayAbbr)} @ ${UI.esc(i.homeAbbr)}</strong>
              <span style="color:var(--muted);">
                · ${UI.esc(UI.formatInningShort(i.halfInning, i.inning))}
                · ${UI.esc(i.label)}${i.challengerAbbr ? ` (${UI.esc(i.challengerAbbr)})` : ''}
                ${i.officialReason ? ` · ${UI.esc(i.officialReason)}` : ''}
              </span>
            </div>
            <div class="card-badges">
              ${i.runsAtRisk > 0 && i.inProgress ? `<span class="pill pill-risk">⚠️ ${i.runsAtRisk} RUN${i.runsAtRisk === 1 ? '' : 'S'} AT RISK</span>` : ''}
              <span class="pill ${i.inProgress ? 'pill-review' : i.isOverturned ? 'pill-risk' : 'pill-final'}">${UI.esc(i.outcome)}</span>
            </div>
          </div>
          <div class="feed-card-desc">${UI.esc(i.reason)}</div>
          ${matchupCtx}
          ${absLine}
          ${scoringNote}
          ${renderScoreTracker(i)}
          ${counterLine}
          ${irregLine}
          <div class="feed-card-foot">
            <a href="game.html?gamePk=${i.gamePk}">Open Game →</a>
            ${i.gamePk ? ` · <a href="${UI.esc(MLBAPI.gameFeedUrl(i.gamePk))}" target="_blank" rel="noopener">Official MLB Feed</a>` : ''}
          </div>
        </article>
      `;
    }).join('');
  }

  function switchDate(newDate) {
    currentDate = newDate;
    activeGamesInReview = [];
    prevCountersByGame.clear();
    feedLog = FeedLog.loadLog(currentDate);
    seedAlertBaselineFromLog();
    syncDateUI();
    subscribeLog();
    renderAll();
    scanSchedule();
  }

  function prevDay() { switchDate(UI.shiftDate(currentDate, -1)); }
  function nextDay() { switchDate(UI.shiftDate(currentDate, 1)); }
  function today() { switchDate(UI.todayStr()); }

  function pickDate() {
    const picker = document.getElementById('date-picker');
    if (picker && picker.value) switchDate(picker.value);
  }

  global.ReplayFeed = {
    LIVE_POLL_MS,
    REVIEW_POLL_MS,
    IDLE_POLL_MS,
    FETCH_CONCURRENCY,
    playRaindropChime,
    prevDay,
    nextDay,
    today,
    pickDate,
  };
  document.addEventListener('DOMContentLoaded', init);
})(window);
