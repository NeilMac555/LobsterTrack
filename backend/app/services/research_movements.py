"""Team frequency rankings over the same recorded selections as Steam Results and Drifters."""

import re
from dataclasses import dataclass
from datetime import datetime, timezone

from app.services.market_move_results import (
    THRESHOLD_PP,
    WINDOW_MINUTES,
    qualifying_team_moves,
)
from app.services.research_query import (
    COMP_WORDS,
    EUROPE,
    LEAGUES,
    question_terms,
    season_start,
)

DOMESTIC = tuple(c for c in LEAGUES if c not in EUROPE)
BIG_FIVE = r"\b(?:(?:europe(?:[’']?s)?|european)\s+)?(?:top|big|major)\s+(?:five|5)(?:\s+(?:domestic|european))?\s+leagues?\b"
MOVES = re.compile(
    r"\b(steam(?:ed|ing)?|steamers?|shorten(?:ed|ing)?|drift(?:ed|s|ing)?|drifters?)\b"
)
RANKING = re.compile(
    r"\b(?:most|often|frequen(?:tly|cy)|leaderboard|rank(?:ing|ings)?|leaders?)\b"
)
WORDS = set(
    """which what who whose team teams club clubs has have had is are did do does got gets
    seen saw see been seeing get the most often frequently frequency move moves times odds price prices
    their that this in of for from across among within on by so far all domestic league leagues
    rank ranking rankings leaderboard leaders me show please only season during with and were was
    market markets shortened shorten shortening steamed steam steamers steamer steaming drift drifts
    drifted drifting drifter drifters number recorded""".split()
)


@dataclass(frozen=True)
class Movement:
    direction: int
    competitions: tuple[str, ...]
    season: int

    @property
    def canonical(self):
        scope = (
            self.competitions[0]
            if len(self.competitions) == 1
            else "the top five leagues"
        )
        kind = "steam moves" if self.direction == 1 else "drifts"
        return f"Most {kind} in {scope} in {self.season}/{(self.season + 1) % 100:02d}"


def movement_question(question, previous=None, today=None):
    today = today or datetime.now(timezone.utc).date()
    if not MOVES.search(question.casefold()):
        # Only inherit a leaderboard for an explicit scope follow-up. A new
        # club/P&L question must still reach the ordinary match query parser.
        if previous and MOVES.search(previous.casefold()):
            short = re.sub(
                r"^(?:(?:and|how about|what about|just|only|in the|in)\s+)+",
                "",
                question.casefold().strip(" ?.!"),
            )
            short = re.sub(r"\s+(?:only|instead|please)$", "", short)
            prior = movement_question(previous, today=today)
            if prior:
                if re.fullmatch(BIG_FIVE, short.removeprefix("the ")):
                    return Movement(prior.direction, DOMESTIC, prior.season)
                for comp in DOMESTIC:
                    if re.fullmatch(COMP_WORDS[comp], short.removeprefix("the ")):
                        return Movement(prior.direction, (comp,), prior.season)
        return None
    s, season = question_terms(question, today)
    if re.search(r"\b(?:which|what)\s+leagues?\b", s):
        raise ValueError(
            "This leaderboard ranks teams. Try “Which team has the most steam moves in the top five leagues?”"
        )
    if not RANKING.search(s):
        raise ValueError(
            "For market movement, ask which teams steamed or drifted most in the top five leagues or in one of those leagues."
        )
    signals = {(-1 if x.startswith("drift") else 1) for x in MOVES.findall(s)}
    if len(signals) != 1:
        raise ValueError("Rank steam moves or drifts separately.")
    big = bool(re.search(BIG_FIVE, s))
    s = re.sub(BIG_FIVE, " ", s)
    comps = []
    for name in DOMESTIC:
        pattern = r"\b(?:" + COMP_WORDS[name] + r")\b"
        if re.search(pattern, s):
            comps.append(name)
            s = re.sub(pattern, " ", s)
    if len(comps) > 1 or (big and comps):
        raise ValueError(
            "Choose the top five leagues together, or one domestic league."
        )
    if set(re.findall(r"[\w.]+", s.replace(".", " "))) - WORDS:
        raise ValueError(
            "This ranking counts qualifying matches by team. Choose a season and the top five leagues or one domestic league. Telegram alerts and custom thresholds are separate queries."
        )
    if not 2000 <= season <= season_start(today):
        raise ValueError("Choose a completed or current season.")
    return Movement(signals.pop(), tuple(comps) or DOMESTIC, season)


def movement_report(db, query, now=None):
    now = now or datetime.now(timezone.utc)
    codes = {LEAGUES[c]: c for c in query.competitions}
    moves, _ = qualifying_team_moves(
        db,
        query.direction,
        datetime(query.season, 7, 1),
        list(codes),
        until=datetime(query.season + 1, 7, 1),
        observed_by=now.astimezone(timezone.utc).replace(tzinfo=None),
    )
    teams = {}
    for m in sorted(moves, key=lambda m: (m.match_commence_time, m.id), reverse=True):
        t = teams.setdefault(
            (m.sport_key, m.team_name),
            dict(
                team=m.team_name,
                competition=codes[m.sport_key],
                moves=0,
                wins=0,
                draws=0,
                losses=0,
                pending=0,
                fixtures=[],
            ),
        )
        outcome = (
            "pending"
            if not m.result_updated
            else "wins"
            if m.won
            else "draws"
            if m.home_score == m.away_score
            else "losses"
        )
        t[outcome] += 1
        t["moves"] += 1
        t["fixtures"].append(
            dict(
                match_id=m.match_id,
                date=m.match_commence_time.date().isoformat(),
                opponent=m.opponent,
                venue=m.outcome,
                opening=m.opening_odds,
                price=m.current_odds,
                pp=round(m.movement_percent, 2),
                result={"pending": "Pending", "wins": "W", "draws": "D", "losses": "L"}[
                    outcome
                ],
            )
        )
    rows = sorted(
        teams.values(),
        key=lambda r: (-r["moves"], r["team"].casefold(), r["competition"]),
    )
    for i, r in enumerate(rows):
        r["rank"] = (
            i + 1
            if not i or rows[i - 1]["moves"] != r["moves"]
            else rows[i - 1]["rank"]
        )
    return dict(
        kind="movement_ranking",
        canonical=query.canonical,
        direction="steam" if query.direction == 1 else "drift",
        competitions=query.competitions,
        season=query.season,
        rows=rows,
        count=len(moves),
        threshold_pp=THRESHOLD_PP,
        window_minutes=WINDOW_MINUTES,
        latest=max((m.detected_at.date().isoformat() for m in moves), default=None),
    )
