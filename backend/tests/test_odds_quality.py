import unittest
import asyncio
from datetime import datetime, timedelta
from unittest.mock import patch
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.models import (Base, Match, OddsSnapshot, SteamMove, SyndicateAlert,
                        OddsQualityArchive, ClosingLine, HistoricalMatch)
from app.models.closing_line import MarketType
from app.services.odds_quality import rejection_reason, valid_snapshot_sql
from app.services.odds_quality_repair import repair_history
from app.services.odds_fetcher import OddsFetcher


class OddsQualityTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://')
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine, autoflush=False)
        self.ko = datetime(2026, 11, 22, 16, 30)
        self.match = Match(id='quality', home_team='Home', away_team='Away', sport_key='soccer_epl',
                           league_name='Premier League', commence_time=self.ko)
        self.db.add(self.match)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def tick(self, minutes, values, bookmaker='pinnacle', in_play=False):
        row = OddsSnapshot(match_id='quality', fetched_at=self.ko-timedelta(minutes=minutes),
            home_odds=values[0], draw_odds=values[1], away_odds=values[2], bookmaker=bookmaker, in_play=in_play)
        self.db.add(row)
        self.db.flush()
        return row

    def test_finite_complete_book_and_boundaries_match_sql(self):
        examples = [((1.68, 3.2, 3.25), False), ((1.72, 3.4, 4.2), True),
                    ((1.8, 4.18, 4.26), True), ((2, 4, 1/.37), True),
                    ((2, 4, 1/.371), False), ((0, 4, 4), False),
                    ((None, 4, 4), False), ((float('inf'), 3, 3), False),
                    ((float('nan'), 3, 3), False), ((20, 20, 20), False)]
        for values, valid in examples:
            with self.subTest(values=values):
                self.assertEqual(rejection_reason(*values) is None, valid)
                row = self.tick(60, values)
                self.assertEqual(self.db.query(OddsSnapshot).filter(OddsSnapshot.id == row.id,
                    valid_snapshot_sql(OddsSnapshot)).count() == 1, valid)

    def test_archive_replay_idempotency_and_alerts_unchanged(self):
        bad = self.tick(10000, (1.68, 3.2, 3.25))
        bad_id = bad.id
        self.tick(9000, (2.2, 3.6, 3.4))
        self.tick(80, (1.8, 4.18, 4.26))
        self.tick(20, (1.8, 4.18, 4.26))  # repeated quote is one move
        self.tick(5, (1.5, 4.5, 5.5), bookmaker='betfair_ex_eu')
        self.tick(-1, (1.5, 4.5, 5.5), in_play=True)
        old = SteamMove(match_id='quality', sport_key='soccer_epl', team_name='Home', outcome='home',
            opening_odds=1.68, previous_odds=1.68, current_odds=1.8, movement_percent=-4,
            detected_at=self.ko-timedelta(minutes=80), match_commence_time=self.ko,
            minutes_before_kickoff=80, result_updated=True, home_score=2, away_score=0, won=True)
        self.db.add(old)
        alert = SyndicateAlert(match_id='quality', market='1x2', outcome='home', movement_percent=4,
                              odds_at_alert=1.75, alerted_at=self.ko-timedelta(minutes=60))
        self.db.add(alert)
        self.db.commit()
        before_alert = (alert.id, alert.odds_at_alert, alert.alerted_at, alert.movement_percent)
        dry = repair_history(self.db, dry_run=True)
        self.assertEqual(dry['snapshots_archived'], 1)
        self.assertEqual(self.db.query(OddsQualityArchive).count(), 0)
        result = repair_history(self.db)
        self.db.commit()
        self.assertEqual(result['snapshots_archived'], 1)
        archived = self.db.query(OddsQualityArchive).filter_by(source_table='odds_snapshots').one()
        self.assertEqual(archived.payload['id'], bad_id)
        self.assertEqual(archived.payload['home_odds'], 1.68)
        moves = self.db.query(SteamMove).all()
        self.assertTrue(moves)
        home = next(m for m in moves if m.outcome == 'home')
        self.assertEqual(home.opening_odds, 2.2)
        self.assertEqual(home.current_odds, 1.8)
        self.assertAlmostEqual(home.movement_percent, 100/1.8-100/2.2)
        self.assertTrue(home.won)
        self.assertEqual((home.home_score, home.away_score), (2, 0))
        self.assertEqual((alert.id, alert.odds_at_alert, alert.alerted_at, alert.movement_percent), before_alert)
        ids = [m.id for m in moves]
        self.assertEqual(repair_history(self.db)['snapshots_archived'], 0)
        self.assertEqual([m.id for m in self.db.query(SteamMove)], ids)

    def test_repair_rollback_preserves_active_data(self):
        self.tick(100, (1.68, 3.2, 3.25))
        self.db.commit()
        with patch('app.services.odds_quality_repair.replay_moves', side_effect=RuntimeError('test')):
            with self.assertRaises(RuntimeError):
                repair_history(self.db)
        self.db.rollback()
        self.assertEqual(self.db.query(OddsSnapshot).count(), 1)
        self.assertEqual(self.db.query(OddsQualityArchive).count(), 0)

    def test_bad_close_and_copied_price_repaired_with_fresh_valid_quote(self):
        self.tick(2, (1.8, 4.18, 4.26))
        self.tick(1, (1.68, 3.2, 3.25))
        close = ClosingLine(match_id='quality', league='soccer_epl', home_team='Home', away_team='Away',
            market_type=MarketType.H2H, kickoff_time=self.ko, captured_at=self.ko-timedelta(minutes=1),
            minutes_before_kickoff=1, close_home=1.68, close_draw=3.2, close_away=3.25)
        row = HistoricalMatch(league='soccer_epl', season='2627', match_date=self.ko.date(),
            home_team='Home', away_team='Away', fthg=2, ftag=0, ftr='H',
            psch=1.68, pscd=3.2, psca=3.25, price_source='steamwatch_close')
        self.db.add_all([close, row]); self.db.commit()
        result = repair_history(self.db); self.db.commit()
        self.assertEqual(result['closes_repaired'], 1)
        self.assertEqual(result['historical_prices_repaired'], 1)
        self.assertEqual((close.close_home, row.psch), (1.8, 1.8))
        self.assertEqual((row.fthg, row.ftag), (2, 0))

    def test_live_detector_ignores_bad_opening_and_rejects_bad_current(self):
        self.tick(5000, (1.68, 3.2, 3.25))
        self.tick(4000, (2.2, 3.6, 3.4))
        fetcher = OddsFetcher()
        self.assertEqual(fetcher._detect_late_steam(self.db, self.match,
            dict(home=1.68, draw=3.2, away=3.25), self.ko-timedelta(minutes=60), 'soccer_epl'), 0)
        fetcher._detect_late_steam(self.db, self.match, dict(home=1.8, draw=4.18, away=4.26),
                                  self.ko-timedelta(minutes=60), 'soccer_epl')
        self.db.flush()
        self.assertEqual(self.db.query(SteamMove).filter_by(outcome='home').one().opening_odds, 2.2)

    def test_ingest_quarantines_rejected_tick_instead_of_publishing(self):
        event = dict(id='quality', home_team='Home', away_team='Away', commence_time=self.ko.isoformat()+'Z')
        with patch('app.services.odds_fetcher.SessionLocal', return_value=Session(self.engine)), \
             patch.object(OddsFetcher, '_extract_1x2_odds', return_value=(dict(home=1.68, draw=3.2, away=3.25), 'pinnacle')):
            result = OddsFetcher()._store_odds([event], 'soccer_epl', 'Premier League')
        self.assertEqual(result['odds_stored'], 0)
        self.assertEqual(self.db.query(OddsSnapshot).count(), 0)
        archived = self.db.query(OddsQualityArchive).one()
        self.assertEqual(archived.reason, 'book_above_112_percent')
        self.assertEqual(archived.payload['home_odds'], 1.68)

    def test_invalid_close_without_fresh_replacement_is_archived_not_guessed(self):
        self.tick(100, (1.8, 4.18, 4.26))
        self.db.add(ClosingLine(match_id='quality', league='soccer_epl', home_team='Home', away_team='Away',
            market_type=MarketType.H2H, kickoff_time=self.ko, captured_at=self.ko-timedelta(minutes=1),
            minutes_before_kickoff=1, close_home=1.68, close_draw=3.2, close_away=3.25))
        self.db.commit()
        result = repair_history(self.db); self.db.commit()
        self.assertEqual(result['closes_removed'], 1)
        self.assertEqual(self.db.query(ClosingLine).count(), 0)
        self.assertEqual(self.db.query(OddsQualityArchive).filter_by(source_table='closing_lines').count(), 1)

    def test_chart_and_homepage_never_splice_exchange_into_pinnacle(self):
        from app.api.routes import get_match_detail, get_matches, _RESPONSE_CACHE
        self.tick(1000, (2.2, 3.6, 3.4), bookmaker='betfair_ex_eu')
        self.tick(500, (1.68, 3.2, 3.25))  # invalid Pinnacle opener
        self.tick(400, (1.8, 4.18, 4.26))
        self.tick(10, (1.9, 4, 3.9))
        self.db.commit()
        detail = asyncio.run(get_match_detail('quality', self.db))
        self.assertEqual(len(detail.odds_history), 2)
        self.assertEqual(detail.odds_history[0].home_odds, 1.8)
        self.assertEqual(detail.current_odds_bookmaker, 'pinnacle')
        _RESPONSE_CACHE.clear()
        result = get_matches(self.db, league=None, upcoming_only=False, limit=50, offset=0)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].opening_home_odds, 1.8)

    def test_drifters_public_summary_includes_all_settled_teams(self):
        from app.services.public_summaries import drifters_summary
        self.assertIn('No settled qualifying', drifters_summary(self.db))
        for i, outcome in enumerate(['home', 'away']):
            self.db.add(SteamMove(match_id='quality', sport_key='soccer_epl', team_name=outcome,
                outcome=outcome, opening_odds=2, previous_odds=2, current_odds=2.5,
                movement_percent=-10, detected_at=self.ko-timedelta(minutes=30),
                match_commence_time=self.ko, minutes_before_kickoff=30,
                result_updated=True, home_score=2, away_score=0, won=i == 0))
        self.db.commit()
        with patch('app.services.public_summaries._season_start', return_value=datetime(2026, 7, 1)):
            summary = drifters_summary(self.db)
        # Neither team reaches the ranking minimum of three; both still count here.
        self.assertIn('2 settled team drifts', summary)
        self.assertIn('50.0% won', summary)
        self.assertIn('+0.50u (+25.00% ROI)', summary)


if __name__ == '__main__':
    unittest.main()
