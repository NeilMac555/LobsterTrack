import unittest,sys,copy
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from manager_rank_movement import add_movement
class MovementTests(unittest.TestCase):
 def test_model_adoption_resets_then_weekly_comparison_resumes(self):
  old={'as_of':'2026-10-30','rows':[{'id':1,'rank':5,'eligible':True}]}
  new={'as_of':'2026-10-30','model_version':'elo-plus-half-trophies-v1','rows':[{'id':1,'rank':1,'eligible':True}]}
  add_movement(new,old)
  self.assertIsNone(new['movement_as_of'])
  self.assertIsNone(new['rows'][0]['rank_movement'])
  rebuilt=copy.deepcopy(new);add_movement(rebuilt,new);self.assertEqual(rebuilt,new)
  following={'as_of':'2026-11-02','model_version':new['model_version'],'rows':[{'id':1,'rank':2,'eligible':True}]}
  add_movement(following,new)
  self.assertEqual(following['rows'][0]['rank_movement'],-1)
  with self.assertRaises(ValueError):add_movement({'as_of':'2026-10-01','model_version':'other','rows':[]},new)
 def test_rank_changes_and_rebuild(self):
  previous={'as_of':'2026-10-19','rows':[{'id':1,'rank':1,'eligible':True},{'id':2,'rank':3,'eligible':True}]}
  data={'as_of':'2026-10-30','rows':[{'id':1,'rank':2,'eligible':True},{'id':2,'rank':1,'eligible':True},{'id':3,'rank':3,'eligible':True},{'id':4,'rank':None,'eligible':False}]}
  add_movement(data,previous)
  self.assertEqual([r['rank_movement'] for r in data['rows']],[-1,2,None,None])
  self.assertEqual(data['rows'][2]['rank_movement_status'],'new')
  rebuilt=copy.deepcopy(data);add_movement(rebuilt,data);self.assertEqual(rebuilt,data)
 def test_no_baseline_and_older_snapshot(self):
  data={'as_of':'2026-10-19','rows':[{'id':1,'rank':1,'eligible':True}]}
  add_movement(data,None);self.assertIsNone(data['rows'][0]['rank_movement'])
  with self.assertRaises(ValueError):add_movement(data,{'as_of':'2026-10-30','rows':[]})
if __name__=='__main__':unittest.main()
