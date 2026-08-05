"""
Regenerate app/data/valuball_epl_finances.json — the committed Premier
League club-finance snapshot that feeds the Forecast Engine's `wages`
source.

Provenance: valuball.co is a React SPA backed by a public Supabase
project; its club_season_financial_summary table is readable with the
anon key shipped in the site bundle. The wage/revenue figures ultimately
derive from clubs' Companies House filings (audited annual accounts).
We take a static snapshot rather than depending on their endpoint at
request time — run this once per season when new accounts are filed.

Usage:  python backend/scripts/refresh_valuball_finances.py
        (writes the JSON in place; review the diff before committing)

If the anon key has rotated, re-extract it from the current site bundle:
  curl -s https://valuball.co/ | grep -o '/assets/index-[^"]*\.js'
  then grep the JS for the supabase URL and the eyJ... anon token.
"""
import json
import os
import ssl
import urllib.request

SUPA_URL = "https://xsmkmpmkgbmstepxpmtt.supabase.co"
ANON = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzbWttcG1rZ2Jtc3RlcHhwbXR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgwNTcwNDAsImV4cCI6MjA2MzYzMzA0MH0."
    "R9IBp-Gmptn8HFIWIMme4bP8NaDBVZwKCo_FXlM5bnA"
)

# valuball club_key -> SteamWatch canonical name (The Odds API spelling).
# Only current-era clubs are mapped; older top-flight clubs are stored
# with team_name=null (raw kept) rather than guessed.
VB_TO_CANON = {
    "Arsenal": "Arsenal", "Aston Villa": "Aston Villa", "Bournemouth": "Bournemouth",
    "Brentford": "Brentford", "Brighton": "Brighton and Hove Albion", "Burnley": "Burnley",
    "Chelsea": "Chelsea", "Coventry": "Coventry City", "Crystal Palace": "Crystal Palace",
    "Everton": "Everton", "Fulham": "Fulham", "Hull City": "Hull City",
    "Ipswich Town": "Ipswich Town", "Leeds": "Leeds United", "Leicester": "Leicester City",
    "Liverpool": "Liverpool", "Luton Town": "Luton Town", "Man City": "Manchester City",
    "Man Utd": "Manchester United", "Newcastle": "Newcastle United", "Norwich": "Norwich City",
    "Nottingham Forest": "Nottingham Forest", "Sheffield Utd": "Sheffield United",
    "Southampton": "Southampton", "Sunderland": "Sunderland", "Tottenham": "Tottenham Hotspur",
    "Watford": "Watford", "West Bromwich": "West Bromwich Albion", "West Ham": "West Ham United",
    "Wolves": "Wolverhampton Wanderers",
}

OUT_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "app", "data", "valuball_epl_finances.json"
)


def _season_code(year: int) -> str:
    """valuball year N (FY (N-1)/N) -> football-data code, e.g. 2025 -> '2425'."""
    return f"{(year - 1) % 100:02d}{year % 100:02d}"


def _fetch_all() -> list:
    ctx = ssl.create_default_context()
    cafile = os.environ.get("REQUESTS_CA_BUNDLE") or "/root/.ccr/ca-bundle.crt"
    if os.path.exists(cafile):
        ctx = ssl.create_default_context(cafile=cafile)
    hdr = {"apikey": ANON, "Authorization": "Bearer " + ANON}
    rows, off = [], 0
    while True:
        url = (f"{SUPA_URL}/rest/v1/club_season_financial_summary"
               f"?select=*&order=id&limit=1000&offset={off}")
        req = urllib.request.Request(url, headers=hdr)
        page = json.load(urllib.request.urlopen(req, context=ctx, timeout=30))
        rows += page
        if len(page) < 1000:
            break
        off += 1000
    return rows


def main():
    rows = _fetch_all()
    out = []
    for r in rows:
        if r.get("competition") != "ENG1" or not r.get("wage_total"):
            continue
        out.append({
            "league": "soccer_epl",
            "team_raw": r["club_key"],
            "team_name": VB_TO_CANON.get(r["club_key"]),
            "season": r["season"],
            "season_code": _season_code(r["season"]),
            "currency": r.get("currency") or "GBP",
            "wage_total_m": round(r["wage_total"], 3),
            "total_revenue_m": round(r["total_revenue"], 3) if r.get("total_revenue") else None,
            "net_spend_m": round(r["net_spend"], 3) if r.get("net_spend") is not None else None,
        })
    out.sort(key=lambda x: (-x["season"], -(x["wage_total_m"] or 0)))
    snapshot = {
        "source": "valuball.co (club_season_financial_summary, ENG1) — figures derive from clubs' Companies House filings",
        "source_url": "https://valuball.co/",
        "unit": "GBP millions",
        "note": ("Premier League only. Wage bills are club-level total staff costs from "
                 "audited annual accounts (lag ~1 season vs. the current campaign)."),
        "rows": out,
    }
    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(snapshot, fh, indent=1, ensure_ascii=False)
    print(f"wrote {len(out)} rows -> {OUT_PATH}")


if __name__ == "__main__":
    main()
