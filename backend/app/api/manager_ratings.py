"""Serve the manager snapshot with subscription enforcement before serialization."""
import json
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Depends, Response
from app.api.deps import get_current_user

manager_ratings_router = APIRouter()


@lru_cache(maxsize=1)
def snapshot():
    return json.loads((Path(__file__).resolve().parents[1] / "data/manager-ratings.json").read_text(encoding="utf-8"))


def has_access(user):
    sub = getattr(user, "subscription", None)
    if not sub or sub.status != "active":
        return False
    end = sub.current_period_end
    return end is None or end.replace(tzinfo=timezone.utc) > datetime.now(timezone.utc)


def public_preview(data):
    # Only aggregates and the fixed overall top three are public. No alternate
    # query/sort/date window can be used to enumerate the remaining managers.
    keys = ("as_of", "ranking_start", "recent_start", "eligible_managers", "current_managers",
            "managers", "imported_completed_fixtures", "used_fixtures", "coverage", "skipped")
    preview = {k: data[k] for k in keys if k in data}
    preview["rows"] = sorted((r for r in data["rows"] if r["eligible"]), key=lambda r: r["rank"])[:3]
    preview["appointment_overrides"] = []
    preview["fixture_coach_corrections"] = []
    return preview


@manager_ratings_router.get("/manager-ratings")
async def manager_ratings(response: Response, user=Depends(get_current_user)):
    full = has_access(user)
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Vary"] = "Authorization"
    data = snapshot()
    return {**(data if full else public_preview(data)), "access": "pro" if full else "preview"}
