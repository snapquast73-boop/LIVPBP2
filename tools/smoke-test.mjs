#!/usr/bin/env node
/**
 * tools/smoke-test.mjs — dependency-free smoke test for the static site.
 *
 * Loads each page's scripts under a minimal DOM shim (raw Node, no dependencies)
 * with the official-StatsAPI-shaped synthetic fixtures below, then asserts the
 * pages render without throwing and surface the expected content (scoreboard
 * review detection, game header, linescore, boxscore, play-by-play, the
 * status-based under-review banner, the Replay Feed stats and runs-at-risk banner).
 *
 * The fixtures are SYNTHETIC — modeled on the real payload shapes documented in
 * the official StatsAPI responses (schedule, feed/live, boxscore) — so this is not
 * a check of real game data. It verifies the wiring of the front end only.
 *
 * Usage: node tools/smoke-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------- DOM shim --
function makeElement(tag, props = {}) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    id: props.id || '',
    className: props.className || '',
    innerHTML: '',
    _textContent: '',
    value: props.value !== undefined ? props.value : '',
    checked: !!props.checked,
    style: {},
    dataset: props.dataset || {},
    children: [],
    attrs: props.attrs || {},
    _listeners: {},
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
    removeEventListener(type, fn) { const l = this._listeners[type]; if (l) this._listeners[type] = l.filter((f) => f !== fn); },
    dispatchEvent() { return true; },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    get textContent() { return this._textContent; },
    set textContent(v) { this._textContent = v == null ? '' : String(v); },
    classList: {
      _set: new Set(),
      add(...c) { c.forEach((x) => this._set.add(x)); this._reflast(); },
      remove(...c) { c.forEach((x) => this._set.delete(x)); this._reflast(); },
      contains(c) { return this._set.has(c); },
      _reflast() { el.className = Array.from(this._set).join(' '); },
    },
  };
  el.classList._reflast();
  return el;
}

function makeDocument(ids = []) {
  const elements = new Map();
  ids.forEach((id) => elements.set(id, makeElement('div', { id })));
  return {
    _elements: elements,
    _listeners: [],
    getElementById(id) { return elements.get(id) || null; },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    addEventListener(type, fn) { this._listeners.push({ type, fn }); },
    _fire(type) { this._listeners.filter((l) => l.type === type).forEach((l) => l.fn()); },
    createElement(tag) { return makeElement(tag); },
  };
}

function makeHarness({ url, ids, scripts, fetchMock, done }) {
  const document = makeDocument(ids);
  const location = new URL(url);
  const store = new Map();
  const sandbox = {
    Object, Array, Map, Set, Number, String, Boolean, Math, JSON, Promise, RegExp, Error, Infinity, NaN,
    URLSearchParams, URL, Date, encodeURIComponent, decodeURIComponent, Intl,
    console: { log() {}, warn() {}, error() {} },
  };
  sandbox.window = sandbox;
  sandbox.document = document;
  sandbox.location = location;
  sandbox.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    key: (i) => Array.from(store.keys())[i],
    get length() { return store.size; },
  };
  sandbox.navigator = { userAgent: 'smoke-test' };
  sandbox.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  sandbox.setTimeout = () => 1;
  sandbox.setInterval = () => 1;
  sandbox.clearInterval = () => {};
  sandbox.clearTimeout = () => {};
  sandbox.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  sandbox.addEventListener = (type, fn) => document.addEventListener(type, fn);
  sandbox.fetch = fetchMock;

  const context = vm.createContext(sandbox);
  for (const rel of scripts) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(code, context, { filename: rel });
  }
  document._fire('DOMContentLoaded');
  return { sandbox, document, context, location };
}

// ------------------------------------------------- synthetic fixtures (NOT real data)
const FINAL_SCHEDULE = {
  dates: [{
    date: '2026-11-20',
    games: [
      {
        gamePk: 555555, gameDate: '2026-11-20T22:40:00Z', gameType: 'R', season: '2026',
        status: { abstractGameState: 'Final', codedGameState: 'F', detailedState: 'Final', statusCode: 'F', startTimeTBD: false, abstractGameCode: 'F' },
        teams: {
          away: { team: { id: 135, name: 'San Diego Padres', abbreviation: 'SD' }, leagueRecord: { wins: 73, losses: 66, ties: 0, pct: '.525' }, score: 3, isWinner: false },
          home: { team: { id: 113, name: 'Cincinnati Reds', abbreviation: 'CIN' }, leagueRecord: { wins: 66, losses: 73, ties: 0, pct: '.475' }, score: 4, isWinner: true },
        },
        linescore: {
          currentInning: 9, currentInningOrdinal: '9th', inningState: 'Top', inningHalf: 'Top', isTopInning: true,
          innings: [
            { num: 1, home: { runs: 1, hits: 2, errors: 0 }, away: { runs: 1, hits: 1, errors: 0 } },
            { num: 2, home: { runs: 0, hits: 0, errors: 0 }, away: { runs: 0, hits: 0, errors: 0 } },
          ],
          teams: { home: { runs: 4, hits: 8, errors: 0 }, away: { runs: 3, hits: 7, errors: 0 } },
        },
        venue: { id: 2602, name: 'Great American Ball Park' },
        review: { hasChallenges: false, away: { used: 0, remaining: 1 }, home: { used: 0, remaining: 1 } },
      },
      {
        gamePk: 777777, gameDate: '2026-11-20T23:40:00Z', gameType: 'R', season: '2026',
        status: { abstractGameState: 'Live', codedGameState: 'M', detailedState: 'Manager challenge: Tag play', statusCode: 'MA', startTimeTBD: false, abstractGameCode: 'L' },
        teams: {
          away: { team: { id: 137, name: 'San Francisco Giants', abbreviation: 'SF' }, leagueRecord: { wins: 30, losses: 40, ties: 0, pct: '.429' }, score: 2 },
          home: { team: { id: 134, name: 'Pittsburgh Pirates', abbreviation: 'PIT' }, leagueRecord: { wins: 35, losses: 35, ties: 0, pct: '.500' }, score: 3 },
        },
        linescore: {
          currentInning: 5, currentInningOrdinal: '5th', inningState: 'Bottom', inningHalf: 'Bottom', isTopInning: false,
          innings: [{ num: 1, home: { runs: 1, hits: 2, errors: 0 }, away: { runs: 2, hits: 3, errors: 0 } }],
          teams: { home: { runs: 3, hits: 5, errors: 0 }, away: { runs: 2, hits: 6, errors: 1 } },
        },
        venue: { id: 2613, name: 'Petco Park' },
        review: { hasChallenges: true, away: { used: 1, remaining: 0 }, home: { used: 0, remaining: 1 } },
      },
    ],
  }],
};

const FINAL_PLAY = {
  result: { type: 'atBat', event: 'Flyout', eventType: 'field_out', description: 'Juan Brito flies out to left fielder Samad Taylor.', rbi: 0, awayScore: 2, homeScore: 1, isOut: true },
  about: { atBatIndex: 37, halfInning: 'bottom', isTopInning: false, inning: 5, startTime: '2026-11-20T22:58:17.240Z', endTime: '2026-11-20T22:59:30.750Z', isComplete: true, isScoringPlay: false, hasReview: false, hasOut: true, captivatingIndex: 0 },
  count: { balls: 2, strikes: 0, outs: 1 },
  matchup: {
    batter: { id: 682877, fullName: 'Juan Brito', link: '/api/v1/people/682877', nameSlug: 'juan-brito-682877' },
    batSide: { code: 'L', description: 'Left' },
    pitcher: { id: 681190, fullName: 'Randy Vásquez', link: '/api/v1/people/681190', nameSlug: 'randy-vasquez-681190' },
    pitchHand: { code: 'R', description: 'Right' },
  },
  pitchIndex: [0, 1, 2], actionIndex: [], runnerIndex: [0],
  runners: [{
    movement: { originBase: null, start: null, end: null, outBase: '1B', isOut: true, outNumber: 1 },
    details: { event: 'Flyout', eventType: 'field_out', movementReason: null, runner: { id: 682877, fullName: 'Juan Brito', link: '/api/v1/people/682877', nameSlug: 'juan-brito-682877' }, responsiblePitcher: null, isScoringEvent: false, rbi: false, earned: false, teamUnearned: false, playIndex: 2 },
    credits: [],
  }],
  playEvents: [{
    details: { call: { code: 'X', description: 'In play, out(s)' }, description: 'In play, out(s)', code: 'X', isInPlay: true, isStrike: false, isBall: false, type: { code: 'SI', description: 'Sinker' }, isOut: true, hasReview: false },
    count: { balls: 2, strikes: 0, outs: 0 },
    index: 2, playId: 'x1', pitchNumber: 3, startTime: '...', endTime: '...', isPitch: true, type: 'pitch',
  }],
  playEndTime: '2026-11-20T22:59:30.750Z', atBatIndex: 37,
};

const LIVE_PLAY = {
  result: { type: 'atBat', event: 'In Play', eventType: 'field_out', description: 'Live play in progress.', rbi: 0, awayScore: 2, homeScore: 3, isOut: false },
  about: { atBatIndex: 12, halfInning: 'bottom', isTopInning: false, inning: 5, startTime: '2026-11-20T23:58:17.240Z', endTime: '', isComplete: false, isScoringPlay: false, hasReview: true, hasOut: false, captivatingIndex: 0 },
  count: { balls: 2, strikes: 1, outs: 2 },
  matchup: {
    batter: { id: 669134, fullName: 'Luis Campusano', link: '/api/v1/people/669134', nameSlug: 'luis-campusano-669134' },
    batSide: { code: 'R', description: 'Right' },
    pitcher: { id: 673513, fullName: 'Yuki Matsui', link: '/api/v1/people/673513', nameSlug: 'yuki-matsui-673513' },
    pitchHand: { code: 'L', description: 'Left' },
  },
  pitchIndex: [], actionIndex: [], runnerIndex: [],
  runners: [{
    movement: { originBase: '2B', start: '2B', end: '3B', outBase: null, isOut: false, outNumber: null },
    details: { event: 'In Play', eventType: 'field_out', movementReason: null, runner: { id: 669134, fullName: 'Luis Campusano', link: '/api/v1/people/669134', nameSlug: 'luis-campusano-669134' }, responsiblePitcher: null, isScoringEvent: true, rbi: false, earned: true, teamUnearned: false, playIndex: 0 },
    credits: [],
  }],
  playEvents: [{
    details: { call: { code: 'B', description: 'Ball' }, description: 'Ball', code: 'B', isInPlay: false, isStrike: false, isBall: true, type: { code: 'SI', description: 'Sinker' }, isOut: false, hasReview: true },
    count: { balls: 2, strikes: 1, outs: 2 },
    index: 0, playId: 'x1', pitchNumber: 1, startTime: '...', endTime: '', isPitch: true, type: 'pitch',
    reviewDetails: { reviewType: 'MA', reason: 'Tag play', isOverturned: false, inProgress: true },
  }],
  playEndTime: '', atBatIndex: 12,
};

function feedFor(gamePk, { review } = {}) {
  return {
    gamePk,
    link: `/api/v1.1/game/${gamePk}/feed/live`,
    metaData: { wait: 10, timeStamp: '20261121_000000', gameEvents: [], logicalEvents: [] },
    gameData: {
      game: { pk: gamePk, type: 'R', id: '2026/11/20/sdnmlb-cinmlb-1', gameNumber: 1, calendarEventID: `14-${gamePk}-2026-11-20`, season: '2026', seasonDisplay: '2026' },
      datetime: { dateTime: '2026-11-20T22:40:00Z', originalDate: '2026-11-20', officialDate: '2026-11-20' },
      status: review
        ? { abstractGameState: 'Live', codedGameState: 'M', detailedState: 'Manager challenge: Tag play', statusCode: 'MA', startTimeTBD: false, abstractGameCode: 'L' }
        : { abstractGameState: 'Final', codedGameState: 'F', detailedState: 'Final', statusCode: 'F', startTimeTBD: false, abstractGameCode: 'F' },
      teams: {
        away: { id: 135, name: 'San Diego Padres', abbreviation: 'SD' },
        home: { id: 113, name: 'Cincinnati Reds', abbreviation: 'CIN' },
      },
      players: {},
      venue: { id: 2602, name: 'Great American Ball Park' },
    },
    liveData: {
      linescore: {
        currentInning: review ? 5 : 9, currentInningOrdinal: review ? '5th' : '9th', inningHalf: 'Bottom', outs: review ? 2 : 0,
        innings: [
          { num: 1, away: { runs: 1, hits: 2, errors: 0 }, home: { runs: 0, hits: 1, errors: 0 } },
          { num: 2, away: { runs: 2, hits: 1, errors: 0 }, home: { runs: 3, hits: 4, errors: 0 } },
        ],
        teams: {
          away: { runs: review ? 2 : 3, hits: review ? 6 : 7, errors: review ? 1 : 0 },
          home: { runs: review ? 3 : 4, hits: review ? 5 : 8, errors: 0 },
        },
      },
      boxscore: {
        teams: {
          away: {
            team: { id: 135, name: 'San Diego Padres', abbreviation: 'SD' },
            teamStats: {},
            players: {
              'ID682877': { person: { id: 682877, fullName: 'Juan Brito', link: '', boxscoreName: 'Brito', nameSlug: 'juan-brito-682877' }, jerseyNumber: '7', position: { code: '1', name: 'Pitcher', abbreviation: 'P' }, battingOrder: '701', stats: { batting: { atBats: 1, runs: 0, hits: 0, rbi: 0 }, pitching: {}, fielding: {} } },
              'ID669134': { person: { id: 669134, fullName: 'Luis Campusano', link: '', boxscoreName: 'Campusano', nameSlug: 'luis-campusano-669134' }, jerseyNumber: '12', position: { code: '10', name: 'Designated Hitter', abbreviation: 'DH' }, battingOrder: '702', stats: { batting: { atBats: 1, runs: 0, hits: 0, rbi: 0 }, pitching: {}, fielding: {} } },
            },
          },
          home: {
            team: { id: 113, name: 'Cincinnati Reds', abbreviation: 'CIN' },
            teamStats: {},
            players: {
              'ID669134': { person: { id: 669134, fullName: 'Luis Campusano', link: '', boxscoreName: 'Campusano', nameSlug: 'luis-campusano-669134' }, jerseyNumber: '12', position: { code: '10', name: 'Designated Hitter', abbreviation: 'DH' }, battingOrder: '701', stats: { batting: { atBats: 1, runs: 0, hits: 1, rbi: 0 }, pitching: {}, fielding: {} } },
            },
          },
        },
      },
      plays: {
        allPlays: [review ? LIVE_PLAY : FINAL_PLAY],
        currentPlay: review
          ? { matchup: { batter: { fullName: 'Luis Campusano' }, pitcher: { fullName: 'Yuki Matsui' } }, count: { balls: 2, strikes: 1 } }
          : { matchup: { batter: { fullName: 'Juan Brito' }, pitcher: { fullName: 'Randy Vásquez' } }, count: { balls: 2, strikes: 0 } },
      },
    },
  };
}

const fetchMock = (url) => {
  if (url.includes('/api/v1/schedule')) {
    return Promise.resolve({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(FINAL_SCHEDULE)) });
  }
  if (url.includes('/feed/live')) {
    const m = url.match(/\/game\/(\d+)\/feed\/live/);
    const id = m ? m[1] : null;
    if (id === '777777') return Promise.resolve({ ok: true, status: 200, json: async () => feedFor(777777, { review: true }) });
    if (id === '555555') return Promise.resolve({ ok: true, status: 200, json: async () => feedFor(555555, { review: false }) });
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
  }
  return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
};

const SCOREBOARD = ['assets/js/api.js', 'assets/js/ui.js', 'assets/js/reviews.js', 'assets/js/feed-log.js', 'assets/js/scoreboard.js'];
const GAME = ['assets/js/api.js', 'assets/js/ui.js', 'assets/js/reviews.js', 'assets/js/feed-log.js', 'assets/js/props.js', 'assets/js/game.js'];
const REVIEWS = ['assets/js/api.js', 'assets/js/ui.js', 'assets/js/reviews.js', 'assets/js/feed-log.js', 'assets/js/reviews-feed.js'];

const INDEX_IDS = ['date-picker', 'date-label', 'banner', 'tabs', 'game-list', 'status-line'];
const GAME_IDS = ['main', 'loading', 'header-away', 'header-center', 'header-home', 'header-meta', 'header-decisions',
  'live-panel', 'linescore-wrap', 'plays-wrap', 'boxscore-wrap', 'props-wrap', 'reviews-wrap',
  'live-review-banner-wrap', 'reviews-tab-count', 'status-line', 'refresh-btn', 'countdown'];
const REVIEWS_IDS = ['date-picker', 'date-label', 'sound-toggle-btn', 'notify-toggle-btn', 'refresh-btn', 'countdown',
  'live-dot', 'banner', 'active-strip', 'feed-stats', 'feed-tabs', 'feed-list', 'status-line'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  let failures = 0;
  const check = (label, ok) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
    if (!ok) failures += 1;
  };

  // ---- Index (scoreboard) ----
  {
    const { document } = makeHarness({ url: 'http://127.0.0.1/index.html', ids: INDEX_IDS, scripts: SCOREBOARD, fetchMock });
    await sleep(50); await sleep(50); await sleep(50);
    const banner = document.getElementById('banner').innerHTML;
    const cards = document.getElementById('game-list').innerHTML;
    const status = document.getElementById('status-line').textContent;
    check('index renders the Under Review banner (official statusCode)', banner.includes('Under Review'));
    check('index renders the reviewing game (SF @ PIT)', banner.includes('SF @ PIT'));
    check('index renders review pill on the reviewing card', cards.includes('pill-review'));
    check('index renders final pill on the Final card', cards.includes('pill-final'));
    check('index status line updated', status.includes('Updated'));
  }

  // ---- Game (Final) ----
  {
    const { document } = makeHarness({ url: 'http://127.0.0.1/game.html?gamePk=555555', ids: GAME_IDS, scripts: GAME, fetchMock });
    await sleep(50); await sleep(50); await sleep(50);
    const header = document.getElementById('header-center').innerHTML;
    const line = document.getElementById('linescore-wrap').innerHTML;
    const box = document.getElementById('boxscore-wrap').innerHTML;
    const plays = document.getElementById('plays-wrap').innerHTML;
    const statusLine = document.getElementById('status-line').textContent;
    check('game (Final) header score renders', header.includes('3 – 4'));
    check('game (Final) linescore renders both teams', (line.match(/<tr>/g) || []).length >= 3);
    check('game (Final) boxscore renders both batters', box.includes('Juan Brito') && box.includes('Luis Campusano'));
    check('game (Final) plays render', plays.includes('Flyout') || plays.includes('flyout'));
    check('game (Final) status line updated', statusLine.includes('Updated'));
  }

  // ---- Game (Live, in review) ----
  {
    const { document } = makeHarness({ url: 'http://127.0.0.1/game.html?gamePk=777777', ids: GAME_IDS, scripts: GAME, fetchMock });
    await sleep(50); await sleep(50); await sleep(50);
    const banner = document.getElementById('live-review-banner-wrap').innerHTML;
    const badge = document.getElementById('reviews-tab-count').textContent;
    const statusLine = document.getElementById('status-line').textContent;
    check('game (Live) status banner renders', banner.includes('Under Review'));
    check('game (Live) official detailedState in banner', banner.includes('Manager challenge'));
    check('game (Live) review badge counted', badge.trim() === '1');
    check('game (Live) status line updated', statusLine.includes('Updated'));
  }

  // ---- Replay Feed ----
  {
    const { document } = makeHarness({ url: 'http://127.0.0.1/reviews.html?date=2026-11-20', ids: REVIEWS_IDS, scripts: REVIEWS, fetchMock });
    await sleep(50); await sleep(50); await sleep(50);
    const feed = document.getElementById('feed-list').innerHTML;
    const stats = document.getElementById('feed-stats').innerHTML;
    const banner = document.getElementById('banner').innerHTML;
    const statusLine = document.getElementById('status-line').textContent;
    check('feed renders a card', (feed.match(/feed-card-head/g) || []).length >= 1);
    check('feed renders runs-at-risk banner', banner.includes('Runs at Risk'));
    check('feed renders runs-at-risk stat', stats.includes('Runs at Risk'));
    check('feed status line shows scan result', statusLine.includes('Scanned'));
  }

  if (failures) {
    console.error(`\n${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log('\nALL SMOKE TESTS PASSED');
  process.exit(0);
}

run().catch((err) => { console.error(err); process.exit(1); });
