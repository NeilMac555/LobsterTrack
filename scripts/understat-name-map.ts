// Maps xg_data.team_name (sourced from Understat via scrape_understat.py,
// which ships with an essentially empty NAME_MAP — see that script's
// comment "Most teams match 1:1 so this stays small") to the SteamWatch
// canonical name used everywhere else (historical_matches, closing_lines,
// matches — all Odds-API-style spellings).
//
// This is a DIFFERENT mapping from backend/app/services/team_name_normalizer.py
// — that one maps football-data.co.uk spellings to canonical; this one maps
// Understat spellings to canonical. The two sources abbreviate differently
// (e.g. football-data.co.uk's "Verona" vs Understat's "Verona" both need
// mapping to "Hellas Verona", but football-data.co.uk's "Sociedad" vs
// Understat's "Real Sociedad" already IS canonical) so the tables don't
// share entries in general.
//
// Built by diffing the live /xg-data/teams and /team-pnl team lists for
// each league (2025/26 season) — every team that appeared in both sources
// but under a different spelling is listed below. Teams not listed here
// pass through unchanged (Understat spelling already matches canonical).

const _EPL_MAP: Record<string, string> = {
  'Brighton': 'Brighton and Hove Albion',
  'Leeds': 'Leeds United',
  'Tottenham': 'Tottenham Hotspur',
  'West Ham': 'West Ham United',
};

const _SERIE_A_MAP: Record<string, string> = {
  'Atalanta': 'Atalanta BC',
  'Inter': 'Inter Milan',
  'Parma Calcio 1913': 'Parma',
  'Roma': 'AS Roma',
  'Verona': 'Hellas Verona',
};

const _LA_LIGA_MAP: Record<string, string> = {
  'Alaves': 'Alavés',
  'Athletic Club': 'Athletic Bilbao',
  'Atletico Madrid': 'Atlético Madrid',
  'Elche': 'Elche CF',
  'Osasuna': 'CA Osasuna',
  'Real Oviedo': 'Oviedo',
};

const _BUNDESLIGA_MAP: Record<string, string> = {
  'Borussia M.Gladbach': 'Borussia Monchengladbach',
  'FC Cologne': '1. FC Köln',
  'FC Heidenheim': '1. FC Heidenheim',
  'Freiburg': 'SC Freiburg',
  'Hoffenheim': 'TSG Hoffenheim',
  'Mainz 05': 'FSV Mainz 05',
  'RasenBallsport Leipzig': 'RB Leipzig',
  'St. Pauli': 'FC St. Pauli',
  'Wolfsburg': 'VfL Wolfsburg',
};

const _LIGUE_1_MAP: Record<string, string> = {
  'Lens': 'RC Lens',
  'Monaco': 'AS Monaco',
};

export const UNDERSTAT_NAME_MAP_BY_LEAGUE: Record<string, Record<string, string>> = {
  soccer_epl: _EPL_MAP,
  soccer_italy_serie_a: _SERIE_A_MAP,
  soccer_spain_la_liga: _LA_LIGA_MAP,
  soccer_germany_bundesliga: _BUNDESLIGA_MAP,
  soccer_france_ligue_one: _LIGUE_1_MAP,
};

// Converts an xg_data team_name to the canonical name. Passes through
// unchanged if not in the map (most teams need no rewriting).
export function normalizeUnderstatName(raw: string, league: string): string {
  return UNDERSTAT_NAME_MAP_BY_LEAGUE[league]?.[raw] ?? raw;
}
