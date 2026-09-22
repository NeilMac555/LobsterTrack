import asyncio,unittest
from datetime import datetime,timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from unittest.mock import patch
from app.models import Base,Match,SteamMove,SyndicateAlert,AlertResult
from app.services.telegram_results import alert_moves
from app.services.results_fetcher import ResultsFetcher
from app.api.routes import get_steam_results,get_syndicate_moves,get_steam_moves

class TelegramReportingTests(unittest.TestCase):
 def setUp(self):
  self.engine=create_engine('sqlite://');Base.metadata.create_all(self.engine);self.db=Session(self.engine)
  self.now=datetime.utcnow()
 def tearDown(self):self.db.close();self.engine.dispose()
 def add(self,id,outcome='home',price=1.91,score=(2,0),sent=True):
  self.db.add(Match(id=id,sport_key='soccer_epl',league_name='EPL',home_team='Home '+id,away_team='Away '+id,commence_time=self.now-timedelta(hours=5)))
  if sent:self.db.add(SyndicateAlert(match_id=id,market='1x2',outcome=outcome,odds_at_alert=price,movement_percent=4,alerted_at=self.now-timedelta(hours=6)))
  if score is not None:self.db.add(AlertResult(match_id=id,home_score=score[0],away_score=score[1]))
  self.db.commit()
 def test_sent_price_draws_pending_and_no_phantom_bets(self):
  self.add('win');self.add('draw','draw',3.5,(1,1));self.add('loss',score=(0,1));self.add('pending',score=None);self.add('unsent',sent=False)
  report=asyncio.run(get_steam_results(db=self.db,league=None,limit=1,days=None))
  self.assertEqual(report.total_alerts,4);self.assertEqual(report.pending_alerts,1)
  self.assertEqual(report.total_moves,3);self.assertEqual(report.total_wins,2)
  self.assertAlmostEqual(report.profit_units,2.41);self.assertEqual(len(report.moves),1)
  self.assertEqual(report.source,'telegram')
  stats=asyncio.run(get_steam_moves(db=self.db));self.assertEqual(stats.total_moves,4)
 def test_missing_results_not_losses_and_filter(self):
  self.add('pending',score=None)
  self.assertEqual(alert_moves(self.db,league='other'),[])
  self.assertEqual(alert_moves(self.db,until=self.now-timedelta(days=1)),[])
  report=asyncio.run(get_steam_results(db=self.db,league=None,limit=200,days=None))
  self.assertEqual(report.total_moves,0);self.assertEqual(report.profit_units,0)
 def test_telegram_only_fixture_gets_settled(self):
  self.add('telegram_only',score=None)
  class FakeResponse:
   def raise_for_status(self):pass
   def json(self):return [{'id':'telegram_only','completed':True,'home_team':'Home telegram_only','away_team':'Away telegram_only','scores':[{'name':'Home telegram_only','score':'2'},{'name':'Away telegram_only','score':'1'}]}]
  class Client:
   async def __aenter__(self):return self
   async def __aexit__(self,*args):pass
   async def get(self,*args,**kwargs):return FakeResponse()
  with patch('app.services.results_fetcher.SessionLocal',lambda:Session(self.engine)),patch('app.services.results_fetcher.httpx.AsyncClient',return_value=Client()):
   asyncio.run(ResultsFetcher().update_steam_move_results())
  self.assertTrue(alert_moves(self.db)[0].won)
  self.assertEqual(self.db.query(SteamMove).count(),0)
 def test_homepage_only_sent_and_freezes_price(self):
  self.add('upcoming')
  self.db.get(Match,'upcoming').commence_time=self.now+timedelta(hours=2);self.db.commit()
  moves=asyncio.run(get_syndicate_moves(db=self.db,limit=20))
  self.assertEqual(len(moves),1);self.assertEqual(moves[0].current_odds,1.91)
