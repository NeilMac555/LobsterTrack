"""Approved half-strength trophy component, separate from match Elo."""
import json
from pathlib import Path

VERSION = 'elo-plus-half-trophies-v1'
BASE = {2:80,8:50,564:40,384:40,82:30,301:25,5:25,2286:10}

def apply_trophies(report, root):
    ledger=json.loads((Path(root)/'trophy-ledger.json').read_text(encoding='utf-8'))
    keys={(t['league_id'],t['season_id']) for t in ledger}
    assert len(keys)==len(ledger), 'Duplicate title award'
    for p in (Path(root)/'history').glob('*.json'):
        s=json.loads(p.read_text(encoding='utf-8'))
        if s['league_id'] in BASE and s['name']>='2016/2017' and s.get('finished') and s.get('ending_at','9999')<=report['as_of'][:10]:
            assert (s['league_id'],s['id']) in keys, f"New completed title season {s['league_id']}/{s['id']}: review and extend trophy ledger before publishing"
    for t in ledger:
        expected=BASE[t['league_id']]*max(.25,min(2,1-t['elo_gap']/200))*.5
        assert abs(expected-t['half_bonus'])<.001, 'Trophy bonus formula mismatch'
        assert t['strength_cutoff'][:10]<=t['award_date'], 'Strength cutoff after title'
    for r in report['rows']:
        r['trophies']=[t for t in ledger if t['coach_id']==r['id'] and report['ranking_start']<=t['award_date']<=report['as_of'][:10]]
        r['trophy_bonus']=round(sum(t['half_bonus'] for t in r['trophies']),2)
        r['score']=round((r['impact'] or 0)+r['trophy_bonus'],2) if r['impact'] is not None or r['trophies'] else None
    report['rows'].sort(key=lambda r:(not r['eligible'],-(r['score'] if r['score'] is not None else -1e9),r['id']))
    for rank,r in enumerate(report['rows'],1):r['rank']=rank
    report['model_version']=VERSION
    report['model_adopted_at']='2026-10-31'
    report['trophy_model']={'weight':.5,'base_points':BASE,'formula':'0.5 × base × clamp(1 − precompetition Elo gap / 200, 0.25, 2)','strength':'Winner club Elo minus strongest rival Elo before domestic season / European main stage. Uncalibrated proxy, not historical title odds.','ledger_titles':len(ledger),'ledger_through':'2025/2026','award_policy':'Domestic titles credited to the reviewed season-end coach, dated to final league appearance; European titles to the winning final coach. No shared predecessor credit.','date_policy':'Only title awards inside the selected date window contribute. Match-based Elo, per-38, recent form and graph remain unchanged.'}
