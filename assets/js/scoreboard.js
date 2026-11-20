(function (global) {
  'use strict';

  const LIVE_POLL_MS = 5000;
  const REVIEW_POLL_MS = 1500;
  const IDLE_POLL_MS = 30000;

  let currentDate = UI.todayStr();
  let currentFilter = 'all';
  let gamesCache = [];
  let statusOverrides = new Map(); // gamePk -> status object from fast sweep
  let pollTimer = null;
  let statusTimer = null;
  let unsubscribeFeedLog = null;
  let latestRequest = 0;

  function init() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('date') && /^\d{4}-\d{2}-\d{2}$/.test(params.get('date'))) {
      currentDate = params.get('date');
    }
    MLBAPI.getGameStatusRegistry().then((list) => {
      if (list) UI.registerGameStatusList(list);
    });

    syncDateUI();
    subscribeLog();
    loadSchedule();

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopTimers();
      } else {
        loadSchedule();
      }
    });
  }

  function subscribeLog() {
    if (unsubscribeFeedLog) {
      unsubscribeFeedLog();
      unsubscribeFeedLog = null;
    }
    if (global.FeedLog) {
      FeedLog.fetchRemoteLog(currentDate).then(() => {
        if (gamesCache.length) renderGames();
      });
      unsubscribeFeedLog = FeedLog.subscribe(currentDate, () => {
        if (gamesCache.length) renderGames();
      });
    }
  }

  function stopTimers() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
  }

  function hasLiveGames() {
    return gamesCache.some((g) => {
      const st = effectiveStatus(g);
      return st && st.abstractGameState === 'Live';
    });
  }

  function scheduleNextPoll() {
    stopTimers();
    if (document.hidden) return;
    const rateWait = MLBAPI.getRateLimitRemainingMs();
    const live = hasLiveGames();
    const delay = Math.max(rateWait, live ? LIVE_POLL_MS : IDLE_POLL_MS);
    pollTimer = setTimeout(loadSchedule, delay);

    if (live) {
      const sweepDelay = Math.max(rateWait, REVIEW_POLL_MS);
      statusTimer = setTimeout(runStatusSweep, sweepDelay);
    }
  }

  function effectiveStatus(game) {
    return statusOverrides.get(game.gamePk) || game.status || {};
  }

  function syncDateUI() {
    const picker = document.getElementById('date-picker');
    const label = document.getElementById('date-label');
    if (picker) picker.value = currentDate;
    if (label) label.textContent = UI.formatDateLabel(currentDate);
    const feedLink = document.querySelector('.topbar a.btn-feed');
    if (feedLink) {
      feedLink.setAttribute('href', `reviews.html?date=${encodeURIComponent(currentDate)}`);
    }
    try {
      if (window.location.protocol !== 'file:') {
        const url = new URL(window.location.href);
        url.searchParams.set('date', currentDate);
        window.history.replaceState(null, '', url.toString());
      }
    } catch (_) {}
  }

  async function runStatusSweep() {
    if (document.hidden || !hasLiveGames()) return;
    const reqDate = currentDate;
    try {
      const data = await MLBAPI.getScheduleStatus(reqDate);
      if (reqDate !== currentDate) return;
      const games = (data && data.dates && data.dates[0] && data.dates[0].games) || [];
      let changed = false;
      games.forEach((g) => {
        if (!g || !g.gamePk || !g.status) return;
        const prev = statusOverrides.get(g.gamePk);
        const prevCode = prev ? prev.statusCode : null;
        if (prevCode !== g.status.statusCode) {
          statusOverrides.set(g.gamePk, g.status);
          changed = true;
        }
      });
      if (changed) {
        renderBanner();
        renderGames();
      }
    } catch (_) {
      // Quietly rely on main schedule poll if status sweep fails
    } finally {
      if (!document.hidden && hasLiveGames()) {
        const wait = Math.max(MLBAPI.getRateLimitRemainingMs(), REVIEW_POLL_MS);
        statusTimer = setTimeout(runStatusSweep, wait);
      }
    }
  }

  async function loadSchedule() {
    const request = ++latestRequest;
    const statusLine = document.getElementById('status-line');
    if (statusLine && !gamesCache.length) statusLine.textContent = 'Loading MLB schedule…';
    try {
      const data = await MLBAPI.getSchedule(currentDate);
      if (request !== latestRequest) return;
      const dates = data.dates || [];
      gamesCache = dates.length ? (dates[0].games || []) : [];
      statusOverrides.clear();
      renderBanner();
      renderTabs();
      renderGames();
      if (statusLine) {
        const liveCount = gamesCache.filter((g) => g.status && g.status.abstractGameState === 'Live').length;
        statusLine.textContent = `Updated ${new Date().toLocaleTimeString()} · ${gamesCache.length} game(s)${liveCount ? ` · ${liveCount} live` : ''}`;
      }
    } catch (err) {
      if (request !== latestRequest) return;
      console.error(err);
      if (statusLine) statusLine.textContent = `Error loading schedule: ${err.message}`;
    } finally {
      if (request === latestRequest) scheduleNextPoll();
    }
  }

  function renderBanner() {
    const el = document.getElementById('banner');
    if (!el) return;
    const inReview = gamesCache
      .map((g) => ({ game: g, meta: UI.describeReviewStatus(effectiveStatus(g)) }))
      .filter((x) => Boolean(x.meta));

    if (!inReview.length) {
      el.innerHTML = '';
      return;
    }

    const parts = inReview.map(({ game, meta }) => {
      const awayAbbr = game.teams.away.team.abbreviation || game.teams.away.team.name;
      const homeAbbr = game.teams.home.team.abbreviation || game.teams.home.team.name;
      return `<a href="game.html?gamePk=${game.gamePk}"><strong>${UI.esc(awayAbbr)} @ ${UI.esc(homeAbbr)}</strong></a> (${UI.esc(meta.label)}: ${UI.esc(meta.reason)})`;
    });

    el.innerHTML = `
      <div class="banner-box">
        🚨 <strong>Under Review:</strong> ${parts.join(' · ')}
        · <a href="reviews.html?date=${encodeURIComponent(currentDate)}">Open Replay Feed →</a>
      </div>
    `;
  }

  function renderTabs() {
    const el = document.getElementById('tabs');
    if (!el) return;
    const counts = {
      all: gamesCache.length,
      live: gamesCache.filter((g) => effectiveStatus(g).abstractGameState === 'Live').length,
      final: gamesCache.filter((g) => effectiveStatus(g).abstractGameState === 'Final').length,
      preview: gamesCache.filter((g) => effectiveStatus(g).abstractGameState === 'Preview').length,
    };
    const tabs = [
      { id: 'all', label: `All (${counts.all})` },
      { id: 'live', label: `Live (${counts.live})` },
      { id: 'final', label: `Final (${counts.final})` },
      { id: 'preview', label: `Scheduled (${counts.preview})` },
    ];
    el.innerHTML = tabs
      .map((t) => `<button class="tab-btn ${currentFilter === t.id ? 'tab-on' : ''}" data-filter="${t.id}">${t.label}</button>`)
      .join('');
    el.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentFilter = btn.dataset.filter;
        renderTabs();
        renderGames();
      });
    });
  }

  function renderCardContext(g, state) {
    const ls = g.linescore || {};
    if (state === 'Live') {
      const balls = ls.balls;
      const strikes = ls.strikes;
      const outs = ls.outs;
      return `
        <div class="card-live-meta">
          ${UI.renderCountDots(balls, strikes, outs)}
          ${UI.renderBaseDiamond(ls.offense, 34)}
        </div>
      `;
    }
    if (state === 'Final' && g.decisions) {
      const parts = [];
      if (g.decisions.winner && g.decisions.winner.fullName) parts.push(`W: ${g.decisions.winner.fullName}`);
      if (g.decisions.loser && g.decisions.loser.fullName) parts.push(`L: ${g.decisions.loser.fullName}`);
      if (g.decisions.save && g.decisions.save.fullName) parts.push(`S: ${g.decisions.save.fullName}`);
      return parts.length ? `<div class="card-sub-meta">${UI.esc(parts.join(' · '))}</div>` : '';
    }
    if (state === 'Preview') {
      const ap = g.teams.away.probablePitcher && g.teams.away.probablePitcher.fullName;
      const hp = g.teams.home.probablePitcher && g.teams.home.probablePitcher.fullName;
      if (ap || hp) {
        return `<div class="card-sub-meta">Probables: ${UI.esc(ap || 'TBD')} vs ${UI.esc(hp || 'TBD')}</div>`;
      }
    }
    return '';
  }

  function renderGames() {
    const el = document.getElementById('game-list');
    if (!el) return;
    const filtered = gamesCache.filter((g) => {
      if (currentFilter === 'all') return true;
      const state = effectiveStatus(g).abstractGameState;
      return state && state.toLowerCase() === currentFilter;
    });

    if (!filtered.length) {
      el.innerHTML = '<div class="empty-state">No games found for this date/filter.</div>';
      return;
    }

    el.innerHTML = filtered.map((g) => {
      const away = g.teams.away;
      const home = g.teams.home;
      const st = effectiveStatus(g);
      const state = st.abstractGameState || 'Preview';
      const ls = g.linescore || {};
      const reviewMeta = UI.describeReviewStatus(st);
      const inReview = Boolean(reviewMeta);
      const scoringChanges = global.FeedLog ? FeedLog.getScoringChangesForGame(currentDate, g.gamePk) : [];

      let pillClass = 'pill-preview';
      let statusText = UI.formatTime(g.gameDate) || st.detailedState || 'Scheduled';
      if (state === 'Live') {
        pillClass = 'pill-live';
        statusText = `${ls.inningState || ls.inningHalf || ''} ${ls.currentInningOrdinal || ''}`.trim() || st.detailedState || 'Live';
      } else if (state === 'Final') {
        pillClass = 'pill-final';
        const inn = ls.currentInning && ls.currentInning !== 9 ? `/${ls.currentInning}` : '';
        statusText = `${st.detailedState || 'Final'}${inn}`;
      }

      const awayScore = away.score !== undefined ? away.score : '';
      const homeScore = home.score !== undefined ? home.score : '';
      const awayRec = away.leagueRecord ? `${away.leagueRecord.wins}-${away.leagueRecord.losses}` : '';
      const homeRec = home.leagueRecord ? `${home.leagueRecord.wins}-${home.leagueRecord.losses}` : '';
      const awayWin = state === 'Final' && away.isWinner === true;
      const homeWin = state === 'Final' && home.isWinner === true;

      return `
        <a class="game-card ${inReview ? 'in-review' : ''}" href="game.html?gamePk=${g.gamePk}">
          <div class="card-top">
            <span class="pill ${pillClass}">${UI.esc(statusText)}</span>
            <span class="card-badges">
              ${inReview ? `<span class="pill pill-review">🚨 ${UI.esc(reviewMeta.label)}</span>` : ''}
              ${scoringChanges.length ? `<span class="pill pill-scoring">✏️ ${scoringChanges.length} Scoring Change${scoringChanges.length === 1 ? '' : 's'}</span>` : ''}
            </span>
          </div>
          ${inReview ? `<div class="card-review-reason">${UI.esc(reviewMeta.reason)}</div>` : ''}
          <div class="team-row ${awayWin ? 'team-winner' : ''}">
            <div class="team-info">
              ${UI.teamLogoImg(away.team.id, 'team-logo')}
              <span class="team-name">${UI.esc(away.team.name)}</span>
              <span class="team-record">${UI.esc(awayRec)}</span>
            </div>
            <span class="team-score">${UI.esc(awayScore)}</span>
          </div>
          <div class="team-row ${homeWin ? 'team-winner' : ''}">
            <div class="team-info">
              ${UI.teamLogoImg(home.team.id, 'team-logo')}
              <span class="team-name">${UI.esc(home.team.name)}</span>
              <span class="team-record">${UI.esc(homeRec)}</span>
            </div>
            <span class="team-score">${UI.esc(homeScore)}</span>
          </div>
          ${renderCardContext(g, state)}
          <div class="card-foot">
            <span>${UI.esc(g.venue ? g.venue.name : '')}</span>
            <span>Open Gameday →</span>
          </div>
        </a>
      `;
    }).join('');
  }

  function switchDate(newDate) {
    currentDate = newDate;
    gamesCache = [];
    statusOverrides.clear();
    syncDateUI();
    subscribeLog();
    loadSchedule();
  }

  function prevDay() { switchDate(UI.shiftDate(currentDate, -1)); }
  function nextDay() { switchDate(UI.shiftDate(currentDate, 1)); }
  function today() { switchDate(UI.todayStr()); }

  function pickDate() {
    const picker = document.getElementById('date-picker');
    if (picker && picker.value) switchDate(picker.value);
  }

  global.Scoreboard = {
    LIVE_POLL_MS,
    REVIEW_POLL_MS,
    IDLE_POLL_MS,
    prevDay,
    nextDay,
    today,
    pickDate,
  };
  document.addEventListener('DOMContentLoaded', init);
})(window);
