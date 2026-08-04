"""
Rules-based question parser for the /forecast question box.

No LLM by design (v1): the box understands a closed grammar of question
shapes over the five supported leagues, with team/league recognition
built from team_name_normalizer's canonical names. Anything outside the
grammar comes back kind='unsupported' with a human-readable reason and
suggestions — the UI turns those into example chips.

Supported shapes:
  - league winner      "who wins the premier league?"
  - top 4              "who makes top 4 in serie a?" / "does Arsenal qualify for the Champions League?"
  - relegation         "who goes down in ligue 1?"
  - team outcome       "does Bayern win the Bundesliga?" / "will Leeds be relegated?"
  - match              "Arsenal vs Chelsea"

An LLM front-end can replace parse() later without touching the engine —
the ParsedQuestion contract is the seam.
"""

import re
from dataclasses import dataclass, field

from app.services.team_name_normalizer import NAME_MAP_BY_LEAGUE

# Mirror of scripts/model-params.ts league metadata (team counts and
# relegation spots are league facts, not tunables). Bundesliga and
# Ligue 1 send 2 straight down plus a playoff spot we fold into the
# "relegated" count as 2 — the playoff is noted in the rationale.
LEAGUE_CONFIG: dict[str, dict] = {
    "soccer_epl": {
        "name": "Premier League",
        "teams": 20, "relegation_spots": 3, "top_n": 4,
        "aliases": ["premier league", "epl", "prem", "english premier"],
    },
    "soccer_spain_la_liga": {
        "name": "La Liga",
        "teams": 20, "relegation_spots": 3, "top_n": 4,
        "aliases": ["la liga", "laliga", "spanish league", "primera division"],
    },
    "soccer_italy_serie_a": {
        "name": "Serie A",
        "teams": 20, "relegation_spots": 3, "top_n": 4,
        "aliases": ["serie a", "seria a", "italian league", "scudetto"],
    },
    "soccer_germany_bundesliga": {
        "name": "Bundesliga",
        "teams": 18, "relegation_spots": 2, "top_n": 4,
        "aliases": ["bundesliga", "german league"],
    },
    "soccer_france_ligue_one": {
        "name": "Ligue 1",
        "teams": 18, "relegation_spots": 2, "top_n": 4,
        "aliases": ["ligue 1", "ligue un", "french league", "ligue one"],
    },
}

# European competitions are recognised so we can refuse them with an
# honest reason (cross-league strengths aren't built yet — see TODO.md
# "CL/UEL restoration") instead of a generic parse failure. "qualify
# for the champions league" style phrasings are top-4 questions about a
# domestic league and are handled before this check fires.
_EURO_COMPETITIONS = [
    "champions league", "ucl", "europa league", "uel", "conference league",
    "uecl", "european cup",
]

# Hand-rolled nicknames on top of the canonical names. Bare ambiguous
# words ("united", "city") are deliberately absent — a miss is better
# than a silent wrong team.
_EXTRA_ALIASES: dict[str, dict[str, str]] = {
    "soccer_epl": {
        "man city": "Manchester City", "man utd": "Manchester United",
        "man united": "Manchester United", "spurs": "Tottenham Hotspur",
        "wolves": "Wolverhampton Wanderers", "brighton": "Brighton and Hove Albion",
        "newcastle": "Newcastle United", "west ham": "West Ham United",
        "forest": "Nottingham Forest", "villa": "Aston Villa",
    },
    "soccer_spain_la_liga": {
        "real madrid": "Real Madrid", "barca": "Barcelona", "barça": "Barcelona",
        "atleti": "Atletico Madrid", "atletico": "Atletico Madrid",
        "athletic": "Athletic Bilbao", "betis": "Real Betis",
    },
    "soccer_italy_serie_a": {
        "inter": "Inter Milan", "juve": "Juventus", "milan": "AC Milan",
        "napoli": "Napoli", "roma": "AS Roma", "lazio": "Lazio",
    },
    "soccer_germany_bundesliga": {
        "bayern": "Bayern Munich", "dortmund": "Borussia Dortmund",
        "bvb": "Borussia Dortmund", "leverkusen": "Bayer Leverkusen",
        "gladbach": "Borussia Monchengladbach", "leipzig": "RB Leipzig",
    },
    "soccer_france_ligue_one": {
        "psg": "Paris Saint Germain", "paris": "Paris Saint Germain",
        "marseille": "Marseille", "om": "Marseille", "lyon": "Lyon",
        "monaco": "Monaco", "lille": "Lille",
    },
}

_SUGGESTIONS = [
    "Who wins the Premier League?",
    "Does Bayern Munich win the Bundesliga?",
    "Who makes the top 4 in Serie A?",
    "Who gets relegated from La Liga?",
    "Arsenal vs Chelsea",
]


@dataclass
class ParsedQuestion:
    # 'league_winner' | 'top_n' | 'relegation' | 'team_outcome' | 'match'
    # | 'unsupported'
    kind: str
    league: str | None = None
    teams: list[str] = field(default_factory=list)
    # for team_outcome: 'winner' | 'top_n' | 'relegation'
    outcome: str | None = None
    reason: str | None = None
    suggestions: list[str] = field(default_factory=lambda: list(_SUGGESTIONS))


