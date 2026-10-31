# Manager Ratings

Public address: `/tools/manager-ratings`.

The standalone dashboard is packaged in `frontend/public/tools/manager-ratings/`.
Vite copies it into the production build. FastAPI's existing static-page handler
serves its `index.html` before the SPA fallback. Both desktop and mobile Tools
links use React Router's `reloadDocument` to reach the static page. It preserves
SteamWatch's dark slate/cyan design, sortable rankings, date filters, comparisons,
methodology and downloadable derived data. The full snapshot lives in backend/app/data/manager-ratings.json; the frontend contains the full public dataset.

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

## Access and discovery

All manager rankings, comparisons, date filters and derived JSON downloads are
public as requested on 30 October 2026. No account or Pro subscription is required.
The API and static download contain the same full dataset. Other SteamWatch Pro
features retain their existing access rules.

The packager adds overall rank changes compared with the last published snapshot.
Same-snapshot rebuilds retain the original comparison, and future weekly refreshes
advance it automatically. Green/red SVG arrows include places moved and accessible
labels; newly eligible managers show New. Sorting and date filters do not change
the overall comparison basis. Initial comparison: 19 October to 30 October.

The frontend build renders every eligible table row into HTML, plus visible source,
coverage, methodology, limitations, update date and FAQs. Matching WebApplication,
Dataset, FAQPage and BreadcrumbList structured data describe the public content.
Canonical and sharing tags use the existing site conventions. Sitemap inclusion
and existing crawler access are retained; these do not guarantee search placement
or AI citations. No model-targeted manipulation or hidden content is added.

Validate with both manager test files, the production frontend build and `node frontend/scripts/check-manager-ratings.mjs`.

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

## Approved model — 31 October 2026

The default ranking is corrected match Elo impact plus half-strength trophy
bonuses (`elo-plus-half-trophies-v1`). `score` is the composite; `impact`, `per38`,
`recent` and trajectories remain match-only. The selected date window also filters
`trophies` by award date. Separate table columns expose both components. All
eligible rows rank before the insufficient-evidence cohort. Model changes reset
movement once; subsequent same-model weekly snapshots restore normal comparisons.

The 75-title ledger covers 2016/17–2025/26. Formula and limitations are disclosed
on the page: 0.5 × base × clamp(1 − precompetition Elo gap / 200, 0.25, 2).
This is an uncalibrated strength proxy, not title odds. 198 sourced correction
entries repair 190 deduplicated historical assignments (eight were already correct
in overlapping cache files). Sources and original identities are preserved.

Versioned model/ledger copies live in scripts/manager-model; the runnable
Sportsmonks workflow remains in the separate local workspace. Weekly staging
copies its authoritative builder and ledgers. Newly completed seasons absent
from the reviewed trophy ledger stop publication for review instead of silently
omitting a trophy. Extend the ledger from verified standings/finals and audited
head-coach attribution, calculate strengths strictly before competition start,
then rerun validation. Never substitute experimental full-strength bonuses.

This adoption preserves the 30 October data timestamp; deployment date does not
claim a new collection. Initial combined leaders: Conte, Emery, Guardiola.
