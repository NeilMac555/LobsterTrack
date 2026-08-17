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

    # Promoted 26/27 — canonical names verified against the live
    # /api/matches feed for soccer_epl, football-data keys against
    # E1.csv (25/26).
    "Coventry":         "Coventry City",
    "Hull":             "Hull City",
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


# La Liga — verified against SP1.csv (25/26) and the
# /matches endpoint for soccer_spain_la_liga. football-data.co.uk uses
# heavy abbreviations ("Ath Madrid", "Vallecano", "Sociedad"); the
# canonical names use proper Spanish/Basque/Catalan spellings with
# diacritics ("Atlético Madrid", "Rayo Vallecano", "Real Sociedad").
_LA_LIGA_MAP: dict[str, str] = {
    # Active 25/26 sides
    "Alaves":       "Alavés",
    "Ath Bilbao":   "Athletic Bilbao",
    "Ath Madrid":   "Atlético Madrid",
    "Barcelona":    "Barcelona",
    "Betis":        "Real Betis",
    "Celta":        "Celta Vigo",
    "Elche":        "Elche CF",
    "Espanol":      "Espanyol",
    "Getafe":       "Getafe",
    "Girona":       "Girona",
    "Levante":      "Levante",
    "Mallorca":     "Mallorca",
    "Osasuna":      "CA Osasuna",
    "Oviedo":       "Oviedo",
    "Real Madrid":  "Real Madrid",
    "Sevilla":      "Sevilla",
    "Sociedad":     "Real Sociedad",
    "Valencia":     "Valencia",
    "Vallecano":    "Rayo Vallecano",
    "Villarreal":   "Villarreal",

    # Recent visitors — added so a multi-season backfill won't drop them.
    # Best-effort canonical guesses; verify via /api/matches before relying.
    "Almeria":      "Almería",
    "Cadiz":        "Cádiz CF",
    "Granada":      "Granada CF",
    "Las Palmas":   "Las Palmas",
    "Leganes":      "Leganés",
    "Valladolid":   "Real Valladolid",

    # Promoted 26/27 — canonical names verified against the live
    # /api/matches feed for soccer_spain_la_liga, football-data keys
    # against SP2.csv (25/26). Yes, The Odds API really does use the
    # full "Real Racing Club de Santander".
    "Santander":    "Real Racing Club de Santander",
    "La Coruna":    "Deportivo La Coruña",
    "Malaga":       "Málaga",
}


# Bundesliga — verified against D1.csv (25/26) and the
# /matches endpoint for soccer_germany_bundesliga. Canonical names
# keep the proper "1. FC Köln" formatting (with umlaut on Köln, none on
# Monchengladbach — TheOddsAPI is inconsistent and we mirror it).
_BUNDESLIGA_MAP: dict[str, str] = {
    # Active 25/26 sides
    "Augsburg":       "Augsburg",
    "Bayern Munich":  "Bayern Munich",
    "Dortmund":       "Borussia Dortmund",
    "Ein Frankfurt":  "Eintracht Frankfurt",
    "FC Koln":        "1. FC Köln",
    "Freiburg":       "SC Freiburg",
    "Hamburg":        "Hamburger SV",
    "Heidenheim":     "1. FC Heidenheim",
    "Hoffenheim":     "TSG Hoffenheim",
    "Leverkusen":     "Bayer Leverkusen",
    "Mainz":          "FSV Mainz 05",
    "M'gladbach":     "Borussia Monchengladbach",
    "RB Leipzig":     "RB Leipzig",
    "St Pauli":       "FC St. Pauli",
    "Stuttgart":      "VfB Stuttgart",
    "Union Berlin":   "Union Berlin",
    "Werder Bremen":  "Werder Bremen",
    "Wolfsburg":      "VfL Wolfsburg",

    # Recent visitors
    "Bochum":         "VfL Bochum",
    "Darmstadt":      "SV Darmstadt 98",
    "Hertha":         "Hertha Berlin",

    # Promoted 26/27 — canonical names verified against the live
    # /api/matches feed for soccer_germany_bundesliga, football-data
    # keys against D2.csv (25/26). Schalke's canonical changed from
    # our old best-effort "Schalke 04": The Odds API serves their
    # 26/27 fixtures as "FC Schalke 04", and matching the odds side
    # matters more than matching their old 22/23 rows (which keep the
    # old name in historical_matches — the UI only shows the current
    # season, but a manual 2223 re-import would now write duplicate
    # Schalke rows under the new name; migrate the old rows first if
    # that backfill is ever re-run).
    "Schalke 04":     "FC Schalke 04",
    "Paderborn":      "SC Paderborn",
    "Elversberg":     "Elversberg",
}


# Ligue 1 — verified against F1.csv (25/26) and /matches for
# soccer_france_ligue_one. Only 3 names need rewriting; the rest of the
# division is clean.
_LIGUE_1_MAP: dict[str, str] = {
    # Active 25/26 sides
    "Angers":       "Angers",
    "Auxerre":      "Auxerre",
    "Brest":        "Brest",
    "Le Havre":     "Le Havre",
    "Lens":         "RC Lens",
    "Lille":        "Lille",
    "Lorient":      "Lorient",
    "Lyon":         "Lyon",
    "Marseille":    "Marseille",
    "Metz":         "Metz",
    "Monaco":       "AS Monaco",
    "Nantes":       "Nantes",
    "Nice":         "Nice",
    "Paris FC":     "Paris FC",
    "Paris SG":     "Paris Saint Germain",
    "Rennes":       "Rennes",
    "Strasbourg":   "Strasbourg",
    "Toulouse":     "Toulouse",

    # Recent visitors
    "Bordeaux":     "Bordeaux",
    "Clermont":     "Clermont Foot",
    "Montpellier":  "Montpellier",
    "Reims":        "Reims",
    "St Etienne":   "Saint Etienne",
    "Troyes":       "Troyes",

    # Promoted 26/27 — canonical name verified against the live
    # /api/matches feed for soccer_france_ligue_one, football-data key
    # against F2.csv (25/26).
    "Le Mans":      "Le Mans FC",
}


# Lookup table keyed by The Odds API sport_key.
NAME_MAP_BY_LEAGUE: dict[str, dict[str, str]] = {
    "soccer_epl":                _EPL_MAP,
    "soccer_italy_serie_a":      _SERIE_A_MAP,
    "soccer_spain_la_liga":      _LA_LIGA_MAP,
    "soccer_germany_bundesliga": _BUNDESLIGA_MAP,
    "soccer_france_ligue_one":   _LIGUE_1_MAP,
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
