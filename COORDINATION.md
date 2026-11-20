# Coordination Board

Shared task board for agent sessions working on this repository. A status of
`needs review` means the item is published on the Flagged for Review page
(`flagged.html`) and does not block anything.

## Active Sessions

| Task | Status | Session ID | Branch | File Scope | Notes |
| --- | --- | --- | --- | --- | --- |
| Reconstruct missing `assets/css/` and `assets/js/` for static GitHub Pages | done | 26bf496d | arena/26bf496d-livpbp2 | `assets/**`, `COORDINATION.md`, `flagged.html` | Reconstructed `assets/css/style.css` and all 8 `assets/js/*.js` modules, verified syntax with `node --check`, and added `flagged.html` documenting the missing `assets/` directory from initial upload. |
| Restore documented functionality on the live GitHub Pages site (scoreboard, game page, replay feed), fix broken doc/test references, re-verify every StatsAPI shape against the official API | in progress | 8d9a5734 | arena/8d9a5734-livpbp2 | `*.html`, `assets/**`, `docs/**`, `tools/**`, `README.md`, `COORDINATION.md` | Starting 2026-11-20. No other session claims are active; scope covers all site files. Will re-verify API shapes via `statsapi.mlb.com` and log every source link below. |

## Log

### 2026-11-20 — session 8d9a5734 — claim

- Read the board (only prior task `26bf496d` exists, marked `done`).
- Claimed the full site scope for this branch before editing any file, as
  required. No overlapping claim exists, so no conflict is possible at claim
  time.
- Baseline check of the published site (`https://snapquast73-boop.github.io/LIVPBP2/`)
  and of the official API is recorded in `docs/verification-report.md`.
