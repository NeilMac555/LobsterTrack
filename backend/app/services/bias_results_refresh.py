"""Refresh priced, confirmed league results independently of Telegram alerts."""
from datetime import datetime, timedelta, timezone
from app.services.odds_quality import rejection_reason

import httpx

from app.config import get_settings
from app.models import Match, HistoricalMatch, ClosingLine
from app.models.closing_line import MarketType
from app.models.database import SessionLocal
from app.services.football_data_importer import LEAGUE_FILE_CODES
from app.services.team_market_context import _scores, naive_utc
from app.services.result_recovery import unfinished_status


def confirmed_score(event, match):
    """A live score or assumed winner must never become a settled result."""
    if event.get('completed') is not True or unfinished_status(match):
        return None
    if any(event.get(key) != getattr(match, attr) for key, attr in (
        ('id', 'id'), ('sport_key', 'sport_key'), ('home_team', 'home_team'), ('away_team', 'away_team'))):
        return None
    try:
        kickoff = naive_utc(datetime.fromisoformat(event['commence_time'].replace('Z', '+00:00')))
        if kickoff != naive_utc(match.commence_time):
            return None
        scores = event['scores']
        if len(scores) != 2 or {r['name'] for r in scores} != {match.home_team, match.away_team}:
            return None
        values = {r['name']: str(r['score']) for r in scores}
        if not all(s.isdigit() for s in values.values()):
            return None
        return int(values[match.home_team]), int(values[match.away_team])
    except (KeyError, TypeError, ValueError):
        return None


def valid_close(close, match):
    if not close or close.match_id != match.id or close.league != match.sport_key or (close.home_team, close.away_team) != (match.home_team, match.away_team):
        return False
    captured_kickoff = naive_utc(close.kickoff_time)
    current_kickoff = naive_utc(match.commence_time)
    captured_at = naive_utc(close.captured_at)
    # The provider can adjust the actual kickoff after we capture the close
    # (Rayo–Valencia moved from 15:15 to 15:17). Keep the exact event identity,
    # allow only a small clock correction, and require a fresh pre-match price
    # against BOTH timestamps. Rescheduled or in-play prices remain excluded.
    if abs(current_kickoff - captured_kickoff) > timedelta(minutes=5):
        return False
    ages = (captured_kickoff - captured_at, current_kickoff - captured_at)
    return (all(timedelta(0) < age <= timedelta(minutes=30) for age in ages)
            and rejection_reason(close.close_home, close.close_draw, close.close_away) is None)


def sync_league(db, league, events, now=None):
    """Idempotent upsert; preserve existing prices and reject conflicting scores.

    ClosingLine H2H is captured exclusively from pre-match Pinnacle snapshots.
    Unpriced finals may be retained, but are excluded from the public P/L APIs.
    The caller owns the transaction.
    """
    now = naive_utc(now or datetime.now(timezone.utc))
    year = now.year if now.month >= 7 else now.year - 1
    since = datetime(year, 7, 1)
    season = f'{year % 100:02d}{(year + 1) % 100:02d}'
    fixtures = db.query(Match).filter(Match.sport_key == league, Match.commence_time >= since,
                                     Match.commence_time < now).all()
    saved = _scores(db, fixtures, since, now, league) if fixtures else {}
    provider = {e.get('id'): e for e in events}
    closes = {c.match_id: c for c in db.query(ClosingLine).filter(
        ClosingLine.league == league, ClosingLine.kickoff_time >= since,
        ClosingLine.market_type == MarketType.H2H)}
    history = {(r.match_date, r.home_team, r.away_team): r for r in db.query(HistoricalMatch).filter(
        HistoricalMatch.league == league, HistoricalMatch.season == season)}
    summary = dict(inserted=0, updated=0, conflicts=0, unpriced=0)
    for match in fixtures:
        event = provider.get(match.id)
        # Provider explicitly says live: hold even if another source claims final.
        if unfinished_status(match) or (event is not None and event.get('completed') is not True):
            continue
        score = confirmed_score(event, match) if event else None
        if score and match.id in saved and score != saved[match.id]:
            summary['conflicts'] += 1
            continue
        score = score or saved.get(match.id)
        if score is None:
            continue
        key = (match.commence_time.date(), match.home_team, match.away_team)
        row = history.get(key)
        if row and row.fthg is not None and row.ftag is not None and (row.fthg, row.ftag) != score:
            summary['conflicts'] += 1
            continue
        new = row is None
        if new:
            row = HistoricalMatch(season=season, league=league, match_date=key[0],
                                  home_team=key[1], away_team=key[2], price_source='missing')
            db.add(row)
            history[key] = row
        result = 'H' if score[0] > score[1] else 'A' if score[1] > score[0] else 'D'
        changed = (row.fthg, row.ftag, row.ftr) != (*score, result)
        row.fthg, row.ftag, row.ftr = *score, result
        close = closes.get(match.id)
        if any(v is None for v in (row.psch, row.pscd, row.psca)) and valid_close(close, match):
            row.psch, row.pscd, row.psca = close.close_home, close.close_draw, close.close_away
            row.price_source = 'steamwatch_close'
            changed = True
        if any(v is None for v in (row.psch, row.pscd, row.psca)):
            summary['unpriced'] += 1
        if new:
            summary['inserted'] += 1
        elif changed:
            summary['updated'] += 1
    db.flush()
    return summary


