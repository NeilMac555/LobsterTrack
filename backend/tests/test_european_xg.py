import unittest
from copy import deepcopy
from app.services.european_xg import normalize

class EuropeanXGTests(unittest.TestCase):
 def fixture(self):
  return {'id':1,'league_id':2,'season_id':9,'starting_at':'2026-09-08 19:00:00',
   'stage':{'name':'League Stage'},'state':{'developer_name':'FT'},
   'participants':[{'id':10,'name':'Home','meta':{'location':'home'}},{'id':20,'name':'Away','meta':{'location':'away'}}],
   'xgfixture':[{'type_id':7943,'participant_id':10,'data':{'value':0}}, {'type_id':7943,'participant_id':20,'data':{'value':1.25}}]}
 def test_zero_is_valid_and_sides_correct(self):
  row=normalize([self.fixture()],2,9)[0]
  self.assertEqual(row['home_npxg'],0);self.assertEqual(row['away_npxg'],1.25);self.assertIsNone(row['missing_reason'])
 def test_total_xg_not_used_as_nonpenalty(self):
  f=self.fixture();f['xgfixture'][0]['type_id']=5304
  row=normalize([f],2,9)[0];self.assertIsNone(row['home_npxg']);self.assertIsNotNone(row['missing_reason'])
 def test_qualifying_pending_other_season_excluded(self):
  for field,value in [('stage',{'name':'Play-offs'}),('state',{'developer_name':'NS'}),('season_id',8)]:
   f=self.fixture();f[field]=value;self.assertEqual(normalize([f],2,9),[])
 def test_extra_time_missing_and_deduplication(self):
  f=self.fixture();f['state']['developer_name']='AET'
  rows=normalize([f,deepcopy(f)],2,9)
  self.assertEqual(len(rows),1);self.assertIsNone(rows[0]['home_npxg'])
 def test_nonfinite_not_imported(self):
  f=self.fixture();f['xgfixture'][0]['data']['value']=float('nan')
  self.assertIsNone(normalize([f],2,9)[0]['home_npxg'])
