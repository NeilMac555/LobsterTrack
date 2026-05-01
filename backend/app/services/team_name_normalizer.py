"""
Map football-data.co.uk team names to the canonical names we use elsewhere
in SteamWatch (sourced from The Odds API, e.g. 'Manchester United' rather
than 'Man United', 'Inter Milan' rather than 'Inter').

Without this every team that football-data.co.uk abbreviates would show up
as a separate row in the Team P/L aggregation. Stuart sees 'Inter' with 5
home wins and 'Inter Milan' with 5 home wins — same team, silently split.

The mapping is hard-coded rather than fuzzy because:
  - football-data.co.uk's spellings are stable across decades.
  - Fuzzy matching would silently miss promoted-team variants and
    create the exact bug we're trying to avoid.

Per-league dicts keyed by The Odds API sport_key. If a new team is
promoted, add the entry. The importer refuses to write a match where a
team name is unmapped, so the build fails loudly rather than silently.
"""

# Premier League — every team that has appeared in the EPL across
# 2021/22 → 2025/26 plus a few likely returnees.
_EPL_MAP: dict[str, str] = {
    # Big six + perennial top half
    "Arsenal":          "Arsenal",
    "Aston Villa":      "Aston Villa",
    "Chelsea":          "Chelsea",
    "Liverpool":        "Liverpool",
    "Man City":         "Manchester City",
    "Man United":       "Manchester United",
    "Newcastle":        "Newcastle United",
    "Tottenham":        "Tottenham Hotspur",

    # Mid-table mainstays
    "Brentford":        "Brentford",
    "Brighton":         "Brighton and Hove Albion",
    "Bournemouth":      "Bournemouth",
    "Crystal Palace":   "Crystal Palace",
    "Everton":          "Everton",
    "Fulham":           "Fulham",
    "Nott'm Forest":    "Nottingham Forest",
    "West Ham":         "West Ham United",
    "Wolves":           "Wolverhampton Wanderers",

    # Recent promotions / relegations across the 5-season window
    "Burnley":          "Burnley",
    "Ipswich":          "Ipswich Town",
    "Leeds":            "Leeds United",
    "Leicester":        "Leicester City",
    "Luton":            "Luton Town",
    "Norwich":          "Norwich City",
    "Sheffield United": "Sheffield United",
    "Southampton":      "Southampton",
    "Sunderland":       "Sunderland",
    "Watford":          "Watford",
    "West Brom":        "West Bromwich Albion",
}

# Serie A — verified empirically against I1.csv (2025/26) and the
# /matches endpoint for soccer_italy_serie_a. Five names actually need
# renaming; the rest pass through identically.
_SERIE_A_MAP: dict[str, str] = {
    # Active 25/26 sides
    "Atalanta":     "Atalanta BC",
    "Bologna":      "Bologna",
    "Cagliari":     "Cagliari",
    "Como":         "Como",
    "Cremonese":    "Cremonese",
    "Fiorentina":   "Fiorentina",
    "Genoa":        "Genoa",
    "Inter":        "Inter Milan",
    "Juventus":     "Juventus",
    "Lazio":        "Lazio",
    "Lecce":        "Lecce",
    "Milan":        "AC Milan",
    "Napoli":       "Napoli",
    "Parma":        "Parma",
    "Pisa":         "Pisa",
    "Roma":         "AS Roma",
    "Sassuolo":     "Sassuolo",
    "Torino":       "Torino",
    "Udinese":      "Udinese",
    "Verona":       "Hellas Verona",

    # Recent visitors — present so a multi-season backfill won't drop them.
    # Best-effort; verify the canonical side via /api/matches before relying.
    "Empoli":       "Empoli",
    "Frosinone":    "Frosinone",
    "Monza":        "Monza",
    "Salernitana":  "Salernitana",
    "Sampdoria":    "Sampdoria",
    "Spezia":       "Spezia",
    "Venezia":      "Venezia",
}


# Lookup table keyed by The Odds API sport_key. La Liga / Bundesliga /
# Ligue 1 will land here as we extend coverage.
NAME_MAP_BY_LEAGUE: dict[str, dict[str, str]] = {
    "soccer_epl":            _EPL_MAP,
    "soccer_italy_serie_a":  _SERIE_A_MAP,
}


def normalize_team_name(raw: str, league_key: str) -> str | None:
    """
    Convert a football-data.co.uk team name to the SteamWatch canonical
    name for a given league.

    Returns None if we have no mapping — the importer treats this as a
    fatal error for the row rather than passing the raw name through,
    otherwise the aggregation will silently double-count.
    """
    if raw is None:
        return None
    mapping = NAME_MAP_BY_LEAGUE.get(league_key)
    if mapping is None:
        return None
    return mapping.get(raw.strip())
