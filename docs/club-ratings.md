# Club Ratings beta

Public route: `/tools/club-ratings`, linked from Tools on desktop and mobile.
No paywall and no sign-in requirement for either reading or voting. Steam
Results replaces the duplicate Movers desktop navigation link.

## Rating inputs and publication

The isolated production engine preserves the reviewed local board: fixed-scale
ECI, Club Elo, Driblab and PitchRank, plus rolling Understat non-penalty xG.
The domestic fit uses a 180-day half-life and opponent/venue adjustment.
Performance weight is `0.5 * weighted_matches / (weighted_matches + 8)`.
The reviewed 2026/27 roster has 135 clubs, including 96 top-five-league clubs.
Competition membership needs a reviewed roster update at season rollover.

Only public rating inputs, the verified roster and identity hints are bundled.
There are no Sportmonks credentials, Wyscout files, unrelated pilot routes or
match-pricing changes in this release. The existing rolling-xG chart refresher
is unchanged; the new ratings collector uses the strict shared Understat parser.

`club_rating_publications` stores immutable weekly boards and prior rank/score
comparisons. `club_rating_inputs` stores the latest valid source snapshots in
Postgres, surviving container replacement. Collectors operate in a temporary
directory; scratch files and provider histories are not accumulated on disk.
The first publication uses the reviewed launch seed with its real source dates.

APScheduler checks hourly and after startup, publishing once per week after
Monday 12:00 UTC. Missed weeks are recovered, not replayed as multiple community
steps. A Postgres advisory lock and unique publication period prevent duplicate
publication across replicas. Failed/incomplete boards retain the previous
publication; retries back off six hours after a completed invalid refresh.
Unavailable/old source coverage is explained on the page. An overdue publication
is flagged after six hours. External data retains its source observation dates.

## Anonymous feedback

`GET /api/club-ratings/votes/me` creates a random HttpOnly, SameSite=Lax cookie
scoped to the voting API. On HTTPS production it is Secure. The server stores a
SHA-256 digest as the browser identity, not an email, account ID or raw cookie.
The cookie lasts one year; individual opinions expire after 30 days.

`PUT /api/club-ratings/{club_id}/vote` accepts only integer -1, 0 or 1, where zero
withdraws the vote. Club and displayed score come from the publication, not the
client. A unique browser/club constraint and browser-row lock prevent duplicate
votes, including racing first requests. Same-direction requests are idempotent.
Changes have a two-second cooldown and a 20-club/minute browser limit. Cross-site
browser requests are rejected. Rate-limit failures do not change saved votes.

Anonymous cookies identify browsers, not verified people. Clearing cookies or
changing devices can create another identity. This limitation is disclosed in
the method; the deliberately small effect cap limits its consequences.

At least five eligible browser voters and 80% directional agreement are needed.
The absolute target is `15 * (up - down) / (count + 10)`; otherwise zero.
Each weekly publication moves at most three points towards that target, with
an overall ±15 cap. This is an absolute offset, not an accumulating weekly bonus.
Votes more than 20 rating points from the currently estimated displayed score
no longer count. Expired/withdrawn support gradually brings the offset to zero.
Community offsets never enter the external/performance model's inputs.

## Validation

- Seven automated tests cover quorum, disagreement, caps, expiry, score drift,
  publication boundaries, free/anonymous access, strict validation, duplicate
  votes, cookie isolation, withdrawal, cross-site blocking and atomic publication
  failure/idempotence. Test database is isolated SQLite; production uses Postgres.
- Compared all 135 production-preview base scores with the running local model:
  maximum difference 0.00054 points from evaluation time; all 96 performance
  components retained. PSG sixth/Elite; six Elite clubs.
- Public-source refresh exercised against all four providers and all five
  current-season Understat feeds: 135 clubs, no stale-board fallback or warnings.
- Production build and new-page/App ESLint pass. Layout's existing
  `setMobileMenuOpen(false)` effect trips the current lint rule; verified present
  at the deployment base commit and left unchanged.
- Browser checked search, Europa League filter (36 clubs), desktop Tools/nav,
  390px phone controls, visible Beta label and anonymous voting/persistence.

Rollback: reverting the release removes routes/navigation/jobs. The four new
tables can safely remain for recovery; no destructive rollback migration is
needed. Never delete users, odds data or existing model tables for this feature.