# A scores request costs 2 Odds API credits. Asking for all five leagues
# every 15 minutes round the clock cost about 29,000 credits a month, most
# of it on days with no football. The provider is now only asked while a
# league has a recent match whose final score is not saved yet.
SCORES_AFTER_KICKOFF = timedelta(minutes=105)   # earliest a match can be over
SCORES_LOOKBACK = timedelta(days=3)             # the provider's own window


def needs_scores(db, league, now=None):
    """True while the league has a played match from the last 3 days with no saved result."""
    now = naive_utc(now or datetime.now(timezone.utc))
    recent = db.query(Match).filter(
        Match.sport_key == league,
        Match.commence_time >= now - SCORES_LOOKBACK,
        Match.commence_time <= now - SCORES_AFTER_KICKOFF).all()
    recent = [m for m in recent if not unfinished_status(m)]
    if not recent:
        return False
    done = {(r.match_date, r.home_team, r.away_team) for r in db.query(HistoricalMatch).filter(
        HistoricalMatch.league == league,
        HistoricalMatch.match_date >= (now - SCORES_LOOKBACK - timedelta(days=1)).date(),
        HistoricalMatch.fthg.isnot(None), HistoricalMatch.ftag.isnot(None))}
    return any((m.commence_time.date(), m.home_team, m.away_team) not in done for m in recent)


async def refresh_bias_results():
    settings = get_settings()
    summary = {'leagues': {}, 'errors': [], 'score_requests': 0}
    # At most five score requests per cycle; no odds or Telegram delivery calls.
    async with httpx.AsyncClient(timeout=30) as client:
        for league in LEAGUE_FILE_CODES:
            events = []
            try:
                with SessionLocal() as db:
                    wanted = needs_scores(db, league)
            except Exception:
                wanted = True      # if the check itself fails, behave as before
            if wanted:
                summary['score_requests'] += 1
                try:
                    response = await client.get(f'{settings.odds_api_base_url}/sports/{league}/scores',
                                                params={'apiKey': settings.odds_api_key, 'daysFrom': 3})
                    response.raise_for_status()
                    events = response.json()
                    if not isinstance(events, list):
                        raise ValueError('Unexpected scores response')
                except Exception as exc:
                    # Exception text may contain the API key in a URL.
                    summary['errors'].append(f'{league}: {type(exc).__name__}')
            # Always run: with no provider events this still repairs prices
            # and recovers results from scores already saved.
            with SessionLocal() as db:
                try:
                    summary['leagues'][league] = sync_league(db, league, events)
                    db.commit()
                except Exception as exc:
                    db.rollback()
                    summary['errors'].append(f'{league}: {type(exc).__name__}')
    return summary
