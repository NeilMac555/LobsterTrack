import json, math, statistics, html, os
from pathlib import Path
from collections import defaultdict, Counter
from datetime import datetime, timezone
ROOT=Path(__file__).resolve().parent
OUT=Path(os.environ.get('MANAGER_OUTPUT_DIR', str(ROOT.parents[1]/'outputs')))
DOM={8:'Premier League',82:'Bundesliga',301:'Ligue 1',384:'Serie A',564:'La Liga'}
NOW=os.environ.get('MANAGER_AS_OF') or datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
START='2016-07-01'
today=datetime.fromisoformat(NOW).date()
try:
    RECENT_START=today.replace(year=today.year-1).isoformat()
except ValueError:
    RECENT_START=today.replace(year=today.year-1,day=28).isoformat()
def read(p): return json.loads(p.read_text(encoding='utf-8'))
overrides=read(ROOT/'appointment-overrides.json') if (ROOT/'appointment-overrides.json').exists() else []
historical=read(ROOT/'historical-coach-corrections.json') if (ROOT/'historical-coach-corrections.json').exists() else []
historical_by_fixture=defaultdict(list)
for correction in historical:
    historical_by_fixture[correction['fixture_id']].append(correction)
assert len({(o['fixture_id'],o['team_id']) for o in historical})==len(historical), 'Duplicate historical correction'
fixtures={}; coverage=[]; names={}; teams={}
for p in (ROOT/'history').glob('*.json'):
    s=read(p); fs=s.get('fixtures') or []
    done=[f for f in fs if f.get('state_id') in (5,7,8) and (f.get('starting_at') or '9999')<=NOW]
    coverage.append({'league':s['league_id'],'season':s['name'],'returned':len(fs),'completed':len(done),'both_coaches':sum(len({c.get('meta',{}).get('participant_id') for c in f.get('coaches') or []})==2 for f in done)})
    for f in done:
        fixtures[f['id']]=f
for p in ROOT.glob('coach-*.json'):
    c=read(p); names[c['id']]=c.get('display_name') or c.get('name')
current=[]
for lid in DOM:
    for t in read(ROOT/f'current-teams-{lid}.json')['teams']:
        teams[t['id']]=t['name']
        active=[c for c in t.get('coaches',[]) if c.get('active') and (not c.get('start') or c['start']<=NOW[:10]) and c.get('position_id') in (221,560)]
        for c in active:
            current.append({'id':c['coach_id'],'team_id':t['id'],'club':t['name'],'league':DOM[lid],'appointment':c.get('start'),'appointment_ambiguous':len(active)!=1})
for o in overrides:
    old=next(c for c in current if c['team_id']==o['team_id'])
    current=[c for c in current if c['team_id']!=o['team_id']]
    current.append({**old,'id':o['coach_id'],'appointment':o['start'],'appointment_ambiguous':False,'verification_source':o['source'],'verified_at':o['verified_at']})
    names[o['coach_id']]=o['name']
rating=defaultdict(lambda:1500.0); count=Counter(); last={}; spells=[]; logs=defaultdict(list); skipped=Counter(); corrections=[]
def values(f):
    pts={t.get('meta',{}).get('location'):t for t in f.get('participants') or []}
    if set(pts)!={'home','away'}: return None
    h,a=pts['home']['id'],pts['away']['id']
    scores={s['participant_id']:s.get('score',{}).get('goals') for s in f.get('scores') or [] if s.get('description')=='CURRENT'}
    if h not in scores or a not in scores or not all(isinstance(scores[x],(int,float)) for x in (h,a)): return None
    return h,a,scores[h],scores[a],pts
