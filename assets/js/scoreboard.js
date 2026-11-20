(function (global) {
  'use strict';

  let currentDate = UI.todayStr();
  let currentFilter = 'all';
  let gamesCache = [];
  let pollTimer = null;

  function init() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('date')) currentDate = params.get('date');
    syncDateUI();
    loadSchedule();
    pollTimer = setInterval(loadSchedule, 30000);
  }

  function syncDateUI() {
    const picker = document.getElementById('date-picker');
    const label = document.getElementById('date-label');
    if (picker) picker.value = currentDate;
    if (label) label.textContent = UI.formatDateLabel(currentDate);
  }

  async function loadSchedule() {
    const statusLine = document.getElementById('status-line');
    if (statusLine) statusLine.textContent = 'Loading MLB schedule…';
    try {
      const data = await MLBAPI.getSchedule(currentDate);
      const dates = data.dates || [];
      gamesCache = dates.length ? (dates[0].games || []) : [];
      renderBanner();
      renderTabs();
      renderGames();
      if (statusLine) {
        statusLine.textContent = `Updated ${new Date().toLocaleTimeString()} · ${gamesCache.length} game(s)`;
      }
    } catch (err) {
      console.error(err);
      if (statusLine) statusLine.textContent = `Error loading schedule: ${err.message}`;
    }
  }

  function renderBanner() {
    const el = document.getElementById('banner');
    if (!el) return;
    const inReview = gamesCache.filter((g) => g.flags && g.flags.inReview);
    if (!inReview.length) {
      el.innerHTML = '';
      return;
    }
    const names = inReview
      .map((g) => `${g.teams.away.team.abbreviation} @ ${g.teams.home.team.abbreviation}`)
      .join(', ');
    el.innerHTML = `<div class="banner-box">🚨 <strong>Under Review:</strong> ${UI.esc(names)} · <a href="reviews.html?date=${encodeURIComponent(currentDate)}">Open Replay Feed →</a></div>`;
  }

  function renderTabs() {
    const el = document.getElementById('tabs');
    if (!el) return;
    const counts = {
      all: gamesCache.length,
      live: gamesCache.filter((g) => g.status && g.status.abstractGameState === 'Live').length,
      final: gamesCache.filter((g) => g.status && g.status.abstractGameState === 'Final').length,
      preview: gamesCache.filter((g) => g.status && g.status.abstractGameState === 'Preview').length,
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

  function renderGames() {
    const el = document.getElementById('game-list');
    if (!el) return;
    const filtered = gamesCache.filter((g) => {
      if (currentFilter === 'all') return true;
      const state = g.status && g.status.abstractGameState;
      return state && state.toLowerCase() === currentFilter;
    });

    if (!filtered.length) {
      el.innerHTML = '<div class="empty-state">No games found for this date/filter.</div>';
      return;
    }

    el.innerHTML = filtered.map((g) => {
      const away = g.teams.away;
      const home = g.teams.home;
      const state = g.status ? g.status.abstractGameState : 'Preview';
      const ls = g.linescore || {};
      const inReview = g.flags && g.flags.inReview;
      let pillClass = 'pill-preview';
      let statusText = UI.formatTime(g.gameDate);
      if (state === 'Live') {
        pillClass = 'pill-live';
        statusText = `${ls.inningHalf || ''} ${ls.currentInningOrdinal || ''}`.trim() || g.status.detailedState;
      } else if (state === 'Final') {
        pillClass = 'pill-final';
        statusText = g.status.detailedState || 'Final';
      }

      const awayScore = away.score !== undefined ? away.score : '-';
      const homeScore = home.score !== undefined ? home.score : '-';
      const awayRec = away.leagueRecord ? `${away.leagueRecord.wins}-${away.leagueRecord.losses}` : '';
      const homeRec = home.leagueRecord ? `${home.leagueRecord.wins}-${home.leagueRecord.losses}` : '';

      return `
        <a class="game-card ${inReview ? 'in-review' : ''}" href="game.html?gamePk=${g.gamePk}">
          <div class="card-top">
            <span class="pill ${pillClass}">${UI.esc(statusText)}</span>
            ${inReview ? '<span class="pill pill-review">🚨 Review</span>' : ''}
          </div>
          <div class="team-row">
            <div class="team-info">
              <img class="team-logo" src="${UI.teamLogoUrl(away.team.id)}" alt="" loading="lazy">
              <span class="team-name">${UI.esc(away.team.name)}</span>
              <span class="team-record">${UI.esc(awayRec)}</span>
            </div>
            <span class="team-score">${awayScore}</span>
          </div>
          <div class="team-row">
            <div class="team-info">
              <img class="team-logo" src="${UI.teamLogoUrl(home.team.id)}" alt="" loading="lazy">
              <span class="team-name">${UI.esc(home.team.name)}</span>
              <span class="team-record">${UI.esc(homeRec)}</span>
            </div>
            <span class="team-score">${homeScore}</span>
          </div>
          <div class="card-foot">
            <span>${UI.esc(g.venue ? g.venue.name : '')}</span>
            <span>Open Gameday →</span>
          </div>
        </a>
      `;
    }).join('');
  }

  function prevDay() {
    currentDate = UI.shiftDate(currentDate, -1);
    syncDateUI();
    loadSchedule();
  }

  function nextDay() {
    currentDate = UI.shiftDate(currentDate, 1);
    syncDateUI();
    loadSchedule();
  }

  function today() {
    currentDate = UI.todayStr();
    syncDateUI();
    loadSchedule();
  }

  function pickDate() {
    const picker = document.getElementById('date-picker');
    if (picker && picker.value) {
      currentDate = picker.value;
      syncDateUI();
      loadSchedule();
    }
  }

  global.Scoreboard = { prevDay, nextDay, today, pickDate };
  document.addEventListener('DOMContentLoaded', init);
})(window);
