from datetime import datetime, timezone
def utcnow(): return datetime.now(timezone.utc)
def utc(value):
    d=datetime.fromisoformat(value.replace("Z", "+00:00"))
    return d.replace(tzinfo=timezone.utc) if d.tzinfo is None else d.astimezone(timezone.utc)
