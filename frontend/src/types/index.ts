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
  /** Last ~12 home implied probabilities (0-100) in chronological order.
   *  Powers the inline sparkline on match cards. */
  home_prob_spark?: number[] | null;
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
  avg_move_size: number | null;
  profit_loss: number | null;
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

export interface ClosingLine {
  id: number;
  match_id: string;
  league: string;
  home_team: string;
  away_team: string;
  kickoff_time: string;
  market_type: string;
  close_home: number | null;
  close_draw: number | null;
  close_away: number | null;
  close_line: number | null;
  close_home_price: number | null;
  close_away_price: number | null;
  close_over_price: number | null;
  close_under_price: number | null;
  captured_at: string;
  minutes_before_kickoff: number;
}

export interface ClosingLinesResponse {
  total: number;
  closing_lines: ClosingLine[];
}

export interface MatchClosingLines {
  match_id: string;
  home_team: string;
  away_team: string;
  league: string;
  kickoff_time: string;
  h2h: ClosingLine | null;
  asian_handicap: ClosingLine | null;
  totals: ClosingLine | null;
}

export interface MatchClosingLinesResponse {
  total: number;
  matches: MatchClosingLines[];
}

export interface XGDataPoint {
  team_name: string;
  league: string;
  match_number: number;
  npxg_for: number;
  npxg_against: number;
  match_date: string;
}

export interface XGDataResponse {
  team_name: string;
  league: string;
  data: XGDataPoint[];
}

export const LEAGUE_CONFIG: Record<string, { name: string; shortName: string; color: string }> = {
  soccer_epl: { name: 'Premier League', shortName: 'EPL', color: '#3D195B' },
  soccer_spain_la_liga: { name: 'La Liga', shortName: 'LAL', color: '#EE8707' },
  soccer_germany_bundesliga: { name: 'Bundesliga', shortName: 'BUN', color: '#D20515' },
  soccer_france_ligue_one: { name: 'Ligue 1', shortName: 'L1', color: '#091C3E' },
  soccer_italy_serie_a: { name: 'Serie A', shortName: 'SEA', color: '#024494' },
  soccer_uefa_champs_league: { name: 'Champions League', shortName: 'UCL', color: '#071D49' },
  soccer_uefa_europa_league: { name: 'Europa League', shortName: 'UEL', color: '#F47B20' },
  soccer_uefa_europa_conference_league: { name: 'Conference League', shortName: 'UECL', color: '#0AC44B' },
};
