"""A bounded football question vocabulary. Parsed values never become executable SQL."""

import re
import unicodedata
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.services.team_name_normalizer import NAME_MAP_BY_LEAGUE

LEAGUES = {
    "UCL": "soccer_uefa_champs_league",
    "UEL": "soccer_uefa_europa_league",
    "UECL": "soccer_uefa_europa_conference_league",
    "Premier League": "soccer_epl",
    "Serie A": "soccer_italy_serie_a",
    "La Liga": "soccer_spain_la_liga",
    "Bundesliga": "soccer_germany_bundesliga",
    "Ligue 1": "soccer_france_ligue_one",
}
EUROPE = ("UCL", "UEL", "UECL")
ENGLISH = (
    "Arsenal",
    "Aston Villa",
    "Liverpool",
    "Manchester City",
    "Manchester United",
    "Bournemouth",
    "Crystal Palace",
    "Sunderland",
    "Brighton and Hove Albion",
)
SAMPLE = "English clubs at home in Europe this season"


class Rules(BaseModel):
    team: str
    competitions: list[str]
    season: int
    venue: Literal["home", "away", "all"] = "all"
    stage: Literal["all", "main", "league"] = "all"
    last: int | None = Field(None, ge=1, le=50)
    bound: Literal["below", "above", "at least", "at most"] | None = None
    price: float | None = None


def norm(value):
    text = unicodedata.normalize(
        "NFKD", value.casefold().replace("ø", "o").replace("&", " and ")
    )
    return " ".join(
        "".join(c for c in text if not unicodedata.combining(c))
        .replace("-", " ")
        .split()
    )


def season_start(today):
    return today.year if today.month >= 7 else today.year - 1


TEAM_INDEX = {}
TEAM_LEAGUE = {}
for league, names in NAME_MAP_BY_LEAGUE.items():
    for alias, team in names.items():
        TEAM_LEAGUE[team] = next(name for name, key in LEAGUES.items() if key == league)
        for name in (alias, team):
            TEAM_INDEX[norm(name)] = team
TEAM_INDEX.update(
    {
        "man city": "Manchester City",
        "man united": "Manchester United",
        "man utd": "Manchester United",
        "brighton": "Brighton and Hove Albion",
        "spurs": "Tottenham Hotspur",
        "afc bournemouth": "Bournemouth",
    }
)

COMP_WORDS = {
    "UCL": r"uefa champions league|champions league|ucl",
    "UEL": r"uefa europa league|europa league|uel",
    "UECL": r"uefa conference league|europa conference league|conference league|uecl",
    "Premier League": r"premier league|epl",
    "Serie A": r"serie a",
    "La Liga": r"la liga|laliga",
    "Bundesliga": r"bundesliga",
    "Ligue 1": r"ligue 1",
}
FILLER = set(
    """what whats is was were would how have has had do did does the a an in on at of if i we you
my for from to as and or all only every each this their they them these those games game matches match fixtures
fixture win wins won winning loss losses draws lost record rate percentage percent often many much returned return
returns profit profits p l pl pnl roi unit units flat stake staked betting bet back backing backed moneyline straight up
pinnacle closing close odds price prices line lines english club clubs team teams show me give get please overall
break it down by competition competitions split across played playing league season so far this year made
at home away out european football wouldve money staking bets tell us record results on done performed doing
perform performance been doing their when had bought get me if hows the to date too show across competitions
per both achieve achieved ok okay can could also side sides which break down""".split()
)


