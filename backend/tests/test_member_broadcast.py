import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Base, EmailBroadcast, Subscription, User
from app.services import member_broadcast as mb

CAMPAIGN = "pro-telegram-move-2026-11"
SETTINGS = SimpleNamespace(resend_api_key="k", email_from="SteamWatch <noreply@steamwatch.io>", admin_notify_email="admin@example.com")


class FakeClient:
    def __init__(self, log, fail=()):
        self.log, self.fail = log, set(fail)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        pass

    async def post(self, url, headers=None, json=None):
        to = json["to"][0]
        self.log.append((to, json["subject"]))
        return SimpleNamespace(status_code=500 if to in self.fail else 200, text="boom" if to in self.fail else "{}")


class MemberBroadcastTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine, tables=[User.__table__, Subscription.__table__, EmailBroadcast.__table__])
        self.db = sessionmaker(bind=engine)()
        for uid, status in ((1, "active"), (2, "active"), (3, "past_due"), (4, "canceled"), (5, None)):
            self.db.add(User(id=uid, email=f"u{uid}@example.com"))
            if status:
                self.db.add(Subscription(user_id=uid, status=status))
        self.db.commit()
        self.log = []

    def run_mode(self, mode, fail=()):
        async def no_sleep(_):
            return None
        with patch.object(mb, "get_settings", lambda: SETTINGS), patch.object(mb.asyncio, "sleep", no_sleep), \
                patch.object(mb.httpx, "AsyncClient", lambda **k: FakeClient(self.log, fail)):
            return asyncio.run(mb.run(self.db, CAMPAIGN, mode))

    def test_preview_sends_nothing(self):
        out = self.run_mode("preview")
        self.assertEqual((out["to_send"], out["already_sent"]), (2, 0))
        self.assertIn("Join Telegram Alerts", out["text"])
        self.assertEqual(self.log, [])

    def test_test_mode_goes_to_admin_only(self):
        out = self.run_mode("test")
        self.assertTrue(out["test_sent_to_admin"])
        self.assertEqual(self.log, [("admin@example.com", "[TEST] Your SteamWatch alerts have moved")])
        self.assertEqual(self.db.query(EmailBroadcast).count(), 0)

    def test_send_reaches_active_members_once(self):
        out = self.run_mode("send")
        self.assertEqual((out["sent"], out["failed"]), (2, []))
        self.assertEqual([to for to, _ in self.log], ["u1@example.com", "u2@example.com"])
        again = self.run_mode("send")
        self.assertEqual((again["to_send"], again["sent"], again["already_sent"]), (0, 0, 2))
        self.assertEqual(len(self.log), 2)

    def test_a_failed_email_is_retried_next_run_and_others_are_not_repeated(self):
        out = self.run_mode("send", fail={"u2@example.com"})
        self.assertEqual((out["sent"], len(out["failed"])), (1, 1))
        self.log.clear()
        out = self.run_mode("send")
        self.assertEqual((out["sent"], [to for to, _ in self.log]), (1, ["u2@example.com"]))

    def test_unknown_campaign_or_mode(self):
        with patch.object(mb, "get_settings", lambda: SETTINGS):
            self.assertEqual(asyncio.run(mb.run(self.db, "nope", "send")), {"error": "unknown campaign"})
        self.assertIn("error", self.run_mode("blast"))
        self.assertEqual(self.log, [])

    def test_wording_has_no_em_dash_and_escapes_html(self):
        subject, body, text = mb.render(CAMPAIGN)
        self.assertNotIn("\u2014", text)
        self.assertIn("you&#x27;re already in", body)
        self.assertIn("1. Log in at https://www.steamwatch.io", text)


if __name__ == "__main__":
    unittest.main()
