import unittest
from unittest.mock import patch
from types import SimpleNamespace
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.models import FormLabSeason
from app.services.form_lab import analyze, normalize, first_goal, strength_tables
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
  with patch('app.services.form_lab.strength_tables',return_value={'2025/2026':{str(i):{'rank':i} for i in range(1,19)}}):
   a=analyze(self.db,'soccer_epl',1,5,opposition='bottom6');self.assertEqual(a['sample'],5);self.assertEqual(a['available'],12);self.assertEqual(a['matches'][0]['id'],23)
 def test_denominators_and_handicap(self):
  a=analyze(self.db,'soccer_epl',1,10,handicap=-2);m={v['label']:v for v in a['metrics']}
  self.assertEqual(m['npxG for']['n'],1);self.assertEqual(m['npxG for']['value'],0);self.assertIsNone(m['Corners for']['value']);self.assertEqual(m['Cover -1.5']['value'],100);self.assertEqual(m['Cover -2.5']['value'],0);self.assertEqual(m['Selected -2: push']['value'],100);self.assertEqual(m['2H scored average']['value'],1)
 def test_goal_progression(self):
  f={'events':[{'type_id':15,'result':'0-1','sort_order':1},{'type_id':14,'result':'1-1','sort_order':2}]};self.assertEqual(first_goal(f,1,1),'away');self.assertIsNone(first_goal(f,2,1));self.assertEqual(first_goal({},0,0),'none')
 def test_extra_time_does_not_use_final_score(self):
  f={'id':1,'league_id':8,'season_id':2,'state':{'developer_name':'AET'},'starting_at':'2026-01-01','participants':[{'id':1,'name':'A','meta':{'location':'home'}},{'id':2,'name':'B','meta':{'location':'away'}}],'scores':[{'description':'CURRENT','score':{'participant':'home','goals':3}},{'description':'CURRENT','score':{'participant':'away','goals':2}}]};self.assertIsNone(normalize(f,'soccer_epl',2,'2025/2026'))
 def test_promoted_prior_and_no_future_leak(self):
  def fixture(i,year):return dict(id=i,date=f'{year}-01-{i%28+1:02}',home_id=1,away_id=2,hg=1,ag=0)
  old=SimpleNamespace(season='2025/2026',data={'standings':{'1':1,'2':2},'fixtures':[fixture(i,2026) for i in range(20)]})
  new=SimpleNamespace(season='2026/2027',data={'standings':{'1':1,'2':2,'3':3},'fixtures':[dict(id=99,date='2026-09-01',home_id=3,away_id=1,hg=2,ag=0)]})
  ratings=strength_tables([old,new])
  self.assertEqual(ratings['2025/2026']['1']['ppg'],3)
  self.assertEqual(ratings['2026/2027']['3']['ppg'],1.1)
  self.assertEqual(ratings['2026/2027']['3']['prior_matches'],19)
  self.assertEqual(ratings['2026/2027']['1']['matches'],20)
  self.assertEqual(ratings['2026/2027']['1']['ppg'],2.85)
 def test_relegation_resets_history(self):
  old=SimpleNamespace(season='2024/2025',data={'standings':{'1':1},'fixtures':[dict(id=1,date='2025-01-01',home_id=1,away_id=2,hg=4,ag=0)]})
  gap=SimpleNamespace(season='2025/2026',data={'standings':{'2':1},'fixtures':[]})
  current=SimpleNamespace(season='2026/2027',data={'standings':{'1':1},'fixtures':[]})
  self.assertEqual(strength_tables([old,gap,current])['2026/2027']['1']['matches'],0)
 def test_league_table_margin_and_clean_sheet(self):
  from app.api.form_lab import form_table
  for view in ('handicap','clean'):
   result=form_table('soccer_epl',window=10,venue='home',view=view,db=self.db)
   team=next(r for r in result['teams'] if r['id']==1)
   self.assertEqual(team['played'],10)
   self.assertEqual(team['margins'],[0,10,0,0,0,0])
   self.assertEqual(team['clean_pct'],100)
   self.assertEqual(team['cover_pct'],100)
 def test_short_samples_sort_below_full_samples(self):
  from app.api.form_lab import form_table
  def sample(n,win):
   return {'matches':[dict(gf=2 if win else 0,ga=0 if win else 1) for _ in range(n)]}
  def fake(db,league,tid,*args,**kwargs):return sample(1,True) if tid==1 else sample(10,False)
  with patch('app.api.form_lab.analyze',side_effect=fake):
   for view in ('form','handicap','clean','top6'):
    result=form_table('soccer_epl',window=10,venue='all',view=view,db=self.db)
    self.assertEqual(result['teams'][-1]['id'],1)
    self.assertEqual(result['teams'][-1]['ppg'],3)
 def test_xg_coverage_keeps_zero_and_excludes_unpaired(self):
  from app.api.form_lab import form_table
  games=[dict(gf=1,ga=0,xg=0,xga=1),dict(gf=2,ga=0,xg=2,xga=0),dict(gf=0,ga=0,xg=5,xga=None)]
  with patch('app.api.form_lab.analyze',return_value={'matches':games}):
   row=form_table('soccer_epl',window=5,venue='all',view='xg',db=self.db)['teams'][0]
   self.assertEqual(row['xg_games'],2)
   self.assertEqual(row['xgf'],2)
   self.assertEqual(row['xga'],1)
   self.assertEqual(row['xgd_avg'],0.5)
  with patch('app.api.form_lab.analyze',return_value={'matches':[games[-1]]}):
   row=form_table('soccer_epl',window=5,venue='all',view='xg',db=self.db)['teams'][0]
   self.assertEqual(row['xg_games'],0)
   self.assertIsNone(row['xgf'])
if __name__=='__main__':unittest.main()
