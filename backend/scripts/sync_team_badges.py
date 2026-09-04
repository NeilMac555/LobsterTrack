"""Sync canonical SteamWatch team names to TheSportsDB badge artwork."""

import asyncio
import importlib.util
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import httpx

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.models.database import SessionLocal  # noqa: E402
from app.models.match import Match  # noqa: E402

# Load this data-only module directly. Importing app.services would also load
# every runtime service (scheduler, logging, external clients), none of which
# is needed by this maintenance script.
_normalizer_spec = importlib.util.spec_from_file_location(
    "team_name_normalizer",
    BACKEND_ROOT / "app" / "services" / "team_name_normalizer.py",
)
if _normalizer_spec is None or _normalizer_spec.loader is None:
    raise RuntimeError("Could not load team name registry")
_normalizer = importlib.util.module_from_spec(_normalizer_spec)
_normalizer_spec.loader.exec_module(_normalizer)
NAME_MAP_BY_LEAGUE = _normalizer.NAME_MAP_BY_LEAGUE

OUTPUT = BACKEND_ROOT / "app" / "data" / "team_badges.json"
API_ROOT = "https://www.thesportsdb.com/api/v1/json"
LIVE_MATCHES_URL = "https://www.steamwatch.io/api/matches"
LIVE_LEAGUES = (
    "soccer_epl",
    "soccer_efl_champ",
    "soccer_spain_la_liga",
    "soccer_germany_bundesliga",
    "soccer_france_ligue_one",
    "soccer_italy_serie_a",
    "soccer_uefa_champs_league",
    "soccer_uefa_europa_league",
    "soccer_uefa_europa_conference_league",
)

# SteamWatch mirrors The Odds API's canonical names. TheSportsDB sometimes
# indexes the same club under a shorter/common name, so keep the differences
# explicit rather than fuzzy-matching crests onto the wrong team.
TEAM_SEARCH_ALIASES = {
    "1. FC Köln": "Köln",
    "AS Monaco": "Monaco",
    "AS Roma": "Roma",
    "Alavés": "Deportivo Alaves",
    "Atalanta BC": "Atalanta",
    "Bodø/Glimt": "Bodo Glimt",
    "CA Osasuna": "Osasuna",
    "Cádiz CF": "Cadiz",
    "Deportivo La Coruña": "Deportivo de A Coruña",
    "Elche CF": "Elche",
    "FC Schalke 04": "Schalke 04",
    "FC St. Pauli": "St Pauli",
    "FSV Mainz 05": "Mainz",
    "Granada CF": "Granada",
    "Hertha Berlin": "Hertha",
    "Le Mans FC": "Le Mans",
    "Oviedo": "Real Oviedo",
    "RC Lens": "Lens",
    "SC Freiburg": "Freiburg",
    "SC Paderborn": "Paderborn",
    "SV Darmstadt 98": "Darmstadt",
    "Sabah FK": "Sabah",
    "Slavia Praha": "Slavia Prague",
    "TSG Hoffenheim": "Hoffenheim",
    "VfB Stuttgart": "Stuttgart",
    "VfL Bochum": "Bochum",
    "VfL Wolfsburg": "Wolfsburg",
    "Viking FK": "Viking",
    "Wrexham AFC": "Wrexham",
    "ŠK Slovan Bratislava": "Slovan Bratislava",
    "Besiktas JK": "Besiktas",
    "FC Ararat-Armenia": "Ararat Armenia",
    "FC Iberia 1999": "Iberia 1999",
    "FC Kairat": "Kairat Almaty",
    "FC Lugano": "Lugano",
    "FC Nordsjaelland": "FC Nordsjælland",
    "FC Thun": "Thun",
    "FC Twente Enschede": "Twente",
    "FK Borac Banja Luka": "Borac Banja Luka",
    "FK Jablonec": "Jablonec",
    "FK Kauno Žalgiris": "Kauno Zalgiris",
    "Ferencváros TC": "Ferencvaros",
    "Hearts": "Heart of Midlothian",
    "KuPS Kuopio": "KuPS",
    "Lillestrom": "Lillestrøm",
    "Lincoln Red Imps FC": "Lincoln Red Imps",
    "NK Celje": "Celje",
    "Omonoia FC": "Omonia Nicosia",
    "PFC CSKA Sofia": "CSKA Sofia",
    "PFC Levski Sofia": "Levski Sofia",
    "Pafos FC": "Pafos",
    "Panathinaikos FC": "Panathinaikos",
    "SC Braga": "Braga",
    "SK Brann": "Brann",
    "SK Sturm Graz": "Sturm Graz",
    "Salzburg": "Red Bull Salzburg",
    "Union Saint-Gilloise": "Union Saint Gilloise",
}


