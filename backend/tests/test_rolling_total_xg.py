import unittest
from datetime import datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.models import FormLabSeason
from app.services import form_lab, european_xg, rolling_xg


class RollingTotalXGTests(unittest.TestCase):
    def fixture(self):
        return dict(id=11, season_id=99, league_id=8, starting_at='2026-11-01 16:30:00',
                    state={'developer_name': 'FT'}, stage={'name': 'League Stage'},
                    participants=[dict(id=1, name='Home', meta={'location': 'home'}),
                                  dict(id=2, name='Away', meta={'location': 'away'})],
                    scores=[dict(description='CURRENT', score={'goals': n, 'participant': side})
                            for side, n in [('home', 1), ('away', 0)]],
                    xgfixture=[dict(type_id=t, participant_id=p, data={'value': n})
                               for t,p,n in [(7943,1,0.4),(5304,1,1.19),(7943,2,0),(5304,2,0)]])

    def test_total_is_distinct_from_nonpenalty_in_both_feeds(self):
        f = self.fixture()
        domestic = form_lab.normalize(f, 'soccer_epl', 99, '2026/2027')
        european = european_xg.normalize([f], 8, 99)[0]
        self.assertEqual((domestic['hx'], domestic['home_xg'], domestic['away_xg']), (0.4, 1.19, 0))
        self.assertEqual((european['home_npxg'], european['home_xg'], european['away_xg']), (0.4, 1.19, 0))
        del f['xgfixture'][1]
        self.assertIsNone(form_lab.normalize(f, 'soccer_epl', 99, '2026/2027')['home_xg'])
        self.assertIsNotNone(european_xg.normalize([f], 8, 99)[0]['total_xg_missing_reason'])

    def test_extra_time_totals_do_not_enter_90_minute_european_series(self):
        f = self.fixture()
        f['state'] = {'developer_name':'AET'}
        result = european_xg.normalize([f], 8, 99)[0]
        self.assertIsNone(result['home_xg'])
        self.assertIsNotNone(result['total_xg_missing_reason'])

    def test_stable_identity_across_seasons_and_missing_values(self):
        engine = create_engine('sqlite://')
        FormLabSeason.__table__.create(engine)
        with Session(engine) as db:
            for name, label, date, home, away, totals in [
                ('2025/2026', 'Old name', '2026-05-01', 1, 2, (2.0, 0.0)),
                ('2026/2027', 'New name', '2026-11-01', 2, 1, (1.8, None))]:
                fixture = dict(id=9,date=date,home_id=home,away_id=away,home_xg=totals[0],away_xg=totals[1],hx=0.2,ax=0.4)
                db.add(FormLabSeason(key='soccer_epl:'+name,season=name,league='soccer_epl',updated_at=datetime.utcnow(),
                    data={'teams':{'1':label,'2':'Opponent'},'fixtures':[fixture]}))
            db.flush()
            points = rolling_xg.team_series(db, 'soccer_epl', 'New name', '2026/2027')['data']
            self.assertEqual([(p['season'],p['match_number'],p['xg_for'],p['xg_against']) for p in points],
                             [('2526',1,2.0,0.0),('2627',1,None,1.8)])
        engine.dispose()
