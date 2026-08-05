"""
The forecast engine's source registry.

Every piece of information a forecast can draw on is declared here — the
engine has no generic web access, no scraping, no LLM. If a source isn't
in this list, a forecast cannot cite it, and the /forecast UI renders
exactly these nodes in its research-swarm view. That's the design
contract: controlled inputs, auditable outputs.

Tiers:
  1 = data we already ingest and trust (our own DB tables)
  2 = models we run ourselves (strength fit, Monte Carlo)

Adding a source means adding a collector in engine.py AND a row here —
the UI and the audit trail both key off this list.
"""

ENGINE_VERSION = "forecast-v1"

SOURCES: list[dict] = [
    {
        "id": "league_constants",
        "name": "League constants",
        "tier": 1,
        "detail": "avgGoalsPerTeam / homeAwayRatio computed weekly from our historical_matches (league_constants table)",
    },
    {
        "id": "standings",
        "name": "Season results ledger",
        "tier": 1,
        "detail": "Played matches + live table built from historical_matches (football-data.co.uk import)",
    },
    {
        "id": "strength_fit",
        "name": "Team strength model",
        "tier": 2,
        "detail": "Poisson attack/defence ratings fitted on a 4-season recency-weighted window",
    },
    {
        "id": "xg_form",
        "name": "npxG form (Understat)",
        "tier": 1,
        "detail": "Last-6 non-penalty xG for/against per team from xg_data",
    },
    {
        "id": "pinnacle",
        "name": "Pinnacle odds feed",
        "tier": 1,
        "detail": "Latest 1X2 snapshots for upcoming fixtures (The Odds API, Pinnacle-anchored)",
    },
    {
        "id": "polymarket",
        "name": "Polymarket prices",
        "tier": 1,
        "detail": "Match markets (polymarket_snapshots) + season-outright winner book (outright_snapshots, hourly Gamma fetch)",
    },
    {
        "id": "wages",
        "name": "Club wage bills",
        "tier": 1,
        "detail": "Premier League club-level wage bills from audited accounts (valuball.co / Companies House), snapshot in club_finances — a documented predictor of finishing position",
    },
    {
        "id": "steam",
        "name": "Steam move detector",
        "tier": 1,
        "detail": "Recent sharp-money moves on relevant fixtures from steam_moves",
    },
    {
        "id": "monte_carlo",
        "name": "Dixon-Coles season simulator",
        "tier": 2,
        "detail": "10,000 full-season Monte Carlo runs over every remaining fixture",
    },
]

SOURCE_IDS = {s["id"] for s in SOURCES}
