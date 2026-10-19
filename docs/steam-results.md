# Steam and drifter records

Updated 19 October 2026.

- `/api/steam-results`: all recorded qualifying home/away 1X2 steam selections, independent of Telegram delivery.
- `/api/drifter-results`: all recorded qualifying home/away 1X2 drifts, using the same selection rules.
- `/api/telegram-results`: the separate confirmed-sent-alert ledger, including draw bets and actual sent prices. `/api/steam-moves` and the homepage syndicate widget continue to use sent alerts.

A selection qualifies when implied probability changes by at least 3 percentage points from its first recorded Pinnacle quote and the observation is between kickoff minus 120 minutes and kickoff. Recompute `100/current - 100/opening` rather than trusting historical percentage semantics. Each fixture/outcome counts once, using its largest absolute qualifying move (the pre-existing drifter convention), earliest observation breaking ties. This is a descriptive record; largest-move P/L is not an executable first-alert strategy. Missing results never count as losses. Draw selections are excluded from the team tables; drawn matches lose the team win bet.

Season and last-30-day filters use the stored fixture kickoff. Rankings require three settled selections, with optional 5+/10+ UI filters; default sort is move frequency. Rows under the threshold still count in the summary. Summary calculations use the full cohort, independent of the recent-results response limit.

Both pages refresh every 60 seconds while visible and immediately on tab return/focus. A background failure keeps the last successful data visible and shows a retry notice. Requests from an obsolete filter/unmounted component cannot replace newer data. The page shows last checked, latest settled fixture, pending and excluded counts.

## Result recovery

The hourly result job first consults saved results, source-verified exceptions and exact league/date/home/away matches in `historical_matches`. This can recover matches outside the Odds API scores endpoint's three-day window. Missing or ambiguous fixtures remain unresolved and are logged for review. No fuzzy matching or default 0-0 scores.

`backend/app/data/verified_match_results.json` contains evidence URLs and fixture identity for seven completed fixtures and two interrupted fixtures. The 19 October backfill settled eight Telegram alerts and 16 detector observations across those seven fixtures. Levante-Athletic (16 September, postponed) and Rayo-Athletic (10 October, suspended) remain without final scores and are explicitly excluded. Review their exceptions when the matches are completed/rescheduled; do not use interim 0-0 as full-time or assume sportsbook void rules.

Audit/rollback snapshots for the scoped database backfill are retained locally in `work/table-freshness-2026-10-19/backfill-before.json` and `backfill-after.json` in the calling workspace. No prices, selections or Telegram send history were changed.

## Validation

56 backend tests passed, including deduplication, 3pp/120-minute boundaries, direction, draw handling, pending results, season/league filtering, full-cohort totals, identity-safe recovery and Telegram separation. Frontend TypeScript/Vite production build passed. Live API/browser checks are recorded with the release audit.
