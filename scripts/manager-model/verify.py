import runpy, math
from pathlib import Path
g=runpy.run_path(str(Path(__file__).with_name('build.py')))
rows=g['rows']; rating=g['rating']; logs=g['logs']
assert sum(r['is_current'] for r in rows)==96
assert len({r['id'] for r in rows})==len(rows)
assert 37523743 not in {r['id'] for r in rows}
assert all(r['eligible']==(r['recent_games']>=20) for r in rows)
assert all(r['eligible'] or r['is_current'] for r in rows)
assert not any(r['id']==32849 and r['is_current'] for r in rows)
assert {97499,95553}.issubset(r['id'] for r in rows)
for o in g['overrides']:
    assert not any(e['team_id']==o['team_id'] and e['date']>=o['previous_end_exclusive'] for e in logs[o['previous_coach_id']])
for o in g['historical']:
    f=g['fixtures'].get(o['fixture_id'])
    if not f or f['state_id']!=5 or o['date']<g['START']: continue
    assert not any(e['fixture_id']==o['fixture_id'] and e['team_id']==o['team_id'] for e in logs[o['previous_coach_id']]), 'Incorrect historical coach still receives impact'
    assert any(e['fixture_id']==o['fixture_id'] and e['team_id']==o['team_id'] for e in logs[o['coach_id']]), 'Correct historical coach missing impact'
assert all(not r['name'].startswith('Manager ') for r in rows)
assert abs(sum(v-1500 for v in rating.values()))<1e-7, 'Elo conservation failed'
for r in rows:
    assert r['matches']==sum(s['games'] for s in r['spells'])
    assert math.isclose(r['impact'] or 0, sum(s['impact'] for s in r['spells']),abs_tol=.051)
    assert len({e['fixture_id'] for e in logs[r['id']]})==r['matches']
    assert all(g['START']<=e['date']<=g['NOW'][:10] for e in logs[r['id']])
    assert all(s['gain40'] is None or s['league_games']>=40 for s in r['spells'])
print('PASS: rolling eligibility; 96 current managers; unique identities; score conservation; spell totals; fixture uniqueness; cutoff dates; checkpoints.')
runpy.run_path(str(Path(__file__).with_name('enhance.py')))
runpy.run_path(str(Path(__file__).with_name('trophy_ui.py')))
assert g['report']['model_version']=='elo-plus-half-trophies-v1'
eligible=[r for r in rows if r['eligible']]
assert [r['rank'] for r in eligible]==list(range(1,len(eligible)+1))
assert all(a['score']>=b['score'] for a,b in zip(eligible,eligible[1:]))
for r in rows:
    assert math.isclose(r['trophy_bonus'],sum(t['half_bonus'] for t in r['trophies']),abs_tol=.0051)
    if r['score'] is not None:
        assert math.isclose(r['score'],(r['impact'] or 0)+r['trophy_bonus'],abs_tol=.0051)
print('PASS: approved half trophies; separate Elo diagnostics; eligible composite ordering.')
