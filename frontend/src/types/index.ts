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

export interface BiggestMover {
  match_id: string;
  home_team: string;
  away_team: string;
  sport_key: string;
  league_name: string;
  commence_time: string;
  market: '1x2' | 'totals' | 'spreads';
  outcome: 'home' | 'draw' | 'away' | 'over' | 'under' | 'home_spread' | 'away_spread';
  outcome_name: string;
  opening_odds: number;
  current_odds: number;
  movement_percent: number;
  direction: 'up' | 'down';
}

export interface TotalsPoint {
  timestamp: string;
  line: number;
  over_odds: number | null;
  under_odds: number | null;
}

export interface MatchTotals {
  match_id: string;
  totals_history: TotalsPoint[];
}

export interface SyndicateMove {
  match_id: string;
  home_team: string;
  away_team: string;
  sport_key: string;
  league_name: string;
  commence_time: string;
  market: '1x2' | 'totals' | 'spreads';
  outcome: 'home' | 'draw' | 'away' | 'over' | 'under' | 'home_spread' | 'away_spread';
  outcome_name: string;
  opening_odds: number;
  current_odds: number;
  movement_percent: number;
  direction: 'up' | 'down';
  minutes_to_kickoff: number;
  moved_at: string;
}

export interface SpreadsPoint {
  timestamp: string;
  line: number;
  home_odds: number | null;
  away_odds: number | null;
}

export interface MatchSpreads {
  match_id: string;
  spreads_history: SpreadsPoint[];
}

export interface ClosingLine {
  match_id: string;
  home_team: string;
  away_team: string;
  sport_key: string;
  league_name: string;
  commence_time: string;
  // 1x2 closing odds
  closing_home_1x2: number | null;
  closing_draw_1x2: number | null;
  closing_away_1x2: number | null;
  opening_home_1x2: number | null;
  opening_draw_1x2: number | null;
  opening_away_1x2: number | null;
}

export interface SteamMoveRecord {
  id: number;
  match_id: string;
  sport_key: string;
  outcome: string;
  team_name: string;
  opening_odds: number;
  previous_odds: number;
  current_odds: number;
  movement_percent: number;
  detected_at: string;
  match_commence_time: string;
  minutes_before_kickoff: number;
  result_updated: boolean;
  won: boolean | null;
  home_score: number | null;
  away_score: number | null;
}

export interface TeamSteamRanking {
  team_name: string;
  sport_key: string;
  total_moves: number;
  wins: number;
  draws: number;
  losses: number;
  win_rate: number | null;
}

export interface SteamResultsData {
  total_moves: number;
  total_wins: number;
  total_draws: number;
  total_losses: number;
  win_rate: number | null;
  avg_movement_percent: number | null;
  moves: SteamMoveRecord[];
  team_rankings: TeamSteamRanking[];
}

export const LEAGUE_CONFIG: Record<string, { name: string; shortName: string; color: string }> = {
  soccer_epl: { name: 'Premier League', shortName: 'EPL', color: '#3D195B' },
  soccer_spain_la_liga: { name: 'La Liga', shortName: 'LAL', color: '#EE8707' },
  soccer_germany_bundesliga: { name: 'Bundesliga', shortName: 'BUN', color: '#D20515' },
  soccer_france_ligue_one: { name: 'Ligue 1', shortName: 'L1', color: '#091C3E' },
  soccer_italy_serie_a: { name: 'Serie A', shortName: 'SEA', color: '#024494' },
  soccer_uefa_champs_league: { name: 'Champions League', shortName: 'UCL', color: '#071D49' },
};
