# SteamWatch

## Product and audience

SteamWatch is a web application for casual and semi-professional football bettors researching matches and market prices. It brings together recorded odds movement, team performance statistics and model-derived baseline prices. Its tools support the user's own assessment; they do not establish or promise a profitable betting strategy.

## Core workflows

- Follow market movement and investigate the underlying match.
- Compare team form, venue splits and expected-goals performance.
- Estimate fair match prices with the existing Dixon–Coles predictor and inspect the effect of stated assumptions.
- Review historical steam results and team profit/loss records using their stated samples and settlement rules.

## Membership and public discovery

The existing Pro plan costs €19.99 per month and renews automatically. Public visitors can explore a fixed historical sample at `/pro/demo` before viewing the membership details at `/pro`. The demo does not grant access to subscriber data or change subscription entitlements.

## Durable experience constraints

Preserve the established SteamWatch visual identity: dark navy/slate surfaces, cyan emphasis, Inter Tight typography and tabular numerical displays. Prioritize usable research controls and readable evidence over decorative promotion. Preserve the shared odds chart unless a separate request explicitly changes it.

Keep source, sample and date boundaries explicit. Distinguish recorded market prices, historical results, reconstructed model outputs and hypothetical adjustments. Never describe a current-code reconstruction as an archived forecast, or a selected sample as proof of a betting edge.

The application serves desktop and mobile browsers. Core controls must remain keyboard accessible, and wide tables must scroll within their own regions rather than forcing page overflow.

## Current surface contract

The public Pro demo is an ordinary extension of the incumbent site. Its scope, direction and frozen-data contract are recorded in [the Pro demo brief](docs/pro-demo/brief.md). The brief describes the specific four-tool journey and must not be treated as a redesign of the rest of SteamWatch.
