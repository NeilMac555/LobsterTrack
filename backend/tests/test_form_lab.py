import unittest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.models import FormLabSeason
from app.services.form_lab import analyze, normalize, first_goal
from datetime import datetime
class FormLabTests(unittest.TestCase):
 def setUp(self):
  self.engine=create_engine('sqlite://');FormLabSeason.__table__.create(self.engine);self.db=Session(self.engine)
  rows=[]
  for i in range(25):
   rows.append(dict(id=i,season='2025/2026',date=f'2026-01-{i+1:02} 12:00:00',home_id=1,away_id=2 if i%2==0 else 18,home='A',away='B',hg=2,ag=0,hh=1,ah=0,first='home',hx=0 if i==24 else None,ax=None,hc=None,ac=None))
  self.db.add(FormLabSeason(key='x',league='soccer_epl',season='2025/2026',updated_at=datetime.now(),data={'fixtures':rows,'standings':{str(i):i for i in range(1,19)},'teams':{}}));self.db.commit()
 def tearDown(self):self.db.close();self.engine.dispose()
 def test_filters_before_window(self):
  a=analyze(self.db,'soccer_epl',1,5,opposition='bottom6');self.assertEqual(a['sample'],5);self.assertEqual(a['available'],12);self.assertEqual(a['matches'][0]['id'],23)
 def test_denominators_and_handicap(self):
  a=analyze(self.db,'soccer_epl',1,10,handicap=-2);m={v['label']:v for v in a['metrics']}
  self.assertEqual(m['npxG for']['n'],1);self.assertEqual(m['npxG for']['value'],0);self.assertIsNone(m['Corners for']['value']);self.assertEqual(m['Cover -1.5']['value'],100);self.assertEqual(m['Cover -2.5']['value'],0);self.assertEqual(m['Selected -2: push']['value'],100);self.assertEqual(m['2H scored average']['value'],1)
 def test_goal_progression(self):
  f={'events':[{'type_id':15,'result':'0-1','sort_order':1},{'type_id':14,'result':'1-1','sort_order':2}]};self.assertEqual(first_goal(f,1,1),'away');self.assertIsNone(first_goal(f,2,1));self.assertEqual(first_goal({},0,0),'none')
 def test_extra_time_does_not_use_final_score(self):
  f={'id':1,'league_id':8,'season_id':2,'state':{'developer_name':'AET'},'starting_at':'2026-01-01','participants':[{'id':1,'name':'A','meta':{'location':'home'}},{'id':2,'name':'B','meta':{'location':'away'}}],'scores':[{'description':'CURRENT','score':{'participant':'home','goals':3}},{'description':'CURRENT','score':{'participant':'away','goals':2}}]};self.assertIsNone(normalize(f,'soccer_epl',2,'2025/2026'))
if __name__=='__main__':unittest.main()
