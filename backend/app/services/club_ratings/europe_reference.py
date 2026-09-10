"""Public Euro Club Index collector for the club board."""
import html, math, re, unicodedata
import httpx
from .europe_data import digest
from .sportmonks import ProviderError, now, write_json

SOURCE = 'https://www.euroclubindex.com/'

ENDPOINT = SOURCE + 'wp-json/happyhorizon/v1/get-module-latest-ranking/'

ALIASES = {
    'Sabah': 'Sabah FK', 'Viking': 'Viking FK', 'AEK Athens': 'AEK',
    'Lens': 'RC Lens',
    'Bodø / Glimt': 'FK Bodø/Glimt', 'Bodø/Glimt': 'FK Bodø/Glimt',
    'LOSC Lille': 'Lille OSC', 'Villarreal': 'Villarreal CF',
    'Inter': 'Internazionale', 'Atlético Madrid': 'Atlético Madrid',
    'Atlético de Madrid': 'Atlético Madrid', 'Paris Saint Germain': 'Paris Saint-Germain',
    'Bayern München': 'FC Bayern München', 'Bayern Munich': 'FC Bayern München',
    'Barcelona': 'FC Barcelona', 'Porto': 'FC Porto', 'Roma': 'AS Roma',
    'PSV': 'PSV', 'Club Brugge': 'Club Brugge',
}

IDENTITIES = {(19, 'arsenal'): ('4007', 'England'), (14, 'manchesterunited'): ('4080', 'England'),
              (138649, 'sabahfk'): ('123271', 'Azerbaijan')}

def key(name):
    value = html.unescape(ALIASES.get(name, name))
    return re.sub('[^a-z0-9]', '', unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode().lower())

def normalise(payload, observed_at):
    if not isinstance(payload, dict) or not isinstance(payload.get('items'), list):
        raise ProviderError('ECI returned an unsupported ranking format.')
    rows, ids = [], set()
    try:
        for item in payload['items']:
            r = item['rankData']; identity = str(int(r['teamID']))
            points, rank = float(r['Points']), int(r['Rank'])
            if identity in ids or not math.isfinite(points) or not -10000 < points < 10000 or not 1 <= rank <= 5000:
                raise ValueError('Invalid or duplicate rating')
            if not item['title'].strip() or not r['teamNation'].strip(): raise ValueError('Missing identity')
            if not item['permalink'].startswith(SOURCE + 'teams/'): raise ValueError('Unexpected source')
            ids.add(identity)
            rows.append({'id': identity, 'name': html.unescape(item['title']), 'country': r['teamNation'],
                         'points': points, 'rank': rank, 'url': item['permalink']})
    except (KeyError, TypeError, ValueError):
        raise ProviderError('ECI contains an invalid or ambiguous ranking. Previous data is retained.') from None
    if len(rows) < 100: raise ProviderError('ECI returned an incomplete ranking. Previous data is retained.')
    result = {'source': SOURCE, 'observed_at': observed_at, 'publication_at': None,
              'teams': sorted(rows, key=lambda r: int(r['id']))}
    return {**result, 'hash': digest(result)}

def refresh(directory):
    try:
        response = httpx.get(ENDPOINT, params={'ppp': -1, 'pagination': 1, 'search': ''}, timeout=25)
        response.raise_for_status(); payload = response.json()
    except (httpx.HTTPError, ValueError):
        raise ProviderError('ECI refresh failed. Previous ratings are retained.') from None
    reference = normalise(payload, now())
    folder = directory/'eci'
    write_json(folder/'sources'/(reference['hash']+'.json'), payload)
    write_json(folder/'snapshots'/(reference['hash']+'.json'), reference)
    write_json(folder/'current.json', reference)
    return {'status': 'ok', 'teams': len(reference['teams']), 'observed_at': reference['observed_at'], 'hash': reference['hash']}

ELO_NAMES = {'Manchester United':'Man United','Manchester City':'Man City','FC Barcelona':'Barcelona',
    'FC Bayern München':'Bayern München','Bayern München':'Bayern München','Club Brugge':'Brugge','Borussia Dortmund':'Dortmund',
    'VfB Stuttgart':'Stuttgart','Atlético de Madrid':'Atlético','Atlético Madrid':'Atlético',
    'Paris Saint Germain':'Paris SG','Sporting CP':'Sporting','Slovan Bratislava':'Slovan',
    'Bodø / Glimt':'Bodø/Glimt','Shakhtar Donetsk':'Shakhtar','RB Leipzig':'RB Leipzig',
    'LOSC Lille':'Lille','Sabah':'Sabah FK','AEK Athens':'AEK',
    'Brighton and Hove Albion':'Brighton','Leeds United':'Leeds','Newcastle United':'Newcastle',
    'Nottingham Forest':'Forest','Tottenham Hotspur':'Tottenham','West Ham United':'West Ham',
    'Wolverhampton Wanderers':'Wolves','Eintracht Frankfurt':'Frankfurt','Bayer 04 Leverkusen':'Leverkusen',
    'Bayer Leverkusen':'Leverkusen','SC Freiburg':'Freiburg','TSG Hoffenheim':'Hoffenheim',
    'VfL Wolfsburg':'Wolfsburg','Werder Bremen':'Werder','FSV Mainz 05':'Mainz','FC Köln':'Koeln',
    'Borussia Mönchengladbach':'Gladbach','Hamburger SV':'Hamburg','Real Betis':'Betis',
    'Real Sociedad':'Sociedad','Athletic Club':'Bilbao','Celta de Vigo':'Celta','AC Milan':'Milan'}

COUNTRIES = {'England':'ENG','Spain':'ESP','Germany':'GER','Italy':'ITA','France':'FRA',
    'Netherlands':'NED','Portugal':'POR','Belgium':'BEL','Norway':'NOR','Scotland':'SCO',
    'Turkey':'TUR','Türkiye':'TUR','Greece':'GRE','Azerbaijan':'AZE','Slovakia':'SVK',
    'Ukraine':'UKR','Austria':'AUT','Czech Republic':'CZE','Czechia':'CZE','Denmark':'DEN'}
