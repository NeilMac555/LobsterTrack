import asyncio
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

from app.services import scheduler as sch
from app.services.odds_fetcher import OddsFetcher

LEAGUES = {"soccer_epl": "Premier League", "soccer_efl_champ": "Championship"}


def quota(used, plan=100000):
    return {"used": str(used), "remaining": str(plan - used), "market": "h2h"}


class BrakeTests(unittest.TestCase):
    def test_no_reading_yet_allows_it(self):
        for q in (None, {}, {"used": "unknown", "remaining": "unknown"}):
            self.assertTrue(sch.fast_budget_ok(q, datetime(2026, 12, 10)))

    def test_start_of_month_has_headroom_only(self):
        now = datetime(2026, 12, 1, 0, 0)
        self.assertTrue(sch.fast_budget_ok(quota(4000), now))
        self.assertFalse(sch.fast_budget_ok(quota(4001), now))

    def test_on_pace_mid_month(self):
        now = datetime(2026, 11, 16)          # exactly half of a 30 day month
        self.assertTrue(sch.fast_budget_ok(quota(51500), now))     # 47,500 + 4,000
        self.assertFalse(sch.fast_budget_ok(quota(51501), now))

    def test_never_plans_past_95_percent_of_the_plan(self):
        end = datetime(2026, 12, 31, 23, 59)
        self.assertTrue(sch.fast_budget_ok(quota(98000), end))
        self.assertFalse(sch.fast_budget_ok(quota(99500), end))

    def test_scales_with_plan_size(self):
        now = datetime(2026, 11, 16)
        self.assertTrue(sch.fast_budget_ok(quota(200000, plan=500000), now))


class FakeFetcher:
    def __init__(self, last_quota=None):
        self.calls, self.last_quota = [], last_quota

    async def fetch_all_leagues(self, sport_keys=None, h2h_only_keys=None):
        self.calls.append((list(sport_keys), list(h2h_only_keys or [])))
        return {"odds_stored": 0, "matches_found": 0, "errors": []}


class Capturer:
    async def capture_closing_lines(self):
        return {"closing_lines_captured": 0}


class TickTests(unittest.TestCase):
    def setUp(self):
        self.s = sch.OddsScheduler()
        self.fetcher = FakeFetcher()
        self.fast = {"soccer_epl"}            # leagues with a kickoff inside 12 hours
        self.interval = {}                    # full-refresh interval per league
        self.patches = [
            patch.object(sch, "odds_fetcher", self.fetcher),
            patch.object(sch, "closing_line_capturer", Capturer()),
            patch.object(sch.settings, "leagues", LEAGUES),
            patch.object(self.s, "_in_fast_window", lambda k: k in self.fast),
            patch.object(self.s, "_get_league_refresh_info", lambda k: (self.interval.get(k, 15), [])),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()

    def tick(self):
        asyncio.run(self.s.smart_tick())
        calls, self.fetcher.calls = self.fetcher.calls, []
        return calls

    def age(self, minutes):
        """Pretend every fetch so far happened this many minutes earlier."""
        for d in (self.s._last_fetch_by_league, self.s._last_fast_fetch_by_league):
            for k in d:
                d[k] -= timedelta(minutes=minutes)

    def test_first_tick_is_a_full_refresh_of_everything(self):
        self.assertEqual(self.tick(), [(["soccer_epl", "soccer_efl_champ"], [])])

    def test_match_odds_only_every_six_minutes_inside_the_window(self):
        self.tick()
        self.age(4)
        self.assertEqual(self.tick(), [])
        self.age(2)
        self.assertEqual(self.tick(), [(["soccer_epl"], ["soccer_epl"])])
        self.age(4)
        self.assertEqual(self.tick(), [])
        self.age(2)
        self.assertEqual(self.tick(), [(["soccer_epl"], ["soccer_epl"])])

    def test_full_refresh_still_runs_on_its_own_clock(self):
        self.tick()
        self.age(6)
        self.tick()                           # fast, at 6 minutes
        self.age(6)
        self.tick()                           # fast, at 12 minutes
        self.age(3)                           # 15 minutes since the full refresh
        self.assertEqual(self.tick(), [(["soccer_epl", "soccer_efl_champ"], [])])
        self.age(4)
        self.assertEqual(self.tick(), [])     # the full refresh counted as a match odds refresh too

    def test_league_outside_the_window_is_never_fast(self):
        self.fast = set()
        self.tick()
        self.age(8)
        self.assertEqual(self.tick(), [])

    def test_last_half_hour_keeps_the_two_minute_full_refresh(self):
        self.interval = {"soccer_epl": 2}
        self.tick()
        self.age(2)
        self.assertEqual(self.tick(), [(["soccer_epl"], [])])

    def test_brake_pauses_only_the_fast_refresh(self):
        self.tick()
        self.fetcher.last_quota = quota(100000)
        self.age(6)
        self.assertEqual(self.tick(), [])
        self.assertEqual(self.s._recent_errors[-1]["where"], "fast_refresh")
        self.age(6)
        self.tick()
        self.assertEqual(len(self.s._recent_errors), 1)        # reported once, not every tick
        self.age(3)
        self.assertEqual(self.tick(), [(["soccer_epl", "soccer_efl_champ"], [])])
        self.fetcher.last_quota = quota(100)
        self.age(6)
        self.assertEqual(self.tick(), [(["soccer_epl"], ["soccer_epl"])])


class FetcherTests(unittest.TestCase):
    def test_match_odds_only_leagues_skip_totals_and_handicaps(self):
        f = OddsFetcher()
        f.leagues = LEAGUES
        seen = []

        async def odds(client, key, name):
            seen.append(("h2h", key))
            return {"matches": 1, "odds_stored": 1}

        async def totals(client, key):
            seen.append(("totals", key))
            return {"totals_stored": 0}

        async def spreads(client, key):
            seen.append(("spreads", key))
            return {"spreads_stored": 0}

        class Alerter:
            runs = 0

            async def check_and_alert(self):
                Alerter.runs += 1
                return {"alerts_sent": 0}

        with patch.object(f, "_fetch_league_odds", odds), patch.object(f, "_fetch_league_totals", totals), \
                patch.object(f, "_fetch_league_spreads", spreads), \
                patch("app.services.syndicate_alerter.syndicate_alerter", Alerter()):
            out = asyncio.run(f.fetch_all_leagues(sport_keys=["soccer_epl", "soccer_efl_champ"],
                                                  h2h_only_keys=["soccer_epl"]))
        self.assertEqual(seen, [("h2h", "soccer_epl"), ("h2h", "soccer_efl_champ"),
                                ("totals", "soccer_efl_champ"), ("spreads", "soccer_efl_champ")])
        self.assertEqual(out["leagues_processed"], 2)
        self.assertEqual(Alerter.runs, 1)     # alerts are still checked after a match-odds-only refresh


if __name__ == "__main__":
    unittest.main()
