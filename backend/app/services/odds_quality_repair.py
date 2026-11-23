"""Transactional, replayable repair. Never changes or sends Telegram alerts."""
from datetime import date, datetime, timedelta, timezone
from enum import Enum
from hashlib import sha256
import json
from math import isfinite

from sqlalchemy import text
from app.models import (Match, OddsSnapshot, SteamMove, ClosingLine, HistoricalMatch,
                        OddsQualityArchive, OddsQualityRepair)
from app.models.closing_line import MarketType
from app.services.odds_quality import POLICY, valid_snapshot_sql, valid_book_sql
from app.services.result_recovery import recover_results


def utc(value):
    return value.astimezone(timezone.utc).replace(tzinfo=None) if value.tzinfo else value


def serial(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, float) and not isfinite(value):
        return str(value)
    return value


def archive_payload(source_table, source_id, match_id, payload, reason):
    payload = {k: serial(v) for k, v in payload.items()}
    identity = json.dumps([source_table, str(source_id), payload], sort_keys=True)
    return dict(id=sha256(identity.encode()).hexdigest(), source_table=source_table,
                source_id=str(source_id), match_id=match_id, payload=payload,
                reason=reason, policy=POLICY, archived_at=datetime.utcnow())


def archive_rows(db, rows, reason):
    records = [archive_payload(row.__tablename__, row.id, getattr(row, 'match_id', None),
                              {c.name: getattr(row, c.name) for c in row.__table__.columns}, reason)
               for row in rows]
    # A repeated repair can encounter the same derived version; keep one original.
    for offset in range(0, len(records), 500):
        batch = records[offset:offset + 500]
        saved = {r[0] for r in db.query(OddsQualityArchive.id).filter(
            OddsQualityArchive.id.in_([r['id'] for r in batch]))}
        db.bulk_insert_mappings(OddsQualityArchive, [r for r in batch if r['id'] not in saved])


def replay_moves(match, snapshots):
    """Same first-qualifying-price convention as live detection, no lookahead."""
    if len(snapshots) < 2:
        return []
    opening, previous = snapshots[0], snapshots[0]
    seen, moves = set(), []
    for row in snapshots[1:]:
        seconds = (utc(match.commence_time) - utc(row.fetched_at)).total_seconds()
        if 0 <= seconds <= 7200:
            for outcome, team in [('home', match.home_team), ('draw', 'Draw'), ('away', match.away_team)]:
                first, current = getattr(opening, outcome + '_odds'), getattr(row, outcome + '_odds')
                move = 100 / current - 100 / first
                key = (outcome, current)
                if abs(move) >= 3 and key not in seen:
                    seen.add(key)
                    moves.append(SteamMove(match_id=match.id, sport_key=match.sport_key,
                        outcome=outcome, team_name=team, opening_odds=first,
                        previous_odds=getattr(previous, outcome + '_odds'), current_odds=current,
                        movement_percent=move, detected_at=row.fetched_at,
                        match_commence_time=match.commence_time, minutes_before_kickoff=int(seconds / 60)))
        previous = row
    return moves


