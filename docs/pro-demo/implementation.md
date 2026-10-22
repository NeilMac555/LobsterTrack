# Public Pro demo implementation

The public `/pro/demo` route implements the twelve-tool, single-card carousel in the [surface brief](brief.md), subject to the root [product context](../../PRODUCT.md). It preserves the user's pinned Form Lab card treatment and extends SteamWatch's incumbent interface. No new design system, `DESIGN.md` or design sidecar was created.

## Ownership and maintenance

- `frontend/src/pages/ProDemoPage.tsx` owns the active card, previous/next arrows, native tool picker, card controls, source disclosure and membership link. Its stylesheet owns only the demo presentation. The `?tool=` query selects the current card; an absent or unrecognized value shows Form Lab. Navigation replaces the current history entry, preserves other query parameters and prevents scroll reset.
- `frontend/src/model/proDemo.ts` supplies existing form summaries, rolling windows and historical model inputs. The model card calls the unchanged `runModel` in `valorModel.ts`. Form controls do not alter predictor inputs.
- `frontend/src/data/proDemo.json` contains the existing Arsenal–Leeds sample; `frontend/src/data/proDemoCards.json` supplies the additional market, team and manager examples. Both are bundled locally, with no runtime subscriber-data fetch or entitlement change.
- Route registration is in `App.tsx` and `routes.json`; static metadata/content are in `scripts/prerender-blog.mjs`. Keep client and prerender copy consistent. Discovery links appear on `/pro`, paywalls and the footer; the shared layout supplies demo-specific historical wording.

Refresh samples only as a deliberate data change. Update the snapshot, provenance, [source manifest](source-manifest.json), dated card copy and validation expectations together. Preserve pre-kickoff cutoffs, chronology, unique matches, complete rolling windows and stated sample/settlement boundaries. If shared model code changes, recalculate and record the reconstruction.

## Carousel and controls

The short introduction and membership link lead to a labelled native tool picker and one centered card. Exactly one preview is mounted at a time. Each card contains a tool name, short benefit, actual data preview, PRO/FREE badge, sample boundary and link to the existing tool. The membership link opens `/pro`; the demo does not start checkout. The price is **€19.99 per month, renewing automatically**.

| Order | Card (`?tool=` value) | Access and current interaction |
| --- | --- | --- |
| 1 | Form Lab (`form`) | Pro; last 5, 10 or 20 matches for both teams' W/D/L and average npxG difference. All venues are fixed in this card. |
| 2 | Steam moves (`steam`) | Pro; three teams ranked by settled qualifying move count, with W/D/L and P/L. |
| 3 | Drifter records (`drifters`) | Pro; equivalent drift record, retaining negative returns. |
| 4 | Favourite–longshot bias (`bias`) | Pro full access; switch Manchester United/Arsenal to compare favourite/underdog returns, wins and bet counts. Arsenal's two-bet underdog sample has an explicit warning. |
| 5 | Rolling xG (`xg`) | Pro; switch Arsenal/Leeds. Fixed five-game window, 20 match points and latest for/against values. |
| 6 | Dixon–Coles model (`model`) | Pro; No adjustment, Weakened or Severely weakened Arsenal scenarios recalculate fair 1X2 odds. Leeds and other model settings stay fixed. |
| 7 | Manager ratings (`managers`) | Pro; three public preview entries with club and accumulated impact. The full-tool link reloads the document. |
| 8 | Odds movement (`market`) | Free; switch Arsenal/Leeds to change the archived series and first/last recorded prices. |
| 9 | Closing lines (`closing`) | Free; Bayern Munich–Arsenal's last recorded Pinnacle 1X2 prices before 21 October 2026 kick-off. |
| 10 | Team profit & loss (`pnl`) | Free; Arsenal All games/Home/Away records, including P/L, bets, wins and ROI. |
| 11 | Club ratings (`ratings`) | Free; top three clubs, ratings and rank changes. |
| 12 | Goals coming soon? (`goals`) | Free; Mainz 05 goals/xG comparison and shortfall, without a promised rebound. |

Defaults are 20-match form, Manchester United bias, Arsenal rolling xG, no model adjustment, Arsenal odds and all-game P/L. A card's local controls reset to these defaults when it is revisited because the previous preview is unmounted. Selecting **No adjustment** also restores the model baseline. The carousel has no separate Reset button, handicap selector, form venue control or rolling-window control.

Labelled previous/next buttons move one card and disable at the first/last card; there is no wraparound or autoplay. The carousel and its focusable active slide have accessible labels, and a polite live region announces the current position and tool name. When the slide container itself is focused, Left/Right move one card and Home/End select the first/last card; keyboard events from nested controls remain with those controls. A single-finger horizontal swipe changes cards after a 50px threshold and must be more horizontal than vertical. Swipes beginning on a button, select or link are ignored; vertical panning and pinch zoom remain enabled. The picker jumps directly to any card. One collapsed “About these samples & calculations” disclosure holds methodology beneath the carousel.

## Data and calculation boundaries

Examples were captured on 22 October 2026. `source-manifest.json` retains five original workspace JSON paths/hashes for `proDemo.json` and nine dated source URLs/hashes for `proDemoCards.json`. Workspace paths describe collection provenance, not files promised in every checkout.

