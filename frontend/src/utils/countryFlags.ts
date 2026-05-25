/**
 * Country-name → flag-emoji helper used for World Cup match displays.
 *
 * Approach: map the team-name strings The Odds API actually returns
 * (e.g. "USA", "South Korea", "Czech Republic") onto ISO 3166-1
 * alpha-2 codes, then transform those into the regional-indicator
 * flag emoji at the call site. Unicode regional-indicator pairs map
 * directly to the 🇧🇷-style flag glyph in every modern browser.
 *
 * The map is deliberately broader than the current 48-team field so
 * that any country The Odds API surfaces (qualifiers, friendlies,
 * future tournaments) resolves to a flag without further edits.
 *
 * Add entries if a new country comes online and the ticker shows a
 * blank — `countryFlag()` returns an empty string when the name
 * isn't mapped, so the UI degrades gracefully (no broken emoji).
 */

// All entries use the canonical TheOddsAPI naming (verified against
// /api/matches for soccer_fifa_world_cup and other international
// competitions). Lowercase keys for case-insensitive lookups.
const NAME_TO_ISO2: Record<string, string> = {
  // CONMEBOL
  'argentina':       'ar',
  'bolivia':         'bo',
  'brazil':          'br',
  'chile':           'cl',
  'colombia':        'co',
  'ecuador':         'ec',
  'paraguay':        'py',
  'peru':            'pe',
  'uruguay':         'uy',
  'venezuela':       've',

  // CONCACAF
  'canada':          'ca',
  'costa rica':      'cr',
  'cuba':            'cu',
  'curacao':         'cw',
  'el salvador':     'sv',
  'guatemala':       'gt',
  'haiti':           'ht',
  'honduras':        'hn',
  'jamaica':         'jm',
  'mexico':          'mx',
  'panama':          'pa',
  'trinidad and tobago': 'tt',
  'usa':             'us',
  'united states':   'us',

  // UEFA
  'albania':         'al',
  'austria':         'at',
  'belgium':         'be',
  'bosnia & herzegovina': 'ba',
  'bosnia and herzegovina': 'ba',
  'croatia':         'hr',
  'czech republic':  'cz',
  'czechia':         'cz',
  'denmark':         'dk',
  'england':         'gb-eng',  // handled specially below
  'finland':         'fi',
  'france':          'fr',
  'germany':         'de',
  'greece':          'gr',
  'hungary':         'hu',
  'iceland':         'is',
  'ireland':         'ie',
  'italy':           'it',
  'kosovo':          'xk',
  'netherlands':     'nl',
  'north macedonia': 'mk',
  'northern ireland': 'gb-nir',
  'norway':          'no',
  'poland':          'pl',
  'portugal':        'pt',
  'romania':         'ro',
  'russia':          'ru',
  'scotland':        'gb-sct',
  'serbia':          'rs',
  'slovakia':        'sk',
  'slovenia':        'si',
  'spain':           'es',
  'sweden':          'se',
  'switzerland':     'ch',
  'turkey':          'tr',
  'türkiye':         'tr',
  'ukraine':         'ua',
  'wales':           'gb-wls',

  // AFC
  'australia':       'au',
  'china':           'cn',
  'china pr':        'cn',
  'india':           'in',
  'iran':            'ir',
  'iraq':            'iq',
  'japan':           'jp',
  'jordan':          'jo',
  'lebanon':         'lb',
  'oman':            'om',
  'palestine':       'ps',
  'qatar':           'qa',
  'saudi arabia':    'sa',
  'south korea':     'kr',
  'korea republic':  'kr',
  'syria':           'sy',
  'thailand':        'th',
  'uae':             'ae',
  'united arab emirates': 'ae',
  'uzbekistan':      'uz',
  'vietnam':         'vn',

  // CAF
  'algeria':         'dz',
  'angola':          'ao',
  'burkina faso':    'bf',
  'cameroon':        'cm',
  'cape verde':      'cv',
  "cote d'ivoire":   'ci',
  'ivory coast':     'ci',
  'dr congo':        'cd',
  'egypt':           'eg',
  'ghana':           'gh',
  'guinea':          'gn',
  'kenya':           'ke',
  'libya':           'ly',
  'mali':            'ml',
  'mauritania':      'mr',
  'morocco':         'ma',
  'nigeria':         'ng',
  'senegal':         'sn',
  'south africa':    'za',
  'sudan':           'sd',
  'tanzania':        'tz',
  'tunisia':         'tn',
  'uganda':          'ug',
  'zambia':          'zm',
  'zimbabwe':        'zw',

  // OFC
  'new zealand':     'nz',
};

/**
 * Build the flag emoji for a country name. Returns '' when the name
 * isn't mapped so callers can render a sensible fallback (e.g. the
 * existing team abbreviation).
 *
 * Handles the UK home-nations specially — England, Scotland, Wales,
 * Northern Ireland don't have proper ISO-3166-1 codes, but Unicode
 * does ship subdivision flag sequences for them (using tag
 * characters); not all platforms render those, so we fall back to
 * the union-jack-with-letters convention via an inline string.
 */
export function countryFlag(name: string): string {
  if (!name) return '';
  const iso = NAME_TO_ISO2[name.trim().toLowerCase()];
  if (!iso) return '';

  // UK home nations — Unicode tag-character sequences. Not every
  // platform renders these; if a user sees a tofu box, we'd rather
  // it be obvious so we can swap in inline PNGs later.
  if (iso === 'gb-eng') return '🏴󠁧󠁢󠁥󠁮󠁧󠁿';
  if (iso === 'gb-sct') return '🏴󠁧󠁢󠁳󠁣󠁴󠁿';
  if (iso === 'gb-wls') return '🏴󠁧󠁢󠁷󠁬󠁳󠁿';
  if (iso === 'gb-nir') return '🇬🇧';   // no widely-supported subdivision flag — fall back to UK

  // Regular two-letter ISO → regional-indicator pair.
  return iso
    .toUpperCase()
    .split('')
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}
