import unittest
from datetime import datetime, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.models import Base, Match, OddsSnapshot, AlertResult, HistoricalMatch
from app.services.team_market_context import team_market_context


class TeamMarketContextTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://')
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.now = datetime(2026, 10, 30, 12)
        self.target = self.fixture('target', ko=self.now + timedelta(days=1), home='Napoli', away='Inter Milan', score=None)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def fixture(self, id, ko=None, home='Napoli', away='Opponent', league='soccer_italy_serie_a', score=(2, 0)):
        match = Match(id=id, home_team=home, away_team=away, sport_key=league,
                      league_name='Serie A', commence_time=ko or self.now-timedelta(days=3))
        self.db.add(match);self.db.flush()
        if score is not None:
            self.db.add(AlertResult(match_id=id, home_score=score[0], away_score=score[1]));self.db.flush()
        return match

    def snap(self, match, price, minutes, bookmaker='pinnacle', away=3.0, in_play=False):
        self.db.add(OddsSnapshot(match_id=match.id, bookmaker=bookmaker, home_odds=price,
            draw_odds=3.5, away_odds=away, fetched_at=match.commence_time-timedelta(minutes=minutes), in_play=in_play))
        self.db.flush()

    def report(self, target=None):
        return team_market_context(self.db, target or self.target, now=self.now)

    def test_drifts_are_independent_of_telegram_and_count_a_fixture_once(self):
        m=self.fixture('past')
        self.snap(m,2,1440)
        for minutes in [100,60,20,1]:self.snap(m,2.5,minutes)
        r=self.report()['teams'][0]
        self.assertEqual((r['tracked_matches'],r['drifts'],r['steams']),(1,1,0))
        self.assertEqual(r['records']['drift'],dict(wins=1,draws=0,losses=0))
        self.assertEqual(r['history'][0]['close_move_pp'],-10)

    def test_threshold_and_window_boundaries_and_reversals(self):
        m=self.fixture('past')
        self.snap(m,2,1440)
        self.snap(m,100/47,120)
        self.snap(m,100/53,1)
        r=self.report()['teams'][0]
        self.assertEqual((r['both'],r['drifts'],r['steams'],r['tracked_matches']),(1,0,0,1))

    def test_movements_outside_window_and_inplay_are_not_counted(self):
        m=self.fixture('past')
        self.snap(m,2,1440);self.snap(m,3,121);self.snap(m,2.01,1)
        self.snap(m,5,-1);self.snap(m,5,0);self.snap(m,5,2,in_play=True)
        r=self.report()['teams'][0]
        self.assertEqual((r['quiet'],r['drifts']),(1,0))

    def test_bookmaker_switch_is_not_a_market_move(self):
        m=self.fixture('past')
        self.snap(m,1.5,1500,bookmaker='betfair_ex_eu')
        self.snap(m,2,1440);self.snap(m,2,1)
        self.snap(m,3,0.5,bookmaker='betfair_ex_eu')
        r=self.report()['teams'][0]
        self.assertEqual(r['quiet'],1)
        self.assertEqual(r['history'][0]['opening_odds'],2)

    def test_missing_stale_or_single_price_is_not_quiet(self):
        for id in ['missing','stale','one']:
            m=self.fixture(id,away=id)
            if id!='missing':self.snap(m,2,1440 if id=='stale' else 1)
            if id=='stale':self.snap(m,2.5,31)
        r=self.report()['teams'][0]
        self.assertEqual((r['completed_matches'],r['unavailable_matches'],r['quiet']),(3,3,0))

    def test_previous_season_other_leagues_future_and_selected_fixture_excluded(self):
        cases=[('old',dict(ko=datetime(2026,6,20))),('cup',dict(league='soccer_uefa_champs_league')),
               ('future',dict(ko=self.now+timedelta(days=2)))]
        for id,kw in cases:
            m=self.fixture(id,**kw);self.snap(m,2,1440);self.snap(m,3,1)
        self.assertEqual(self.report()['teams'][0]['completed_matches'],0)

    def test_archived_match_has_no_future_history_and_uses_its_own_season(self):
        old=self.fixture('archive',ko=datetime(2025,10,20),score=None)
        before=self.fixture('before',ko=datetime(2025,10,10))
        after=self.fixture('after',ko=datetime(2025,10,25))
        for m in [before,after]:self.snap(m,2,1440);self.snap(m,2.5,1)
        r=self.report(old)
        self.assertEqual(r['season'],'2025/26')
        self.assertEqual([m['match_id'] for m in r['teams'][0]['history']],['before'])

    def test_away_prices_and_results_and_duplicate_fixture_ids(self):
        for id in ['a','b']:
            m=self.fixture(id,home='Opponent',away='Napoli',score=(1,3))
            self.snap(m,2,1440,away=3);self.snap(m,2,1,away=2.5)
        r=self.report()['teams'][0]
        self.assertEqual((r['completed_matches'],r['steams']),(1,1))
        self.assertEqual(r['records']['steam']['wins'],1)

    def test_historical_score_fallback_and_conflicting_results(self):
        for id in ['historical','conflict']:
            m=self.fixture(id,away=id,score=None if id=='historical' else (1,0))
            self.snap(m,2,1440);self.snap(m,2.5,1)
            self.db.add(HistoricalMatch(season='2627',league=m.sport_key,match_date=m.commence_time.date(),
                home_team=m.home_team,away_team=m.away_team,fthg=0,ftag=0,ftr='D'))
        self.db.flush()
        r=self.report()['teams'][0]
        self.assertEqual(r['completed_matches'],1)
        self.assertEqual(r['records']['drift']['draws'],1)

    def test_latest_five_are_chronological_and_both_teams_have_context(self):
        for i in range(7):
            m=self.fixture(str(i),ko=self.now-timedelta(days=i+1),home='Inter Milan',away=str(i))
            self.snap(m,2,1440);self.snap(m,1.8,1)
        r=self.report()['teams'][1]
        self.assertEqual([x['match_id'] for x in r['recent']],['0','1','2','3','4'])
        self.assertEqual(r['steams'],7)


if __name__=='__main__':unittest.main()
