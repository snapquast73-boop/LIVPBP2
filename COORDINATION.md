# Coordination Board — shared task board

Session IDs are the short hash of the session branch (`arena/<id>-livpbp2`).
Rule: never start a task another session has claimed; keep file scopes non-overlapping.

## Active Sessions

| Task | Status | Session ID | Branch | File Scope | Notes |
| --- | --- | --- | --- | --- | --- |
| T1 — Reconstruct missing `assets/css/` + `assets/js/` for static GitHub Pages | done | 26bf496d | arena/26bf496d-livpbp2 | `assets/**`, `COORDINATION.md`, `flagged.html` | First pass: created `assets/css/style.css` and 8 `assets/js/*.js` modules and `flagged.html`. Reviewed in T2 — the JS was a stub: unused page containers, no decisions/counters/score tracker/sound/scoring changes, `flags.inReview` never populated by the API. Superseded by T2. |
| T2 — Full functional restoration + verification + Pages deploy | in progress | 626fc8c4 | arena/626fc8c4-livpbp2 | `assets/**`, `index.html`, `game.html`, `reviews.html`, `404.html`, `flagged.html`, `README.md`, `docs/**`, `tools/**`, `.github/workflows/**`, `COORDINATION.md` | Owner: this session. Rewrites all JS modules against live-verified StatsAPI shapes, adds docs + offline tests, opens PR, merges, confirms Pages deploy. No other scope touched (`server.mjs` left as uploaded). |

## Task log

### T2 — claim (session 626fc8c4)

Scope claim recorded before any edit. No other session is active in this repo; no overlaps.

### T2 — findings from line-by-line review of the uploaded repo

| # | Finding | Evidence | Status |
| --- | --- | --- | --- |
| 1 | Original upstream source is not publicly recoverable. `README.md` points at `buffedlizard55-lab/MLB-Live-PBP`, which returns HTTP 404 from the GitHub API; that account has zero public repos; GitHub code search for the project's own storage prefix `livpbp_feed_log_` returns 0 results. Reconstruction is therefore spec-driven. | https://api.github.com/repos/buffedlizard55-lab/MLB-Live-PBP (404), https://api.github.com/users/buffedlizard55-lab/repos (`[]`), `https://api.github.com/search/code?q=%22livpbp_feed_log_%22` (0) | flagged |
| 2 | `assets/` was absent from the upload: every page requests `assets/css/style.css` and 8 `assets/js/*.js` files, none of which existed in commit `2ee9ca7`. | `git log --diff-filter=A -- assets`, page `<script>` tags | fixed in T1, reworked in T2 |
| 3 | Reconstructed JS was a stub vs. the original page contract: `#header-decisions`, `#active-strip`, `#sound-toggle-btn`, `#notify-toggle-btn` and the PBP chips were never populated; no challenge counters, no score tracker, no scoring-change tracking, no hit forecast. | jsdom run of `game.html` / `reviews.html` (containers render empty) | fixed in T2 |
| 4 | `scoreboard.js` used `game.flags.inReview` for the review ticker. The live API returns `flags: {}` for scheduled/live/final games, so the ticker could never fire. Official review detection is `status.statusCode` per `GET /api/v1/gameStatus`. | https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-08-28&hydrate=review,flags , https://statsapi.mlb.com/api/v1/gameStatus | fixed in T2 |
| 5 | Review classification was text-matching (`desc.includes('home run')`), so the verified boundary-call code `NH` ("Umpire review: Home run") was labelled "Replay Review". Classification now reads the official registry codes. | https://statsapi.mlb.com/api/v1/gameStatus | fixed in T2 |
| 6 | README documents `docs/` (verification report, scoring changes, API compliance, workflow templates) and 14 `tools/*.mjs` checks. None existed in the upload. | `ls docs tools` → not found | docs + tests added in T2; README test list corrected to the files that actually exist |
| 7 | README claims the `statcast` stat is rejected with HTTP 400 for `group=hitting`, and that xBA comes from `expectedStatistics`. Verified: `expectedStatistics` returns `stat.avg` (xBA), `slg`, `woba`, `wobaCon` — there is no `xba` key. | https://statsapi.mlb.com/api/v1/people/677951/stats?stats=expectedStatistics&group=hitting&season=2026 | corrected in T2 docs |
| 8 | README claims `reviews-feed.js` scans every live game every 250 ms and sweeps statuses every 125 ms (~68 req/s for one client). That cadence is not reproduced: it is hostile to a keyless public API and would make the user's IP the problem. T2 ships a slower cadence (constants documented in `docs/api-compliance.md`) and flags the deviation. | README §"Be a good citizen" | flagged (deliberate deviation) |
| 9 | `server.mjs` is a Node persistence server that GitHub Pages cannot execute. It is kept unchanged; the client detects its absence (404 on `/api/feed-log`) and runs in static `localStorage` mode. | https://docs.github.com/en/pages (static hosting only) | by design |

### T2 — verification performed

All API shape claims in the code and docs were checked against the live public StatsAPI on
2026-11-20; the exact requests and their responses are recorded in
[`docs/verification-report.md`](docs/verification-report.md) with the source URL for each row.
Nothing in this repo was verified from memory or from third-party documentation.

### T2 — PR / merge / deploy

Recorded at the end of the session (see "Release log" below).

## Release log

| Date (UTC) | Item | Result |
| --- | --- | --- |
| 2026-11-20 | T2 branch push | see PR link below |