for f in sorted(fixtures.values(),key=lambda x:(x['starting_at'],x['id'])):
    if f['state_id']!=5:
        skipped['extra_time_or_penalties']+=1; continue
    v=values(f)
    if not v: skipped['missing_score_or_participants']+=1; continue
    h,a,hg,ag,pts=v
    for t in pts.values(): teams[t['id']]=t['name']
    cm=defaultdict(set)
    for c in f.get('coaches') or []:
        names[c['id']]=c.get('display_name') or c.get('name')
        cm[c.get('meta',{}).get('participant_id')].add(c['id'])
    for o in overrides:
        tid=o['team_id']
        if tid not in (h,a): continue
        date=f['starting_at'][:10]
        if date>=o['start']:
            if cm[tid]!={o['coach_id']}:
                corrections.append({'fixture_id':f['id'],'team_id':tid,'date':date,'provider_coaches':sorted(cm[tid]),'corrected_coach':o['coach_id'],'source':o['source']})
            cm[tid]={o['coach_id']}
        elif date>=o['previous_end_exclusive']:
            cm[tid].discard(o['previous_coach_id'])
    for o in historical_by_fixture[f['id']]:
        tid=o['team_id']
        assert tid in (h,a) and f['starting_at'][:10]==o['date'], 'Historical correction fixture mismatch'
        assert cm[tid] in ({o['previous_coach_id']},{o['coach_id']}), 'Provider changed historical coach; review correction'
        if cm[tid]!={o['coach_id']}:
            corrections.append({'fixture_id':f['id'],'team_id':tid,'date':o['date'],'provider_coaches':sorted(cm[tid]),'corrected_coach':o['coach_id'],'source':o['source'],'kind':'historical_assignment'})
        cm[tid]={o['coach_id']}
        names[o['coach_id']]=o['name']
    expected=1/(1+10**((rating[a]-rating[h]-(0 if f.get('neutral_venue') else 60))/400))
    actual=1 if hg>ag else 0 if hg<ag else .5
    change=20*(actual-expected)
    for tid,delta in ((h,change),(a,-change)):
        cs=cm.get(tid,set()); cid=next(iter(cs)) if len(cs)==1 else None
        if cid is None: skipped['team_matches_without_unique_coach']+=1
        previous=last.get(tid)
        if previous is None or previous['coach_id']!=cid or (datetime.fromisoformat(f['starting_at'])-datetime.fromisoformat(previous['end'])).days>365:
            previous={'coach_id':cid,'team_id':tid,'club':teams[tid],'start':f['starting_at'][:10],'end':f['starting_at'],'inherited':rating[tid],'prior_games':count[tid],'impact':0,'games':0,'league_games':0,'gain20':None,'gain40':None,'left_truncated':f['starting_at']<START,'observed_at_import_start':count[tid]==0}
            spells.append(previous); last[tid]=previous
        previous['end']=f['starting_at']
        if f['starting_at']>=START:
            previous['impact']+=delta; previous['games']+=1
            if f['league_id'] in DOM:
                previous['league_games']+=1
                for checkpoint in (20,40):
                    if previous['league_games']==checkpoint and not previous['left_truncated'] and not previous['observed_at_import_start']:
                        previous[f'gain{checkpoint}']=previous['impact']
            if cid is not None: logs[cid].append({'date':f['starting_at'][:10],'delta':delta,'team_id':tid,'fixture_id':f['id']})
        rating[tid]+=delta; count[tid]+=1
rows=[]
current_ids={c['id'] for c in current}
candidates=[{**c,'employment':'Current top-five manager','is_current':True} for c in current]
for cid,entries in logs.items():
    if cid in current_ids or cid==37523743: continue  # Deceased; never an active candidate.
    recent_count=sum(e['date']>=RECENT_START for e in entries)
    if recent_count<20: continue
    last_entry=entries[-1]; tid=last_entry['team_id']
    candidates.append({'id':cid,'team_id':tid,'club':teams[tid],'league':'Other / previous club','appointment':None,'appointment_ambiguous':False,'employment':'Current employment unverified','is_current':False})
for c in candidates:
    cid=c['id']; entries=logs[cid]; ss=[s for s in spells if s['coach_id']==cid and s['games']]
    total=sum(e['delta'] for e in entries); n=len(entries)
    substantial=[s for s in ss if s['games']>=20 and not s['left_truncated'] and not s['observed_at_import_start']]
    recent=[e for e in entries if e['date']>=RECENT_START]
    c['eligible']=len(recent)>=20
    rows.append({**c,'name':names.get(cid,f'Manager {cid}'),'impact':round(total,1) if n else None,'per38':round(total/n*38,1) if n else None,'recent':round(sum(e['delta'] for e in recent),1) if recent else None,'recent_games':len(recent),'matches':n,'clubs':len({s['team_id'] for s in ss}),'positive_spells':sum(s['impact']>0 for s in substantial),'eligible_spells':len(substantial),'spells':ss})
rows.sort(key=lambda r:r['impact'] if r['impact'] is not None else -1e9,reverse=True)
for i,r in enumerate(rows,1):r['rank']=i
for r in rows:
    running=0; trajectory=[]
    for e in logs[r['id']]:
        running+=e['delta']
        trajectory.append({'date':e['date'],'impact':round(running,2),'delta':e['delta'],'team_id':e['team_id'],'club':teams[e['team_id']]})
    r['trajectory']=trajectory
