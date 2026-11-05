"""Settle level-stake club win bets against final scores and attributable Pinnacle prices."""

from collections import defaultdict
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import and_, exists

from app.models import (
    ClosingLine,
    EuropeanXG,
    FormLabSeason,
    HistoricalMatch,
    MarketType,
    OddsSnapshot,
)
from app.services.research_query import ENGLISH, EUROPE, LEAGUES, describe, norm

QUALIFIERS = [
    (
        "2026-08-20",
        "Tromsø",
        "Brighton and Hove Albion",
        0,
        0,
        "away",
        1.57,
        "https://www.oddsgpt.com/predictions/football/0T1dzIFt3suurJ/tromso-vs-brighton/en",
    ),
    (
        "2026-08-27",
        "Brighton and Hove Albion",
        "Tromsø",
        4,
        0,
        "home",
        1.17,
        "https://www.oddsgpt.com/statistics/football/46So5sMGJE7obS/brighton-vs-tromso/en",
    ),
]

ALIASES = {
    norm(k): norm(v)
    for k, v in {
        "AFC Bournemouth": "Bournemouth",
        "Atlético de Madrid": "Atlético Madrid",
        "LOSC Lille": "Lille",
        "Olympique Lyonnais": "Lyon",
        "FC Bayern München": "Bayern Munich",
        "FC Barcelona": "Barcelona",
        "Viking FK": "Viking",
        "Sabah FK": "Sabah",
        "FK Kauno Žalgiris": "Kauno Žalgiris",
        "SK Sturm Graz": "Sturm Graz",
        "FK Jablonec": "Jablonec",
        "Besiktas JK": "Beşiktaş",
        "AS Roma": "Roma",
        "FC Porto": "Porto",
    }.items()
}


def key(team):
    name = norm(team)
    return ALIASES.get(name, name)


def close_index(db, rules):
    # Legacy rows have no bookmaker field. Require the original pre-match Pinnacle snapshot.
    valid = exists().where(
        and_(
            OddsSnapshot.match_id == ClosingLine.match_id,
            OddsSnapshot.bookmaker == "pinnacle",
            OddsSnapshot.in_play.is_(False),
            OddsSnapshot.fetched_at == ClosingLine.captured_at,
            OddsSnapshot.home_odds == ClosingLine.close_home,
            OddsSnapshot.away_odds == ClosingLine.close_away,
            OddsSnapshot.draw_odds == ClosingLine.close_draw,
        )
    )
    records = (
        db.query(ClosingLine)
        .filter(
            ClosingLine.market_type == MarketType.H2H,
            ClosingLine.league.in_([LEAGUES[c] for c in rules.competitions]),
            ClosingLine.kickoff_time >= datetime(rules.season, 7, 1),
            ClosingLine.kickoff_time < datetime(rules.season + 1, 7, 1),
            valid,
        )
        .all()
    )
    out = defaultdict(list)
    for r in records:
        out[
            (
                r.league,
                r.kickoff_time.date().isoformat(),
                key(r.home_team),
                key(r.away_team),
            )
        ].append(r)
    return out


def quote(index, league, day, h, a, side):
    candidates = index.get((league, day, key(h), key(a)), [])
    if len(candidates) != 1:
        return None, "No verified Pinnacle close", None
    r = candidates[0]
    link = "/match/" + r.match_id
    age = (r.kickoff_time - r.captured_at).total_seconds()
    if not 0 < age <= 300:
        return None, "Outside final 5 minutes", link
    odd = r.close_home if side == "home" else r.close_away
    return (
        (odd, "SteamWatch · Pinnacle", link)
        if odd and odd > 1
        else (None, "Price unavailable", link)
    )


def selection(rules, h, a):
    allowed = ENGLISH if rules.team == "English clubs" else [rules.team]
    clubs = {key(t) for t in allowed}
    for side, team in [("home", h), ("away", a)]:
        if key(team) in clubs and rules.venue in ("all", side):
            yield side


def row(comp, day, h, a, hg, ag, side, price, source, link):
    margin = (hg - ag) * (1 if side == "home" else -1)
    win = margin > 0
    pnl = None if price is None else float(Decimal(str(price)) - 1) if win else -1
    return dict(
        competition=comp,
        date=day,
        home=h,
        away=a,
        hg=hg,
        ag=ag,
        side=side,
        result="W" if win else "L" if margin < 0 else "D",
        price=price,
        pnl=pnl,
        source=source,
        link=link,
    )


