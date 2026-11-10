"""
What a match page can say beyond the open/close table (2026-11-10 SEO
audit, issue 3: match pages were thin and near-identical).

match_summary(db, match) returns plain-text copy and data, used by both
the server-rendered page (services/match_page.py) and, through
/api/fixtures/summary/<id>, its React twin (components/MatchSummary.tsx),
so the two never drift:

  title, description   unique per match: score or biggest 1X2 move
  result               final score, how the favourite and the biggest
                       mover did (finished matches with a verified score)
  alerts_text          steam alerts sent for the match, shown only once
                       it has kicked off
  timeline             the 1X2 price at open, 48h, 24h, 6h and 1h before
                       kickoff, and the close (upcoming matches: open,
                       7 days, 3 days, 24h and 6h ago, and now)
  late_move            what happened in the final two hours
  indexable            False when there are too few snapshots to say
                       anything (served noindex, left out of the sitemap)

Content rules are those of match_page.py: observed prices and results
only. No model probabilities, no claims about why a price moved.
"""
from __future__ import annotations

from bisect import bisect_right
from datetime import datetime, timedelta
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

INDEX_MIN_SNAPSHOTS = 12          # about three hours of price history
CHECKPOINTS = [(48, "48 hours before"), (24, "24 hours before"), (6, "6 hours before"), (1, "1 hour before")]
UPCOMING_CHECKPOINTS = [(168, "7 days ago"), (72, "3 days ago"), (24, "24 hours ago"), (6, "6 hours ago")]
LATE_WINDOW_HOURS = 2
LATE_MOVE_MIN_PP = 1.0
MOVER_MIN_PP = 1.0
DESC_MAX = 155
TITLE_MAX = 60


def _imp(v: Optional[float]) -> Optional[float]:
    return (100.0 / v) if v else None


def _pp(a: Optional[float], b: Optional[float]) -> Optional[float]:
    x, y = _imp(a), _imp(b)
    return (y - x) if x is not None and y is not None else None


def _f(v: Optional[float]) -> str:
    return f"{v:.2f}" if v else "n/a"


def _date(dt: datetime) -> str:
    return f"{dt.day} {dt.strftime('%b %Y')}"


def _cap(s: str) -> str:
    return s[0].upper() + s[1:]


def _ago(minutes: float) -> str:
    m = int(round(minutes))
    if m < 120:
        return f"{m} minutes"
    h, r = divmod(m, 60)
    return f"{h} hours" if r == 0 else f"{h} hours {r} minutes"


def page_title(home: str, away: str) -> str:
    t = f"{home} vs {away} Odds Movement | SteamWatch"
    return t if len(t) <= TITLE_MAX else f"{home} vs {away} Odds | SteamWatch"


def final_score(db: Session, match_id: str) -> Optional[tuple[int, int]]:
    """Verified score: the Telegram results ledger first, then the score
    stored on the match's steam moves."""
    r = db.execute(text("select home_score, away_score from telegram_match_results where match_id = :id"),
                   {"id": match_id}).fetchone()
    if not r:
        r = db.execute(text("select home_score, away_score from steam_moves where match_id = :id "
                            "and home_score is not null and away_score is not null limit 1"), {"id": match_id}).fetchone()
    return (int(r[0]), int(r[1])) if r else None


