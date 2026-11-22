# ⚾ MLB Live PBP — Live MLB Scoreboard & Play-by-Play

> ### 🛑 **CHECKPOINT NOTICE: `v1.0.0-stable-checkpoint`** 🛑
> **This tag marks a safe, working baseline of the code. If any experimental changes break the app, you can instantly revert back to this stable state by running:**
> ```bash
> git reset --hard v1.0.0-stable-checkpoint
> ```

> ### ⚠️ Repository status (verified 2026-11-20)
> This README was written for the **original** project, whose demo repository
> (`buffedlizard55-lab/MLB-Live-PBP`) no longer exists — it returns 404, so no screen here can be
> proven identical to it. This repository is the working replacement, and the files the text below
> refers to are now present:
>
> - **Live site:** <https://snapquast73-boop.github.io/LIVPBP2/> (static GitHub Pages; `server.mjs` does not run there).
> - **Present:** `docs/verification-report.md`, `docs/scoring-changes.md`, `docs/api-compliance.md`,
>   `docs/workflows/` (two optional templates) and the deterministic tools under `tools/` — each one runs
>   offline against the fixtures in `tools/fixtures/`. `tools/live-slate-test.mjs` runs the parsers against
>   verbatim StatsAPI responses kept in `tools/fixtures/live-2026-06-01/`, so a source URL travels with
>   every value it checks.
> - **Implemented:** the two-sided hit forecast (`assets/js/props.js`), review/ABS/challenge tracking,
>   scoring-change detection by diffing consecutive polls, and browser-local replay-log persistence
>   (`assets/js/feed-log.js`) with an optional `server.mjs` bridge.
> - **Not claimed:** the original 500 ms / 125 ms / 250 ms watcher cadences are unrecoverable; the rebuilt
>   client polls at the intervals documented in [`docs/api-compliance.md`](docs/api-compliance.md), and
>   the `v1.0.0-stable-checkpoint` tag still does not exist in this repository.
> - **Parity pass 2026-11-22:** every API read was re-checked against the live host. Six client defects were
>   found and fixed — the game page never polled, the Replay Feed's All tab dropped scoring changes, the
>   head-to-head line used one season instead of the career, xBA was never fetched, seven-inning games were
>   estimated as nine, and the scoreboard read a `flags.inReview` flag the API does not send. Each fix has a
>   check in `tools/`; the evidence is on [Flagged for Review](flagged.html) §8. What is still unverified is
>   listed there too (original-source parity, cadences, `challengeTeamId` semantics).
> - **Verified working:** scoreboard, game view and Replay Feed against the official
>   [MLB StatsAPI](https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-06-01&hydrate=team,linescore,probablePitcher,decisions,review,flags) —
>   the per-item list lives on [Flagged for Review](https://snapquast73-boop.github.io/LIVPBP2/flagged.html).

A zero-dependency, static web app that pulls **live MLB game data** straight from the
public MLB StatsAPI and renders it in a **Gameday-style scoreboard** — exactly the data
mlb.com uses, re-implemented from scratch in vanilla HTML/CSS/JS.

> ### 📋 **Rebuild status (verified 2026-11-20)**
> This copy was rebuilt so that it works on GitHub Pages again. Every API field the UI
> reads was re-checked against the live `statsapi.mlb.com` on 2026-11-20; the request
> URLs, the values they returned and every item that could **not** be confirmed are
> written down in [`docs/verification-report.md`](docs/verification-report.md) and on the
> [Flagged for Review](flagged.html) page. Five network-free test tools back the claim:
> `node tools/review-test.mjs`, `tools/hit-model-test.mjs`, `tools/reviews-feed-test.mjs`,
> `tools/page-render-test.mjs` (renders all three pages in jsdom) and
> `tools/link-check.mjs` (no dead internal links).

- **Scoreboard** (like [MLB.com](https://www.mlb.com/scoreboard)) — every game for any
  date, with live scores, inning, count, probable pitchers, and W/L/S decisions.
- **Game view** (like [MLB.com Gameday](https://www.mlb.com/gameday)) — **who's at bat,
  who's pitching, the count, outs, runners on base**, on-deck / in-the-hole hitters,
  pitch counts, last play, inning-by-inning linescore, full box score, and the complete
  play-by-play timeline with pitch-by-pitch details.
- **Instant Replay Reviews & Challenge Alerts** — real-time alerts and dedicated tracking
  for **Manager Challenges**, **Crew Chief Reviews**, **Umpire Reviews**, and **ABS**
  (Automated Ball-Strike system) pitch challenges across both the Scoreboard and Game views:
  - **All-Games "Replay Feed" page** (`reviews.html`) — a live, chat-style feed that pulls
    review events from **every game on the schedule** (not just one game): new manager
    challenges, crew chief reviews, umpire reviews, ABS pitch challenges and
    boundary-call reviews (potential home runs / fair-foul at the wall) appear at the
    top of the feed as they happen, with game link, inning, challenging team, reason,
    outcome, batter/pitcher context, and a three-row **review score tracker**:
    **Before review** (the call-on-field score when the active review is first
    observed), **Possible after** (call stands plus any conditional run-removal
    scenario supported by the reviewed scoring movements), and **Actual after**
    (the official score after the resolved reviewed play/action, when exposed).
    For example: `NYY 6 – BOS 5`, possible
    `NYY 5 – BOS 5` if the reviewed safe-at-home run is removed, then the actual
    official score after the ruling. The possible score is **not a prediction**:
    on a home-run/boundary review MLB may instead place runners. A boundary review
    with no currently credited run says “score impact pending” and does not invent
    an alternate score. If the page opens only after resolution, it shows an
    attributable official Actual-after score when available and honestly marks
    Before/Possible as not observed. A later end-of-plate-appearance score is not
    assigned to an earlier pitch review. For ABS,
    the feed also shows the pitch count before the challenge, who challenged (batter /
    catcher / pitcher, from official play text or the challenging team's batting/
    fielding side), and the count after the call is overturned or stands.
    Every ABS-challenge and manager-challenge row also carries a
    **challenges-remaining tracker**: the challenging team's current official
    counter (e.g. `CIN: 2 ABS challenges left now (2 successful · 0 failed)` or
    `PIT: 1 manager challenge left now (0 used)`), with the both-teams summary
    (`Challenges left: CIN 1 MGR · 2 ABS — CHC 1 MGR · 2 ABS`) on hover and on
    the Under-Review live strip. The numbers are the **official StatsAPI
    counters read as-is** — `review.away/home.used/remaining` (manager
    challenges, from the schedule's `hydrate=review` and feed/live
    `gameData.review`) and `gameData.absChallenges.away/home.usedSuccessful/
    usedFailed/remaining` (ABS, feed/live only; verified live 2026-08-28) —
    never counts derived from feed events, never zero-filled when absent
    (pre-ABS seasons have no `absChallenges` object at all), and a used-counter
    that moves backwards between polls is flagged on the row as an
    irregularity instead of being silently corrected. Crew-chief, umpire and
    boundary reviews are not charged to a team's counter, so those rows show
    no counter line by design. Includes
    an "Under Review" live strip, per-type
    filters — **All** (every category except ABS pitch challenges:
    challenges, reviews, boundary calls, under review, runs at risk; ABS rows keep
    their own tab, their own **ABS Challenges** stat and their place in the
    challenges-remaining counters), **ABS**,
    **Challenges**, **Reviews**, **Boundary Calls**, **Under Review**,
    **⚠️ Runs at Risk** —,
    summary stats for the whole day, and an optional **sound alert** — a gentle
    synthesized raindrop chime (three soft drops blooming into a warm two-note
    chime, ~1.2s, pure sine tones with a light echo) when a new challenge, review,
    or boundary call lands. It is off by default, remembers your choice per
    browser, and never fires for routine ABS pitch challenges (the run-at-risk
    case below is the one exception, and it uses this exact same chime).
  - **⚠️ Runs at Risk — "could this review take a run OFF the board?"** The feed
    tracks, per review, whether the call on the field credited runs to the very
    event now under review, so an overturn could remove them from the score. When
    it can, you get, immediately: the **same gentle raindrop chime** used for any
    new review (one alert sound for the whole page — it is literally the same
    audio graph, and shares its 2.5s cooldown), an
    optional **desktop notification**, a persistent **red banner** at the top of
    the page listing every affected game with the call-stands score and — only
    when the payload actually supports it — the score if the runs come off,
    a **⚠️ N RUN(S) AT RISK** badge and glow on the feed row,
    a **Runs at Risk** stat, and a dedicated filter tab. It fires once per review
    (not once per poll), clears the moment the review resolves, and applies to
    every review type — manager challenge, crew chief/umpire review, boundary call,
    "under review", and ABS — because it is decided by the *data*, not the type: a
    run counts only when the official payload has a `runners[]` record with
    `details.isScoringEvent:true` whose `details.playIndex` matches the reviewed
    event. A score change elsewhere in the plate appearance (a steal of home, a
    wild pitch) never counts, and the ruling itself is **never predicted**.
    Note that browsers block audio until you have interacted with the page, so a
    run-at-risk chime on the very first page load may be silent until you click
    something; the desktop notification is not affected.
  - **Scoreboard Live Ticker & Alert Badges** — surfaces any game currently in review or challenge,
    with a link straight to the all-games Replay Feed.
  - **Live Game Review Alert Banner** — eye-catching alert at the top of the game and live module when a call is under review.
  - **Dedicated "Challenges & Reviews" Tab** — full breakdown of every review event with summary stats (overturn rate, breakdown by challenge type and team), call reasons, and outcomes (Overturned, Stands, Confirmed).
  - **Play-by-Play Chips** — highlighted review outcome chips directly on affected plays.
  - All review parsing is validated against the real StatsAPI shapes (`reviewDetails`
    with codes `MJ` = ABS pitch challenge, `MA`/`MF` = manager challenges, and
    `NH` = boundary-call review, plus
    `feed.gameData.review` / `feed.gameData.absChallenges` challenge counters) — see
    `docs/verification-report.md` and `tools/review-test.mjs`.
- **Two-sided hit forecast** — a transparent per-plate-appearance hit probability that
  compounds the batter's and pitcher's season rates (log5), real platoon splits,
  recent form, head-to-head history, same-game familiarity, and the live count into a
  single number with a matchup tier (Elite → Pitcher's edge) and per-driver point
  adjustments. It appears in the live at-bat card, the Props & Matchup tab, and
  completed PBP rows.
- Auto-refreshes, with a budget it can defend (every constant is documented in
  [`docs/api-compliance.md`](docs/api-compliance.md)): the game page re-reads
  `feed/live` every **3s** while the game is live and every **30s** once it is
  final or still scheduled; the scoreboard refreshes its hydrated schedule every
  **20s** while any game is live (**60s** otherwise) and adds a **5s**
  status-only sweep for the review ticker; the Replay Feed runs one scan every
  **20s** while a game is live (**60s** otherwise) and only re-renders rows that
  actually changed. Every page stops polling entirely while its tab is hidden.
  When the optional persistence server (`server.mjs`) is running, a **live push**
  (server-sent events) delivers every tracked entry recorded by another tab or
  browser as soon as it is written — the Replay Feed is the only writer of that
  log, and its write is coalesced at ≤1/s — while the periodic pull stays as the
  fallback (and for static hosting, where the push is simply absent). Works on
  desktop and mobile.
- **"Under review" is detected from the official game status, not from play
  text.** MLB flips `status.statusCode` the instant a review is **called**, while
  the play description is written when it **resolves** — so the scoreboard keeps
  a **5s** status-only sweep (`GET /api/v1/schedule` with a `fields` projection
  and no hydrations) purely for the review ticker, and the Replay Feed reads the
  status of every game on the slate on each scan. Detection reads the API's own
  status registry (`GET /api/v1/gameStatus`: `M*` manager challenge, `N*` umpire
  review, `IH` instant replay, `MJ`/`NJ` ABS pitch challenge) instead of matching
  the words "challenge"/"review" — which silently missed crew-chief reviews,
  whose official `detailedState` is **"Instant Replay"**. The registry codes and
  the reason text they carry are transcribed in
  [`docs/verification-report.md`](docs/verification-report.md) §3.
- No build step, no frameworks, no API keys — it runs on **GitHub Pages** (or any static
  host, or even `file://`).

> **Live site:** [snapquast73-boop.github.io/LIVPBP2](https://snapquast73-boop.github.io/LIVPBP2/)
> — rebuilt and verified in this repository. The original demo repository named in the
> first draft of this README (`buffedlizard55-lab/MLB-Live-PBP`) no longer exists, so this
> is now the working copy. What could and could not be verified is recorded in
> [`docs/verification-report.md`](docs/verification-report.md) and on the
> [Flagged for Review](flagged.html) page.
---

## How it works — reverse-engineering MLB.com Gameday

MLB.com's Gameday is a JavaScript app. It reads JSON from a public, undocumented API at
**`https://statsapi.mlb.com/api/v1/`** (plus `v1.1` for live game feeds) and pulls
images (logos, headshots) from **`mlbstatic.com`**. No login, no API key, and the API
sends CORS headers, so any static page can call it directly from the browser.

This project does the same thing with its own front end. The API calls we make:

| What we need | Endpoint | Source (official) | Verified? |
| --- | --- | --- | --- |
| Games for a date (scoreboard cards, probables, decisions, review counters) | `GET /api/v1/schedule?sportId=1&date=YYYY-MM-DD&hydrate=team,linescore,probablePitcher,decisions,review,flags` | [Same query, 2026-06-01](https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-06-01&hydrate=team,linescore,probablePitcher,decisions,review,flags) | ✅ fetched and compared 2026-11-20 — 9 games, `teams.*.abbreviation`, inning linescore, `decisions`, `review.away/home.used/remaining`, `flags` all present (`tools/fixtures/schedule-2026-06-01.json`) |
| **Review status for the whole slate** (scoreboard's 5 s review sweep) | `GET /api/v1/schedule?sportId=1&date=YYYY-MM-DD&fields=dates,games,gamePk,status,…,teams,away,home,team,id,abbreviation` | [Same `fields` projection, 2026-06-01](https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-06-01&fields=dates,games,gamePk,status,abstractGameState,codedGameState,detailedState,statusCode,reason,startTimeTBD,abstractGameCode,teams,away,home,team,id,abbreviation) | ✅ fetched 2026-11-22 — returns the nine `gamePk`s with `status.statusCode`, `abstractGameState`, `detailedState` and `abstractGameCode` and nothing else (`tools/fixtures/live-2026-06-01/schedule-status.json`). Note `flags` is **not** in this projection and is never populated by the API, so review state comes from `statusCode` alone |
| **Review status for one game** (lean per-game probe) | `GET /api/v1.1/game/{gamePk}/feed/live?fields=gameData,status,plays,allPlays,atBatIndex,playEvents,details,reviewDetails,…` | [Game 822974 feed with `fields` projection](https://statsapi.mlb.com/api/v1.1/game/822974/feed/live?fields=liveData,plays,allPlays,atBatIndex,playEvents,details,reviewDetails,pitchNumber,isPitch,reviewType,challengeTeamId,isOverturned,inProgress,reason) | ✅ fetched 2026-11-20 — returns only the requested keys. **Gotcha:** the projection is leaf-name based, so `reviewDetails` alone comes back as `{}`; `reviewType,challengeTeamId,isOverturned,inProgress` must be named too (see [Flagged for Review](flagged.html) and `docs/verification-report.md` §5a) |
| Official game-status registry (source of every review `statusCode` + `reason`) | `GET /api/v1/gameStatus` | [statsapi.mlb.com/api/v1/gameStatus](https://statsapi.mlb.com/api/v1/gameStatus) | ✅ fetched 2026-11-20 — the full registry lists the `M*` manager-challenge family (`MF` “Close play at 1st”, `MA` “Tag play”, `MH` “Home run”, `MI` “Hit by pitch”, …), the `N*` umpire-review family, `MJ` “Player challenge: Pitch Result”, `NJ` “Umpire Challenge: Pitch Result”, `IH` “Instant Replay”, plus `I` and `F`. `tools/fixtures/game-status.json` keeps the eight review-relevant entries; `docs/verification-report.md` §3 has the mapping |
| Play event types (source of the official-scorer pending codes) | `GET /api/v1/eventTypes` | [eventTypes registry](https://statsapi.mlb.com/api/v1/eventTypes?fields=eventTypes,code,description) | ✅ fetched 2026-11-20 — `os_ruling_pending_primary` (plateAppearance) and `os_ruling_pending_prior` (baseRunningEvent) both carry description "Official Scorer Ruling Pending" |
| Full game state — play-by-play, current at-bat, linescore, box score, decisions, rosters | `GET /api/v1.1/game/{gamePk}/feed/live` | [Game 824027 live feed](https://statsapi.mlb.com/api/v1.1/game/824027/feed/live) | ✅ fetched 2026-11-20 — `gameData` (players, venue, weather, records), `liveData.plays`, `linescore`, `boxscore` all compared field by field |
| Fallback feed (older games, `/api/v1`) | `GET /api/v1/game/{gamePk}/feed/live` | [v1 path, game 824027](https://statsapi.mlb.com/api/v1/game/824027/feed/live) | ❌ **not supported** — this path answers with an API error, so the client does **not** use it; older games fall back to the bundle below (row 8) |
| Fallback bundle (if the live feed fails) | `GET /api/v1/game/{gamePk}/playByPlay` + `/boxscore` + `/linescore` | [playByPlay](https://statsapi.mlb.com/api/v1/game/824027/playByPlay) · [boxscore](https://statsapi.mlb.com/api/v1/game/824027/boxscore) · [linescore](https://statsapi.mlb.com/api/v1/game/824027/linescore) | ✅ all three respond and agree with the feed on the score. **Irregularity:** for game 775296 the standalone `/linescore` (and `schedule?hydrate=linescore`) reports home `errors: 2`, while the feed and `/boxscore` report `3` — an upstream disagreement, published on [Flagged for Review](flagged.html) and not papered over |
| Play-by-play only (per-game scan) | `GET /api/v1/game/{gamePk}/playByPlay` | [playByPlay with `fields`, game 822974](https://statsapi.mlb.com/api/v1/game/822974/playByPlay?fields=allPlays,atBatIndex,playEvents,details,playIndex,reviewDetails) | ✅ fetched 2026-11-20 — `playEvents[].details.playIndex` is what ties a review to the scoring pitch |
| Batter / pitcher season + split inputs for the forecast | `GET /api/v1/people/{playerId}/stats?stats=statSplits&group=hitting&sitCodes=vl,vr&season=YYYY` (issued **alone**; the same for `group=pitching`) | [statSplits, player 660271, 2026](https://statsapi.mlb.com/api/v1/people/660271/stats?stats=statSplits&group=hitting&sitCodes=vl,vr&season=2026) | ✅ fetched 2026-11-20 — `split.code` / `split.description` present. Combining `stats=season,statSplits,gameLog` in one request **drops** `split`, so the client issues it separately |
| Season / expected-statistics inputs | `GET /api/v1/people/{playerId}/stats?stats=season,expectedStatistics&group=hitting&season=YYYY` | [Same call, player 660271](https://statsapi.mlb.com/api/v1/people/660271/stats?stats=season,expectedStatistics&group=hitting&season=2026) | ✅ fetched 2026-11-22 — the `expectedStatistics` block's `splits[0].stat` is `{avg, slg, woba, wobaCon}`; the expected batting average **is** `avg` inside that block (there is no `xBA` field) and the block carries no `atBats`. The client now fetches it, blends it with the season rate, and records a per-side note when a block is absent. `statcast` is deliberately not requested (it answers HTTP 400 for `group=hitting`) |
| Career head-to-head for the forecast | `GET /api/v1/people/{batterId}/stats?stats=vsPlayer&group=hitting&opposingPlayerId={pitcherId}` | [vsPlayer, batter 660271 vs pitcher 622608](https://statsapi.mlb.com/api/v1/people/660271/stats?stats=vsPlayer&group=hitting&opposingPlayerId=622608) | ✅ fetched 2026-11-22 — two blocks: `vsPlayer` (one split per season: 2024 3-for-5, 2025 2-for-3, 2026 0-for-3) and `vsPlayerTotal` (career 5-for-11, .455). The client reads `vsPlayerTotal`; reading `splits[0]` of the first block used to report a single season as the career line. Sample in `tools/fixtures/live-2026-06-01/vs-player-660271-622608.json` |
| Team logos | `https://www.mlbstatic.com/team-logos/{teamId}.svg` (then `-dark`, then a monogram) | [119.svg](https://www.mlbstatic.com/team-logos/119.svg) | ◐ the CDN answered HTTP 500 to non-browser clients from this sandbox; the markup keeps a three-step `onerror` chain so a missing logo degrades to a monogram instead of a broken image |
| Player headshots | `https://img.mlbstatic.com/mlb-photos/image/upload/…/v1/people/{playerId}/headshot/67/current` (then `/silo/75x75/`, then initials) | [img.mlbstatic.com](https://img.mlbstatic.com/) | ◐ same as above: HTTP 500 to non-browser clients here, `onerror` chain in `assets/js/ui.js` |
**Verification note (2026-11-20).** ✅ rows were fetched from the official host by this session and
compared with the code; the fixtures under `tools/fixtures/` are trimmed copies of those responses.
◐ rows link the official host but were **not** fetchable or not sampled here — they are published as
unverified on the [Flagged for Review](flagged.html) page and no value is invented for them. ❌ marks a
call the API does **not** serve; the client does not make it.

The live feed is the heart of it — one response contains everything Gameday shows:

```
liveData.plays.allPlays[]      → every at-bat: result, description, count, outs,
                                 batter/pitcher matchup, runner movement, pitch events
liveData.plays.currentPlay     → the at-bat happening RIGHT NOW (batter, pitcher, count)
liveData.linescore             → inning state, inning-by-inning runs/hits/errors
liveData.boxscore              → per-player batting & pitching lines, batting order
liveData.decisions             → winning/losing/saving pitcher
gameData.players / teams       → names, positions, records, venue, weather, status
```

The app polls `feed/live` every 3s while a game is in progress and only rebuilds
the DOM when the baseball state changes (count, pitch event, score, inning, play,
or review outcome). Preview and final games use a 30s cadence, and polling pauses
automatically while the tab is hidden.

## Two-sided hit forecast

The hit percentage is a **transparent, per-plate-appearance estimate** — not an MLB
projection or a betting line. It is built to *discriminate*: great spots and terrible
spots land far apart instead of clustering around the league average. Two numbers are
shown, and they intentionally live in different bands:

- **Per-PA headline ("Hit this PA")** — the chance the batter gets a hit in *this*
  plate appearance. For **real MLB matchups this typically reads 22–30%** (league hit
  rates cluster around `.245`, and real batters/pitchers do too); the model's full
  clamp band is 13–62% per-PA (10–78% with live count), reached only by stacked
  synthetic edges like an overmatched call-up vs an ace (~13%) or an elite hitter on
  a hitter's count vs a weak arm (~50%). A single-PA hit rate can't honestly reach
  80%: even a perfect .400 hitter vs a .150-allowed pitcher resolves to ~55% before
  clamps. The clamp band and the count anchors are covered by
  `tools/hit-model-test.mjs`; the original calibration script was not part of the
  upload and is listed as unrecovered on [Flagged for Review](flagged.html).
- **"≥1 hit in next N PAs" projection** — the *wide* number, and where the promised
  16–95% spread actually lives. It is `1 − (1 − per-PA)^remaining PAs`, so during a
  live game it naturally reads **50–95%** (the broadcast-style graphic number most
  fans expect). It is shown on the live at-bat card and in the Props & Matchup tab;
  on a **Final game there are no PAs left, so it reads "—"/0%** and the per-PA rate is
  the relevant number. Both are per-batter and per-pitcher.

The model:

1. **Season level (both sides):** the batter's xBA/AVG hit-production signal and the
   pitcher's xBA-allowed/opponent-AVG signal are each regressed toward a `.245` league
   baseline (light regression so a full-season signal can move the forecast by
   ~10-14 points), then compounded in log-odds space — a generalized **log5** (Bill
   James's odds-ratio method), so extreme signals push the estimate toward the
   extremes rather than canceling toward the mean. Total evidence is capped at
   ±1.9 logits from the league prior.
2. **Platoon splits:** each player's real `vs LHP` / `vs RHP` (pitchers: `vs LHB` /
   `vs RHB`) split enters as a shrunken *differential* against their own season rate.
   Without split data, a small flat handedness adjustment is used instead.
3. **Recent form:** the player's game-log window (last ~8 games, strictly before the
   modeled game's date, so a forecast never leaks the game's own result) nudges the
   estimate with a meaningful weight (capped so a single hot/cold week cannot dominate
   the season signal).
4. **Head-to-head:** the career batter/pitcher line is a bounded but real nudge
   (~up to 5.5 pts of weighted signal).
5. **Same-game familiarity:** each repeat plate appearance against the same pitcher
   adds a small times-through-the-order bump (~+0.75 pts/pass, capped at the third look).
6. **Live count:** mid-at-bat, the fresh-count estimate is multiplied in odds space by
   an empirically anchored count factor (3-1 » 0-0 » 0-2); walks are *not* hits, so
   3-ball factors deliberately exclude the walk's value (see
   `assets/js/props.js` for the anchors and their tests).

The headline number is the **hit probability for this plate appearance**; the chance
of at least one more hit across the remaining expected plate appearances is shown as a
secondary projection. A **matchup tier** (Elite matchup / Favorable / Neutral / Tough /
Pitcher's edge) and per-driver **adjustment chips** (season, platoon, form, history,
familiarity, count — in percentage points) make every forecast explainable.

If one player has no usable season data, the forecast remains available but labels the
fallback (for example, “Batter input; pitcher baseline fallback”). If neither side has
data, it shows the league baseline instead of pretending the estimate is personalized.
The same cached model powers the live at-bat card, Props & Matchup tab, and PBP chips;
for archived games the request is scoped to the feed's game season.

## Project structure

```
.
├── index.html                 # Scoreboard page (all games for a date)
├── game.html                  # Game page (?gamePk=<id>)
├── reviews.html               # All-games Replay Feed (live chat-style review feed)
├── 404.html
├── flagged.html               # irregularities + unverified values, with source links
├── COORDINATION.md            # shared task board for the rebuilding sessions
├── docs/
│   ├── verification-report.md # every source link and every verification performed
│   ├── scoring-changes.md     # how scoring changes are detected (and what is not claimed)
│   ├── api-compliance.md      # terms + the request budget the code enforces
│   └── workflows/             # OPTIONAL GitHub Actions templates (see deployment)
├── tools/
│   ├── review-test.mjs        # parser / counters / diffs
│   ├── hit-model-test.mjs     # hit-forecast model
│   ├── reviews-feed-test.mjs  # feed-log persistence + merge
│   ├── page-render-test.mjs   # end-to-end page render (jsdom)
│   ├── link-check.mjs         # static link/asset check
│   ├── live-slate-test.mjs    # parsers vs verbatim StatsAPI responses
│   ├── fetch-live-fixtures.mjs# re-download those responses (needs network)
│   └── fixtures/              # synthetic payloads shaped from the verified API,
│                              # plus fixtures/live-2026-06-01/ = real responses
├── assets/
│   ├── css/style.css          # Dark Gameday-style theme (responsive)
│   └── js/
│       ├── api.js             # MLB StatsAPI client (fetch, retry, fallbacks, formatters)
│       ├── ui.js              # Shared UI: team logos, colors, count dots, runners diamond
│       ├── reviews.js         # Challenge & replay review parser (Manager, Crew Chief, ABS)
│       ├── reviews-feed.js    # All-games Replay Feed logic (diff helpers + page)
│       ├── scoreboard.js      # Scoreboard page logic
│       ├── props.js           # Two-sided hit model, stat cache, Props & Matchup tab
│       └── game.js            # Game page logic (live "at bat" module, linescore, box, PBP)
└── server.mjs                 # OPTIONAL local persistence server (not used on GitHub Pages)
```

## Run it locally

Run the built-in persistence server (recommended — persists scoring changes and reviews to disk across browsers):

```bash
# Node built-in server (multi-browser persistent logging backend)
node server.mjs

# or any static file server
python3 -m http.server 8000
# or
npx serve .
```

Then open <http://localhost:8000>. You can also open `index.html` directly in a browser
(`file://` works — the app uses plain scripts, no modules).

To run the deterministic, network-free checks:

```bash
node tools/review-test.mjs            # challenge/review parser, counters, scoring changes, irregularities
node tools/hit-model-test.mjs         # two-sided hit forecast model (log5, clamps, count, form, splits)
node tools/reviews-feed-test.mjs      # Replay Feed persistence: merge, idempotency, row cap, round-trip
node tools/page-render-test.mjs       # end-to-end render of all three pages in jsdom (needs `npm i jsdom`)
node tools/link-check.mjs             # every internal href/src resolves; no dead docs or assets
node tools/live-slate-test.mjs        # parsers/models vs verbatim 2026-06-01 StatsAPI responses
```

Every entry tracked (challenges, reviews, scoring-pending rulings, scoring
changes) is persistent across the website:
- **Across browsers & sessions**: saved to the backend disk store (`data/feed-log-<date>.json`)
  via `POST /api/feed-log` and cached in `localStorage`, so opening the website on
  another browser immediately restores all tracked entries and baselines. Every accepted
  write is also pushed to the other open pages over
  `GET /api/feed-log/stream?date=<date>` (server-sent events, ~3s reconnect hint,
  20s heartbeat), so a challenge, review, pending ruling or scoring change recorded in
  one browser (a Replay Feed must be open somewhere — it is the only writer) shows up
  in the others as soon as that write lands, instead of on their next poll; the
  periodic pull remains the fallback when the stream is unavailable (static
  hosting, no `EventSource`, blocked connection).
- **Across the website**:
  - `reviews.html`: renders the All feed and dedicated ✏️ Scoring Changes tab.
  - `game.html`: dedicated **Challenges & Reviews** tab displays official scoring changes
    with full initial-call-to-final-ruling breakdown, and updates the tab badge.
  - `index.html`: scoreboard cards display the `✏️ N Scoring Change(s)` indicator.
  (see `docs/scoring-changes.md`).

The deterministic fixtures in `tools/fixtures/` drive `tools/page-render-test.mjs`,
which renders all three pages with `fetch` stubbed to those payloads — no network
request is made — so the Runs at Risk banner, score tracker and counter lines can be
inspected offline:

```bash
npm install --no-save jsdom
node tools/page-render-test.mjs
```

## Deploy to GitHub Pages

This repository's Pages site is already configured to publish the repository root
from `main`. The repository's current Pages URL is
<https://snapquast73-boop.github.io/LIVPBP2/>. GitHub Pages publishes static files;
it does not run `server.mjs`, so the website uses browser-local storage when the
optional persistence server is not present. The site can continue using the existing
branch-based publishing source; no separate build or Pages workflow is required.

1. **Push this project to GitHub** (any repo — e.g. `yourname/MLB-Live-PBP`).
2. In the repo: **Settings → Pages → Source → "Deploy from a branch"** → branch
   `main` → folder `/ (root)` → **Save**.
3. Your site is live at **`https://<your-username>.github.io/<repo-name>/`** —
   e.g. `https://snapquast73-boop.github.io/LIVPBP2/`. Every push to `main`
   republishes it automatically; GitHub's documentation notes that publishing can
   take up to 10 minutes:
   [Creating a GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
   and [Configuring a publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
The `Verify static site` GitHub Actions check runs on pull requests targeting `main`
and on pushes to `main`. It checks JavaScript syntax and local HTML asset/link
references; it is a validation check, not a deployment workflow.

### Customizing

- **Season / league:** `SPORT_ID` in `assets/js/api.js` (1 = MLB). Minor-league IDs
  (11–14) also work.
- **Refresh rate:** `LIVE_POLL_MS` / `IDLE_POLL_MS` / `FINAL_POLL_MS` in
  `assets/js/game.js`; `LIVE_POLL_MS` / `IDLE_POLL_MS` / `STATUS_SWEEP_MS` in
  `assets/js/scoreboard.js`; `LIVE_SCAN_MS` / `IDLE_SCAN_MS` in
  `assets/js/reviews-feed.js`.
- **Model inputs:** `LEAGUE`, `REGRESS_BATTER`, `REGRESS_PITCHER`, `MAX_LOGITS`,
  `CLAMP`, `CLAMP_WITH_COUNT` and `COUNT_FACTORS` in `assets/js/props.js`.
- **Theme:** the CSS custom properties at the top of `assets/css/style.css`.

## Notes & etiquette

- The MLB StatsAPI is **unofficial and may change without notice**. The client is
  written defensively (fallbacks for every endpoint and missing fields) and the app
  degrades gracefully if a field disappears.
- **Terms & budget:** the binding rules for this data, the request rate of every
  polling surface, and the code paths that enforce them are written down in
  [`docs/api-compliance.md`](docs/api-compliance.md) — including the two clauses
  that pull in different directions (the API's own notice permits "individual,
  non-commercial, non-bulk use"; MLB.com's Terms of Use §1 forbids automated
  collection and any display beyond personal, non-commercial home use) and the
  open question of public deployment. There is no published rate limit for the
  StatsAPI and no written authorization either way.
- Be a good citizen: the app needs **no API key** (the StatsAPI is keyless and
  open-CORS) and it self-limits — every page pauses when the tab is hidden,
  backs off on preview/final games, and the shared client honours **HTTP 429**
  with a quiet period (the server's own `Retry-After` when it sends one, clamped
  to 1s–5min; otherwise 60 seconds), during which it issues no request at all, so
  it can never hammer a host that has asked it to slow down. The Replay Feed
  scans live games' `fields`-projected feed (no boxscore/rosters) every 20s and
  only re-renders when a review event actually changes; on a full 15-game slate
  that is 15 requests per scan, plus one tiny status sweep every 5s on the
  scoreboard. The optional live push is server-side (same-origin `EventSource`)
  and adds no requests to MLB's API.
- This is a **personal, non-commercial project** (no ads, no analytics, no data resale — see the
  request budget and the governing terms in [`docs/api-compliance.md`](docs/api-compliance.md)).
  It lives in a public repository and is served from GitHub Pages; that is hosting, not a service
  offered to others.
- Review/challenge data shapes were verified against the live API on 2026-11-20
  (schedule `hydrate=review`, `reviewDetails` codes `MJ`/`MA`/`MF`/`NH`/`NJ`/`IH`,
  and `gameData.absChallenges`); every request URL and the value it returned is in
  [`docs/verification-report.md`](docs/verification-report.md).
- Team logos, headshots, and the underlying data are © MLB Advanced Media / MLB and
  their respective owners. This is an unofficial fan project — not affiliated with
  or endorsed by MLB.

## License

[MIT](LICENSE)
