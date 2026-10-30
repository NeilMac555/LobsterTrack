"""Public manager ratings snapshot; no subscription required."""
import json
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Response

manager_ratings_router = APIRouter()


@lru_cache(maxsize=1)
def snapshot():
    return json.loads((Path(__file__).resolve().parents[1] / "data/manager-ratings.json").read_text(encoding="utf-8"))


@manager_ratings_router.get("/manager-ratings")
async def manager_ratings(response: Response):
    response.headers["Cache-Control"] = "public, max-age=300"
    return {**snapshot(), "access": "public"}
