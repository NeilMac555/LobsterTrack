import asyncio
import unittest
from datetime import date
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.models.database import Base
from app.models.historical_match import HistoricalMatch
from app.api.routes import get_team_pnl


class TeamWindowTests(unittest.TestCase):
    def test_window_filters_before_aggregation(self):
        engine = create_engine('sqlite://')
        Base.metadata.create_all(engine)
        with Session(engine) as db:
            for season, day in [('2526',date(2026,2,11)),('2526',date(2026,2,12)),('2627',date(2026,8,21))]:
                db.add(HistoricalMatch(league='soccer_epl',season=season,match_date=day,home_team='Arsenal',away_team='Chelsea',ftr='H',fthg=1,ftag=0,psch=2,pscd=3,psca=4,price_source='steamwatch_close'))
            db.commit()
            result = asyncio.run(get_team_pnl(db=db,league='soccer_epl',seasons='2526,2627',date_from=date(2026,2,12),stake=50,opponents=None))
            arsenal = next(r for r in result.rows if r.team=='Arsenal' and r.season=='all')
            self.assertEqual(arsenal.back.overall.matches,2)
            self.assertEqual(arsenal.back.overall.staked,100)
            self.assertEqual(arsenal.back.overall.pl,100)
            self.assertEqual(arsenal.back.away.matches,0)
            self.assertEqual(result.seasons_loaded,['2526','2627'])
            current = asyncio.run(get_team_pnl(db=db,league='soccer_epl',seasons='2627',date_from=date(2026,2,12),stake=50,opponents=None))
            self.assertEqual(next(r for r in current.rows if r.team=='Arsenal' and r.season=='all').back.overall.matches,1)
        engine.dispose()
