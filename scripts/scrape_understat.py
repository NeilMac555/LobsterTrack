"""
Scrape xG data from Understat for all leagues and output CSV rows.
Usage: python scripts/scrape_understat.py
"""
import urllib.request
import json
import re
import sys
from datetime import datetime

LEAGUES = {
    'Bundesliga': 'soccer_germany_bundesliga',
    'EPL': 'soccer_epl',
    'La_liga': 'soccer_spain_la_liga',
    'Serie_A': 'soccer_italy_serie_a',
    'Ligue_1': 'soccer_france_ligue_one',
}

# Team name mapping: Understat -> our spreadsheet names
NAME_MAP = {
    # Bundesliga
    'Borussia M.Gladbach': 'Borussia M.Gladbach',
    'RasenBallsport Leipzig': 'RasenBallsport Leipzig',
    # EPL
    'Manchester United': 'Manchester United',
    'Manchester City': 'Manchester City',
    # Add more as needed
}

def fetch_league_matches(league_name, season='2025'):
    """Fetch all matches for a league from Understat."""
    url = f'https://understat.com/league/{league_name}/{season}'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    html = urllib.request.urlopen(req).read().decode('utf-8')

    # Understat stores match data in hex-encoded JSON strings
    # Look for datesData which contains all match results
    # The pattern is: var datesData = JSON.parse('hex_encoded_json')

    # Find all large hex-encoded strings between single quotes
    results = []
    i = 0
    search = "\\x"
    while i < len(html):
        # Find a quote followed by hex escape
        sq = html.find("'" + search[0], i)
        if sq == -1:
            break
        # Check if it's \x pattern
        if html[sq+1:sq+3] == '\\x':
            # Find closing quote
            end = sq + 1
            while end < len(html) and html[end] != "'":
                end += 1
            content = html[sq+1:end]
            if len(content) > 1000:
                results.append(content)
            i = end + 1
        else:
            i = sq + 2

    # Try to decode each and find the one with match data
    for raw in results:
        try:
            decoded = raw.encode('raw_unicode_escape').decode('unicode_escape')
            data = json.loads(decoded)
            # datesData is a list of date groups with matches
            if isinstance(data, list) and len(data) > 0:
                first = data[0]
                if isinstance(first, dict) and 'id' in first:
                    return data
        except:
            continue

    return None


def fetch_team_data(league_name, season='2025'):
    """Fetch per-team match data from Understat team pages."""
    url = f'https://understat.com/league/{league_name}/{season}'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    html = urllib.request.urlopen(req).read().decode('utf-8')

    # Find teamsData
    results = []
    i = 0
    while i < len(html):
        sq = html.find("'\\x", i)
        if sq == -1:
            break
        end = sq + 1
        while end < len(html) and html[end] != "'":
            end += 1
        content = html[sq+1:end]
        if len(content) > 1000:
            try:
                decoded = content.encode('raw_unicode_escape').decode('unicode_escape')
                data = json.loads(decoded)
                results.append(data)
            except:
                pass
        i = end + 1

    # teamsData is a dict keyed by team ID
    for data in results:
        if isinstance(data, dict):
            first_key = list(data.keys())[0]
            first_val = data[first_key]
            if isinstance(first_val, dict) and 'history' in first_val:
                return data

    return None


if __name__ == '__main__':
    league_filter = sys.argv[1] if len(sys.argv) > 1 else None
    cutoff_date = sys.argv[2] if len(sys.argv) > 2 else None

    if league_filter:
        leagues = {k: v for k, v in LEAGUES.items() if k.lower() == league_filter.lower()}
    else:
        leagues = LEAGUES

    print("league,team_name,match_number,npxg_for,npxg_against,match_date")

    for league_name, sport_key in leagues.items():
        sys.stderr.write(f"Fetching {league_name}...\n")
        team_data = fetch_team_data(league_name)

        if not team_data:
            sys.stderr.write(f"  ERROR: Could not fetch data for {league_name}\n")
            continue

        for team_id, team_info in team_data.items():
            team_name = NAME_MAP.get(team_info['title'], team_info['title'])
            history = team_info.get('history', [])

            # Sort by date
            history.sort(key=lambda x: x.get('date', ''))

            for i, match in enumerate(history, 1):
                match_date = match.get('date', '')[:10]

                # Skip if before cutoff
                if cutoff_date and match_date <= cutoff_date:
                    continue

                npxg_for = match.get('npxG', match.get('xG', 0))
                npxg_against = match.get('npxGA', match.get('xGA', 0))

                print(f"{sport_key},{team_name},{i},{npxg_for},{npxg_against},{match_date}")

        sys.stderr.write(f"  Done: {len(team_data)} teams\n")
