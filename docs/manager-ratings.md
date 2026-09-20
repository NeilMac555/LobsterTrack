# Manager Ratings

Public address: `/tools/manager-ratings`.

The standalone dashboard is packaged in `frontend/public/tools/manager-ratings/`.
Vite copies it into the production build. FastAPI's existing static-page handler
serves its `index.html` before the SPA fallback. Both desktop and mobile Tools
links use React Router's `reloadDocument` to reach the static page. It preserves
SteamWatch's dark slate/cyan design, sortable rankings, date filters, comparisons,
methodology and downloadable derived data. The full snapshot lives in backend/app/data/manager-ratings.json; the frontend contains only a fixed three-manager preview.

Initial snapshot: 19 September 2026; 132 manager records, 96 eligible for the
main ranking. Snapshot timestamps are preserved, not advanced by deployment.
This is observed team Elo change during a manager's matches, not causal ability.

## Refresh

The Sportsmonks collection/model workflow remains in the separate Manager Elo
workspace. Its Windows-encrypted credential is not copied to the repository or
deployment. An active Codex heartbeat refreshes on Mondays at 09:00 Europe/Dublin. It requires the Windows machine and Codex to be available. The staged updater and WEEKLY-RUNBOOK.md live under the separate workspace work/manager-elo directory; validation failures keep the last good snapshot online.

After collecting and validating a new snapshot, run from this repository:

```text
python scripts/publish-manager-ratings.py <snapshot-directory>
cd frontend
npm ci
npm run build
```

The snapshot directory must contain `manager-elo.html` and
`manager-elo-data.json`. Review the resulting diff and deploy using the existing
SteamWatch release process. Check the published timestamp, JSON download,
sorting and date filters after deployment. Vite preview requires the trailing
slash `/tools/manager-ratings/`; the production FastAPI handler supports the
canonical path without a slash.

## Access

The top three eligible managers by full-history overall impact are free. Filters
and comparisons in the preview operate on those same three, preventing visitors
from enumerating the full table through alternate sorts or date windows.
GET /api/manager-ratings uses the existing Bearer authentication and subscription:
active subscribers with an unexpired period (or no stored period end) receive
full data; everyone else receives only the preview. Responses are private/no-store.
A cancellation scheduled for period end retains access until then. No new billing
plan is created. Sign-in and checkout use the existing SteamWatch flows, returning
to the manager page. Public downloads contain only the preview; Pro downloads
are generated from the authorized API response. Static paths are constrained to
the frontend directory so private snapshot files cannot be traversed to.

Run `python backend/tests/test_manager_ratings.py` with backend dependencies
installed before publication. Do not replace the secure packager with a raw copy
of source HTML/JSON, including during weekly refreshes.

## Community

The existing manager voting feature is explicitly a device-only localStorage
preview. It does not send votes to the server or change public ratings. Shared
voting, verified free accounts and an atomic ten-changes-per-UTC-day limit remain
follow-up work. The existing Club Ratings browser/session voting cannot enforce
those promises unchanged.

## Validation

Production frontend build passed. Browser checks confirmed ranking rendering,
last-12-month sorting, three-year filtering and Guardiola search without console
errors. Layout lint reports the pre-existing `react-hooks/set-state-in-effect`
finding in the mobile-menu close effect, also present at release base f28906f.

Rollback: revert the Manager Ratings release commit; this removes the page,
navigation entry and sitemap entry. Existing backend data is unaffected.

Theme: `scripts/manager-ratings-theme.css` is embedded by the snapshot packager. Fonts, navigation branding, panels, numeric typography and chart colours follow SteamWatch.