def _build_team_index() -> dict[str, list[tuple[str, str]]]:
    """alias (lowercase) -> [(sport_key, canonical_name)]. Aliases come
    from canonical names, football-data.co.uk source spellings, and the
    nickname table above."""
    index: dict[str, list[tuple[str, str]]] = {}

    def add(alias: str, league: str, canonical: str):
        alias = alias.lower().strip()
        if len(alias) < 4:  # 'om' etc. handled below explicitly
            return
        entry = (league, canonical)
        index.setdefault(alias, [])
        if entry not in index[alias]:
            index[alias].append(entry)

    for league, name_map in NAME_MAP_BY_LEAGUE.items():
        for source_name, canonical in name_map.items():
            add(canonical, league, canonical)
            add(source_name, league, canonical)
    for league, extra in _EXTRA_ALIASES.items():
        for alias, canonical in extra.items():
            entry = (league, canonical)
            index.setdefault(alias.lower(), [])
            if entry not in index[alias.lower()]:
                index[alias.lower()].append(entry)
    return index


_TEAM_INDEX = _build_team_index()
# Longest aliases first so "manchester city" wins before "city"-like
# fragments could ever match inside it.
_TEAM_ALIASES_BY_LENGTH = sorted(_TEAM_INDEX.keys(), key=len, reverse=True)

_WINNER_RE = re.compile(r"\b(win|wins|winner|winning|champion|champions\b(?! league)|title|top of)\b")
_TOP_N_RE = re.compile(r"\b(top ?-? ?(4|four)|qualify|qualifies|qualification|champions league (spot|place|spots|places))\b")
_RELEGATION_RE = re.compile(r"\b(relegat\w*|go down|goes down|going down|drop out|bottom (3|three|2|two))\b")
_MATCH_SEP_RE = re.compile(r"\b(vs\.?|v\.?|against|versus)\b|—|–")


def _clean(question: str) -> str:
    q = question.lower().strip()
    q = re.sub(r"[?!.,;:'\"]", " ", q)
    return re.sub(r"\s+", " ", q)


def _word_match(alias: str, text: str) -> re.Match | None:
    # Word-boundary match, never bare substring: short aliases like
    # "om" (Marseille) must not fire inside "comes"/"home".
    return re.search(rf"\b{re.escape(alias)}\b", text)


def _find_league(q: str) -> str | None:
    for key, cfg in LEAGUE_CONFIG.items():
        for alias in cfg["aliases"]:
            if _word_match(alias, q):
                return key
    return None


def _find_teams(q: str) -> list[tuple[str, str]]:
    """Return [(sport_key, canonical)] for every distinct team mentioned,
    longest-alias-first with matched spans blanked so a team is only
    counted once."""
    found: list[tuple[str, str]] = []
    working = q
    for alias in _TEAM_ALIASES_BY_LENGTH:
        m = _word_match(alias, working)
        if m:
            entries = _TEAM_INDEX[alias]
            # An alias shared across leagues (none today, but cheap to
            # guard) is skipped rather than guessed.
            if len(entries) == 1 and entries[0] not in found:
                found.append(entries[0])
                working = working[: m.start()] + " " * (m.end() - m.start()) + working[m.end():]
    return found


def parse(question: str) -> ParsedQuestion:
    q = _clean(question)
    if not q:
        return ParsedQuestion(kind="unsupported", reason="Empty question.")

    league = _find_league(q)
    teams = _find_teams(q)

    # Top-4 phrasing first: "qualify for the champions league" is a
    # domestic top-4 question, not a UCL forecast.
    is_top_n = bool(_TOP_N_RE.search(q))

    if not is_top_n:
        for comp in _EURO_COMPETITIONS:
            if comp in q:
                return ParsedQuestion(
                    kind="unsupported",
                    reason=(
                        "Champions League / Europa League forecasts need "
                        "cross-league team strengths, which aren't built yet "
                        "— domestic league questions only for now."
                    ),
                )

    # Two teams + a separator = match question.
    if len(teams) >= 2 and _MATCH_SEP_RE.search(q):
        (league_a, team_a), (league_b, team_b) = teams[0], teams[1]
        if league_a != league_b:
            return ParsedQuestion(
                kind="unsupported",
                reason=(
                    f"{team_a} and {team_b} play in different leagues — "
                    "cross-league matches aren't supported yet."
                ),
            )
        return ParsedQuestion(kind="match", league=league_a, teams=[team_a, team_b])

    is_relegation = bool(_RELEGATION_RE.search(q))
    is_winner = bool(_WINNER_RE.search(q))

    if teams:
        team_league, team_name = teams[0]
        if league is None:
            league = team_league
        outcome = (
            "relegation" if is_relegation
            else "top_n" if is_top_n
            else "winner" if is_winner
            else None
        )
        if outcome is None:
            return ParsedQuestion(
                kind="unsupported", league=league, teams=[team_name],
                reason=(
                    f"Recognised {team_name}, but not what to forecast about "
                    "them — try 'win the league', 'make top 4', or 'be relegated'."
                ),
            )
        return ParsedQuestion(
            kind="team_outcome", league=league, teams=[team_name], outcome=outcome
        )

    if league:
        if is_relegation:
            return ParsedQuestion(kind="relegation", league=league)
        if is_top_n:
            return ParsedQuestion(kind="top_n", league=league)
        if is_winner:
            return ParsedQuestion(kind="league_winner", league=league)
        return ParsedQuestion(
            kind="unsupported", league=league,
            reason=(
                f"Recognised the {LEAGUE_CONFIG[league]['name']}, but not the "
                "question — try 'who wins', 'top 4', or 'relegation'."
            ),
        )

    return ParsedQuestion(
        kind="unsupported",
        reason=(
            "Couldn't recognise a supported league or team in that question. "
            "Top 5 European leagues only for now."
        ),
    )
