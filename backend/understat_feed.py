"""Shared match-level Understat ingestion for the weekly chart and ratings.

Missing non-penalty values are never replaced by total xG or zero. Reject an
incomplete payload before callers replace a previously valid season.
"""
import gzip
import json
import math
import urllib.request
from datetime import datetime, timezone


def fetch_league(slug, year):
    req = urllib.request.Request(
        f'https://understat.com/getLeagueData/{slug}/{year}',
        headers={'User-Agent': 'Mozilla/5.0', 'X-Requested-With': 'XMLHttpRequest',
                 'Referer': f'https://understat.com/league/{slug}/{year}'})
    with urllib.request.urlopen(req, timeout=30) as response:
        raw = response.read()
        if raw[:2] == b'\x1f\x8b':
            raw = gzip.decompress(raw)
    return json.loads(raw)


def number(value):
    if value is None or isinstance(value, bool):
        raise ValueError('Missing non-penalty xG; previous data must be retained.')
    result = float(value)
    if not math.isfinite(result) or result < 0:
        raise ValueError('Invalid non-penalty xG.')
    return result


def parse_matches(payload, year, as_of=None):
    as_of = as_of or datetime.now(timezone.utc)
    histories = {}
    for team_id, team in payload['teams'].items():
        for item in team.get('history', []):
            identity = (str(team_id), item['date'][:10], item['h_a'])
            if identity in histories:
                raise ValueError('Ambiguous Understat team/date/venue.')
            histories[identity] = item
    rows, seen = [], set()
    for fixture in payload['dates']:
        if fixture.get('isResult') is not True:
            continue
        dt = datetime.fromisoformat(fixture['datetime']).replace(tzinfo=timezone.utc)
        if dt > as_of:
            continue
        fid = str(fixture['id'])
        if fid in seen:
            raise ValueError('Duplicate Understat fixture.')
        seen.add(fid)
        h, a = fixture['h'], fixture['a']
        hi = histories.get((str(h['id']), dt.date().isoformat(), 'h'))
        ai = histories.get((str(a['id']), dt.date().isoformat(), 'a'))
        if hi is None or ai is None:
            raise ValueError('Completed fixture lacks matching team history.')
        hf, ha = number(hi.get('npxG')), number(hi.get('npxGA'))
        af, aa = number(ai.get('npxG')), number(ai.get('npxGA'))
        if abs(hf-aa) > .001 or abs(af-ha) > .001:
            raise ValueError('Non-penalty xG does not reconcile between opponents.')
        rows.append({'match_id': fid, 'date': dt.isoformat(), 'season': str(year),
                     'home_id': str(h['id']), 'away_id': str(a['id']),
                     'home': h['title'], 'away': a['title'], 'home_npxg': hf, 'away_npxg': af})
    return sorted(rows, key=lambda r: (r['date'], r['match_id']))


def chart_rows(matches, sport_key, name_map=None):
    name_map = name_map or {}
    counts, rows = {}, []
    for match in matches:
        year = int(match['season'])
        for side, opponent in [('home', 'away'), ('away', 'home')]:
            name = name_map.get(match[side], match[side])
            identity = (year, name)
            counts[identity] = counts.get(identity, 0) + 1
            rows.append({'league': sport_key, 'team_name': name,
                         'season': f'{year % 100:02d}{(year+1) % 100:02d}',
                         'match_number': counts[identity],
                         'npxg_for': match[side+'_npxg'], 'npxg_against': match[opponent+'_npxg'],
                         'match_date': datetime.fromisoformat(match['date']).date()})
    return rows
