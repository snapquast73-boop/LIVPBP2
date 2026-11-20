(function (global) {
  'use strict';

  function render(feed, container) {
    if (!container) return;
    const plays = (feed && feed.liveData && feed.liveData.plays) || {};
    const currentPlay = plays.currentPlay || {};
    const matchup = currentPlay.matchup || {};
    const batter = matchup.batter || {};
    const pitcher = matchup.pitcher || {};

    if (!batter.fullName && !pitcher.fullName) {
      container.innerHTML = '<p style="color:var(--muted);">No active batter/pitcher matchup available.</p>';
      return;
    }

    container.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:12px;">
        <div class="stat-box">
          <div class="stat-lbl">Current Batter</div>
          <div class="stat-val" style="font-size:16px;">${UI.esc(batter.fullName || 'TBD')}</div>
          <div style="color:var(--muted); font-size:12px;">Bats: ${UI.esc((matchup.batSide && matchup.batSide.description) || '—')}</div>
        </div>
        <div class="stat-box">
          <div class="stat-lbl">Current Pitcher</div>
          <div class="stat-val" style="font-size:16px;">${UI.esc(pitcher.fullName || 'TBD')}</div>
          <div style="color:var(--muted); font-size:12px;">Throws: ${UI.esc((matchup.pitchHand && matchup.pitchHand.description) || '—')}</div>
        </div>
      </div>
    `;
  }

  global.Props = { render };
})(window);
