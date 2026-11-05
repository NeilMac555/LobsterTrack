"""Rolling opponent/venue-adjusted non-penalty performance, domestic only."""
from datetime import timedelta
import numpy as np
from app.models import FormLabSeason
from app.services.form_lab import LEAGUES as FORM_LEAGUES, numeric
from app.services.rolling_xg import DOMESTIC
from .data import utc, utcnow
from . import europe_data as data
from .sportmonks import ProviderError, write_json, now

LEAGUES = {'EPL':'Premier League','La_liga':'La Liga','Bundesliga':'Bundesliga',
           'Serie_A':'Serie A','Ligue_1':'Ligue 1'}
HALF_LIFE = 180
PRIOR_MATCHES = 8
MAX_WEIGHT = .5
VERSION = 'rolling-npxg-1'


def sportmonks_seasons(db, as_of):
    """Read the current and previous domestic season by stable participant ID."""
    year = as_of.year - (as_of.month < 7)
    seasons = [f"{start}/{start+1}" for start in (year-1, year)]
    saved = db.query(FormLabSeason).filter(FormLabSeason.league.in_(DOMESTIC),
                                           FormLabSeason.season.in_(seasons)).all()
    by_key = {(row.league, row.season): row for row in saved}
    if not saved:
        raise ProviderError("Sportmonks performance snapshots have not been populated.")
    feeds = {}
    for key in DOMESTIC:
        league = FORM_LEAGUES[key][1]
        feeds[league] = []
        for season in seasons:
            snapshot = by_key.get((key, season))
            if snapshot is None:
                raise ProviderError(f"Missing Sportmonks performance snapshot for {league} {season}.")
            fixtures = snapshot.data["fixtures"]
            matches = [dict(match_id=f["id"], date=f["date"], season=season,
                            home=f["home_id"], away=f["away_id"], home_npxg=f["hx"], away_npxg=f["ax"])
                       for f in fixtures if numeric(f.get("hx")) is not None and numeric(f.get("ax")) is not None]
            if fixtures and not matches:
                raise ProviderError(f"Sportmonks non-penalty xG is unavailable for {league} {season}.")
            feeds[league].append(dict(observed_at=snapshot.updated_at.isoformat()+"Z",
                                      season=season[:4], matches=matches, missing=len(fixtures)-len(matches)))
    return feeds


def fit_league(matches, as_of):
    """Weighted ridge: npxG = intercept + attack(team) + concede(opponent) + HFA.

    Both sides of each fixture are observations. Ratings are neutral-venue
    attack minus concession; ridge identifies the centred effects and prevents
    sparse promoted-team estimates exploding. This is not a goal probability fit.
    """
    matches = [m for m in matches if 0 <= (as_of-utc(m['date'])).total_seconds()/86400 <= 730]
    names = sorted({m[s] for m in matches for s in ('home','away')})
    if len(matches)<20 or len(names)<10:
        return {}
    ids = {n:i for i,n in enumerate(names)}; n=len(names)
    x=[]; y=[]; weights=[]; support={name:[] for name in names}
    for m in matches:
        w = 2**(-((as_of-utc(m['date'])).total_seconds()/86400)/HALF_LIFE)
        for side, opp in [('home','away'),('away','home')]:
            row=np.zeros(2*n+2);row[0]=1;row[1]=.5 if side=='home' else -.5
            row[2+ids[m[side]]]=1;row[2+n+ids[m[opp]]]=1
            x.append(row);y.append(m[side+'_npxg']);weights.append(w)
            support[m[side]].append((w,m[side+'_npxg'],m[opp+'_npxg'],m['date'],m['season']))
    x=np.array(x); y=np.array(y); weights=np.array(weights)
    # Do not shrink league-wide home advantage into individual team effects.
    penalty=np.eye(2*n+2); penalty[0,0]=1e-8;penalty[1,1]=1e-8
    beta=np.linalg.solve(x.T@(weights[:,None]*x)+penalty, x.T@(weights*y))
    result={}
    for name,i in ids.items():
        history=support[name]; mass=sum(r[0] for r in history)
        attack=float(beta[2+i]); concede=float(beta[2+n+i])
        result[name]={'adjusted_npxgd':attack-concede,'attack':attack,'concede':concede,
                      'npxg_for':sum(w*f for w,f,_,_,_ in history)/mass,
                      'npxg_against':sum(w*a for w,_,a,_,_ in history)/mass,
                      'games':len(history),'weighted_matches':mass,
                      'effective_matches':mass**2/sum(r[0]**2 for r in history),
                      'latest':max(r[3] for r in history), 'seasons':sorted({r[4] for r in history}),
                      'home_advantage_npxg':float(beta[1])}
    return result


