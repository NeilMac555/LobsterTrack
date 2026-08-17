"""
Scrape xG data from Understat for all leagues and output CSV rows.

Understat moved their data off the HTML page sometime in 2025/2026 — the
league/team pages are now JS shells that fetch /getLeagueData/<slug>/<season>
as JSON via XHR. This script hits that endpoint directly.

Usage:
    python scripts/scrape_understat.py                 # all 5 leagues
    python scripts/scrape_understat.py EPL             # one league
    python scripts/scrape_understat.py EPL 2025-08-01  # skip matches on/before cutoff
"""
import gzip
import json
import sys
import urllib.request
import urllib.error

LEAGUES = {
    # Understat slug  -> our sport_key
    'EPL':        'soccer_epl',
    'La_liga':    'soccer_spain_la_liga',
    'Bundesliga': 'soccer_germany_bundesliga',
    'Serie_A':    'soccer_italy_serie_a',
    'Ligue_1':    'soccer_france_ligue_one',
}

SEASON = '2026'  # Understat uses the season-start year — 2026 = 2026/27

# Any team-name mismatches between Understat and the Rolling xG frontend's
# dropdown go here. Most teams match 1:1 so this stays small.
NAME_MAP = {
    # (Understat name -> our name)
    # Examples only — add entries when a team goes missing from the chart.
    # 'Brighton':      'Brighton & Hove Albion',
    # 'Wolverhampton': 'Wolves',
}


def fetch_league_data(slug: str) -> dict:
    """GET https://understat.com/getLeagueData/<slug>/<season> as JSON."""
    url = f'https://understat.com/getLeagueData/{slug}/{SEASON}'
    req = urllib.request.Request(
        url,
        headers={
            'User-Agent': (
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                'AppleWebKit/537.36 (KHTML, like Gecko) '
                'Chrome/131.0.0.0 Safari/537.36'
            ),
            'Accept': 'application/json, text/plain, */*',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': f'https://understat.com/league/{slug}/{SEASON}',
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
        # Understat's CDN transparently gzips responses even when we don't
        # ask for it. Check the Content-Encoding header (case-insensitive)
        # and decompress if needed — urllib doesn't handle this for us.
        encoding = (resp.headers.get('Content-Encoding') or '').lower()
        if encoding == 'gzip' or raw[:2] == b'\x1f\x8b':
            raw = gzip.decompress(raw)
        return json.loads(raw.decode('utf-8'))


def main() -> int:
    league_filter = sys.argv[1] if len(sys.argv) > 1 else None
    cutoff_date = sys.argv[2] if len(sys.argv) > 2 else None

    if league_filter:
        leagues = {k: v for k, v in LEAGUES.items()
                   if k.lower() == league_filter.lower()}
        if not leagues:
            sys.stderr.write(
                f'Unknown league: {league_filter}. Valid: {list(LEAGUES)}\n'
            )
            return 2
    else:
        leagues = LEAGUES

    # CSV header — this is exactly what /api/admin/upload-xg expects.
    print("league,team_name,match_number,npxg_for,npxg_against,match_date")

    total_rows = 0
    for slug, sport_key in leagues.items():
        sys.stderr.write(f'Fetching {slug}...\n')
        try:
            data = fetch_league_data(slug)
        except (urllib.error.URLError, json.JSONDecodeError) as e:
            sys.stderr.write(f'  ERROR fetching {slug}: {e}\n')
            continue

        teams = data.get('teams') or {}
        if not teams:
            sys.stderr.write(f'  ERROR: no teams in {slug} payload\n')
            continue

        league_rows = 0
        for _team_id, team_info in teams.items():
            raw_name = team_info.get('title') or ''
            team_name = NAME_MAP.get(raw_name, raw_name)
            history = team_info.get('history') or []

            # History is returned in date order; sort explicitly as a safety net.
            history.sort(key=lambda m: (m.get('date') or ''))

            match_number = 0
            for match in history:
                match_date = (match.get('date') or '')[:10]  # 'YYYY-MM-DD'
                if cutoff_date and match_date <= cutoff_date:
                    continue

                # npxG / npxGA fall back to xG / xGA if Understat ever serves
                # a match without the npxG keys (rare, but historically possible).
                npxg_for = match.get('npxG', match.get('xG', 0)) or 0
                npxg_against = match.get('npxGA', match.get('xGA', 0)) or 0

                match_number += 1
                print(
                    f'{sport_key},{team_name},{match_number},'
                    f'{npxg_for},{npxg_against},{match_date}'
                )
                league_rows += 1

        sys.stderr.write(f'  Done: {len(teams)} teams, {league_rows} rows\n')
        total_rows += league_rows

    sys.stderr.write(f'Total: {total_rows} rows across {len(leagues)} league(s)\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
