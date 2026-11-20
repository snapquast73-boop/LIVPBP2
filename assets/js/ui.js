(function (global) {
  'use strict';

  // Official review/challenge statusCode registry verified directly from
  // https://statsapi.mlb.com/api/v1/gameStatus
  const OFFICIAL_REVIEW_STATUSES = {
    IH: { codedGameState: 'I', detailedState: 'Instant Replay', reason: 'Review', category: 'review', label: 'Instant Replay' },
    // Manager challenges (codedGameState: "M")
    MF: { codedGameState: 'M', detailedState: 'Manager challenge: Close play at 1st', reason: 'Close play at 1st', category: 'challenge', label: 'Manager Challenge' },
    MA: { codedGameState: 'M', detailedState: 'Manager challenge: Tag play', reason: 'Tag play', category: 'challenge', label: 'Manager Challenge' },
    MU: { codedGameState: 'M', detailedState: 'Manager challenge: Tag-up play', reason: 'Tag-up play', category: 'challenge', label: 'Manager Challenge' },
    MM: { codedGameState: 'M', detailedState: 'Manager challenge: Timing play', reason: 'Timing play', category: 'challenge', label: 'Manager Challenge' },
    MC: { codedGameState: 'M', detailedState: 'Manager challenge: Force play', reason: 'Force play', category: 'challenge', label: 'Manager Challenge' },
    MP: { codedGameState: 'M', detailedState: 'Manager challenge: Home-plate collision', reason: 'Home-plate collision', category: 'challenge', label: 'Manager Challenge' },
    ME: { codedGameState: 'M', detailedState: 'Manager challenge: Slide interference', reason: 'Slide interference', category: 'challenge', label: 'Manager Challenge' },
    MH: { codedGameState: 'M', detailedState: 'Manager challenge: Home run', reason: 'Home run', category: 'boundary', label: 'Boundary Call' },
    MO: { codedGameState: 'M', detailedState: 'Manager challenge: Fair/foul in outfield', reason: 'Fair/foul in outfield', category: 'boundary', label: 'Boundary Call' },
    MD: { codedGameState: 'M', detailedState: 'Manager challenge: Catch/drop in outfield', reason: 'Catch/drop in outfield', category: 'challenge', label: 'Manager Challenge' },
    MT: { codedGameState: 'M', detailedState: 'Manager challenge: Trap play in outfield', reason: 'Trap play in outfield', category: 'challenge', label: 'Manager Challenge' },
    MI: { codedGameState: 'M', detailedState: 'Manager challenge: Hit by pitch', reason: 'Hit by pitch', category: 'challenge', label: 'Manager Challenge' },
    MB: { codedGameState: 'M', detailedState: 'Manager challenge: Touching a base', reason: 'Touching a base', category: 'challenge', label: 'Manager Challenge' },
    MR: { codedGameState: 'M', detailedState: 'Manager challenge: Passing runners', reason: 'Passing runners', category: 'challenge', label: 'Manager Challenge' },
    MN: { codedGameState: 'M', detailedState: 'Manager challenge: Fan interference', reason: 'Fan interference', category: 'challenge', label: 'Manager Challenge' },
    MS: { codedGameState: 'M', detailedState: 'Manager challenge: Stadium boundary call', reason: 'Stadium boundary call', category: 'boundary', label: 'Boundary Call' },
    MG: { codedGameState: 'M', detailedState: 'Manager challenge: Grounds rule', reason: 'Grounds rule', category: 'challenge', label: 'Manager Challenge' },
    MQ: { codedGameState: 'M', detailedState: 'Manager challenge: Rules check', reason: 'Rules check', category: 'challenge', label: 'Manager Challenge' },
    MK: { codedGameState: 'M', detailedState: 'Manager challenge: Record keeping', reason: 'Record keeping', category: 'challenge', label: 'Manager Challenge' },
    ML: { codedGameState: 'M', detailedState: 'Manager challenge: Multiple issues', reason: 'Multiple issues', category: 'challenge', label: 'Manager Challenge' },
    MX: { codedGameState: 'M', detailedState: 'Manager challenge', reason: 'Manager challenge', category: 'challenge', label: 'Manager Challenge' },
    MV: { codedGameState: 'M', detailedState: 'Manager challenge: Catchers Interference', reason: 'Catchers Interference', category: 'challenge', label: 'Manager Challenge' },
    MJ: { codedGameState: 'M', detailedState: 'Player challenge: Pitch Result', reason: 'Pitch Result', category: 'abs', label: 'ABS Challenge' },
    // Umpire / Crew Chief reviews (codedGameState: "N")
    NF: { codedGameState: 'N', detailedState: 'Umpire review: Close play at 1st', reason: 'Close play at 1st', category: 'review', label: 'Umpire Review' },
    NA: { codedGameState: 'N', detailedState: 'Umpire review: Tag play', reason: 'Tag play', category: 'review', label: 'Umpire Review' },
    NW: { codedGameState: 'N', detailedState: 'Umpire review: Def Shift Violation', reason: 'Def Shift Violation', category: 'review', label: 'Umpire Review' },
    NU: { codedGameState: 'N', detailedState: 'Umpire review: Tag-up play', reason: 'Tag-up play', category: 'review', label: 'Umpire Review' },
    NM: { codedGameState: 'N', detailedState: 'Umpire review: Timing play', reason: 'Timing play', category: 'review', label: 'Umpire Review' },
    NC: { codedGameState: 'N', detailedState: 'Umpire review: Force play', reason: 'Force play', category: 'review', label: 'Umpire Review' },
    NP: { codedGameState: 'N', detailedState: 'Umpire review: Home-plate collision', reason: 'Home-plate collision', category: 'review', label: 'Umpire Review' },
    NE: { codedGameState: 'N', detailedState: 'Umpire review: Slide interference', reason: 'Slide interference', category: 'review', label: 'Umpire Review' },
    NH: { codedGameState: 'N', detailedState: 'Umpire review: Home run', reason: 'Home run', category: 'boundary', label: 'Boundary Call' },
    NO: { codedGameState: 'N', detailedState: 'Umpire review: Fair/foul in outfield', reason: 'Fair/foul in outfield', category: 'boundary', label: 'Boundary Call' },
    ND: { codedGameState: 'N', detailedState: 'Umpire review: Catch/drop in outfield', reason: 'Catch/drop in outfield', category: 'review', label: 'Umpire Review' },
    NT: { codedGameState: 'N', detailedState: 'Umpire review: Trap play in outfield', reason: 'Trap play in outfield', category: 'review', label: 'Umpire Review' },
    NI: { codedGameState: 'N', detailedState: 'Umpire review: Hit by pitch', reason: 'Hit by pitch', category: 'review', label: 'Umpire Review' },
    NB: { codedGameState: 'N', detailedState: 'Umpire review: Touching a base', reason: 'Touching a base', category: 'review', label: 'Umpire Review' },
    NR: { codedGameState: 'N', detailedState: 'Umpire review: Passing runners', reason: 'Passing runners', category: 'review', label: 'Umpire Review' },
    NN: { codedGameState: 'N', detailedState: 'Umpire review: Fan interference', reason: 'Fan interference', category: 'review', label: 'Umpire Review' },
    NS: { codedGameState: 'N', detailedState: 'Umpire review: Stadium boundary call', reason: 'Stadium boundary call', category: 'boundary', label: 'Boundary Call' },
    NG: { codedGameState: 'N', detailedState: 'Umpire review: Grounds rule', reason: 'Grounds rule', category: 'review', label: 'Umpire Review' },
    NQ: { codedGameState: 'N', detailedState: 'Umpire review: Rules check', reason: 'Rules check', category: 'review', label: 'Umpire Review' },
    NK: { codedGameState: 'N', detailedState: 'Umpire review: Record keeping', reason: 'Record keeping', category: 'review', label: 'Umpire Review' },
    NL: { codedGameState: 'N', detailedState: 'Umpire review: Multiple issues', reason: 'Multiple issues', category: 'review', label: 'Umpire Review' },
    NX: { codedGameState: 'N', detailedState: 'Umpire review', reason: 'Umpire review', category: 'review', label: 'Umpire Review' },
    NJ: { codedGameState: 'N', detailedState: 'Umpire Challenge: Pitch Result', reason: 'Pitch Result', category: 'abs', label: 'ABS Challenge' },
  };

  // Visual accent colors keyed by official MLB team IDs (verified from
  // https://statsapi.mlb.com/api/v1/teams?sportId=1). Colors are UI accents only.
  const TEAM_COLORS = {
    108: '#ba0021', // LAA
    109: '#a71930', // AZ
    110: '#df4601', // BAL
    111: '#bd3039', // BOS
    112: '#0e3386', // CHC
    113: '#c6011f', // CIN
    114: '#e31937', // CLE
    115: '#5a3e8c', // COL
    116: '#fa4616', // DET
    117: '#eb6e1f', // HOU
    118: '#004687', // KC
    119: '#005a9c', // LAD
    120: '#ab0003', // WSH
    121: '#ff5910', // NYM
    133: '#006341', // ATH
    134: '#fdb827', // PIT
    135: '#ffc425', // SD
    136: '#005c5c', // SEA
    137: '#fd5a1e', // SF
    138: '#c41e3a', // STL
    139: '#8fbce6', // TB
    140: '#003278', // TEX
    141: '#134a8e', // TOR
    142: '#d31145', // MIN
    143: '#e81828', // PHI
    144: '#ce1141', // ATL
    145: '#c4ced4', // CWS
    146: '#00a3e0', // MIA
    147: '#6b94c7', // NYY
    158: '#ffc52f', // MIL
  };

  function registerGameStatusList(list) {
    if (!Array.isArray(list)) return;
    list.forEach((entry) => {
      if (!entry || !entry.statusCode) return;
      const sc = String(entry.statusCode);
      const cg = String(entry.codedGameState || '');
      if (sc === 'IH' || cg === 'M' || cg === 'N') {
        if (!OFFICIAL_REVIEW_STATUSES[sc]) {
          const isAbs = sc === 'MJ' || sc === 'NJ';
          const isBoundary = sc === 'MH' || sc === 'MO' || sc === 'MS' || sc === 'NH' || sc === 'NO' || sc === 'NS';
          OFFICIAL_REVIEW_STATUSES[sc] = {
            codedGameState: cg,
            detailedState: entry.detailedState || sc,
            reason: entry.reason || entry.detailedState || 'Review',
            category: isAbs ? 'abs' : isBoundary ? 'boundary' : cg === 'M' ? 'challenge' : 'review',
            label: isAbs ? 'ABS Challenge' : isBoundary ? 'Boundary Call' : cg === 'M' ? 'Manager Challenge' : 'Umpire Review',
          };
        }
      }
    });
  }

  function isReviewStatus(status) {
    if (!status || typeof status !== 'object') return false;
    const sc = String(status.statusCode || '');
    const cg = String(status.codedGameState || '');
    if (sc === 'IH') return true;
    if (cg === 'M' || cg === 'N') return true;
    if (sc && OFFICIAL_REVIEW_STATUSES[sc]) return true;
    return false;
  }

  function describeReviewStatus(status) {
    if (!isReviewStatus(status)) return null;
    const sc = String(status.statusCode || '');
    const cg = String(status.codedGameState || '');
    const known = OFFICIAL_REVIEW_STATUSES[sc];
    if (known) {
      return {
        statusCode: sc,
        codedGameState: cg || known.codedGameState,
        category: known.category,
        label: known.label,
        reason: status.reason || known.reason,
        detailedState: status.detailedState || known.detailedState,
      };
    }
    const isAbs = sc === 'MJ' || sc === 'NJ';
    const isBoundary = sc === 'MH' || sc === 'MO' || sc === 'MS' || sc === 'NH' || sc === 'NO' || sc === 'NS';
    const category = isAbs ? 'abs' : isBoundary ? 'boundary' : cg === 'M' ? 'challenge' : 'review';
    const label = isAbs ? 'ABS Challenge' : isBoundary ? 'Boundary Call' : cg === 'M' ? 'Manager Challenge' : 'Umpire Review';
    return {
      statusCode: sc,
      codedGameState: cg,
      category,
      label,
      reason: status.reason || status.detailedState || 'Under Review',
      detailedState: status.detailedState || label,
    };
  }

  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function shiftDate(dateStr, deltaDays) {
    const parts = String(dateStr).split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2] + deltaDays);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatDateLabel(dateStr) {
    const parts = String(dateStr).split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    if (Number.isNaN(d.getTime())) return String(dateStr || '');
    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function formatTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function teamLogoUrl(teamId) {
    if (!teamId) return '';
    return `https://www.mlbstatic.com/team-logos/team-cap-on-dark/${teamId}.svg`;
  }

  function teamLogoFallbackUrl(teamId) {
    if (!teamId) return '';
    return `https://www.mlbstatic.com/team-logos/${teamId}.svg`;
  }

  function teamLogoImg(teamId, className, style) {
    if (!teamId) return '';
    const primary = teamLogoUrl(teamId);
    const fallback = teamLogoFallbackUrl(teamId);
    const cls = className ? ` class="${esc(className)}"` : ' class="team-logo"';
    const st = style ? ` style="${esc(style)}"` : '';
    return `<img${cls}${st} src="${esc(primary)}" onerror="if(!this.dataset.fb){this.dataset.fb='1';this.src='${esc(fallback)}';}else{this.style.visibility='hidden';}" alt="" loading="lazy">`;
  }

  function playerHeadshotUrl(playerId) {
    if (!playerId) return '';
    return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${playerId}/headshot/67/current`;
  }

  function teamColor(teamId) {
    return TEAM_COLORS[Number(teamId)] || '#2f81f7';
  }

  function renderCountDots(balls, strikes, outs) {
    const b = Number.isFinite(Number(balls)) ? Number(balls) : null;
    const s = Number.isFinite(Number(strikes)) ? Number(strikes) : null;
    const o = Number.isFinite(Number(outs)) ? Number(outs) : null;
    const dots = (val, max, cls) => {
      let out = '';
      for (let i = 0; i < max; i += 1) {
        const filled = val !== null && i < val;
        out += `<span class="bso-dot ${filled ? cls : ''}"></span>`;
      }
      return out;
    };
    return `
      <div class="bso-grid" aria-label="Balls ${b ?? ''}, Strikes ${s ?? ''}, Outs ${o ?? ''}">
        <span class="bso-row"><span class="bso-lbl">B</span>${dots(b, 4, 'dot-b')}</span>
        <span class="bso-row"><span class="bso-lbl">S</span>${dots(s, 3, 'dot-s')}</span>
        <span class="bso-row"><span class="bso-lbl">O</span>${dots(o, 3, 'dot-o')}</span>
      </div>
    `;
  }

  function renderBaseDiamond(offense, size) {
    const sz = size || 44;
    const on1 = Boolean(offense && offense.first);
    const on2 = Boolean(offense && offense.second);
    const on3 = Boolean(offense && offense.third);
    const titleParts = [];
    if (on1) titleParts.push(`1B: ${offense.first.fullName || 'Runner'}`);
    if (on2) titleParts.push(`2B: ${offense.second.fullName || 'Runner'}`);
    if (on3) titleParts.push(`3B: ${offense.third.fullName || 'Runner'}`);
    const title = titleParts.length ? titleParts.join(' · ') : 'Bases empty';
    return `
      <svg class="base-diamond" width="${sz}" height="${sz}" viewBox="0 0 60 52" role="img" aria-label="${esc(title)}">
        <title>${esc(title)}</title>
        <polygon points="30,6 39,15 30,24 21,15" class="base-sq ${on2 ? 'base-on' : ''}"/>
        <polygon points="44,20 53,29 44,38 35,29" class="base-sq ${on1 ? 'base-on' : ''}"/>
        <polygon points="16,20 25,29 16,38 7,29" class="base-sq ${on3 ? 'base-on' : ''}"/>
      </svg>
    `;
  }

  function formatInningShort(halfInning, inning) {
    if (!inning) return '';
    const h = String(halfInning || '').toLowerCase();
    const prefix = h.startsWith('top') ? 'Top' : h.startsWith('bot') ? 'Bot' : (halfInning || '');
    const n = Number(inning);
    const mod100 = n % 100;
    const suffix = (mod100 >= 11 && mod100 <= 13)
      ? 'th'
      : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
    return `${prefix} ${n}${suffix}`.trim();
  }

  const ui = {
    OFFICIAL_REVIEW_STATUSES,
    TEAM_COLORS,
    registerGameStatusList,
    isReviewStatus,
    describeReviewStatus,
    esc,
    todayStr,
    shiftDate,
    formatDateLabel,
    formatTime,
    teamLogoUrl,
    teamLogoFallbackUrl,
    teamLogoImg,
    playerHeadshotUrl,
    teamColor,
    renderCountDots,
    renderBaseDiamond,
    formatInningShort,
  };

  global.UI = ui;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ui;
  }
})(typeof window !== 'undefined' ? window : globalThis);
