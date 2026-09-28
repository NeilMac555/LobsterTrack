"""Form Lab: independently collected Sportmonks fixtures, transparent denominators."""
import math
from datetime import datetime
import httpx
from app.config import get_settings
from app.models import FormLabSeason
from app.models.database import SessionLocal
from app.services.european_xg import LEAGUES as EUROPE, MAIN_STAGES, season_name

LEAGUES = {
 'soccer_epl': (8, 'Premier League'), 'soccer_spain_la_liga': (564, 'La Liga'),
 'soccer_germany_bundesliga': (82, 'Bundesliga'), 'soccer_italy_serie_a': (384, 'Serie A'),
 'soccer_france_ligue_one': (301, 'Ligue 1'),
 'soccer_uefa_champs_league': (2, 'Champions League'),
 'soccer_uefa_europa_league': (5, 'Europa League'),
 'soccer_uefa_europa_conference_league': (2286, 'Conference League'),
}

def numeric(value):
    return float(value) if isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value) and value >= 0 else None

def score(f, side, description):
    values=[numeric((s.get('score') or {}).get('goals')) for s in f.get('scores',[]) if s.get('description')==description and (s.get('score') or {}).get('participant')==side]
    return int(values[0]) if len(values)==1 and values[0] is not None and values[0].is_integer() else None

def stat(f, field, tid, pid):
    rows=[v for v in f.get(field,[]) if v.get('type_id')==tid and v.get('participant_id')==pid]
    return numeric((rows[0].get('data') or {}).get('value')) if len(rows)==1 else None

def first_goal(f, h, a):
    if h+a==0:return 'none'
    goals=sorted([e for e in f.get('events',[]) if e.get('type_id') in (14,15,16) and not e.get('rescinded')],key=lambda e:e.get('sort_order') or 0)
    previous=(0,0); first=None
    # Validate the complete score progression, including own goals and penalties.
    # Missing/cancelled/inconsistent event streams yield unknown, never a guess.
    for e in goals:
        try:current=tuple(int(n) for n in e['result'].split('-'))
        except (KeyError,ValueError,AttributeError):return None
        if len(current)!=2:return None
        delta=(current[0]-previous[0],current[1]-previous[1])
        if delta not in ((1,0),(0,1)):return None
        if first is None:first='home' if delta==(1,0) else 'away'
        previous=current
    return first if previous==(h,a) else None

def normalize(f, key, sid, season):
    if f.get('season_id')!=sid or f.get('league_id')!=LEAGUES[key][0]:return None
    state=(f.get('state') or {}).get('developer_name')
    if state not in ('FT','AET','FT_PEN'):return None
    if key in EUROPE and (f.get('stage') or {}).get('name','').lower() not in MAIN_STAGES:return None
    sides={p.get('meta',{}).get('location'):p for p in f.get('participants',[])}
    if 'home' not in sides or 'away' not in sides:return None
    h,a=score(f,'home','2ND_HALF'),score(f,'away','2ND_HALF')
    if h is None and state=='FT':h=score(f,'home','CURRENT')
    if a is None and state=='FT':a=score(f,'away','CURRENT')
    if h is None or a is None or not f.get('starting_at'):return None
    ht_h,ht_a=score(f,'home','1ST_HALF'),score(f,'away','1ST_HALF')
    if ht_h is not None and ht_h>h:ht_h=None
    if ht_a is not None and ht_a>a:ht_a=None
    hp,ap=sides['home'],sides['away']
    return dict(id=f['id'],season=season,date=f['starting_at'],home_id=hp['id'],away_id=ap['id'],home=hp['name'],away=ap['name'],
        hg=h,ag=a,hh=ht_h,ah=ht_a,first=first_goal(f,h,a),
        hx=stat(f,'xgfixture',7943,hp['id']) if state=='FT' else None,ax=stat(f,'xgfixture',7943,ap['id']) if state=='FT' else None,
        hc=stat(f,'statistics',34,hp['id']) if state=='FT' else None,ac=stat(f,'statistics',34,ap['id']) if state=='FT' else None)

