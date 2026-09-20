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
# Apply SteamWatch branding after the standalone dashboard has been assembled.
import re
source = re.sub(r'<nav class="steamwatch-nav".*?</nav>', '<nav class="steamwatch-nav" aria-label="SteamWatch navigation"><a class="sw-brand" href="/"><img src="/logos/mark-on-dark.svg" alt="">SteamWatch<span>.io</span></a><a href="/" class="desktop-nav">Overview</a><a href="/steam-results" class="desktop-nav">Steam Results</a><a href="/closing-lines" class="desktop-nav">Closing Lines</a><a href="/tools/club-ratings">Club Ratings</a><a class="active" href="/tools/manager-ratings" aria-current="page">Manager Ratings</a></nav>', source, count=1)
source = source.replace('A different view<br>of the <span>beautiful game.</span>', 'Manager Ratings')
source = source.replace('Who makes a team better? Explore the managers<br class="desktop-break"> moving their clubs forward, one match at a time.', 'Club Elo impact · Compare managers, explore recent performance and track results over time.')
source = source.replace("const palette=['#ce4b32','#252525','#956ab1','#3f7d75'];", "const palette=['#22d3ee','#a78bfa','#34d399','#fbbf24'];")
source = source.replace('stroke="#e8e5e0"', 'stroke="#334155"').replace('fill="#77716c"', 'fill="#94a3b8"').replace('background:#faf9f7;border-radius:20px','background:#0f172a;border-radius:6px')
source = source.replace('<title>Manager Ratings | SteamWatch</title>', '<title>Manager Ratings | SteamWatch</title><link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">')
theme = (root / 'scripts/manager-ratings-theme.css').read_text(encoding='utf-8')
source = source.replace('</html>', '<style id="steamwatch-theme">'+theme+'</style></html>')
# Keep the complete snapshot outside the frontend/static directory.
private = root / 'backend/app/data/manager-ratings.json'
private.parent.mkdir(parents=True, exist_ok=True)
private.write_text(payload, encoding='utf-8')
keys = ('as_of', 'ranking_start', 'recent_start', 'eligible_managers', 'current_managers',
        'managers', 'imported_completed_fixtures', 'used_fixtures', 'coverage', 'skipped')
preview = {k: data[k] for k in keys if k in data}
preview.update(rows=sorted((r for r in data['rows'] if r['eligible']), key=lambda r: r['rank'])[:3],
               appointment_overrides=[], fixture_coach_corrections=[], access='preview')
assert len(preview['rows']) == 3
scripts = re.findall(r'<script[^>]*>(.*?)</script>', source, flags=re.S)
source = re.sub(r'<script[^>]*>.*?</script>', '', source, flags=re.S)
scripts[0], count = re.subn(r'const data=.*?;\s*\n', lambda _: 'const data=await loadManagerRatings('+json.dumps(preview).replace('<', '\\u003c')+');\nsetupManagerAccess(data);\n', scripts[0], count=1, flags=re.S)
assert count == 1
access_html = (root / 'scripts/manager-ratings-access.html').read_text(encoding='utf-8')
source = source.replace('<div id="detail"', access_html+'<div id="detail"', 1)
assert 'id="manager-paywall"' in source
source = source.replace('<section id="date-window">', '<div id="manager-access-label">Checking access…</div><p id="manager-access-status" role="status"></p><section id="date-window">', 1)
access_js = (root / 'scripts/manager-ratings-access.js').read_text(encoding='utf-8')
source += '<script>\n'+access_js+'\n(async()=>{\n'+'\n'.join(scripts)+'\n})().catch(()=>{document.getElementById("manager-access-status").textContent="Unable to load the rankings. Please reload.";});\n</script>'
(destination / 'index.html').write_text(source, encoding='utf-8')
(destination / 'manager-elo-data.json').write_text(json.dumps(preview), encoding='utf-8')
print(f'Packaged {len(data["rows"])} managers; source snapshot timestamps preserved.')
