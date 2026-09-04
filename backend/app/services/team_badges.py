"""Local team-badge registry; provider calls happen only in sync tooling."""

import json
from functools import lru_cache
from pathlib import Path
from typing import Optional

REGISTRY_PATH = Path(__file__).resolve().parents[1] / "data" / "team_badges.json"


@lru_cache(maxsize=1)
def _registry() -> dict[str, str]:
    try:
        payload = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}
    return {str(k): str(v) for k, v in payload.get("badges", {}).items() if k and v}


def badge_url(team_name: str) -> Optional[str]:
    """Return a badge for a canonical SteamWatch name, or fail closed."""
    return _registry().get(team_name)


def clear_badge_cache() -> None:
    _registry.cache_clear()
