"""Read-only consensus ranking; raw rating scales are never averaged."""
from collections import defaultdict
import math
from pathlib import Path
import re
import unicodedata
import httpx
from . import europe_pitchrank, club_performance
from .data import utc, utcnow
import numpy as np
from . import europe_data as data, europe_reference as eci_source, europe_clubelo as elo_source
from .sportmonks import ProviderError, write_json, now

DRIBLAB_IDS = {19:1928,78:2019,236:8561,67:3657,90:3663,794:3653,2708:3658,3321:3659,79:7195,591:7186,776:61284,267:62071,268:69854,4070:62066,429:10016,9818:61597,88:62162,682:7966,1668:65693,53:62154,112:62243,118:64226,368:62614,554:62170,602:61315,605:61318,674:61951,2510:61346,2555:20110,3357:61793,3958:62559,7067:154305}
ELO_ALIASES = {78:'Brighton',3958:'St Gillis',79:'Lyon',44:'Marseille',602:'Olympiakos',90:'Augsburg',117:'Coventry',116:'Ipswich',2975:'Alaves',1079:'Union Berlin',22:'Hull',3320:'Köln',302:'Lech',429:'Depor',9818:'Santander',368:'Omonia',49:'RB Salzburg',494:'Nijmegen',67:'Schalke',776:'Angers',890:'Jagiellonia',516:'Beer-Sheva',3223:'Levski'}
PITCH_NAMES = {503:'Bayern Munich',2930:'Inter Milan',78:'Brighton and Hove Albion',58:'Sporting Lisbon',3321:'Bayer Leverkusen',708:'Atalanta BC',682:'PSV Eindhoven',13258:'Athletic Bilbao',36:'Celta Vigo',429:'Deportivo La Coruña'}
COUNTRIES = {**eci_source.COUNTRIES, 'Bulgaria':'BUL','Cyprus':'CYP','Israel':'ISR','Poland':'POL','Hungary':'HUN','Slovenia':'SVN','Armenia':'ARM','Croatia':'CRO'}

def key(s):
    return re.sub('[^a-z0-9]', '', unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower())


UNDERSTAT_NAMES = {'Coventry':'Coventry City','Ipswich':'Ipswich Town','Hull':'Hull City','Deportivo La Coruna':'Deportivo A Coruña','Barcelona':'FC Barcelona','Atletico Madrid':'Atlético de Madrid','Alaves':'Deportivo Alavés','Celta Vigo':'Celta de Vigo','Bayern Munich':'FC Bayern München','Bayer Leverkusen':'Bayer 04 Leverkusen','RasenBallsport Leipzig':'RB Leipzig','Hoffenheim':'TSG Hoffenheim','Mainz 05':'FSV Mainz 05','Freiburg':'SC Freiburg','Union Berlin':'FC Union Berlin','FC Cologne':'FC Köln','Borussia M.Gladbach':'Borussia Mönchengladbach','Augsburg':'FC Augsburg','Brighton':'Brighton & Hove Albion','Bournemouth':'AFC Bournemouth','Leeds':'Leeds United','Tottenham':'Tottenham Hotspur','Parma Calcio 1913':'Parma','Marseille':'Olympique Marseille','Lille':'LOSC Lille','Lyon':'Olympique Lyonnais','Paris FC':'Paris','Angers':'Angers SCO'}



