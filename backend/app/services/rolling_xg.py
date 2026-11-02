"""Domestic rolling total xG from the daily Sportmonks fixture snapshots used by Form Lab."""
from datetime import datetime, timedelta

from app.models import FormLabSeason
from app.services.european_xg import LEAGUES as EUROPE, season_name
from app.services.form_lab import LEAGUES, numeric


DOMESTIC = tuple(key for key in LEAGUES if key not in EUROPE)


def season_code(name):
    start, end = name.split('/')
    return start[-2:] + end[-2:]


def snapshot(db, league, season):
    if league not in DOMESTIC:
        return None
    return db.get(FormLabSeason, f'{league}:{season}')


def team_series(db, league, team, season):
    current = snapshot(db, league, season)
    result = dict(team_name=team, league=league, source='Sportmonks', metric='xG', season=season_code(season),
                  updated_at=current.updated_at.isoformat() + 'Z' if current else None, data=[])
    if current is None:
        return result
    ids = [int(i) for i, name in current.data['teams'].items() if name == team]
    if len(ids) != 1:
        return result
    year = int(season[:4])
    previous = snapshot(db, league, f'{year - 1}/{year}')
    team_id = ids[0]
    for saved in (previous, current):
        if saved is None:
            continue
        matches = (f for f in saved.data['fixtures'] if team_id in (f['home_id'], f['away_id']))
        for number, fixture in enumerate(sorted(matches, key=lambda f: (f['date'], f['id'])), 1):
            home = fixture['home_id'] == team_id
            created = numeric(fixture.get('home_xg' if home else 'away_xg'))
            conceded = numeric(fixture.get('away_xg' if home else 'home_xg'))
            result['data'].append(dict(team_name=team, league=league, season=season_code(saved.season),
                match_number=number, match_date=fixture['date'], xg_for=created, xg_against=conceded))
    return result


def refresh_health(db):
    """Read the publication timestamps so restarting the server does not reset health."""
    season = season_name()
    now = datetime.utcnow()
    times, errors, leagues = [], [], {}
    for league in DOMESTIC:
        saved = snapshot(db, league, season)
        if saved is None:
            errors.append(f'{league}: no snapshot for {season}')
            continue
        times.append(saved.updated_at)
        fixtures = saved.data['fixtures']
        complete = sum(f.get('home_xg') is not None and f.get('away_xg') is not None for f in fixtures)
        leagues[league] = dict(rows=complete, teams=len(saved.data['teams']),
                               missing_fixtures=len(fixtures) - complete)
        if fixtures and not complete:
            errors.append(f'{league}: total xG unavailable for all completed fixtures')
        if now - saved.updated_at > timedelta(hours=36):
            errors.append(f'{league}: last refresh is over 36 hours old')
    oldest = min(times) if times else None
    return dict(last_run_at=oldest.isoformat() + 'Z' if oldest else None,
                seconds_since_last_run=int((now - oldest).total_seconds()) if oldest else None,
                last_error='; '.join(errors) or None, schedule='Sportmonks daily at 06:45 UTC',
                summary=dict(leagues=leagues, total_fixtures=sum(v['rows'] for v in leagues.values()), errors=errors))
