"""
Map our canonical team names (The Odds API convention, same as
team_name_normalizer.py's targets) to ClubElo's naming
(api.clubelo.com) for the 98 teams currently in power_ratings.

Built by fetching ClubElo's full current snapshot (api.clubelo.com/
<today's date>, ~600 clubs worldwide) and diffing against our own
tracked team list — verified 2026-08-15, not guessed. 53 of 98 names
already match exactly (both sides converge on e.g. "Barcelona",
"Villarreal") and don't need an entry here; this dict covers the
other 45, mostly ClubElo's terser convention ("Man City" not
"Manchester City") and its German ö/ü -> oe/ue transliteration
("Koeln" not "Köln", matching "Fuerth"/"Nuernberg"/"Osnabrueck").

Girona, Mallorca and Oviedo were confirmed ABSENT from ClubElo's
snapshot entirely (not a naming mismatch — genuinely not in their
data) — teams not in this map either don't need translating or, if
they also don't hit an exact match, just don't get a ClubElo blend
(see power_ranking_fitter.py's graceful per-team fallback).
"""

OUR_NAME_TO_CLUBELO: dict[str, str] = {
    "1. FC Heidenheim": "Heidenheim",
    "1. FC Köln": "Koeln",
    "AC Milan": "Milan",
    "AS Monaco": "Monaco",
    "AS Roma": "Roma",
    "Alavés": "Alaves",
    "Atalanta BC": "Atalanta",
    "Athletic Bilbao": "Bilbao",
    "Atlético Madrid": "Atletico",
    "Bayer Leverkusen": "Leverkusen",
    "Bayern Munich": "Bayern",
    "Borussia Dortmund": "Dortmund",
    "Borussia Monchengladbach": "Gladbach",
    "Brighton and Hove Albion": "Brighton",
    "CA Osasuna": "Osasuna",
    "Celta Vigo": "Celta",
    "Eintracht Frankfurt": "Frankfurt",
    "Elche CF": "Elche",
    "FC St. Pauli": "St Pauli",
    "FSV Mainz 05": "Mainz",
    "Hamburger SV": "Hamburg",
    "Hellas Verona": "Verona",
    "Inter Milan": "Inter",
    "Leeds United": "Leeds",
    "Manchester City": "Man City",
    "Manchester United": "Man United",
    "Newcastle United": "Newcastle",
    "Nottingham Forest": "Forest",
    "Paris Saint Germain": "Paris SG",
    "RC Lens": "Lens",
    "Real Betis": "Betis",
    "Real Sociedad": "Sociedad",
    "SC Freiburg": "Freiburg",
    "SC Paderborn": "Paderborn",
    "Saint Etienne": "Saint-Etienne",
    "TSG Hoffenheim": "Hoffenheim",
    "Tottenham Hotspur": "Tottenham",
    "VfB Stuttgart": "Stuttgart",
    "VfL Wolfsburg": "Wolfsburg",
    "Werder Bremen": "Werder",
    "West Ham United": "West Ham",
    "Wolverhampton Wanderers": "Wolves",
}


def to_clubelo_name(our_name: str) -> str:
    """Best-guess ClubElo name for one of our canonical team names —
    the explicit mapping if we have one, otherwise assume the names
    already match (true for 53/98 teams as of the 2026-08-15 diff)."""
    return OUR_NAME_TO_CLUBELO.get(our_name, our_name)
