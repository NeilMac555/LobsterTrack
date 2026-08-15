"""
Loads the committed squad-market-value snapshot into the
squad_market_values table.

The snapshot (app/data/transfermarkt_squad_values.json) is a static,
manually-transcribed capture — Transfermarkt has no public API and
their terms prohibit scraping — so this importer is idempotent and
cheap: it wipes and reloads every row. Reload it via
/admin/load-squad-values after regenerating the snapshot with
scripts/refresh_squad_values.py.
"""
import json
import os
from datetime import datetime

import structlog
from sqlalchemy.orm import Session

from app.models import SquadMarketValue

logger = structlog.get_logger()

_SNAPSHOT_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "data", "transfermarkt_squad_values.json"
)


def load_snapshot(db: Session, path: str | None = None) -> dict:
    """Wipe + reload squad_market_values from the committed JSON
    snapshot. Returns a summary dict. Safe to call repeatedly."""
    path = path or _SNAPSHOT_PATH
    with open(path, encoding="utf-8") as fh:
        snap = json.load(fh)

    rows = snap.get("rows", [])
    source = snap.get("source", "Transfermarkt")
    now = datetime.utcnow()

    db.query(SquadMarketValue).delete(synchronize_session=False)

    inserted = 0
    unmapped = 0
    for r in rows:
        if r.get("team") is None:
            unmapped += 1
        db.add(SquadMarketValue(
            team=r.get("team"),
            team_raw=r["team_raw"],
            competition_label=r.get("competition_label"),
            market_value_eur=r["market_value_eur"],
            source=source,
            captured_at=now,
        ))
        inserted += 1
    db.commit()

    summary = {
        "inserted": inserted,
        "matched_to_tracked_team": inserted - unmapped,
        "unmapped_rows": unmapped,
        "source": source,
    }
    logger.info("squad market value snapshot loaded", **summary)
    return summary
