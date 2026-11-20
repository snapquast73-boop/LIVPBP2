# Verification report — MLB Live PBP (GitHub Pages rebuild)

**Session:** `8d9a5734` · **Branch:** `arena/8d9a5734-livpbp2`
**Date of checks:** 2026-11-20 (all API evidence below was fetched on that date)
**Scope:** the whole published site — `index.html`, `game.html`, `reviews.html`,
`404.html`, `flagged.html`, `assets/**`, `docs/**`, `tools/**`.

Everything in this report was checked against a live, official source. Where a
value could not be confirmed, the row says **UNVERIFIED** and the item is also
listed on the site's Flagged for Review page (`flagged.html`). Nothing in this
repository was filled in from memory or inferred from another site.

---

## 1. Baseline: what was actually in the uploaded project

| Check | Result | Evidence |
| --- | --- | --- |
| Repository `snapquast73-boop/LIVPBP2` is public, default branch `main`, Pages built from `main` `/ (root)` | Confirmed | `GET https://api.github.com/repos/snapquast73-boop/LIVPBP2/pages` → `"status":"built"`, `"source":{"branch":"main","path":"/"}` |
| Published site URL | Confirmed | `https://snapquast73-boop.github.io/LIVPBP2/` (the API's own `html_url`) |
| Pages deploy method | Branch publishing ("Deploy from a branch"), exactly what GitHub documents | https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site |
| The original demo repository named in `README.md` (`buffedlizard55-lab/MLB-Live-PBP`) | **Not found** (`404`) — the original site could not be diffed against | `GET https://api.github.com/repos/buffedlizard55-lab/MLB-Live-PBP` → `{"message":"Not Found"}` |
| `assets/` (CSS + all JS) in the initial upload | **Missing**; reconstructed by session `26bf496d`, verified and rewritten in this session | commit history of `main`; `COORDINATION.md` |
| Files the README references but that were absent: `docs/verification-report.md`, `docs/scoring-changes.md`, `docs/api-compliance.md`, `docs/workflows/`, `tools/*.mjs` | Missing; the three documents, the workflow templates and five deterministic test tools are now present. The remaining `tools/*.mjs` files named in the original README were **not recovered** — see §7 | `node tools/link-check.mjs` before/after |

Because the upstream demo repository returns 404, "identical to the original"
cannot be proven for anything. What *can* be proven is that every screen is
driven by documented, verified StatsAPI payloads, and that the parts that were
reconstructed are labelled as such on `flagged.html`.

---

## 2. Scoreboard request — schedule + hydrations

Request (the exact URL the site uses):

```
GET https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-06-01
    &hydrate=team,linescore,probablePitcher,decisions,review,flags
```

Evidence: <https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-06-01&hydrate=team,linescore,probablePitcher,decisions,review,flags&fields=dates,games,gamePk,status,detailedState,abstractGameState,teams,away,home,team,id,name,abbreviation,score,leagueRecord,wins,losses,linescore,currentInning,currentInningOrdinal,inningHalf,inningState,isTopInning,outs,review,used,remaining,flags,inReview,probablePitcher,fullName,decisions,winner,loser,save>

| Field the UI reads | Verified value in that response | Status |
| --- | --- | --- |
| `dates[].games[].gamePk` | `822974`, `824027`, … (9 games) | verified |
| `status.abstractGameState` | `"Final"` / `"Live"` / `"Preview"` | verified |
| `status.statusCode` | `"F"`, `"MA"`, `"S"` (review codes, see §3) | verified |
| `teams.away.team.abbreviation` (with `hydrate=team`) | `"DET"`, `"TB"` | verified |
| `teams.away.leagueRecord.wins/losses` | `23` / `38` | verified |
| `teams.*.probablePitcher.fullName` | `"Ty Madden"`, `"Griffin Jax"` | verified |
| `teams.*.score` | `10` / `9` | verified |
| `linescore.currentInning`, `currentInningOrdinal`, `inningState`, `inningHalf`, `isTopInning`, `outs` | `9`, `"9th"`, `"Bottom"`, `"Bottom"`, `false`, `3` | verified |
| `decisions.winner` / `loser` / `save` (with `hydrate=decisions`) | `Tyler Holton` / `Griffin Jax` / `Will Vest` | verified |
| `review.away.used/remaining`, `review.home.used/remaining` (with `hydrate=review`) | `0/1`, `1/0` | verified |
| `flags` (with `hydrate=flags`) | `{}` on a game that is not under review | verified (empty object) |
| `flags.inReview` | **not present** in any sampled response | UNVERIFIED → review detection therefore uses `status.statusCode` (§3) instead |

## 3. Review detection — the official gameStatus registry

Evidence: <https://statsapi.mlb.com/api/v1/gameStatus> (full registry, fetched 2026-11-20)

| Code | `detailedState` | `reason` | Used for |
| --- | --- | --- | --- |
| `MA` | Manager challenge: Tag play | Tag play | Manager challenge |
| `MH` | Manager challenge: Home run | Home run | Manager challenge |
| `MJ` | Player challenge: Pitch Result | Pitch Result | ABS pitch challenge |
| `NH` | Umpire review: Home run | Home run | Boundary call |
| `NS` | Umpire review: Stadium boundary call | Stadium boundary call | Boundary call |
| `NJ` | Umpire Challenge: Pitch Result | Pitch Result | ABS pitch challenge |
| `IH` | Instant Replay | Review | Crew-chief / umpire review |
| `I` | In Progress | — | *not* a review (control case) |
| `F` | Final | — | *not* a review (control case) |

The parser (`assets/js/reviews.js`) tests the code against this registry
(`/^M[A-Z0-9]$/`, `/^N[A-Z0-9]$/`, `MJ`, `NJ`, `IH`) instead of matching the
words "challenge"/"review" in text — the original README's own point, and the
reason crew-chief reviews (`detailedState` **"Instant Replay"**) are not missed.

## 4. Live game feed — one request per poll

Request: `GET https://statsapi.mlb.com/api/v1.1/game/{gamePk}/feed/live`

Evidence (projected so the response is small): <https://statsapi.mlb.com/api/v1.1/game/824027/feed/live?fields=liveData,linescore,currentInning,currentInningOrdinal,inningHalf,inningState,isTopInning,outs,balls,strikes,teams,away,home,runs,hits,errors,leftOnBase,innings,num>

| Field the UI reads | Verified value | Status |
| --- | --- | --- |
| `liveData.linescore.teams.away/home.{runs,hits,errors,leftOnBase}` | `9/10/4/12`, `8/10/1/7` | verified |
| `liveData.linescore.innings[].{num,home.runs,away.runs,…}` | `1…9` with per-inning runs/hits/errors/leftOnBase | verified |
| `liveData.linescore.offense.{batter,onDeck,inHole,pitcher}.fullName` | `Jose Siri`, `Adam Frazier`, `Logan O'Hoppe`, `Kirby Yates` | verified |
| `liveData.linescore.{balls,strikes,outs}` | `0`, `2`, `3` | verified |
| `gameData.players["ID<id>"].person.fullName`, `.batSide.code`, `.pitchHand.code` | `Adam Frazier`, `L`/`R`, `S` for switch hitters | verified (§6 evidence) |
| `gameData.weather.{condition,temp,wind}`, `gameData.datetime.dateTime`, `gameData.venue.name` | `Clear`, `70`, `8 mph, Out To LF`, `2026-06-02T01:38:00Z`, `Angel Stadium` | verified |
| `gameData.teams.*.record.{wins,losses}`, `.abbreviation` | `23/38`, `COL`/`LAA` | verified |
| `liveData.decisions.{winner,loser,save}` | `Antonio Senzatela`, `Kirby Yates` | verified |
| `liveData.boxscore.teams.*.players["ID<id>"].stats.batting.{atBats,runs,hits,rbi,baseOnBalls,strikeOuts}` | e.g. `atBats 4, hits 0, rbi 0` | verified |
| `.stats.pitching.{inningsPitched,hits,runs,earnedRuns,baseOnBalls,strikeOuts}` | e.g. `1.0`, `2`, `1`, `1`, `0`, `0` | verified |
| `.position.abbreviation`, `.battingOrder`, `teams.*.batters[]`, `teams.*.pitchers[]` | `C`/`P`, `"800"`, arrays of player ids | verified |
| `liveData.plays.allPlays[].result.{event,eventType,description,awayScore,homeScore,isOut,rbi}` | e.g. `Double`, `double`, `…Riley Greene doubles (16)…`, `2`, `0` | verified |
| `…about.{atBatIndex,inning,halfInning,startTime,endTime}` | `3`, `1`, `"top"`, ISO timestamps | verified |
| `…playEvents[].{isPitch,pitchNumber,count.{balls,strikes,outs}}` | `true`, `5`, `2-2` | verified |

## 5. Review, ABS and counter payloads — where they really live

Evidence A (play-by-play, unprojected):
<https://statsapi.mlb.com/api/v1/game/822974/playByPlay?fields=allPlays,about,atBatIndex,inning,halfInning,result,event,eventType,description,awayScore,homeScore,playEvents,reviewDetails,reviewType,challengeTeamId,isOverturned,inProgress,reason,details,isPitch,pitchNumber,count,balls,strikes,runners,isScoringEvent,playIndex,matchup,batter,pitcher,fullName,id>

Evidence B (feed, projection that isolates reviewDetails):
<https://statsapi.mlb.com/api/v1.1/game/822974/feed/live?fields=liveData,plays,allPlays,atBatIndex,playEvents,details,reviewDetails,pitchNumber,isPitch,reviewType,challengeTeamId,isOverturned,inProgress,reason>

| Finding | Verified evidence | Status |
| --- | --- | --- |
| ABS review data sits at **`playEvents[i].reviewDetails`** (a sibling of `playEvents[i].details`, *not* inside `details`) | Evidence B, `atBatIndex 22`, first pitch: `"reviewDetails":{"isOverturned":true,"inProgress":false,"reviewType":"MJ","challengeTeamId":116}` | verified |
| `reviewDetails` carries `reviewType`, `challengeTeamId`, `isOverturned`, `inProgress` — and **no `reason` field** | same object; requesting `reason` inside it returns nothing | verified |
| Official reason text for a review therefore comes from the `gameStatus` registry, keyed by `reviewType` (`MJ` → "Pitch Result") | §3 | verified |
| `runners[].details.{isScoringEvent,playIndex,rbi}` describe scoring movements and which play event they belong to | Evidence A: runner entries with `"isScoringEvent":true,"playIndex":4` | verified |
| `playEvents[].details.{playIndex,description,event,eventType}` exist | Evidence A | verified |
| Per-team manager-challenge counters: `gameData.review.{away,home}.{used,remaining}` | <https://statsapi.mlb.com/api/v1.1/game/824027/feed/live?fields=gameData,review,absChallenges,away,home,used,remaining,usedSuccessful,usedFailed> → `away {used 0, remaining 1}`, `home {used 1, remaining 0}` | verified |
| Per-team ABS counters: `gameData.absChallenges.{away,home}.{usedSuccessful,usedFailed,remaining}` | same URL → `away {2,2,0}`, `home {1,1,1}` | verified |
| A whole-play review may be published at `play.reviewDetails` as well | **Not observed** in the sampled games | UNVERIFIED — the parser reads `play.reviewDetails`, `playEvents[i].reviewDetails` **and** `playEvents[i].details.reviewDetails`, and collapses duplicates, so either location works |
| Meaning of `challengeTeamId` | Undocumented. Observed `116` (= DET, the batting side) on a DET plate appearance whose official description names no challenging team | UNVERIFIED semantics — treated as "the team that challenged" and flagged on `flagged.html` |
| Difference between "call stands" and "call confirmed" | The payload exposes only `isOverturned: true/false` | UNVERIFIED — the UI prints "Call Stands / Confirmed" rather than inventing a distinction |
| `os_ruling_pending_primary` / `os_ruling_pending_prior` event types ("Official Scorer Ruling Pending") | <https://statsapi.mlb.com/api/v1/eventTypes?fields=eventTypes,code,description> → `os_ruling_pending_prior` (`plateAppearance:false`, `baseRunningEvent:true`) and `os_ruling_pending_primary` (`plateAppearance:true`, `baseRunningEvent:false`), both described "Official Scorer Ruling Pending" | verified — the parser still matches only those two exact codes, so nothing is shown when they are absent |
| Official scoring changes exist and are made by the Official Scorer, the Elias Sports Bureau, or after a player/club review | MLB's own published log: <https://www.mlb.com/official-information/scoring-changes> ("Changes can be made by the Official Scorer, Elias Sports Bureau, or following a review initiated by a player or club.") | verified |
| The terms attached to the data: "Only individual, non-commercial, non-bulk use of the Materials is permitted" | <http://gdx.mlb.com/components/copyright.txt> (the link the API's own copyright line points to), plus MLB.com Terms of Use §1 at <https://www.mlb.com/official-information/terms-of-use> | verified |
| The StatsAPI payload contains **no** scoring-change marker, so a change is only observable by diffing consecutive polls | Evidence A/B contain no such field; the published log is a separate web page, not an API endpoint | verified (absence) → the tracker is built on consecutive observations and says so |

## 6. Player inputs for the hit forecast

Evidence:
<https://statsapi.mlb.com/api/v1/people/660271/stats?stats=season,statSplits,gameLog&group=hitting&sitCodes=vl,vr&season=2026&fields=stats,type,displayName,group,season,stat,splits,avg,obp,slg,ops,atBats,hits,homeRuns,rbi,baseOnBalls,strikeOuts,plateAppearances,game,date,isHome>
and
<https://statsapi.mlb.com/api/v1/people/660271/stats?stats=statSplits&group=hitting&sitCodes=vl,vr&season=2026&fields=stats,type,displayName,splits,season,split,code,description,stat,avg,atBats,hits>

| Field the model reads | Verified value | Status |
| --- | --- | --- |
| `stats[].type.displayName` | `season`, `statSplits`, `gameLog` | verified |
| `season` split `stat.{hits,atBats,avg,obp,slg,ops}` | `144`, `523`, `.275`, `.377`, `.512`, `.889` | verified |
| `statSplits` `split.{code,description}` | `vl` / "vs Left", `vr` / "vs Right" | verified |
| `statSplits` `stat.{hits,atBats}` | `49/179` (vs L), `95/344` (vs R) | verified |
| `gameLog` `splits[].{date,isHome,stat.{hits,atBats}}` | dated games from `2026-03-26` | verified |
| `stats=vsPlayer&opposingPlayerId=…` (head-to-head) | Used by the page; **sampled on 2026-11-20 in §10**, which found the payload shape and a parsing defect | verified in §10 (was UNVERIFIED here; the model omits the driver when the response is empty) |

## 7. Assets and third-party hosts

| Item | Attempt | Result | Treatment |
| --- | --- | --- | --- |
| Team logo `https://www.mlbstatic.com/team-logos/team-cap-on-dark/{id}.svg` | HTTP fetch | `HTTP 500` to a non-browser client | UNVERIFIED — tried first, then the un-suffixed path, then the `<img>` is hidden |
| Team logo `https://www.mlbstatic.com/team-logos/{id}.svg` | HTTP fetch | `HTTP 500` to a non-browser client | UNVERIFIED — fallback |
| Player headshot `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_120,q_auto:best/v1/people/{id}/headshot/67/current` | HTTP fetch | `HTTP 500` to a non-browser client | UNVERIFIED — image is hidden on error so layout never breaks |
| StatsAPI CORS from the Pages origin | Rendered page `https://snapquast73-boop.github.io/LIVPBP2/` displayed live data it could only have obtained cross-origin | verified indirectly | browser-side `fetch` works |
| `server.mjs` persistence + SSE | Cannot run on GitHub Pages (static hosting) | — | the site works without it: `localStorage` is the primary store, and the server bridge fails open |

## 8. What the deterministic tests assert

All tests are network-free and run in CI or locally:

```
node tools/review-test.mjs          # 13 checks — parser, counters, diffs, irregularities
node tools/hit-model-test.mjs       # 14 checks — log5, clamps, count, form, splits, head-to-head (see §10.1)
node tools/reviews-feed-test.mjs    #  6 checks — persistence/merge/idempotency
node tools/ui-labels-test.mjs       #  5 checks — club abbreviations for schedule-sourced teams (§10.2)
node tools/page-render-test.mjs     #  7 end-to-end page renders in jsdom (no page errors)
node tools/link-check.mjs           # every internal href/src resolves; no dead docs
```

Fixtures in `tools/fixtures/` are **synthetic**: every key and nesting level was
copied from the verified responses above, but the files are not new live data
and are labelled inside each file.

## 9. Deployment verification

| Check | Command | Result |
| --- | --- | --- |
| Pages site is served | `GET /repos/snapquast73-boop/LIVPBP2/pages` | `"status":"built"`, `https://snapquast73-boop.github.io/LIVPBP2/` |
| Latest build succeeded | `GET /repos/snapquast73-boop/LIVPBP2/pages/builds/latest` | `"status":"built"`, `"error":{"message":null}` |
| Rendered pages after deploy | `GET https://snapquast73-boop.github.io/LIVPBP2/`, `…/game.html?gamePk=…`, `…/reviews.html?date=…` | pages render live StatsAPI data (see §7) |

Re-run §9 after the merge that publishes this branch; the result is recorded in
`COORDINATION.md`.

## 10. Independent re-verification — session 312c81d6 (2026-11-20)

This session re-fetched the endpoints the shipped client uses and compared the values the code
reads. Every request below is the official host; the observed value is quoted exactly.

| # | Endpoint | Observed value (2026-11-20) | Used by |
|---|---|---|---|
| V-1 | [`/api/v1/schedule?date=2024-10-30&hydrate=probablePitcher,linescore,decisions,review`](https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2024-10-30&hydrate=probablePitcher,linescore,decisions,review) | `gamePk 775296`, `status{statusCode:"F",detailedState:"Final"}`, Dodgers 7 – Yankees 6, `decisions{winner:"Blake Treinen",loser:"Tommy Kahnle",save:"Walker Buehler"}`, `review{hasChallenges:true,away{used:0,remaining:2},home{used:1,remaining:1}}`, `venue{name:"Yankee Stadium"}` | scoreboard cards, review banner |
| V-2 | [`/api/v1/game/775296/linescore`](https://statsapi.mlb.com/api/v1/game/775296/linescore) | `currentInning 9`; `teams.home{runs:6,hits:8,errors:2}`, `teams.away{runs:7,hits:7,errors:0}`; nine `innings[]` | card + game page linescore |
| V-3 | [`/api/v1.1/game/775296/feed/live`](https://statsapi.mlb.com/api/v1.1/game/775296/feed/live?fields=gameData,status,teams,venue,weather,datetime,game,review,flags,probablePitchers) | `gameData.teams.away{id:119,name:"Los Angeles Dodgers",abbreviation:"LAD"}`, `…home{…"NYY"}`, `venue{name:"Yankee Stadium"}`, `weather{condition:"Partly Cloudy",temp:"67",wind:"5 mph, Out To LF"}`, `datetime{officialDate:"2024-10-30"}`, `flags{}`, and **no** `absChallenges` object (pre-ABS season) | game header, counters |
| V-4 | [`/api/v1.1/game/824638/feed/live`](https://statsapi.mlb.com/api/v1.1/game/824638/feed/live?fields=gameData,absChallenges,hasChallenges,away,home,usedSuccessful,usedFailed,remaining) | `absChallenges{hasChallenges:true,away{usedSuccessful:3,usedFailed:0,remaining:2},home{usedSuccessful:5,usedFailed:0,remaining:2}}` | ABS counters (2026 games) |
| V-5 | [`/api/v1/game/823109/playByPlay`](https://statsapi.mlb.com/api/v1/game/823109/playByPlay?fields=allPlays,about,atBatIndex,reviewDetails,isOverturned,inProgress,reviewType,challengeTeamId) | four real reviews: `{reviewType:"MJ",isOverturned:true,challengeTeamId:136}`, `{reviewType:"MD",isOverturned:false,challengeTeamId:142}`, `{reviewType:"MA",isOverturned:true,challengeTeamId:136}`, `{reviewType:"NA",isOverturned:false}` (no team id on an umpire review) | Replay Feed rows |
| V-6 | [`/api/v1/game/775296/playByPlay`](https://statsapi.mlb.com/api/v1/game/775296/playByPlay) | `runners[]{details{isScoringEvent:true,playIndex:4,…}}` on the home-run play; `playIndex` indexes that play's `playEvents[]` | runs-at-risk attribution |
| V-7 | [`/api/v1/gameStatus`](https://statsapi.mlb.com/api/v1/gameStatus) | `IH` “Instant Replay”; `MA` “Manager challenge: Tag play”; `MD` “Manager challenge: Catch/drop in outfield”; `MJ` “Player challenge: Pitch Result”; `NJ` “Umpire Challenge: Pitch Result”; `NA` “Umpire review: Tag play”; `NH` “Umpire review: Home run” | every review label |
| V-8 | [`/api/v1/eventTypes`](https://statsapi.mlb.com/api/v1/eventTypes) | `os_ruling_pending_primary` / `os_ruling_pending_prior`, both “Official Scorer Ruling Pending” | pending-ruling rows |
| V-9 | [`/api/v1/teams?sportId=1`](https://statsapi.mlb.com/api/v1/teams?sportId=1&fields=teams,id,name,abbreviation) | the 30 official codes (`108 LAA … 158 MIL`), now mirrored by `UI.TEAM_ABBR` | club abbreviations |
| V-10 | [`/api/v1/game/775296/boxscore`](https://statsapi.mlb.com/api/v1/game/775296/boxscore) | `teams.away.teamStats.batting{avg:".206",atBats:34,hits:7,rbi:7}`, `…pitching{era:"4.80",inningsPitched:"9.0"}`, `players{ID…{person{fullName},position{abbreviation},stats{…}}}` | box score |
| V-11 | [`/api/v1/people/660271/stats?stats=season,statSplits,gameLog&sitCodes=vl,vr`](https://statsapi.mlb.com/api/v1/people/660271/stats?stats=season,statSplits,gameLog&group=hitting&season=2024&sitCodes=vl,vr) | blocks named `season`, `statSplits` (with `split.code vl/vr`), `gameLog` (dated) | forecast inputs |
| V-12 | [`/api/v1/people/660271/stats?stats=vsPlayer&opposingPlayerId=543037&season=2024`](https://statsapi.mlb.com/api/v1/people/660271/stats?stats=vsPlayer&group=hitting&opposingPlayerId=543037&season=2024) | **two** blocks: `vsPlayerTotal{atBats:23,hits:4,avg:".174"}` and `vsPlayer` (five per-season splits). Without `season=`, the order is reversed (`vsPlayer` first) | career head-to-head driver |

### 10.1 Defect found and fixed — head-to-head block order

`assets/js/props.js` picked the head-to-head line by taking the **last** `stats[]` block:

```js
vsStats.forEach(function (s) { var split = (s.splits || [])[0]; if (split && split.stat) h2h = …; });
```

The official response contains `vsPlayerTotal` (career) **and** `vsPlayer` (per season), and their
order depends on the request: without `season=` the total comes last (so the old code happened to be
right), but with `season=` — which is exactly what `api.js#getVsPlayer` sends — the API returns
`vsPlayerTotal` **first** (V-12). The loop then kept `vsPlayer`'s first season, so the driver reported
a single old season (**6 AB, 1 H**, 2018) instead of the career line (**23 AB, 4 H**).

Fix: a pure `Props.parseVsPlayer(payload)` helper reads `vsPlayerTotal` **by name**, sums the
`vsPlayer` splits when the total is absent, and returns `null` (never a guessed line) when neither
exists. `tools/hit-model-test.mjs` gained two regression checks that use the official payload in both
block orders; the suite is now 14 checks.

### 10.2 Defect found and fixed — club codes on schedule-sourced teams

`/api/v1/schedule` returns `teams.<side>.team` as `{ id, name, link }` — **no `abbreviation`**, even
with `fields=…,abbreviation` in the request (verified: the projection returns
`{"team":{"id":119,"name":"Los Angeles Dodgers"}}`). `scoreboard.js` read
`g.teams.away.team.abbreviation`, so the “Under review now” banner and the “Probables:” line fell back
to the literal placeholders **AWY / HOM** on every live or preview slate.

The synthetic schedule fixture carried an `abbreviation` key that the real payload does not have,
which is why the render test never caught it. Both sides are fixed:

- `assets/js/ui.js` gained `UI.teamAbbr(team)` and `UI.TEAM_ABBR` — the 30 official codes from V-9.
  A payload abbreviation always wins; the table is the fallback; an unknown club id degrades to name
  initials rather than an invented code.
- `assets/js/scoreboard.js` uses `UI.teamAbbr(...)` for the banner and the probables footer.
- `tools/fixtures/schedule-2026-06-01.json` no longer invents `abbreviation` on schedule teams, so the
  fixture matches the official payload (and the render test exercises the real shape).
- New `tools/ui-labels-test.mjs` (5 checks) pins the table to the official list and proves a
  schedule-shaped team resolves to `CHC`/`LAD` instead of `AWY`/`HOM`.

### 10.3 Suite state after these changes

```
node tools/review-test.mjs         # 13 checks
node tools/hit-model-test.mjs      # 14 checks (2 new head-to-head regressions)
node tools/reviews-feed-test.mjs   #  6 checks
node tools/ui-labels-test.mjs      #  5 checks (new)
node tools/page-render-test.mjs    #  7 page renders, 0 failed
node tools/link-check.mjs          # every internal href/src resolves
python3 tools/check-local-links.py # every local HTML href/src exists
```

All of it now runs in `.github/workflows/verify-site.yml` on every push and pull request (before this
change CI ran only the syntax and `check-local-links.py` steps, so none of the behavioural tests were
enforced on `main`).
