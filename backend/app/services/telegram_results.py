"""The sent-alert ledger is the only selection/price source for alert reporting."""
from types import SimpleNamespace
from app.models import SyndicateAlert, Match, SteamMove, AlertResult


def alert_moves(db, since=None, league=None, until=None):
    query = db.query(SyndicateAlert, Match).join(Match, Match.id == SyndicateAlert.match_id).filter(
        SyndicateAlert.market == '1x2', SyndicateAlert.outcome.in_(['home', 'away', 'draw']))
    if since is not None:
        query = query.filter(SyndicateAlert.alerted_at >= since)
    if until is not None:
        query = query.filter(SyndicateAlert.alerted_at < until)
    if league:
        query = query.filter(Match.sport_key == league)
    pairs = query.order_by(SyndicateAlert.alerted_at.desc()).all()
    ids = [a.match_id for a, _ in pairs]
    scores = {}
    # Legacy score evidence is allowed; legacy selections and prices never are.
    if ids:
        for result in db.query(SteamMove).filter(SteamMove.match_id.in_(ids), SteamMove.result_updated == True,
                SteamMove.home_score.isnot(None), SteamMove.away_score.isnot(None)).order_by(SteamMove.detected_at):
            scores[result.match_id] = (result.home_score, result.away_score)
        for result in db.query(AlertResult).filter(AlertResult.match_id.in_(ids)):
            scores[result.match_id] = (result.home_score, result.away_score)
    output = []
    for alert, match in pairs:
        score = scores.get(match.id)
        h, a = score if score else (None, None)
        won = None if score is None else (h > a if alert.outcome == 'home' else a > h if alert.outcome == 'away' else h == a)
        baseline_probability = 1 / alert.odds_at_alert - alert.movement_percent / 100
        baseline = 1 / baseline_probability if baseline_probability > 0 else alert.odds_at_alert
        name = match.home_team if alert.outcome == 'home' else match.away_team if alert.outcome == 'away' else f'Draw: {match.home_team} v {match.away_team}'
        output.append(SimpleNamespace(id=alert.id, match_id=match.id, sport_key=match.sport_key,
            outcome=alert.outcome, team_name=name, opening_odds=baseline, previous_odds=baseline,
            current_odds=alert.odds_at_alert, movement_percent=alert.movement_percent,
            detected_at=alert.alerted_at, match_commence_time=match.commence_time,
            minutes_before_kickoff=int((match.commence_time-alert.alerted_at).total_seconds()/60),
            result_updated=score is not None, won=won, home_score=h, away_score=a))
    return output
