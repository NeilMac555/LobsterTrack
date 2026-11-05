import unittest
from tempfile import TemporaryDirectory
from pathlib import Path
from unittest.mock import patch

import httpx
from app.services.xg_goals import _justice_rows
from app.services.club_ratings import europe_clubelo
from app.services.form_lab import expected_points
from app.services.club_ratings.sportmonks import ProviderError


class JusticeTests(unittest.TestCase):
    def test_pair_and_window_define_both_actual_and_expected_points(self):
        fixtures = [
            dict(id=1, date='2026-06-01', home_id=1, away_id=2, hg=0, ag=1, home_xpts=2.2, away_xpts=0.5),
            dict(id=2, date='2026-10-30', home_id=2, away_id=1, hg=0, ag=0, home_xpts=0, away_xpts=3),
            dict(id=3, date='2026-11-01', home_id=1, away_id=2, hg=9, ag=0, home_xpts=3, away_xpts=None),
            dict(id=4, date='2026-05-31', home_id=2, away_id=1, hg=4, ag=0, home_xpts=3, away_xpts=0),
        ]
        rows = _justice_rows(fixtures, {'1':'One','2':'Two'}, 'soccer_epl', '2026-06-01','2026-11-01',2)
        self.assertEqual([(r['team'],r['matches'],r['xpts'],r['points'],r['move']) for r in rows],
                         [('One',2,5.2,1,1), ('Two',2,0.5,4,-1)])
        f = {'xgfixture':[dict(type_id=5304, participant_id=1, data={'value':1.4}),
                          dict(type_id=7939, participant_id=1, data={'value':0})]}
        self.assertEqual(expected_points(f,1),0)
        self.assertIsNone(expected_points(f,2))
        f['xgfixture'][1]['data']['value']=3.01
        self.assertIsNone(expected_points(f,1))


class ClubEloTests(unittest.TestCase):
    def page(self, day):
        rows = ''.join(f'<tr><td class="l"><img alt="ENG"><span class="Ast">Club{i}</span></td>'
                       f'<td class="r">{1900-i}</td></tr>' for i in range(110))
        return f'<h1><a href="/{day}/Ranking">Ranking</a></h1>'+rows

    def test_official_page_date_and_fallback(self):
        observed = '2026-11-05T10:00:00+00:00'
        with self.assertRaises(ProviderError):
            europe_clubelo.normalise(self.page('2026-10-19'), observed)
        with TemporaryDirectory() as temp, patch.object(europe_clubelo, 'now', return_value=observed):
            bad = httpx.Response(403, request=httpx.Request('GET', 'https://clubelo.com/Ranking'))
            good = httpx.Response(200, text=self.page('2026-11-04'), request=httpx.Request('GET','https://clubelo.com/'))
            with patch.object(europe_clubelo.httpx,'get',side_effect=[bad,good]) as get:
                result = europe_clubelo.refresh(Path(temp))
            self.assertEqual(get.call_count,2)
            self.assertEqual(result['teams'],110)