def parse(question, today=None):
    today = today or date.today()
    season = season_start(today)
    s = (
        norm(question)
        .replace("’", "'")
        .replace("what's", "whats")
        .replace("'s", "")
        .replace("p/l", "pnl")
    )
    s = re.sub(r"\.(?!\d)", " ", s)
    s = re.sub(r"(?<=\w)\?(?=\s|$)|[?,!]", " ", s).strip().rstrip(".")
    if re.search(
        r"\b(?:btts|goals?|handicaps?|favo[u]?rites?|underdogs?|steam|alerts?|corners?|lay|drifters?|excluding|except|without|not|either|versus|against)\b",
        s,
    ):
        raise ValueError(
            "Try a club to win in 90 minutes. This query supports venue, competitions, season, last N and a closing price limit."
        )
    years = re.findall(r"\b(20\d{2})[/\-](\d{2}|20\d{2})\b", question)
    if len(years) > 1 or (years and "last season" in s):
        raise ValueError("Choose one season per question.")
    if years:
        first, second = years[0]
        if int(second) % 100 != (int(first) + 1) % 100:
            raise ValueError("Use a season such as 2026/27.")
        season = int(first)
        s = re.sub(r"\b20\d{2}[/ ](?:20\d{2}|\d{2})\b", " ", s)
    elif "last season" in s:
        season -= 1
    s = s.replace("last season", " ").replace("this season", " ")
    last = None
    window = re.search(r"\blast\s+(\d+)\b", s)
    if window:
        last = int(window[1])
        if not 1 <= last <= 50:
            raise ValueError("Choose between 1 and 50 recent games.")
        s = s[: window.start()] + " " + s[window.end() :]
    for phrase, operator in (
        ("or greater", "at least"),
        ("or higher", "at least"),
        ("or more", "at least"),
        ("or lower", "at most"),
        ("or less", "at most"),
    ):
        s = re.sub(
            r"\b(\d+(?:\.\d+)?)\s+" + phrase + r"\b", lambda m: operator + " " + m[1], s
        )
    s = s.replace("shorter than", "below").replace("longer than", "above")
    limits = re.search(
        r"\b(below|under|above|over|at least|at most|sub)\s*(\d+(?:\.\d+)?)\b", s
    )
    bound = price = None
    if limits:
        bound = {"sub": "below", "under": "below", "over": "above"}.get(
            limits[1], limits[1]
        )
        price = float(limits[2])
        if not 1 < price <= 1000:
            raise ValueError("Use decimal odds above 1.00 and at most 1000.")
        s = s[: limits.start()] + " " + s[limits.end() :]
    s = re.sub(r"\b1\s*(?:u|unit)\b", " ", s)
    comps = []
    for name in (
        "UECL",
        "UEL",
        "UCL",
        "Premier League",
        "Serie A",
        "La Liga",
        "Bundesliga",
        "Ligue 1",
    ):
        pattern = r"\b(?:" + COMP_WORDS[name] + r")\b"
        if re.search(pattern, s):
            comps.append(name)
            s = re.sub(pattern, " ", s)
    europe = bool(re.search(r"\b(?:europe|european)\b", s))
    s = re.sub(r"\b(?:europe|european)\b", " ", s)
    stage = (
        "league"
        if "league phase" in s
        else "main"
        if re.search(r"\b(?:main competition|main draw)\b", s)
        else "all"
    )
    s = re.sub(
        r"\b(?:main competition|league phase|main draw|including qualifiers)\b", " ", s
    )
    s = re.sub(r"\baway from home\b", "away", s)
    venues = [v for v in ("home", "away") if re.search(r"\b" + v + r"\b", s)]
    group = bool(re.search(r"\benglish\s+(?:clubs?|teams?|sides?)\b", s))
    s = re.sub(r"\benglish\s+(?:clubs?|teams?|sides?)\b", " ", s)
    team = None
    for alias in sorted(TEAM_INDEX, key=len, reverse=True):
        pattern = r"\b" + re.escape(alias) + r"\b"
        if re.search(pattern, s):
            team = TEAM_INDEX[alias]
            s = re.sub(pattern, " ", s)
            break
    if (not team and not group) or (team and group):
        raise ValueError("Name one club, or ask about English clubs in Europe.")
    unknown = [w for w in re.findall(r"[\w.]+", s) if w not in FILLER]
    if unknown:
        raise ValueError(
            f"Could not apply “{' '.join(unknown)[:65]}”. Try a club, venue, competition, season or price limit."
        )
    if not comps:
        comps = list(EUROPE) if group or europe else [TEAM_LEAGUE[team]]
    if (group or europe) and any(c not in EUROPE for c in comps):
        raise ValueError("Choose European competitions or one domestic league.")
    if any(c in EUROPE for c in comps):
        if (
            season != 2026
            or (not group and team not in ENGLISH)
            or any(c not in EUROPE for c in comps)
        ):
            raise ValueError(
                "European coverage currently follows the nine English entrants in 2026/27."
            )
    elif len(comps) != 1 or comps[0] != TEAM_LEAGUE.get(team) or stage != "all":
        raise ValueError("Choose the domestic league for the named team.")
    if not 2000 <= season <= season_start(today):
        raise ValueError("Choose a completed or current season.")
    return Rules(
        team=team or "English clubs",
        competitions=[c for c in LEAGUES if c in comps],
        season=season,
        venue=venues[0] if len(venues) == 1 else "all",
        stage=stage,
        last=last,
        bound=bound,
        price=price,
    )


def describe(rules):
    """A stand-alone question that round-trips, including the originally selected season."""
    scope = " and ".join(rules.competitions)
    parts = [rules.team, "in", scope, f"{rules.season}/{(rules.season + 1) % 100:02d}"]
    if rules.venue != "all":
        parts.append("at " + rules.venue if rules.venue == "home" else "away")
    if rules.stage != "all":
        parts.append("league phase" if rules.stage == "league" else "main competition")
    if rules.last:
        parts.append(f"last {rules.last} games")
    if rules.bound:
        parts.append(f"{rules.bound} {rules.price:g}")
    return " ".join(parts)


def resolve(question, previous=None, today=None):
    if previous:
        short = norm(question).strip(" ?.!")
        short = re.sub(
            r"^(?:and |what about |how about |what if |show me )+", "", short
        )
        short = re.sub(r"\s+(?:only|instead|games|matches|please)$", "", short)
        base = parse(previous, today)
        # A request for a different metric can reuse the exact cohort on screen.
        words = set(
            re.findall(r"[\w/]+", short.replace("’", "'").replace("what's", "what is"))
        )
        metric_words = {"p/l", "pnl", "roi", "profit", "return", "returns"}
        same_sample = set(
            "what is would be the my from for if you i we had backed backing them each every game at pinnacle closing close price prices odds 1 unit stake staked per and loss".split()
        )
        if words & metric_words and words <= metric_words | same_sample:
            return base
        venue = {
            "away": "away",
            "away from home": "away",
            "at home": "home",
            "home": "home",
            "all venues": "all",
            "home and away": "all",
            "both venues": "all",
        }.get(short)
        if venue:
            return base.model_copy(update={"venue": venue})
        if short in (
            "p/l",
            "the p/l",
            "profit and loss",
            "break it down by competition",
            "roi",
        ):
            return base
        if re.fullmatch(r"last \d+(?: games)?", short):
            return parse(
                describe(base.model_copy(update={"last": None})) + " " + short, today
            )
        if re.fullmatch(
            r"(?:below|above|under|over|sub|at least|at most)\s*\d+(?:\.\d+)?", short
        ):
            return parse(
                describe(base.model_copy(update={"bound": None, "price": None}))
                + " "
                + short,
                today,
            )
        if short in (
            "ucl",
            "uel",
            "uecl",
            "champions league",
            "europa league",
            "conference league",
        ) and all(c in EUROPE for c in base.competitions):
            comp = next(c for c in EUROPE if re.fullmatch(COMP_WORDS[c], short))
            return base.model_copy(update={"competitions": [comp]})
    return parse(question, today)
