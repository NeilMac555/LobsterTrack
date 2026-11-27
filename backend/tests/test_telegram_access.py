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
from app.api.deps import get_current_user
from app.models import Base, Subscription, TelegramMember, User, get_db

CHANNEL = "-1001234567890"
SETTINGS = SimpleNamespace(telegram_bot_token="t", telegram_channel_id=CHANNEL, jwt_secret="s")


def join(telegram_id, link_name, status="member", chat=CHANNEL):
    update = {"chat_member": {"chat": {"id": int(chat)}, "new_chat_member": {"user": {"id": telegram_id}, "status": status}}}
    if link_name:
        update["chat_member"]["invite_link"] = {"name": link_name}
    return update


class TelegramAccessTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine, tables=[User.__table__, Subscription.__table__, TelegramMember.__table__])
        self.Session = sessionmaker(bind=engine)
        self.db = self.Session()
        for uid, status in ((1, "active"), (2, "past_due"), (3, None)):
            self.db.add(User(id=uid, email=f"u{uid}@example.com"))
            if status:
                self.db.add(Subscription(user_id=uid, status=status))
        self.db.commit()
        self.calls = []

        async def fake_bot(method, **params):
            self.calls.append((method, params))
            if method == "createChatInviteLink":
                return {"ok": True, "result": {"invite_link": "https://t.me/+abc"}}
            return {"ok": True, "result": True}

        self.patches = [
            patch.object(ta, "bot", fake_bot),
            patch.object(ta, "get_settings", lambda: SETTINGS),
            patch.object(ta, "SessionLocal", self.Session),
        ]
        for p in self.patches:
            p.start()
        self.app = FastAPI()
        self.app.include_router(ta.router)
        self.app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(self.app)

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.db.close()

    def as_user(self, status):
        sub = SimpleNamespace(status=status) if status else None
        self.app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1, subscription=sub)

    def test_invite_is_pro_only(self):
        self.app.dependency_overrides[get_current_user] = lambda: None
        self.assertEqual(self.client.post("/pro/telegram-invite").status_code, 401)
        for status in (None, "inactive", "canceled", "past_due"):
            self.as_user(status)
            self.assertEqual(self.client.post("/pro/telegram-invite").status_code, 403)
        self.assertEqual(self.calls, [])

    def test_subscriber_gets_one_use_link_named_after_them(self):
        self.as_user("active")
        r = self.client.post("/pro/telegram-invite")
        self.assertEqual(r.json()["invite_link"], "https://t.me/+abc")
        method, params = self.calls[0]
        self.assertEqual(method, "createChatInviteLink")
        self.assertEqual((params["chat_id"], params["name"], params["member_limit"]), (CHANNEL, "user 1", 1))

    def test_webhook_needs_the_secret(self):
        self.assertEqual(self.client.post("/telegram/webhook", json=join(555, "user 1")).status_code, 403)
        self.assertEqual(self.db.query(TelegramMember).count(), 0)
        r = self.client.post("/telegram/webhook", json=join(555, "user 1"),
                             headers={"X-Telegram-Bot-Api-Secret-Token": ta.webhook_secret()})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.db.query(TelegramMember).one().telegram_user_id, 555)

    def test_joins_that_are_not_ours_are_ignored(self):
        run = lambda u: asyncio.run(ta.record_membership_change(self.db, u))
        self.assertEqual(run(join(555, None)), "ignored")              # added by hand
        self.assertEqual(run(join(555, "promo link")), "ignored")      # some other link
        self.assertEqual(run(join(555, "user 99")), "ignored")         # no such account
        self.assertEqual(run(join(555, "user 1", chat="-100999")), "ignored")  # another chat
        self.assertEqual(run({"message": {"text": "hi"}}), "ignored")
        self.assertEqual(self.db.query(TelegramMember).count(), 0)

    def test_second_account_on_one_subscription_replaces_the_first(self):
        asyncio.run(ta.record_membership_change(self.db, join(555, "user 1")))
        asyncio.run(ta.record_membership_change(self.db, join(777, "user 1")))
        self.assertEqual(self.db.query(TelegramMember).one().telegram_user_id, 777)
        self.assertEqual([c for c in self.calls if c[0] == "banChatMember"][0][1]["user_id"], 555)

    def test_leaving_clears_the_pairing(self):
        asyncio.run(ta.record_membership_change(self.db, join(555, "user 1")))
        self.assertEqual(asyncio.run(ta.record_membership_change(self.db, join(555, None, status="left"))), "left")
        self.assertEqual(self.db.query(TelegramMember).count(), 0)

    def test_sweep_removes_only_lapsed_members(self):
        for uid, tid in ((1, 501), (2, 502), (3, 503)):
            self.db.add(TelegramMember(user_id=uid, telegram_user_id=tid))
        self.db.commit()
        self.assertEqual(asyncio.run(ta.remove_lapsed_members()), {"removed": 2, "failed": 0})
        banned = sorted(p["user_id"] for m, p in self.calls if m == "banChatMember")
        unbanned = sorted(p["user_id"] for m, p in self.calls if m == "unbanChatMember")
        self.assertEqual((banned, unbanned), ([502, 503], [502, 503]))
        self.db.expire_all()
        self.assertEqual([m.user_id for m in self.db.query(TelegramMember).all()], [1])

    def test_failed_removal_is_kept_for_the_next_sweep(self):
        self.db.add(TelegramMember(user_id=2, telegram_user_id=502))
        self.db.commit()

        async def refusing_bot(method, **params):
            return {"ok": False, "description": "not enough rights"}

        with patch.object(ta, "bot", refusing_bot):
            self.assertEqual(asyncio.run(ta.remove_lapsed_members()), {"removed": 0, "failed": 1})
        self.db.expire_all()
        self.assertEqual(self.db.query(TelegramMember).count(), 1)


if __name__ == "__main__":
    unittest.main()
