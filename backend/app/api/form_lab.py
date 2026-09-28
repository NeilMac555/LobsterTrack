from typing import Literal
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.models import get_db, FormLabSeason
from app.services.form_lab import LEAGUES, EUROPE, analyze
router = APIRouter()

@router.get('/form-lab/catalog')
def catalog(db: Session = Depends(get_db)):
    result=[]
    for key, (_, name) in LEAGUES.items():
        rows=db.query(FormLabSeason).filter_by(league=key).order_by(FormLabSeason.season.desc()).all()
        teams={}
        for row in reversed(rows): teams.update(row.data['teams'])
        now=datetime.utcnow()
        upcoming=sorted([f for r in rows for f in r.data.get('upcoming',[]) if f['date']>now.strftime('%Y-%m-%d %H:%M:%S')],key=lambda f:(f['date'],f['id']))
        if upcoming:
            first=upcoming[0]
            if first.get('round_id'):
                upcoming=[f for f in upcoming if f.get('round_id')==first['round_id']]
            else:
                end=datetime.fromisoformat(first['date'])+timedelta(days=7)
                upcoming=[f for f in upcoming if datetime.fromisoformat(f['date'])<end]
        result.append(dict(upcoming=upcoming,(key=key,name=name,opposition_bands=key not in EUROPE,
            seasons=[r.season for r in rows],updated_at=rows[0].updated_at if rows else None,
            teams=[dict(id=int(k),name=v) for k,v in sorted(teams.items(),key=lambda x:x[1])]))
    return result

@router.get('/form-lab/analysis')
def analysis(league: str, team_id: int, window: int = Query(10,ge=1,le=50),
    venue: Literal['all','home','away']='all',
    opposition: Literal['all','top6','tophalf','bottomhalf','bottom6']='all',
    season: str='all', handicap: float=Query(-1.5,ge=-4,le=4), db: Session=Depends(get_db)):
    if league not in LEAGUES: raise HTTPException(400,'Unknown competition')
    if league in EUROPE and opposition!='all': raise HTTPException(400,'Domestic ranking bands are unavailable for European fixtures')
    if handicap*2 != int(handicap*2): raise HTTPException(400,'Choose a whole or half-goal handicap')
    return analyze(db,league,team_id,window,venue,opposition,season,handicap)
