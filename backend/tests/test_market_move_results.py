import asyncio
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.models import Base, Match, SteamMove, SyndicateAlert, AlertResult, HistoricalMatch
from app.api.routes import get_steam_results, get_drifter_results, get_telegram_results
from app.services.result_recovery import recover_results


class MarketMoveResultsTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://')
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.now = datetime.utcnow()
        self.ko = self.now - timedelta(days=2)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def fixture(self, id, league='soccer_epl', ko=None, home='Home', away='Away'):
        self.db.add(Match(id=id, home_team=home, away_team=away, sport_key=league,
                          league_name='League', commence_time=ko or self.ko))
        self.db.flush()

    def move(self, id, price=1.8, opening=2.0, outcome='home', minutes=60, score=(2, 0)):
        match = self.db.get(Match, id)
        m = SteamMove(match_id=id, sport_key=match.sport_key, outcome=outcome,
            team_name=match.home_team if outcome == 'home' else match.away_team,
            opening_odds=opening, previous_odds=opening, current_odds=price,
            movement_percent=999, detected_at=match.commence_time-timedelta(minutes=minutes),
            match_commence_time=match.commence_time, minutes_before_kickoff=minutes,
            result_updated=score is not None, won=(score[0] > score[1]) if score else None,
            home_score=score[0] if score else None, away_score=score[1] if score else None)
        self.db.add(m)
        self.db.flush()
        return m

    def report(self, drift=False, **kw):
        return asyncio.run((get_drifter_results if drift else get_steam_results)(
            db=self.db, league=kw.get('league'), limit=kw.get('limit', 200), days=kw.get('days')))

    def test_all_moves_without_telegram_deduplicate_and_recompute_probability(self):
        self.fixture('one')
        first = self.move('one', price=1.8)
        largest = self.move('one', price=1.7, minutes=30)
        self.move('one', price=1.7, minutes=20)
        r = self.report()
        self.assertEqual(r.source, 'all_steam_moves')
        self.assertEqual(r.total_moves, 1)
        self.assertEqual(r.moves[0].id, largest.id)
        self.assertNotEqual(r.moves[0].id, first.id)
        self.assertAlmostEqual(r.moves[0].movement_percent, 100/1.7-50)
        self.assertEqual(r.profit_units, .7)
        self.assertEqual(asyncio.run(get_telegram_results(self.db, None, 200, None)).total_moves, 0)

    def test_direction_threshold_timing_and_draw_selection_exclusion(self):
        self.fixture('x')
        self.move('x', price=1.9)  # below 3pp
        self.move('x', price=1.5, minutes=121)
        self.move('x', price=1.5, minutes=-1)
        self.move('x', price=1.5, outcome='draw')
        self.move('x', price=2.5, outcome='away')
        self.assertEqual(self.report().total_moves, 0)
        r = self.report(drift=True)
        self.assertEqual(r.total_moves, 1)
        self.assertEqual(r.profit_units, -1)
        self.assertEqual(r.win_rate, 0)

    def test_exact_boundaries_and_settlement_from_other_row(self):
        self.fixture('boundary')
        self.move('boundary', price=100/53, minutes=120, score=None)
        self.move('boundary', price=1.99, minutes=10, score=(1, 1))
        r = self.report()
        self.assertEqual(r.total_moves, 1)
        self.assertEqual(r.total_draws, 1)
        self.assertEqual(r.profit_units, -1)

    def test_ranking_full_ledger_limit_league_season_and_pending(self):
        for i in range(3):
            self.fixture(str(i)); self.move(str(i))
        self.fixture('pending'); self.move('pending', score=None)
        self.fixture('other', league='soccer_italy_serie_a'); self.move('other')
        start_year = self.now.year if self.now.month >= 7 else self.now.year - 1
        self.fixture('old', ko=datetime(start_year, 6, 1)); self.move('old')
        r = self.report(league='soccer_epl', limit=1)
        self.assertEqual(r.total_moves, 3)
        self.assertEqual(r.qualifying_moves, 4)
        self.assertEqual(r.pending_moves, 1)
        self.assertEqual(len(r.moves), 1)
        self.assertEqual(r.team_rankings[0].total_moves, 3)
        self.assertAlmostEqual(r.team_rankings[0].profit_loss, 2.4)
        self.assertEqual(self.report(days=1).total_moves, 0)

    def test_suspended_fixture_never_treated_as_zero_zero(self):
        self.fixture('suspended')
        m = self.move('suspended', price=2.5, score=None)
        record = dict(home_team='Home', away_team='Away', sport_key='soccer_epl',
                      date=self.ko.date().isoformat(), status='suspended')
        with patch('app.services.result_recovery.verified_results', return_value={'suspended': record}):
            r = self.report(drift=True)
            self.assertEqual(r.excluded_moves, 1)
            self.assertEqual(r.total_moves, 0)
            self.assertEqual(recover_results(self.db, [m]), 0)
            self.assertFalse(m.result_updated)

    def test_exact_historical_recovery_old_fixture_and_idempotency(self):
        self.fixture('historic', ko=self.now-timedelta(days=30))
        m = self.move('historic', score=None)
        self.db.add(HistoricalMatch(season='2627', league='soccer_epl',
            match_date=m.match_commence_time.date(), home_team='Home', away_team='Away', fthg=0, ftag=0, ftr='D'))
        self.db.flush()
        self.assertEqual(recover_results(self.db, [m]), 1)
        self.db.commit()
        self.assertEqual((m.home_score, m.away_score), (0, 0))
        self.assertFalse(m.won)
        self.assertEqual(recover_results(self.db, [m]), 0)
        self.assertEqual(self.db.query(AlertResult).count(), 1)

    def test_no_fuzzy_cross_date_or_cross_league_recovery(self):
        self.fixture('missing'); m = self.move('missing', score=None)
        self.db.add(HistoricalMatch(season='2627', league='soccer_epl',
            match_date=self.ko.date()-timedelta(days=1), home_team='Home', away_team='Away', fthg=2, ftag=1, ftr='H'))
        self.db.add(HistoricalMatch(season='2627', league='soccer_efl_champ',
            match_date=self.ko.date(), home_team='Home', away_team='Away', fthg=2, ftag=1, ftr='H'))
        self.db.flush()
        self.assertEqual(recover_results(self.db, [m]), 0)

    def test_verified_scores_guard_fixture_identity_and_conflicts(self):
        self.fixture('verified'); m = self.move('verified', score=None)
        record = dict(home_team='Wrong', away_team='Away', sport_key='soccer_epl',
                      date=self.ko.date().isoformat(), status='completed', home_score=3, away_score=2)
        with patch('app.services.result_recovery.verified_results', return_value={'verified': record}):
            self.assertEqual(recover_results(self.db, [m]), 0)
            record['home_team'] = 'Home'
            self.db.add(AlertResult(match_id='verified', home_score=1, away_score=0)); self.db.flush()
            self.assertEqual(recover_results(self.db, [m]), 0)
