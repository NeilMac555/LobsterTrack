import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import telegram_access as ta
from app.models import Base, EmailBroadcast, EmailSubscriber, EmailUnsubscribe, Subscription, User, get_db
from app.services import member_broadcast as mb

MOVE, NEW, LAPSED = "pro-telegram-move-2026-11", "pro-offer-new-2026-11", "pro-offer-lapsed-2026-11"
SETTINGS = SimpleNamespace(resend_api_key="k", email_from="SteamWatch <noreply@steamwatch.io>",
                           admin_notify_email="admin@example.com", jwt_secret="secret")


class FakeClient:
    def __init__(self, log, fail=()):
        self.log, self.fail = log, set(fail)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        pass

    async def post(self, url, headers=None, json=None):
        to = json["to"][0]
        self.log.append(json)
        return SimpleNamespace(status_code=500 if to in self.fail else 200, text="boom" if to in self.fail else "{}")


class MemberBroadcastTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine, tables=[User.__table__, Subscription.__table__, EmailSubscriber.__table__,
                                                 EmailBroadcast.__table__, EmailUnsubscribe.__table__])
        self.db = sessionmaker(bind=engine)()
        people = ((1, "active"), (2, "active"), (3, "past_due"), (4, "canceled"), (5, None), (6, "inactive"), (7, None))
        for uid, status in people:
            self.db.add(User(id=uid, email=f"U{uid}@example.com"))
            if status:
                self.db.add(Subscription(user_id=uid, status=status))
        self.db.add(EmailSubscriber(id=1, email="news@example.com"))
        self.db.add(EmailSubscriber(id=2, email="u1@example.com"))   # also has an account
        self.db.commit()
        self.log = []
        self.settings = patch.object(mb, "get_settings", lambda: SETTINGS)
        self.settings.start()

    def tearDown(self):
        self.settings.stop()
        self.db.close()

    def run_mode(self, campaign, mode, fail=()):
        async def no_sleep(_):
            return None
        with patch.object(mb.asyncio, "sleep", no_sleep), patch.object(mb.httpx, "AsyncClient", lambda **k: FakeClient(self.log, fail)):
            return asyncio.run(mb.run(self.db, campaign, mode))

    def sent_to(self):
        return [j["to"][0] for j in self.log]

    def test_audiences_do_not_overlap_and_skip_failing_payments(self):
        emails = lambda name: [e for _, e in mb.audience(self.db, name)]
        self.assertEqual(emails("active"), ["u1@example.com", "u2@example.com"])
        self.assertEqual(emails("lapsed"), ["u4@example.com", "u6@example.com"])
        self.assertEqual(emails("new"), ["u5@example.com", "u7@example.com", "news@example.com"])
        everyone = emails("active") + emails("lapsed") + emails("new")
        self.assertEqual(len(everyone), len(set(everyone)))
        self.assertNotIn("u3@example.com", everyone)

    def test_preview_sends_nothing(self):
        out = self.run_mode(MOVE, "preview")
        self.assertEqual((out["to_send"], out["already_sent"]), (2, 0))
        self.assertIn("Join Telegram Alerts", out["text"])
        self.assertEqual(self.log, [])

    def test_test_mode_goes_to_admin_only(self):
        out = self.run_mode(NEW, "test")
        self.assertTrue(out["test_sent_to_admin"])
        self.assertEqual(self.sent_to(), ["admin@example.com"])
        self.assertTrue(self.log[0]["subject"].startswith("[TEST] "))
        self.assertEqual(self.db.query(EmailBroadcast).count(), 0)

    def test_send_reaches_each_address_once(self):
        out = self.run_mode(MOVE, "send")
        self.assertEqual((out["sent"], out["failed"]), (2, []))
        self.assertEqual(self.sent_to(), ["u1@example.com", "u2@example.com"])
        again = self.run_mode(MOVE, "send")
        self.assertEqual((again["to_send"], again["sent"], again["already_sent"]), (0, 0, 2))
        self.assertEqual(len(self.log), 2)

    def test_a_failed_email_is_retried_next_run_and_others_are_not_repeated(self):
        out = self.run_mode(MOVE, "send", fail={"u2@example.com"})
        self.assertEqual((out["sent"], len(out["failed"])), (1, 1))
        self.log.clear()
        out = self.run_mode(MOVE, "send")
        self.assertEqual((out["sent"], self.sent_to()), (1, ["u2@example.com"]))

    def test_each_offer_carries_the_right_code_and_an_unsubscribe_link(self):
        self.run_mode(NEW, "send")
        self.run_mode(LAPSED, "send")
        by_to = {j["to"][0]: j for j in self.log}
        self.assertIn("STEAM50", by_to["u5@example.com"]["text"])
        self.assertNotIn("COMEBACK50", by_to["u5@example.com"]["text"])
        self.assertIn("COMEBACK50", by_to["u4@example.com"]["text"])
        self.assertNotIn("STEAM50", by_to["u4@example.com"]["text"])
        for to, ref in (("u5@example.com", "u5"), ("news@example.com", "s1"), ("u4@example.com", "u4")):
            url = mb.unsubscribe_url(ref)
            self.assertIn(url, by_to[to]["text"])
            self.assertEqual(by_to[to]["headers"]["List-Unsubscribe"], f"<{url}>")
            self.assertNotIn("example.com", url)

    def test_member_notice_has_no_unsubscribe_footer(self):
        self.run_mode(MOVE, "send")
        self.assertNotIn("Unsubscribe", self.log[0]["text"])
        self.assertNotIn("headers", self.log[0])

    def test_unsubscribed_addresses_are_skipped(self):
        self.assertTrue(mb.unsubscribe(self.db, "u5", mb.unsubscribe_sig("u5")))
        self.assertTrue(mb.unsubscribe(self.db, "u5", mb.unsubscribe_sig("u5")))   # twice is fine
        out = self.run_mode(NEW, "send")
        self.assertEqual((out["sent"], out["skipped_unsubscribed"]), (2, 1))
        self.assertNotIn("u5@example.com", self.sent_to())

    def test_bad_unsubscribe_links_are_refused(self):
        for ref, sig in (("u5", "wrong"), ("u999", mb.unsubscribe_sig("u999")), ("x5", mb.unsubscribe_sig("x5")), ("", "")):
            self.assertFalse(mb.unsubscribe(self.db, ref, sig))
        self.assertEqual(self.db.query(EmailUnsubscribe).count(), 0)

    def test_unsubscribe_page(self):
        app = FastAPI()
        app.include_router(ta.router)
        app.dependency_overrides[get_db] = lambda: self.db
        client = TestClient(app)
        self.assertEqual(client.get("/unsubscribe?r=s1&s=nope").status_code, 400)
        ok = client.get(f"/unsubscribe?r=s1&s={mb.unsubscribe_sig('s1')}")
        self.assertEqual(ok.status_code, 200)
        self.assertIn("unsubscribed", ok.text)
        self.assertEqual(client.post(f"/unsubscribe?r=u4&s={mb.unsubscribe_sig('u4')}").status_code, 200)
        self.assertEqual(sorted(r.email for r in self.db.query(EmailUnsubscribe).all()), ["news@example.com", "u4@example.com"])

    def test_unknown_campaign_or_mode(self):
        self.assertEqual(asyncio.run(mb.run(self.db, "nope", "send"))["error"], "unknown campaign")
        self.assertIn("error", self.run_mode(MOVE, "blast"))
        self.assertEqual(self.log, [])

    def test_wording_has_no_em_dash_and_escapes_html(self):
        for campaign in mb.CAMPAIGNS:
            _, body, text = mb.render(campaign, "u1")
            self.assertNotIn("\u2014", text)
            self.assertNotIn("\u2014", body)
        _, body, text = mb.render(MOVE)
        self.assertIn("you&#x27;re already in", body)
        self.assertIn("1. Log in at https://www.steamwatch.io", text)
        self.assertIn('href="https://www.steamwatch.io/pro"', mb.render(NEW, "u1")[1])


if __name__ == "__main__":
    unittest.main()
