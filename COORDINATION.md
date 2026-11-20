# Coordination Board

## Active Sessions
| Task | Status | Session ID | Branch | File Scope | Notes |
| --- | --- | --- | --- | --- | --- |
| Reconstruct missing `assets/css/` and `assets/js/` for static GitHub Pages | done | 26bf496d | arena/26bf496d-livpbp2 | `assets/**`, `COORDINATION.md`, `flagged.html` | Reconstructed `assets/css/style.css` and all 8 `assets/js/*.js` modules, verified syntax with `node --check`, and added `flagged.html` documenting the missing `assets/` directory from initial upload. |
| Audit and integrate Pages navigation, game data attribution and dependency checks | done | 9fc08fc2 | arena/9fc08fc2-livpbp2 | root HTML, assets/js, tools, README.md, COORDINATION.md | [Project](https://github.com/snapquast73-boop/LIVPBP2); checked remote boards before claiming. Merged via PR #2 (b3e9d19) and PR #4 (bc26637): repaired Pages navigation, added per-row MLB feed source links in linescore/boxscore tables, added `flagged.html`, recorded the production deployment. |
| Final integration: line-by-line verification, deployment fixes, Flagged for Review, PR + merge to Pages | done | e799e65b | arena/e799e65b-livpbp2 | `COORDINATION.md`, `flagged.html`, `.gitignore`, `README.md` (status note only) | [Project](https://github.com/snapquast73-boop/LIVPBP2); checked remote boards (`git log`: 9fc08fc2 merged as PR #2 b3e9d19 and PR #4 bc26637, no other active claims). Final integration session; no other session owns files in this scope. Verified live site (scoreboard, game 775296, replay feed, flagged page render with real StatsAPI data), schedule `hydrate` params, official event-type registry codes, MLB scoring-changes attribution, logo CDN pattern, `node --check` on every script, `tools/check-local-links.py`, every `getElementById` target, and local `server.mjs` (health, static, feed-log GET/POST, 404). Fixes: `.gitignore` ignores the server's `data/` output; `flagged.html` gained Verified + Irregularities sections, each item with an official source link; `README.md` gained a status note naming the missing `docs/`/`tools/` files and unimplemented features. Irregularities flagged, non-blocking: README files absent from the repo, poll cadence vs README watchers, hit forecast and scoring-change/SSE tracking not implemented, unverified `flags.inReview`, absolute-path `404.html`, empty repo homepage field (403 for the integration token). Merge/deploy record below. |
| Endpoint-table source links + audit re-verification (89d79ac9) | done | 89d79ac9 | arena/89d79ac9-livpbp2 | `README.md` (endpoint table only), `flagged.html` (new verification-log section), `COORDINATION.md` | Rebased onto `origin/main` c955fcf; initial duplicate claim commit dropped during rebase (its tasks were already completed by e799e65b's merged PRs #4/#5 — no other session's work discarded). Added an official source link and per-row verification status to every row of the README API-calls table (no values added/removed/rewritten) and a matching verification-log section on the Flagged for Review page. Re-verified locally: `tools/check-local-links.py` passes, `node --check` passes for all 9 scripts, `node server.mjs` verified end-to-end (health, index, 404 fallback, feed-log GET/POST round-trip, SSE `connected` + initial snapshot). Note: sandbox egress is restricted to github.com/api.github.com/codeload.github.com/registry.npmjs.org/pypi.org — `statsapi.mlb.com` is unreachable from here, so only the two already-verified rows (marked ✅) count as checked; all other rows link the official host and are flagged ◐ unverified for manual review. Merge/deploy record: follow-up PR (see end of board). |
| Restore documented functionality on the live GitHub Pages site: rebuild the client against the official StatsAPI shapes, repair every broken doc/test reference, add deterministic checks and a Flagged for Review page | done | 8d9a5734 | arena/8d9a5734-livpbp2 | `*.html`, `assets/**`, `docs/**`, `tools/**`, `README.md`, `COORDINATION.md` | Claimed 2026-11-20 before editing any file (board then held only `26bf496d` = done); the parallel rows above were added by sessions that branched from the same `e1609de`, so this session's merge had to reconcile them — see the conflict log below. Rebuilt all 9 client modules against re-fetched API responses (schedule hydrate, `gameStatus`, live feed incl. `reviewDetails` placement, `playByPlay.playIndex`, `statSplits`, `eventTypes`), added `docs/verification-report.md`, `docs/scoring-changes.md`, `docs/api-compliance.md`, two optional workflow templates, five deterministic test tools + fixtures, and rewrote `flagged.html`. Adopted the parallel sessions' per-row official source links and their no-zero-fill rule from `main`. PR #11. |
| Add automated static-site validation and correct Pages deployment guidance | in progress | da2cec85 | arena/da2cec85-livpbp2 | `.github/workflows/verify-site.yml`, `README.md`, `COORDINATION.md` | Validated the existing Pages `main` root publication and added a CI check for JS syntax and local HTML references; official GitHub Pages source: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site. Rebase conflict after PR #5 merged was resolved by retaining the merged final-integration report and adding this non-overlapping check; final PR/deploy verification pending. |
| Independent post-merge verification of PR #11 (8d9a5734 rebuild, merged as `868029e`) against official StatsAPI data and the live Pages deploy; record branch-only claims on the shared board | in progress | 9a7095ef | arena/9a7095ef-livpbp2 (platform-fixed name; `session-<id>/<task>` naming not available) | `COORDINATION.md` (append-only); any defect found in a file owned by 8d9a5734 is logged here as a request, not edited | Claimed 2026-11-20 22:37 UTC. PR #11 merged by its owner during the claim, so the conditional takeover of its integration is withdrawn. Claims seen only on their own branches (never added to this board): **3bff1e0c** (claim-only commit 4120e33, 22:22 UTC), **626fc8c4** (claim-only commit b5627e9, 22:22 UTC) — no further commits; both overlap 8d9a5734's now-merged scope. |

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
`tools/review-test.mjs` 13/13; `tools/hit-model-test.mjs` 12/12; `tools/reviews-feed-test.mjs` 6/6;
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

## Merge and deploy record — 8d9a5734

To be appended once PR #11 merges and the Pages build is confirmed.
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

