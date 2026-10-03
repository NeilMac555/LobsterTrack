import unittest
from datetime import date, datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.models import LeagueConstants
from app.models.xg_team_result import XGTeamResult
from app.services.predictor_baselines import calculate_baseline, get_baselines, _cache


def matches(n, year, goals=2, xg=2, penalty=0.2):
    return [dict(season=f'{year % 100:02d}{(year + 1) % 100:02d}',
                 match_date=date(year, 8, 1) + timedelta(days=i // 10),
                 team_name=f'Team {i}', goals_for=goals, goals_against=0,
                 xg_for=xg, xg_against=0, npxg_for=xg-penalty, npxg_against=0)
            for i in range(n)]


class PredictorBaselineTests(unittest.TestCase):
    def test_scoring_blends_but_input_references_match_current_season(self):
        b = calculate_baseline(matches(380, 2025) + matches(50, 2026, 4, 4), date(2026, 10, 3))
        self.assertAlmostEqual(b['current_weight'], 1/3)
        self.assertAlmostEqual(2*b['avg_goals_per_team'], 8/3)
        self.assertEqual(b['avg_xg'], 2)
        self.assertEqual(b['avg_goals_reference'], 2)
        self.assertEqual(b['reference_season'], '2627')
        self.assertEqual(b['reference_matches'], 50)
        self.assertAlmostEqual(b['avg_penalty_xg'], .1)
        self.assertEqual(b['current_matches'], 50)
        self.assertEqual(b['sample_matches'], 430)

    def test_current_season_gains_weight_without_jump(self):
        previous = matches(380, 2025)
        a = calculate_baseline(previous + matches(10, 2026, 4), date(2026, 10, 3))
        b = calculate_baseline(previous + matches(100, 2026, 4), date(2026, 10, 3))
        self.assertLess(a['avg_goals_per_team'], b['avg_goals_per_team'])
        self.assertEqual(b['current_weight'], .5)
        self.assertEqual(b['avg_goals_per_team'], 1.5)

    def test_no_current_data_is_explicit_not_mislabeled_as_current(self):
        b = calculate_baseline(matches(380, 2025), date(2026, 10, 3))
        self.assertEqual(b['data_status'], 'previous_season_only')
        self.assertEqual(b['current_weight'], 0)
        self.assertEqual(b['current_matches'], 0)
        self.assertEqual(b['reference_season'], '2526')
        self.assertIsNone(b['current_goals_per_match'])

    def test_missing_previous_season_requires_sufficient_current_sample(self):
        self.assertIsNone(calculate_baseline(matches(49, 2026), date(2026, 10, 3)))
        b = calculate_baseline(matches(50, 2026), date(2026, 10, 3))
        self.assertEqual(b['current_weight'], 1)
        self.assertEqual(b['previous_matches'], 0)

    def test_bad_duplicate_future_and_mislabeled_rows_do_not_change_sample(self):
        rows = matches(50, 2025)
        bad = [dict(rows[0], team_name='NaN', xg_for=float('nan')),
               dict(rows[0], team_name='Bad npxG', npxg_for=10),
               dict(rows[0], team_name='Negative', goals_for=-1),
               dict(rows[0], team_name='Fractional', goals_for=1.5),
               dict(rows[0], team_name='Wrong season', match_date=date(2026, 9, 1)),
               dict(matches(1, 2026)[0], team_name='Future', match_date=date(2026, 10, 4))]
        b = calculate_baseline(rows + rows + bad, date(2026, 10, 3))
        self.assertEqual(b['sample_matches'], 50)

    def test_future_rows_excluded_even_inside_the_same_season(self):
        rows = matches(100, 2026)
        b = calculate_baseline(rows, date(2026, 8, 6))
        self.assertEqual(b['current_matches'], 50)
        self.assertEqual(b['latest_match'], '2026-08-05')

    def test_api_uses_one_home_row_per_match_and_keeps_home_ratio_separate(self):
        from unittest.mock import patch
        engine = create_engine('sqlite://')
        XGTeamResult.__table__.create(engine)
        LeagueConstants.__table__.create(engine)
        _cache.clear()
        with Session(engine) as db:
            db.add(LeagueConstants(league='soccer_italy_serie_a', avg_goals_per_team=1.26,
                                   home_away_ratio=1.12, sample_matches=810))
            for row in matches(50, 2025) + matches(50, 2026, 4, 4):
                db.add(XGTeamResult(**row, league='soccer_italy_serie_a', home=True))
                db.add(XGTeamResult(**dict(row, team_name='Away '+row['team_name']),
                                   league='soccer_italy_serie_a', home=False))
            db.commit()
            with patch('app.services.predictor_baselines.datetime') as clock:
                clock.utcnow.return_value = datetime(2026, 10, 3)
                result = get_baselines(db)
            row = result['baselines'][0]
            self.assertEqual(row['sample_matches'], 100)
            self.assertEqual(row['home_away_ratio'], 1.12)
            self.assertEqual(row['source'], 'Understat')
            self.assertIn('soccer_epl', result['unavailable'])
        _cache.clear()
        engine.dispose()


if __name__ == '__main__':
    unittest.main()
