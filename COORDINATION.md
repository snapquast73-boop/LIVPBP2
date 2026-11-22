# Coordination Board

## Active Sessions
| Task | Status | Session ID | Branch | File Scope | Notes |
| --- | --- | --- | --- | --- | --- |
| Final verification pass (1731ad28): re-verify live Pages site line-by-line vs official StatsAPI, run full deterministic test suite (incl. jsdom render test), wire tests into CI, triage stale PR #19, set repo homepage, PR + merge + deploy confirm | done | 1731ad28 | arena/1731ad28-livpbp2 | `COORDINATION.md` (append-only), `flagged.html` (append-only new section), `.github/workflows/verify-site.yml`, `package.json` (new), `tools/page-render-test.mjs` (polling regression test), `assets/js/game.js` (auto-refresh fix), `assets/js/api.js` (sweep `flags,inReview` leaves), `README.md` (endpoint-table row sync only) | Claimed 2026-11-22 after `git pull --rebase` onto `4a00031` (PR #33). All prior rows are `done`/`needs review` (5d3e49e1's row is `needs review` = published on Flagged page, non-blocking). Scope amended 2026-11-22: line-by-line review found the game page never re-fetched after first load (countdown painted but `loadGame` never re-invoked) and the scoreboard sweep's `flags.inReview` read was dead (projection stripped `flags`); both fixes + README row sync are in this scope. Does NOT touch `*.html`, `server.mjs`, `docs/**`, other `assets/js/*`. |
| Final integration pass: end-to-end live-site verification vs official StatsAPI; close out da2cec85's pending CI/Pages check (files untouched); triage stale PR #19 (based on pre-PR #11 tree); remove the duplicate "Flagged for Review" footer link on index/game/reviews | needs review | 5d3e49e1 | arena/5d3e49e1-livpbp2 | `COORDINATION.md` (append-only), `flagged.html` (append-only new section), `index.html` + `game.html` + `reviews.html` (duplicate footer link removal ONLY) | Claimed 2026-11-20 ~23:10 UTC after `git pull --rebase` onto `d0fc326` (PR #31). Does NOT touch `assets/**`, `server.mjs`, `README.md`, `.github/workflows/**` (da2cec85), `tools/**`. PR #19 evidence gathered: branch `arena/3bff1e0c-livpbp2` head `4e9cb85`, merge-base `f986e43` (PR #17, 22:34:06Z) — 40 s before PR #11 merged (`868029e`, 22:34:46Z), so it rewrites the pre-rebuild client; merging would conflict with/revert PRs #11, #24, #25, #27, #31. |
| Reconstruct missing `assets/css/` and `assets/js/` for static GitHub Pages | done | 26bf496d | arena/26bf496d-livpbp2 | `assets/**`, `COORDINATION.md`, `flagged.html` | Reconstructed `assets/css/style.css` and all 8 `assets/js/*.js` modules, verified syntax with `node --check`, and added `flagged.html` documenting the missing `assets/` directory from initial upload. |
| Audit and integrate Pages navigation, game data attribution and dependency checks | done | 9fc08fc2 | arena/9fc08fc2-livpbp2 | root HTML, assets/js, tools, README.md, COORDINATION.md | [Project](https://github.com/snapquast73-boop/LIVPBP2); checked remote boards before claiming. Merged via PR #2 (b3e9d19) and PR #4 (bc26637): repaired Pages navigation, added per-row MLB feed source links in linescore/boxscore tables, added `flagged.html`, recorded the production deployment. |
| Final integration: line-by-line verification, deployment fixes, Flagged for Review, PR + merge to Pages | done | e799e65b | arena/e799e65b-livpbp2 | `COORDINATION.md`, `flagged.html`, `.gitignore`, `README.md` (status note only) | [Project](https://github.com/snapquast73-boop/LIVPBP2); checked remote boards (`git log`: 9fc08fc2 merged as PR #2 b3e9d19 and PR #4 bc26637, no other active claims). Final integration session; no other session owns files in this scope. Verified live site (scoreboard, game 775296, replay feed, flagged page render with real StatsAPI data), schedule `hydrate` params, official event-type registry codes, MLB scoring-changes attribution, logo CDN pattern, `node --check` on every script, `tools/check-local-links.py`, every `getElementById` target, and local `server.mjs` (health, static, feed-log GET/POST, 404). Fixes: `.gitignore` ignores the server's `data/` output; `flagged.html` gained Verified + Irregularities sections, each item with an official source link; `README.md` gained a status note naming the missing `docs/`/`tools/` files and unimplemented features. Irregularities flagged, non-blocking: README files absent from the repo, poll cadence vs README watchers, hit forecast and scoring-change/SSE tracking not implemented, unverified `flags.inReview`, absolute-path `404.html`, empty repo homepage field (403 for the integration token). Merge/deploy record below. |
| Endpoint-table source links + audit re-verification (89d79ac9) | done | 89d79ac9 | arena/89d79ac9-livpbp2 | `README.md` (endpoint table only), `flagged.html` (new verification-log section), `COORDINATION.md` | Rebased onto `origin/main` c955fcf; initial duplicate claim commit dropped during rebase (its tasks were already completed by e799e65b's merged PRs #4/#5 — no other session's work discarded). Added an official source link and per-row verification status to every row of the README API-calls table (no values added/removed/rewritten) and a matching verification-log section on the Flagged for Review page. Re-verified locally: `tools/check-local-links.py` passes, `node --check` passes for all 9 scripts, `node server.mjs` verified end-to-end (health, index, 404 fallback, feed-log GET/POST round-trip, SSE `connected` + initial snapshot). Note: sandbox egress is restricted to github.com/api.github.com/codeload.github.com/registry.npmjs.org/pypi.org — `statsapi.mlb.com` is unreachable from here, so only the two already-verified rows (marked ✅) count as checked; all other rows link the official host and are flagged ◐ unverified for manual review. Merge/deploy record: follow-up PR (see end of board). |
| Restore documented functionality on the live GitHub Pages site: rebuild the client against the official StatsAPI shapes, repair every broken doc/test reference, add deterministic checks and a Flagged for Review page | done | 8d9a5734 | arena/8d9a5734-livpbp2 | `*.html`, `assets/**`, `docs/**`, `tools/**`, `README.md`, `COORDINATION.md` | Claimed 2026-11-20 before editing any file (board then held only `26bf496d` = done); the parallel rows above were added by sessions that branched from the same `e1609de`, so this session's merge had to reconcile them — see the conflict log below. Rebuilt all 9 client modules against re-fetched API responses (schedule hydrate, `gameStatus`, live feed incl. `reviewDetails` placement, `playByPlay.playIndex`, `statSplits`, `eventTypes`), added `docs/verification-report.md`, `docs/scoring-changes.md`, `docs/api-compliance.md`, two optional workflow templates, five deterministic test tools + fixtures, and rewrote `flagged.html`. Adopted the parallel sessions' per-row official source links and their no-zero-fill rule from `main`. PR #11. |
| Add automated static-site validation and correct Pages deployment guidance | done | da2cec85 | arena/da2cec85-livpbp2 | `.github/workflows/verify-site.yml`, `README.md`, `COORDINATION.md` | Validated the existing Pages `main` root publication and added a CI check for JS syntax and local HTML references; official GitHub Pages source: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site. Rebase conflict after PR #5 merged was resolved by retaining the merged final-integration report and adding this non-overlapping check; final PR/deploy verification pending in this historical note; PR #3 was subsequently merged as 9631dad, its verify check passed (https://github.com/snapquast73-boop/LIVPBP2/actions/runs/44828698152/job/136607778582), and the resulting workflow is present on main. Completion recorded by 5d3e49e1. |
| Independent post-merge verification of PR #11 (8d9a5734 rebuild, merged as `868029e`) against official StatsAPI data and the live Pages deploy; record branch-only claims on the shared board | done | 9a7095ef | arena/9a7095ef-livpbp2 (platform-fixed name; `session-<id>/<task>` naming not available) | `COORDINATION.md` (append-only); any defect found in a file owned by 8d9a5734 is logged here as a request, not edited | Claimed 2026-11-20 22:37 UTC. PR #11 merged by its owner during the claim, so the conditional takeover of its integration is withdrawn. Claims seen only on their own branches (never added to this board): **3bff1e0c** (claim-only commit 4120e33, 22:22 UTC), **626fc8c4** (claim-only commit b5627e9, 22:22 UTC) — no further commits; both overlap 8d9a5734's now-merged scope. |
| Fix Replay Feed review-type/outcome loss found during 9a7095ef verification: `FEED_FIELDS` projection strips `reviewDetails` children; pitch-level reviews read non-existent `playEvents[].details.playIndex` | done | 9a7095ef | arena/9a7095ef-livpbp2 | `assets/js/reviews-feed.js` (`FEED_FIELDS` constant only), `assets/js/reviews.js` (`collectReviewDetails` event-index lookup only), `tools/feed-fields-test.mjs` (new), `flagged.html` (append-only section), `COORDINATION.md` | Claimed 2026-11-20 22:41 UTC. Owner of these files (8d9a5734) is `done`. Branch-only claims touching `assets/**` (312c81d6, 626fc8c4, 3bff1e0c, c91e09d9) are all based on the pre-PR #11 skeleton (merge-base before `868029e`), none of them changes `FEED_FIELDS` or `collectReviewDetails`; this edit is limited to those two spots to keep their eventual rebase trivial. Evidence (official): `feed/live?fields=…,reviewDetails` returns `reviewDetails:{}` — https://statsapi.mlb.com/api/v1.1/game/824027/feed/live?fields=liveData,plays,allPlays,about,atBatIndex,reviewDetails ; adding child keys returns `isOverturned/inProgress/reviewType/challengeTeamId` — https://statsapi.mlb.com/api/v1.1/game/824027/feed/live?fields=liveData,plays,allPlays,about,atBatIndex,reviewDetails,isOverturned,inProgress,reviewType,challengeTeamId,player,id |
| Final verification + fixes: official-status review detection, boxscore fallback, review classification, smoke test | done — obsolete (superseded by PR #11) | c91e09d9 | arena/c91e09d9-livpbp2 | `assets/js/ui.js`, `scoreboard.js`, `game.js`, `reviews.js`, `flagged.html`, `README.md`, `COORDINATION.md`, `tools/smoke-test.mjs` | Session started with 4 fixes + a dependency-free smoke test; PR #11 (8d9a5734) merged with a complete, equivalent rewrite (official-status detection, battingOrder fallback, official classification, docs/tools/fixtures) during this session — PR #16 was closed as obsolete. No code file from this session is live in `main`; the shared board record is below (append-only). |

## Integration record — 9fc08fc2

[Merged PR #2](https://github.com/snapquast73-boop/LIVPBP2/pull/2) into `main` at `b3e9d19`. [Pages build and deployment succeeded](https://github.com/snapquast73-boop/LIVPBP2/actions/runs/44828160063); fetched the updated public [Flagged for Review](https://snapquast73-boop.github.io/LIVPBP2/flagged.html?rev=b3e9d19) page. Reused the local dependency checker from session ff9170ec; all local HTML href/src files exist. JS syntax checks passed. Simulated DOM smoke checks loaded scoreboard, replay feed and game scripts and exercised missing/zero row fields, source URLs and game tabs. These checks are not live-browser or original-site parity tests.

Compared the official [2024-10-30 MLB schedule](https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2024-10-30) to the [MLB game feed](https://statsapi.mlb.com/api/v1.1/game/775296/feed/live): both report Dodgers 7, Yankees 6. This verifies that example, not all past or future data. Original forecast and advanced replay parity: **needs review**, published on the review page. The original repository returned 404.

## Conflict log — e799e65b

`git pull --rebase` onto `bc26637` conflicted twice in `COORDINATION.md` only (session 9fc08fc2's PR #4 added its deployment record while this session had rewritten the board). Resolved by keeping both: the 9fc08fc2 row and its integration record were preserved verbatim, and this session's row was appended with `done` status. No other session's work was discarded; no code files conflicted.

## Sources used for verification — e799e65b

- Official schedule (hydrated): <https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2024-10-30&hydrate=team,linescore,probablePitcher,decisions,review,flags,gameInfo>
- Official live game feed (gamePk 775296): <https://statsapi.mlb.com/api/v1.1/game/775296/feed/live>
- Official event-type registry: <https://statsapi.mlb.com/api/v1/eventTypes>
- MLB official scoring-changes information: <https://www.mlb.com/official-information/scoring-changes>
- GitHub Pages overview (static hosting limits): <https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages>
- Live project site: <https://snapquast73-boop.github.io/LIVPBP2/>

## Merge and deploy record — e799e65b

[PR #5](https://github.com/snapquast73-boop/LIVPBP2/pull/5) (final integration: verified Flagged for Review page, README status note, `.gitignore` `data/`) merged into `main` at `c955fcf` (state `MERGED`, 2026-11-20T22:23:27Z) without waiting for review, per instructions.

GitHub Pages build for `c955fcf` reported **`built`** (duration 57567 ms, no error) via the [Pages builds API](https://api.github.com/repos/snapquast73-boop/LIVPBP2/pages/builds); deployments are listed at <https://github.com/snapquast73-boop/LIVPBP2/deployments/github-pages>.

Post-deploy live checks (all `success`):

- <https://snapquast73-boop.github.io/LIVPBP2/flagged.html> — new Verified and Irregularities sections served.
- <https://snapquast73-boop.github.io/LIVPBP2/game.html?gamePk=775296> — Dodgers 7 – Yankees 6 Final, linescore LAD 0-0-0-0-5-0-0-2-0 / NYY 3-1-1-0-0-1-0-0-0, every line with its MLB feed source link, top-8 catcher-interference challenge shown.
- <https://snapquast73-boop.github.io/LIVPBP2/> — scoreboard renders "0 game(s)" for 2026-11-20 (offseason, correct).
- <https://snapquast73-boop.github.io/LIVPBP2/reviews.html> — Replay Feed renders its empty state for a past date.

Follow-up (same session, documentation accuracy only): a stale hard-coded build hash on the Flagged page was replaced with a link to the repository's Pages deployments. No functional change; no other file touched.

## Concurrent session noticed — da2cec85 (PR #3, merged as `9631dad`)

While this session's PR #7 was merging, [PR #3](https://github.com/snapquast73-boop/LIVPBP2/pull/3) from session `da2cec85` ("Restore GitHub Pages verification and flag repo inconsistencies") was merged into `main` as `9631dad`, one second later. It touched `.github/workflows/verify-site.yml` (new), `README.md` (42 lines: publishing section, status/verification text) and `COORDINATION.md`. No conflict with this session's files: the README status note added in PR #5 survived the merge, and `flagged.html` was not touched by that session.

Re-verification of the combined `main` at `9631dad` (no work discarded):

- `tools/check-local-links.py` → all local href/src targets exist; `node --check` passes for all `assets/js/*.js` and `server.mjs` (same steps the new workflow runs).
- Actions: ["Verify static site"](https://github.com/snapquast73-boop/LIVPBP2/actions/workflows/verify-site.yml) run for `6c98d2a` = `success`; "pages build and deployment" for `9631dad` = `success`, newest Pages build `9631dad` = `built` (an earlier attempt for the same commit shows `Page build failed` / was cancelled and retried — final state is `built`).
- Live pages re-fetched at `?rev=9631dad`: `index.html` (0 games, offseason), `reviews.html` (empty state), `game.html?gamePk=775296` (Dodgers 7 – Yankees 6, linescore and every play with its MLB feed source link), `flagged.html` (current sections served).
- New irregularity found during this re-read and added to the Flagged page: the README "Customizing" section names `SPORT_ID`, `LIVE_POLL_MS`, `REVIEW_POLL_MS`, `PREVIEW_POLL_MS`, `FINAL_POLL_MS` and describes `api.js` retry/fallbacks/formatters and `ui.js` count dots / runners diamond; none of those identifiers or features exist in `assets/js/` (interval values are literals). Documented, not "fixed" by inventing code.

Published status: site live at <https://snapquast73-boop.github.io/LIVPBP2/>; all remaining irregularities are on <https://snapquast73-boop.github.io/LIVPBP2/flagged.html> with source links. None block the deployment.

## Closed as duplicate — PR #6 (session `arena/1e028aca-livpbp2`)

[PR #6](https://github.com/snapquast73-boop/LIVPBP2/pull/6) was **closed** (branch kept on the remote, nothing discarded). It branched from the original upload commit `2ee9ca7`, duplicated the already-verified `assets/` tree with a divergent implementation, added a second review page (`Flagged-for-Review.html`) beside `flagged.html`, and shipped no `tools/`.

Evidence (branch `7878bb7`): `assets/js/game.js` looks up `at-bat-card`, `boxscore-container`, `game-banner`, `linescore-table`, `pbp-container`, none of which exist in that branch's `game.html`; `assets/js/reviews-feed.js` looks up `feed-container`, absent from its `reviews.html`. The game view and Replay Feed would have rendered empty. On `main` the same per-page check passes for `index.html`+`scoreboard.js`, `game.html`+`game.js`, `reviews.html`+`reviews-feed.js`.

Merging it would have replaced working, verified assets and broken the published site, so it was closed rather than merged. Any salvageable wording can be re-proposed against current `main` and re-verified.

## Final state — e799e65b

- Live site: <https://snapquast73-boop.github.io/LIVPBP2/> (Pages, branch publishing from `main`, last build `built`, no error).
- Merged in this session: [PR #5](https://github.com/snapquast73-boop/LIVPBP2/pull/5) (`c955fcf`), [PR #7](https://github.com/snapquast73-boop/LIVPBP2/pull/7), [PR #8](https://github.com/snapquast73-boop/LIVPBP2/pull/8) (`902264e`); closed as duplicate: [PR #6](https://github.com/snapquast73-boop/LIVPBP2/pull/6).
- Checks on the final `main`: `tools/check-local-links.py` passes, `node --check` passes for all `assets/js/*.js` and `server.mjs`, per-page `getElementById` check passes, Actions "Verify static site" = `success`.
- Flagged, non-blocking, all with official source links: <https://snapquast73-boop.github.io/LIVPBP2/flagged.html>.
## Integration record — 89d79ac9

[PR #9](https://github.com/snapquast73-boop/LIVPBP2/pull/9) (README endpoint-table official source links + per-row verification status, Flagged-for-Review verification log, board entries) merged into `main` at `cbcddde` (state `MERGED`, 2026-11-20T22:29:22Z), without waiting for review, per instructions. CI `Verify static site` = `success` on the PR (run 44829151226). Rebased onto `2019ead` right before merge (append-only conflicts in this file vs e799e65b's PR #10 record; both sections kept). No site behavior changed; `index.html`, `game.html`, `reviews.html`, `404.html`, `assets/**`, `server.mjs` untouched by this PR.

GitHub Pages build for `cbcddde` reported **`built`** (build 1388342702, 2026-11-20T22:29:24Z, duration 49910 ms, error `null`) via the [Pages builds API](https://api.github.com/repos/snapquast73-boop/LIVPBP2/pages/builds); the top-level Pages status is now `built` (source `main` `/`, HTTPS enforced, custom 404 active, url <https://snapquast73-boop.github.io/LIVPBP2/>). One instant-fail build (duration 0, "Page build failed.") was recorded for `2019ead` at 22:28:31Z — a commit touching only this file; the immediately preceding content commits (`9631dad`, `902264e`) and `cbcddde` all built successfully, so no repository-side fix was required or made. `github.io` is not fetchable from this audit environment (egress restricted to GitHub API/npm and git hosts), so post-merge live rendering could not be re-fetched here; it was previously verified by e799e65b (scoreboard, `game.html?gamePk=775296`, replay feed, flagged page, at `?rev=9631dad`) and da2cec85 (Pages deployments list / Actions run).

Unverified rows/items carried on this record, all published with official source links on <https://snapquast73-boop.github.io/LIVPBP2/flagged.html> (none block the site): see the "Endpoint table — source links & verification status (89d79ac9, 2026-11-20)" section added in this PR.

## Follow-up verification of the endpoint table — e799e65b (2026-11-20)

Session 89d79ac9 marked the rows it could not reach `◐` because `statsapi.mlb.com` was unreachable from its environment. This session *can* reach the official host and fetched every outstanding row, so the README status cells (status only — no endpoint URL, value or other README text) were updated, and the Flagged page carries the same log.

| Endpoint | Result 2026-11-20 | Evidence |
| --- | --- | --- |
| `GET /api/v1/schedule …&fields=dates,games,gamePk,season,status,…` | ✅ works, minimal payload | [query](https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2024-10-30&fields=dates,games,gamePk,season,status,abstractGameState,codedGameState,detailedState,statusCode,reason,startTimeTBD,abstractGameCode) → `gamePk 775296`, `statusCode F` |
| `GET /api/v1.1/game/{gamePk}/feed/live?fields=…` | ✅ works | [query](https://statsapi.mlb.com/api/v1.1/game/775296/feed/live?fields=liveData,linescore,teams,home,away,runs,hits,errors) |
| `GET /api/v1/gameStatus` | ✅ served; `IH` “Instant Replay” and the `M*` manager-challenge codes present; `MJ`/`NJ` (ABS) and `NH` **not** seen | [gameStatus](https://statsapi.mlb.com/api/v1/gameStatus) |
| `GET /api/v1/game/{gamePk}/playByPlay` · `/boxscore` · `/linescore` | ✅ all respond; play-by-play matches the feed | [playByPlay](https://statsapi.mlb.com/api/v1/game/775296/playByPlay) · [boxscore](https://statsapi.mlb.com/api/v1/game/775296/boxscore) · [linescore](https://statsapi.mlb.com/api/v1/game/775296/linescore) |
| `img.mlbstatic.com` headshot URL | ◐ HTTP 500 to this environment (the same happens for the logo SVG that the live site renders) — URL unconfirmed, unused by the shipped pages | — |
| `GET /api/v1/game/{gamePk}/feed/live` (v1 fallback feed) | ◐ request did not complete here | — |

**Official-data irregularity found while verifying:** the Yankees’ error total for `775296` is **3** in the [live feed linescore](https://statsapi.mlb.com/api/v1.1/game/775296/feed/live?fields=liveData,linescore,teams,home,away,runs,hits,errors) and in the [box score](https://statsapi.mlb.com/api/v1/game/775296/boxscore) (Judge, Volpe and Wells each charged one), but **2** in the [standalone linescore](https://statsapi.mlb.com/api/v1/game/775296/linescore) and in [schedule `hydrate=linescore`](https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2024-10-30&hydrate=linescore&fields=dates,games,gamePk,linescore,teams,home,away,errors,hits,runs). The game page shows 3 because every row links the feed it reads. No code was changed to hide the disagreement; it is documented on the Flagged page.

`tools/check-local-links.py` and `node --check` pass on the combined tree; `flagged.html` tag balance (li/ul/section/code/strong/em/p) verified.

PR open: <https://github.com/snapquast73-boop/LIVPBP2/pull/9> — README endpoint-table official source links + per-row verification status, Flagged-for-Review verification log (new section), and this board entry. CI `Verify static site` = success on the PR (run 44829151226). Rebased onto `902264e` (which includes da2cec85's PR #3 / `9631dad` and e799e65b's PR #8 / `9b3d4dc`) before opening; no other session's work was modified (resolve notes: conflicts were append-only in this file; both sections kept). The session's initial duplicate claim commit was dropped during the earlier rebase onto `c955fcf` — its tasks had already been completed and merged by e799e65b and da2cec85. (Superseded: PR #9's merge + Pages record is the top "Integration record — 89d79ac9" section; this is its pre-merge claim snapshot.)

## Verification record — 8d9a5734

Sources fetched for this branch (each one is also linked from the row it supports in the README
endpoint table and on `flagged.html`):

- Schedule, hydrated: <https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-06-01&hydrate=team,linescore,probablePitcher,decisions,review,flags> — 9 games; trimmed copy in `tools/fixtures/schedule-2026-06-01.json`.
- Live feed: <https://statsapi.mlb.com/api/v1.1/game/824027/feed/live> and <https://statsapi.mlb.com/api/v1.1/game/822974/feed/live> — `gameData`, `plays`, `linescore`, `boxscore`, and the `fields=` projection that proves `reviewDetails` survives narrowing.
- Review-status registry: <https://statsapi.mlb.com/api/v1/gameStatus> — `MA MH MJ NH NS NJ IH`, controls `I` / `F`, `detailedState` "Instant Replay"; trimmed copy in `tools/fixtures/game-status.json`.
- Play-by-play: <https://statsapi.mlb.com/api/v1/game/822974/playByPlay> (with `fields=`) — `playEvents[].details.playIndex`.
- Splits: <https://statsapi.mlb.com/api/v1/people/660271/stats?stats=statSplits&group=hitting&sitCodes=vl,vr&season=2026> — `split.code`/`split.description`; combining `stats=season,statSplits,gameLog` in one call drops `split`.
- Event types: <https://statsapi.mlb.com/api/v1/eventTypes?fields=eventTypes,code,description> — `os_ruling_pending_primary` / `os_ruling_pending_prior`, description "Official Scorer Ruling Pending".
- Not served: <https://statsapi.mlb.com/api/v1/game/824027/feed/live> — the unversioned feed path errors, so the client uses `v1.1`.
- MLB terms: <https://www.mlb.com/official-information/terms-of-use> and <http://gdx.mlb.com/components/copyright.txt> — quoted verbatim in `docs/api-compliance.md`.
- Scoring changes: <https://www.mlb.com/official-information/scoring-changes> — who may change a ruling, and why no API equivalent exists.
- Pages publishing: <https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site>; live Pages metadata: <https://api.github.com/repos/snapquast73-boop/LIVPBP2/pages>.

Local checks, all passing before the merge (re-run after it): `node --check` on every `assets/js/*.js`;
`tools/review-test.mjs` 14/14; `tools/hit-model-test.mjs` 12/12; `tools/reviews-feed-test.mjs` 6/6;
`tools/page-render-test.mjs` 7 pages, 0 failed (jsdom, `npm install --no-save jsdom`);
`tools/link-check.mjs` reports no broken internal links or assets (76 internal references across 5 pages
and 5 docs, 15 script files, 40+ external URLs, 20 statsapi references).

Still unverified (published on `flagged.html`, non-blocking): logo/headshot CDN paths (HTTP 500 to a
non-browser client), `challengeTeamId` semantics, "call stands" vs "call confirmed", whether a challenge
is ever published on the whole play object, the `vsPlayer` head-to-head shape, the reconstructed model's
coefficients, ABS counter semantics, and the public-redistribution question raised by MLB's copyright
notice and Terms of Use.

## Conflict log — 8d9a5734

`git merge origin/main` conflicted in seven files because three other sessions had merged work into
`main` from the same base commit (`e1609de`) while this branch was being built. Nothing of theirs was
discarded:

- `assets/js/game.js` — kept this session's rewrite and imported their two improvements: a value the feed
  does not contain now renders blank instead of `0`, and every linescore/box-score row ends with an
  "MLB feed" source cell plus a "blank = not in payload" note when a field is missing.
- `assets/js/scoreboard.js`, `assets/js/reviews-feed.js` — kept this session's rewrite (independent
  poll/sweep timers, registry gate) and added their `latestRequest` guard so a slow response from an
  older date can no longer overwrite a newer render.
- `README.md` — kept this session's rebuilt documentation and adopted their four-column endpoint table
  (endpoint · official source link · verification status), refilled with this session's own fetch
  results; ✅/◐/❌ marks say which rows this session actually fetched. Their "repository status" note was
  not kept verbatim: it listed `docs/` and `tools/` as missing and the forecast as unimplemented, which
  is no longer true on this branch (the note's remaining true point — upstream 404 — is kept in the
  flagged list).
- `flagged.html` — rebuilt from this session's page and folded in their Verified / Irregularities /
  endpoint-log material as a new "2b · Verified in this session (and items earlier sessions had flagged)"
  section, attributed per item. Their "os_ruling_pending unverified" item is now marked verified against
  the event-type registry; their "◐ not fetched this session (egress blocked)" marks are superseded where
  this session's fetch tool could reach `statsapi.mlb.com`, and that difference is stated on the page.
- `404.html` — took their absolute in-site paths (`/LIVPBP2/...`), which is the correct form for a
  project-site 404 page, and added the `flagged.html` link.
- `COORDINATION.md` — this file: their rows and records kept in full, this session's row and records
  appended.

No file was reverted to a state that loses another session's work; no force-push was used.

## Conflict log — 8d9a5734 (second merge: PRs #13 and #14 landed while this branch was open)

`main` advanced twice more (PR #13 → `4745f60`, PR #14 → `9d861d3`) after the first reconciliation, so the
merge was repeated. Three files conflicted again; nothing was discarded:

- `COORDINATION.md` — their `89d79ac9` merge record, their follow-up verification table and their
  official-data irregularity kept verbatim ahead of this session's records.
- `README.md` — this session's four-column endpoint table kept, with their verified findings folded into the
  rows they belong to: the `gameStatus` row now lists the `M*`/`N*` families and quotes the exact
  `detailedState` strings, and the fallback-bundle row is `✅` with the standalone-`linescore` error-total
  disagreement recorded as an upstream irregularity.
- `flagged.html` — their follow-up verification block and the error-total irregularity kept, with a
  correction appended: `MJ` / `NJ` / `NH` **are** in the registry (this session fetched all four pages of
  `GET /api/v1/gameStatus`; `MJ` “Player challenge: Pitch Result”, `NJ` “Umpire Challenge: Pitch Result”,
  `NH` “Umpire review: Home run”), so their ◐ on the review-code mapping is resolved rather than deleted.

## Post-merge defect found on the live site — 8d9a5734 (PRs #25, #27)

Reading the deployed `reviews.html?date=2026-06-01` after PR #11 showed **49 rows, every one
“Replay Review / Unknown”**, while `game.html?gamePk=824027` on the same date was correct (ABS and
manager challenges classified properly). Cause, established against the official API: the `fields=`
projection is **leaf-name based**, so `…?fields=…,reviewDetails` answers `"reviewDetails": {}`; the
client was reading empty objects. Naming `reviewType,challengeTeamId,isOverturned,inProgress` fixes it:

- `…?fields=liveData,plays,allPlays,playEvents,reviewDetails` → `{}` everywhere
- `…?fields=…,reviewDetails,reviewType,challengeTeamId,isOverturned,inProgress,playEvents` →
  `{"isOverturned":true,"inProgress":false,"reviewType":"MJ","challengeTeamId":115}`

[PR #25](https://github.com/snapquast73-boop/LIVPBP2/pull/25) added the four leaves to
`FEED_FIELDS` and a 14th check (remove a leaf → the check fails; restore it → passes). The same
projection also verified that a whole-play review **is** published at `play.reviewDetails`
(`reviewType MF` on the last play of 824027), which resolves an earlier UNVERIFIED row.

A second defect then became visible: the header read “Reviews & Challenges 2” beside “ABS Challenges
49”, because the **All** tab filtered ABS rows out. [PR #27](https://github.com/snapquast73-boop/LIVPBP2/pull/27)
makes All list every review event (data-quality notes keep the Flagged tab) and extends the tab test.

Post-deploy verification at `reviews.html?date=2026-06-01&rev=389c97b`: 2 manager/umpire challenges +
49 ABS challenges, each card with its category, outcome (“Call Stands / Confirmed” / “Overturned”),
challenger and code (`code MF`, `code MJ`), pitch number and count, the reviewed play text, before/after
score, and the official challenges-remaining line. The scoreboard (`?date=2026-06-01`, 9 games),
game page (`?gamePk=824027`, linescore with a source link on every row) and `flagged.html` were
re-fetched at the same time and are correct.

New irregularity recorded on `flagged.html`: a pitch-level ABS row can show “Overturned” above a play
description that ends “…call on the field was confirmed” — the flag belongs to the pitch, the text to
the play. Both are official and both are shown as returned; nothing is reconciled.

## Request from 9a7095ef acted on — 8d9a5734

9a7095ef logged, and did not edit, a request on this board: [PR #27](https://github.com/snapquast73-boop/LIVPBP2/pull/27)
made the Replay Feed's **All** tab list ABS challenges, while the uploaded README says
“**All** (every category except ABS pitch challenges …)”. The request is correct — parity with the uploaded
document wins over my reading of the header numbers — so the change is **reverted**:

- `assets/js/reviews-feed.js`: `matchesTab('all')` again excludes `abs` (and the data-quality notes, which
  keep their own tab); the comment now quotes the uploaded README and this request.
- `tools/page-render-test.mjs`: asserts the ABS rows are absent from All and present on the ABS tab, so the
  documented behaviour cannot drift again.
- `README.md`: filter description restored to the DOCUMENTED wording.

Their parallel fix to `FEED_FIELDS` (`index`, `teamName`, `clubName`, `shortName`, `name` in addition to the
four review leaves) is kept as merged; `tools/feed-fields-test.mjs` (9 checks) and `tools/review-test.mjs`
(14 checks) both pass on the combined tree. The one-screen consequence of the revert: on a date whose only
review events are ABS, **All** shows the empty state while the ABS tab and the ABS counter show 49 — that is
the uploaded behaviour, and the header explains it.

## Merge and deploy record — 8d9a5734

[PR #11](https://github.com/snapquast73-boop/LIVPBP2/pull/11) (rebuild the client against the verified StatsAPI
shapes, docs, five deterministic checks, Flagged for Review page) was **merged without waiting for review** at
`2026-11-20T22:34:46Z`; merge commit **`868029e`** on `main`. It required three reconciliations with `main`
(PRs #9–#17 from sessions 9fc08fc2 / e799e65b / 89d79ac9 / da2cec85 landed while this branch was open); each
one is logged above and none discarded another session's work.

Pages: the build for `868029e` was observed `building` through the
[Pages builds API](https://api.github.com/repos/snapquast73-boop/LIVPBP2/pages/builds) at `22:34:47Z`. Further
build reads then failed with `403 API rate limit exceeded` for the shared account, so the published result was
confirmed from the site itself instead: `flagged.html?rev=868029e` serves this merge's new sections
(“2b · Verified in this session”, the `eventTypes` source row) alongside the earlier sessions' verification log,
which is only possible if the `868029e` build published. Two neighbouring builds (`2019ead`, `f986e43`) show the
transient `Page build failed. / duration 0` record that a later rebuild of the same commit clears; the published
site was never left broken.

Post-deploy live checks: `https://snapquast73-boop.github.io/LIVPBP2/flagged.html` (new sections served, later
restructured by the follow-up commit below), and the pages themselves stay JS-rendered from StatsAPI — their
behaviour is covered by `tools/page-render-test.mjs` in jsdom, since this environment has no browser.

Follow-up (same session, presentation only): the merge had left the other sessions' verification bullets inside
`flagged.html` §4; they were moved to a new §5 “Verification log carried over from the parallel sessions (kept
verbatim)”, with this session's correction still inside that list. No behaviour and no other file changed in
that follow-up.
Second reconciliation (after PRs #13/#14): `git merge origin/main` conflicted in `COORDINATION.md`,
`README.md`, `flagged.html`; resolved as described in the second conflict log above. Re-ran every check on
the merged tree before pushing — `node --check` (all modules), `review-test` 13, `hit-model-test` 12,
`reviews-feed-test` 6, `page-render-test` 7 pages / 0 failed, `link-check` clean,
`tools/check-local-links.py` clean.

## Merge and deploy record — PR #14 (e799e65b)

[PR #14](https://github.com/snapquast73-boop/LIVPBP2/pull/14) (verify outstanding API rows; flag the linescore/box-score error-total disagreement; README status cells) merged into `main` at `9d861d3` (2026-11-20T22:31:55Z, state `MERGED`) without waiting for review. CI "Verify static site" for `9d861d3` = `success`; Pages build for `9d861d3` = `built` (no error).

Post-deploy live checks at `?rev=9d861d3`:

- <https://snapquast73-boop.github.io/LIVPBP2/?date=2024-10-30> — scoreboard renders the real game: Dodgers 7 (record 4-1) at Yankees 6 (1-4), Yankee Stadium, "Open Gameday →" linking to `game.html?gamePk=775296`, "1 game(s)".
- <https://snapquast73-boop.github.io/LIVPBP2/game.html?gamePk=775296> — header 7–6 Final, linescore with per-row MLB feed links, full play-by-play, box score.
- <https://snapquast73-boop.github.io/LIVPBP2/reviews.html> — Replay Feed renders its counters and empty state for an offseason date.
- <https://snapquast73-boop.github.io/LIVPBP2/flagged.html> — all Flagged-for-Review sections, including the new endpoint follow-up and the error-total disagreement item, are served.

This is the final state: the uploaded project is published and working at <https://snapquast73-boop.github.io/LIVPBP2/>; every irregularity that could not be confirmed from an official source is on the Flagged page with source links.

## Merge and deploy record — PR #13 (89d79ac9)

[PR #13](https://github.com/snapquast73-boop/LIVPBP2/pull/13) (documentation-only: records the PR #9 merge and Pages result) merged into `main` at `4745f60` (state `MERGED`, 2026-11-20T22:31:00Z, no review wait per instructions). GitHub Pages build for `4745f60` reported **`built`** (build 1388346377; polled building → built over ~2 min; error `null`); top-level Pages status was `built` afterwards. (PR #14 was then opened by this session to record this entry; it was merged by e799e65b as `9d861d3` and is recorded above; this section supersedes the stale "PR #14 to reference this entry" wording that was in this file's conflicted copy.)


## Final state verification — e799e65b (post-merge, after PR #11 rebuild)

Session `e799e65b` (this row's owner) re-checked the deployed site after `8d9a5734`'s PR #11 rebuild was merged (`868029e`, with `fff9975` and `3c2bee8` following). Detailed line-by-line re-verification of that rebuild is owned by the in-progress session `9a7095ef`; nothing here duplicates or pre-empts it — this is only the final deploy confirmation for the integration row above.

- Latest `main` checked: `3c2bee8`; Pages build for `3c2bee8` = **`built`** (no error). One earlier doc-only commit (`f986e43`) recorded an instant "Page build failed" (duration 0) — the same transient GitHub-side failure another session logged for `2019ead`; the immediately following builds succeeded, so no repository change was needed.
- Local checks on `3c2bee8`: `tools/check-local-links.py` passes; `node --check` passes for all `assets/js/*.js` and `server.mjs`; `tools/review-test.mjs` 13 checks, `tools/reviews-feed-test.mjs` 6 checks, `tools/hit-model-test.mjs` 12 checks pass; `tools/page-render-test.mjs` passes **7/7 page renders, 0 failed** after `npm install --no-save jsdom` (the dependency the README documents; nothing added to the repo, `node_modules/` stays ignored).
- Live pages (fetched with `?rev=3c2bee8` to bypass CDN staleness):
  - <https://snapquast73-boop.github.io/LIVPBP2/?date=2024-10-30> — "1 game(s)": Dodgers 7 (4-1) at Yankees 6 (1-4), Yankee Stadium, `W: Blake Treinen · L: Tommy Kahnle · SV: Walker Buehler`.
  - <https://snapquast73-boop.github.io/LIVPBP2/game.html?gamePk=775296> — 7–6 Final, weather line, count/outs, on-deck/in-the-hole, linescore with LOB and per-row [MLB feed](https://statsapi.mlb.com/api/v1.1/game/775296/feed/live) links (NYY E = 3, matching the feed and box score), every play with pitch counts, and the top-8 challenge as "Manager Challenge · Call Stands / Confirmed".
  - <https://snapquast73-boop.github.io/LIVPBP2/reviews.html?date=2024-10-30> — Replay Feed shows the real review row with Before/Actual-after score (6–6) and challenge counters (LAD 2 MGR — NYY 1 MGR). Its outcome chip reads "Unknown" where the payload only exposes `isOverturned`, which is the honest behaviour documented on the Flagged page.
  - <https://snapquast73-boop.github.io/LIVPBP2/flagged.html> — the rebuilt review page is served, with per-item sources and the carried-forward rows from earlier sessions.
  - `404.html` uses the absolute `/LIVPBP2/…` paths the project site needs.
- Conclusion: the uploaded project is live and working at <https://snapquast73-boop.github.io/LIVPBP2/>; no broken site was merged.

## Closure record — c91e09d9 (2026-11-20)

My session set out to verify and fix the reconstructed site (`assets/js` review detection via official status registry, boxscore battingOrder fallback, review classification, a dependency-free smoke test). While it was in progress, PR #11 (session 8d9a5734) merged a complete replacement rewrite of those same files — official-status detection (`Reviews.isReviewStatus` on the gameStatus registry), `battingOrderValue` boxscore fallback, `M*`/`N*` review classification, `os_ruling_pending_*` event-code handling, plus `docs/` verification reports, fixtures and five deterministic test tools. Merging this session's stale branch (built on `9d861d3`) into `main` would have reverted that merged rewrite.

**Resolution — no code file from this session is live in `main`; PR #16 was closed as obsolete (not merged).** Its branch is retained for history. The verification this session performed on the combined tree:

- `node --check` passes for all `assets/js/*.js` and `server.mjs`.
- `python3 tools/check-local-links.py` → all local href/src resolve.
- Main's own suite on `3c2bee8`: `tools/review-test.mjs` (13), `tools/reviews-feed-test.mjs` (6), `tools/hit-model-test.mjs` (12), `tools/link-check.mjs` (93 internal refs, 15 scripts, exit 0) — all pass.
- `tools/page-render-test.mjs` (jsdom) could not run here — jsdom fails to install in this sandbox (same restriction that blocked session 8d9a5734's `page-render-test` run); it needs `npm install` on a machine with network.
- Pages builds API: the latest build for the post-PR #15 main (`3c2bee8`, 2026-11-20T22:36:50Z) reported **`built`** (error `null`); two earlier builds during the merge storm were `errored` ("Page build failed.") but the latest is built.
- Sources: official MLB StatsAPI (schedule hydrate, boxscore, gameStatus registry, eventTypes registry); see `docs/verification-report.md` and the Flagged page on `main`.
- Irregularities: none introduced by this session. All irregularities remain on the Flagged for Review page.

This record is append-only and does not change any other session's rows, records, or values.

## Correction re-verified — review codes `MJ`/`NJ`/`NH` (e799e65b)

Session `e799e65b` had written on the Flagged page that `MJ`/`NJ`/`NH` were "not seen in the registry text retrieved here". That was an artefact of reading only the first page of the four-page [`/api/v1/gameStatus`](https://statsapi.mlb.com/api/v1/gameStatus) response. Session `8d9a5734` posted a correction; this session re-fetched the `M*`/`N*` portion and confirms it: `MJ` “Player challenge: Pitch Result”, `NJ` “Umpire Challenge: Pitch Result”, `NH` “Umpire review: Home run”. The Flagged page now says so in both places instead of leaving the stale "unverified" wording next to the correction.

## Verification + fix record — 9a7095ef

**Scope kept:** `assets/js/reviews-feed.js` (`FEED_FIELDS` only), `assets/js/reviews.js` (`collectReviewDetails` index lookup only), `tools/feed-fields-test.mjs` (new), `flagged.html` (new section 6, append-only), `COORDINATION.md`. No other session's text or code was modified.

**Verification performed on `main` (`3c2bee8`, contains PR #11 `868029e`):**

- Local: `node --check` on all `assets/js/*.js` + `server.mjs`; `tools/check-local-links.py` passes; `review-test` 13/13, `hit-model-test` 12/12, `reviews-feed-test` 6/6, `page-render-test` 7/7 (jsdom installed temporarily outside the repo); per-page `getElementById` targets all resolve.
- Pages: builds for `868029e`/`fff9975`/`f986e43` show `errored` with duration 0 (superseded by newer pushes); `3c2bee8` = `built` (46 s). Live `assets/js/api.js` matches the repo byte-for-byte.
- Live vs official, game 824027 — every linescore cell, R/H/E/LOB, batter/pitcher/on-deck/in-hole, count/outs, records, decisions: **all match** ([linescore](https://statsapi.mlb.com/api/v1/game/824027/linescore), [schedule](https://statsapi.mlb.com/api/v1/schedule?sportId=1&gamePk=824027&hydrate=decisions&fields=dates,date,games,gamePk,gameDate,officialDate,teams,away,home,leagueRecord,wins,losses,pct,team,name,decisions,winner,loser,save,fullName)).
- Live Replay Feed (2026-06-01): **defect** — all 49 rows "Replay Review · Unknown", ABS 0. Root cause verified on the official API: [`fields=…,reviewDetails`](https://statsapi.mlb.com/api/v1.1/game/824027/feed/live?fields=liveData,plays,allPlays,about,atBatIndex,reviewDetails) returns `reviewDetails:{}`; [with children](https://statsapi.mlb.com/api/v1.1/game/824027/feed/live?fields=liveData,plays,allPlays,about,atBatIndex,reviewDetails,isOverturned,inProgress,reviewType,challengeTeamId,player,id) returns `isOverturned/inProgress/reviewType/challengeTeamId`.
- Second defect: pitch reviews keyed on `playEvents[].details.playIndex`, which the official payload does not have ([proof](https://statsapi.mlb.com/api/v1.1/game/825078/feed/live?fields=liveData,plays,allPlays,atBatIndex,playEvents,index,details,playIndex,runners,movement,isScoringEvent)); position is `playEvents[].index` ([825078 AB 26: two distinct overturned MJ pitches + confirmed play-level MJ](https://statsapi.mlb.com/api/v1.1/game/825078/feed/live?fields=liveData,plays,allPlays,atBatIndex,playEvents,index,isPitch,type,pitchNumber,details,description,code,playId,reviewDetails,reviewType,isOverturned)).
- Team-name keys confirmed in [`gameData.teams`](https://statsapi.mlb.com/api/v1.1/game/824027/feed/live?fields=gameData,teams,away,home,id,teamName,clubName,shortName,name,abbreviation); review code meanings from [`/api/v1/gameStatus`](https://statsapi.mlb.com/api/v1/gameStatus).
- Fix verified: `tools/feed-fields-test.mjs` 9/9 (6 of 9 fail on the pre-fix code); all existing tests still pass.

**Irregularities (published on `flagged.html` §6, non-blocking):** duplicate "Flagged for Review" footer link on `index.html`/`game.html`/`reviews.html`; `tools/link-check.mjs` exits 1 on `main` because this board names `tools/smoke-test.mjs` (only on c91e09d9's unmerged branch); undocumented semantics of multiple review records per plate appearance; original repo `buffedlizard55-lab/MLB-Live-PBP` has no public copy ([API 404](https://api.github.com/repos/buffedlizard55-lab/MLB-Live-PBP), [search 0](https://api.github.com/search/repositories?q=MLB-Live-PBP)).

**Requests to other owners (not edited by this session):**

- `.github/workflows/verify-site.yml` (da2cec85): CI runs only `node --check` + `check-local-links.py`; consider also running the network-free `node tools/*-test.mjs` checks (`page-render-test` needs `jsdom`).
- `index.html`, `game.html`, `reviews.html` (shared navigation → final integration): remove one of the two duplicate "Flagged for Review" footer links per page.
- Branch-only rebuilds based on the pre-PR #11 skeleton (3bff1e0c `4e9cb85`, c91e09d9 `188cb4b`, 312c81d6, 626fc8c4): rebasing onto current `main` will conflict with PR #11's rewrite of `assets/js/*`; please rebase rather than overwrite, and keep the `FEED_FIELDS` / `ev.index` fix above.

## Merge and deploy record — 9a7095ef

- [PR #18](https://github.com/snapquast73-boop/LIVPBP2/pull/18) (claim + board table fix) merged as `fff9975`.
- [PR #24](https://github.com/snapquast73-boop/LIVPBP2/pull/24) (Replay Feed `FEED_FIELDS` + `ev.index` fix, `tools/feed-fields-test.mjs`, flagged §6) merged as `28fafe4` at 2026-11-20T22:45:11Z; CI "Verify static site" passed.
- **Concurrent duplicate, no work lost:** session 8d9a5734 fixed the same `FEED_FIELDS` defect independently ([PR #25](https://github.com/snapquast73-boop/LIVPBP2/pull/25), commit `e0284c4`, merged as `500e78a` one minute later). Git kept both edits, so four names are listed twice. Verified harmless on the [official API](https://statsapi.mlb.com/api/v1.1/game/824027/feed/live?fields=liveData,plays,allPlays,atBatIndex,reviewDetails,reviewType,challengeTeamId,isOverturned,inProgress,isOverturned,inProgress,reviewType,challengeTeamId) and left in place. PR #25 also resolved the `tools/link-check.mjs` false failure flagged above. The `ev.index` binding and team-name keys exist only in PR #24.
- Pages: the GitHub deployment for `500e78a` (contains `28fafe4`) = `SUCCESS` (GraphQL `deployments(environments:["github-pages"])`; REST quota was exhausted). The live `assets/js/reviews-feed.js` serves the merged `FEED_FIELDS`.
- Post-deploy live checks: the [Replay Feed 2026-06-01](https://snapquast73-boop.github.io/LIVPBP2/reviews.html?date=2026-06-01) shows typed rows ("Manager Challenge · Call Stands / Confirmed · code MF") and ABS = 49 (was "Replay Review · Unknown", ABS 0). The [game 825078](https://snapquast73-boop.github.io/LIVPBP2/game.html?gamePk=825078) shows 5 ABS challenges / 60% overturned, all three Rojas challenges with pitch counts — matches the 5 official `MJ` records.

## Request to 8d9a5734 — Replay Feed "All" tab (logged by 9a7095ef, not edited)

[PR #27](https://github.com/snapquast73-boop/LIVPBP2/pull/27) (`36182b3`) makes the "All" tab include ABS challenges. The user's original upload documents the opposite: "**All** (every category except ABS pitch challenges …), **ABS** (ABS challenges stay fully tracked here …)" — [README at upload commit 2ee9ca7, L60–66](https://github.com/snapquast73-boop/LIVPBP2/blob/2ee9ca7e5cdba0712bfbc19322b5fa271203bca3/README.md#L60-L66). The user asked to keep behaviour the same as the original. Not reverted here, because the file belongs to an active session's scope. Published as ⚠ on `flagged.html` §6 for the user to decide. PR #26 (this session's record) merged as `ada141b`; deployment `389c97b` (contains it) = `SUCCESS`.


## Integration verification — 5d3e49e1

- Claimed at 23:10 UTC; platform fixes the current branch name. No files in da2cec85's active scope were modified. [PR #3](https://github.com/snapquast73-boop/LIVPBP2/pull/3) is merged as `9631dad`; its workflow exists on current main, but its formerly stale board row was marked done after checking the merge and passing PR check; no other session's files were changed.
- Live [scoreboard for 2026-06-01](https://snapquast73-boop.github.io/LIVPBP2/?date=2026-06-01) showed nine games and scores matching the [official schedule](https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-06-01&hydrate=linescore&fields=dates,games,gamePk,teams,away,home,team,name,score,status,abstractGameState). This verifies only these displayed team scores, not every field or game. [Replay Feed](https://snapquast73-boop.github.io/LIVPBP2/reviews.html?date=2026-06-01) showed two manager review rows and an ABS counter; the sample [MLB feed](https://statsapi.mlb.com/api/v1.1/game/824027/feed/live?fields=liveData,plays,allPlays,about,atBatIndex,reviewDetails,isOverturned,inProgress,reviewType,challengeTeamId,player,id) provides review details. Previous sessions documented wider examples, not an exhaustive audit of all present and future values.
- Local: JS syntax (`node --check`), `tools/check-local-links.py`, `tools/link-check.mjs` (local paths only, external URLs **not fetched**), `review-test` 14, `hit-model-test` 12, `reviews-feed-test` 6, `feed-fields-test` 9 and `page-render-test` 7 passed. The render test required a temporary untracked `npm install --no-save --no-package-lock jsdom@26`. These tests use fixtures and are not proof of live behavior in every browser.
- Live GitHub Pages deployment `d0fc326` reported `ACTIVE` via GitHub GraphQL and the live site responded. See [deployments](https://github.com/snapquast73-boop/LIVPBP2/deployments/github-pages). Prior public deployments and original-source limits are recorded above and on [Flagged for Review](https://snapquast73-boop.github.io/LIVPBP2/flagged.html).
- Removed one duplicate footer link from each of three pages, preserving the remaining navigation. Added a follow-up on the review page explicitly distinguishing sample verification from an exhaustive line-by-line audit and noting reconstruction/persistence limitations.
- **Request to client-data owner / future integration:** `props.js` uses reconstructed forecast coefficients and `reviews.js` can attribute a challenge based on `challengeTeamId` despite unresolved semantics. The user requested that unconfirmed values be blank rather than inferred; please assess removing those inferred outputs or establish official support, while preserving explicitly labeled functionality. Sources: [sample MLB review payload](https://statsapi.mlb.com/api/v1.1/game/822974/feed/live?fields=liveData,plays,allPlays,atBatIndex,playEvents,details,reviewDetails,pitchNumber,isPitch,reviewType,challengeTeamId,isOverturned,inProgress), [MLB scoring changes](https://www.mlb.com/official-information/scoring-changes). Neither forecast parity nor complete original behavior can be established from the missing source.
- [PR #19](https://github.com/snapquast73-boop/LIVPBP2/pull/19) remains open and `CONFLICTING`; its head `4e9cb85` was based before the major reconstruction in PR #11. It is another session's work, so not merged or closed here; avoid replacing later corrections. No commits on its branch since 22:34 UTC as observed at 23:18 UTC.

## Merge and deployment — 5d3e49e1

- [PR #32](https://github.com/snapquast73-boop/LIVPBP2/pull/32) merged into `main` at `5a137836449bfcdef756c75a9444199c9586981f` (2026-11-20 23:19:58 UTC). PR check [verify](https://github.com/snapquast73-boop/LIVPBP2/actions/runs/44835972869/job/136632350683) passed.
- Main [Verify static site](https://github.com/snapquast73-boop/LIVPBP2/actions/runs/44836002239) and [Pages build and deployment](https://github.com/snapquast73-boop/LIVPBP2/actions/runs/44836000975) both succeeded; GitHub's deployment API reported `5a137836` ACTIVE. The live [Flagged for Review](https://snapquast73-boop.github.io/LIVPBP2/flagged.html?rev=5a13783) page served the new section. Pages emitted an `actions/upload-artifact@v4` Node 20 deprecation warning during its generated workflow; deployment nonetheless succeeded. [GitHub's notice](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/) describes the runner change.
- This is a sample and automated-test verification, **not** an exhaustive line-by-line validation of every dynamic value or original-site parity. Remaining limitations are published on the Flagged page. The site was already live before PR #32; this PR did not claim to restore the unavailable original code.

## Final verification pass — 1731ad28 (2026-11-22)

- Claimed after `git pull --rebase` onto `4a00031` (PR #33); all prior rows `done`/`needs review`. Site was already live: Pages `built` for `4a00031`, deployment `7954869158` ACTIVE ([Pages metadata](https://api.github.com/repos/snapquast73-boop/LIVPBP2/pages), [deployments](https://github.com/snapquast73-boop/LIVPBP2/deployments/github-pages)).
- **Defect found and fixed — game page never refreshed.** `assets/js/game.js` `startTimer` only painted the countdown; nothing re-invoked `loadGame()`, so the "live" page froze after first load. Fix: countdown reaching zero stops the interval and calls `loadGame()` (which restarts the timer on success and error); the loading spinner now shows only on first load. Regression test added to `tools/page-render-test.mjs` ("game page auto-refreshes on its poll clock", Live feed, 3 s poll): fails with a timeout on the pre-fix code, passes with the fix. The page polls [the official live feed](https://statsapi.mlb.com/api/v1.1/game/824027/feed/live); no data values changed.
- **Defect found and fixed — scoreboard sweep could not see `flags.inReview`.** `scoreboard.js` reads `g.flags.inReview` from the 5 s sweep, but `api.js` `getScheduleStatus`'s `fields` projection did not name `flags`/`inReview`, so the check was dead (detection still worked via `statusCode`). Added the two leaf names; README endpoint-table row synced. Source: [official schedule with `flags` hydrated](https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-06-01&hydrate=team,linescore,probablePitcher,decisions,review,flags). Whether `flags.inReview` is populated per game remains unverified (sandbox cannot reach `statsapi.mlb.com`); the code tolerates its absence.
- **CI now runs the test suite.** `verify-site.yml` previously ran only `node --check` + `check-local-links.py`; the five fixture-based test tools (49 checks) never ran in CI and `page-render-test.mjs` could not start without `jsdom`. Added minimal `package.json` (jsdom devDependency only; the site has no build step) + `npm install` / `npm test` steps. Source: [GitHub Actions Node.js docs](https://docs.github.com/en/actions/automating-builds-and-tests/building-and-testing-nodejs-or-python).
- **Stale PR #19 closed** with an explanatory comment (branch kept on remote). It was `CONFLICTING`/`dirty`, merge-base `f986e43` before PR #11's rebuild `868029e`; merging would revert PRs #11, #24, #25, #27, #31. [PR #19](https://github.com/snapquast73-boop/LIVPBP2/pull/19) closed 2026-11-22T01:49:24Z.
- **Homepage field:** `gh repo edit --homepage` returns `HTTP 403: Resource not accessible by integration` (same as e799e65b found), so it still needs the repo owner under Settings → General → Website. Flagged on `flagged.html` §8. [Repo metadata](https://api.github.com/repos/snapquast73-boop/LIVPBP2) shows `homepage: null`.
- **Unverified, left as-is:** README says combining `stats=season,statSplits,gameLog` "drops `split`, so the client issues it separately", but `props.js` `loadContext` issues that combined request; `docs/verification-report.md` §6 recorded `split.code`/`split.description` as verified for both shapes. Contradiction cannot be settled from this sandbox (no `statsapi.mlb.com` egress), so neither side was changed; worst case the forecast omits the platoon driver and says so. Published on `flagged.html` §8 with both [official request URLs](https://statsapi.mlb.com/api/v1/people/660271/stats?stats=season,statSplits,gameLog&group=hitting&sitCodes=vl,vr&season=2026).
- **Re-verified, no changes:** `node --check` 9/9; `check-local-links.py`; `link-check.mjs` (79 internal refs, no broken links); 49 fixture checks (`npm test`); every `getElementById` target exists; `server.mjs` health/static/404/feed-log round-trip. Sandbox egress cannot reach `github.io`/`statsapi.mlb.com`, so live rendering was confirmed via Pages builds/deployments API + jsdom renders, not by fetching live pages from here. New `flagged.html` §8 documents all of the above.
