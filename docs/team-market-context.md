# Team market history on match pages

The match-page panel gives bettors context for both teams immediately below the existing 1X2 chart. It extends the current navy/slate, cyan and Inter Tight interface. The chart, its controls and all membership rules stay intact. This is an Operate surface: a short summary first, with recent fixtures and an expandable history for evidence.

## Data contract

`GET /api/matches/{id}/market-context` is read-only. It uses recorded Pinnacle 1X2 snapshots, not the Telegram send ledger. The sample is completed matches in the same competition and season before the selected fixture (or now, if the fixture is upcoming). Archived fixtures therefore cannot expose later results as pre-match context.

- A meaningful move is at least 3 percentage points in raw implied probability versus the first valid tracked Pinnacle price, observed in the final 120 minutes before kickoff.
- First tracked is not a claim to be Pinnacle's original market opening.
- Prices must be pre-match, marked not in play, and from Pinnacle. There must be a later observation and a valid price within 30 minutes of kickoff.
- Each fixture is classified once: drift, shortening, both directions, little change, or incomplete prices. Repeated ticks and duplicate event IDs do not create extra matches.
- Both directions is separate. A late reversal does not erase an earlier qualifying excursion. Expanded rows show the peak qualifying move alongside first and last prices, which may differ from the peak.
- Completed status comes from exact fixture/date/competition results. Conflicting scores and known suspensions or postponements are excluded. Missing odds are shown as incomplete, never as no movement.
- Results are W/D/L for the named team, with the score in home–away order. These are descriptive results, not an executable price-based P/L strategy.

## Presentation and refresh

Both teams have identical summaries. Direction counts partition the tracked sample. A repeated-direction headline needs at least three observations and a higher count than the opposite direction. The newest five completed fixtures link to their match pages; missing odds remain visible. Expanding a team's history exposes opponent, venue, date, prices, movement and result. The methodology remains collapsed by default.

The panel loads independently from the existing chart and refreshes every 60 seconds while the page is visible. Returning to the page triggers a refresh. Requests are cancelled on navigation. Failures show a retry action; refresh failures retain the last loaded history with a visible warning.

## Scope and verification

No synthetic prices, alternative bookmakers, auto-generated causal claims, P/L claims or betting instructions. The existing graph is unchanged. Mobile uses stacked team sections with local scrolling for the expanded table. Text labels, keyboard-operable disclosures and focus styles accompany all colors.

Backend tests cover exact thresholds, the two-hour window, pre-match filtering, reversals, bookmaker isolation, missing and stale coverage, duplicate fixtures, score conflicts, competition and season boundaries, archived-match look-ahead, and recent-five ordering.