def overview(directory=data.DIRECTORY):
    roster=data.read(directory/'club-board/roster.json')
    warnings=[]
    def source(path,label):
        try:
            value=data.read(directory/path)
            age=(utcnow()-utc(value['observed_at'])).total_seconds()/86400
            if age<0 or age>30:
                warnings.append(label+': snapshot unavailable for blending (age outside 0–30 days)')
                return {'teams':[], 'observed_at':value['observed_at']}
            if age>14:warnings.append(label+': over 14 days old')
            return value
        except (OSError, ValueError, KeyError, TypeError):
            warnings.append(label+': snapshot missing or invalid')
            return {'teams':[], 'observed_at':None}
    eci=source('eci/current.json','ECI'); elo=source('clubelo/current.json','Club Elo')
    dl=source('driblab/ratings.json','Driblab'); pitch=source('pitchrank/current.json','PitchRank')
    fitted=data.read(directory/'fit.json')['ratings'] if (directory/'fit.json').exists() else {}
    ec={r['id']:r for r in eci['teams']}
    rows=[]
    for team in roster['teams']:
        r=ec.get(team.get('eci_id')); old=fitted.get(str(team['id']),{})
        names={key(n) for n in [team['name'],r['name'] if r else '',old.get('clubelo',{}).get('name',''),eci_source.ELO_NAMES.get(team['name'],'')] if n}
        country=COUNTRIES.get(r['country']) if r else {'Le Mans':'FRA','Torreense':'POR'}.get(team['name'])
        es=[z for z in elo['teams'] if key(z['name']) in names | ({key(ELO_ALIASES[team['id']])} if team['id'] in ELO_ALIASES else set()) and (not country or z['country']==country)]
        ds=[z for z in dl['teams'] if z['teamId']==DRIBLAB_IDS[team['id']]] if team['id'] in DRIBLAB_IDS else [z for z in dl['teams'] if key(z['teamName']) in names]
        # Existing verified Elo snapshot identity disambiguates only exact name/country.
        if len(es)!=1 and old.get('clubelo'):
            known=old['clubelo'];es=[z for z in elo['teams'] if z['name']==known['name'] and z['country']==known['country']]
        values={}
        if r:values['ECI']=r['points']
        if len(es)==1:values['Club Elo']=es[0]['points']
        if len(ds)==1:values['Driblab']=ds[0]['elo']
        ps=[z for z in pitch['teams'] if key(z['name']) in names | ({key(PITCH_NAMES[team['id']])} if team['id'] in PITCH_NAMES else set()) | ({key(ELO_ALIASES[team['id']])} if team['id'] in ELO_ALIASES else set()) and 0 <= (utcnow().date()-utc(z['date']).date()).days <= 14]
        if len(ps)==1:values['PitchRank']=ps[0]['points']
        if not values or any(not math.isfinite(float(v)) for v in values.values()):
            cached=directory/'club-board/last-good.json'
            if cached.exists():
                board=data.read(cached)
                board['warnings']=warnings+['Showing the last complete board: no valid current rating for '+team['name']]
                board['stale']=True
                return board
            raise ProviderError('No valid rating for '+team['name'])
        rows.append({**team,'sources':values})
    scale_path=directory/'club-board/external-scale-v1.json'
    calibration=data.read(scale_path) if scale_path.exists() else data.read(Path(__file__).with_name('club-calibration-v1.json'))['external']
    scales=calibration['scales']
    anchors=calibration['anchors']
    for row in rows:
        zs=[(v-scales[s]['centre'])/scales[s]['spread'] for s,v in row['sources'].items()]
        row['score']=float(1500+200*np.mean(zs));row['weights']={s:1/len(zs) for s in row['sources']}
        row['source_spread']=float(200*np.std(zs))
    warnings.extend(club_performance.apply(rows, directory, key, UNDERSTAT_NAMES))
    rows.sort(key=lambda r:(-r['score'],r['name']))
    for i,r in enumerate(rows,1):
        r['rank']=i
        r['tier']='Elite' if r['score']>=1850 else 'Contenders' if r['score']>=1800 else 'Strong' if r['score']>=1650 else 'Competitive' if r['score']>=1500 else 'Outsiders' if r['score']>=1350 else 'Lower rated'
    return {'teams':rows,'season':roster['season'],'anchors':anchors,'scales':scales,'warnings':warnings,'as_of':now(),'stale':False,
            'observed_at':{'ECI':eci['observed_at'],'Club Elo':elo['observed_at'],'Driblab':dl['observed_at'],'PitchRank':pitch['observed_at']},
            'used_in_match_price':False,'method':'Fixed-scale external consensus with rolling opponent/venue-adjusted non-penalty xG. 180-day half-life; performance weight up to 50%, reduced for sparse or stale data. Provisional calibration.'}


def refresh(directory=data.DIRECTORY):
    results={}
    for label,fn in [('ECI',eci_source.refresh),('Club Elo',elo_source.refresh),('PitchRank',europe_pitchrank.refresh)]:
        try:fn(directory);results[label]='Updated'
        except ProviderError as e:results[label]=str(e)
    try:
        response=httpx.get('https://the90lab.com/api/team/global/teams',timeout=25);response.raise_for_status();rows=response.json()
        if not isinstance(rows,list) or len(rows)<100 or len({r['teamId'] for r in rows})!=len(rows):raise ValueError()
        if any(not math.isfinite(float(r['elo'])) for r in rows):raise ValueError()
        snapshot={'observed_at':now(),'teams':rows}
        write_json(directory/'driblab/ratings-snapshots'/(data.digest(snapshot)+'.json'),snapshot)
        write_json(directory/'driblab/ratings.json',snapshot);results['Driblab']='Updated'
    except (httpx.HTTPError,ValueError,KeyError,TypeError):results['Driblab']='Refresh failed; previous snapshot retained.'
    results.update(club_performance.refresh(directory,force=True))
    board=overview(directory)
    if not board.get('stale'):
        write_json(directory/'club-board/last-good.json',board)
        write_json(directory/'club-board/history'/(data.digest(board)+'.json'),board)
    return {'results':results,'board':board}
