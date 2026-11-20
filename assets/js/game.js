(function (global) {
  'use strict';

  let gamePk = null;
  let countdown = 15;
  let timer = null;

  function init() {
    const params = new URLSearchParams(window.location.search);
    gamePk = params.get('gamePk');
    if (!gamePk) {
      document.getElementById('main').innerHTML =
        '<div class="panel">Missing <code>gamePk</code> parameter. <a href="index.html">Return to scoreboard</a>.</div>';
      return;
    }

    setupTabs();
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => { countdown = 15; loadGame(); });

    loadGame();
    timer = setInterval(() => {
      countdown -= 1;
      if (countdown <= 0) {
        countdown = 15;
        loadGame();
      }
      const cdEl = document.getElementById('countdown');
      if (cdEl) cdEl.textContent = `${countdown}s`;
    }, 1000);
  }

  function setupTabs() {
    const buttons = document.querySelectorAll('.tabs-game .tab-btn');
    const panels = {
      plays: document.getElementById('panel-plays'),
      boxscore: document.getElementById('panel-boxscore'),
      props: document.getElementById('panel-props'),
      reviews: document.getElementById('panel-reviews'),
    };
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        buttons.forEach((b) => b.classList.remove('tab-on'));
        btn.classList.add('tab-on');
        const target = btn.dataset.tab;
        Object.keys(panels).forEach((k) => {
          if (panels[k]) panels[k].style.display = k === target ? '' : 'none';
        });
      });
    });
  }

  async function loadGame() {
    const loading = document.getElementById('loading');
    const statusLine = document.getElementById('status-line');
    if (loading) loading.classList.add('show');
    try {
      const feed = await MLBAPI.getGameLive(gamePk);
      renderHeader(feed);
      renderLivePanel(feed);
      renderLinescore(feed);
      renderPlays(feed);
      renderBoxscore(feed);
      if (global.Props) Props.render(feed, document.getElementById('props-wrap'));
      renderReviews(feed);
      if (statusLine) statusLine.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    } catch (err) {
      console.error(err);
      if (statusLine) statusLine.textContent = `Error loading game: ${err.message}`;
    } finally {
      if (loading) loading.classList.remove('show');
    }
  }

  function renderHeader(feed) {
    const gd = feed.gameData || {};
    const ls = (feed.liveData && feed.liveData.linescore) || {};
    const away = (gd.teams && gd.teams.away) || {};
    const home = (gd.teams && gd.teams.home) || {};
    const awayScore = ls.teams && ls.teams.away ? ls.teams.away.runs ?? '-' : '-';
    const homeScore = ls.teams && ls.teams.home ? ls.teams.home.runs ?? '-' : '-';
    const state = (gd.status && gd.status.detailedState) || '';

    document.getElementById('header-away').innerHTML = `
      <img class="team-logo" style="width:36px;height:36px;" src="${UI.teamLogoUrl(away.id)}" alt="">
      <div>
        <div style="font-weight:700;font-size:16px;">${UI.esc(away.name || 'Away')}</div>
        <div style="color:var(--muted);font-size:12px;">${UI.esc(away.abbreviation || '')}</div>
      </div>
    `;
    document.getElementById('header-center').innerHTML = `
      <div class="header-score">${awayScore} – ${homeScore}</div>
      <div style="color:var(--muted);font-size:12px;">${UI.esc(state)}</div>
    `;
    document.getElementById('header-home').innerHTML = `
      <div>
        <div style="font-weight:700;font-size:16px;">${UI.esc(home.name || 'Home')}</div>
        <div style="color:var(--muted);font-size:12px;">${UI.esc(home.abbreviation || '')}</div>
      </div>
      <img class="team-logo" style="width:36px;height:36px;" src="${UI.teamLogoUrl(home.id)}" alt="">
    `;
    document.getElementById('header-away').className = 'header-side';
    document.getElementById('header-home').className = 'header-side home';
    document.getElementById('header-meta').textContent = gd.venue ? gd.venue.name : '';
  }

  function renderLivePanel(feed) {
    const el = document.getElementById('live-panel');
    const ls = (feed.liveData && feed.liveData.linescore) || {};
    const cp = (feed.liveData && feed.liveData.plays && feed.liveData.plays.currentPlay) || {};
    const count = cp.count || {};
    const matchup = cp.matchup || {};
    el.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;">
        <div><strong>At Bat:</strong> ${UI.esc((matchup.batter && matchup.batter.fullName) || '—')}</div>
        <div><strong>Pitching:</strong> ${UI.esc((matchup.pitcher && matchup.pitcher.fullName) || '—')}</div>
        <div><strong>Count:</strong> ${count.balls ?? 0}-${count.strikes ?? 0} · <strong>Outs:</strong> ${ls.outs ?? count.outs ?? 0}</div>
      </div>
    `;
  }

  function renderLinescore(feed) {
    const el = document.getElementById('linescore-wrap');
    const ls = (feed.liveData && feed.liveData.linescore) || {};
    const innings = ls.innings || [];
    const gd = feed.gameData || {};
    const awayAbbr = (gd.teams && gd.teams.away && gd.teams.away.abbreviation) || 'AWY';
    const homeAbbr = (gd.teams && gd.teams.home && gd.teams.home.abbreviation) || 'HOM';

    if (!innings.length) {
      el.innerHTML = '<div style="color:var(--muted);">Linescore not yet available.</div>';
      return;
    }

    const headCols = innings.map((i) => `<th>${i.num}</th>`).join('');
    const awayCols = innings.map((i) => `<td>${i.away && i.away.runs !== undefined ? i.away.runs : '-'}</td>`).join('');
    const homeCols = innings.map((i) => `<td>${i.home && i.home.runs !== undefined ? i.home.runs : '-'}</td>`).join('');

    el.innerHTML = `
      <div style="overflow-x:auto;">
        <table class="linescore-table">
          <thead><tr><th>Team</th>${headCols}<th>R</th><th>H</th><th>E</th></tr></thead>
          <tbody>
            <tr><td><strong>${UI.esc(awayAbbr)}</strong></td>${awayCols}<td><strong>${ls.teams.away.runs ?? 0}</strong></td><td>${ls.teams.away.hits ?? 0}</td><td>${ls.teams.away.errors ?? 0}</td></tr>
            <tr><td><strong>${UI.esc(homeAbbr)}</strong></td>${homeCols}<td><strong>${ls.teams.home.runs ?? 0}</strong></td><td>${ls.teams.home.hits ?? 0}</td><td>${ls.teams.home.errors ?? 0}</td></tr>
          </tbody>
        </table>
      </div>
    `;
  }

  function renderPlays(feed) {
    const el = document.getElementById('plays-wrap');
    const plays = ((feed.liveData && feed.liveData.plays && feed.liveData.plays.allPlays) || []).slice().reverse();
    if (!plays.length) {
      el.innerHTML = '<div style="color:var(--muted);">No plays recorded yet.</div>';
      return;
    }
    el.innerHTML = plays.map((p) => {
      const about = p.about || {};
      const res = p.result || {};
      const hasReview = Boolean(p.reviewDetails) || (p.playEvents || []).some((e) => e.reviewDetails);
      return `
        <div class="play-item">
          <div class="play-head">
            <span>${UI.esc(about.halfInning || '')} ${about.inning || ''} · ${UI.esc(res.event || '')}</span>
            <span>${hasReview ? '<span class="pill pill-review">Review</span>' : ''} ${res.awayScore ?? 0}–${res.homeScore ?? 0}</span>
          </div>
          <div class="play-desc">${UI.esc(res.description || 'In progress…')}</div>
        </div>
      `;
    }).join('');
  }

  function renderBoxscore(feed) {
    const el = document.getElementById('boxscore-wrap');
    const box = (feed.liveData && feed.liveData.boxscore && feed.liveData.boxscore.teams) || {};
    if (!box.away || !box.home) {
      el.innerHTML = '<div style="color:var(--muted);">Box score not available yet.</div>';
      return;
    }
    const renderTeam = (teamData, label) => {
      const batters = (teamData.batters || []).map((id) => teamData.players && teamData.players[`ID${id}`]).filter(Boolean);
      const rows = batters.map((p) => {
        const s = (p.stats && p.stats.batting) || {};
        return `<tr><td>${UI.esc(p.person && p.person.fullName)}</td><td>${s.atBats ?? 0}</td><td>${s.runs ?? 0}</td><td>${s.hits ?? 0}</td><td>${s.rbi ?? 0}</td></tr>`;
      }).join('');
      return `
        <h4>${UI.esc(label)}</h4>
        <table class="boxscore-table">
          <thead><tr><th>Batter</th><th>AB</th><th>R</th><th>H</th><th>RBI</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    };
    el.innerHTML = renderTeam(box.away, 'Away Batting') + renderTeam(box.home, 'Home Batting');
  }

  function renderReviews(feed) {
    const items = Reviews.extractGameReviews(feed);
    const badge = document.getElementById('reviews-tab-count');
    if (badge) {
      badge.textContent = items.length;
      badge.style.display = items.length ? 'inline-block' : 'none';
    }
    const bannerWrap = document.getElementById('live-review-banner-wrap');
    const active = items.filter((i) => i.inProgress);
    if (bannerWrap) {
      bannerWrap.innerHTML = active.length
        ? `<div class="banner-box" style="margin-top:12px;">🚨 <strong>Active Review:</strong> ${UI.esc(active[0].label)} — ${UI.esc(active[0].reason)}</div>`
        : '';
    }
    const el = document.getElementById('reviews-wrap');
    if (!items.length) {
      el.innerHTML = '<div style="color:var(--muted);">No challenges or reviews in this game.</div>';
      return;
    }
    el.innerHTML = items.map((i) => `
      <div class="play-item">
        <div class="play-head">
          <span>${UI.esc(i.label)} · ${UI.esc(i.halfInning)} ${i.inning}</span>
          <span class="pill ${i.inProgress ? 'pill-review' : 'pill-final'}">${UI.esc(i.outcome)}</span>
        </div>
        <div class="play-desc">${UI.esc(i.reason)}</div>
      </div>
    `).join('');
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
