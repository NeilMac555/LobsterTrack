"""Weekly reports: sent Telegram alerts only, 1u at the recorded sent price.
Run with production DATABASE_URL and PYTHONPATH=backend. End date is exclusive.
Example: python scripts/report-telegram-results.py 2026-09-14 2026-09-21
"""
import argparse
import json
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from app.models.database import SessionLocal
from app.services.telegram_results import alert_moves

parser = argparse.ArgumentParser()
parser.add_argument('start')
parser.add_argument('end')
args = parser.parse_args()
def boundary(day):
    return datetime.fromisoformat(day).replace(tzinfo=ZoneInfo('Europe/Dublin')).astimezone(timezone.utc).replace(tzinfo=None)
def report(moves):
    settled = [m for m in moves if m.result_updated]
    profit = sum(m.current_odds-1 if m.won else -1 for m in settled)
    return dict(alerts=len(moves), settled=len(settled), pending=len(moves)-len(settled),
        winners=sum(bool(m.won) for m in settled), profit_units=round(profit, 4),
        roi=round(100*profit/len(settled), 2) if settled else None)
with SessionLocal() as db:
    moves = alert_moves(db, since=boundary(args.start), until=boundary(args.end))
    print(json.dumps(dict(source='confirmed_telegram_alerts',start=args.start,end_exclusive=args.end,
        totals=report(moves),competitions={k:report([m for m in moves if m.sport_key==k]) for k in sorted({m.sport_key for m in moves})}), indent=2))