async def refresh_form_lab(backfill=False):
    token=get_settings().sportmonks_api_token
    if not token:return {'error':'Sportmonks not configured'}
    year=int(season_name()[:4]); names=[f'{y}/{y+1}' for y in range(year-2,year+1)]
    summary={}
    async with httpx.AsyncClient(base_url='https://api.sportmonks.com/v3/',headers={'Authorization':token,'Accept':'application/json'},timeout=90) as client:
        async def request(path,**params):
            response=await client.get(path,params=params)
            if response.status_code!=200:raise ValueError('Provider request failed')
            payload=response.json()
            if 'data' not in payload:raise ValueError('Provider data absent')
            return payload
        for key,(lid,_) in LEAGUES.items():
            try:
                league=(await request(f'football/leagues/{lid}',include='seasons'))['data']
                for season in sorted([s for s in league.get('seasons',[]) if s.get('name') in names],key=lambda s:s['name']):
                    name=season['name'];identity=key+':'+name
                    with SessionLocal() as db:
                        existing=db.get(FormLabSeason,identity)
                        if existing and name!=season_name() and not backfill:continue
                    data=(await request(f"football/seasons/{season['id']}",include='fixtures.participants;fixtures.scores;fixtures.events;fixtures.state;fixtures.statistics;fixtures.xGFixture;fixtures.stage'))['data']
                    if 'fixtures' not in data:raise ValueError('Fixtures absent')
                    rows={}
                    upcoming=[]
                    teams={}
                    for fixture in data['fixtures']:
                        for team in fixture.get('participants',[]):teams[str(team['id'])]=team['name']
                        if (fixture.get('state') or {}).get('developer_name')=='NS':
                            sides={p.get('meta',{}).get('location'):p for p in fixture.get('participants',[])}
                            stage=(fixture.get('stage') or {}).get('name','').lower()
                            if 'home' in sides and 'away' in sides and fixture.get('starting_at') and (key not in EUROPE or stage in MAIN_STAGES):
                                upcoming.append(dict(id=fixture['id'],date=fixture['starting_at'],home_id=sides['home']['id'],away_id=sides['away']['id'],home=sides['home']['name'],away=sides['away']['name'],round_id=fixture.get('round_id')))
                        row=normalize(fixture,key,season['id'],name)
                        if row:rows[row['id']]=row
                    standings={}
                    if key not in EUROPE:
                        for page in range(1,5):
                            payload=await request(f"football/standings/seasons/{season['id']}",page=page,per_page=50)
                            for standing in payload['data']:standings[str(standing['participant_id'])]=standing['position']
                            if not (payload.get('pagination') or {}).get('has_more'):break
                        else:raise ValueError('Standings pagination incomplete')
                    with SessionLocal() as db:
                        old=db.get(FormLabSeason,identity)
                        if old and not {f['id'] for f in old.data['fixtures']}.issubset(rows):raise ValueError('Fixture list shrank')
                        db.merge(FormLabSeason(key=identity,league=key,season=name,updated_at=datetime.utcnow(),data={'fixtures':sorted(rows.values(),key=lambda f:(f['date'],f['id'])),'teams':teams,'standings':standings,'upcoming':upcoming}))
                        db.commit()
                    summary[identity]=len(rows)
            except Exception:
                summary[key]={'error':'Refresh failed; previous data retained'}
    return summary

def strength_tables(snapshots):
    """Season-end/latest strength, using a 20-game window and 1 PPG prior.

    Only consecutive top-flight seasons count; a relegation gap resets history.
    Historical seasons never use results from later seasons.
    """
    output={}
    ordered=sorted(snapshots,key=lambda s:s.season)
    for index, snapshot in enumerate(ordered):
        members=snapshot.data['standings']
        ratings=[]
        for tid in members:
            fixtures={}
            for previous in reversed(ordered[:index+1]):
                if tid not in previous.data['standings']:break
                for f in previous.data['fixtures']:
                    if int(tid) in (f['home_id'],f['away_id']):fixtures[f['id']]=f
            recent=sorted(fixtures.values(),key=lambda f:(f['date'],f['id']),reverse=True)[:20]
            points=0;difference=0;goals=0
            for f in recent:
                gf,ga=(f['hg'],f['ag']) if f['home_id']==int(tid) else (f['ag'],f['hg'])
                points+=3 if gf>ga else 1 if gf==ga else 0
                difference+=gf-ga;goals+=gf
            # Each unobserved slot contributes a provisional one-point estimate.
            ppg=(points+20-len(recent))/20
            ratings.append(dict(id=int(tid),ppg=ppg,matches=len(recent),prior_matches=20-len(recent),gd=difference/20,gf=goals/20))
        ratings.sort(key=lambda r:(-r['ppg'],-r['gd'],-r['gf'],r['id']))
        output[snapshot.season]={str(r['id']):dict(r,rank=i+1) for i,r in enumerate(ratings)}
    return output

