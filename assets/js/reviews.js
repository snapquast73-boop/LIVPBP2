(function (global) {
  'use strict';

  /* Official review/challenge classification.
   * The official MLB StatsAPI status registry (GET /api/v1/gameStatus) defines
   * manager challenges (codes "M*", e.g. MF = Close play at 1st, MA = Tag play)
   * and umpire reviews (codes "N*", e.g. NH = Home run, NS = Stadium boundary
   * call); MJ = Player challenge: Pitch Result and NJ = Umpire challenge: Pitch
   * Result are the ABS pitch-challenge codes. The reviewDetails payload is not
   * part of the documented StatsAPI surface, so the classification also falls
   * back to matching official text descriptions. See
   * https://statsapi.mlb.com/api/v1/gameStatus and
   * https://statsapi.mlb.com/api/v1/reviewReasons (the reviews payload shape is
   * flagged as unverified on the Flagged for Review page). */
  function classifyReview(reviewDetails, evDetails) {
    const code = String((reviewDetails && reviewDetails.reviewType) || '').trim();
    const desc = String((evDetails && evDetails.description) || (reviewDetails && reviewDetails.reason) || '').toLowerCase();
    const type = code.replace(/[\s-]/g, '').toLowerCase();

    if (type === 'mj' || type === 'nj' || type.indexOf('pitchresult') !== -1 || desc.includes('abs') || desc.includes('ball-strike')) {
      return { category: 'abs', label: 'ABS Challenge' };
    }
    if (type === 'ma' || type === 'mf' || type.startsWith('m') || desc.includes('manager challenge')) {
      return { category: 'challenge', label: 'Manager Challenge' };
    }
    if (desc.includes('boundary') || desc.includes('home run')) {
      return { category: 'boundary', label: 'Boundary Call' };
    }
    if (type.startsWith('n') || desc.includes('crew chief') || desc.includes('umpire')) {
      return { category: 'review', label: 'Umpire / Crew Chief Review' };
    }
    return { category: 'review', label: 'Replay Review' };
  }

  function extractGameReviews(feed) {
    if (!feed || !feed.liveData || !feed.liveData.plays) return [];
    const plays = feed.liveData.plays.allPlays || [];
    const gameData = feed.gameData || {};
    const away = (gameData.teams && gameData.teams.away) || {};
    const home = (gameData.teams && gameData.teams.home) || {};
    const items = [];

    plays.forEach((play, playIdx) => {
      const about = play.about || {};
      const result = play.result || {};
      const runners = play.runners || [];
      const events = play.playEvents || [];

      const checkReview = (rd, ev, evIdx) => {
        if (!rd) return;
        const cls = classifyReview(rd, ev ? ev.details : null);
        const isOverturned = rd.isOverturned === true;
        const inProgress = rd.inProgress === true;

        // Runs at risk: runners[] with details.isScoringEvent === true tied to this event
        const scoringRunners = runners.filter(
          (r) => r.details && r.details.isScoringEvent === true &&
            (evIdx === null || r.details.playIndex === evIdx)
        );

        items.push({
          id: `${gameData.game ? gameData.game.pk : 'g'}-${playIdx}-${evIdx ?? 'play'}`,
          gamePk: gameData.game ? gameData.game.pk : null,
          awayAbbr: away.abbreviation || 'AWY',
          homeAbbr: home.abbreviation || 'HOM',
          inning: about.inning,
          halfInning: about.halfInning,
          batter: play.matchup && play.matchup.batter ? play.matchup.batter.fullName : '',
          pitcher: play.matchup && play.matchup.pitcher ? play.matchup.pitcher.fullName : '',
          category: cls.category,
          label: cls.label,
          reason: rd.reason || (ev && ev.details ? ev.details.description : '') || result.description || '',
          inProgress,
          isOverturned,
          outcome: inProgress ? 'Under Review' : isOverturned ? 'Overturned' : 'Call Stands / Confirmed',
          runsAtRisk: inProgress ? scoringRunners.length : 0,
          awayScore: result.awayScore,
          homeScore: result.homeScore,
          timestamp: about.endTime || about.startTime || '',
        });
      };

      if (play.reviewDetails) {
        checkReview(play.reviewDetails, null, null);
      }

      events.forEach((ev, evIdx) => {
        if (ev.reviewDetails) {
          checkReview(ev.reviewDetails, ev, evIdx);
        }
        // The official event-type registry (GET /api/v1/eventTypes) defines
        // os_ruling_pending_primary / os_ruling_pending_prior ("Official Scorer
        // Ruling Pending"). Events carry the code in details.code or
        // details.eventType; accept either shape.
        const evCodes = [ev.details && ev.details.eventType, ev.details && ev.details.code].filter(Boolean);
        const evType = evCodes.find((c) => c === 'os_ruling_pending_primary' || c === 'os_ruling_pending_prior');
        if (evType) {
          items.push({
            id: `${gameData.game ? gameData.game.pk : 'g'}-${playIdx}-os-${evIdx}`,
            gamePk: gameData.game ? gameData.game.pk : null,
            awayAbbr: away.abbreviation || 'AWY',
            homeAbbr: home.abbreviation || 'HOM',
            inning: about.inning,
            halfInning: about.halfInning,
            batter: play.matchup && play.matchup.batter ? play.matchup.batter.fullName : '',
            pitcher: play.matchup && play.matchup.pitcher ? play.matchup.pitcher.fullName : '',
            category: 'os_pending',
            label: 'Official Scorer Ruling Pending',
            reason: (ev.details && ev.details.description) || result.description || 'Official Scorer Ruling Pending',
            inProgress: true,
            isOverturned: false,
            outcome: 'Pending',
            runsAtRisk: 0,
            awayScore: result.awayScore,
            homeScore: result.homeScore,
            timestamp: about.endTime || about.startTime || '',
          });
        }
      });
    });

    return items;
  }

  global.Reviews = {
    classifyReview,
    extractGameReviews,
  };
})(window);
