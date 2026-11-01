# Favourite/longshot bias refresh

The Overview and Teams pages are public for all five supported leagues, all seasons and venue splits. They default to 2026/27, re-fetch every 60 seconds while visible, and refresh on returning to the tab. The Pro comparison and demo no longer describe this tool as exclusive to Pro.

The previous weekly CSV refresh left recent completed fixtures out of `historical_matches`. A new scheduler job runs every 15 minutes and once shortly after startup, independently of Telegram activity. It accepts only confirmed final scores matched by fixture ID, league, teams and kickoff. Conflicting or explicitly unfinished results are held. Existing prices are preserved; missing prices are filled from the fixture's Pinnacle H2H closing capture only when it is valid and within 30 minutes before kickoff. Unpriced records stay out of the P/L API. The CSV reconciliation now runs daily at 09:00 UTC; existing historical exchange fallback labels remain unchanged.

Production repair on 1 November 2026:

- Inserted 86 missing current-season completed fixtures, using recorded Pinnacle closes. No stale closes or conflicting scores in the repair plan.
- Re-fetched and restored 138 missing historical results: Bundesliga 2021/22 (66), Bundesliga 2024/25 (34), Ligue 1 2022/23 (38). Added mappings for Bielefeld, Greuther Furth, Holstein Kiel and Ajaccio. No other historical rows were overwritten.
- The new refresh then added three newly confirmed finals, including Lazio 2–1 Cagliari on 1 November, Pinnacle close 1.50. Lazio's 2026/27 record became 9W–1D–0L from 10 matches, +12.46 units at 1-unit stakes.
- Raw database backup, source CSVs, exact insert plan/IDs and before/after reconciliation are saved in the local `work/bias-refresh-2026-11-01` audit folder, outside the repository. No assumed or in-play result was published as final.

Validation: 17 backend tests (new refresh plus team market context), targeted frontend ESLint, TypeScript and production build. Refresh health is exposed in the existing administrator fetcher-health response under `bias_results_refresh`.