def repair_history(db, dry_run=False):
    """Caller commits/rolls back. Archive and all dependent repairs are atomic."""
    if db.bind.dialect.name == 'postgresql':
        db.execute(text("SET LOCAL lock_timeout = '5s'"))
        db.execute(text("SET LOCAL statement_timeout = '120s'"))
        if not db.execute(text('SELECT pg_try_advisory_xact_lock(20261123112)')).scalar():
            raise RuntimeError('Odds repair already running')
    bad = db.query(OddsSnapshot).filter(~valid_snapshot_sql(OddsSnapshot)).all()
    bad_closes = db.query(ClosingLine).filter(ClosingLine.market_type == MarketType.H2H,
        ~valid_book_sql(ClosingLine.close_home, ClosingLine.close_draw, ClosingLine.close_away)).all()
    # Only prices copied from our feed are in scope; external historical sources stay intact.
    bad_history = db.query(HistoricalMatch).filter(HistoricalMatch.price_source == 'steamwatch_close',
        ~valid_book_sql(HistoricalMatch.psch, HistoricalMatch.pscd, HistoricalMatch.psca)).all()
    ids = {s.match_id for s in bad if s.bookmaker == 'pinnacle'}
    summary = dict(snapshots_archived=len(bad), affected_matches=len({s.match_id for s in bad}),
                   pinnacle_matches_replayed=len(ids), old_moves=0, rebuilt_moves=0,
                   closes_repaired=0, closes_removed=0, historical_prices_repaired=0,
                   bad_closes=len(bad_closes), bad_historical_prices=len(bad_history))
    if dry_run:
        return summary
    archive_rows(db, bad, 'invalid_1x2_book')
    # Bounded batches avoid giant IN clauses and retain every original before removal.
    for offset in range(0, len(bad), 500):
        db.query(OddsSnapshot).filter(OddsSnapshot.id.in_([r.id for r in bad[offset:offset + 500]])).delete(synchronize_session=False)
    for id in sorted(ids):
        match = db.get(Match, id)
        old = db.query(SteamMove).filter(SteamMove.match_id == id).all()
        archive_rows(db, old, 'replayed_from_valid_pinnacle_history')
        recover_results(db, old)
        db.flush()
        db.query(SteamMove).filter(SteamMove.match_id == id).delete(synchronize_session='fetch')
        snapshots = db.query(OddsSnapshot).filter(OddsSnapshot.match_id == id,
            OddsSnapshot.bookmaker == 'pinnacle', OddsSnapshot.in_play.is_(False),
            OddsSnapshot.fetched_at <= match.commence_time, valid_snapshot_sql(OddsSnapshot)
        ).order_by(OddsSnapshot.fetched_at, OddsSnapshot.id).all()
        new = replay_moves(match, snapshots)
        recover_results(db, new)
        db.add_all(new)
        db.flush()
        summary['old_moves'] += len(old)
        summary['rebuilt_moves'] += len(new)
    archive_rows(db, bad_closes, 'invalid_1x2_close')
    for close in bad_closes:
        last = db.query(OddsSnapshot).filter(OddsSnapshot.match_id == close.match_id,
            OddsSnapshot.bookmaker == 'pinnacle', OddsSnapshot.in_play.is_(False),
            OddsSnapshot.fetched_at < close.kickoff_time,
            OddsSnapshot.fetched_at >= close.kickoff_time - timedelta(minutes=30),
            valid_snapshot_sql(OddsSnapshot)).order_by(OddsSnapshot.fetched_at.desc(), OddsSnapshot.id.desc()).first()
        if last:
            close.close_home, close.close_draw, close.close_away = last.home_odds, last.draw_odds, last.away_odds
            close.captured_at = last.fetched_at
            close.minutes_before_kickoff = int((utc(close.kickoff_time) - utc(last.fetched_at)).total_seconds() / 60)
            summary['closes_repaired'] += 1
        else:
            db.delete(close)
            summary['closes_removed'] += 1
    db.flush()
    archive_rows(db, bad_history, 'invalid_copied_1x2_close')
    for row in bad_history:
        candidates = db.query(ClosingLine).filter(ClosingLine.league == row.league,
            ClosingLine.home_team == row.home_team, ClosingLine.away_team == row.away_team,
            ClosingLine.market_type == MarketType.H2H,
            ClosingLine.kickoff_time >= datetime.combine(row.match_date, datetime.min.time()),
            ClosingLine.kickoff_time < datetime.combine(row.match_date + timedelta(days=1), datetime.min.time())).all()
        from app.services.bias_results_refresh import valid_close
        candidates = [c for c in candidates if (m := db.get(Match, c.match_id)) and valid_close(c, m)]
        if len(candidates) == 1:
            c = candidates[0]
            row.psch, row.pscd, row.psca = c.close_home, c.close_draw, c.close_away
            summary['historical_prices_repaired'] += 1
        else:
            row.psch = row.pscd = row.psca = None
            row.price_source = 'missing'
    db.flush()
    return summary


def run_once():
    """Background deployment migration: persisted completion, safe to retry."""
    from app.models.database import SessionLocal
    with SessionLocal() as db:
        if db.get(OddsQualityRepair, POLICY):
            return {'already_completed': True}
        summary = repair_history(db)
        # Lock acquired inside repair_history; another worker may have completed meanwhile.
        record = db.get(OddsQualityRepair, POLICY)
        if record is None:
            db.add(OddsQualityRepair(policy=POLICY, summary=summary))
        db.commit()
        from app.services.match_page import _cache as match_cache
        from app.services.public_summaries import _cache as summary_cache
        from app.api.routes import _RESPONSE_CACHE
        match_cache.clear()
        summary_cache.clear()
        _RESPONSE_CACHE.clear()
        return summary
