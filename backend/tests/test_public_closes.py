import unittest
from datetime import datetime, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.models import Base, Match, OddsSnapshot, ClosingLine
from app.models.closing_line import MarketType
from app.services.public_summaries import latest_closes


class LatestClosesTests(unittest.TestCase):
    def test_only_complete_pre_match_pinnacle_prices_are_published(self):
        engine = create_engine('sqlite://')
        self.addCleanup(engine.dispose)
        Base.metadata.create_all(engine)
        kickoff = datetime(2025, 7, 1, 20)
        with Session(engine) as db:
            for ident, bookmaker in [('real', 'pinnacle'), ('fallback', 'betfair_ex_eu')]:
                db.add(Match(id=ident, home_team='A & B', away_team='Away', sport_key='soccer_epl',
                             league_name='Premier League', commence_time=kickoff))
                for minutes, source, price in [(-50, 'betfair_ex_eu', 8), (-40, bookmaker, 3),
                                               (-1, bookmaker, 2), (1, bookmaker, 9)]:
                    db.add(OddsSnapshot(match_id=ident, bookmaker=source, fetched_at=kickoff + timedelta(minutes=minutes),
                                        home_odds=price, draw_odds=4, away_odds=3, in_play=minutes > 0))
                db.add(ClosingLine(match_id=ident, league='soccer_epl', home_team='A & B', away_team='Away',
                                   kickoff_time=kickoff, captured_at=kickoff-timedelta(minutes=1),
                                   minutes_before_kickoff=1, market_type=MarketType.H2H, close_home=2, close_draw=4, close_away=3))
            db.commit()
            result = latest_closes(db)
            self.assertIn('/match/real', result)
            self.assertNotIn('/match/fallback', result)
            self.assertIn('A &amp; B', result)
            self.assertIn('3.00 / 4.00 / 3.00', result)
            self.assertIn('2.00 / 4.00 / 3.00', result)
            self.assertNotIn('8.00 /', result)
            self.assertNotIn('9.00 /', result)
