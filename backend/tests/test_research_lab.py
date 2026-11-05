import unittest
from datetime import date, datetime, timedelta
from types import SimpleNamespace

from app.api.deps import get_current_user
from app.api.research import router
from app.models import Base, HistoricalMatch, User, get_db
from app.services.research_query import describe, parse, resolve
from app.services.research_results import quote, report
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

TODAY = date(2026, 11, 5)
LAZIO_QUESTION = (
    "iN SERIE A if I bet on Lazio every week in the 2026 2027 season "
    "how much would I be up if betting a flat 1u per bet"
)


class Questions(unittest.TestCase):
    def test_conversational_level_stake_questions(self):
        canonical = parse("Lazio in Serie A 2026/27", TODAY)
        for q in (
            LAZIO_QUESTION,
            "Would I be up or down if I'd put one unit on Lazio every single match in 26/27?",
            "How much would I have made backing Lazio week in, week out in 2026–27?",
            "Would backing Lazio each week at level stakes in the 2026 / 2027 season be profitable?",
        ):
            with self.subTest(q=q):
                self.assertEqual(
                    resolve(q, "Arsenal away last 5 games", TODAY), canonical
                )
        for period in ("last season", "25-26", "2025 2026", "2025/26"):
            base = "Lazio at home in Serie A 2026/27 below 2.5"
            with self.subTest(period=period):
                self.assertEqual(
                    resolve("What about " + period + "?", base, TODAY),
                    parse(base.replace("2026/27", "2025/26"), TODAY),
                )

    def test_original_question_and_followup(self):
        rules = parse(
            "What percentage of games have English teams won in Europe this season?",
            TODAY,
        )
        self.assertEqual(len(rules.competitions), 3)
        home = resolve("What about at home?", describe(rules), TODAY)
        self.assertEqual(home.venue, "home")
        away = resolve("what about away from home?", describe(home), TODAY)
        self.assertEqual(away.venue, "away")
        odds = resolve("and sub 2.00?", describe(away), TODAY)
        self.assertEqual(parse(describe(odds), TODAY), odds)
        self.assertEqual((odds.bound, odds.price), ("below", 2))
        narrowed = resolve("UCL only?", describe(odds), TODAY)
        self.assertEqual(narrowed.competitions, ["UCL"])
        self.assertEqual(narrowed.venue, "away")
        self.assertEqual(
            resolve("what's the P/L if I backed them?", describe(away), TODAY), away
        )
        limit = parse("Napoli in Serie A at odds of 2.00 or greater", TODAY)
        self.assertEqual((limit.bound, limit.price), ("at least", 2.0))

    def test_refuses_unsupported_conditions(self):
        for q in (
            "English teams away on Fridays",
            "Napoli BTTS yes",
            "Arsenal against Chelsea",
            "Arsenal away except draws",
            "Arsenal last 500",
            "English clubs in Europe last season",
            "Chelsea below 2 and above 3",
            "Backing Lazio last week",
            "Backing Lazio every other week",
            "Betting Lazio on weekends only",
            "Lazio every week in 2026 2028",
            "Lazio in 2025 2026 and 2026/27",
            "Lazio last season in 2026 2027",
            "Lazio every week for 2u per game",
            "Lazio for 1.5 units per game",
            "Back Lazio over 2.5 goals every week",
        ):
            with self.subTest(q=q), self.assertRaises(ValueError):
                parse(q, TODAY)

    def test_exact_price_boundary_and_ambiguity(self):
        ko = datetime(2026, 10, 1, 20)
        line = SimpleNamespace(
            kickoff_time=ko,
            captured_at=ko - timedelta(minutes=5),
            match_id="a",
            close_home=1.8,
            close_away=3.9,
        )
        lines = {("l", "2026-10-01", "one", "two"): [line]}
        get = lambda: quote(lines, "l", "2026-10-01", "One", "Two", "away")[0]
        self.assertEqual(get(), 3.9)
        line.captured_at -= timedelta(seconds=1)
        self.assertIsNone(get())
        line.captured_at = ko
        self.assertIsNone(get())
        line.captured_at = ko - timedelta(seconds=1)
        lines[next(iter(lines))].append(line)
        self.assertIsNone(get())


