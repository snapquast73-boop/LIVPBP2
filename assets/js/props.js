(function (global) {
  'use strict';

  const LEAGUE_HIT_RATE = 0.245;
  const MIN_PA_PROB = 0.13;
  const MAX_PA_PROB = 0.62;
  const MIN_COUNT_PROB = 0.10;
  const MAX_COUNT_PROB = 0.78;
  const MAX_LOGIT_SHIFT = 1.9;

  // Empirically anchored live-count hit-rate odds multipliers (walks are NOT hits,
  // so 3-ball counts exclude walk probability and reflect hittable-pitch edge).
  const COUNT_FACTORS = {
    '0-0': 1.00,
    '1-0': 1.12,
    '2-0': 1.24,
    '3-0': 1.18,
    '0-1': 0.87,
    '1-1': 0.99,
    '2-1': 1.13,
    '3-1': 1.25,
    '0-2': 0.68,
    '1-2': 0.78,
    '2-2': 0.91,
    '3-2': 1.04,
  };

  const statCache = new Map(); // key -> Promise<data>

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function logit(p) {
    const c = clamp(p, 0.01, 0.99);
    return Math.log(c / (1 - c));
  }

  function invLogit(x) {
    return 1 / (1 + Math.exp(-x));
  }

  function parseRate(val) {
    if (val === null || val === undefined || val === '') return null;
    const n = parseFloat(val);
    if (!Number.isFinite(n) || n < 0 || n > 1) return null;
    return n;
  }

  function pickCombinedSplit(splits) {
    if (!Array.isArray(splits) || !splits.length) return null;
    // Traded players have a combined total split (numTeams > 1 / no team property)
    const combined = splits.find((s) => s && !s.team && s.stat);
    if (combined) return combined;
    // Otherwise pick the split with highest sample size
    return splits
      .filter((s) => s && s.stat)
      .sort((a, b) => ((b.stat.plateAppearances || b.stat.battersFaced || b.stat.atBats || 0) -
        (a.stat.plateAppearances || a.stat.battersFaced || a.stat.atBats || 0)))[0] || null;
  }

  function extractSideInputs(statsPayload, opposingHandCode, gameDateStr, isPitcher) {
    const out = {
      xba: null,
      avg: null,
      sample: 0,
      splitAvg: null,
      splitSample: 0,
      formAvg: null,
      formSample: 0,
      hasData: false,
    };
    const groups = statsPayload && Array.isArray(statsPayload.stats) ? statsPayload.stats : [];
    const findGroup = (name) => groups.find((g) => g && g.type && g.type.displayName === name);

    const expGroup = findGroup('expectedStatistics');
    if (expGroup && Array.isArray(expGroup.splits) && expGroup.splits.length) {
      const sp = pickCombinedSplit(expGroup.splits);
      if (sp && sp.stat) out.xba = parseRate(sp.stat.avg);
    }

    const seasonGroup = findGroup('season');
    if (seasonGroup && Array.isArray(seasonGroup.splits) && seasonGroup.splits.length) {
      const sp = pickCombinedSplit(seasonGroup.splits);
      if (sp && sp.stat) {
        out.avg = parseRate(sp.stat.avg);
        out.sample = Number(isPitcher ? (sp.stat.battersFaced || sp.stat.atBats) : (sp.stat.plateAppearances || sp.stat.atBats)) || 0;
      }
    }

    // Platoon split: vl = vs Left, vr = vs Right
    const targetSplitCode = opposingHandCode === 'L' ? 'vl' : opposingHandCode === 'R' ? 'vr' : null;
    const splitGroup = findGroup('statSplits');
    if (targetSplitCode && splitGroup && Array.isArray(splitGroup.splits)) {
      const matching = splitGroup.splits.filter((s) => s && s.split && s.split.code === targetSplitCode && s.stat);
      const sp = pickCombinedSplit(matching);
      if (sp && sp.stat) {
        out.splitAvg = parseRate(sp.stat.avg);
        out.splitSample = Number(isPitcher ? (sp.stat.battersFaced || sp.stat.atBats) : (sp.stat.plateAppearances || sp.stat.atBats)) || 0;
      }
    }

    // Recent form: last 8 games strictly BEFORE gameDateStr (never leaks the game itself)
    const logGroup = findGroup('gameLog');
    if (logGroup && Array.isArray(logGroup.splits) && logGroup.splits.length) {
      const priorGames = logGroup.splits
        .filter((s) => s && s.stat && (!gameDateStr || !s.date || s.date < gameDateStr))
        .slice(-8);
      let hits = 0;
      let abs = 0;
      priorGames.forEach((g) => {
        hits += Number(g.stat.hits) || 0;
        abs += Number(g.stat.atBats) || 0;
      });
      if (abs >= 5) {
        out.formAvg = hits / abs;
        out.formSample = abs;
      }
    }

    out.hasData = out.xba !== null || (out.avg !== null && out.sample > 0);
    return out;
  }

  function extractH2H(h2hPayload) {
    const groups = h2hPayload && Array.isArray(h2hPayload.stats) ? h2hPayload.stats : [];
    const totalGroup = groups.find((g) => g && g.type && g.type.displayName === 'vsPlayerTotal') ||
      groups.find((g) => g && g.type && g.type.displayName === 'vsPlayer');
    if (!totalGroup || !Array.isArray(totalGroup.splits) || !totalGroup.splits.length) {
      return { avg: null, hits: 0, ab: 0, pa: 0 };
    }
    const sp = totalGroup.splits[0];
    if (!sp || !sp.stat) return { avg: null, hits: 0, ab: 0, pa: 0 };
    const ab = Number(sp.stat.atBats) || 0;
    const hits = Number(sp.stat.hits) || 0;
    const pa = Number(sp.stat.plateAppearances) || ab;
    return {
      avg: ab > 0 ? hits / ab : parseRate(sp.stat.avg),
      hits,
      ab,
      pa,
    };
  }

  function regressRate(rate, sample, priorWeight) {
    if (rate === null) return LEAGUE_HIT_RATE;
    const n = Math.max(0, Number(sample) || 0);
    return (rate * n + LEAGUE_HIT_RATE * priorWeight) / (n + priorWeight);
  }

  function blendSeasonRate(side) {
    if (!side || !side.hasData) return null;
    if (side.xba !== null && side.avg !== null) {
      const combined = 0.6 * side.xba + 0.4 * side.avg;
      return regressRate(combined, Math.max(side.sample, 120), 65);
    }
    if (side.xba !== null) return regressRate(side.xba, Math.max(side.sample, 120), 65);
    return regressRate(side.avg, side.sample, 75);
  }

  function tierForProbability(prob) {
    if (prob >= 0.34) return { label: 'Elite matchup', cls: 'tier-elite' };
    if (prob >= 0.28) return { label: 'Favorable', cls: 'tier-favorable' };
    if (prob >= 0.22) return { label: 'Neutral', cls: 'tier-neutral' };
    if (prob >= 0.17) return { label: 'Tough', cls: 'tier-tough' };
    return { label: "Pitcher's edge", cls: 'tier-pitcher' };
  }

  function computeForecast(params) {
    const batter = params.batter || {};
    const pitcher = params.pitcher || {};
    const h2h = params.h2h || { avg: null, ab: 0, hits: 0, pa: 0 };
    const batSide = params.batSide || '';
    const pitchHand = params.pitchHand || '';
    const sameGamePAs = Math.max(0, Number(params.sameGamePAs) || 0);
    const balls = Number.isFinite(Number(params.balls)) ? Number(params.balls) : null;
    const strikes = Number.isFinite(Number(params.strikes)) ? Number(params.strikes) : null;
    const isFinal = Boolean(params.isFinal);
    const remainingPAs = isFinal ? 0 : Math.max(1, Number(params.remainingPAs) || 3);

    const baseLogit = logit(LEAGUE_HIT_RATE);
    const bSeason = blendSeasonRate(batter);
    const pSeason = blendSeasonRate(pitcher);

    let fallbackLabel = null;
    if (bSeason === null && pSeason === null) {
      fallbackLabel = 'League baseline — no season data available';
    } else if (bSeason !== null && pSeason === null) {
      fallbackLabel = 'Batter input; pitcher baseline fallback';
    } else if (bSeason === null && pSeason !== null) {
      fallbackLabel = 'Pitcher input; batter baseline fallback';
    }

    // 1. Generalized log5 season shift
    const bLogitShift = bSeason !== null ? (logit(bSeason) - baseLogit) : 0;
    const pLogitShift = pSeason !== null ? (logit(pSeason) - baseLogit) : 0;
    const seasonShift = bLogitShift + pLogitShift;

    // 2. Platoon split differential (shrunken against player's own season rate)
    let platoonShift = 0;
    const bSplitUsed = batter.splitAvg !== null && batter.splitSample >= 15 && batter.avg !== null;
    const pSplitUsed = pitcher.splitAvg !== null && pitcher.splitSample >= 15 && pitcher.avg !== null;
    if (bSplitUsed) {
      const w = batter.splitSample / (batter.splitSample + 140);
      platoonShift += w * (logit(batter.splitAvg) - logit(batter.avg));
    }
    if (pSplitUsed) {
      const w = pitcher.splitSample / (pitcher.splitSample + 140);
      platoonShift += w * (logit(pitcher.splitAvg) - logit(pitcher.avg));
    }
    if (!bSplitUsed && !pSplitUsed && batSide && pitchHand) {
      // Small flat handedness prior when split data is absent
      if (batSide === 'S') platoonShift += 0.04;
      else if (batSide !== pitchHand) platoonShift += 0.05;
      else platoonShift -= 0.05;
    }

    // 3. Recent form (last ~8 pre-game outings, bounded)
    let formShift = 0;
    if (batter.formAvg !== null && batter.formSample >= 8) {
      const ref = batter.avg !== null ? batter.avg : LEAGUE_HIT_RATE;
      const w = clamp(batter.formSample / 60, 0.1, 0.45);
      formShift += clamp(w * (logit(clamp(batter.formAvg, 0.05, 0.65)) - logit(ref)), -0.25, 0.25);
    }
    if (pitcher.formAvg !== null && pitcher.formSample >= 10) {
      const ref = pitcher.avg !== null ? pitcher.avg : LEAGUE_HIT_RATE;
      const w = clamp(pitcher.formSample / 70, 0.1, 0.4);
      formShift += clamp(w * (logit(clamp(pitcher.formAvg, 0.05, 0.65)) - logit(ref)), -0.22, 0.22);
    }

    // 4. Career H2H (bounded ~5.5 pts max)
    let h2hShift = 0;
    if (h2h && h2h.avg !== null && h2h.ab >= 3) {
      const w = h2h.ab / (h2h.ab + 28);
      h2hShift = clamp(w * (logit(clamp(h2h.avg, 0.05, 0.65)) - baseLogit), -0.30, 0.30);
    }

    // 5. Same-game familiarity (times through order, ~+0.75 pts/pass, capped at 3rd look)
    const famPasses = Math.min(2, sameGamePAs);
    const famShift = famPasses * 0.04;

    const totalFreshShift = clamp(seasonShift + platoonShift + formShift + h2hShift + famShift, -MAX_LOGIT_SHIFT, MAX_LOGIT_SHIFT);
    const freshProb = clamp(invLogit(baseLogit + totalFreshShift), MIN_PA_PROB, MAX_PA_PROB);

    // 6. Live count multiplier in odds space
    let countKey = null;
    let countFactor = 1.0;
    if (balls !== null && strikes !== null && !isFinal) {
      countKey = `${clamp(balls, 0, 3)}-${clamp(strikes, 0, 2)}`;
      countFactor = COUNT_FACTORS[countKey] || 1.0;
    }
    const liveProb = countKey
      ? clamp(invLogit(logit(freshProb) + Math.log(countFactor)), MIN_COUNT_PROB, MAX_COUNT_PROB)
      : freshProb;

    // Decompose driver adjustments in percentage points for explainability
    const stepProb = (shift) => invLogit(baseLogit + shift);
    const s1 = seasonShift;
    const s2 = s1 + platoonShift;
    const s3 = s2 + formShift;
    const s4 = s3 + h2hShift;
    const s5 = s4 + famShift;

    const drivers = [
      { key: 'season', label: 'Season', pts: (stepProb(s1) - LEAGUE_HIT_RATE) * 100 },
      { key: 'platoon', label: 'Platoon', pts: (stepProb(s2) - stepProb(s1)) * 100 },
      { key: 'form', label: 'Recent form', pts: (stepProb(s3) - stepProb(s2)) * 100 },
      { key: 'h2h', label: 'History (H2H)', pts: (stepProb(s4) - stepProb(s3)) * 100 },
      { key: 'familiarity', label: 'Familiarity', pts: (stepProb(s5) - stepProb(s4)) * 100 },
    ];
    if (countKey && countFactor !== 1.0) {
      drivers.push({ key: 'count', label: `Count (${countKey})`, pts: (liveProb - freshProb) * 100 });
    }

    const multiPaProb = isFinal ? null : (1 - Math.pow(1 - liveProb, remainingPAs));

    return {
      leagueBaseline: LEAGUE_HIT_RATE,
      freshProb,
      perPaProb: liveProb,
      multiPaProb,
      remainingPAs: isFinal ? 0 : remainingPAs,
      tier: tierForProbability(liveProb),
      drivers,
      fallbackLabel,
      countKey,
    };
  }

  function getCachedStat(key, fetcher) {
    if (!statCache.has(key)) {
      statCache.set(key, Promise.resolve().then(fetcher).catch(() => null));
    }
    return statCache.get(key);
  }

  async function loadMatchupForecast(feed) {
    if (!feed || !global.MLBAPI) return null;
    const plays = (feed.liveData && feed.liveData.plays) || {};
    const allPlays = Array.isArray(plays.allPlays) ? plays.allPlays : [];
    const cp = plays.currentPlay || (allPlays.length ? allPlays[allPlays.length - 1] : null);
    if (!cp || !cp.matchup) return null;

    const batter = cp.matchup.batter || {};
    const pitcher = cp.matchup.pitcher || {};
    if (!batter.id && !pitcher.id) return null;

    const gd = feed.gameData || {};
    const season = (gd.game && gd.game.season) || String(new Date().getFullYear());
    const gameDateStr = (gd.datetime && gd.datetime.officialDate) || '';
    const isFinal = Boolean(gd.status && gd.status.abstractGameState === 'Final');
    const batSide = (cp.matchup.batSide && cp.matchup.batSide.code) || '';
    const pitchHand = (cp.matchup.pitchHand && cp.matchup.pitchHand.code) || '';

    const [batterRaw, pitcherRaw, h2hRaw] = await Promise.all([
      batter.id ? getCachedStat(`b:${batter.id}:${season}`, () => MLBAPI.getPlayerStats(batter.id, 'hitting', season)) : null,
      pitcher.id ? getCachedStat(`p:${pitcher.id}:${season}`, () => MLBAPI.getPlayerStats(pitcher.id, 'pitching', season)) : null,
      (batter.id && pitcher.id) ? getCachedStat(`h2h:${batter.id}:${pitcher.id}`, () => MLBAPI.getHeadToHead(batter.id, pitcher.id)) : null,
    ]);

    const batterIn = extractSideInputs(batterRaw, pitchHand, gameDateStr, false);
    const pitcherIn = extractSideInputs(pitcherRaw, batSide, gameDateStr, true);
    const h2h = extractH2H(h2hRaw);

    // Count completed prior PAs in this game between the same batter & pitcher
    let sameGamePAs = 0;
    allPlays.forEach((p) => {
      if (p === cp) return;
      if (p.about && p.about.isComplete &&
        p.matchup && p.matchup.batter && p.matchup.pitcher &&
        p.matchup.batter.id === batter.id && p.matchup.pitcher.id === pitcher.id) {
        sameGamePAs += 1;
      }
    });

    const ls = (feed.liveData && feed.liveData.linescore) || {};
    const curInning = Number(ls.currentInning) || 1;
    const remainingInnings = Math.max(1, 10 - curInning);
    const remainingPAs = isFinal ? 0 : Math.max(1, Math.min(4, Math.ceil(remainingInnings / 2.5)));

    const count = cp.count || {};
    const forecast = computeForecast({
      batter: batterIn,
      pitcher: pitcherIn,
      h2h,
      batSide,
      pitchHand,
      sameGamePAs,
      balls: cp.about && cp.about.isComplete ? null : count.balls,
      strikes: cp.about && cp.about.isComplete ? null : count.strikes,
      isFinal,
      remainingPAs,
    });

    return {
      batter,
      pitcher,
      batSide,
      pitchHand,
      season,
      batterIn,
      pitcherIn,
      h2h,
      sameGamePAs,
      isFinal,
      forecast,
      batterUrl: batter.id ? MLBAPI.playerStatsUrl(batter.id, 'hitting', season) : null,
      pitcherUrl: pitcher.id ? MLBAPI.playerStatsUrl(pitcher.id, 'pitching', season) : null,
    };
  }

  function fmtPct(p) {
    if (p === null || p === undefined || !Number.isFinite(p)) return '—';
    return `${(p * 100).toFixed(1)}%`;
  }

  function fmtAvg(r) {
    if (r === null || r === undefined || !Number.isFinite(r)) return '—';
    return r.toFixed(3).replace(/^0/, '');
  }

  function fmtPts(pts) {
    const sign = pts > 0.05 ? '+' : '';
    return `${sign}${pts.toFixed(1)} pts`;
  }

  function renderForecastBadge(result) {
    if (!result || !result.forecast) return '';
    const f = result.forecast;
    const multiText = f.multiPaProb !== null
      ? ` · ≥1 hit (${f.remainingPAs} PA): ${fmtPct(f.multiPaProb)}`
      : '';
    return `
      <div class="forecast-inline">
        <span class="forecast-tier ${UI.esc(f.tier.cls)}">${UI.esc(f.tier.label)}</span>
        <span class="forecast-pct">Hit this PA: <strong>${fmtPct(f.perPaProb)}</strong>${UI.esc(multiText)}</span>
      </div>
    `;
  }

  let latestRenderId = 0;

  async function render(feed, container, preloaded) {
    if (!container) return;
    const renderId = ++latestRenderId;
    const plays = (feed && feed.liveData && feed.liveData.plays) || {};
    const cp = plays.currentPlay || {};
    const matchup = cp.matchup || {};

    if (!matchup.batter && !matchup.pitcher) {
      container.innerHTML = '<p style="color:var(--muted);">No active batter/pitcher matchup available yet.</p>';
      return;
    }

    if (!preloaded) {
      container.innerHTML = '<p style="color:var(--muted);">Loading official MLB season splits &amp; forecast inputs…</p>';
    }

    const data = preloaded || await loadMatchupForecast(feed);
    if (renderId !== latestRenderId) return;
    if (!data) {
      container.innerHTML = '<p style="color:var(--muted);">Matchup forecast unavailable.</p>';
      return;
    }

    const f = data.forecast;
    const b = data.batter;
    const p = data.pitcher;
    const bi = data.batterIn;
    const pi = data.pitcherIn;

    const driverChips = f.drivers.map((d) => {
      const cls = d.pts > 0.25 ? 'chip-pos' : d.pts < -0.25 ? 'chip-neg' : 'chip-neu';
      return `<span class="driver-chip ${cls}">${UI.esc(d.label)}: ${UI.esc(fmtPts(d.pts))}</span>`;
    }).join('');

    container.innerHTML = `
      <div class="forecast-card">
        <div class="forecast-head">
          <div>
            <div class="stat-lbl">Two-Sided Hit Forecast (${UI.esc(data.season)} season inputs)</div>
            <div class="forecast-headline">
              <span class="forecast-big">${fmtPct(f.perPaProb)}</span>
              <span class="forecast-sub">Hit this PA</span>
              <span class="forecast-tier ${UI.esc(f.tier.cls)}">${UI.esc(f.tier.label)}</span>
            </div>
            ${f.fallbackLabel ? `<div class="forecast-fallback">${UI.esc(f.fallbackLabel)}</div>` : ''}
          </div>
          <div class="forecast-multi">
            <div class="stat-lbl">${data.isFinal ? 'Remaining PAs (Final)' : `≥1 Hit in next ${f.remainingPAs} PA(s)`}</div>
            <div class="stat-val">${data.isFinal ? '—' : fmtPct(f.multiPaProb)}</div>
          </div>
        </div>
        <div class="driver-row">${driverChips}</div>
        <div class="matchup-grid">
          <div class="stat-box">
            <div class="player-mini">
              ${b.id ? `<img class="player-headshot" src="${UI.esc(UI.playerHeadshotUrl(b.id))}" alt="" loading="lazy">` : ''}
              <div>
                <div class="stat-lbl">Batter (${UI.esc(data.batSide || '—')})</div>
                <div class="stat-val" style="font-size:15px;">${UI.esc(b.fullName || 'TBD')}</div>
              </div>
            </div>
            <div class="matchup-metrics">
              <span>xBA: <strong>${fmtAvg(bi.xba)}</strong></span>
              <span>AVG: <strong>${fmtAvg(bi.avg)}</strong></span>
              <span>vs ${UI.esc(data.pitchHand || '?')}HP: <strong>${fmtAvg(bi.splitAvg)}</strong></span>
              <span>Last 8g: <strong>${fmtAvg(bi.formAvg)}</strong></span>
            </div>
            ${data.batterUrl ? `<div class="source-note"><a href="${UI.esc(data.batterUrl)}" target="_blank" rel="noopener">Official MLB Batter Stats</a></div>` : ''}
          </div>
          <div class="stat-box">
            <div class="player-mini">
              ${p.id ? `<img class="player-headshot" src="${UI.esc(UI.playerHeadshotUrl(p.id))}" alt="" loading="lazy">` : ''}
              <div>
                <div class="stat-lbl">Pitcher (${UI.esc(data.pitchHand || '—')})</div>
                <div class="stat-val" style="font-size:15px;">${UI.esc(p.fullName || 'TBD')}</div>
              </div>
            </div>
            <div class="matchup-metrics">
              <span>xBA allowed: <strong>${fmtAvg(pi.xba)}</strong></span>
              <span>Opp AVG: <strong>${fmtAvg(pi.avg)}</strong></span>
              <span>vs ${UI.esc(data.batSide || '?')}HB: <strong>${fmtAvg(pi.splitAvg)}</strong></span>
              <span>Last 8g: <strong>${fmtAvg(pi.formAvg)}</strong></span>
            </div>
            ${data.pitcherUrl ? `<div class="source-note"><a href="${UI.esc(data.pitcherUrl)}" target="_blank" rel="noopener">Official MLB Pitcher Stats</a></div>` : ''}
          </div>
          <div class="stat-box">
            <div class="stat-lbl">Career Head-to-Head &amp; Game Context</div>
            <div class="matchup-metrics" style="margin-top:6px;">
              <span>H2H: <strong>${data.h2h.ab > 0 ? `${data.h2h.hits}-${data.h2h.ab} (${fmtAvg(data.h2h.avg)})` : 'No prior ABs'}</strong></span>
              <span>Prior PAs today: <strong>${data.sameGamePAs}</strong></span>
            </div>
            <div class="source-note">Transparent log5 model (not an MLB projection or betting line).</div>
          </div>
        </div>
      </div>
    `;
  }

  const propsApi = {
    LEAGUE_HIT_RATE,
    COUNT_FACTORS,
    extractSideInputs,
    extractH2H,
    computeForecast,
    loadMatchupForecast,
    renderForecastBadge,
    render,
  };

  global.Props = propsApi;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = propsApi;
  }
})(typeof window !== 'undefined' ? window : globalThis);
