"""Durable weekly board, isolated collector workspace and atomic publication."""
import json
import logging
import math
from datetime import datetime, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from sqlalchemy import text
from app.models.database import SessionLocal, engine
from app.models.club_rating import ClubRatingPublication, ClubRatingInputs
from . import club_consensus
from .sportmonks import ProviderError

log = logging.getLogger(__name__)
ROOT = Path(__file__).parent


def period_for(now):
    """Monday 12:00 UTC publication boundary; startup catches missed weeks."""
    monday = (now-timedelta(days=now.weekday())).replace(hour=12, minute=0, second=0, microsecond=0)
    if now < monday:
        monday -= timedelta(days=7)
    return monday.date().isoformat()


def tier(score):
    return next(label for minimum, label in [(1850,'Elite'),(1800,'Contenders'),(1650,'Strong'),(1500,'Competitive'),(1350,'Outsiders'),(-math.inf,'Lower rated')] if score >= minimum)


def valid_board(board, expected_ids):
    teams = board.get('teams', [])
    return (not board.get('stale') and len(teams) == len(expected_ids)
            and {r['id'] for r in teams} == expected_ids
            and all(math.isfinite(r['score']) and r.get('sources') for r in teams))


def publish_if_due():
    # Session-level advisory lock covers the collector without locking user,
    # vote or odds tables. All DB sessions below close before network work.
    with engine.connect() as connection:
        postgres = connection.dialect.name == 'postgresql'
        if postgres:
            acquired = connection.execute(text('SELECT pg_try_advisory_lock(741031092)')).scalar()
            connection.commit()
            if not acquired:
                return
        try:
            _publish()
        except Exception:
            log.exception('club ratings refresh failed; previous publication retained')
        finally:
            if postgres:
                connection.execute(text('SELECT pg_advisory_unlock(741031092)'))
                connection.commit()


def _publish():
    now = datetime.utcnow()
    period = period_for(now)
    with SessionLocal() as db:
        previous = db.query(ClubRatingPublication).order_by(ClubRatingPublication.id.desc()).first()
        if previous and previous.period >= period:
            return
        previous_board = previous.board if previous else None
        stored = db.get(ClubRatingInputs, 1)
        if stored and now-stored.checked_at < timedelta(hours=6):
            return  # Failed refresh retry backoff.
        inputs = stored.snapshots if stored else json.loads((ROOT/'seed.json').read_text(encoding='utf-8'))
    expected_ids = {t['id'] for t in inputs['club-board/roster.json']['teams']}
    with TemporaryDirectory(prefix='club-ratings-') as folder:
        directory = Path(folder)
        for name, snapshot in inputs.items():
            path = directory/name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(snapshot, ensure_ascii=False), encoding='utf-8')
        if previous_board:
            # Fallback must contain BASE scores, never community-adjusted ones.
            baseline = json.loads(json.dumps(previous_board))
            for row in baseline['teams']:
                row['score'] = row['base_score']
            (directory/'club-board/last-good.json').write_text(json.dumps(baseline), encoding='utf-8')
            result = club_consensus.refresh(directory)
        else:
            # First publication uses the reviewed seed, retaining true source dates.
            try:
                result = {'board': club_consensus.overview(directory), 'results': {'initial': 'Reviewed launch snapshot'}}
            except ProviderError:
                # A new environment started months later must refresh an expired seed.
                result = club_consensus.refresh(directory)
        board = result['board']
        refreshed = {name: json.loads((directory/name).read_text(encoding='utf-8')) for name in inputs if (directory/name).exists()}
        # Include new season feeds after rollover, but never collector scratch/history.
        for path in (directory/'understat/rolling').glob('*.json'):
            refreshed[path.relative_to(directory).as_posix()] = json.loads(path.read_text(encoding='utf-8'))
    with SessionLocal() as db:
        state = db.get(ClubRatingInputs, 1)
        if state is None:
            state = ClubRatingInputs(id=1)
            db.add(state)
        state.snapshots, state.checked_at, state.results = refreshed, now, result['results']
        if not valid_board(board, expected_ids):
            db.commit()
            log.warning('Incomplete club rating board; publication retained')
            return
        old = {t['id']: t for t in previous_board['teams']} if previous_board else {}
        prior_ranks = {t['id']: rank for rank, t in enumerate(sorted(old.values(), key=lambda t: (-t.get('base_score', t['score']), t['name'])), 1)}
        for team in board['teams']:
            prior = old.get(team['id'], {})
            base = team['score']
            team.update(base_score=base, community_adjustment=0,
                        score=round(base, 2), previous_rank=prior_ranks.get(team['id']),
                        previous_score=prior.get('base_score', prior.get('score')))
            team['tier'] = tier(team['score'])
        board['teams'].sort(key=lambda t: (-t['score'], t['name']))
        for rank, team in enumerate(board['teams'], 1):
            team['rank'] = rank
            team['rank_change'] = team['previous_rank']-rank if team['previous_rank'] else None
            team['score_change'] = round(team['score']-team['previous_score'], 2) if team['previous_score'] is not None else None
        board.update(published_at=now.isoformat()+'Z', period=period,
                     next_update=(datetime.fromisoformat(period)+timedelta(days=7, hours=12)).isoformat()+'Z',
                     community_rules={'minimum_voters':5,'minimum_agreement':.8,'expires_days':30,'max_rank_change':1,'immediate':True})
        db.add(ClubRatingPublication(period=period, published_at=now, board=board))
        db.commit()
        log.info('Published club ratings: %s, %s clubs', period, len(board['teams']))
