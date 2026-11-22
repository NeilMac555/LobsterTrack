import unittest
from datetime import datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.models import Base, Match, HistoricalMatch, ClosingLine, AlertResult
from app.models.closing_line import MarketType
from app.services.bias_results_refresh import sync_league, valid_close


class BiasRefreshTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://')
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.now = datetime(2026, 11, 1, 17)
        self.league = 'soccer_italy_serie_a'
        self.match = Match(id='lazio', sport_key=self.league, league_name='Serie A',
                           home_team='Lazio', away_team='Cagliari', commence_time=datetime(2026, 11, 1, 14))
        self.db.add(self.match)
        self.close = ClosingLine(match_id='lazio', league=self.league, home_team='Lazio', away_team='Cagliari',
            kickoff_time=self.match.commence_time, market_type=MarketType.H2H,
            close_home=1.5, close_draw=4.53, close_away=6.87, minutes_before_kickoff=2,
            captured_at=self.match.commence_time-timedelta(minutes=2))
        self.db.add(self.close)
        self.db.flush()
        self.event = dict(id='lazio', sport_key=self.league, home_team='Lazio', away_team='Cagliari',
            commence_time='2026-11-01T14:00:00Z', completed=True,
            scores=[dict(name='Lazio', score='2'), dict(name='Cagliari', score='1')])

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def run_sync(self, events=None):
        return sync_league(self.db, self.league, [self.event] if events is None else events, self.now)

    def row(self):
        return self.db.query(HistoricalMatch).one()

    def test_confirmed_result_without_alert_is_priced_and_idempotent(self):
        self.assertEqual(self.run_sync()['inserted'], 1)
        self.assertEqual((self.row().ftr, self.row().psch, self.row().season), ('H', 1.5, '2627'))
        self.assertEqual(self.run_sync()['inserted'], 0)
        self.assertEqual(self.run_sync()['updated'], 0)
        self.assertEqual(self.db.query(HistoricalMatch).count(), 1)

    def test_live_and_assumed_results_are_not_settled(self):
        self.event['completed'] = False
        self.db.add(AlertResult(match_id='lazio', home_score=2, away_score=1))
        self.db.flush()
        self.assertEqual(self.run_sync()['inserted'], 0)

    def test_identity_and_score_validation(self):
        for key, value in [('home_team','Roma'), ('sport_key','soccer_epl'),
                           ('commence_time','2026-11-02T14:00:00Z'), ('completed','true'),
                           ('scores',[dict(name='Lazio',score='2.5'),dict(name='Cagliari',score='1')])]:
            with self.subTest(key=key):
                event = {**self.event, key:value}
                self.assertEqual(self.run_sync([event])['inserted'], 0)

    def test_conflicting_result_is_held(self):
        self.run_sync()
        self.event['scores'][0]['score'] = '0'
        self.assertEqual(self.run_sync()['conflicts'], 1)
        self.assertEqual(self.row().fthg, 2)

    def test_stale_post_kickoff_and_wrong_fixture_closes_are_not_used(self):
        for minutes in [31, 0, -1]:
            self.close.captured_at = self.match.commence_time - timedelta(minutes=minutes)
            self.run_sync()
            self.assertIsNone(self.row().psch)
        self.close.captured_at = self.match.commence_time-timedelta(minutes=1)
        self.close.home_team = 'Roma'
        self.run_sync()
        self.assertIsNone(self.row().psch)

    def test_missing_price_filled_existing_price_preserved(self):
        self.close.close_home = None
        self.run_sync()
        self.assertIsNone(self.row().psch)
        self.close.close_home = 1.5
        self.assertEqual(self.run_sync()['updated'], 1)
        self.close.close_home = 1.6
        self.run_sync()
        self.assertEqual(self.row().psch, 1.5)

    def test_saved_final_can_be_recovered_when_provider_window_expires(self):
        self.db.add(AlertResult(match_id='lazio',home_score=2,away_score=1))
        self.db.flush()
        self.assertEqual(self.run_sync([])['inserted'],1)

    def test_small_kickoff_correction_repairs_existing_unpriced_final(self):
        # Recorded close at 13:58 for a 14:00 kickoff; provider later says 14:02.
        self.match.commence_time += timedelta(minutes=2)
        self.db.add(HistoricalMatch(season='2627', league=self.league,
            match_date=self.match.commence_time.date(), home_team='Lazio',
            away_team='Cagliari', fthg=2, ftag=1, ftr='H', price_source='missing'))
        self.db.flush()
        self.assertEqual(self.run_sync([])['updated'], 1)
        row = self.row()
        self.assertEqual((row.psch, row.pscd, row.psca, row.price_source),
                         (1.5, 4.53, 6.87, 'steamwatch_close'))
        self.assertEqual(self.run_sync([])['updated'], 0)
        self.assertEqual(self.db.query(HistoricalMatch).count(), 1)

    def test_kickoff_correction_keeps_identity_and_both_pre_match_guards(self):
        original = self.match.commence_time
        for delta in [-5, 5]:
            with self.subTest(allowed_delta=delta):
                self.match.commence_time = original + timedelta(minutes=delta)
                self.close.captured_at = original - timedelta(minutes=6)
                self.assertTrue(valid_close(self.close, self.match))
        for delta in [-6, 6, 24 * 60]:
            with self.subTest(rejected_delta=delta):
                self.match.commence_time = original + timedelta(minutes=delta)
                self.assertFalse(valid_close(self.close, self.match))
        self.match.commence_time = original + timedelta(minutes=2)
        self.close.captured_at = original + timedelta(minutes=1)
        self.assertFalse(valid_close(self.close, self.match))  # after original KO
        self.match.commence_time = original - timedelta(minutes=2)
        self.close.captured_at = original - timedelta(minutes=1)
        self.assertFalse(valid_close(self.close, self.match))  # after corrected KO
        self.match.commence_time = original + timedelta(minutes=2)
        self.close.captured_at = original - timedelta(minutes=29)
        self.assertFalse(valid_close(self.close, self.match))  # 31 minutes old now
        self.match.commence_time = original
        self.close.captured_at = original - timedelta(minutes=2)
        self.close.match_id = 'different-event'
        self.assertFalse(valid_close(self.close, self.match))


if __name__ == '__main__':
    unittest.main()