def _key(value: str) -> str:
    folded = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", folded.casefold())


def _pick(team_name: str, candidates: list[dict]) -> dict | None:
    wanted = {
        _key(team_name),
        _key(TEAM_SEARCH_ALIASES.get(team_name, team_name)),
    }
    for candidate in candidates:
        names = [candidate.get("strTeam"), candidate.get("strTeamShort")]
        if wanted & {_key(n) for n in names if n}:
            return candidate
    return candidates[0] if len(candidates) == 1 else None


async def main() -> None:
    api_key = os.getenv("THESPORTSDB_API_KEY")
    if not api_key:
        raise SystemExit("THESPORTSDB_API_KEY is required")

    with SessionLocal() as db:
        rows = db.query(Match.home_team, Match.away_team).distinct().all()
    teams = sorted({team for row in rows for team in row if team})

    # A fresh local database is normally empty. In that case, seed the sync
    # with SteamWatch's live canonical names plus the configured domestic
    # league rosters so a developer can build the registry without copying
    # production data locally.
    if not teams:
        configured = {
            team
            for mapping in NAME_MAP_BY_LEAGUE.values()
            for team in mapping.values()
        }
        live = []
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            for league in LIVE_LEAGUES:
                response = await client.get(
                    LIVE_MATCHES_URL,
                    params={
                        "league": league,
                        "upcoming_only": "true",
                        "limit": 100,
                    },
                )
                response.raise_for_status()
                live.extend(response.json())
        live_teams = {
            match[field]
            for match in live
            for field in ("home_team", "away_team")
            if match.get(field)
        }
        teams = sorted(configured | live_teams)
        print(
            f"Local match database is empty; using {len(live_teams)} live "
            f"and {len(configured)} configured team names."
        )

    existing = {}
    if OUTPUT.exists():
        existing = json.loads(OUTPUT.read_text(encoding="utf-8")).get("badges", {})
    badges: dict[str, str] = {
        team: existing[team] for team in teams if existing.get(team)
    }
    unresolved: list[str] = []
    pending = [team for team in teams if team not in badges]
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        for index, team in enumerate(pending, start=1):
            response = await client.get(
                f"{API_ROOT}/{api_key}/searchteams.php",
                params={"t": TEAM_SEARCH_ALIASES.get(team, team)},
            )
            response.raise_for_status()
            match = _pick(team, response.json().get("teams") or [])
            url = match.get("strBadge") if match else None
            if url:
                badges[team] = url
            else:
                unresolved.append(team)
            if index % 25 == 0 or index == len(pending):
                print(f"Resolved {index}/{len(pending)} remaining team names...")
            # The premium plan permits 100 requests/minute. Stay just below
            # that ceiling so the full registry is reliable in one pass.
            await asyncio.sleep(0.65)

    payload = {
        "provider": "thesportsdb",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "badges": badges,
        "unresolved": unresolved,
    }
    temp = OUTPUT.with_suffix(".json.tmp")
    temp.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temp.replace(OUTPUT)
    print(f"Matched {len(badges)}/{len(teams)} teams; unresolved: {len(unresolved)}")


if __name__ == "__main__":
    asyncio.run(main())
