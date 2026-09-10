"""Local JSON helpers; this module makes no Sportmonks requests."""
import json
from .data import utcnow
class ProviderError(Exception): pass
def now(): return utcnow().isoformat()
def write_json(path, value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,allow_nan=False),encoding="utf-8")
