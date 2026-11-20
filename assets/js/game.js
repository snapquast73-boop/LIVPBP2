(function (global) {
  'use strict';

  const LIVE_POLL_MS = 3000;
  const REVIEW_POLL_MS = 1000;
  const PREVIEW_POLL_MS = 30000;
  const FINAL_POLL_MS = 60000;

  let gamePk = null;
  let currentFeed = null;
  let currentDate = null;
  let activeTab = 'plays';
  let boxscoreRendered = false;
  let initialLoaded = false;
  let pollTimer = null;
  let statusTimer = null;
  let countdownTimer = null;
  let nextPollAt = 0;
  let latestForecast = null;
  let lastForecastKey = '';
  let unsubscribeFeedLog = null;

  function init() {
    const params = new URLSearchParams(window.location.search);
    gamePk = params.get('gamePk');
    if (!gamePk) {
      document.getElementById('main').innerHTML =
        '<div class="panel">Missing <code>gamePk</code> parameter. <a href="index.html">Return to scoreboard</a>.</div>';
      return;
    }

    MLBAPI.getGameStatusRegistry().then((list) => {
      if (list) UI.registerGameStatusList(list);
    });

    setupTabs();
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        loadGame(false);
      });
    }

    loadGame(true);
    countdownTimer = setInterval(updateCountdown, 500);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopTimers();
      } else {
        loadGame(false);
      }
    });
  }

  function stopTimers() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
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

  function getGameState(feed) {
    return (feed && feed.gameData && feed.gameData.status && feed.gameData.status.abstractGameState) || 'Preview';
  }

  function scheduleNextPoll(feed) {
    stopTimers();
    if (document.hidden) return;
    const state = getGameState(feed);
    const inReview = Boolean(feed && feed.gameData && UI.isReviewStatus(feed.gameData.status));
    const baseDelay = state === 'Live'
      ? (inReview ? REVIEW_POLL_MS : LIVE_POLL_MS)
      : state === 'Preview' ? PREVIEW_POLL_MS : FINAL_POLL_MS;
    const delay = Math.max(MLBAPI.getRateLimitRemainingMs(), baseDelay);
    nextPollAt = Date.now() + delay;
    updateCountdown();
    pollTimer = setTimeout(() => loadGame(false), delay);

    if (state === 'Live' && !inReview) {
      statusTimer = setTimeout(pollStatusOnly, Math.max(MLBAPI.getRateLimitRemainingMs(), REVIEW_POLL_MS));
    }
  }

  async function pollStatusOnly() {
    if (document.hidden || !currentFeed || getGameState(currentFeed) !== 'Live') return;
    try {
      const data = await MLBAPI.getGameStatus(gamePk);
      const st = data && data.gameData && data.gameData.status;
      const prevCode = currentFeed.gameData && currentFeed.gameData.status && currentFeed.gameData.status.statusCode;
      if (st && st.statusCode && st.statusCode !== prevCode) {
        currentFeed.gameData.status = st;
        renderLiveReviewBanner(currentFeed);
        if (UI.isReviewStatus(st)) {
          loadGame(false);
          return;
        }
      }
    } catch (_) {
      // Fall back to regular full-feed poll
    } finally {
      if (!document.hidden && currentFeed && getGameState(currentFeed) === 'Live') {
        statusTimer = setTimeout(pollStatusOnly, Math.max(MLBAPI.getRateLimitRemainingMs(), REVIEW_POLL_MS));
      }
    }
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
        activeTab = btn.dataset.tab;
        Object.keys(panels).forEach((k) => {
          if (panels[k]) panels[k].style.display = k === activeTab ? '' : 'none';
        });
        if (activeTab === 'boxscore' && currentFeed && !boxscoreRendered) {
          renderBoxscore(currentFeed);
          boxscoreRendered = true;
        }
      });
    });
  }

  function subscribeLogForDate(dateStr) {
    if (!dateStr || dateStr === currentDate || !global.FeedLog) return;
    currentDate = dateStr;
    if (unsubscribeFeedLog) {
      unsubscribeFeedLog();
      unsubscribeFeedLog = null;
    }
    FeedLog.fetchRemoteLog(currentDate).then(() => {
      if (currentFeed) renderReviews(currentFeed);
    });
    unsubscribeFeedLog = FeedLog.subscribe(currentDate, () => {
      if (currentFeed) renderReviews(currentFeed);
    });
  }

  async function loadGame(showSpinner) {
    const loading = document.getElementById('loading');
    const statusLine = document.getElementById('status-line');
    if (showSpinner && !initialLoaded && loading) loading.classList.add('show');
    try {
      const feed = await MLBAPI.getGameLive(gamePk);
      currentFeed = feed;
      initialLoaded = true;
      boxscoreRendered = false;

      const officialDate = feed.gameData && feed.gameData.datetime && feed.gameData.datetime.officialDate;
      if (officialDate) subscribeLogForDate(officialDate);

      renderHeader(feed);
      renderLivePanel(feed);
      renderLinescore(feed);
      renderPlays(feed);
      if (activeTab === 'boxscore') {
        renderBoxscore(feed);
        boxscoreRendered = true;
      }
      renderLiveReviewBanner(feed);
      renderReviews(feed);
      refreshForecast(feed);

      if (statusLine) {
        statusLine.textContent = `Updated ${new Date().toLocaleTimeString()} · Game #${gamePk}`;
      }
      scheduleNextPoll(feed);
    } catch (err) {
      console.error(err);
      if (statusLine) statusLine.textContent = `Error loading game: ${err.message}`;
      scheduleNextPoll(currentFeed);
    } finally {
      if (loading) loading.classList.remove('show');
    }
  }

  async function refreshForecast(feed) {
    if (!global.Props) return;
    const plays = (feed && feed.liveData && feed.liveData.plays) || {};
    const cp = plays.currentPlay || {};
    const m = cp.matchup || {};
    const c = cp.count || {};
    const key = `${m.batter && m.batter.id}:${m.pitcher && m.pitcher.id}:${c.balls}:${c.strikes}:${cp.about && cp.about.atBatIndex}:${cp.about && cp.about.isComplete}`;
    if (key === lastForecastKey && latestForecast) {
      Props.render(feed, document.getElementById('props-wrap'), latestForecast);
      return;
    }
    lastForecastKey = key;
    const res = await Props.loadMatchupForecast(feed);
    latestForecast = res;
    Props.render(feed, document.getElementById('props-wrap'), res);
    const liveBadgeEl = document.getElementById('live-forecast-slot');
    if (liveBadgeEl && res) {
      liveBadgeEl.innerHTML = Props.renderForecastBadge(res);
    }
  }

  function renderHeader(feed) {
    const gd = feed.gameData || {};
    const ls = (feed.liveData && feed.liveData.linescore) || {};
    const away = (gd.teams && gd.teams.away) || {};
    const home = (gd.teams && gd.teams.home) || {};
    const awayScore = ls.teams && ls.teams.away && ls.teams.away.runs !== undefined ? ls.teams.away.runs : '—';
    const homeScore = ls.teams && ls.teams.home && ls.teams.home.runs !== undefined ? ls.teams.home.runs : '—';
    const status = gd.status || {};
    const state = status.abstractGameState || '';
    const detail = state === 'Live'
      ? `${ls.inningState || ls.inningHalf || ''} ${ls.currentInningOrdinal || ''}`.trim() || status.detailedState
      : (status.detailedState || '');

    document.title = `${away.abbreviation || 'AWY'} @ ${home.abbreviation || 'HOM'} — MLB Live PBP`;

    const awayRec = away.record ? `${away.record.wins}-${away.record.losses}` : '';
    const homeRec = home.record ? `${home.record.wins}-${home.record.losses}` : '';

    document.getElementById('header-away').innerHTML = `
      ${UI.teamLogoImg(away.id, 'team-logo', 'width:38px;height:38px;')}
      <div>
        <div style="font-weight:700;font-size:16px;">${UI.esc(away.name || 'Away')}</div>
        <div style="color:var(--muted);font-size:12px;">${UI.esc(away.abbreviation || '')}${awayRec ? ` · ${UI.esc(awayRec)}` : ''}</div>
      </div>
    `;
    document.getElementById('header-center').innerHTML = `
      <div class="header-score">${UI.esc(awayScore)} – ${UI.esc(homeScore)}</div>
      <div style="color:var(--muted);font-size:12px;">${UI.esc(detail)}</div>
    `;
    document.getElementById('header-home').innerHTML = `
      <div>
        <div style="font-weight:700;font-size:16px;">${UI.esc(home.name || 'Home')}</div>
        <div style="color:var(--muted);font-size:12px;">${UI.esc(home.abbreviation || '')}${homeRec ? ` · ${UI.esc(homeRec)}` : ''}</div>
      </div>
      ${UI.teamLogoImg(home.id, 'team-logo', 'width:38px;height:38px;')}
    `;
    document.getElementById('header-away').className = 'header-side';
    document.getElementById('header-home').className = 'header-side home';

    const metaParts = [];
    if (gd.venue && gd.venue.name) metaParts.push(gd.venue.name);
    if (gd.datetime && gd.datetime.dateTime) metaParts.push(UI.formatTime(gd.datetime.dateTime));
    if (gd.weather && (gd.weather.temp || gd.weather.condition)) {
      const wParts = [];
      if (gd.weather.temp) wParts.push(`${gd.weather.temp}°F`);
      if (gd.weather.condition) wParts.push(gd.weather.condition);
      if (gd.weather.wind) wParts.push(gd.weather.wind);
      metaParts.push(wParts.join(', '));
    }
    document.getElementById('header-meta').textContent = metaParts.join(' · ');

    // Decisions (Final) or Probable Pitchers (Preview)
    const decEl = document.getElementById('header-decisions');
    if (decEl) {
      const dec = (feed.liveData && feed.liveData.decisions) || {};
      const decParts = [];
      if (dec.winner && dec.winner.fullName) decParts.push(`W: ${dec.winner.fullName}`);
      if (dec.loser && dec.loser.fullName) decParts.push(`L: ${dec.loser.fullName}`);
      if (dec.save && dec.save.fullName) decParts.push(`S: ${dec.save.fullName}`);
      if (decParts.length) {
        decEl.textContent = decParts.join(' · ');
      } else if (gd.probablePitchers) {
        const ap = gd.probablePitchers.away && gd.probablePitchers.away.fullName;
        const hp = gd.probablePitchers.home && gd.probablePitchers.home.fullName;
        decEl.textContent = (ap || hp) ? `Probables: ${ap || 'TBD'} vs ${hp || 'TBD'}` : '';
      } else {
        decEl.textContent = '';
      }
    }
  }

  function findPlayerBoxStats(feed, playerId) {
    if (!playerId || !feed || !feed.liveData || !feed.liveData.boxscore || !feed.liveData.boxscore.teams) return null;
    const teams = feed.liveData.boxscore.teams;
    const key = `ID${playerId}`;
    return (teams.away && teams.away.players && teams.away.players[key]) ||
      (teams.home && teams.home.players && teams.home.players[key]) || null;
  }

  function renderLivePanel(feed) {
    const el = document.getElementById('live-panel');
    if (!el) return;
    const gd = feed.gameData || {};
    const ls = (feed.liveData && feed.liveData.linescore) || {};
    const plays = (feed.liveData && feed.liveData.plays) || {};
    const cp = plays.currentPlay || {};
    const allPlays = plays.allPlays || [];
    const count = cp.count || {};
    const matchup = cp.matchup || {};
    const batter = matchup.batter || {};
    const pitcher = matchup.pitcher || {};
    const offense = ls.offense || {};

    const bBox = findPlayerBoxStats(feed, batter.id);
    const pBox = findPlayerBoxStats(feed, pitcher.id);
    const bLine = bBox && bBox.stats && bBox.stats.batting && bBox.stats.batting.summary ? bBox.stats.batting.summary : '';
    const pStat = pBox && pBox.stats && pBox.stats.pitching ? pBox.stats.pitching : null;
    const pLine = pStat
      ? `${pStat.inningsPitched || '0.0'} IP${pStat.numberOfPitches !== undefined ? ` · ${pStat.numberOfPitches} P` : ''}${pStat.strikes !== undefined ? ` (${pStat.strikes} S)` : ''}`
      : '';

    const lastCompleted = [...allPlays].reverse().find((p) => p && p.about && p.about.isComplete && p.result && p.result.description);
    const counters = Reviews.extractChallengeCounters(feed);
    const awayAbbr = gd.teams && gd.teams.away ? gd.teams.away.abbreviation : 'AWY';
    const homeAbbr = gd.teams && gd.teams.home ? gd.teams.home.abbreviation : 'HOM';
    const counterSummary = Reviews.formatBothTeamsCounterSummary(awayAbbr, homeAbbr, counters);

    const onDeck = offense.onDeck && offense.onDeck.fullName;
    const inHole = offense.inHole && offense.inHole.fullName;

    el.innerHTML = `
      <div class="live-grid">
        <div class="live-players">
          <div class="player-mini">
            ${batter.id ? `<img class="player-headshot" src="${UI.esc(UI.playerHeadshotUrl(batter.id))}" alt="" loading="lazy">` : ''}
            <div>
              <div class="stat-lbl">At Bat ${matchup.batSide ? `(${UI.esc(matchup.batSide.code)})` : ''}</div>
              <div class="player-name">${UI.esc(batter.fullName || '—')}</div>
              ${bLine ? `<div class="player-line">${UI.esc(bLine)}</div>` : ''}
            </div>
          </div>
          <div class="player-mini">
            ${pitcher.id ? `<img class="player-headshot" src="${UI.esc(UI.playerHeadshotUrl(pitcher.id))}" alt="" loading="lazy">` : ''}
            <div>
              <div class="stat-lbl">Pitching ${matchup.pitchHand ? `(${UI.esc(matchup.pitchHand.code)})` : ''}</div>
              <div class="player-name">${UI.esc(pitcher.fullName || '—')}</div>
              ${pLine ? `<div class="player-line">${UI.esc(pLine)}</div>` : ''}
            </div>
          </div>
        </div>
        <div class="live-state">
          ${UI.renderCountDots(count.balls, count.strikes, ls.outs ?? count.outs)}
          ${UI.renderBaseDiamond(offense, 50)}
          <div class="live-count-text">
            <strong>Count:</strong> ${UI.esc(count.balls ?? '')}-${UI.esc(count.strikes ?? '')}
            · <strong>Outs:</strong> ${UI.esc(ls.outs ?? count.outs ?? '')}
          </div>
        </div>
      </div>
      <div id="live-forecast-slot">${latestForecast ? Props.renderForecastBadge(latestForecast) : ''}</div>
      ${(onDeck || inHole) ? `
        <div class="live-queue">
          ${onDeck ? `<span><strong>On Deck:</strong> ${UI.esc(onDeck)}</span>` : ''}
          ${inHole ? `<span><strong>In the Hole:</strong> ${UI.esc(inHole)}</span>` : ''}
        </div>
      ` : ''}
      ${counterSummary ? `<div class="counter-summary-line">${UI.esc(counterSummary)}</div>` : ''}
      ${lastCompleted ? `<div class="last-play-line"><strong>Last play:</strong> ${UI.esc(lastCompleted.result.description)}</div>` : ''}
    `;
  }

  function dataRow(values, firstCellBold) {
    const missing = values.some((value) => value === null || value === undefined || value === '');
    const url = MLBAPI.gameFeedUrl(gamePk);
    const cells = values.map((value, idx) => {
      const content = UI.esc(value);
      return `<td>${idx === 0 && firstCellBold ? `<strong>${content}</strong>` : content}</td>`;
    }).join('');
    return `<tr>${cells}<td><a href="${UI.esc(url)}" target="_blank" rel="noopener">MLB feed</a>${missing ? ' · Blank fields unverified' : ''}</td></tr>`;
  }

  function renderLinescore(feed) {
    const el = document.getElementById('linescore-wrap');
    const ls = (feed.liveData && feed.liveData.linescore) || {};
    const innings = ls.innings || [];
    if (!innings.length) {
      el.innerHTML = '<div style="color:var(--muted);">Linescore not yet available.</div>';
      return;
    }

    const headCols = innings.map((i) => `<th>${UI.esc(i.num)}</th>`).join('');
    const teamRow = (side) => dataRow([
      feed.gameData && feed.gameData.teams && feed.gameData.teams[side] ? feed.gameData.teams[side].abbreviation : null,
      ...innings.map((i) => (i[side] && i[side].runs !== undefined ? i[side].runs : null)),
      ...['runs', 'hits', 'errors'].map((key) => (ls.teams && ls.teams[side] ? ls.teams[side][key] : null)),
    ], true);

    el.innerHTML = `
      <div style="overflow-x:auto;">
        <table class="linescore-table">
          <thead><tr><th>Team</th>${headCols}<th>R</th><th>H</th><th>E</th><th>Source</th></tr></thead>
          <tbody>
            ${teamRow('away')}${teamRow('home')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderPlayPitches(events) {
    const pitches = (events || []).filter((e) => e && (e.isPitch || e.reviewDetails));
    if (!pitches.length) return '';
    const rows = pitches.map((ev, idx) => {
      const d = ev.details || {};
      const callCode = (d.call && d.call.code) || d.code || '';
      const callDesc = (d.call && d.call.description) || d.description || '';
      const pType = d.type && d.type.description ? d.type.description : '';
      const speed = ev.pitchData && ev.pitchData.startSpeed ? `${Number(ev.pitchData.startSpeed).toFixed(1)} mph` : '';
      const cnt = ev.count ? `${ev.count.balls ?? ''}-${ev.count.strikes ?? ''}` : '';
      const badgeCls = callCode === 'B' || callCode === '*B' ? 'pitch-ball'
        : callCode === 'X' || callCode === 'D' || callCode === 'E' ? 'pitch-inplay'
          : 'pitch-strike';
      const revChip = ev.reviewDetails
        ? `<span class="pill pill-review">${UI.esc(Reviews.classifyReview(ev.reviewDetails, d).label)} · ${UI.esc(Reviews.parseOutcomeLabel(ev.reviewDetails, ''))}</span>`
        : '';
      return `
        <div class="pitch-row">
          <span class="pitch-num">#${idx + 1}</span>
          <span class="pitch-badge ${badgeCls}">${UI.esc(callDesc)}</span>
          <span class="pitch-meta">${UI.esc([pType, speed, cnt].filter(Boolean).join(' · '))}</span>
          ${revChip}
        </div>
      `;
    }).join('');
    return `<details class="pitch-details"><summary>Pitches (${pitches.length})</summary><div class="pitch-list">${rows}</div></details>`;
  }

  function renderPlays(feed) {
    const el = document.getElementById('plays-wrap');
    const plays = ((feed.liveData && feed.liveData.plays && feed.liveData.plays.allPlays) || []).slice().reverse();
    if (!plays.length) {
      el.innerHTML = '<div style="color:var(--muted);">No plays recorded yet.</div>';
      return;
    }

    let lastHalfKey = '';
    el.innerHTML = plays.map((p) => {
      const about = p.about || {};
      const res = p.result || {};
      const halfKey = `${about.halfInning || ''}-${about.inning || ''}`;
      const divider = halfKey !== lastHalfKey
        ? `<div class="inning-divider">${UI.esc(UI.formatInningShort(about.halfInning, about.inning))}</div>`
        : '';
      lastHalfKey = halfKey;

      const revList = [];
      if (p.reviewDetails) revList.push(p.reviewDetails);
      (p.playEvents || []).forEach((e) => { if (e && e.reviewDetails) revList.push(e.reviewDetails); });
      const reviewChips = revList.map((rd) => {
        const cls = Reviews.classifyReview(rd, null, res.description);
        const out = Reviews.parseOutcomeLabel(rd, res.description);
        return `<span class="pill ${rd.inProgress ? 'pill-review' : rd.isOverturned ? 'pill-risk' : 'pill-final'}">${UI.esc(cls.label)}: ${UI.esc(out)}</span>`;
      }).join(' ');

      const hitEv = (p.playEvents || []).find((e) => e && e.hitData);
      const hitBits = [];
      if (hitEv && hitEv.hitData) {
        if (hitEv.hitData.launchSpeed) hitBits.push(`${hitEv.hitData.launchSpeed} mph`);
        if (hitEv.hitData.launchAngle !== undefined) hitBits.push(`${hitEv.hitData.launchAngle}°`);
        if (hitEv.hitData.totalDistance) hitBits.push(`${hitEv.hitData.totalDistance} ft`);
      }

      return `
        ${divider}
        <div class="play-item ${revList.length ? 'play-reviewed' : ''}">
          <div class="play-head">
            <span>${UI.esc(UI.formatInningShort(about.halfInning, about.inning))} · <strong>${UI.esc(res.event || 'At Bat')}</strong></span>
            <span class="play-head-right">${reviewChips} <span class="play-score">${UI.esc(res.awayScore ?? '')}–${UI.esc(res.homeScore ?? '')}</span></span>
          </div>
          <div class="play-desc">${UI.esc(res.description || 'In progress…')}</div>
          ${hitBits.length ? `<div class="play-hit-meta">Statcast: ${UI.esc(hitBits.join(' · '))}</div>` : ''}
          ${renderPlayPitches(p.playEvents)}
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

    const renderTeamBatting = (teamData, label) => {
      const ids = (teamData.batters || []);
      const batters = ids
        .map((id) => teamData.players && teamData.players[`ID${id}`])
        .filter((p) => p && p.stats && p.stats.batting && Object.keys(p.stats.batting).length > 0);
      if (!batters.length) return `<h4>${UI.esc(label)}</h4><p style="color:var(--muted);">No batting stats recorded yet.</p>`;
      const rows = batters.map((p) => {
        const s = p.stats.batting || {};
        const seasonAvg = p.seasonStats && p.seasonStats.batting ? p.seasonStats.batting.avg : null;
        return dataRow([
          p.person ? p.person.fullName : null,
          p.position ? p.position.abbreviation : null,
          s.atBats,
          s.runs,
          s.hits,
          s.rbi,
          s.baseOnBalls,
          s.strikeOuts,
          seasonAvg,
        ], false);
      }).join('');
      return `
        <h4>${UI.esc(label)}</h4>
        <div style="overflow-x:auto;">
          <table class="boxscore-table">
            <thead><tr><th>Batter</th><th>Pos</th><th>AB</th><th>R</th><th>H</th><th>RBI</th><th>BB</th><th>SO</th><th>AVG</th><th>Source</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    };

    const renderTeamPitching = (teamData, label) => {
      const ids = (teamData.pitchers || []);
      const pitchers = ids
        .map((id) => teamData.players && teamData.players[`ID${id}`])
        .filter((p) => p && p.stats && p.stats.pitching && Object.keys(p.stats.pitching).length > 0);
      if (!pitchers.length) return `<h4>${UI.esc(label)}</h4><p style="color:var(--muted);">No pitching stats recorded yet.</p>`;
      const rows = pitchers.map((p) => {
        const s = p.stats.pitching || {};
        const seasonEra = p.seasonStats && p.seasonStats.pitching ? p.seasonStats.pitching.era : null;
        const ps = (s.numberOfPitches !== undefined && s.strikes !== undefined)
          ? `${s.numberOfPitches}-${s.strikes}`
          : null;
        return dataRow([
          p.person ? p.person.fullName : null,
          s.inningsPitched,
          s.hits,
          s.runs,
          s.earnedRuns,
          s.baseOnBalls,
          s.strikeOuts,
          s.homeRuns,
          ps,
          seasonEra,
        ], false);
      }).join('');
      return `
        <h4>${UI.esc(label)}</h4>
        <div style="overflow-x:auto;">
          <table class="boxscore-table">
            <thead><tr><th>Pitcher</th><th>IP</th><th>H</th><th>R</th><th>ER</th><th>BB</th><th>SO</th><th>HR</th><th>P-S</th><th>ERA</th><th>Source</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    };

    const awayName = (box.away.team && box.away.team.name) || 'Away';
    const homeName = (box.home.team && box.home.team.name) || 'Home';

    el.innerHTML =
      renderTeamBatting(box.away, `${awayName} Batting`) +
      renderTeamBatting(box.home, `${homeName} Batting`) +
      renderTeamPitching(box.away, `${awayName} Pitching`) +
      renderTeamPitching(box.home, `${homeName} Pitching`);
  }

  function renderLiveReviewBanner(feed) {
    const bannerWrap = document.getElementById('live-review-banner-wrap');
    if (!bannerWrap) return;
    const statusMeta = feed && feed.gameData ? UI.describeReviewStatus(feed.gameData.status) : null;
    const items = Reviews.extractGameReviews(feed);
    const active = items.filter((i) => i.inProgress);

    if (statusMeta) {
      bannerWrap.innerHTML = `
        <div class="banner-box" style="margin-top:12px;">
          🚨 <strong>Under Review (${UI.esc(statusMeta.label)}):</strong> ${UI.esc(statusMeta.reason)}
          ${active.length && active[0].runsAtRisk > 0 ? ` · <span class="pill pill-risk">⚠️ ${active[0].runsAtRisk} Run(s) at Risk</span>` : ''}
        </div>
      `;
      return;
    }
    if (active.length) {
      bannerWrap.innerHTML = `
        <div class="banner-box" style="margin-top:12px;">
          🚨 <strong>Active Review:</strong> ${UI.esc(active[0].label)} — ${UI.esc(active[0].reason)}
          ${active[0].runsAtRisk > 0 ? ` · <span class="pill pill-risk">⚠️ ${active[0].runsAtRisk} Run(s) at Risk</span>` : ''}
        </div>
      `;
      return;
    }
    bannerWrap.innerHTML = '';
  }

  function renderReviews(feed) {
    const items = Reviews.extractGameReviews(feed);
    const scoringChanges = (global.FeedLog && currentDate)
      ? FeedLog.getScoringChangesForGame(currentDate, gamePk)
      : [];
    const combined = [...items, ...scoringChanges];

    const badge = document.getElementById('reviews-tab-count');
    if (badge) {
      badge.textContent = combined.length;
      badge.style.display = combined.length ? 'inline-block' : 'none';
    }

    const el = document.getElementById('reviews-wrap');
    if (!el) return;

    const gd = feed.gameData || {};
    const awayAbbr = gd.teams && gd.teams.away ? gd.teams.away.abbreviation : 'AWY';
    const homeAbbr = gd.teams && gd.teams.home ? gd.teams.home.abbreviation : 'HOM';
    const counters = Reviews.extractChallengeCounters(feed);
    const counterSummary = Reviews.formatBothTeamsCounterSummary(awayAbbr, homeAbbr, counters);

    const resolvedReviews = items.filter((i) => !i.inProgress && i.category !== 'os_pending');
    const overturnedCount = resolvedReviews.filter((i) => i.isOverturned).length;
    const overturnPct = resolvedReviews.length ? `${Math.round((overturnedCount / resolvedReviews.length) * 100)}%` : '—';
    const absCount = items.filter((i) => i.category === 'abs').length;
    const mgrCount = items.filter((i) => i.category === 'challenge').length;

    const summaryHtml = `
      <div class="reviews-summary-bar" style="margin-top:0; margin-bottom:12px;">
        <div class="stat-box"><div class="stat-val">${items.length}</div><div class="stat-lbl">Total Reviews</div></div>
        <div class="stat-box"><div class="stat-val">${mgrCount}</div><div class="stat-lbl">Manager Challenges</div></div>
        <div class="stat-box"><div class="stat-val">${absCount}</div><div class="stat-lbl">ABS Challenges</div></div>
        <div class="stat-box"><div class="stat-val">${overturnPct}</div><div class="stat-lbl">Overturn Rate</div></div>
        <div class="stat-box"><div class="stat-val">${scoringChanges.length}</div><div class="stat-lbl">Scoring Changes</div></div>
      </div>
      ${counterSummary ? `<div class="counter-summary-line" style="margin-bottom:10px;">${UI.esc(counterSummary)}</div>` : ''}
    `;

    if (!combined.length) {
      el.innerHTML = summaryHtml + '<div style="color:var(--muted);">No challenges, reviews, or scoring changes recorded in this game.</div>';
      return;
    }

    const rowsHtml = combined.map((i) => {
      const absInfo = i.absContext
        ? `<div class="review-meta-line">ABS Pitch: ${UI.esc(i.absContext.beforeCount)} → ${UI.esc(i.absContext.afterCount || '—')} (${UI.esc(i.absContext.callDesc)})${i.challengerRole ? ` · Challenged by: ${UI.esc(i.challengerRole)}` : ''}</div>`
        : '';
      const counterLine = i.counterLine
        ? `<div class="review-meta-line" title="${UI.esc(i.bothTeamsCounterSummary || '')}">${UI.esc(i.counterLine)}</div>`
        : '';
      const scoringMeta = i.category === 'scoring_change'
        ? `<div class="review-meta-line">Official ruling change: <strong>${UI.esc(i.initialCall || '')} → ${UI.esc(i.finalRuling || '')}</strong> · <a href="https://www.mlb.com/official-information/scoring-changes" target="_blank" rel="noopener">MLB Scoring Changes</a></div>`
        : '';
      return `
        <div class="play-item">
          <div class="play-head">
            <span>
              <strong>${UI.esc(i.label)}</strong>
              ${i.challengerAbbr ? ` (${UI.esc(i.challengerAbbr)})` : ''}
              · ${UI.esc(UI.formatInningShort(i.halfInning, i.inning))}
              ${i.officialReason ? ` · ${UI.esc(i.officialReason)}` : ''}
            </span>
            <span class="pill ${i.inProgress ? 'pill-review' : i.isOverturned ? 'pill-risk' : 'pill-final'}">${UI.esc(i.outcome)}</span>
          </div>
          <div class="play-desc">${UI.esc(i.reason)}</div>
          ${absInfo}
          ${scoringMeta}
          ${counterLine}
        </div>
      `;
    }).join('');

    el.innerHTML = summaryHtml + rowsHtml;
  }

  global.GamePage = {
    LIVE_POLL_MS,
    REVIEW_POLL_MS,
    PREVIEW_POLL_MS,
    FINAL_POLL_MS,
  };
  document.addEventListener('DOMContentLoaded', init);
})(window);
