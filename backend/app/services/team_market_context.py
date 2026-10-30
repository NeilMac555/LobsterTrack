"""Read-only, Pinnacle-only team context for a match page.

One fixture is one observation, irrespective of Telegram delivery or tick count.
Meaningful excursions are measured against the first tracked price and must be
observed in the last two hours. Reversals get their own category, not two games.
"""
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from math import isfinite

from sqlalchemy import and_, func, or_

from app.models import AlertResult, HistoricalMatch, Match, OddsSnapshot, SteamMove
from app.services.result_recovery import unfinished_status, verified_record

THRESHOLD_PP = 3.0
WINDOW_MINUTES = 120
MAX_CLOSE_AGE_MINUTES = 30


def naive_utc(value):
    return value.astimezone(timezone.utc).replace(tzinfo=None) if value.tzinfo else value


def price_valid(value):
    return value is not None and isfinite(value) and value > 1


def classify_history(opening, snapshots, side, kickoff):
    """Return unavailable, rather than 'quiet', when closing coverage is missing."""
    field = 'home_odds' if side == 'home' else 'away_odds'
    first_price = getattr(opening, field, None)
    if not price_valid(first_price):
        return None
    points = sorted((s for s in snapshots if price_valid(getattr(s, field))
                     and opening.fetched_at < s.fetched_at < kickoff),
                    key=lambda s: (s.fetched_at, s.id))
    if not points or kickoff - points[-1].fetched_at > timedelta(minutes=MAX_CLOSE_AGE_MINUTES):
        return None
    changes = [100 / getattr(s, field) - 100 / first_price for s in points]
    drift, steam = min(changes) <= -THRESHOLD_PP + 1e-9, max(changes) >= THRESHOLD_PP - 1e-9
    direction = 'both' if drift and steam else 'drift' if drift else 'steam' if steam else 'quiet'
    close = getattr(points[-1], field)
    return dict(direction=direction, opening_odds=first_price, closing_odds=close,
                close_move_pp=round(100 / close - 100 / first_price, 2),
                largest_drift_pp=round(max(0, -min(changes)), 2),
                largest_steam_pp=round(max(0, max(changes)), 2))


def _scores(db, fixtures, since, cutoff, league):
    """Join final scores by exact identity. Conflicting or unfinished = excluded."""
    ids = [m.id for m in fixtures]
    evidence = defaultdict(set)
    for r in db.query(AlertResult).filter(AlertResult.match_id.in_(ids)):
        evidence[r.match_id].add((r.home_score, r.away_score))
    for r in db.query(SteamMove.match_id, SteamMove.home_score, SteamMove.away_score).filter(
        SteamMove.match_id.in_(ids), SteamMove.result_updated.is_(True),
        SteamMove.home_score.isnot(None), SteamMove.away_score.isnot(None)).distinct():
        evidence[r.match_id].add((r.home_score, r.away_score))
    historical = defaultdict(set)
    for r in db.query(HistoricalMatch).filter(
        HistoricalMatch.league == league, HistoricalMatch.match_date >= since.date(),
        HistoricalMatch.match_date <= cutoff.date(), HistoricalMatch.ftr.in_(['H', 'D', 'A']),
        HistoricalMatch.fthg.isnot(None), HistoricalMatch.ftag.isnot(None)):
        expected = 'H' if r.fthg > r.ftag else 'A' if r.ftag > r.fthg else 'D'
        if r.ftr == expected:
            historical[(r.match_date, r.home_team, r.away_team)].add((r.fthg, r.ftag))
    result = {}
    for m in fixtures:
        if unfinished_status(m):
            continue
        candidates = evidence[m.id] | historical[(m.commence_time.date(), m.home_team, m.away_team)]
        record = verified_record(m)
        if record and record['status'] == 'completed':
            candidates.add((record['home_score'], record['away_score']))
        if len(candidates) == 1:
            score = next(iter(candidates))
            if all(isinstance(n, int) and n >= 0 for n in score):
                result[m.id] = score
    return result


