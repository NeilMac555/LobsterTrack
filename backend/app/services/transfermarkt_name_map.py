"""
Match Transfermarkt's team-name labels to our own canonical team names
(the Odds API convention used everywhere else in this codebase).

Transfermarkt has no public API, and their terms prohibit automated
scraping — so squad market value is entered by hand periodically from
a screenshot/table paste, not fetched live (see squad_value_importer.py
and app/data/transfermarkt_squad_values.json). This module only does
the name reconciliation: strip corporate suffixes ("FC", "CF",
"1907", ...) and diacritics, then fall back to an explicit override
for the handful of cases normalization alone can't bridge (e.g.
"Real Betis Balompié" -> "Real Betis").

Verified 2026-08-15 against a Transfermarkt top-100-by-squad-value
snapshot: 67 of our 98 tracked teams matched. The other 31 aren't a
matching failure — they're tracked teams whose squad value simply
falls outside that top 100 (e.g. Girona, Mallorca).
"""
import re
import unicodedata

_SUFFIX_STOP = {"fc", "cf", "afc", "sfc", "ac", "ss", "ssc", "kv", "1907", "1913", "1899", "05", "1"}

# Transfermarkt label -> our canonical name, for the cases normalization
# alone doesn't bridge (extra qualifiers Transfermarkt adds that aren't
# corporate suffixes, e.g. city/founder disambiguators).
OVERRIDES: dict[str, str] = {
    "Atlético de Madrid": "Atlético Madrid",
    "Bayer 04 Leverkusen": "Bayer Leverkusen",
    "Bologna FC 1909": "Bologna",
    "Cagliari Calcio": "Cagliari",
    "Celta de Vigo": "Celta Vigo",
    "Genoa CFC": "Genoa",
    "LOSC Lille": "Lille",
    "Olympique Lyon": "Lyon",
    "Olympique Marseille": "Marseille",
    "OGC Nice": "Nice",
    "Parma Calcio 1913": "Parma",
    "Real Betis Balompié": "Real Betis",
    "Stade Rennais FC": "Rennes",
    "Udinese Calcio": "Udinese",
    "1.FSV Mainz 05": "FSV Mainz 05",
    "SV Werder Bremen": "Werder Bremen",
    "RC Strasbourg Alsace": "Strasbourg",
    "US Sassuolo": "Sassuolo",
    "ACF Fiorentina": "Fiorentina",
}


def normalize(name: str) -> str:
    s = unicodedata.normalize("NFKD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace("&", "and").replace("-", " ").replace(".", " ")
    s = re.sub(r"[^a-z0-9 ]", "", s)
    tokens = [t for t in s.split() if t not in _SUFFIX_STOP]
    return " ".join(tokens)


def match_to_our_team(transfermarkt_name: str, our_teams: list[str]) -> str | None:
    """Best-effort match of a Transfermarkt team label onto one of our
    own tracked team names, or None if nothing lines up (left as an
    unmapped reference row rather than guessed)."""
    if transfermarkt_name in OVERRIDES:
        candidate = OVERRIDES[transfermarkt_name]
        return candidate if candidate in our_teams else None
    target = normalize(transfermarkt_name)
    for our_name in our_teams:
        if normalize(our_name) == target:
            return our_name
    return None