class MembershipAndTracking(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.app = FastAPI()
        self.app.include_router(router)
        self.app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(self.app)
        self.people = []
        for i in range(2):
            u = User(email=f"test{i}@example.invalid")
            self.db.add(u)
            self.db.flush()
            self.people.append(
                SimpleNamespace(id=u.id, subscription=SimpleNamespace(status="active"))
            )
        self.app.dependency_overrides[get_current_user] = lambda: self.people[0]
        self.add_game("2026-10-10", "Lazio", 2, 0, 2.1, "close")
        self.add_game("2026-10-12", "Roma", 0, 0, 1.9, "bfex_close")
        self.add_game("2026-10-18", "Genoa", 0, 1, 1.5, "open_fallback")
        self.db.commit()
        self.body = {"question": "Napoli home in Serie A 2026/27"}

    def tearDown(self):
        self.client.close()
        self.db.close()
        self.engine.dispose()

    def add_game(self, day, opponent, h, a, odd, source):
        self.db.add(
            HistoricalMatch(
                league="soccer_italy_serie_a",
                season="2627",
                match_date=date.fromisoformat(day),
                home_team="Napoli",
                away_team=opponent,
                fthg=h,
                ftag=a,
                psch=odd,
                price_source=source,
            )
        )

    def test_settlement_and_unpriced_games(self):
        r = self.client.post("/research/run", json=self.body).json()
        self.assertEqual(
            (r["summary"]["games"], r["summary"]["pnl"], r["summary"]["priced"]),
            (3, 1.1, 1),
        )
        follow = self.client.post(
            "/research/run", json={"question": "above 2", "previous": r["canonical"]}
        ).json()
        self.assertEqual((follow["summary"]["games"], follow["unclassified"]), (1, 2))
        at_price = report(
            self.db, parse("Napoli home in Serie A 2026/27 above 2.10", TODAY)
        )
        self.assertEqual(at_price["summary"]["games"], 0)
        checked = self.client.post(
            "/research/run",
            json={"question": "Napoli in all 3 games at home in Serie A 2026/27"},
        )
        self.assertEqual(checked.status_code, 200)
        stale = self.client.post(
            "/research/run",
            json={"question": "Napoli in all 5 games at home in Serie A 2026/27"},
        )
        self.assertEqual(stale.status_code, 422)

    def test_free_text_question_settles_lazio_from_both_venues(self):
        self.db.add(
            HistoricalMatch(
                league="soccer_italy_serie_a",
                season="2627",
                match_date=date(2026, 11, 1),
                home_team="Lazio",
                away_team="Cagliari",
                fthg=2,
                ftag=1,
                psch=1.50,
                price_source="close",
            )
        )
        self.db.query(HistoricalMatch).filter_by(away_team="Lazio").update(
            {"psca": 3.25}
        )
        self.db.commit()
        response = self.client.post(
            "/research/run",
            json={
                "question": LAZIO_QUESTION,
                "previous": "English clubs in Europe 2026/27 at home",
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertEqual(result["canonical"], "Lazio in Serie A 2026/27")
        self.assertEqual(result["summary"]["priced"], 2)
        self.assertEqual(result["summary"]["pnl"], -0.50)

    def test_switch_between_leaderboard_and_match_examples(self):
        previous = "Lazio in Serie A 2026/27"
        for text, expected in [
            ("Which team has seen steam moves the most this season from the Top 5 leagues?", "movement_ranking"),
            ("Serie A only?", "movement_ranking"),
            ("Which teams have drifted most in the Premier League?", "movement_ranking"),
            ("Would I be up backing Lazio every week this season?", None),
        ]:
            r = self.client.post("/research/run", json={"question": text, "previous": previous})
            self.assertEqual(r.status_code, 200, r.text)
            self.assertEqual(r.json().get("kind"), expected)
            previous = r.json()["canonical"]

    def test_paid_access_and_account_isolation(self):
        ident = self.client.post("/research/tracks", json=self.body).json()["id"]
        self.app.dependency_overrides[get_current_user] = lambda: self.people[1]
        self.assertEqual(self.client.get("/research/tracks").json(), [])
        self.assertEqual(self.client.get(f"/research/tracks/{ident}").status_code, 404)
        self.assertEqual(
            self.client.delete(f"/research/tracks/{ident}").status_code, 404
        )
        for user, code in [
            (None, 401),
            (SimpleNamespace(subscription=None), 403),
            (SimpleNamespace(subscription=SimpleNamespace(status="canceled")), 403),
        ]:
            self.app.dependency_overrides[get_current_user] = lambda: user
            for path in ["/research/run", "/research/tracks"]:
                self.assertEqual(
                    self.client.post(path, json=self.body).status_code, code
                )

    def test_baseline_is_frozen_and_save_is_idempotent(self):
        data = self.client.post("/research/tracks", json=self.body).json()
        again = self.client.post("/research/tracks", json=self.body).json()
        self.assertEqual(data["id"], again["id"])
        self.add_game(data["forward_from"], "Torino", 1, 0, 2.4, "close")
        self.db.commit()
        later = self.client.get("/research/tracks/" + str(data["id"])).json()
        self.assertEqual(later["baseline"], data["baseline"])
        self.assertEqual(later["forward"]["summary"]["pnl"], 1.4)
        self.assertEqual(later["forward"]["summary"]["games"], 1)
        self.assertEqual(
            self.client.delete("/research/tracks/" + str(data["id"])).status_code, 204
        )
