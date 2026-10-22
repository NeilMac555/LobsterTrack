# Public Pro demo: click-through feature cards

## Direction contract
Mode: Persuade. Code-led extension of SteamWatch's existing navy/slate/cyan identity.

The user rejected the four-tool, single-match walkthrough as ugly and text-heavy. The user then rejected the three-row gallery as a page of boxes. Their pinned reference is the existing Form Lab card: one such card at a time, with arrows to click through all available features. This brief supersedes both previous compositions; real data and the existing predictor remain authoritative.

THESIS: Show the tool doing one useful thing, with one short benefit and a route to the full tool.
FIRST VIEWPORT: Short invitation, membership link, a tool picker, and one centered Form Lab card. Visible previous/next arrows and current/total progress. No gallery, feature grid or rows of cards.
STRUCTURE: One active card out of twelve. Pro cards first, starting with Form Lab, followed by the free tools. Desktop arrows flank the card; mobile arrows sit underneath beside progress. Swipe, keyboard navigation and a labelled native jump selector. No autoplay; arrows disable at the ends.
SIGNATURE INTERACTION: Small controls inside the cards change the actual sample: favourite/underdog team, form sample size, xG team, odds outcome, home/away P/L, or hypothetical absence scenario. Model scenarios call the unchanged shared predictor.
MOTION: Brief horizontal entrance on card changes, disabled for reduced motion. Card and navigation stay in stable positions.
IDENTITY: Established Inter Tight, slate panels, cyan links; real compact tables and charts with restrained red/green outcomes. Avoid ornamental imagery and paragraphs inside every card.

## Coverage and access
Twelve cards: Steam moves (Pro), Drifter records (Pro), Favourite–longshot bias (Pro full access), Odds movement (free), Closing lines (free), Form Lab (Pro), Rolling xG (Pro), Dixon–Coles model (Pro), Team P/L (free), Club ratings (free), Manager ratings (Pro), Goals coming soon (free). Existing tool preview rules remain unchanged. Membership €19.99/month, automatic renewal. No checkout initiated.

## Data contract
Frozen public examples in proDemo.json and proDemoCards.json, captured 22 October 2026. No runtime subscriber-data fetches, no entitlement changes. Every card carries sample boundaries; one collapsed source/methodology section holds detail. Returns retain losses and sample counts. Steam and drifter examples are the top three by move count, not selected by profit. Largest qualifying move per match/side in final 2h, at least 3pp; not the Telegram ledger or an executable strategy backtest. Historical reconstructed model outputs are not archived forecasts.

## Scope boundary
Only the public demo and its discovery/metadata/docs change. Shared match charts, model calculations, live feeds, prices, membership entitlements and other research pages are unchanged. The ?tool= query selects the active card; unknown or absent values start with Form Lab. Only the active preview is mounted; its sample controls reset when revisited.
