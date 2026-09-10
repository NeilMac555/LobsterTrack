"""Public ClubElo country-table snapshot; no login or private API required."""
from datetime import timedelta
from collections import Counter
import html
import math
import re
import httpx
from .data import utc, utcnow
from .europe_data import digest, read
from .sportmonks import ProviderError, now, write_json

SOURCE = 'https://clubelo.com/'


def normalise(document, observed_at):
    dates = re.findall(r'<h1><a href="/(\d{4}-\d{2}-\d{2})/">', document)
    if len(set(dates)) != 1: raise ProviderError('Club Elo has no unambiguous rating date.')
    date = dates[0]
    if not 0 <= (utc(observed_at).date() - utc(date).date()).days <= 2:
        raise ProviderError('Club Elo did not return a current ranking.')
    rows = []
    for row_html in re.findall(r'<tr>(.*?)</tr>', document, re.S):
        match=re.fullmatch(r'<td class="l">(.*?)</td><td class="r">([0-9.]+)</td>',row_html,re.S)
        if not match: continue
        cell,points=match.groups()
        names = re.findall(r'<span class="Ast">(.*?)</span>', cell)
        countries = re.findall(r'<img alt="([A-Z]{3})"', cell)
        if len(names) != 1 or len(countries) != 1: continue
        name = html.unescape(names[0]); points = float(points)
        if '<' in name or not name.strip() or not math.isfinite(points) or not 0 < points < 4000:
            raise ProviderError('Club Elo returned invalid team data.')
        ranks = re.findall(r'<small>\s*(\d+)\s*</small>', cell)
        urls = re.findall(r'<a href="(/[^"<>]+)"><span class="NonAst">', cell)
        rows.append({'name':name,'country':countries[0],'points':points,
                     'rank':int(ranks[0]) if ranks else None,
                     'url':SOURCE.rstrip('/')+urls[0] if urls else SOURCE})
    identities=Counter((r['country'],r['name']) for r in rows)
    rows=[r for r in rows if identities[(r['country'],r['name'])]==1]
    if len(rows) < 100:
        raise ProviderError('Club Elo ranking is incomplete or ambiguous.')
    result = {'source':SOURCE,'observed_at':observed_at,'rating_date':date,'teams':rows}
    return {**result,'hash':digest(result)}


def refresh(directory):
    try:
        response=httpx.get(SOURCE,timeout=25,follow_redirects=True); response.raise_for_status()
        document=response.content.decode('utf-8')
        snapshot=normalise(document,now())
    except (httpx.HTTPError,UnicodeError):
        raise ProviderError('Club Elo refresh failed; existing references remain available.') from None
    folder=directory/'clubelo'
    folder.mkdir(parents=True,exist_ok=True)
    (folder/(snapshot['hash']+'.html')).write_text(document,encoding='utf-8')
    write_json(folder/'snapshots'/(snapshot['hash']+'.json'),snapshot)
    write_json(folder/'current.json',snapshot)
    return {'status':'ok','teams':len(snapshot['teams']),'observed_at':snapshot['observed_at']}


def current(directory):
    path=directory/'clubelo/current.json'
    if not path.exists(): return None
    snapshot=read(path)
    if snapshot.get('hash') != digest({k:v for k,v in snapshot.items() if k!='hash'}): return None
    age=utcnow()-utc(snapshot['rating_date'])
    if not timedelta(0) <= age <= timedelta(days=14): return None
    if utc(snapshot['observed_at']) > utcnow()+timedelta(seconds=60): return None
    return snapshot