- Steam/drifter examples are the top three by settled move count, not profit, across tracked 2026/27 competitions. Qualifying moves are at least 3 percentage points in raw implied probability during the final two hours before kick-off; the largest observed move per match/side is retained. Returns use a 1-unit stake at that recorded price, with draws losing. This is a descriptive record, not the Telegram ledger or an executable strategy backtest.
- Favourite–longshot examples use the 2025/26 Premier League and recorded market prices. Arsenal P/L uses available records from 12 February 2026 to capture date and 1-unit stakes. Retain losses, sample counts and small-sample warnings.
- Odds/form/xG/model examples use Arsenal–Leeds United, 10 October 2026 at 11:30 UTC. The odds snapshot preserves price changes, preceding quotes and the first/last of 2,573 stored quotes. Only the last quote's bookmaker is identified as Pinnacle. The compact chart spaces retained values in sequence, with endpoint dates; it is not an elapsed-time axis. First/last recorded must not be relabelled opening/exact closing prices.
- Form uses cached Sportmonks npxG across 2025/26 and 2026/27; its helper excludes missing xG from averages. Preserve meaningful coverage when refreshing the displayed differences. Rolling xG uses Understat npxG and earlier history for complete five-game windows. The providers' estimates are not interchangeable.
- Model inputs are each team's last 20 pre-fixture Understat matches, with six-game recent form. Arsenal/Leeds samples end on 19/20 September respectively. The archived league baseline was computed on 3 October from 430 matches. Penalty-equivalent inputs derived from total xG minus npxG preserve the existing half-penalty-xG treatment without inventing penalty counts. Unavailable shot-quality and set-piece adjustments are skipped.
- Weakened/severe scenarios lower Arsenal's scoring rate by 6%/12% and raise Leeds' by the same percentage. These are hypothetical assumptions, not team news. Other settings and the archived league baseline remain fixed.
- Closing lines are the last recorded pre-kick-off quote, labelled one minute before kick-off, not a guarantee of exact market close. Club/manager snapshots are dated 19 October 2026; manager impact is an accumulated measure, not a causal estimate. Mainz's goals/xG example covers 33 matches over the stated twelve-month sample to October 2026.

With no absence adjustment, the recorded current-code fair home/draw/away odds are **1.6525162793 / 3.9810679641 / 6.9602325459** (displayed 1.65 / 3.98 / 6.96). These are reconstructed prices, not archived forecasts or a backtest. Fair odds exclude bookmaker margin; past returns and differences from market prices do not establish a future betting edge.

## Incumbent comparison

The demo source/styles retain the incumbent navy/slate surfaces, cyan actions/focus, inherited Inter Tight, JetBrains Mono table/ranking values, tabular figures and restrained green/red results. Shared model logic and the shared match odds chart remain unchanged; the carousel uses its own compact SVG previews from bundled data. This documentation pass checked `ProDemoPage.tsx`, `ProDemoPage.css` and the global `index.css` against the surface contract.

The local page container is at most 980px wide; the centered carousel is at most 664px. Desktop uses a card up to 520px wide, flanked by 48px circular arrows with 24px horizontal gaps. At 760px and below, the carousel is at most 520px wide, the card spans the available width, and arrows move underneath beside progress. The introduction stacks on mobile. Card surfaces (`#192638`), borders (`#35465a`), 14px corners and a 394px minimum height preserve the pinned treatment as local implementation values, not global tokens. Card content uses 26px horizontal insets on desktop and 20px on mobile.

Introduction type uses `clamp(1.8rem, 3vw, 2.25rem)`, overridden to 30px on mobile. Card headings are 25px, 23px at 760px and below, and 21px at 360px and below. Benefit text is 14px; table labels and sample notes range from 10px to 13px. Controls retain a 2px cyan focus outline, selected-state `aria-pressed` semantics and native labelled selects. Card changes use a 220ms horizontal entrance from 12px; reduced motion disables local animation and transitions. Existing global backdrop/palette differences are preserved without becoming new system rules.

## Verification and evidence

The final implementation handoff reports passing TypeScript/Vite/prerender build, snapshot/model checks, targeted ESLint and whitespace checks. Repeat the main checks from `frontend`:

```sh
npm run build
node scripts/check-pro-demo.mjs
npx eslint src/pages/ProDemoPage.tsx src/model/proDemo.ts src/App.tsx src/components/PaywallOverlay.tsx src/pages/ProPage.tsx
```

Run `git diff --check` from the repository root. The data script checks chronology, unique pre-match rows, all 18 helper form-filter combinations, missing-xG handling, five-/ten-game helper windows, nine absence combinations, probability normalization and independent quarter-handicap settlement. These broader helper checks do not imply that every option is exposed in the carousel. It also checks movement totals/rates, bias returns, venue P/L reconciliation, goals shortfall, pre-kick-off closing data, three-manager public preview and public prerender output. Baseline prices do not certify predictive accuracy.

Current local evidence in `.impeccable/review/` is `slides-desktop.png`, `slides-mobile.png`, `slides-1272.png` and `slides-mobile-model.png`. `slides-checks.md` records passing build, snapshot/model, targeted ESLint and whitespace checks; sequential navigation through all twelve cards with exactly one mounted at each step; disabled endpoint arrows; Home navigation; picker selection; the severe model scenario (1.88 / 3.57 / 5.30); and the five-match form sample. The record reports no document overflow at 1440×900, 390×844 and actual 1280×720. Physical touchscreen swiping was not exercised by desktop automation; the touch implementation was inspected. `slides-detector.json` contains an empty array. Earlier gallery and tab captures and their review dispositions are superseded.

The carousel finish review identified stale product/implementation documentation as its required fix. This pass reconciles those documents with the current brief, code and checks without changing the interface. It does not substitute a new visual review or claim a post-documentation ship disposition.

This bounded documentation pass checked source and review records without repeating browser or build verification. Future UI changes should repeat affected interactions and responsive views.
