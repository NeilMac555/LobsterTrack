"""Season-to-date European npxG; main competition only, no domestic blending."""
import math
from datetime import datetime
import httpx
from app.config import get_settings
from app.models import EuropeanXG
from app.models.database import SessionLocal

LEAGUES = {'soccer_uefa_champs_league': 2, 'soccer_uefa_europa_league': 5,
           'soccer_uefa_europa_conference_league': 2286}
MAIN_STAGES = {'league stage', 'league phase', 'knockout round play-offs',
               'knockout phase play-offs', 'round of 16', 'quarter-finals', 'semi-finals', 'final'}

def season_name(now=None):
    now = now or datetime.utcnow()
    year = now.year if now.month >= 7 else now.year - 1
    return f'{year}/{year+1}'

def metric(fixture, team_id):
    rows = [r for r in fixture.get('xgfixture', []) if r.get('type_id') == 7943 and r.get('participant_id') == team_id]
    if len(rows) != 1:
        return None
    value = (rows[0].get('data') or {}).get('value')
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        return None
    return float(value)

def normalize(fixtures, league_id, season_id):
    output = {}
    for f in fixtures:
        if f.get('league_id') != league_id or f.get('season_id') != season_id:
            continue
        stage = (f.get('stage') or {}).get('name', '')
        if stage.lower() not in MAIN_STAGES:
            continue
        # Full-time only. Extra-time totals cannot be represented as 90-minute npxG.
        state = (f.get('state') or {}).get('developer_name')
        if state not in ('FT', 'AET', 'FT_PEN'):
            continue
        sides = {p.get('meta', {}).get('location'): p for p in f.get('participants', [])}
        if 'home' not in sides or 'away' not in sides or not f.get('starting_at'):
            raise ValueError('Incomplete fixture identity')
        h, a = sides['home'], sides['away']
        hx = metric(f, h['id']) if state == 'FT' else None
        ax = metric(f, a['id']) if state == 'FT' else None
        output[f['id']] = dict(id=f['id'], date=f['starting_at'], stage=stage,
            home=h['name'], away=a['name'], home_npxg=hx, away_npxg=ax,
            missing_reason='Extra-time match: 90-minute xG unavailable' if state != 'FT' else
                ('Non-penalty xG not supplied' if hx is None or ax is None else None))
    return sorted(output.values(), key=lambda f: (f['date'], f['id']))

async def refresh_european_xg(token=None):
    token = token or get_settings().sportmonks_api_token
    if not token:
        return {'status': 'not_configured'}
    summary = {}
    async with httpx.AsyncClient(base_url='https://api.sportmonks.com/v3/',
            headers={'Authorization': token, 'Accept': 'application/json'}, timeout=60) as client:
        async def get(path, include):
            response = await client.get(path, params={'include': include})
            if response.status_code != 200:
                raise ValueError(f'Provider returned HTTP {response.status_code}')
            payload = response.json()
            if not isinstance(payload.get('data'), dict):
                raise ValueError('Invalid provider response')
            return payload['data']
        for key, league_id in LEAGUES.items():
            try:
                league = await get(f'football/leagues/{league_id}', 'seasons')
                seasons = [s for s in league.get('seasons', []) if s.get('name') == season_name()]
                if len(seasons) != 1:
                    raise ValueError('Current season not available')
                sid = seasons[0]['id']
                data = await get(f'football/seasons/{sid}', 'fixtures.participants;fixtures.stage;fixtures.xGFixture;fixtures.state')
                if 'fixtures' not in data:
                    raise ValueError('Fixture list missing')
                fixtures = normalize(data['fixtures'], league_id, sid)
                with SessionLocal() as db:
                    identity = key + ':' + season_name()
                    existing = db.get(EuropeanXG, identity)
                    if existing and not {f['id'] for f in existing.fixtures}.issubset({f['id'] for f in fixtures}):
                        raise ValueError('Incomplete response: previous fixtures retained')
                    db.merge(EuropeanXG(key=identity, league=key, season=season_name(),
                        refreshed_at=datetime.utcnow(), fixtures=fixtures))
                    db.commit()
                summary[key] = {'completed': len(fixtures), 'with_npxg': sum(f['missing_reason'] is None for f in fixtures)}
            except Exception:
                # Never log credential-bearing request objects. Preserve the last snapshot on failure.
                summary[key] = {'error': 'Refresh failed; previous snapshot retained'}
    return summary
