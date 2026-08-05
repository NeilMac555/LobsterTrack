"""
Loads the committed club-finance snapshot into the club_finances table.

The snapshot (app/data/valuball_epl_finances.json) is a static capture,
not a live feed — so this importer is idempotent and cheap: it wipes the
league's rows and reloads from the file. Reload it via
/admin/load-club-finances after refreshing the snapshot for a new season.

Regenerate the snapshot with scripts/refresh_valuball_finances.py (which
documents exactly where the numbers come from — the club_season_financial
_summary table behind valuball.co, itself derived from Companies House
filings).
"""
import json
import os
from datetime import datetime

import structlog
from sqlalchemy.orm import Session

from app.models import ClubFinance

logger = structlog.get_logger()

_SNAPSHOT_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "data", "valuball_epl_finances.json"
)


def load_snapshot(db: Session, path: str | None = None) -> dict:
    """Wipe + reload club_finances from the committed JSON snapshot.
    Returns a summary dict. Safe to call repeatedly."""
    path = path or _SNAPSHOT_PATH
    with open(path, encoding="utf-8") as fh:
        snap = json.load(fh)

    rows = snap.get("rows", [])
    source = snap.get("source", "valuball.co")
    leagues = sorted({r["league"] for r in rows})
    now = datetime.utcnow()

    # Replace, don't accumulate — the snapshot is authoritative.
    db.query(ClubFinance).filter(ClubFinance.league.in_(leagues)).delete(
        synchronize_session=False
    )

    inserted = 0
    unmapped = 0
    for r in rows:
        if r.get("team_name") is None:
            unmapped += 1
        db.add(ClubFinance(
            league=r["league"],
            team_name=r.get("team_name"),
            team_name_raw=r["team_raw"],
            season=r["season"],
            season_code=r["season_code"],
            currency=r.get("currency") or "GBP",
            wage_total_m=r.get("wage_total_m"),
            total_revenue_m=r.get("total_revenue_m"),
            net_spend_m=r.get("net_spend_m"),
            source=source,
            captured_at=now,
        ))
        inserted += 1
    db.commit()

    summary = {
        "inserted": inserted,
        "unmapped_rows": unmapped,
        "leagues": leagues,
        "seasons": sorted({r["season_code"] for r in rows}),
        "source": source,
    }
    logger.info("club finance snapshot loaded", **summary)
    return summary
