/* ============================================================================
 * game.js — the Game page (game.html?gamePk=<id>).
 *
 * One full request per poll: GET /api/v1.1/game/{gamePk}/feed/live
 *   liveData.plays.allPlays[]  → play-by-play, reviews, current at-bat
 *   liveData.linescore         → inning lines, count, outs, base runners
 *   liveData.boxscore          → batting/pitching lines
 *   liveData.decisions         → W/L/S
 *   gameData.teams/players     → names, records, venue, status, hands
 *
 * Plus one lean status probe while a game is live (STATUS_PROBE_MS):
 *   GET /api/v1.1/game/{gamePk}/feed/live?fields=gameData,status,…
 * MLB flips `status.statusCode` the instant a review is CALLED, but the play
 * description only appears when the review RESOLVES, so the review banner can
 * be painted from the ~150-byte probe long before the next full feed lands.
 * The projection and response shape are verified in docs/verification-report.md
 * and on flagged.html; the probe is skipped entirely once a game is Final.
 *
 * After a game goes Final the page keeps re-reading the feed inside a bounded
 * grace window (POST_FINAL_*), because the Official Scorer and the Elias Sports
 * Bureau publish rulings - and MLB publishes scoring changes - AFTER the last
 * pitch (https://www.mlb.com/official-information/scoring-changes). The cadence
 * is the one the uploaded README documents: 1 s for the first two minutes,
 * 2.5 s to five minutes, then 15 s to the end of the 30-minute window.
 *
 * The page only rebuilds the DOM when the baseball state actually changes, and
 * pauses entirely while the tab is hidden.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var LIVE_POLL_MS = 3000;
  var IDLE_POLL_MS = 30000;
  var FINAL_POLL_MS = 30000;
  var STATUS_PROBE_MS = 5000;

  // Post-Final scorer-ruling grace window (uploaded README's documented tiers).
  var POST_FINAL_GRACE_MS = 30 * 60 * 1000;
  var POST_FINAL_TIERS = [
    { untilMs: 2 * 60 * 1000, pollMs: 1000 },
    { untilMs: 5 * 60 * 1000, pollMs: 2500 },
    { untilMs: POST_FINAL_GRACE_MS, pollMs: 15000 },
  ];

  // Lean per-game status projection. `fields` is leaf-name based, so every key
  // the probe reads is named explicitly (same lesson as FEED_FIELDS in
  // reviews-feed.js).
  var STATUS_FIELDS = 'gameData,game,pk,status,abstractGameState,codedGameState,' +
    'detailedState,statusCode,reason,startTimeTBD,abstractGameCode,datetime,dateTime,' +
    'officialDate,endTime';

  var gamePk = null;
  var pollTimer = null;
  var ticker = null;
  var countdown = 0;
  var probeTimer = null;
  var lastSignature = '';
  var lastFeed = null;
  var lastReviews = [];
  var lastProbeStatus = null;
  var finalObservedAt = null;
  var graceEnded = false;
  var missingGame = false;
  var started = false;
  var latestRequest = 0;
  var registryReady = Promise.resolve();

  function init() {
    var params = new URLSearchParams(window.location.search);
    gamePk = params.get('gamePk');
    if (!gamePk) {
      var main = document.getElementById('main');
      if (main) {
        main.innerHTML = '<div class="panel">Missing <code>gamePk</code> parameter. ' +
          '<a href="index.html">Return to the scoreboard</a>.</div>';
      }
      return;
    }
    setupTabs();
    registryReady = MLBAPI.getGameStatusRegistry()
      .then(function (rows) { Reviews.buildStatusMap(rows); })
      .catch(function (err) { console.warn('gameStatus registry unavailable', err); });
    var refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () { loadGame(); });
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stopAllTimers();
      else loadGame();
    });
    loadGame();
  }

  function setupTabs() {
    var buttons = document.querySelectorAll('.tabs-game .tab-btn');
    var panels = {
      plays: document.getElementById('panel-plays'),
      boxscore: document.getElementById('panel-boxscore'),
      props: document.getElementById('panel-props'),
      reviews: document.getElementById('panel-reviews'),
    };
    Array.prototype.forEach.call(buttons, function (btn) {
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(buttons, function (b) { b.classList.remove('tab-on'); });
        btn.classList.add('tab-on');
        var target = btn.dataset.tab;
        Object.keys(panels).forEach(function (k) {
          if (panels[k]) panels[k].style.display = k === target ? '' : 'none';
        });
        if (target === 'props' && lastFeed) {
          Props.render(lastFeed, document.getElementById('props-wrap'));
        }
      });
    });
  }

  function stopTimer() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    if (ticker) { clearInterval(ticker); ticker = null; }
  }

  /** Stop every clock — used when the tab is hidden or the game is unknown. */
  function stopAllTimers() {
    stopTimer();
    stopProbe();
  }

  function stopProbe() {
    if (probeTimer) { clearTimeout(probeTimer); probeTimer = null; }
  }

  /**
   * Lean per-game status probe. Returns the projected `gameData` or null.
   * Any failure is swallowed: the probe is an optimisation over the full feed,
   * never the source of truth for anything else on the page.
   */
  function probeStatus() {
    if (!gamePk) return Promise.resolve(null);
    return MLBAPI.getGameLive(gamePk, { fields: STATUS_FIELDS, retries: 0, timeout: 8000 })
      .then(function (data) {
        var gd = (data && data.gameData) || null;
        return gd && gd.status ? gd : null;
      })
      .catch(function () { return null; });
  }

  /** How often the lean probe should run, given what the full feed last said. */
  function probeDelay(feed) {
    var state = (feed && feed.gameData && feed.gameData.status &&
      feed.gameData.status.abstractGameState) || 'Preview';
    return state === 'Live' ? STATUS_PROBE_MS : IDLE_POLL_MS;
  }

  /**
   * Official game status rendered from the lean probe alone. MLB flips the
   * status code the moment a review is called, so this paints the banner and
   * the tab badge while the full feed is still in flight. It never invents a
   * review: the code is validated against the API's own /gameStatus registry
   * (Reviews.isReviewStatus) exactly as the scoreboard does.
   */
  function applyProbeStatus(gameData) {
    if (!gameData || !gameData.status) return;
    var status = gameData.status;
    var sig = [status.statusCode, status.detailedState, status.reason,
      status.abstractGameState].join('|');
    if (sig === lastProbeStatus) return;
    lastProbeStatus = sig;

    var code = status.statusCode;
    var inReview = (code && Reviews.isReviewStatus(code)) ||
      (gameData.flags && gameData.flags.inReview === true);
    var bannerWrap = document.getElementById('live-review-banner-wrap');
    var statusLine = document.getElementById('status-line');

    if (inReview) {
      var label = (status.detailedState || 'Review');
      var reason = status.reason ? ' · ' + status.reason : '';
      if (bannerWrap) {
        bannerWrap.innerHTML = '<div class="review-banner">🚨 <strong>Under review now</strong> — ' +
          UI.esc(label) + UI.esc(reason) + ' <span class="muted">(official game status ' +
          UI.esc(code) + ', read from the lean status probe)</span></div>';
      }
    } else if (status.abstractGameState === 'Live' || status.abstractGameState === 'Final') {
      // Leave a resolved full-feed banner alone; clear only a probe-painted one.
      if (bannerWrap && /lean status probe/.test(bannerWrap.innerHTML)) bannerWrap.innerHTML = '';
    }

    // While a review is in progress the official status IS the headline (MLB
    // flips it the instant a review is called), so it goes on the status line.
    // Otherwise the full feed owns that line -- it carries the update time.
    if (statusLine && inReview) {
      statusLine.textContent = 'Official status: ' + (status.detailedState || code) +
        (status.reason ? ' (' + status.reason + ')' : '');
    }
  }

  // Only ONE probe loop may exist. loadGame() calls scheduleProbe() after every
  // full feed, so without this guard a slow probe would be cancelled and
  // restarted by each poll and could never fire.
  function scheduleProbe(feed) {
    if (probeTimer || !gamePk || missingGame) return;
    var delay = probeDelay(feed);
    probeTimer = setTimeout(function () {
      probeTimer = null;
      probeStatus().then(function (gameData) {
        applyProbeStatus(gameData);
        scheduleProbe(lastFeed);
      });
    }, delay);
  }

  /**
   * Arm the next poll. The countdown is display-only; the fetch itself is
   * scheduled by a separate timer, so the page keeps updating while a game is
   * live (a countdown that only counts down and restarts never refreshes).
   */
  function startTimer(delayMs) {
    stopTimer();
    countdown = Math.round(delayMs / 1000);
    paintCountdown();
    ticker = setInterval(function () {
      countdown -= 1;
      paintCountdown();
    }, 1000);
    pollTimer = setTimeout(loadGame, delayMs);
  }

  function paintCountdown() {
    var el = document.getElementById('countdown');
    if (el) el.textContent = countdown > 0 ? countdown + 's' : '';
  }

  function stateSignature(feed) {
    var ls = (feed.liveData && feed.liveData.linescore) || {};
    var plays = (feed.liveData && feed.liveData.plays) || {};
    var current = plays.currentPlay || {};
    return [
      (feed.gameData && feed.gameData.status && feed.gameData.status.detailedState) || '',
      ls.currentInning, ls.inningHalf, ls.outs,
      (ls.teams && ls.teams.away && ls.teams.away.runs), (ls.teams && ls.teams.home && ls.teams.home.runs),
      (current.count && current.count.balls), (current.count && current.count.strikes),
      (plays.allPlays || []).length,
      (current.about && current.about.atBatIndex),
      lastReviews.map(function (r) { return r.id + ':' + r.inProgress + ':' + r.isOverturned; }).join(','),
    ].join('|');
  }

  /**
   * Post-Final re-scan cadence. Rulings and scoring changes are published after
   * the last pitch, so the page keeps reading the feed on the tiers the uploaded
   * README documents until the bounded grace window closes, then falls back to
   * the idle cadence.
   */
  function postFinalDelay() {
    if (finalObservedAt === null) finalObservedAt = Date.now();
    var elapsed = Date.now() - finalObservedAt;
    for (var i = 0; i < POST_FINAL_TIERS.length; i += 1) {
      if (elapsed < POST_FINAL_TIERS[i].untilMs) return POST_FINAL_TIERS[i].pollMs;
    }
    graceEnded = true;
    return FINAL_POLL_MS;
  }

  function pollDelay(feed) {
    var state = (feed && feed.gameData && feed.gameData.status &&
      feed.gameData.status.abstractGameState) || 'Preview';
    if (state === 'Live') return LIVE_POLL_MS;
    if (state === 'Final') return postFinalDelay();
    return IDLE_POLL_MS;
  }

  /**
   * Unknown gamePk. Says so plainly instead of showing an empty "Away / Home"
   * page, and stops polling: every retry would get the same answer.
   */
  function showMissingGame() {
    missingGame = true;
    stopAllTimers();
    var loading = document.getElementById('loading');
    if (loading) loading.classList.remove('show');
    var status = document.getElementById('status-line');
    if (status) status.textContent = '';
    var main = document.getElementById('main');
    if (main) {
      main.innerHTML = '<div class="panel"><div class="panel-title">Game not found</div>' +
        '<p>The MLB StatsAPI has no game with <code>gamePk=' +
        UI.esc(String(gamePk).replace(/[^0-9]/g, '')) + '</code>. Nothing was rendered ' +
        'because there is no data to render.</p>' +
        '<p class="muted">Checked against ' +
        '<a href="' + UI.esc(MLBAPI.BASE_V11 + '/game/' +
          encodeURIComponent(gamePk) + '/feed/live') + '" target="_blank" rel="noopener">' +
        'the official live feed</a>, which returns <code>gameData.game.pk: 0</code> with an ' +
        'empty status for an unknown id.</p>' +
        '<p><a class="btn" href="index.html">← Back to the scoreboard</a></p></div>';
    }
  }

  function loadGame() {
    var loading = document.getElementById('loading');
    var request = (latestRequest += 1);
    // The spinner is only for the first load; background polls update the
    // page in place without flashing it every few seconds.
    if (loading && !started) loading.classList.add('show');
    return registryReady.then(function () { return MLBAPI.getGameLive(gamePk); })
      .then(function (feed) {
        if (request !== latestRequest) return null; // a newer poll already won
        // The StatsAPI answers HTTP 200 for a gamePk it does not know, with
        // `gameData.game.pk: 0` and an empty status (verified 2026-11-22:
        // https://statsapi.mlb.com/api/v1.1/game/999999999/feed/live?fields=gameData,game,pk,status).
        // Without this check the page renders an empty shell that claims success.
        var pk = feed && feed.gameData && feed.gameData.game && feed.gameData.game.pk;
        var hasStatus = !!(feed && feed.gameData && feed.gameData.status &&
          (feed.gameData.status.abstractGameState || feed.gameData.status.statusCode));
        if (!hasStatus || !pk) {
          showMissingGame();
          return null;
        }
        missingGame = false;
        // Track when this page first saw the game as Final so the post-Final
        // re-scan window is measured from the game, not from page load.
        var state = feed.gameData.status.abstractGameState;
        if (state === 'Final') {
          if (finalObservedAt === null) finalObservedAt = Date.now();
        } else {
          finalObservedAt = null;
          graceEnded = false;
        }
        lastFeed = feed;
        var sig = stateSignature(feed);
        updateReviewState(feed);
        if (sig !== lastSignature || !started) {
          lastSignature = sig;
          started = true;
          renderAll(feed);
        }
        var status = document.getElementById('status-line');
        if (status) {
          status.textContent = 'Updated ' + new Date().toLocaleTimeString() +
            (MLBAPI.quietRemainingMs() > 0 ? ' · API asked us to slow down' : '');
        }
        startTimer(pollDelay(feed));
        scheduleProbe(feed);
        return feed;
      })
      .catch(function (err) {
        console.error(err);
        var status = document.getElementById('status-line');
        if (status) status.textContent = 'Error loading game: ' + err.message + ' (retrying)';
        startTimer(pollDelay(lastFeed));
      })
      .then(function () {
        if (loading) loading.classList.remove('show');
      });
  }

  function renderAll(feed) {
    renderHeader(feed);
    renderLivePanel(feed);
    renderLinescore(feed);
    renderPlays(feed);
    renderBoxscore(feed);
    renderReviews(feed);
    var propsPanel = document.getElementById('panel-props');
    if (propsPanel && propsPanel.style.display !== 'none') {
      Props.render(feed, document.getElementById('props-wrap'));
    }
  }

  /* ------------------------------------------------------------------ header */

  function renderHeader(feed) {
    var gd = feed.gameData || {};
    var ls = (feed.liveData && feed.liveData.linescore) || {};
    var away = (gd.teams && gd.teams.away) || {};
    var home = (gd.teams && gd.teams.home) || {};
    var awayScore = ls.teams && ls.teams.away && typeof ls.teams.away.runs === 'number'
      ? ls.teams.away.runs : '-';
    var homeScore = ls.teams && ls.teams.home && typeof ls.teams.home.runs === 'number'
      ? ls.teams.home.runs : '-';
    var status = gd.status || {};

    var awayEl = document.getElementById('header-away');
    var homeEl = document.getElementById('header-home');
    var centerEl = document.getElementById('header-center');
    var metaEl = document.getElementById('header-meta');
    var decisionsEl = document.getElementById('header-decisions');

    if (awayEl) {
      awayEl.innerHTML = UI.teamLogoImg(away.id, 'team-logo', 40) +
        '<div><div class="team-title">' + UI.esc(away.name || 'Away') + '</div>' +
        '<div class="muted">' + UI.esc(away.abbreviation || '') +
        (away.record && away.record.wins !== undefined
          ? ' · ' + away.record.wins + '-' + away.record.losses : '') + '</div></div>';
    }
    if (homeEl) {
      homeEl.innerHTML = '<div><div class="team-title">' + UI.esc(home.name || 'Home') + '</div>' +
        '<div class="muted">' + UI.esc(home.abbreviation || '') +
        (home.record && home.record.wins !== undefined
          ? ' · ' + home.record.wins + '-' + home.record.losses : '') + '</div></div>' +
        UI.teamLogoImg(home.id, 'team-logo', 40);
    }
    if (centerEl) {
      centerEl.innerHTML = '<div class="header-score">' + UI.esc(awayScore) + ' – ' +
        UI.esc(homeScore) + '</div>' +
        '<div class="muted">' + UI.esc(status.detailedState || '') + '</div>';
    }
    if (metaEl) {
      var bits = [];
      if (gd.venue && gd.venue.name) bits.push(gd.venue.name);
      if (gd.weather && gd.weather.condition) {
        bits.push(gd.weather.condition + (gd.weather.temp ? ', ' + gd.weather.temp + '°' : ''));
      }
      if (gd.datetime && gd.datetime.dateTime) bits.push(UI.formatDateTime(gd.datetime.dateTime));
      metaEl.textContent = bits.join(' · ');
    }
    if (decisionsEl) {
      var d = (feed.liveData && feed.liveData.decisions) || {};
      var parts = [];
      if (d.winner && d.winner.fullName) parts.push('W: ' + d.winner.fullName);
      if (d.loser && d.loser.fullName) parts.push('L: ' + d.loser.fullName);
      if (d.save && d.save.fullName) parts.push('SV: ' + d.save.fullName);
      decisionsEl.textContent = parts.join(' · ');
    }
  }

  /* -------------------------------------------------------------- live panel */

  /**
   * Values that the payload does not contain are shown blank, never as 0.
   * (An absent field is "not observed", not "zero".)
   */
  function val(value) {
    return (value === null || value === undefined || value === '') ? '' : value;
  }

  function feedUrl() {
    return MLBAPI.BASE_V11 + '/game/' + encodeURIComponent(gamePk) + '/feed/live';
  }

  /** Trailing cell that attributes a table row to the official MLB feed. */
  function sourceCell(values) {
    var missing = values.some(function (v) {
      return v === null || v === undefined || v === '';
    });
    return '<td><a href="' + UI.esc(feedUrl()) + '" target="_blank" rel="noopener">MLB feed</a>' +
      (missing ? ' · blank = not in payload' : '') + '</td>';
  }

  function basesFrom(linescore) {
    var off = (linescore && linescore.offense) || {};
    return {
      first: off.first || (off.postOnFirst && off.postOnFirst) || null,
      second: off.second || null,
      third: off.third || null,
    };
  }

  function battingLineFor(feed, playerId, side) {
    var box = (feed.liveData && feed.liveData.boxscore && feed.liveData.boxscore.teams) || {};
    var team = box[side];
    if (!team || !playerId) return null;
    var player = (team.players || {})['ID' + playerId];
    return player && player.stats && player.stats.batting ? player.stats.batting : null;
  }

  function pitchingLineFor(feed, playerId, side) {
    var box = (feed.liveData && feed.liveData.boxscore && feed.liveData.boxscore.teams) || {};
    var team = box[side];
    if (!team || !playerId) return null;
    var player = (team.players || {})['ID' + playerId];
    return player && player.stats && player.stats.pitching ? player.stats.pitching : null;
  }

  function renderLivePanel(feed) {
    var el = document.getElementById('live-panel');
    if (!el) return;
    var ls = (feed.liveData && feed.liveData.linescore) || {};
    var plays = (feed.liveData && feed.liveData.plays) || {};
    var current = plays.currentPlay || {};
    var matchup = current.matchup || {};
    var batter = matchup.batter || {};
    var pitcher = matchup.pitcher || {};
    var offense = ls.offense || {};
    var status = (feed.gameData && feed.gameData.status) || {};
    var isPreview = status.abstractGameState === 'Preview';
    var gd = feed.gameData || {};

    if (isPreview) {
      var ppAway = gd.teams && gd.teams.away && gd.teams.away.probablePitcher;
      var ppHome = gd.teams && gd.teams.home && gd.teams.home.probablePitcher;
      // Every field below is optional in the official payload: a game that has
      // not started yet can carry no `teams` block and no probables, so each
      // read is guarded (an unguarded `gd.teams.away` here threw a TypeError and
      // left the whole live panel blank).
      var awayTeam = (gd.teams && gd.teams.away) || {};
      var homeTeam = (gd.teams && gd.teams.home) || {};
      el.innerHTML = '<div class="live-row"><div><strong>First pitch:</strong> ' +
        UI.esc(UI.formatDateTime(gd.datetime && gd.datetime.dateTime) || 'TBD') + '</div>' +
        '<div><strong>Probable pitchers:</strong> ' +
        UI.esc((awayTeam.abbreviation || 'AWY') + ' ' + ((ppAway && ppAway.fullName) || 'TBD')) +
        ' · ' + UI.esc((homeTeam.abbreviation || 'HOM') + ' ' + ((ppHome && ppHome.fullName) || 'TBD')) +
        '</div>' +
        '</div>';
      return;
    }

    var battingSide = (ls.isTopInning === true) ? 'away' : 'home';
    var pitchingSide = battingSide === 'away' ? 'home' : 'away';
    var batLine = battingLineFor(feed, batter.id, battingSide);
    var pitchLine = pitchingLineFor(feed, pitcher.id, pitchingSide);
    var lastPlay = (plays.allPlays || [])[(plays.allPlays || []).length - 1];

    el.innerHTML = '' +
      '<div class="atbat">' +
        '<div class="atbat-side">' +
          '<div class="stat-lbl">At Bat</div>' +
          '<div class="atbat-name">' + UI.headshotImg(batter.id, 'headshot', 46) +
            UI.esc(batter.fullName || '—') + '</div>' +
          '<div class="muted">' + UI.esc(batLine
            ? val(batLine.hits) + '-' + val(batLine.atBats) + ' today'
            : ((matchup.batSide && matchup.batSide.description) || '')) + '</div>' +
        '</div>' +
        '<div class="atbat-side">' +
          '<div class="stat-lbl">Pitching</div>' +
          '<div class="atbat-name">' + UI.headshotImg(pitcher.id, 'headshot', 46) +
            UI.esc(pitcher.fullName || '—') + '</div>' +
          '<div class="muted">' + UI.esc(pitchLine
            ? val(pitchLine.inningsPitched) + ' IP · ' + val(pitchLine.strikeOuts) + ' K · ' +
              val(pitchLine.baseOnBalls) + ' BB'
            : ((matchup.pitchHand && matchup.pitchHand.description) || '')) + '</div>' +
        '</div>' +
        '<div class="atbat-side">' +
          '<div class="stat-lbl">Count · Outs</div>' +
          '<div class="count-row">' + UI.countLine(current.count, ls.outs) + '</div>' +
          '<div class="bases-row">' + UI.basesDiamond(basesFrom(ls)) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="live-row">' +
        '<div><strong>On deck:</strong> ' + UI.esc((offense.onDeck && offense.onDeck.fullName) || '—') + '</div>' +
        '<div><strong>In the hole:</strong> ' + UI.esc((offense.inHole && offense.inHole.fullName) || '—') + '</div>' +
        '<div><strong>Runners:</strong> ' + (UI.runnerList(basesFrom(ls)) || 'Bases empty') + '</div>' +
      '</div>' +
      (lastPlay && lastPlay.result
        ? '<div class="last-play"><span class="muted">Last play:</span> ' +
          UI.esc(lastPlay.result.description || '') + '</div>'
        : '') +
      '<div id="live-forecast"></div>';

    var forecastEl = document.getElementById('live-forecast');
    if (forecastEl && batter.id && pitcher.id && status.abstractGameState === 'Live') {
      forecastEl.innerHTML = '<div class="muted">Loading hit forecast…</div>';
      Props.buildForecast(feed).then(function (forecast) {
        forecastEl.innerHTML = forecast ? Props.forecastCard(forecast) : '';
      }).catch(function (err) {
        console.warn('Forecast failed', err);
        forecastEl.innerHTML = '';
      });
    }
  }

  /* -------------------------------------------------------------- linescore */

  function renderLinescore(feed) {
    var el = document.getElementById('linescore-wrap');
    if (!el) return;
    var ls = (feed.liveData && feed.liveData.linescore) || {};
    var innings = Array.isArray(ls.innings) ? ls.innings : [];
    var gd = feed.gameData || {};
    var awayAbbr = (gd.teams && gd.teams.away && gd.teams.away.abbreviation) || 'AWY';
    var homeAbbr = (gd.teams && gd.teams.home && gd.teams.home.abbreviation) || 'HOM';
    var teams = ls.teams || {};
    var awayTotals = teams.away || {};
    var homeTotals = teams.home || {};

    if (!innings.length) {
      el.innerHTML = '<div class="muted">Linescore not available yet.</div>';
      return;
    }

    var head = innings.map(function (i) { return '<th>' + UI.esc(i.num) + '</th>'; }).join('');
    function row(totals, side, abbr) {
      var inningRuns = innings.map(function (i) {
        var s = i[side] || {};
        return typeof s.runs === 'number' ? s.runs : null;
      });
      var cells = inningRuns.map(function (r) {
        return '<td>' + (r === null ? '<span class="muted">·</span>' : r) + '</td>';
      }).join('');
      var totals4 = [totals.runs, totals.hits, totals.errors, totals.leftOnBase];
      var totalCells = totals4.map(function (v, idx) {
        return '<td>' + (idx === 0 ? '<strong>' : '') + (typeof v === 'number' ? v : '') +
          (idx === 0 ? '</strong>' : '') + '</td>';
      }).join('');
      return '<tr><td><strong>' + UI.esc(abbr) + '</strong></td>' + cells + totalCells +
        sourceCell([abbr].concat(inningRuns, totals4)) + '</tr>';
    }

    el.innerHTML = '<div class="panel-title">Linescore</div>' +
      '<div class="scroll-x"><table class="linescore-table">' +
        '<thead><tr><th>Team</th>' + head + '<th>R</th><th>H</th><th>E</th><th>LOB</th>' +
        '<th>Source</th></tr></thead>' +
        '<tbody>' + row(awayTotals, 'away', awayAbbr) + row(homeTotals, 'home', homeAbbr) + '</tbody>' +
      '</table></div>' +
      (ls.currentInning
        ? '<div class="muted linescore-foot">' + UI.esc(UI.inningLabel(ls.currentInningOrdinal ||
            ls.currentInning, ls.inningHalf)) + '</div>'
        : '');
  }

  /* ----------------------------------------------------------- play-by-play */

  function reviewForPlay(feed, play) {
    var list = lastReviews.filter(function (r) {
      return r.atBatIndex === (play.about && play.about.atBatIndex);
    });
    return list;
  }

  function renderPlays(feed) {
    var el = document.getElementById('plays-wrap');
    if (!el) return;
    var plays = (feed.liveData && feed.liveData.plays && feed.liveData.plays.allPlays) || [];
    if (!plays.length) {
      el.innerHTML = '<div class="muted">No plays recorded yet.</div>';
      return;
    }
    var html = plays.slice().reverse().map(function (play) {
      var about = play.about || {};
      var res = play.result || {};
      var reviews = reviewForPlay(feed, play);
      var chips = reviews.map(function (r) {
        return '<span class="chip chip-review">' + UI.esc(r.label) + ' · ' +
          UI.esc(r.outcome) + '</span>';
      }).join(' ');
      var pitches = (play.playEvents || []).filter(function (e) { return e.isPitch; }).length;
      return '<div class="play-item">' +
        '<div class="play-head">' +
          '<span>' + UI.esc(UI.inningLabel(about.inning, about.halfInning)) + ' · ' +
            UI.esc(res.event || '') + (pitches ? ' · ' + pitches + ' pitch' + (pitches === 1 ? '' : 'es') : '') +
          '</span>' +
          '<span>' + UI.esc(val(res.awayScore) + '–' + val(res.homeScore)) + '</span>' +
        '</div>' +
        (chips ? '<div class="chips">' + chips + '</div>' : '') +
        '<div class="play-desc">' + UI.esc(res.description || 'In progress…') + '</div>' +
      '</div>';
    }).join('');
    el.innerHTML = html;
  }

  /* --------------------------------------------------------------- boxscore */

  function battingOrderValue(player) {
    var v = player && player.battingOrder;
    var n = Number(v);
    return Number.isFinite(n) ? n : 9999;
  }

  /**
   * `team.batters` is every player who has a batting line, including the
   * pitchers in a DH-less lineup and pinch hitters who stayed in the game, so
   * it is NOT the batting order. The official batting order is the separate
   * `team.battingOrder` array of player ids (verified 2026-11-22:
   * https://statsapi.mlb.com/api/v1/game/824027/boxscore?fields=teams,away,batters,pitchers,battingOrder,note
   * → `batters` has 15 ids incl. four pitchers, `battingOrder` has the nine
   * starters). Prefer that array; fall back to sorting by `battingOrder`
   * then to the raw id list, so an older payload without it still renders.
   */
  /**
   * Did this player actually take a plate appearance? `stats.batting` is
   * present but EMPTY (`{}`) for pitchers who never batted, so the object's
   * existence proves nothing; an at-bat, a plate appearance or an official
   * `note` does. Verified 2026-11-22 against game 824027, where the four COL
   * pitchers carry `batting: {}` while Chad Stevens (pinch hitter, `note:
   * "a-"`) carries `atBats: 1`.
   */
  function hasBattingLine(player) {
    var s = (player && player.stats && player.stats.batting) || null;
    if (!s) return false;
    if (s.note) return true;
    if (Number(s.atBats) > 0 || Number(s.plateAppearances) > 0) return true;
    if (Number(s.baseOnBalls) > 0 || Number(s.hitByPitch) > 0 ||
        Number(s.sacBunts) > 0 || Number(s.sacFlies) > 0) return true;
    return false;
  }

  /** In the starting lineup or the batting order at some point (not a pitcher). */
  function inLineup(player) {
    if (!player) return false;
    if (player.battingOrder) return true;
    var s = (player.stats && player.stats.batting) || null;
    return !!(s && s.note);
  }

  function orderedBatterIds(team) {
    var players = team.players || {};
    var order = Array.isArray(team.battingOrder) ? team.battingOrder : [];
    var ids = order.filter(function (id) {
      var p = players['ID' + id];
      // A lineup member is always listed, even before his first plate
      // appearance (an early-called game can have a starter at 0 PA).
      return p && (inLineup(p) || hasBattingLine(p));
    });
    if (ids.length) {
      // A substitute who batted but is not in the starting order goes after
      // the order, in the payload's own sequence (pinch hitters, pinch
      // runners, position players who entered).
      var seen = {};
      ids.forEach(function (id) { seen[String(id)] = true; });
      var extras = (Array.isArray(team.batters) ? team.batters : []).filter(function (id) {
        var p = players['ID' + id];
        return !seen[String(id)] && p && (inLineup(p) || hasBattingLine(p));
      });
      return ids.concat(extras);
    }
    // No `battingOrder` array in this payload: fall back to `batters`, keeping
    // anyone with a real batting line or a lineup marker.
    return (Array.isArray(team.batters) ? team.batters : []).filter(function (id) {
      var p = players['ID' + id];
      return p && (inLineup(p) || hasBattingLine(p));
    }).sort(function (a, b) {
      return battingOrderValue(players['ID' + a]) - battingOrderValue(players['ID' + b]);
    });
  }

  /** Official `note` field, e.g. `a-` = announced as a pinch hitter. */
  function battingNoteLabel(note) {
    if (!note) return '';
    if (note === 'a-') return 'a-';
    return String(note);
  }

  function boxscoreTeam(feed, side, label) {
    var teams = (feed.liveData && feed.liveData.boxscore && feed.liveData.boxscore.teams) || {};
    var team = teams[side];
    if (!team) return '<div class="muted">' + UI.esc(label) + ' box score not available.</div>';
    var players = team.players || {};
    var pitcherIds = Array.isArray(team.pitchers) ? team.pitchers : [];

    // orderedBatterIds() has already decided who is a batter (the starting
    // lineup, plus anyone who actually batted). Do not re-filter on
    // hasBattingLine() here: a starter at 0 PA before the first pitch is a
    // legitimate row with blank stats, which is what an official box score
    // prints for a scheduled game.
    var batters = orderedBatterIds(team)
      .map(function (id) { return players['ID' + id]; })
      .filter(Boolean);

    var batRows = batters.map(function (p) {
      var s = (p.stats && p.stats.batting) || {};
      var order = Number(p.battingOrder);
      var slot = Number.isFinite(order) ? Math.round(order / 100) : '';
      var stats = [s.atBats, s.runs, s.hits, s.rbi, s.baseOnBalls, s.strikeOuts];
      var positions = (p.allPositions || []).map(function (x) { return x && x.abbreviation; })
        .filter(Boolean).join('-');
      var pos = positions || (p.position && p.position.abbreviation) || '';
      return '<tr>' +
        '<td>' + UI.esc(val(slot)) + '</td>' +
        '<td>' + UI.esc((p.person && p.person.fullName) || '') +
          (s.note ? ' <span class="muted">' + UI.esc(battingNoteLabel(s.note)) + '</span>' : '') +
        '</td>' +
        '<td>' + UI.esc(pos) + '</td>' +
        stats.map(function (v) { return '<td>' + UI.esc(val(v)) + '</td>'; }).join('') +
        sourceCell(stats) +
      '</tr>';
    }).join('');

    var pitchRows = pitcherIds.map(function (id) { return players['ID' + id]; }).filter(Boolean)
      .map(function (p) {
        var s = (p.stats && p.stats.pitching) || {};
        var stats = [s.inningsPitched, s.hits, s.runs, s.earnedRuns, s.baseOnBalls, s.strikeOuts];
        return '<tr>' +
          '<td></td>' +
          '<td>' + UI.esc((p.person && p.person.fullName) || '') + '</td>' +
          '<td>' + UI.esc((p.position && p.position.abbreviation) || 'P') + '</td>' +
          '<td>' + UI.esc(val(s.inningsPitched)) + '</td>' +
          [s.hits, s.runs, s.earnedRuns, s.baseOnBalls, s.strikeOuts]
            .map(function (v) { return '<td>' + UI.esc(val(v)) + '</td>'; }).join('') +
          sourceCell(stats) +
        '</tr>';
      }).join('');

    return '<div class="panel-title">' + UI.esc(label) + '</div>' +
      '<div class="scroll-x"><table class="boxscore-table">' +
        '<thead><tr><th>#</th><th>Batter</th><th>Pos</th><th>AB</th><th>R</th><th>H</th>' +
        '<th>RBI</th><th>BB</th><th>SO</th><th>Source</th></tr></thead>' +
        '<tbody>' + (batRows || '<tr><td colspan="10" class="muted">No batting lines yet.</td></tr>') +
        '</tbody></table></div>' +
      '<div class="scroll-x"><table class="boxscore-table pitching-table">' +
        '<thead><tr><th>#</th><th>Pitcher</th><th>Pos</th><th>IP</th><th>H</th>' +
        '<th>R</th><th>ER</th><th>BB</th><th>SO</th><th>Source</th></tr></thead>' +
        '<tbody>' + (pitchRows || '<tr><td colspan="10" class="muted">No pitching lines yet.</td></tr>') +
        '</tbody></table></div>';
  }

  function renderBoxscore(feed) {
    var el = document.getElementById('boxscore-wrap');
    if (!el) return;
    var gd = feed.gameData || {};
    var away = (gd.teams && gd.teams.away && gd.teams.away.name) || 'Away';
    var home = (gd.teams && gd.teams.home && gd.teams.home.name) || 'Home';
    el.innerHTML = boxscoreTeam(feed, 'away', away) + boxscoreTeam(feed, 'home', home);
  }

  /* ---------------------------------------------------------------- reviews */

  function updateReviewState(feed) {
    lastReviews = Reviews.extractGameReviews(feed);
    var badge = document.getElementById('reviews-tab-count');
    if (badge) {
      badge.textContent = String(lastReviews.length);
      badge.style.display = lastReviews.length ? 'inline-block' : 'none';
    }
    var bannerWrap = document.getElementById('live-review-banner-wrap');
    if (!bannerWrap) return;
    var active = lastReviews.filter(function (r) { return r.inProgress; });
    if (!active.length) {
      // The lean probe sees the official "review called" flip before the play
      // text exists, so a probe-painted banner outranks an empty full feed.
      if (!/lean status probe/.test(bannerWrap.innerHTML)) bannerWrap.innerHTML = '';
      return;
    }
    bannerWrap.innerHTML = '<div class="banner-box">🚨 <strong>Under review:</strong> ' +
      active.map(function (r) {
        return UI.esc(r.label + ' — ' + r.reason +
          (r.runsAtRisk ? ' · ⚠️ ' + r.runsAtRisk + ' run(s) at risk' : ''));
      }).join(' · ') + '</div>';
  }

  function scoreTracker(entry) {
    var before = entry.scoreBefore || {};
    var actual = entry.scoreActual || {};
    var possible = entry.possibleAfter;
    var rows = [
      '<div class="tracker-row"><span class="stat-lbl">Before review</span><span>' +
        UI.esc((before.away === null ? '—' : before.away) + '–' +
          (before.home === null ? '—' : before.home)) + '</span></div>',
    ];
    if (possible) {
      rows.push('<div class="tracker-row"><span class="stat-lbl">Possible after</span><span>' +
        UI.esc(possible.away + '–' + possible.home) + ' <span class="muted">(if the reviewed run(s) come off)</span></span></div>');
    } else if (entry.runsAtRisk) {
      rows.push('<div class="tracker-row"><span class="stat-lbl">Possible after</span><span class="muted">' +
        'score impact pending</span></div>');
    }
    if (actual && (actual.away !== null || actual.home !== null)) {
      rows.push('<div class="tracker-row"><span class="stat-lbl">Actual after</span><span>' +
        UI.esc((actual.away === null ? '—' : actual.away) + '–' +
          (actual.home === null ? '—' : actual.home)) + ' <span class="muted">(official score after the reviewed play)</span></span></div>');
    }
    return '<div class="tracker">' + rows.join('') + '</div>';
  }

  function reviewCard(entry) {
    var challengeBits = [];
    if (entry.challengerAbbr) {
      challengeBits.push(UI.esc(entry.challengerAbbr) + ' ' +
        (entry.category === 'abs' ? 'ABS challenge' : 'challenge'));
    }
    if (entry.pitchCountBefore !== undefined) {
      challengeBits.push('pitch ' + (entry.pitchNumber || '') + ' (after ' +
        entry.pitchCountBefore + ')');
    }
    if (entry.countAfter) {
      challengeBits.push('count after: ' + entry.countAfter.balls + '-' + entry.countAfter.strikes);
    }
    return '<div class="feed-card' + (entry.runsAtRisk ? ' risk' : '') + '">' +
      '<div class="feed-card-head">' +
        '<div><strong>' + UI.esc(entry.label) + '</strong> ' +
          '<span class="muted">· ' + UI.esc(UI.inningLabel(entry.inning, entry.halfInning)) + '</span></div>' +
        '<div>' + (entry.runsAtRisk
          ? '<span class="pill pill-risk">⚠️ ' + entry.runsAtRisk + ' run(s) at risk</span> ' : '') +
          '<span class="pill ' + (entry.inProgress ? 'pill-review' : 'pill-final') + '">' +
          UI.esc(entry.outcome) + '</span></div>' +
      '</div>' +
      '<div>' + UI.esc(entry.description || entry.reason) + '</div>' +
      (challengeBits.length ? '<div class="muted small">' + challengeBits.join(' · ') + '</div>' : '') +
      scoreTracker(entry) +
      (entry.counterLine ? '<div class="muted small">' + UI.esc(entry.counterLine) + '</div>' : '') +
      '</div>';
  }

  function renderReviews(feed) {
    var el = document.getElementById('reviews-wrap');
    if (!el) return;
    var items = lastReviews.slice().sort(function (a, b) {
      return String(b.timestamp || '').localeCompare(String(a.timestamp || ''));
    });
    if (!items.length) {
      el.innerHTML = '<div class="muted">No challenges or reviews in this game.</div>';
      return;
    }
    var byCategory = {};
    var overturned = 0;
    var resolved = 0;
    items.forEach(function (i) {
      byCategory[i.category] = (byCategory[i.category] || 0) + 1;
      if (!i.inProgress) {
        resolved += 1;
        if (i.isOverturned) overturned += 1;
      }
    });
    var stats = ['<div class="stat-box"><div class="stat-val">' + items.length + '</div>' +
      '<div class="stat-lbl">Total</div></div>'];
    Object.keys(byCategory).forEach(function (k) {
      stats.push('<div class="stat-box"><div class="stat-val">' + byCategory[k] + '</div>' +
        '<div class="stat-lbl">' + UI.esc(k === 'abs' ? 'ABS Challenges' :
          k === 'challenge' ? 'Challenges' : k === 'boundary' ? 'Boundary Calls' :
          k === 'os_pending' ? 'Scorer Pending' : 'Reviews') + '</div></div>');
    });
    if (resolved) {
      stats.push('<div class="stat-box"><div class="stat-val">' +
        Math.round((overturned / resolved) * 100) + '%</div>' +
        '<div class="stat-lbl">Overturn rate</div></div>');
    }
    el.innerHTML = '<div class="reviews-summary-bar">' + stats.join('') + '</div>' +
      '<div class="feed-list">' + items.map(reviewCard).join('') + '</div>';
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
