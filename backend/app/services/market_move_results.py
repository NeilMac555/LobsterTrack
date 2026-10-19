"""Seasonal team movement records, independent of the Telegram send ledger."""
from datetime import datetime, timezone
from types import SimpleNamespace

from app.models import Match, SteamMove, AlertResult
from app.services.result_recovery import unfinished_status, apply_score

MIN_MOVES = 3
THRESHOLD_PP = 3.0
WINDOW_MINUTES = 120


def market_move_report(db, direction, since, season_label, league=None, limit=200):
    query = db.query(SteamMove, Match).join(Match, Match.id == SteamMove.match_id).filter(
        SteamMove.outcome.in_(['home', 'away']), SteamMove.match_commence_time >= since)
    if league:
        query = query.filter(SteamMove.sport_key == league)
    pairs = query.all()
    best, scores, excluded = {}, {}, set()
    for move, match in pairs:
        if move.result_updated and move.home_score is not None and move.away_score is not None:
            scores.setdefault(move.match_id, set()).add((move.home_score, move.away_score))
        if move.opening_odds <= 1 or move.current_odds <= 1:
            continue
        pp = 100 / move.current_odds - 100 / move.opening_odds
        seconds = (move.match_commence_time - move.detected_at).total_seconds()
        if not (0 <= seconds <= WINDOW_MINUTES * 60) or direction * pp < THRESHOLD_PP - 1e-9:
            continue
        key = (move.match_id, move.outcome)
        if unfinished_status(match):
            excluded.add(key)
            continue
        # Preserve the drifter table's descriptive largest-move convention.
        # Tie-break by the earliest observation. Never count repeated ticks.
        priority = (-abs(pp), move.detected_at, move.id)
        if key not in best or priority < best[key][0]:
            item = SimpleNamespace(**{c.name: getattr(move, c.name) for c in SteamMove.__table__.columns})
            item.movement_percent = pp
            item.team_name = match.home_team if move.outcome == 'home' else match.away_team
            best[key] = (priority, item)
    ids = {m.match_id for _, m in best.values()}
    authoritative = {r.match_id: (r.home_score, r.away_score)
                     for r in db.query(AlertResult).filter(AlertResult.match_id.in_(ids))} if ids else {}
    all_moves = [m for _, m in best.values()]
    for move in all_moves:
        score = authoritative.get(move.match_id)
        if score is None and len(scores.get(move.match_id, set())) == 1:
            score = next(iter(scores[move.match_id]))
        move.result_updated = score is not None
        if score is not None:
            apply_score(move, score)
    settled = sorted((m for m in all_moves if m.result_updated),
                     key=lambda m: (m.match_commence_time, m.detected_at, m.id), reverse=True)
    teams = {}
    for m in settled:
        team = teams.setdefault(m.team_name, dict(team_name=m.team_name, sport_key=m.sport_key,
            total_moves=0, wins=0, draws=0, losses=0, movement=0.0, profit_loss=0.0))
        team['total_moves'] += 1
        team['wins' if m.won else 'draws' if m.home_score == m.away_score else 'losses'] += 1
        team['movement'] += abs(m.movement_percent)
        team['profit_loss'] += m.current_odds - 1 if m.won else -1
    rankings = []
    for team in teams.values():
        if team['total_moves'] >= MIN_MOVES:
            team['win_rate'] = round(100 * team['wins'] / team['total_moves'], 1)
            team['avg_move_size'] = round(team.pop('movement') / team['total_moves'], 1)
            team['profit_loss'] = round(team['profit_loss'], 2)
            rankings.append(team)
    rankings.sort(key=lambda t: (-t['total_moves'], -t['profit_loss'], t['team_name']))
    n = len(settled)
    wins = sum(m.won for m in settled)
    draws = sum(m.home_score == m.away_score for m in settled)
    profit = sum(m.current_odds - 1 if m.won else -1 for m in settled)
    return dict(source='all_steam_moves' if direction == 1 else 'all_drift_moves',
        qualifying_moves=len(all_moves), pending_moves=len(all_moves)-n, excluded_moves=len(excluded),
        generated_at=datetime.now(timezone.utc),
        latest_move_at=max((m.detected_at for m in all_moves), default=None),
        latest_settled_kickoff=max((m.match_commence_time for m in settled), default=None),
        total_moves=n, total_wins=wins, total_draws=draws, total_losses=n-wins-draws,
        win_rate=round(100*wins/n, 1) if n else None,
        avg_movement_percent=round(sum(abs(m.movement_percent) for m in settled)/n, 1) if n else None,
        profit_units=round(profit, 4), roi_percent=round(100*profit/n, 2) if n else None,
        season_label=season_label, min_moves_for_rankings=MIN_MOVES,
        teams_below_min=sum(t['total_moves'] < MIN_MOVES for t in teams.values()),
        moves=settled[:limit], team_rankings=rankings)
