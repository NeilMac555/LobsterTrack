import unittest
from types import SimpleNamespace

from app.services.xg_goals import _league_gap_rows


class GoalsComingSoonTests(unittest.TestCase):
    def test_window_uses_paired_total_xg_and_current_participant_ids(self):
        def fixture(id, day, home, away, goals, xg):
            return dict(id=id, date=day, home_id=home, away_id=away, hg=goals[0], ag=goals[1],
                        home_xg=xg[0], away_xg=xg[1], hx=0.1, ax=0.2)

        def snapshot(teams, fixtures):
            return SimpleNamespace(league='soccer_epl', data={'teams': teams, 'fixtures': fixtures})

        first = fixture(1, '2026-05-01', 2, 1, (0, 2), (0, 1.8))
        previous = snapshot({'1': 'Old name', '2': 'Relegated'}, [
            first, fixture(2, '2026-04-30', 1, 2, (4, 0), (3, 1)),
        ])
        current = snapshot({'1': 'New name', '3': 'Promoted'}, [
            first,  # Repeated fixture ID only counts once.
            fixture(3, '2026-10-25', 1, 3, (1, 2), (0, 2.1)),
            fixture(4, '2026-10-26', 3, 1, (7, 4), (1.1, None)),
            fixture(5, '2026-10-29', 3, 1, (5, 0), (4.3, 0.5)),
        ])
        rows = list(_league_gap_rows(current, previous, '2026-05-01', '2026-10-28', 2))
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual((row['team'], row['matches'], row['goals'], row['conceded']),
                         ('New name', 2, 3, 2))
        self.assertEqual((row['xg'], row['gap'], row['xga'], row['def_gap'], row['last_match']),
                         (1.8, 1.2, 2.1, -0.1, '2026-10-25'))
