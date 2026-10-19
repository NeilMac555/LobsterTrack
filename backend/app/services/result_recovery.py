"""Conservative recovery of final scores missed by the three-day scores feed."""
import json
from functools import lru_cache
from pathlib import Path

from app.models import AlertResult, HistoricalMatch, Match, SteamMove


@lru_cache(maxsize=1)
def verified_results():
    return json.loads((Path(__file__).parents[1] / 'data' / 'verified_match_results.json').read_text())


def verified_record(match):
    record = verified_results().get(match.id)
    if record and (record['home_team'], record['away_team'], record['sport_key'], record['date']) == (
        match.home_team, match.away_team, match.sport_key, match.commence_time.date().isoformat()
    ):
        return record
    return None


def unfinished_status(match):
    record = verified_record(match)
    return record['status'] if record and record['status'] in ('postponed', 'suspended') else None


def apply_score(move, score):
    h, a = score
    move.home_score, move.away_score = h, a
    move.won = h > a if move.outcome == 'home' else a > h if move.outcome == 'away' else h == a
    move.result_updated = True


def recover_results(db, moves):
    """Never guess a score or fuzzy-match fixtures. Caller controls the transaction.

    Exact fixture/date/competition matches only. Suspensions have no final score;
    their audited status must be reviewed when the fixture is completed.
    """
    ids = {m.match_id for m in moves}
    if not ids:
        return 0
    matches = {m.id: m for m in db.query(Match).filter(Match.id.in_(ids))}
    saved = {r.match_id: (r.home_score, r.away_score)
             for r in db.query(AlertResult).filter(AlertResult.match_id.in_(ids))}
    legacy = {}
    for row in db.query(SteamMove).filter(SteamMove.match_id.in_(ids), SteamMove.result_updated == True,
                                        SteamMove.home_score.isnot(None), SteamMove.away_score.isnot(None)):
        legacy.setdefault(row.match_id, set()).add((row.home_score, row.away_score))
    scores = {}
    for id, match in matches.items():
        record = verified_record(match)
        if unfinished_status(match):
            continue
        if record and record['status'] == 'completed':
            score = (record['home_score'], record['away_score'])
            # Contradictory evidence needs review, not an automatic overwrite.
            if id in saved and saved[id] != score:
                continue
            if legacy.get(id) and legacy[id] != {score}:
                continue
        elif id in saved:
            score = saved[id]
        elif len(legacy.get(id, set())) == 1:
            score = next(iter(legacy[id]))
        else:
            rows = db.query(HistoricalMatch).filter(
                HistoricalMatch.league == match.sport_key,
                HistoricalMatch.match_date == match.commence_time.date(),
                HistoricalMatch.home_team == match.home_team,
                HistoricalMatch.away_team == match.away_team,
                HistoricalMatch.fthg.isnot(None), HistoricalMatch.ftag.isnot(None),
                HistoricalMatch.ftr.in_(['H', 'D', 'A']),
            ).all()
            if len(rows) != 1:
                continue
            row = rows[0]
            score = (row.fthg, row.ftag)
            expected = 'H' if score[0] > score[1] else 'A' if score[0] < score[1] else 'D'
            if row.ftr != expected:
                continue
        if any(not isinstance(n, int) or n < 0 for n in score):
            continue
        scores[id] = score
        if id not in saved:
            db.add(AlertResult(match_id=id, home_score=score[0], away_score=score[1]))
    updated = 0
    for move in moves:
        if not move.result_updated and move.match_id in scores:
            apply_score(move, scores[move.match_id])
            updated += 1
    return updated
