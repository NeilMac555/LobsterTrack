"""Package a validated Manager Elo snapshot for SteamWatch (no API credentials)."""
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('snapshot', type=Path, help='Directory containing manager-elo.html and manager-elo-data.json')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
destination = root / 'frontend/public/tools/manager-ratings'
destination.mkdir(parents=True, exist_ok=True)
source = (args.snapshot / 'manager-elo.html').read_text(encoding='utf-8')
payload = (args.snapshot / 'manager-elo-data.json').read_text(encoding='utf-8')
data = json.loads(payload)
assert data['rows'] and 'id="community-preview-script"' in source
source = source.replace('<title>Manager Elo · Elevation</title>', '''<title>Manager Ratings | SteamWatch</title>
<meta name="description" content="Compare football managers by covered club Elo gained and lost since July 2016. Explore recent impact, impact per 38 matches and manager trajectories.">
<link rel="canonical" href="https://www.steamwatch.io/tools/manager-ratings">
<meta property="og:title" content="Manager Ratings | SteamWatch">
<meta property="og:description" content="Which managers have overseen the biggest gains? Explore club Elo impact, recent form and career comparisons.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://www.steamwatch.io/tools/manager-ratings">
<meta name="twitter:card" content="summary">
<link rel="icon" href="/logos/mark-on-dark.svg">''')
source = source.replace('<main>', '''<nav class="steamwatch-nav" aria-label="SteamWatch navigation"><a href="/">← SteamWatch</a><a href="/tools/club-ratings">Club Ratings</a><a href="/tools/rolling-xg">Rolling xG</a><a href="/tools/match-predictor">Match Model</a></nav><main>''', 1)
source = source.replace('href="manager-elo-data.json"', 'href="/tools/manager-ratings/manager-elo-data.json"')
source = source.replace('Works locally; no login or internet required.', 'Published snapshot · refresh date shown above · community votes are a device-only preview.')
source = source.replace('<pre id="audit"', '''<p>Background reading: <a href="https://eightyfivepoints.blogspot.com/2016/11/elo-impact-who-are-epls-most-effective.html">Eighty Five Points on Elo impact</a> and the <a href="https://manager-elo.streamlit.app/">Manager Elo Database</a>. These informed the project idea; this model uses its own implementation and Sportsmonks match data, with different scoring and eligibility rules.</p><pre id="audit"''')
source = source.replace('</html>', '''<style>.steamwatch-nav{max-width:1500px;margin:0 auto 16px;display:flex;flex-wrap:wrap;gap:12px 24px;padding:4px 16px;font-size:12px;color:#57534e}.steamwatch-nav a:first-child{font-weight:700;margin-right:auto}.steamwatch-nav a:hover{text-decoration:underline}@media(max-width:600px){.steamwatch-nav{font-size:11px;gap:12px}}</style></html>''')
(destination / 'index.html').write_text(source, encoding='utf-8')
(destination / 'manager-elo-data.json').write_text(payload, encoding='utf-8')
print(f'Packaged {len(data["rows"])} managers; source snapshot timestamps preserved.')
