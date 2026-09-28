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
        if key in EUROPE:
            continue
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
        result.append(dict(upcoming=upcoming,key=key,name=name,opposition_bands=key not in EUROPE,
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

@router.get('/form-lab/table')
def form_table(league: str, window: int=Query(10,ge=1,le=50),
    venue: Literal['all','home','away']='all',
    view: Literal['form','top6','tophalf','bottomhalf','bottom6','handicap','clean','xg']='form',
    db: Session=Depends(get_db)):
    if league not in LEAGUES: raise HTTPException(400,'Unknown competition')
    if league in EUROPE and view in ('top6','tophalf','bottomhalf','bottom6'):
        raise HTTPException(400,'Domestic opposition groups only')
    snapshots=db.query(FormLabSeason).filter_by(league=league).order_by(FormLabSeason.season).all()
    if not snapshots:return {'teams':[]}
    latest=snapshots[-1]
    members=latest.data['standings'] if league not in EUROPE else latest.data['teams']
    previous=snapshots[-2].data['standings'] if len(snapshots)>1 else {}
    output=[]
    for tid in members:
        result=analyze(db,league,int(tid),window,venue,view if view in ('top6','tophalf','bottomhalf','bottom6') else 'all',snapshots=snapshots)
        matches=result['matches'];n=len(matches)
        wins=sum(m['gf']>m['ga'] for m in matches);draws=sum(m['gf']==m['ga'] for m in matches)
        gf=sum(m['gf'] for m in matches);ga=sum(m['ga'] for m in matches)
        cs=sum(m['ga']==0 for m in matches)
        row=dict(id=int(tid),name=latest.data['teams'].get(tid,tid),promoted=league not in EUROPE and bool(previous) and tid not in previous,
            played=n,wins=wins,draws=draws,losses=n-wins-draws,gf=gf,ga=ga,points=3*wins+draws,
            ppg=(3*wins+draws)/n if n else None,clean=cs,clean_pct=100*cs/n if n else None,
            margins=[sum(m['gf']-m['ga']==v for m in matches) for v in (1,2)]+[sum(m['gf']-m['ga']>=3 for m in matches)]+[sum(m['ga']-m['gf']==v for m in matches) for v in (1,2)]+[sum(m['ga']-m['gf']>=3 for m in matches)],
            cover_pct=100*sum(m['gf']-m['ga']>=2 for m in matches)/n if n else None)
        covered=[m for m in matches if m.get('xg') is not None and m.get('xga') is not None]
        count=len(covered)
        xf=sum(m['xg'] for m in covered);xa=sum(m['xga'] for m in covered)
        row.update(xg_games=count,xgf=xf if count else None,xga=xa if count else None,
            xgd=xf-xa if count else None,xgf_avg=xf/count if count else None,
            xga_avg=xa/count if count else None,xgd_avg=(xf-xa)/count if count else None)
        output.append(row)
    metric='xgd_avg' if view=='xg' else 'clean_pct' if view=='clean' else 'cover_pct' if view=='handicap' else 'ppg'
    output.sort(key=lambda r:((r['xg_games'] if view=='xg' else r['played'])<window,r[metric] is None,-(r[metric] if r[metric] is not None else 0),-(r['gf']-r['ga'])/max(r['played'],1),r['name']))
    return {'teams':[dict(r,rank=i+1) for i,r in enumerate(output)],'season':latest.season}
