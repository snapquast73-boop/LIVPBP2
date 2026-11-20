# API compliance and request budget

## The terms the data comes with

Every StatsAPI response carries this notice verbatim (verified 2026-11-20 on
`GET https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-06-01`):

> "Copyright 2026 MLB Advanced Media, L.P. Use of any content on this page
> acknowledges agreement to the terms posted here
> <http://gdx.mlb.com/components/copyright.txt>"

The linked notice (verified 2026-11-20) reads:

> "The accounts, descriptions, data and presentation in the referring page (the
> "Materials") are proprietary content of MLB Advanced Media, L.P ("MLBAM").
> Only individual, non-commercial, non-bulk use of the Materials is permitted and
> any other use of the Materials is prohibited without prior written authorization
> from MLBAM."

MLB.com's Terms of Use (<https://www.mlb.com/official-information/terms-of-use>,
verified 2026-11-20) add, in §1:

> "Except for downloading one copy of the MLB Digital Properties on any single
> device for your personal, non-commercial home use, you must not reproduce,
> prepare derivative works based upon, distribute, perform or display the MLB
> Digital Properties without first obtaining the written permission of MLB …"

The StatsAPI itself is **not** a documented public product: it has no published
rate limit, no API key, and no written authorization for third-party
redistribution. This repository therefore treats it as a *personal,
non-commercial, non-bulk* data source, which is the use the notice permits.

**Flagged for review:** whether a *public* deployment of this app is permitted at
all is an open question that this code cannot answer. It is listed on
`flagged.html` so a human can decide.

## Request budget enforced by the code

| Surface | Cadence (code constant) | Requests |
| --- | --- | --- |
| `index.html` scoreboard | full hydrated schedule every **20 s** while any game is live, every **60 s** otherwise (`LIVE_POLL_MS`, `IDLE_POLL_MS` in `assets/js/scoreboard.js`) | 1 |
| `index.html` status sweep | lean `fields`-projected schedule every **5 s** while live (`STATUS_SWEEP_MS`) | 1 |
| `game.html` live game | full feed every **3 s** (`LIVE_POLL_MS` in `assets/js/game.js`); **30 s** for preview/final games | 1 |
| `reviews.html` Replay Feed | one schedule + one `fields`-projected feed per non-Preview game, every **20 s** while live, **60 s** otherwise | 1 + N |
| Player stats (hit forecast) | only when a live at-bat card or the Props tab is on screen; responses cached 10 min in memory | 3 per batter/pitcher pair |

Additional guards:

- **Hidden tab = zero requests.** Every page listens for `visibilitychange` and
  stops its timers while `document.hidden`.
- **HTTP 429 is honoured.** `assets/js/api.js` reads `Retry-After` (clamped to
  1 s – 5 min), otherwise quiet for 60 s, and refuses to issue any request during
  that window. The page shows "API asked us to slow down".
- **No retry storm.** One retry per request, 350 ms apart, and none at all while a
  quiet period is active.
- **Timeouts.** Every request aborts after 15 s so a hung connection cannot queue
  up behind the next poll.
- **No proxying, no keys, no scraping.** The browser talks to
  `statsapi.mlb.com` directly; the optional `server.mjs` only stores this app's
  own feed log (it never touches MLB's API).
- **Images** are loaded lazily (`loading="lazy"`) and hidden on error.

## What this app does not do

- It does not scrape mlb.com pages; it calls the same JSON endpoints the
  Gameday client uses.
- It does not store or redistribute play-by-play data beyond the small
  per-date review log in the visitor's own browser (or the operator's own
  `data/` directory when running the optional server).
- It is not affiliated with MLB or MLB Advanced Media; the footer says so on
  every page.
