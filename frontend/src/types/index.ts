export interface OddsPoint {
  timestamp: string;
  home_odds: number | null;
  draw_odds: number | null;
  away_odds: number | null;
}

export interface MatchSummary {
  id: string;
  home_team: string;
  away_team: string;
  league_name: string;
  sport_key: string;
  commence_time: string;
  current_home_odds: number | null;
  current_draw_odds: number | null;
  current_away_odds: number | null;
  opening_home_odds: number | null;
  opening_draw_odds: number | null;
  opening_away_odds: number | null;
  odds_count: number;
}

export interface MatchDetail {
  id: string;
  home_team: string;
  away_team: string;
  league_name: string;
  sport_key: string;
  commence_time: string;
  created_at: string;
  odds_history: OddsPoint[];
}

export interface LeagueSummary {
  sport_key: string;
  league_name: string;
  match_count: number;
  upcoming_matches: number;
}

export interface Stats {
  total_matches: number;
  upcoming_matches: number;
  total_odds_snapshots: number;
  oldest_data: string | null;
  newest_data: string | null;
  tracked_leagues: string[];
}

export const LEAGUE_CONFIG: Record<string, { name: string; shortName: string; color: string }> = {
  soccer_epl: { name: 'Premier League', shortName: 'EPL', color: '#3D195B' },
  soccer_spain_la_liga: { name: 'La Liga', shortName: 'LAL', color: '#EE8707' },
  soccer_germany_bundesliga: { name: 'Bundesliga', shortName: 'BUN', color: '#D20515' },
  soccer_france_ligue_one: { name: 'Ligue 1', shortName: 'L1', color: '#091C3E' },
  soccer_italy_serie_a: { name: 'Serie A', shortName: 'SEA', color: '#024494' },
  soccer_uefa_champs_league: { name: 'Champions League', shortName: 'UCL', color: '#071D49' },
};