def fixtures(db, rules):
    prices = close_index(db, rules)
    rows = []
    notices = []
    for comp in rules.competitions:
        league = LEAGUES[comp]
        if comp in EUROPE:
            season = f"{rules.season}/{rules.season + 1}"
            snapshot = db.get(FormLabSeason, league + ":" + season)
            if not snapshot:
                notices.append(comp + " results unavailable")
            else:
                stages = {}
                if rules.stage == "league":
                    stage_snapshot = db.get(EuropeanXG, league + ":" + season)
                    if stage_snapshot:
                        stages = {
                            f["id"]: f["stage"].lower() for f in stage_snapshot.fixtures
                        }
                    if any(
                        not f.get("stage") and f["id"] not in stages
                        for f in snapshot.data["fixtures"]
                    ):
                        notices.append(comp + " has fixtures without stage information")
                for f in snapshot.data["fixtures"]:
                    if rules.stage == "league" and (
                        f.get("stage") or stages.get(f["id"], "")
                    ).lower() not in ("league phase", "league stage"):
                        continue
                    day = f["date"][:10]
                    for side in selection(rules, f["home"], f["away"]):
                        price = quote(prices, league, day, f["home"], f["away"], side)
                        rows.append(
                            row(
                                comp,
                                day,
                                f["home"],
                                f["away"],
                                f["hg"],
                                f["ag"],
                                side,
                                *price,
                            )
                        )
            if comp == "UECL" and rules.season == 2026 and rules.stage == "all":
                for day, h, a, hg, ag, quoted_side, odd, link in QUALIFIERS:
                    for side in selection(rules, h, a):
                        if side == quoted_side:
                            rows.append(
                                row(
                                    comp,
                                    day,
                                    h,
                                    a,
                                    hg,
                                    ag,
                                    side,
                                    odd,
                                    "Pinnacle · external archive",
                                    link,
                                )
                            )
            continue
        code = f"{rules.season % 100:02d}{(rules.season + 1) % 100:02d}"
        matches = (
            db.query(HistoricalMatch)
            .filter_by(league=league, season=code)
            .filter(
                (HistoricalMatch.home_team == rules.team)
                | (HistoricalMatch.away_team == rules.team),
                HistoricalMatch.fthg.isnot(None),
                HistoricalMatch.ftag.isnot(None),
            )
            .all()
        )
        for m in matches:
            day = m.match_date.isoformat()
            for side in selection(rules, m.home_team, m.away_team):
                price = quote(prices, league, day, m.home_team, m.away_team, side)
                if price[0] is None and m.price_source == "close":
                    archived = m.psch if side == "home" else m.psca
                    if archived and archived > 1:
                        price = (archived, "Football-Data · Pinnacle close", None)
                rows.append(
                    row(
                        comp,
                        day,
                        m.home_team,
                        m.away_team,
                        m.fthg,
                        m.ftag,
                        side,
                        *price,
                    )
                )
    return sorted(
        rows, key=lambda r: (r["date"], r["home"], r["away"], r["side"]), reverse=True
    ), notices


def rounded(value):
    return float(value.quantize(Decimal(".01"), rounding=ROUND_HALF_UP))


def summary(rows):
    prices = [r for r in rows if r["pnl"] is not None]
    net = sum((Decimal(str(r["pnl"])) for r in prices), Decimal(0))
    n = len(rows)
    wins = sum(r["result"] == "W" for r in rows)
    return dict(
        games=n,
        wins=wins,
        draws=sum(r["result"] == "D" for r in rows),
        losses=sum(r["result"] == "L" for r in rows),
        priced=len(prices),
        missing=n - len(prices),
        win_pct=round(100 * wins / n, 1) if n else None,
        pnl=rounded(net) if prices else None,
        roi=rounded(100 * net / len(prices)) if prices else None,
    )


def report(db, rules, forward_from=None):
    rows, notices = fixtures(db, rules)
    if forward_from:
        rows = [r for r in rows if r["date"] >= forward_from]
    elif rules.last:
        rows = rows[: rules.last]
    unclassified = 0
    if rules.bound:
        threshold = rules.price

        def qualifies(odd):
            return {
                "above": odd > threshold,
                "below": odd < threshold,
                "at least": odd >= threshold,
                "at most": odd <= threshold,
            }[rules.bound]

        unclassified = sum(r["price"] is None for r in rows)
        rows = [r for r in rows if r["price"] is not None and qualifies(r["price"])]
    return dict(
        rules=rules.model_dump(),
        canonical=describe(rules),
        summary=summary(rows),
        fixtures=rows,
        breakdown={
            c: summary([r for r in rows if r["competition"] == c])
            for c in rules.competitions
        },
        unclassified=unclassified,
        notices=notices,
    )