def team_market_context(db, match, now=None):
    now = naive_utc(now or datetime.now(timezone.utc))
    kickoff = naive_utc(match.commence_time)
    cutoff = min(now, kickoff)
    year = kickoff.year if kickoff.month >= 7 else kickoff.year - 1
    since = datetime(year, 7, 1)
    teams = [match.home_team, match.away_team]
    fixtures = db.query(Match).filter(
        Match.sport_key == match.sport_key, Match.commence_time >= since,
        Match.commence_time < cutoff, Match.id != match.id,
        or_(Match.home_team.in_(teams), Match.away_team.in_(teams))).all()
    scores = _scores(db, fixtures, since, cutoff, match.sport_key) if fixtures else {}
    fixtures = [m for m in fixtures if m.id in scores]
    ids = [m.id for m in fixtures]
    openings, late = {}, defaultdict(list)
    if ids:
        # Window numbering avoids fetching entire multi-week snapshot histories.
        ranked = db.query(OddsSnapshot.id.label('id'), func.row_number().over(
            partition_by=OddsSnapshot.match_id,
            order_by=(OddsSnapshot.fetched_at.asc(), OddsSnapshot.id.asc())).label('rank')).join(
                Match, Match.id == OddsSnapshot.match_id).filter(
            OddsSnapshot.match_id.in_(ids), OddsSnapshot.bookmaker == 'pinnacle',
            OddsSnapshot.in_play.is_(False), OddsSnapshot.fetched_at < Match.commence_time,
            OddsSnapshot.home_odds > 1, OddsSnapshot.draw_odds > 1, OddsSnapshot.away_odds > 1).subquery()
        first_ids = db.query(ranked.c.id).filter(ranked.c.rank == 1)
        openings = {s.match_id: s for s in db.query(OddsSnapshot).filter(OddsSnapshot.id.in_(first_ids))}
        windows = [and_(OddsSnapshot.match_id == m.id,
                        OddsSnapshot.fetched_at >= m.commence_time - timedelta(minutes=WINDOW_MINUTES),
                        OddsSnapshot.fetched_at < m.commence_time) for m in fixtures]
        for s in db.query(OddsSnapshot).filter(
            OddsSnapshot.bookmaker == 'pinnacle', OddsSnapshot.in_play.is_(False), or_(*windows)):
            late[s.match_id].append(s)

    # Duplicate provider IDs for the same actual fixture must not inflate counts.
    unique = {}
    for m in fixtures:
        key = (m.commence_time.date(), m.home_team, m.away_team)
        quality = (len(late[m.id]), m.id in openings, m.id)
        if key not in unique or quality > unique[key][0]:
            unique[key] = (quality, m)

    output = []
    for team in teams:
        history = []
        for _, m in unique.values():
            if team not in (m.home_team, m.away_team):
                continue
            side = 'home' if team == m.home_team else 'away'
            movement = classify_history(openings.get(m.id), late[m.id], side, m.commence_time)
            h, a = scores[m.id]
            won = h > a if side == 'home' else a > h
            history.append(dict(match_id=m.id, kickoff=m.commence_time,
                opponent=m.away_team if side == 'home' else m.home_team,
                venue=side, home_score=h, away_score=a,
                result='W' if won else 'D' if h == a else 'L',
                **(movement or dict(direction='unavailable', opening_odds=None, closing_odds=None,
                                    close_move_pp=None, largest_drift_pp=None, largest_steam_pp=None))))
        history.sort(key=lambda r: (r['kickoff'], r['match_id']), reverse=True)
        counts = Counter(r['direction'] for r in history)
        available = len(history) - counts['unavailable']
        records = {}
        for kind in ['drift', 'steam', 'both', 'quiet']:
            outcomes = Counter(r['result'] for r in history if r['direction'] == kind)
            records[kind] = dict(wins=outcomes['W'], draws=outcomes['D'], losses=outcomes['L'])
        output.append(dict(team=team, completed_matches=len(history), tracked_matches=available,
            unavailable_matches=counts['unavailable'], drifts=counts['drift'],
            steams=counts['steam'], both=counts['both'], quiet=counts['quiet'],
            records=records, recent=history[:5], history=history))
    return dict(match_id=match.id, league=match.sport_key, league_name=match.league_name,
                season=f'{year}/{str(year + 1)[2:]}', as_of=cutoff, generated_at=now,
                historical=kickoff <= now, bookmaker='pinnacle', threshold_pp=THRESHOLD_PP,
                window_minutes=WINDOW_MINUTES, max_close_age_minutes=MAX_CLOSE_AGE_MINUTES,
                teams=output)