report={'as_of':NOW,'ranking_start':START,'recent_start':RECENT_START,'eligible_managers':sum(r['eligible'] for r in rows),'current_managers':len(current),'managers':len(rows),'imported_completed_fixtures':len(fixtures),'used_fixtures':sum(count.values())//2,'coverage':coverage,'skipped':dict(skipped),'appointment_overrides':overrides,'fixture_coach_corrections':corrections,'rows':rows}
OUT.mkdir(exist_ok=True)
import runpy
runpy.run_path(str(ROOT/'trophy_model.py'))['apply_trophies'](report, ROOT)
(OUT/'manager-elo-data.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
template=r'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Manager Elo · Elevation</title><style>
body{font:15px system-ui;background:#10171d;color:#e6edf0;margin:0}main{max-width:1400px;margin:auto;padding:36px}h1{font-size:40px;margin:8px 0}h2{font-size:21px}.eyebrow{color:#69d9b4;letter-spacing:2px;font-size:12px}.muted,p{color:#adbbc4;line-height:1.65}.cards{display:flex;gap:18px;margin:25px 0}.card{background:#1b2730;padding:18px 24px;border-radius:12px;flex:1}.card strong{display:block;font-size:26px;color:#fff}input,select{padding:12px;background:#1b2730;color:#fff;border:1px solid #3a4c59;border-radius:7px;margin:5px}table{width:100%;border-collapse:collapse;white-space:nowrap}th{text-align:left;color:#adbbc4;font-size:12px;padding:14px 10px;border-bottom:1px solid #40515f;cursor:pointer}td{padding:13px 10px;border-bottom:1px solid #26343f}tbody tr:hover{background:#1d2d37;cursor:pointer}.positive{color:#75dfba}.negative{color:#ff9c99}.scroll{overflow:auto}.badge{font-size:12px;background:#364638;padding:5px 9px;border-radius:5px}#detail{padding:22px;background:#1b2730;margin-top:24px;border-radius:12px}summary{cursor:pointer;color:#70d5b6}button{cursor:pointer;padding:8px 15px}a{color:#72d9b9}footer{margin-top:25px}@media(max-width:700px){main{padding:15px}.cards{flex-wrap:wrap}h1{font-size:30px}}
</style><main><span class="eyebrow">EUROPE · TOP FIVE LEAGUES</span><h1>Which managers elevate teams?</h1><p>Currently employed managers, ranked by accumulated club Elo change in covered matches since July 2016. Click a manager to inspect their club spells.</p><span class="badge">PROVISIONAL · RESULTS-BASED BASELINE</span><div class="cards"><div class="card"><strong id="n"></strong>current appointments</div><div class="card"><strong id="f"></strong>matches used, including warm-up</div><div class="card"><strong>2016–2026</strong>impact window · 2013–2016 warm-up</div></div><input id="search" aria-label="Search manager or club" placeholder="Search manager or club"><select id="league" aria-label="Filter league"><option value="">All five leagues</option></select><select id="sort" aria-label="Sort ranking"><option value="impact">Total Elo impact</option><option value="per38">Impact per 38 matches</option><option value="recent">Last 12 months impact</option><option value="matches">Matches covered</option></select><p id="stamp"></p><div class="scroll"><table><thead><tr><th>#</th><th>Manager</th><th>Current club</th><th>Total impact</th><th>Per 38</th><th>Last 12 months</th><th>Matches</th><th>Clubs</th><th>Positive spells ≥20 games</th></tr></thead><tbody id="body"></tbody></table></div><div id="detail" hidden></div><details style="margin-top:30px"><summary>Method, coverage and limitations</summary><p>This is an auditable Elo Impact baseline, not a validated estimate of individual coaching ability. Total impact measures observed improvement and can favour longer careers and repeated rebuilds. The per-38 view is volatile for short spells; no minimum sample is silently imposed. Match counts describe evidence, not statistical confidence.</p><p>Every club starts at 1,500 when first observed. Standard Elo: expected score = 1 / (1 + 10^((away rating − home rating − 60)/400)); K = 20; win = 1, draw = 0.5, loss = 0. No goal-margin weighting, seasonal reset or elite loss cap. European fixtures connect the leagues. Parameters have not yet been calibrated; initial league offsets are equal. Sparse histories, promoted clubs and opponents whose domestic leagues are absent can bias ratings.</p><p>Only completed regulation-time matches are used; matches ending in extra time or penalties are excluded consistently to avoid mistaking shootout totals for football scores. Future and unfinished fixtures are excluded. Missing managers do not prevent team rating updates, but their impact is not assigned to anyone. Missing scores or ambiguous participants exclude the fixture.</p><p>Spells are reconstructed from consecutive observed team-manager assignments. A gap exceeding 365 days starts a new observed segment. Spell dates are first/last observed matches, not verified appointment dates. A change during an unobserved competition can be missed. Warm-up-era spells are marked partial. Checkpoints show cumulative covered Elo change when 20/40 domestic league games are reached; partial spells have no checkpoints. Positive-spell counts require 20 covered matches and an observed start after the ranking window begins.</p><p>Current employment uses Sportsmonks active appointment records with head-coach/interim roles. Contract end dates are not treated as departures. Previous work outside covered competitions is excluded. Transfers, squad quality, injuries, inherited trajectory, regression to the mean and sustained elite performance are not separately controlled. No causal claims or predictive validation are made.</p><p>Source: Sportsmonks API. Transfermarkt is available as a backup but has not been used to amend these records. This is an independent Elo implementation, not ClubElo ratings.</p><pre id="audit" style="white-space:pre-wrap"></pre></details><footer><a href="manager-elo-data.json" download>Download underlying data (JSON)</a> · Works locally; no login or internet required.</footer></main><script>
const data=__DATA__;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=x=>x==null?'—':(x>0?'+':'')+Number(x).toFixed(1);
const cell=x=>`<td class="${x>0?'positive':x<0?'negative':''}">${num(x)}</td>`;
document.getElementById('n').textContent=data.managers;document.getElementById('f').textContent=data.used_fixtures.toLocaleString();document.getElementById('stamp').textContent='Data retrieved '+data.as_of+' UTC · Dash means no covered observations.';
const search=document.getElementById('search'), league=document.getElementById('league'), sort=document.getElementById('sort');
[...new Set(data.rows.map(r=>r.league))].sort().forEach(l=>league.add(new Option(l,l)));
function render(){const q=search.value.toLowerCase();const rs=data.rows.filter(r=>(!league.value||r.league===league.value)&&`${r.name} ${r.club}`.toLowerCase().includes(q)).sort((a,b)=>(b[sort.value]??-1e9)-(a[sort.value]??-1e9));document.getElementById('body').innerHTML=rs.map((r,i)=>`<tr tabindex="0" data-id="${r.id}"><td>${i+1}</td><td><b>${esc(r.name)}</b></td><td>${esc(r.club)}</td>${cell(r.impact)}${cell(r.per38)}${cell(r.recent)}<td>${r.matches}</td><td>${r.clubs}</td><td>${r.positive_spells} / ${r.eligible_spells}</td></tr>`).join('');document.querySelectorAll('tr[data-id]').forEach(tr=>{tr.onclick=()=>detail(Number(tr.dataset.id));tr.onkeydown=e=>{if(e.key==='Enter')tr.click()}})}
function detail(id){const r=data.rows.find(r=>r.id===id),d=document.getElementById('detail');d.hidden=false;d.innerHTML=`<h2>${esc(r.name)} · ${esc(r.club)}</h2><p>Current appointment starts ${esc(r.appointment||'unknown')}. ${r.recent_games} covered matches in the last 12 months. ${r.appointment_ambiguous?'Multiple active appointment records: verify current role.':''}</p><div class="scroll"><table><thead><tr><th>Club / observed segment</th><th>First observed</th><th>Last observed</th><th>Inherited Elo</th><th>Prior club games</th><th>Impact since Jul 2016</th><th>Games</th><th>At 20 league games</th><th>At 40 league games</th></tr></thead><tbody>${r.spells.map(s=>`<tr><td>${esc(s.club)}${s.left_truncated?' · partial':''}${s.observed_at_import_start?' · initial observation':''}</td><td>${s.start}</td><td>${s.end.slice(0,10)}</td><td>${s.inherited.toFixed(0)}</td><td>${s.prior_games}</td>${cell(s.impact)}<td>${s.games}</td>${cell(s.gain20)}${cell(s.gain40)}</tr>`).join('')}</tbody></table></div>`;d.scrollIntoView({behavior:'smooth',block:'nearest'})}
[search,league,sort].forEach(e=>e.addEventListener('input',render));render();document.getElementById('audit').textContent='Excluded / unassigned: '+JSON.stringify(data.skipped,null,2)+'\n\nSeason coverage: league ID | season | completed | both managers\n'+data.coverage.sort((a,b)=>a.league-b.league||a.season.localeCompare(b.season)).map(s=>`${s.league} | ${s.season} | ${s.completed} | ${s.both_coaches}`).join('\n');
</script></html>'''
(OUT/'manager-elo.html').write_text(template.replace('__DATA__',json.dumps(report,ensure_ascii=False).replace('</','<\\/')),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k not in ('rows','coverage')},indent=2))
print(json.dumps([{k:r[k] for k in ('name','club','impact','matches')} for r in rows[:10]],ensure_ascii=False))
