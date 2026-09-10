"""Public PitchRank embedded CSV, parsed as data without executing site code."""
import csv
import io
import re
import math
import httpx
from urllib.parse import urljoin
from .data import utcnow
from .sportmonks import ProviderError,write_json,now
from .europe_data import digest
URL='https://www.pitchrank.fyi/'
def refresh(directory):
    try:
        page=httpx.get(URL,timeout=25);page.raise_for_status()
        assets=re.findall(r'src="(/assets/index-[A-Za-z0-9_-]+\.js)"',page.text)
        if len(assets)!=1:raise ValueError()
        response=httpx.get(urljoin(URL,assets[0]),timeout=30);response.raise_for_status()
        match=re.search(r'`(Date,Team,League,NumMatches,Strength_adjusted,is_active_2627\r?\n.*?)`',response.text,re.S)
        if not match:raise ValueError()
        cutoff=utcnow().date().isoformat(); latest={}
        for r in csv.DictReader(io.StringIO(match[1])):
            if r['Date']>cutoff or r['is_active_2627']!='True' or not r['Strength_adjusted']:continue
            identity=(r['Team'],r['League'])
            if identity not in latest or r['Date']>latest[identity]['date']:
                v=float(r['Strength_adjusted'])
                if not math.isfinite(v):raise ValueError()
                latest[identity]={'name':r['Team'],'country':r['League'],'points':v,'date':r['Date']}
        rows=list(latest.values())
        if len(rows)<100:raise ValueError()
        snapshot={'observed_at':now(),'url':URL,'teams':rows,'market_derived':True}
        write_json(directory/'pitchrank/snapshots'/(digest(snapshot)+'.json'),snapshot)
        write_json(directory/'pitchrank/current.json',snapshot)
        return snapshot
    except (httpx.HTTPError,ValueError,KeyError):raise ProviderError('PitchRank refresh failed; previous snapshot retained.') from None
