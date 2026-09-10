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

At least five eligible browser voters and 80% directional agreement trigger a
live one-place swap with the adjacent club. The public board is reconstructed
from weekly base scores and current votes on each read (no-store); the UI reloads
it after saving and polls every 15 seconds while visible. No database migration.
Existing votes count immediately; old score offsets and the one-off PSG editorial
publication score are ignored. Model strengths and tiers remain unchanged.

Every club remains within one place of model order. Overlapping swaps prefer the
larger net vote count, then electorate size, then club ID. A club cannot be moved
against its own qualifying consensus. Disjoint swaps prevent chain displacement.
Community +1/-1 identifies a direct consensus move; Community swap identifies
the displaced neighbour. Votes expire at 30 days or after more than 20 points of
model-strength drift. Withdrawals/expiry can immediately reverse a move. Repeated
reads and weekly updates cannot accumulate a rank bonus from the same votes.

The score column remains model strength and can therefore be out of descending
order where community swaps apply; the page explicitly explains this. No model
score is fabricated to make the display order fit. Anonymous session limits and
vote validation remain in force. No identifiers or private inputs are exposed.

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
