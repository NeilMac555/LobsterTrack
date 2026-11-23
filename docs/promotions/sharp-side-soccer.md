# Sharp Side Soccer referral

Finish review disposition: **ship** (23 November 2026). All material issues in this local referral scope are cleared. Plausible dashboard configuration remains outstanding; this record does not assert deployment or confirmed production event receipt.

The approved treatment is an understated invitation to Neil Mac and Will White's selections and match analysis. Sharp Side Soccer is a separate service and subscription from SteamWatch Pro. There is **no annual bundle**. The extension inherits SteamWatch's slate surfaces, cyan emphasis and Inter Tight typography, as established in [PRODUCT.md](../../PRODUCT.md); it introduces no new design system or `DESIGN.md`.

## Placements

| Surface | Position and treatment | Tracking placement |
| --- | --- | --- |
| Homepage | Compact card above fixtures, on the overview without a selected league | `homepage` |
| Pro | Compact card below pricing, before membership features; explicitly states the separate subscription | `pro` |
| Match Predictor | Context link beneath the public worked example before calculation; below the result once calculated | `predictor` |
| Closing Lines | Context link after the public summary and before the data section | `closing-lines` |
| Dropping Odds | Context link after the introduction and before the biggest drops | `dropping-odds` |

`frontend/src/components/SharpSideSoccer.tsx` owns the cards, contextual links, destination URL and click handler. `frontend/scripts/prerender-blog.mjs` renders that same component into initial HTML and generates `frontend/dist/data/sharp-side-soccer.json`. The dynamic backend Dropping Odds renderer reads its `dropping-odds` fragment, keeping the server response aligned with the frontend component.

## Tracking

Website links use:

```text
https://www.sharpsidesoccer.com/?utm_source=steamwatch&utm_medium=referral&utm_campaign=sharpsidesoccer_launch&utm_content=<placement>
```

The React click handler calls `plausible('Sharp Side Soccer Click', { props: { placement } })`, with the exact placement values listed above. Analytics failure does not prevent ordinary link navigation. Links open in a new tab, with an accessible announcement and visible keyboard focus.

## QA evidence

The completed implementation and finish review recorded:

- Frontend production build passed. The new component is lint-clean; existing page lint findings are unchanged.
- Desktop and genuine 390px iframe responsive captures passed the bounded visual review.
- Keyboard activation invoked the expected Plausible event and placement property.
- Initial HTML anchor checks and the dynamic backend fragment check passed.

Local screenshots are in `C:/Users/filth/Documents/Codex/2026-09-04/you/work/sharp-side-referral-2026-11-23/`: homepage, Pro and contextual desktop/mobile captures, plus Predictor and Dropping Odds desktop captures. This documentation pass checked the component and placement source, shared prerender/backend fragment path, screenshot inventory, homepage mobile capture and Pro desktop capture. It did not rerun the completed build or interaction checks.

## Remaining Plausible setup

The dashboard requires login, so the custom event goal has not been configured. In the SteamWatch site's Plausible settings, open **Goals → Add goal**, select **Custom event**, and enter **Sharp Side Soccer Click** exactly. Then verify a production click and its `placement` property in the dashboard.

Plausible requires a matching goal before events appear in its dashboard. Events already received before goal creation count within the selected date range once the goal exists. See [Plausible's custom event documentation](https://plausible.io/docs/custom-event-goals).

## Telegram pin draft — not posted

SteamWatch alerts flag recorded pre-match market movement. Prices can change after an alert.

Want Neil Mac and Will White's football selections and match analysis? Explore [Sharp Side Soccer](https://www.sharpsidesoccer.com/?utm_source=steamwatch&utm_medium=telegram&utm_campaign=sharpsidesoccer_launch&utm_content=pinned-message).

Their editorial selections are a separate service from this market-alert stream and from SteamWatch Pro.
