import copy, json, runpy, tempfile, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
apply=runpy.run_path(str(ROOT/'scripts/manager-model/trophy_model.py'))['apply_trophies']

class TrophyTests(unittest.TestCase):
 def test_published_composite_and_corrections(self):
  d=json.loads((ROOT/'backend/app/data/manager-ratings.json').read_text(encoding='utf-8'))
  self.assertEqual(d['model_version'],'elo-plus-half-trophies-v1')
  eligible=[r for r in d['rows'] if r['eligible']]
  self.assertEqual([r['rank'] for r in eligible],list(range(1,len(eligible)+1)))
  for r in d['rows']:
   if r['score'] is not None:self.assertAlmostEqual(r['score'],(r['impact'] or 0)+r['trophy_bonus'],places=2)
  for a,b in zip(eligible,eligible[1:]):self.assertGreaterEqual(a['score'],b['score'])
  self.assertGreaterEqual(sum(c.get('kind')=='historical_assignment' for c in d['fixture_coach_corrections']),190)
 def test_award_window_and_unreviewed_finished_season(self):
  ledger=[dict(league_id=2,season_id=1,coach_id=1,elo_gap=0,half_bonus=40,strength_cutoff='2025-09-01',award_date='2026-05-30')]
  d={'ranking_start':'2026-06-01','as_of':'2026-10-30','rows':[{'id':1,'impact':12,'eligible':True}]}
  with tempfile.TemporaryDirectory() as folder:
   p=Path(folder);(p/'history').mkdir();(p/'trophy-ledger.json').write_text(json.dumps(ledger),encoding='utf-8')
   apply(d,p);self.assertEqual(d['rows'][0]['score'],12)
   newseason={'league_id':8,'id':2,'name':'2026/2027','finished':True,'ending_at':'2026-10-01'}
   (p/'history/new.json').write_text(json.dumps(newseason),encoding='utf-8')
   with self.assertRaisesRegex(AssertionError,'New completed title season'):apply(d,p)
if __name__=='__main__':unittest.main()
