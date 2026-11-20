(function (global) {
  'use strict';

  function classifyReview(reviewDetails, evDetails) {
    const code = (reviewDetails && reviewDetails.reviewType) || '';
    const desc = ((evDetails && evDetails.description) || (reviewDetails && reviewDetails.reason) || '').toLowerCase();

    if (code === 'MJ' || desc.includes('abs') || desc.includes('ball-strike')) {
      return { category: 'abs', label: 'ABS Challenge' };
    }
    if (code === 'MA' || code === 'MF' || desc.includes('manager challenge')) {
      return { category: 'challenge', label: 'Manager Challenge' };
    }
    if (desc.includes('boundary') || desc.includes('home run')) {
      return { category: 'boundary', label: 'Boundary Call' };
    }
    if (desc.includes('crew chief') || desc.includes('umpire')) {
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
        const evType = ev.details && ev.details.eventType;
        if (evType === 'os_ruling_pending_primary' || evType === 'os_ruling_pending_prior') {
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
