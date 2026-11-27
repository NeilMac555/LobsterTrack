import unittest
from datetime import datetime, timedelta

from app.services.dropping_odds_page import LEAGUE_MIN_MATCHES, facts_from_rows, league_paragraphs

KO = datetime(2026, 11, 1, 15, 0)


def row(open_, close, day_before=None, lead_days=10):
    return (KO, KO - timedelta(days=lead_days), *open_, *close, *(day_before or (None, None, None)))


class LeagueFactsTests(unittest.TestCase):
    def test_too_few_matches_gives_no_facts(self):
        rows = [row((2.0, 3.5, 4.0), (2.0, 3.5, 4.0))] * (LEAGUE_MIN_MATCHES - 1)
        self.assertIsNone(facts_from_rows(rows))

    def test_counts_moves_and_when_they_happened(self):
        flat = row((2.00, 3.50, 4.00), (2.00, 3.50, 4.00), (2.00, 3.50, 4.00))
        # home 2.00 -> 1.80 is +5.6 points. Late: still 2.00 a day out. Early: already 1.80 a day out.
        late = row((2.00, 3.50, 4.00), (1.80, 3.70, 4.60), (2.00, 3.50, 4.00))
        early = row((2.00, 3.50, 4.00), (1.80, 3.70, 4.60), (1.80, 3.70, 4.60))
        unknown = row((2.00, 3.50, 4.00), (1.80, 3.70, 4.60))
        f = facts_from_rows([flat] * 20 + [late] * 3 + [early] * 2 + [unknown])
        self.assertEqual((f["matches"], f["moved"], f["late_known"], f["late"]), (26, 6, 5, 3))
        self.assertAlmostEqual(f["lead_days"], 10.0)
        self.assertAlmostEqual(f["median_biggest"], 0.0)
        self.assertAlmostEqual(f["margin_open"], 100 * (1 / 2 + 1 / 3.5 + 1 / 4) - 100)

    def test_bad_prices_are_dropped(self):
        rows = [row((2.0, 3.5, 4.0), (2.0, 3.5, 4.0))] * LEAGUE_MIN_MATCHES + [row((2.0, None, 4.0), (2.0, 3.5, 4.0))]
        self.assertEqual(facts_from_rows(rows)["matches"], LEAGUE_MIN_MATCHES)

    def test_copy_only_states_what_was_calculated(self):
        no_data = league_paragraphs("Ligue 1", "ligue-1", None, None, "2026/27")
        self.assertEqual([p["heading"] for p in no_data], [None, "Ligue 1 steam record"])
        self.assertNotIn("%", no_data[-1]["html"])
        facts = dict(matches=40, lead_days=12.34, margin_open=6.4, margin_close=2.9, median_biggest=1.9, moved=12, late_known=12, late=6)
        full = league_paragraphs("Ligue 1", "ligue-1", facts, dict(total_moves=30, win_rate=40.0, roi_percent=-5.25), "2026/27")
        text = " ".join(p["html"] for p in full)
        for expected in ("12.3 days", "40 finished matches", "6.4%", "2.9%", "12 of those 40 matches (30%)", "In 6 of those 12 (50%)",
                         "30 settled Ligue 1 team steam moves", "-5.2%", 'href="/league/ligue-1"'):
            self.assertIn(expected, text)


if __name__ == "__main__":
    unittest.main()
