import unittest
from datetime import datetime, timedelta

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session

from app.models import Base, Match, OddsSnapshot
from app.services.homepage_odds import match_odds_summary


class HomepageOddsTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://')
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.now = datetime(2026, 11, 23, 12)
        for key in ['pinnacle', 'fallback', 'empty']:
            self.db.add(Match(id=key, home_team='Home', away_team='Away',
                              sport_key='soccer_epl', league_name='Premier League',
                              commence_time=self.now + timedelta(days=1)))
        self.db.flush()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def tick(self, key, minute, home=2.0, bookmaker='pinnacle', in_play=False):
        self.db.add(OddsSnapshot(match_id=key, fetched_at=self.now + timedelta(minutes=minute),
                                home_odds=home, draw_odds=3.6, away_odds=4.0,
                                bookmaker=bookmaker, in_play=in_play))

    def test_one_scan_keeps_prices_counts_and_last_twelve_valid_pregame_points(self):
        self.tick('pinnacle', -10, 2.3, 'betfair_ex_eu')
        for i in range(15):
            self.tick('pinnacle', i, 2.0 + i / 100)
        self.tick('pinnacle', 20, 1.01)  # Invalid book must not become the latest quote.
        self.tick('pinnacle', 21, 2.4, in_play=True)
        self.tick('fallback', 0, 2.2, 'betfair_ex_eu')
        self.tick('fallback', 1, 2.1, 'betfair_ex_eu')
        self.tick('fallback', 2, 1.01)  # Invalid Pinnacle cannot suppress valid fallback.
        self.db.commit()
        statements = []
        def capture(conn, cursor, statement, parameters, context, executemany):
            statements.append(statement)
        event.listen(self.engine, 'before_cursor_execute', capture)
        latest, opening, counts, sparks = match_odds_summary(self.db, ['pinnacle', 'fallback', 'empty'])
        event.remove(self.engine, 'before_cursor_execute', capture)
        self.assertEqual(len(statements), 1)
        self.assertEqual(latest['pinnacle']['home'], 2.14)
        self.assertEqual(latest['pinnacle']['bookmaker'], 'pinnacle')
        self.assertEqual(opening['pinnacle']['home'], 2.0)
        self.assertEqual(counts['pinnacle'], 15)
        self.assertEqual(sparks['pinnacle'], [round(100 / (2 + i / 100), 2) for i in range(3, 15)])
        self.assertEqual(latest['fallback']['bookmaker'], 'betfair_ex_eu')
        self.assertEqual(opening['fallback']['home'], 2.2)
        self.assertEqual(counts['fallback'], 2)
        self.assertEqual(sparks['fallback'], [round(100/2.2, 2), round(100/2.1, 2)])
        self.assertNotIn('empty', latest)
        self.assertNotIn('empty', counts)

    def test_empty_fixture_list_needs_no_database_read(self):
        self.assertEqual(match_odds_summary(None, []), ({}, {}, {}, {}))


if __name__ == '__main__':
    unittest.main()