def match_summary(db: Session, match, snaps: Optional[list] = None, close: Optional[tuple] = None) -> dict[str, Any]:
    """snaps: pre-kickoff OddsSnapshot rows, oldest first (queried here when
    not passed). close: (home, draw, away) closing 1X2 if the caller has it."""
    kickoff = match.commence_time
    now = datetime.utcnow()
    finished = now >= kickoff
    home, away, comp = match.home_team, match.away_team, match.league_name
    if snaps is None:
        snaps = db.execute(text("select fetched_at, home_odds, draw_odds, away_odds from odds_snapshots "
                                "where match_id = :id and fetched_at < :ko order by fetched_at asc"),
                           {"id": match.id, "ko": kickoff}).fetchall()
    if close is None and finished:
        c = db.execute(text("select close_home, close_draw, close_away from closing_lines "
                            "where match_id = :id and market_type = 'H2H'"), {"id": match.id}).fetchone()
        close = tuple(c) if c else None

    names = {"home": home, "draw": "the draw", "away": away}
    out: dict[str, Any] = {
        "match_id": match.id, "finished": finished, "indexable": len(snaps) >= INDEX_MIN_SNAPSHOTS,
        "title": page_title(home, away), "score": None, "result_heading": None, "result": [],
        "alerts_text": [], "timeline": None, "late_move": None,
    }
    where = f"{comp}, {_date(kickoff)}"
    if not snaps:
        out["description"] = f"{home} vs {away}, {_date(kickoff)}: Pinnacle prices from open to kickoff."[:DESC_MAX]
        return out

    first, last = snaps[0], snaps[-1]
    opn = {"home": first.home_odds, "draw": first.draw_odds, "away": first.away_odds}
    cur = {"home": last.home_odds, "draw": last.draw_odds, "away": last.away_odds}
    if close:
        for i, k in enumerate(("home", "draw", "away")):
            if close[i]:
                cur[k] = close[i]
    moves = {k: _pp(opn[k], cur[k]) for k in cur}
    mover = max((k for k in moves if moves[k] is not None), key=lambda k: abs(moves[k]), default=None)

    # ---- result (finished only)
    score = final_score(db, match.id) if finished else None
    winner = None
    if score:
        out["score"] = {"home": score[0], "away": score[1]}
        winner = "home" if score[0] > score[1] else "away" if score[1] > score[0] else "draw"
    if finished:
        priced = {k: v for k, v in cur.items() if v}
        fav = min(priced, key=priced.get) if priced else None
        lines = []
        if score:
            lines.append(f"Full time: {home} {score[0]}-{score[1]} {away}.")
        if fav and fav != "draw":
            if not score:
                lines.append(f"{names[fav]} closed as the {_f(cur[fav])} favourite with Pinnacle.")
            elif winner == fav:
                lines.append(f"{names[fav]} closed as the {_f(cur[fav])} favourite with Pinnacle and won.")
            elif winner == "draw":
                lines.append(f"{names[fav]} closed as the {_f(cur[fav])} favourite with Pinnacle. The match finished level, "
                             f"with the draw closing at {_f(cur['draw'])}.")
            else:
                lines.append(f"{names[fav]} closed as the {_f(cur[fav])} favourite with Pinnacle. {names[winner]} won "
                             f"at a closing price of {_f(cur[winner])}.")
        if mover and abs(moves[mover]) >= MOVER_MIN_PP:
            verb = "shortened" if moves[mover] > 0 else "drifted"
            s = (f"The biggest 1X2 mover from open to close was {names[mover]}, which {verb} from "
                 f"{_f(opn[mover])} to {_f(cur[mover])}")
            if score and mover == "draw":
                s += " and came in" if winner == "draw" else " and did not come in"
            elif score:
                s += " and won" if winner == mover else " and did not win"
            lines.append(s + ".")
        out["result"] = lines
        out["result_heading"] = "Result" if score else "How the market closed"

        # ---- steam alerts (never shown before kickoff)
        alerts = db.execute(text("select market, outcome, movement_percent, odds_at_alert, alerted_at from syndicate_alerts "
                                 "where match_id = :id and alerted_at < :ko order by alerted_at asc"),
                            {"id": match.id, "ko": kickoff}).fetchall()
        for a in alerts:
            if a.market == "1x2" and a.outcome in names:
                sel = names[a.outcome]
            elif a.market == "totals":
                sel = f"the {a.outcome} in the totals market"
            elif a.market == "spreads":
                sel = f"{home if a.outcome.startswith('home') else away} on the Asian handicap"
            else:
                continue
            s = (f"SteamWatch sent a steam alert on {sel} at {_f(a.odds_at_alert)}, "
                 f"{_ago((kickoff - a.alerted_at).total_seconds() / 60)} before kickoff")
            # The stored move is only stated where its meaning is certain:
            # a rise in implied probability on a 1X2 selection.
            if a.market == "1x2" and a.movement_percent > 0:
                s += f", after a {a.movement_percent:.1f} percentage-point rise in implied probability"
            s += "."
            if score and a.market == "1x2":
                if a.outcome == "draw":
                    s += " The match was drawn." if winner == "draw" else " The match was not drawn."
                else:
                    s += f" {names[a.outcome]} won." if winner == a.outcome else f" {names[a.outcome]} did not win."
            out["alerts_text"].append(s)
        if not out["alerts_text"]:
            out["alerts_text"] = ["No SteamWatch steam alert was sent for this match."]

    # ---- 1X2 price timeline
    times = [s.fetched_at for s in snaps]

    def at(t: datetime):
        i = bisect_right(times, t)
        return snaps[i - 1] if i else None

    rows = [{"label": "Open", "home": first.home_odds, "draw": first.draw_odds, "away": first.away_odds}]
    # Finished: fixed points before kickoff. Upcoming: points back from now.
    points = ([(kickoff - timedelta(hours=h), label) for h, label in CHECKPOINTS] if finished
              else [(now - timedelta(hours=h), label) for h, label in UPCOMING_CHECKPOINTS])
    for t, label in points:
        if first.fetched_at < t <= now:
            s = at(t)
            rows.append({"label": label, "home": s.home_odds, "draw": s.draw_odds, "away": s.away_odds})
    rows.append({"label": "Close" if finished else "Now", "home": cur["home"], "draw": cur["draw"], "away": cur["away"]})
    if len(rows) > 2:
        out["timeline"] = {"columns": [home, "Draw", away], "rows": rows}

    # ---- final two hours
    t2 = kickoff - timedelta(hours=LATE_WINDOW_HOURS)
    if finished and first.fetched_at < t2:
        s = at(t2)
        base = {"home": s.home_odds, "draw": s.draw_odds, "away": s.away_odds}
        late = {k: _pp(base[k], cur[k]) for k in cur}
        k = max((x for x in late if late[x] is not None), key=lambda x: abs(late[x]), default=None)
        if k and abs(late[k]) >= LATE_MOVE_MIN_PP:
            verb = "shortened" if late[k] > 0 else "drifted"
            out["late_move"] = (f"In the final two hours before kickoff {names[k]} {verb} from {_f(base[k])} to "
                                f"{_f(cur[k])}, a {late[k]:+.1f} percentage-point change in implied probability.")
        else:
            out["late_move"] = "No 1X2 price moved by more than 1 percentage point in the final two hours before kickoff."

    # ---- meta description: the first candidate that fits
    head = f"{home} {score[0]}-{score[1]} {away}" if score else f"{home} vs {away}"
    cands = []
    if mover and abs(moves[mover]) >= 0.05:
        verb = "shortened" if moves[mover] > 0 else "drifted"
        if finished:
            mv = f"{_cap(names[mover])} {verb} from {_f(opn[mover])} to {_f(cur[mover])} at the Pinnacle close."
            tail = "Full price history from open to kickoff."
        else:
            mv = f"{_cap(names[mover])} has {verb} from {_f(opn[mover])} to {_f(cur[mover])} with Pinnacle."
            tail = "1X2, Asian handicap and totals price history."
        cands += [f"{head}, {where}. {mv} {tail}", f"{head}, {where}. {mv}", f"{head}, {_date(kickoff)}. {mv}"]
    cands += [f"{head}, {where}: Pinnacle 1X2, Asian handicap and totals prices from open to kickoff.",
              f"{head}, {_date(kickoff)}: Pinnacle prices from open to kickoff.", f"{head}: Pinnacle price history."]
    out["description"] = next((c for c in cands if len(c) <= DESC_MAX), cands[-1][:DESC_MAX])
    return out