def analyze(db,league,team_id,window=10,venue='all',opposition='all',season='all',handicap=-1.5):
    snapshots=db.query(FormLabSeason).filter(FormLabSeason.league==league).order_by(FormLabSeason.season).all()
    strengths=strength_tables(snapshots) if league not in EUROPE else {}
    candidates=[];unclassified=0
    for snapshot in snapshots:
        if season!='all' and snapshot.season!=season:continue
        table=strengths.get(snapshot.season,{});count=len(table)
        for f in snapshot.data['fixtures']:
            if team_id not in (f['home_id'],f['away_id']):continue
            home=f['home_id']==team_id
            if venue!='all' and venue!=('home' if home else 'away'):continue
            opp=str(f['away_id'] if home else f['home_id']);rank=(table.get(opp) or {}).get('rank')
            if opposition!='all':
                if rank is None or not count:unclassified+=1;continue
                match={'top6':rank<=6,'tophalf':rank<=count//2,'bottomhalf':rank>count//2,'bottom6':rank>count-6}[opposition]
                if not match:continue
            gf,ga=(f['hg'],f['ag']) if home else (f['ag'],f['hg'])
            hf,ha=(f['hh'],f['ah']) if home else (f['ah'],f['hh'])
            sf,sa=(gf-hf,ga-ha) if hf is not None and ha is not None else (None,None)
            xg,xga=(f['hx'],f['ax']) if home else (f['ax'],f['hx'])
            cf,ca=(f['hc'],f['ac']) if home else (f['ac'],f['hc'])
            first=None if f['first'] is None else ('none' if f['first']=='none' else 'for' if f['first']==('home' if home else 'away') else 'against')
            candidates.append(dict(id=f['id'],date=f['date'],season=f['season'],opponent=f['away'] if home else f['home'],opponent_rank=rank,venue='H' if home else 'A',gf=gf,ga=ga,hf=hf,ha=ha,sf=sf,sa=sa,xg=xg,xga=xga,cf=cf,ca=ca,first=first))
    candidates.sort(key=lambda f:(f['date'],f['id']),reverse=True);rows=candidates[:window];metrics=[]
    def rate(group,label,predicate,eligible=lambda r:True):
        valid=[r for r in rows if eligible(r)];hits=sum(bool(predicate(r)) for r in valid)
        metrics.append(dict(group=group,label=label,count=hits,n=len(valid),value=round(100*hits/len(valid),1) if valid else None,kind='rate'))
    def average(group,label,key):
        values=[r[key] for r in rows if r[key] is not None]
        metrics.append(dict(group=group,label=label,n=len(values),value=round(sum(values)/len(values),2) if values else None,kind='average'))
    rate('Results','Win',lambda r:r['gf']>r['ga']);rate('Results','Draw',lambda r:r['gf']==r['ga']);rate('Results','Loss',lambda r:r['gf']<r['ga'])
    average('Goals','Goals scored','gf');average('Goals','Goals conceded','ga')
    for line in [1.5,2.5,3.5,4.5]:rate('Goals',f'Over {line} goals',lambda r,l=line:r['gf']+r['ga']>l)
    rate('Goals','Under 2.5 goals',lambda r:r['gf']+r['ga']<2.5)
    rate('Goals','BTTS',lambda r:r['gf']>0 and r['ga']>0)
    rate('Goals','Clean sheet',lambda r:r['ga']==0);rate('Goals','Failed to score',lambda r:r['gf']==0)
    rate('Goals','Win to nil',lambda r:r['gf']>0 and r['ga']==0)
    rate('Goals','Team scored 2+',lambda r:r['gf']>=2);rate('Goals','Team conceded 2+',lambda r:r['ga']>=2)
    for line in [-1.5,-2.5]:rate('Handicaps',f'Cover {line:+g}',lambda r,l=line:r['gf']+l>r['ga'])
    rate('Handicaps',f'Selected {handicap:+g}: win',lambda r:r['gf']+handicap>r['ga'])
    rate('Handicaps',f'Selected {handicap:+g}: push',lambda r:r['gf']+handicap==r['ga'])
    rate('Handicaps',f'Selected {handicap:+g}: loss',lambda r:r['gf']+handicap<r['ga'])
    half=lambda r:r['hf'] is not None and r['ha'] is not None
    for label,key in [('1H scored','hf'),('1H conceded','ha'),('2H scored','sf'),('2H conceded','sa')]:
        average('Halves',label+' average',key);rate('Halves',label,lambda r,k=key:r[k]>0,half)
    rate('Halves','1H over 0.5 goals',lambda r:r['hf']+r['ha']>0,half)
    rate('Halves','1H over 1.5 goals',lambda r:r['hf']+r['ha']>1,half)
    rate('Halves','2H over 1.5 goals',lambda r:r['sf']+r['sa']>1,half)
    rate('Halves','Scored in both halves',lambda r:r['hf']>0 and r['sf']>0,half)
    rate('Halves','Conceded in both halves',lambda r:r['ha']>0 and r['sa']>0,half)
    first=lambda r:r['first'] is not None
    rate('First goal','Scored first',lambda r:r['first']=='for',first)
    rate('First goal','Conceded first',lambda r:r['first']=='against',first)
    rate('First goal','No goals (0–0)',lambda r:r['gf']+r['ga']==0)
    rate('First goal','Won after scoring first',lambda r:r['gf']>r['ga'],lambda r:r['first']=='for')
    rate('First goal','Avoided defeat after conceding first',lambda r:r['gf']>=r['ga'],lambda r:r['first']=='against')
    average('Underlying','npxG for','xg');average('Underlying','npxG against','xga')
    average('Corners','Corners for','cf');average('Corners','Corners against','ca')
    for line in [8.5,9.5,10.5]:rate('Corners',f'Over {line} corners',lambda r,l=line:r['cf']+r['ca']>l,lambda r:r['cf'] is not None and r['ca'] is not None)
    return dict(sample=len(rows),available=len(candidates),requested=window,unclassified=unclassified,metrics=metrics,matches=rows,strength_groups=[dict(season=s.season,teams=[dict(v,name=s.data['teams'].get(k,k)) for k,v in strengths.get(s.season,{}).items()]) for s in reversed(snapshots) if season=='all' or s.season==season])
