# Public Pro demo implementation

The public `/pro/demo` route implements the twelve-card gallery in the [surface brief](brief.md), subject to the root [product context](../../PRODUCT.md). It extends SteamWatch's incumbent interface. No new design system, `DESIGN.md` or design sidecar was created.

## Ownership and maintenance

- `frontend/src/pages/ProDemoPage.tsx` owns the three horizontal rows, category anchors, card previews, controls, source disclosure and membership links. Its stylesheet owns only the demo presentation. Legacy `?tool=` URLs render the complete gallery; they do not select a tab.
- `frontend/src/model/proDemo.ts` supplies existing form summaries, rolling windows and historical model inputs. The model card calls the unchanged `runModel` in `valorModel.ts`. Form controls do not alter predictor inputs.
- `frontend/src/data/proDemo.json` contains the existing Arsenal–Leeds sample; `frontend/src/data/proDemoCards.json` supplies the additional market, team and manager examples. Both are bundled locally, with no runtime subscriber-data fetch or entitlement change.
- Route registration is in `App.tsx` and `routes.json`; static metadata/content are in `scripts/prerender-blog.mjs`. Keep client and prerender copy consistent. Discovery links appear on `/pro`, paywalls and the footer; the shared layout supplies demo-specific historical wording.

Refresh samples only as a deliberate data change. Update the snapshot, provenance, [source manifest](source-manifest.json), dated card copy and validation expectations together. Preserve pre-kickoff cutoffs, chronology, unique matches, complete rolling windows and stated sample/settlement boundaries. If shared model code changes, recalculate and record the reconstruction.

## Gallery and controls

The short introduction and membership link lead to category shortcuts, then three independent horizontal rows. Each card contains a tool name, short benefit, actual data preview, PRO/FREE badge, sample boundary and link to the existing tool. Membership links open `/pro`; the demo does not start checkout. The price is **€19.99 per month, renewing automatically**.

| Row | Card | Access and current interaction |
| --- | --- | --- |
| Read the market | Steam moves | Pro; three teams ranked by settled qualifying move count, with W/D/L and P/L. |
| Read the market | Drifter records | Pro; equivalent drift record, retaining negative returns. |
| Read the market | Favourite–longshot bias | Pro full access; switch Manchester United/Arsenal to compare favourite/underdog returns, wins and bet counts. Arsenal's two-bet underdog sample has an explicit warning. |
| Read the market | Odds movement | Free; switch Arsenal/Leeds to change the archived series and first/last recorded prices. |
| Read the market | Closing lines | Free; Bayern Munich–Arsenal's last recorded Pinnacle 1X2 prices before 21 October 2026 kick-off. |
| Build your view | Form Lab | Pro; last 5, 10 or 20 matches for both teams' W/D/L and average npxG difference. All venues are fixed in this card. |
| Build your view | Rolling xG | Pro; switch Arsenal/Leeds. Fixed five-game window, 20 match points and latest for/against values. |
| Build your view | Dixon–Coles model | Pro; No adjustment, Weakened or Severely weakened Arsenal scenarios recalculate fair 1X2 odds. Leeds and other model settings stay fixed. |
| Go a little deeper | Team profit & loss | Free; Arsenal All games/Home/Away records, including P/L, bets, wins and ROI. |
| Go a little deeper | Club ratings | Free; top three clubs, ratings and rank changes. |
| Go a little deeper | Manager ratings | Pro; three public preview entries with club and accumulated impact. The full-tool link reloads the document. |
| Go a little deeper | Goals coming soon? | Free; Mainz 05 goals/xG comparison and shortfall, without a promised rebound. |

Defaults are Manchester United bias, Arsenal odds, 20-match form, Arsenal rolling xG, no model adjustment and all-game P/L. Selecting **No adjustment** restores the model baseline. The gallery has no separate Reset button, handicap selector, form venue control or rolling-window control.

Rows support native touch/trackpad scrolling and labelled previous/next buttons that move one card and disable at row ends. Each track is a focusable, labelled region with scroll snapping and a polite announcement of its leading card. Category links jump to rows. There is no autoplay. One collapsed “About these samples & calculations” disclosure holds methodology below the final membership link.

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

Compared the demo source/styles with `index.css`, `ProPage.tsx` and `ProPage.css`. The gallery retains navy/slate surfaces, cyan actions/focus, inherited Inter Tight, JetBrains Mono table/ranking values, tabular figures and restrained green/red results. Shared model logic and the shared match odds chart remain unchanged; the gallery uses its own compact SVG previews from bundled data.

The local container is at most 1216px wide. Rows use 16px gaps and fit three cards on wide desktop. At 1100px and below, fractional card widths reveal the next card; at 760px and below, cards occupy 88% of the track, capped at 370px. Mobile stacks the introduction and final membership area. Horizontal scrolling stays within each row. Card surfaces (`#192638`), borders (`#35465a`) and 14px corners are local implementation values, not global tokens.

Introduction type uses a 32–41.6px clamp, overridden to 35px on mobile. Row headings are 23px/21px and card headings 21px/20px. Controls retain a 2px cyan focus outline, selected-state `aria-pressed` semantics and a native labelled scenario select. Reduced motion disables local transitions and makes arrow scrolling immediate. Existing global backdrop/palette differences are preserved without becoming new system rules.

## Verification and evidence

The final implementation handoff reports passing TypeScript/Vite/prerender build, snapshot/model checks, targeted ESLint and whitespace checks. Repeat the main checks from `frontend`:

```sh
npm run build
node scripts/check-pro-demo.mjs
npx eslint src/pages/ProDemoPage.tsx src/model/proDemo.ts src/App.tsx src/components/PaywallOverlay.tsx src/pages/ProPage.tsx
```

Run `git diff --check` from the repository root. The data script checks chronology, unique pre-match rows, all 18 helper form-filter combinations, missing-xG handling, five-/ten-game helper windows, nine absence combinations, probability normalization and independent quarter-handicap settlement. These broader helper checks do not imply that every option is exposed in the gallery. It also checks movement totals/rates, bias returns, venue P/L reconciliation, goals shortfall, pre-kick-off closing data, three-manager public preview and public prerender output. Baseline prices do not certify predictive accuracy.

Current local evidence in `.impeccable/review/` is `cards-desktop.png`, `cards-desktop-last.png`, `cards-mobile.png` and `cards-1272.png`, covering wide desktop, row ends, 390px mobile and the 1272px layout. `cards-finish-review.md` records **disposition: ship**, with no material fixes; `cards-detector.json` is empty. Review/handoff evidence covers row ends and card controls, including the small-sample warning, Leeds odds/xG states, negative away P/L and severe model scenario, with no mobile page overflow or wide-desktop preview overflow. Earlier four-tab captures are superseded.

This bounded documentation pass checked source and review records without repeating browser or build verification. Future UI changes should repeat affected interactions and responsive views.
