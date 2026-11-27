import unittest
from urllib.parse import parse_qs, urlsplit

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.legacy_routes import legacy_router


class LegacyRouteTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(legacy_router)
        self.client = TestClient(app, follow_redirects=False)

    def test_closing_lines_preserves_ucl_selection_without_javascript(self):
        for path in ("/cl-closing-lines", "/cl-closing-lines/index.html"):
            for method in (self.client.get, self.client.head):
                response = method(path)
                self.assertEqual(response.status_code, 301)
                self.assertEqual(response.headers["location"],
                                 "/closing-lines?league=soccer_uefa_champs_league")

    def test_ucl_redirect_preserves_tracking_and_overrides_conflicting_league(self):
        response = self.client.get("/cl-closing-lines?utm_source=a%26b&league=soccer_epl&season=2026")
        target = urlsplit(response.headers["location"])
        self.assertEqual(target.path, "/closing-lines")
        self.assertEqual(parse_qs(target.query), {
            "utm_source": ["a&b"], "season": ["2026"],
            "league": ["soccer_uefa_champs_league"],
        })

    def test_power_rankings_goes_to_club_ratings_and_keeps_query(self):
        for path in ("/power-rankings", "/power-rankings/index.html"):
            response = self.client.get(path + "?utm_source=bookmark")
            self.assertEqual(response.status_code, 301)
            self.assertEqual(response.headers["location"], "/tools/club-ratings?utm_source=bookmark")

    def test_hidden_xg_tables_redirect_without_javascript_or_database(self):
        for page in ("justice-table", "goals-coming-soon"):
            for suffix in ("", "/", "/index.html"):
                for method in (self.client.get, self.client.head):
                    response = method(f"/{page}{suffix}?months=6")
                    self.assertEqual(response.status_code, 302)
                    self.assertEqual(response.headers["location"], "/tools/rolling-xg")
                    self.assertEqual(response.headers["cache-control"], "no-store")

    def test_unrelated_routes_are_not_redirected(self):
        for path in ("/match/example", "/league/premier-league", "/tools/rolling-xg"):
            self.assertNotIn("location", self.client.get(path).headers)


if __name__ == "__main__":
    unittest.main()