def apply(rows, directory, normalise, aliases, feeds=None):
    root=directory/'understat/rolling'; as_of=utcnow(); reports=[]
    # Only the reviewed historical launch seed uses the legacy scale and names.
    scale_file = "performance-scale-sportmonks-v1.json" if feeds is not None else "performance-scale-v1.json"
    calibration_path = directory / "club-board" / scale_file
    calibration = data.read(calibration_path) if calibration_path.exists() else {}
    changed=False
    for slug,league in LEAGUES.items():
        snapshots = (feeds[league] if feeds is not None else
                     [data.read(p) for p in sorted(root.glob(f'{slug}-*.json'))])
        if not snapshots:
            reports.append(f'{league}: no performance snapshot');continue
        current_year=as_of.year-(as_of.month<7)
        current=next((s for s in snapshots if s['season']==str(current_year)),None)
        stale=not current or (as_of-utc(current['observed_at'])).days>14
        if stale:
            reports.append(f'{league}: current-season feed missing or over 14 days old; performance weight reduced')
        matches={m['match_id']:m for s in snapshots for m in s['matches']}
        fitted=fit_league(list(matches.values()),as_of)
        if feeds is not None:
            pairs = [(r, fitted[r['id']]) for r in rows if league in r['competitions'] and r['id'] in fitted]
            missing = sum(s['missing'] for s in snapshots)
            if missing:
                reports.append(f"{league}: {missing} fixtures lack paired non-penalty xG.")
        else:
            by_name = {normalise(aliases.get(name, name)):stat for name,stat in fitted.items()}
            pairs = [(r,by_name[normalise(r['name'])]) for r in rows
                     if league in r['competitions'] and normalise(r['name']) in by_name]
        # Fix the conversion at first valid calibration, rather than re-stretch
        # every refresh when clubs enter or leave the reference population.
        if league not in calibration:
            anchors=[(r,s) for r,s in pairs if s['games']>=20]
            if len(anchors)<10:
                reports.append(f'{league}: insufficient calibration coverage');continue
            performance=np.array([s['adjusted_npxgd'] for _,s in anchors]);base=np.array([r['score'] for r,_ in anchors])
            if performance.std()<.05:
                continue
            calibration[league]={'centre':float(performance.mean()),'base':float(base.mean()),
                                 'slope':float(base.std()/performance.std()), 'observed_at':now(),
                                 'clubs':[r['id'] for r,_ in anchors]};changed=True
        scale=calibration[league]
        ranked=sorted(pairs,key=lambda pair:-pair[1]['adjusted_npxgd'])
        for rank,(row,stat) in enumerate(ranked,1):
            target=scale['base']+scale['slope']*(stat['adjusted_npxgd']-scale['centre'])
            weight=MAX_WEIGHT*stat['weighted_matches']/(stat['weighted_matches']+PRIOR_MATCHES)
            if stale: weight*=.5
            delta=weight*(target-row['score'])
            row['performance']={**stat,'league':league,'rank':rank,'weight':weight,'score_change':delta,
                                'rating_contribution':target, 'source':'Sportmonks' if feeds is not None else 'Understat',
                                'url':'https://www.sportmonks.com/' if feeds is not None else f'https://understat.com/league/{slug}',
                                'observed_at':current['observed_at'] if current else max(s['observed_at'] for s in snapshots),'stale':stale,
                                'half_life_days':HALF_LIFE,'version':VERSION}
            row['score']+=delta
            row['weights']={s:w*(1-weight) for s,w in row['weights'].items()}
    if changed:write_json(calibration_path,calibration)
    return reports
