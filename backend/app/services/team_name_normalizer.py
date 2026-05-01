"""
Map football-data.co.uk team names to the canonical names we use elsewhere
in SteamWatch (sourced from The Odds API, e.g. 'Manchester United' rather
than 'Man United').

Without this every team that football-data.co.uk abbreviates would show up
as a separate row in the Team P/L aggregation. Stuart sees "Man United"
with 5 home wins and "Manchester United" with 5 home wins — same team,
silently split.

The mapping is hard-coded rather than fuzzy because:
  - football-data.co.uk's spellings are stable — they have not changed
    in the 25+ years they've been publishing data.
  - Fuzzy matching would silently miss promoted-team variants (e.g.
    'Wolves' vs 'Wolverhampton Wanderers') and create the exact bug
    we're trying to avoid.

If a new team is promoted to the EPL or another league is added, add
the entry here. The importer will refuse to write a match where a team
name is unmapped, so the build fails loudly rather than silently.
"""

# Football-data.co.uk team name (left) → SteamWatch canonical (right).
# Coverage: every team that has appeared in the EPL across 2021/22 → 2025/26
# and a few likely returnees (Leicester, Southampton, etc.).
FOOTBALL_DATA_TO_CANONICAL: dict[str, str] = {
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


def normalize_team_name(raw: str) -> str | None:
    """
    Convert a football-data.co.uk team name to the SteamWatch canonical name.

    Returns None if we have no mapping for this name — the importer should
    treat this as a fatal error for the row rather than passing the raw name
    through, otherwise the aggregation will silently double-count.
    """
    if raw is None:
        return None
    return FOOTBALL_DATA_TO_CANONICAL.get(raw.strip())
