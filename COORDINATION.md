# COORDINATION.md — Shared Task Board

## Project
**Repo:** snapquast73-boop/LIVPBP2 (branch: arena/1e028aca-livpbp2)
**Goal:** Fix the project so it is functionally working like the original user's GitHub Pages site. Deploy to our own working GitHub Page.

## Session ID
Session: arena-1e028aca-livpbp2 (Current branch: arena/1e028aca-livpbp2)

## Tasks

| Task ID | Task Description | Status | Owning Session | Files Touched | Sources | Verification | Irregularities |
|---------|------------------|--------|----------------|---------------|---------|--------------|----------------|
| T01 | Review repository structure and identify missing assets/configs | unclaimed | | | | | |
| T02 | Restore missing `assets/` directory (css/js) and verify functionality | unclaimed | | assets/ | | | |
| T03 | Fix server.mjs and verify persistence backend works | unclaimed | | server.mjs | | | |
| T04 | Verify all HTML pages (index.html, game.html, reviews.html, 404.html) link correctly | unclaimed | | index.html, game.html, reviews.html, 404.html | | | |
| T05 | Verify API endpoints and StatsAPI compliance | unclaimed | | assets/js/api.js | | | |
| T06 | Integration: Combine fixes, verify site builds, confirm no broken links | unclaimed | | All | | | |
| T07 | Create PR to main, merge, and confirm GitHub Pages deployment | unclaimed | | All | | | |
| T08 | Publish Flagged for Review page | unclaimed | | Flagged-for-Review.html | | | |

## Coordination Rules
- Claim a task by writing session ID and file scope.
- Commit and push claim immediately.
- Small, frequent commits.
- Run `git pull --rebase` before every push.
- Resolve conflicts without discarding other session's work.
- Record sources, verification, and irregularities.
- Final integration session merges, re-verifies, and publishes.

## Current Claims
- T01-T08: Claimed by session arena-1e028aca-livpbp2 (Scope: All files in /home/user/LIVPBP2)
  - Status: in progress
  - Started: 2026-11-20

## Log
- 2026-11-20: Session arena-1e028aca-livpbp2 initialized. Repository reviewed. Missing `assets/` directory identified. Claiming all tasks to restore functional parity with original GitHub Pages.

## Flagged for Review
- [ ] T02: Missing assets/ directory (css/js files not found in current clone) - Source: [README.md](https://github.com/snapquast73-boop/LIVPBP2/blob/main/README.md)
- [ ] T03: server.mjs functionality verification against original deployment
- [ ] T05: API endpoint verification against official MLB StatsAPI [1](https://statsapi.mlb.com/api/v1/)

## Sources
[1](https://statsapi.mlb.com/api/v1/) MLB StatsAPI Official Documentation (verified via README.md references)
[2](https://github.com/snapquast73-boop/LIVPBP2/blob/main/README.md) Original README.md in repository root

## Integration Status
- Combined data verification: pending
- Site build confirmation: pending
- Broken links check: pending
- GitHub Pages deployment: pending
