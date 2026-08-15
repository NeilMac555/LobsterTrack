"""
Regenerate app/data/transfermarkt_squad_values.json — the committed
squad-market-value snapshot shown (informationally only) on the Power
Rankings page.

Provenance: Transfermarkt has no public API and their terms prohibit
automated scraping, so there is no fetch step here — this script just
holds the manually-transcribed table (from a Transfermarkt "most
valuable clubs" screenshot) and re-runs the name matching against our
own tracked team list, so re-running it after editing TM_ROWS below
regenerates the JSON deterministically rather than hand-editing it.

Usage:  python backend/scripts/refresh_squad_values.py
        (writes the JSON in place; review the diff before committing)

To refresh with a newer table: replace TM_ROWS with the new paste,
update CAPTURED_AT, rerun, review the unmatched-team log this script
prints, then reload it on prod via POST /admin/load-squad-values.
"""
import json
import os

from app.services.transfermarkt_name_map import match_to_our_team

CAPTURED_AT = "2026-08-15"
SOURCE = "Transfermarkt (transfermarkt.com), 'most valuable clubs' ranking — manually transcribed, no API available"

# Our own tracked team names (power_ratings), as of the date above —
# see backend/app/services/clubelo_name_map.py's module docstring for
# how this list was last pulled from production.
OUR_TEAMS = [
    "1. FC Heidenheim", "1. FC Köln", "AC Milan", "Alavés", "Angers", "Arsenal",
    "AS Monaco", "AS Roma", "Aston Villa", "Atalanta BC", "Athletic Bilbao",
    "Atlético Madrid", "Augsburg", "Auxerre", "Barcelona", "Bayer Leverkusen",
    "Bayern Munich", "Bologna", "Borussia Dortmund", "Borussia Monchengladbach",
    "Bournemouth", "Brentford", "Brest", "Brighton and Hove Albion", "Burnley",
    "Cagliari", "CA Osasuna", "Celta Vigo", "Chelsea", "Como", "Cremonese",
    "Crystal Palace", "Eintracht Frankfurt", "Elche CF", "Espanyol", "Everton",
    "FC St. Pauli", "Fiorentina", "FSV Mainz 05", "Fulham", "Genoa", "Getafe",
    "Girona", "Hamburger SV", "Hellas Verona", "Inter Milan", "Juventus", "Lazio",
    "Lecce", "Leeds United", "Le Havre", "Levante", "Lille", "Liverpool", "Lorient",
    "Lyon", "Mallorca", "Manchester City", "Manchester United", "Marseille", "Metz",
    "Nantes", "Napoli", "Newcastle United", "Nice", "Nottingham Forest", "Oviedo",
    "Paris FC", "Paris Saint Germain", "Parma", "Pisa", "Rayo Vallecano",
    "RB Leipzig", "RC Lens", "Real Betis", "Real Madrid", "Real Sociedad", "Rennes",
    "Saint Etienne", "Sassuolo", "SC Freiburg", "SC Paderborn", "Sevilla",
    "Strasbourg", "Sunderland", "Torino", "Tottenham Hotspur", "Toulouse",
    "TSG Hoffenheim", "Udinese", "Union Berlin", "Valencia", "VfB Stuttgart",
    "VfL Wolfsburg", "Villarreal", "Werder Bremen", "West Ham United",
    "Wolverhampton Wanderers",
]

