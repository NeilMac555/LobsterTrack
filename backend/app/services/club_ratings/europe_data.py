import json, hashlib
from pathlib import Path
DIRECTORY=Path(__file__).parent / "seed"
def read(path): return json.loads(path.read_text(encoding="utf-8"))
def digest(value): return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(",", ":")).encode()).hexdigest()
