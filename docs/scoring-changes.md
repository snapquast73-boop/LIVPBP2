# Scoring changes — how they are detected and what is *not* claimed

## What "scoring change" means here

A scoring change is an official reclassification of a completed play: a hit
changed to an error (or the reverse), a single changed to a double, a
fielder's choice turned into a hit, an out turned into a hit, an error charged
to a different fielder, an RBI added or removed.

MLB publishes those rulings in its own log at
<https://www.mlb.com/official-information/scoring-changes>, which states that
"changes can be made by the Official Scorer, Elias Sports Bureau, or following a
review initiated by a player or club". That page is a human-readable log, **not**
an API endpoint, and the StatsAPI game payload carries **no** scoring-change
marker (verified 2026-11-20; see `docs/verification-report.md` §5).

## How the app detects one

`assets/js/reviews.js` snapshots, on every poll, the official classification of
every completed play:

```js
result.eventType        // "double" → "error"
result.isOut            // true / false
count.outs              // outs after the play
runners[].details.movementReason   // e.g. an error on an advance
```

Two consecutive snapshots are diffed (`Reviews.diffSnapshots`). A row is
published as an **Official Scoring Change** only when one of those
classification fields actually moved. The row shows:

- the observed **initial call** and the observed **final ruling**,
- the official score **after the play** (from `result.awayScore/homeScore`),
- an attribution note that the change was observed by diffing polls.

Limits, stated plainly:

1. A change can only be tracked when the initial call was observed **before** the
   change landed. Opening the page after the ruling shows no row for it.
2. Description/RBI/score edits **without** a reclassification are not reported as
   scoring changes. They are surfaced as **irregularities** ("payload edit
   without reclassification") and never silently applied.
3. A play that disappears from the payload is surfaced as an irregularity
   ("play disappeared from payload").
4. Nothing is predicted. The app never guesses what a pending ruling will be.

## Where the rows appear

| Surface | What is shown |
| --- | --- |
| `reviews.html` → **✏️ Scoring Changes** tab | every observed change for the date, with initial call → final ruling, score after the play, attribution |
| `reviews.html` → **All** tab | the same rows inline with the review feed |
| `game.html` → **Challenges & Reviews** tab | each game's reviews; scoring-change rows for that game are counted in the tab badge source data |
| `index.html` → game cards | `✏️ N scoring change(s)` badge, read from the persisted feed log for that date |

## Persistence

Rows live in the per-date feed log (`localStorage`, newest seven dates, 500
most-recent rows) and, when `server.mjs` is running, in
`data/feed-log-<date>.json` with a server-sent-events push to every other open
page. On GitHub Pages only the `localStorage` layer exists, which is why the
server bridge fails open instead of breaking the page.