# (transfermarkt_label, market_value_eur, competition_label) — top 100
# by squad market value, transcribed from the source above.
TM_ROWS = [
    ("Manchester City", 1_470_000_000, "Premier League"),
    ("Real Madrid", 1_450_000_000, "LaLiga"),
    ("Arsenal FC", 1_410_000_000, "Premier League"),
    ("Paris Saint-Germain", 1_390_000_000, "Ligue 1"),
    ("Chelsea FC", 1_360_000_000, "Premier League"),
    ("FC Barcelona", 1_280_000_000, "LaLiga"),
    ("Bayern Munich", 1_070_000_000, "Bundesliga"),
    ("Liverpool FC", 999_500_000, "Premier League"),
    ("Tottenham Hotspur", 909_500_000, "Premier League"),
    ("Manchester United", 874_300_000, "Premier League"),
    ("Inter Milan", 671_800_000, "Serie A"),
    ("Atlético de Madrid", 629_300_000, "LaLiga"),
    ("Brighton & Hove Albion", 619_500_000, "Premier League"),
    ("Newcastle United", 566_300_000, "Premier League"),
    ("AFC Bournemouth", 565_880_000, "Premier League"),
    ("Brentford FC", 565_300_000, "Premier League"),
    ("AC Milan", 562_200_000, "Serie A"),
    ("Nottingham Forest", 559_800_000, "Premier League"),
    ("Juventus FC", 542_700_000, "Serie A"),
    ("Bayer 04 Leverkusen", 516_950_000, "Bundesliga"),
    ("Crystal Palace", 516_400_000, "Premier League"),
    ("RB Leipzig", 514_600_000, "Bundesliga"),
    ("Aston Villa", 499_300_000, "Premier League"),
    ("Como 1907", 498_000_000, "Serie A"),
    ("AS Roma", 490_450_000, "Serie A"),
    ("Borussia Dortmund", 489_200_000, "Bundesliga"),
    ("Everton FC", 471_100_000, "Premier League"),
    ("FC Porto", 466_300_000, "Portuguese League"),
    ("SSC Napoli", 441_650_000, "Serie A"),
    ("VfB Stuttgart", 433_950_000, "Bundesliga"),
    ("Atalanta BC", 429_300_000, "Serie A"),
    ("Leeds United", 426_950_000, "Premier League"),
    ("Sporting CP", 407_500_000, "Portuguese League"),
    ("Sunderland AFC", 380_580_000, "Premier League"),
    ("SL Benfica", 365_550_000, "Portuguese League"),
    ("Eintracht Frankfurt", 355_850_000, "Bundesliga"),
    ("Fulham FC", 343_800_000, "Premier League"),
    ("ACF Fiorentina", 337_050_000, "Serie A"),
    ("RC Strasbourg Alsace", 335_250_000, "Ligue 1"),
    ("Fenerbahce", 332_450_000, "Süper Lig"),
    ("AS Monaco", 327_300_000, "Ligue 1"),
    ("Villarreal CF", 324_600_000, "LaLiga"),
    ("Galatasaray", 323_750_000, "Süper Lig"),
    ("LOSC Lille", 317_100_000, "Ligue 1"),
    ("TSG 1899 Hoffenheim", 294_950_000, "Bundesliga"),
    ("Olympique Lyon", 293_450_000, "Ligue 1"),
    ("PSV Eindhoven", 285_100_000, "Eredivisie"),
    ("West Ham United", 282_200_000, "Championship"),
    ("Ipswich Town", 277_650_000, "Premier League"),
    ("Stade Rennais FC", 275_600_000, "Ligue 1"),
    ("Coventry City", 265_350_000, "Premier League"),
    ("Wolverhampton Wanderers", 264_850_000, "Championship"),
    ("Real Sociedad", 252_300_000, "LaLiga"),
    ("Bologna FC 1909", 249_250_000, "Serie A"),
    ("SC Freiburg", 242_550_000, "Bundesliga"),
    ("Athletic Bilbao", 240_700_000, "LaLiga"),
    ("Besiktas JK", 237_400_000, "Süper Lig"),
    ("Ajax Amsterdam", 234_900_000, "Eredivisie"),
    ("Real Betis Balompié", 234_600_000, "LaLiga"),
    ("Feyenoord Rotterdam", 234_050_000, "Eredivisie"),
    ("Sociedade Esportiva Palmeiras", 232_780_000, "Series A"),
    ("SS Lazio", 227_850_000, "Serie A"),
    ("Olympique Marseille", 224_850_000, "Ligue 1"),
    ("Al-Hilal SFC", 221_730_000, "Saudi Pro League"),
    ("Al-Ahli SFC", 220_230_000, "Saudi Pro League"),
    ("CR Flamengo", 217_950_000, "Series A"),
    ("US Sassuolo", 194_250_000, "Serie A"),
    ("Club Brugge KV", 193_100_000, "Jupiler Pro League"),
    ("Parma Calcio 1913", 189_450_000, "Serie A"),
    ("Southampton FC", 187_850_000, "Championship"),
    ("RC Lens", 187_450_000, "Ligue 1"),
    ("Genoa CFC", 179_000_000, "Serie A"),
    ("Shakhtar Donetsk", 177_250_000, "Premier League"),
    ("Zenit St. Petersburg", 176_100_000, "Premier League"),
    ("1.FSV Mainz 05", 175_200_000, "Bundesliga"),
    ("Paris FC", 173_600_000, "Ligue 1"),
    ("Cruzeiro Esporte Clube", 166_900_000, "Series A"),
    ("Celta de Vigo", 165_300_000, "LaLiga"),
    ("Udinese Calcio", 162_830_000, "Serie A"),
    ("Olympiacos Piraeus", 160_600_000, "Super League 1"),
    ("AZ Alkmaar", 160_400_000, "Eredivisie"),
    ("FC Augsburg", 159_900_000, "Bundesliga"),
    ("Trabzonspor", 155_900_000, "Süper Lig"),
    ("SC Braga", 154_800_000, "Portuguese League"),
    ("VfL Wolfsburg", 151_150_000, "2nd Bundesliga"),
    ("CA River Plate", 148_250_000, "Torneo Clausura"),
    ("Al-Ittihad Club", 148_100_000, "Saudi Pro League"),
    ("Al-Qadsiah FC", 143_300_000, "Saudi Pro League"),
    ("Sport Club Corinthians Paulista", 142_800_000, "Series A"),
    ("Union Saint-Gilloise", 141_200_000, "Jupiler Pro League"),
    ("Middlesbrough FC", 139_000_000, "Championship"),
    ("SV Werder Bremen", 137_830_000, "Bundesliga"),
    ("Al-Nassr FC", 136_930_000, "Saudi Pro League"),
    ("Celtic FC", 136_500_000, "Premiership"),
    ("Torino FC", 134_100_000, "Serie A"),
    ("Borussia Mönchengladbach", 132_550_000, "Bundesliga"),
    ("Cagliari Calcio", 132_000_000, "Serie A"),
    ("OGC Nice", 131_900_000, "Ligue 1"),
    ("Spartak Moscow", 129_400_000, "Premier League"),
    ("Sevilla FC", 128_900_000, "LaLiga"),
]

OUT_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "app", "data", "transfermarkt_squad_values.json"
)


def main():
    rows = []
    matched, unmatched = 0, 0
    for team_raw, value_eur, competition in TM_ROWS:
        team = match_to_our_team(team_raw, OUR_TEAMS)
        if team is None:
            unmatched += 1
        else:
            matched += 1
        rows.append({
            "team_raw": team_raw,
            "team": team,
            "competition_label": competition,
            "market_value_eur": value_eur,
        })

    snapshot = {
        "source": SOURCE,
        "unit": "EUR",
        "note": (
            "Informational only — squad market value is a spending/valuation "
            "metric, not a performance signal, so it is displayed alongside "
            "Power Rankings but never blended into the rating itself "
            "(unlike the ClubElo prior in power_ranking_fitter.py)."
        ),
        "captured_at_hint": CAPTURED_AT,
        "rows": rows,
    }

    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(snapshot, fh, indent=1, ensure_ascii=False)
        fh.write("\n")

    print(f"Wrote {len(rows)} rows to {OUT_PATH}")
    print(f"Matched to a tracked team: {matched}")
    print(f"Unmatched (not in our tracked leagues, kept via team_raw): {unmatched}")


if __name__ == "__main__":
    main()
