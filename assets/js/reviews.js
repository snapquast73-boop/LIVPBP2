(function (global) {
  'use strict';

  function getUI() {
    if (global.UI) return global.UI;
    if (typeof require === 'function') {
      try { return require('./ui.js'); } catch (_) {}
    }
    return null;
  }

  function classifyReview(reviewDetails, evDetails, playDesc) {
    const ui = getUI();
    const code = String((reviewDetails && reviewDetails.reviewType) || '').toUpperCase();
    const registry = ui && ui.OFFICIAL_REVIEW_STATUSES;
    const known = code && registry ? registry[code] : null;

    if (known) {
      return {
        category: known.category,
        label: known.label,
        officialReason: known.reason,
        reviewType: code,
      };
    }

    if (code === 'MJ' || code === 'NJ') {
      return { category: 'abs', label: 'ABS Challenge', officialReason: 'Pitch Result', reviewType: code };
    }
    if (/^[MN][HOS]$/.test(code)) {
      return { category: 'boundary', label: 'Boundary Call', officialReason: 'Boundary call', reviewType: code };
    }
    if (code.startsWith('M')) {
      return { category: 'challenge', label: 'Manager Challenge', officialReason: 'Manager challenge', reviewType: code };
    }
    if (code.startsWith('N') || code === 'IH') {
      return { category: 'review', label: 'Umpire Review', officialReason: 'Umpire review', reviewType: code };
    }

    const desc = [
      evDetails && evDetails.description,
      reviewDetails && reviewDetails.reason,
      playDesc,
    ].filter(Boolean).join(' ').toLowerCase();

    if (desc.includes('abs') || desc.includes('ball-strike') || desc.includes('pitch result')) {
      return { category: 'abs', label: 'ABS Challenge', officialReason: 'Pitch Result', reviewType: code };
    }
    if (desc.includes('boundary') || desc.includes('home run') || desc.includes('fair/foul')) {
      return { category: 'boundary', label: 'Boundary Call', officialReason: 'Boundary call', reviewType: code };
    }
    if (desc.includes('manager challenge') || desc.includes('challenged (')) {
      return { category: 'challenge', label: 'Manager Challenge', officialReason: 'Manager challenge', reviewType: code };
    }
    if (desc.includes('crew chief') || desc.includes('umpire')) {
      return { category: 'review', label: 'Umpire / Crew Chief Review', officialReason: 'Umpire review', reviewType: code };
    }
    return { category: 'review', label: 'Replay Review', officialReason: 'Replay review', reviewType: code };
  }

  function extractChallengeCounters(source) {
    if (!source || typeof source !== 'object') return { review: null, absChallenges: null };
    const gd = source.gameData || source;
    const rawRev = gd.review || source.review || null;
    const rawAbs = gd.absChallenges || source.absChallenges || null;

    const readMgrSide = (side) => {
      if (!side || typeof side !== 'object') return null;
      const used = typeof side.used === 'number' ? side.used : null;
      const remaining = typeof side.remaining === 'number' ? side.remaining : null;
      if (used === null && remaining === null) return null;
      return { used, remaining };
    };

    const readAbsSide = (side) => {
      if (!side || typeof side !== 'object') return null;
      const usedSuccessful = typeof side.usedSuccessful === 'number' ? side.usedSuccessful : null;
      const usedFailed = typeof side.usedFailed === 'number' ? side.usedFailed : null;
      const remaining = typeof side.remaining === 'number' ? side.remaining : null;
      if (usedSuccessful === null && usedFailed === null && remaining === null) return null;
      return { usedSuccessful, usedFailed, remaining };
    };

    const review = rawRev && (rawRev.away || rawRev.home)
      ? {
        hasChallenges: Boolean(rawRev.hasChallenges),
        away: readMgrSide(rawRev.away),
        home: readMgrSide(rawRev.home),
      }
      : null;

    const absChallenges = rawAbs && (rawAbs.away || rawAbs.home)
      ? {
        hasChallenges: Boolean(rawAbs.hasChallenges),
        away: readAbsSide(rawAbs.away),
        home: readAbsSide(rawAbs.home),
      }
      : null;

    return { review, absChallenges };
  }

  function detectCounterIrregularity(prevCounters, nextCounters, awayAbbr, homeAbbr) {
    const notes = [];
    if (!prevCounters || !nextCounters) return notes;
    const sides = [
      { key: 'away', abbr: awayAbbr || 'Away' },
      { key: 'home', abbr: homeAbbr || 'Home' },
    ];
    sides.forEach(({ key, abbr }) => {
      const pm = prevCounters.review && prevCounters.review[key];
      const nm = nextCounters.review && nextCounters.review[key];
      if (pm && nm && typeof pm.used === 'number' && typeof nm.used === 'number' && nm.used < pm.used) {
        notes.push(`Irregularity: ${abbr} manager challenges used moved backwards (${pm.used} → ${nm.used})`);
      }
      const pa = prevCounters.absChallenges && prevCounters.absChallenges[key];
      const na = nextCounters.absChallenges && nextCounters.absChallenges[key];
      if (pa && na) {
        if (typeof pa.usedSuccessful === 'number' && typeof na.usedSuccessful === 'number' && na.usedSuccessful < pa.usedSuccessful) {
          notes.push(`Irregularity: ${abbr} ABS successful counter moved backwards (${pa.usedSuccessful} → ${na.usedSuccessful})`);
        }
        if (typeof pa.usedFailed === 'number' && typeof na.usedFailed === 'number' && na.usedFailed < pa.usedFailed) {
          notes.push(`Irregularity: ${abbr} ABS failed counter moved backwards (${pa.usedFailed} → ${na.usedFailed})`);
        }
      }
    });
    return notes;
  }

  function formatTeamCounterLine(category, sideKey, abbr, counters) {
    if (!counters || !sideKey || !abbr) return '';
    if (category === 'abs') {
      const s = counters.absChallenges && counters.absChallenges[sideKey];
      if (!s || s.remaining === null) return '';
      const word = s.remaining === 1 ? 'challenge' : 'challenges';
      const detail = (s.usedSuccessful !== null || s.usedFailed !== null)
        ? ` (${s.usedSuccessful ?? '—'} successful · ${s.usedFailed ?? '—'} failed)`
        : '';
      return `${abbr}: ${s.remaining} ABS ${word} left now${detail}`;
    }
    if (category === 'challenge') {
      const s = counters.review && counters.review[sideKey];
      if (!s || s.remaining === null) return '';
      const word = s.remaining === 1 ? 'challenge' : 'challenges';
      const detail = s.used !== null ? ` (${s.used} used)` : '';
      return `${abbr}: ${s.remaining} manager ${word} left now${detail}`;
    }
    // Crew-chief, umpire, and boundary reviews are not charged to team counters.
    return '';
  }

  function formatBothTeamsCounterSummary(awayAbbr, homeAbbr, counters) {
    if (!counters) return '';
    const formatSide = (abbr, key) => {
      const parts = [];
      const m = counters.review && counters.review[key];
      const a = counters.absChallenges && counters.absChallenges[key];
      if (m && m.remaining !== null) parts.push(`${m.remaining} MGR`);
      if (a && a.remaining !== null) parts.push(`${a.remaining} ABS`);
      return parts.length ? `${abbr} ${parts.join(' · ')}` : '';
    };
    const aStr = formatSide(awayAbbr || 'AWY', 'away');
    const hStr = formatSide(homeAbbr || 'HOM', 'home');
    if (!aStr && !hStr) return '';
    return `Challenges left: ${[aStr, hStr].filter(Boolean).join(' — ')}`;
  }

  function parseOutcomeLabel(rd, description) {
    if (rd && rd.inProgress === true) return 'Under Review';
    if (rd && rd.isOverturned === true) return 'Overturned';
    const d = String(description || '').toLowerCase();
    if (d.includes('confirmed')) return 'Confirmed';
    if (d.includes('upheld') || d.includes('stands')) return 'Call Stands';
    return 'Call Stands';
  }

  function resolveChallengerInfo(rd, halfInning, away, home, description, isAbs) {
    const teamId = rd && rd.challengeTeamId ? Number(rd.challengeTeamId) : null;
    let side = null;
    let abbr = '';
    let name = '';
    if (teamId && away && Number(away.id) === teamId) {
      side = 'away';
      abbr = away.abbreviation || 'AWY';
      name = away.name || abbr;
    } else if (teamId && home && Number(home.id) === teamId) {
      side = 'home';
      abbr = home.abbreviation || 'HOM';
      name = home.name || abbr;
    }

    let role = '';
    if (isAbs) {
      const m = String(description || '').match(/^([^:.]+?)\s+challenged\s*\(pitch result\)/i);
      if (m && m[1]) {
        role = m[1].trim();
      } else if (side) {
        const h = String(halfInning || '').toLowerCase();
        const battingSide = h.startsWith('top') ? 'away' : h.startsWith('bot') ? 'home' : null;
        if (battingSide) {
          role = side === battingSide ? 'Batter' : 'Pitcher / Catcher';
        }
      }
    }
    return { teamId, side, abbr, name, role };
  }

  function findScoringRunnersForReview(runners, evIdx, events) {
    if (!Array.isArray(runners) || !runners.length) return [];
    let targetPlayIndex = evIdx;
    if (targetPlayIndex === null || targetPlayIndex === undefined) {
      // Play-level review applies to the terminal event of the play (not an
      // earlier steal of home or wild pitch in the same plate appearance).
      if (Array.isArray(events) && events.length) {
        const lastEv = events[events.length - 1];
        targetPlayIndex = typeof lastEv.index === 'number' ? lastEv.index : events.length - 1;
      } else {
        targetPlayIndex = null;
      }
    }
    return runners.filter((r) => {
      if (!r || !r.details || r.details.isScoringEvent !== true) return false;
      if (targetPlayIndex === null || targetPlayIndex === undefined) return false;
      return r.details.playIndex === targetPlayIndex;
    });
  }

  function extractAbsPitchContext(events, evIdx, isOverturned) {
    if (!Array.isArray(events) || !events.length) return null;
    let idx = evIdx;
    if (idx === null || idx === undefined) {
      for (let i = events.length - 1; i >= 0; i -= 1) {
        if (events[i] && events[i].isPitch) { idx = i; break; }
      }
    }
    if (idx === null || idx === undefined || !events[idx]) return null;
    const ev = events[idx];
    let prevCount = { balls: 0, strikes: 0 };
    for (let i = idx - 1; i >= 0; i -= 1) {
      if (events[i] && events[i].count) {
        prevCount = {
          balls: events[i].count.balls ?? 0,
          strikes: events[i].count.strikes ?? 0,
        };
        break;
      }
    }
    const afterCount = ev.count
      ? { balls: ev.count.balls ?? 0, strikes: ev.count.strikes ?? 0 }
      : null;
    const callDesc = (ev.details && ev.details.call && ev.details.call.description) ||
      (ev.details && ev.details.description) || '';
    return {
      beforeCount: `${prevCount.balls}-${prevCount.strikes}`,
      afterCount: afterCount ? `${afterCount.balls}-${afterCount.strikes}` : null,
      callDesc,
      isOverturned: Boolean(isOverturned),
    };
  }

  function extractGameReviews(feed, metaOverride) {
    if (!feed) return [];
    const playsObj = (feed.liveData && feed.liveData.plays) || feed;
    const plays = Array.isArray(playsObj.allPlays) ? playsObj.allPlays : [];
    const gameData = feed.gameData || {};
    const away = (metaOverride && metaOverride.away) || (gameData.teams && gameData.teams.away) || {};
    const home = (metaOverride && metaOverride.home) || (gameData.teams && gameData.teams.home) || {};
    const gamePk = (metaOverride && metaOverride.gamePk) || (gameData.game && gameData.game.pk) || feed.gamePk || null;
    const counters = extractChallengeCounters(metaOverride && metaOverride.counters ? metaOverride.counters : feed);
    const linescore = feed.liveData && feed.liveData.linescore;
    const currentAwayScore = linescore && linescore.teams && linescore.teams.away ? linescore.teams.away.runs : null;
    const currentHomeScore = linescore && linescore.teams && linescore.teams.home ? linescore.teams.home.runs : null;

    const items = [];
    const seenKeys = new Set();

    const pushReview = (play, playIdx, rd, ev, evIdx, suffix) => {
      if (!rd || typeof rd !== 'object') return;
      const about = play.about || {};
      const result = play.result || {};
      const runners = play.runners || [];
      const events = play.playEvents || [];
      const atBatIndex = typeof about.atBatIndex === 'number' ? about.atBatIndex : playIdx;

      const cls = classifyReview(rd, ev ? ev.details : null, result.description);
      const dedupeKey = `${atBatIndex}:${cls.reviewType || cls.category}:${rd.challengeTeamId || ''}:${evIdx === null ? 'play' : evIdx}:${suffix || ''}`;
      if (seenKeys.has(dedupeKey)) return;
      seenKeys.add(dedupeKey);

      const inProgress = rd.inProgress === true;
      const isOverturned = rd.isOverturned === true;
      const isAbs = cls.category === 'abs';
      const challenger = resolveChallengerInfo(rd, about.halfInning, away, home, result.description, isAbs);

      const evPlayIndex = ev && typeof ev.index === 'number' ? ev.index : evIdx;
      const scoringRunners = findScoringRunnersForReview(runners, evPlayIndex, events);
      const runsCredited = scoringRunners.length;
      const runsAtRisk = inProgress ? runsCredited : 0;

      const isPlayLevel = evIdx === null || evIdx === undefined;
      const isFinalEventOfPlay = !isPlayLevel && events.length > 0 && evIdx === events.length - 1;
      const isComplete = Boolean(about.isComplete);

      // Score tracking: never assign a later end-of-PA score to an earlier mid-AB pitch review.
      const playAwayScore = typeof result.awayScore === 'number' ? result.awayScore : currentAwayScore;
      const playHomeScore = typeof result.homeScore === 'number' ? result.homeScore : currentHomeScore;

      let beforeScore = null;
      let possibleScore = null;
      let actualScore = null;

      if (inProgress && typeof playAwayScore === 'number' && typeof playHomeScore === 'number') {
        beforeScore = { away: playAwayScore, home: playHomeScore };
        if (runsCredited > 0) {
          const isTop = String(about.halfInning || '').toLowerCase().startsWith('top');
          const altAway = isTop ? Math.max(0, playAwayScore - runsCredited) : playAwayScore;
          const altHome = !isTop ? Math.max(0, playHomeScore - runsCredited) : playHomeScore;
          possibleScore = {
            stands: { away: playAwayScore, home: playHomeScore },
            ifRemoved: { away: altAway, home: altHome },
            runsRemovable: runsCredited,
            pendingText: null,
          };
        } else if (cls.category === 'boundary') {
          possibleScore = {
            stands: { away: playAwayScore, home: playHomeScore },
            ifRemoved: null,
            runsRemovable: 0,
            pendingText: 'Score impact pending (boundary call)',
          };
        } else {
          possibleScore = {
            stands: { away: playAwayScore, home: playHomeScore },
            ifRemoved: null,
            runsRemovable: 0,
            pendingText: null,
          };
        }
      } else if (!inProgress) {
        if ((isPlayLevel || (isFinalEventOfPlay && isComplete)) &&
          typeof result.awayScore === 'number' && typeof result.homeScore === 'number') {
          actualScore = { away: result.awayScore, home: result.homeScore };
        }
      }

      const absContext = isAbs ? extractAbsPitchContext(events, evIdx, isOverturned) : null;
      const counterLine = formatTeamCounterLine(cls.category, challenger.side, challenger.abbr, counters);
      const bothTeamsCounterSummary = formatBothTeamsCounterSummary(away.abbreviation, home.abbreviation, counters);

      const reasonParts = [];
      if (cls.officialReason) reasonParts.push(cls.officialReason);
      const detailDesc = (ev && ev.details && ev.details.description) || '';
      const playDesc = result.description || '';
      const fullReason = playDesc || detailDesc || cls.officialReason || '';

      items.push({
        id: `${gamePk || 'g'}-${atBatIndex}-${evIdx === null || evIdx === undefined ? 'play' : evIdx}${suffix ? '-' + suffix : ''}`,
        gamePk,
        atBatIndex,
        awayAbbr: away.abbreviation || 'AWY',
        homeAbbr: home.abbreviation || 'HOM',
        awayId: away.id || null,
        homeId: home.id || null,
        inning: about.inning ?? null,
        halfInning: about.halfInning || '',
        batter: play.matchup && play.matchup.batter ? play.matchup.batter.fullName : '',
        pitcher: play.matchup && play.matchup.pitcher ? play.matchup.pitcher.fullName : '',
        category: cls.category,
        reviewType: cls.reviewType,
        label: cls.label,
        officialReason: cls.officialReason,
        reason: fullReason,
        challengerTeamId: challenger.teamId,
        challengerSide: challenger.side,
        challengerAbbr: challenger.abbr,
        challengerRole: challenger.role,
        inProgress,
        isOverturned,
        outcome: parseOutcomeLabel(rd, playDesc),
        runsAtRisk,
        runsCredited,
        beforeScore,
        possibleScore,
        actualScore,
        absContext,
        counterLine,
        bothTeamsCounterSummary,
        awayScore: actualScore ? actualScore.away : (beforeScore ? beforeScore.away : null),
        homeScore: actualScore ? actualScore.home : (beforeScore ? beforeScore.home : null),
        timestamp: about.endTime || about.startTime || '',
      });
    };

    plays.forEach((play, playIdx) => {
      const about = play.about || {};
      const result = play.result || {};
      const events = play.playEvents || [];
      const atBatIndex = typeof about.atBatIndex === 'number' ? about.atBatIndex : playIdx;

      if (play.reviewDetails) {
        pushReview(play, playIdx, play.reviewDetails, null, null, '');
        if (Array.isArray(play.reviewDetails.additionalReviews)) {
          play.reviewDetails.additionalReviews.forEach((ar, idx) => {
            pushReview(play, playIdx, ar, null, null, `add${idx}`);
          });
        }
      }

      // Official scorer pending ruling at play level (verified in /api/v1/eventTypes)
      if (result.eventType === 'os_ruling_pending_primary' || result.eventType === 'os_ruling_pending_prior') {
        items.push({
          id: `${gamePk || 'g'}-${atBatIndex}-os-play`,
          gamePk,
          atBatIndex,
          awayAbbr: away.abbreviation || 'AWY',
          homeAbbr: home.abbreviation || 'HOM',
          inning: about.inning ?? null,
          halfInning: about.halfInning || '',
          batter: play.matchup && play.matchup.batter ? play.matchup.batter.fullName : '',
          pitcher: play.matchup && play.matchup.pitcher ? play.matchup.pitcher.fullName : '',
          category: 'os_pending',
          reviewType: result.eventType,
          label: 'Official Scorer Ruling Pending',
          officialReason: 'Official Scorer Ruling Pending',
          reason: result.description || 'Official Scorer Ruling Pending',
          inProgress: true,
          isOverturned: false,
          outcome: 'Pending',
          runsAtRisk: 0,
          runsCredited: 0,
          beforeScore: null,
          possibleScore: null,
          actualScore: (typeof result.awayScore === 'number' && typeof result.homeScore === 'number')
            ? { away: result.awayScore, home: result.homeScore }
            : null,
          awayScore: result.awayScore ?? null,
          homeScore: result.homeScore ?? null,
          timestamp: about.endTime || about.startTime || '',
        });
      }

      events.forEach((ev, evIdx) => {
        if (ev && ev.reviewDetails) {
          pushReview(play, playIdx, ev.reviewDetails, ev, evIdx, '');
          if (Array.isArray(ev.reviewDetails.additionalReviews)) {
            ev.reviewDetails.additionalReviews.forEach((ar, idx) => {
              pushReview(play, playIdx, ar, ev, evIdx, `add${idx}`);
            });
          }
        }
        const evType = ev && ev.details && ev.details.eventType;
        if (evType === 'os_ruling_pending_primary' || evType === 'os_ruling_pending_prior') {
          const osId = `${gamePk || 'g'}-${atBatIndex}-os-${evIdx}`;
          if (!items.some((x) => x.id === `${gamePk || 'g'}-${atBatIndex}-os-play`)) {
            items.push({
              id: osId,
              gamePk,
              atBatIndex,
              awayAbbr: away.abbreviation || 'AWY',
              homeAbbr: home.abbreviation || 'HOM',
              inning: about.inning ?? null,
              halfInning: about.halfInning || '',
              batter: play.matchup && play.matchup.batter ? play.matchup.batter.fullName : '',
              pitcher: play.matchup && play.matchup.pitcher ? play.matchup.pitcher.fullName : '',
              category: 'os_pending',
              reviewType: evType,
              label: 'Official Scorer Ruling Pending',
              officialReason: 'Official Scorer Ruling Pending',
              reason: (ev.details && ev.details.description) || result.description || 'Official Scorer Ruling Pending',
              inProgress: true,
              isOverturned: false,
              outcome: 'Pending',
              runsAtRisk: 0,
              runsCredited: 0,
              beforeScore: null,
              possibleScore: null,
              actualScore: null,
              awayScore: result.awayScore ?? null,
              homeScore: result.homeScore ?? null,
              timestamp: about.endTime || about.startTime || '',
            });
          }
        }
      });
    });

    return items;
  }

  /**
   * Snapshot every completed play's official classification so consecutive polls
   * can detect Official Scoring Changes (hit <-> error <-> out, single <-> double, etc.).
   */
  function snapshotCompletedPlays(plays) {
    const snaps = {};
    if (!Array.isArray(plays)) return snaps;
    plays.forEach((p, idx) => {
      const about = p && p.about;
      const res = p && p.result;
      if (!about || !about.isComplete || !res || !res.eventType) return;
      const abIdx = typeof about.atBatIndex === 'number' ? about.atBatIndex : idx;
      const runners = Array.isArray(p.runners) ? p.runners : [];
      const errorMoves = runners.filter((r) => {
        const et = String((r && r.details && r.details.eventType) || '').toLowerCase();
        const mr = String((r && r.details && r.details.movementReason) || '').toLowerCase();
        return et.includes('error') || mr.includes('error');
      }).length;
      const hasReview = Boolean(p.reviewDetails) || (p.playEvents || []).some((e) => e && e.reviewDetails);
      snaps[String(abIdx)] = {
        atBatIndex: abIdx,
        inning: about.inning ?? null,
        halfInning: about.halfInning || '',
        batter: p.matchup && p.matchup.batter ? p.matchup.batter.fullName : '',
        pitcher: p.matchup && p.matchup.pitcher ? p.matchup.pitcher.fullName : '',
        eventType: res.eventType,
        event: res.event || res.eventType,
        isOut: Boolean(res.isOut),
        outs: p.count && typeof p.count.outs === 'number' ? p.count.outs : null,
        errorMoves,
        rbi: typeof res.rbi === 'number' ? res.rbi : null,
        awayScore: typeof res.awayScore === 'number' ? res.awayScore : null,
        homeScore: typeof res.homeScore === 'number' ? res.homeScore : null,
        description: res.description || '',
        hasReview,
        endTime: about.endTime || about.startTime || '',
      };
    });
    return snaps;
  }

  function diffPlaySnapshots(prevSnaps, nextSnaps, meta) {
    const scoringChanges = [];
    const irregularities = [];
    if (!prevSnaps || typeof prevSnaps !== 'object' || !nextSnaps || typeof nextSnaps !== 'object') {
      return { scoringChanges, irregularities };
    }
    const gamePk = meta && meta.gamePk ? meta.gamePk : null;
    const awayAbbr = (meta && meta.awayAbbr) || 'AWY';
    const homeAbbr = (meta && meta.homeAbbr) || 'HOM';

    Object.keys(prevSnaps).forEach((abKey) => {
      const prev = prevSnaps[abKey];
      const next = nextSnaps[abKey];
      if (!prev) return;
      if (!next) {
        irregularities.push(`Play #${abKey} (${prev.event || prev.eventType}) vanished from official payload`);
        return;
      }

      const classChanged = prev.eventType !== next.eventType ||
        prev.isOut !== next.isOut ||
        prev.outs !== next.outs ||
        prev.errorMoves !== next.errorMoves;

      if (classChanged) {
        if (next.hasReview && !prev.hasReview) {
          // Coincides with a replay review — stays on the review row.
          return;
        }
        const initialLabel = prev.event || prev.eventType;
        const finalLabel = next.event || next.eventType;
        scoringChanges.push({
          id: `${gamePk || 'g'}-${abKey}-scoring-change`,
          gamePk,
          atBatIndex: next.atBatIndex,
          awayAbbr,
          homeAbbr,
          inning: next.inning,
          halfInning: next.halfInning,
          batter: next.batter,
          pitcher: next.pitcher,
          category: 'scoring_change',
          reviewType: 'scoring_change',
          label: 'Official Scoring Change',
          officialReason: `${initialLabel} → ${finalLabel}`,
          initialCall: initialLabel,
          finalRuling: finalLabel,
          history: [
            { event: initialLabel, eventType: prev.eventType, observedAt: Date.now() },
            { event: finalLabel, eventType: next.eventType, observedAt: Date.now() },
          ],
          reason: next.description || `${initialLabel} reclassified as ${finalLabel}`,
          inProgress: false,
          isOverturned: false,
          outcome: `${initialLabel} → ${finalLabel}`,
          runsAtRisk: 0,
          actualScore: (typeof next.awayScore === 'number' && typeof next.homeScore === 'number')
            ? { away: next.awayScore, home: next.homeScore }
            : null,
          awayScore: next.awayScore,
          homeScore: next.homeScore,
          timestamp: next.endTime || new Date().toISOString(),
        });
      } else {
        const metaChanged = prev.description !== next.description ||
          prev.rbi !== next.rbi ||
          prev.awayScore !== next.awayScore ||
          prev.homeScore !== next.homeScore;
        if (metaChanged) {
          irregularities.push(`Play #${abKey} payload edited without reclassification (${prev.eventType})`);
        }
      }
    });

    return { scoringChanges, irregularities };
  }

  const reviewsApi = {
    classifyReview,
    extractChallengeCounters,
    detectCounterIrregularity,
    formatTeamCounterLine,
    formatBothTeamsCounterSummary,
    parseOutcomeLabel,
    extractGameReviews,
    snapshotCompletedPlays,
    diffPlaySnapshots,
  };

  global.Reviews = reviewsApi;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = reviewsApi;
  }
})(typeof window !== 'undefined' ? window : globalThis);
