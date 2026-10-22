# Public Pro demo implementation

The public `/pro/demo` route follows the [surface brief](brief.md) and root [product context](../../PRODUCT.md). It is an extension of SteamWatch's existing interface. No new design system, `DESIGN.md` or design sidecar was created.

## Ownership and maintenance

- `frontend/src/pages/ProDemoPage.tsx` owns the four tabs, query-string selection (`?tool=market|form|xg|model`), local controls, source disclosures and membership links. Its stylesheet owns only the demo presentation.
- `frontend/src/model/proDemo.ts` owns snapshot selection, form summaries, rolling windows and the adapter to the unchanged `runModel` in `valorModel.ts`. Form filters do not alter predictor inputs. Absence settings are hypothetical strength adjustments; the handicap selector selects an output market. Reset restores absence values to `1` and the handicap to `-1.5`.
- `frontend/src/data/proDemo.json` is the frozen public sample. The page imports it locally; it does not fetch subscriber data or alter entitlements. Existing site services remain outside this sample boundary.
- Route registration is in `App.tsx` and `routes.json`; static metadata/content are in `scripts/prerender-blog.mjs`. Keep the client page and prerender copy consistent. Discovery links appear on `/pro`, paywalls and the footer; the shared layout supplies demo-specific historical wording.

Refresh this sample only as a deliberate data change. Update the snapshot, provenance, source manifest, fixture-dependent copy and validation expectations together. Preserve the pre-kickoff cutoff, chronological ordering, unique matches, complete rolling windows and adequate venue-filtered samples. If shared model code changes, recalculate and record the reconstruction rather than treating these prices as permanently frozen predictions.

## Data and calculation boundaries

The fixture is Arsenal–Leeds United, 10 October 2026 at 11:30 UTC. The snapshot was assembled on 22 October 2026. [source-manifest.json](source-manifest.json) records the five original workspace JSON paths and SHA-256 hashes; those paths describe the collection workspace, not files promised in every checkout.

- Odds come from the SteamWatch archive URL stored in `provenance.oddsUrl`. The displayed series preserves price changes, their preceding quotes, and the first/last of 2,573 stored quotes. Pinnacle is identified only for the last quote. First/last recorded must not be relabelled opening/exact closing prices. Shared chart times use the device timezone; the adjacent quote labels use UTC.
- Form Lab uses cached Sportmonks results and non-penalty xG across 2025/26 and 2026/27. Venue filtering precedes selection of the last 5, 10 or 20 games. Missing xG is excluded from xG averages and shown through coverage, never filled with zero.
- Rolling xG uses Understat non-penalty xG. Earlier history supplies complete 5- or 10-game windows for the displayed 20 points. These estimates are not interchangeable with Sportmonks xG.
- The predictor uses each team's last 20 Understat matches before the fixture, with six-game recent form. Samples end on 19 September for Arsenal and 20 September for Leeds. The archived league baseline was computed on 3 October from 430 matches. The adapter uses penalty-equivalent values derived from total xG minus npxG so the existing model retains half of penalty xG; it does not invent penalty counts. Shot-quality and set-piece inputs are unavailable and their adjustments are skipped.

With no absence adjustment, the recorded current-code `runModel` output gives fair home/draw/away odds of **1.6525162793 / 3.9810679641 / 6.9602325459** (displayed as 1.65 / 3.98 / 6.96). This is a reconstruction, not an archived forecast or backtest. Absence scenarios are assumptions, not team news; differences from market prices do not establish a betting edge.

## Incumbent comparison

Compared `ProDemoPage.css` with `index.css`, `ProPage.css` and the shared `OddsChart.tsx`. The demo keeps navy/slate surfaces (`#0f172a`, `#1e293b`), slate borders (`#334155`), cyan controls, inherited Inter Tight and JetBrains Mono tabular figures. The shared odds chart is imported without modification. Demo headings scale from a 32–44px introduction to 23px panel headings (21px on mobile), with compact source text. These are local implementation values, not new global tokens.

At 1000px the market explanation moves below the chart; at 700px tabs become two columns and model inputs stack above results. Tables scroll within labelled, focusable regions. Controls retain visible focus and reduced-motion handling. Existing global backdrop and palette differences were preserved; this pass did not turn them into new rules or repair unrelated styling.

## Verification and evidence

The implementation handoff reports successful strict TypeScript/Vite/prerender build, snapshot/model checks, targeted ESLint and `git diff --check`. Repeat from `frontend`:

```sh
npm run build
node scripts/check-pro-demo.mjs
npx eslint src/pages/ProDemoPage.tsx src/model/proDemo.ts src/App.tsx src/components/PaywallOverlay.tsx src/pages/ProPage.tsx
```

Run `git diff --check` from the repository root. The dedicated script checks chronology, all 18 form-filter combinations, missing xG, complete rolling windows, nine absence scenarios, normalized probabilities, independent quarter-handicap settlement and public prerender output. It prints baseline prices for comparison; it does not certify predictive accuracy.

The local `.impeccable/review/` evidence (not committed) contains desktop 1440px and mobile 390px captures for all four tabs, plus `user-1272.png`. The handoff records exercised filters, rolling windows, absence/handicap changes and reset, with no page overflow. `finish-review.md` records the resolved product-documentation fix and its limited ship verdict; the original surface review reported no material UI defect. This documentation pass checked source and review records without repeating browser or build verification. Future UI changes should repeat the affected interactions and these viewports.
