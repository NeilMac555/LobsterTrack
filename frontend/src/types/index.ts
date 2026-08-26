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
  /** Which bookmaker current_*_odds came from — "pinnacle" unless this
   *  match is one The Odds API doesn't carry Pinnacle for, in which case
   *  it's the Betfair Exchange fallback ("betfair_ex_eu"). */
  current_odds_bookmaker?: string | null;
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
  current_odds_bookmaker?: string | null;
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
  sparkline: number[] | null;
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
  // Season scoping + rankings threshold (2026-08-22): data covers the
  // current season only, and team_rankings requires min_moves_for_rankings
  // finished moves per team. teams_below_min are still building a sample.
  season_label?: string | null;
  min_moves_for_rankings?: number;
  teams_below_min?: number;
  moves: SteamMoveRecord[];
  team_rankings: TeamSteamRanking[];
}

export interface FavDogBand {
  label: string;
  odds_lo: number;
  odds_hi: number;
  matches: number;
  median_odds: number;
  wins: number;
  yield_pct: number;
  profit_units: number;
}

export interface FavDogCumulativePoint {
  n: number;
  fav: number;
  dog: number;
}

export interface FavDogData {
  total_matches: number;
  seasons: string[];
  leagues: string[];
  data_through: string | null;
  fav_bands: FavDogBand[];
  fav_all: FavDogBand;
  dog_bands: FavDogBand[];
  dog_all: FavDogBand;
  draw_all: FavDogBand;
  cumulative: FavDogCumulativePoint[];
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
  season: string;
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

export interface LeagueConstantsItem {
  league: string;
  avg_goals_per_team: number;
  home_away_ratio: number;
  sample_matches: number;
  computed_at: string;
}

export interface LeagueConstantsResponse {
  constants: LeagueConstantsItem[];
}

export interface PowerRatingItem {
  team: string;
  league: string;
  rating: number;
  weighted_matches: number;
  computed_at: string;
  // From a manually-updated Transfermarkt snapshot. Shown as its own
  // column AND blended into `rating` as a fading prior. null where we
  // have no entry for the team.
  squad_value_eur: number | null;
}

export interface PowerRatingsResponse {
  ratings: PowerRatingItem[];
  computed_at: string | null;
}

export interface PowerRatingHistoryPoint {
  rating: number;
  weighted_matches: number;
  computed_at: string;
}

export interface PowerRatingHistoryResponse {
  team: string;
  league: string;
  history: PowerRatingHistoryPoint[];
}

export interface TeamPLViewStats {
  matches: number;
  wins: number;
  staked: number;
  pl: number;
  roi: number | null;
}

export interface TeamPLSide {
  home: TeamPLViewStats;
  away: TeamPLViewStats;
  overall: TeamPLViewStats;
}

export interface TeamPLRow {
  team: string;
  // 4-digit season code (e.g. '2425' for 2024/25), or 'all' for the
  // cross-season aggregate row per team.
  season: string;
  // 'back' = stake the team to win. 'fade' = stake the team's opponent.
  back: TeamPLSide;
  fade: TeamPLSide;
}

export type InPlayJumpOutcome = 'home' | 'draw' | 'away';

export interface InPlayJumpPinnacleClose {
  home_odds: number | null;
  draw_odds: number | null;
  away_odds: number | null;
  home_implied: number | null;
  draw_implied: number | null;
  away_implied: number | null;
}

export interface InPlayJumpPolymarket {
  fetched_at: string;
  home_yes: number | null;
  draw_yes: number | null;
  away_yes: number | null;
  event_volume_24h: number | null;
}

export interface InPlayJumpGaps {
  home: number | null;
  draw: number | null;
  away: number | null;
}

export interface InPlayJump {
  match_id: string;
  home_team: string;
  away_team: string;
  sport_key: string;
  league_name: string;
  commence_time: string;
  polymarket_event_slug: string | null;
  anchor_minutes_in: number;
  early_goal_minute: number | null;
  biggest_outcome: InPlayJumpOutcome;
  biggest_gap_pp: number;
  pinnacle_close: InPlayJumpPinnacleClose;
  polymarket_inplay: InPlayJumpPolymarket;
  gaps_pp: InPlayJumpGaps;
}

export interface InPlayJumpsResponse {
  league: string | null;
  days_back: number;
  inplay_anchor_min: number;
  max_anchor_min: number;
  min_delta_pp: number;
  matches_seen: number;
  matches_with_close: number;
  matches_with_inplay: number;
  matches_with_jumps: number;
  jumps: InPlayJump[];
}

export interface LateSteamAHBlock {
  early_line: number | null;
  early_home_odds: number | null;
  early_away_odds: number | null;
  close_line: number | null;
  close_home_odds: number | null;
  close_away_odds: number | null;
  line_move: number | null;
  home_pp: number | null;
  away_pp: number | null;
  minutes_covered: number;
}

export interface LateSteamTotalsBlock {
  early_line: number | null;
  early_over_odds: number | null;
  early_under_odds: number | null;
  close_line: number | null;
  close_over_odds: number | null;
  close_under_odds: number | null;
  line_move: number | null;
  over_pp: number | null;
  under_pp: number | null;
  minutes_covered: number;
}

export type LateSteamSide = 'ah_home' | 'ah_away' | 'totals_over' | 'totals_under';

export interface LateSteamMove {
  match_id: string;
  home_team: string;
  away_team: string;
  sport_key: string;
  league_name: string;
  commence_time: string;
  biggest_side: LateSteamSide;
  biggest_pp: number;
  line_moved: boolean;
  asian_handicap: LateSteamAHBlock | null;
  totals: LateSteamTotalsBlock | null;
}

export interface LateSteamResponse {
  league: string | null;
  days_back: number;
  window_minutes: number;
  min_delta_pp: number;
  upcoming: boolean;
  matches_seen: number;
  matches_with_ah: number;
  matches_with_totals: number;
  matches_with_steam: number;
  moves: LateSteamMove[];
}

export interface TeamPLResponse {
  league: string;
  seasons_loaded: string[];
  stake: number;
  rows_close: number;
  rows_open_fallback: number;
  rows_missing_price: number;
  rows: TeamPLRow[];
  top_teams: string[] | null;       // null when no opponent filter active
  opponents_filter: string | null;  // 'top' or null
}

// First entry sorts first across every league picker on the site.
//
// `hidden: true` removes a league from active filter UIs (nav pills,
// Closing Lines / Drifters / Steam Results / Rolling xG selectors) but
// KEEPS it in the lookup table so any historical data that references
// the league key still renders correctly (logo, name, color). Used to
// take a league off-air once its season/tournament ends. Team P/L
// deliberately ignores this flag since it's the retrospective view.
export const LEAGUE_CONFIG: Record<string, { name: string; shortName: string; color: string; hidden?: boolean }> = {
  soccer_epl: { name: 'Premier League', shortName: 'EPL', color: '#3D195B' },
  soccer_efl_champ: { name: 'EFL Championship', shortName: 'CHA', color: '#0093B7' },
  soccer_spain_la_liga: { name: 'La Liga', shortName: 'LAL', color: '#EE8707' },
  soccer_germany_bundesliga: { name: 'Bundesliga', shortName: 'BUN', color: '#D20515' },
  soccer_france_ligue_one: { name: 'Ligue 1', shortName: 'L1', color: '#091C3E' },
  soccer_italy_serie_a: { name: 'Serie A', shortName: 'SEA', color: '#024494' },
  soccer_uefa_champs_league: { name: 'Champions League', shortName: 'UCL', color: '#071D49' },
  soccer_uefa_champs_league_qualification: { name: 'Champions League Qualifying', shortName: 'UCLQ', color: '#071D49' },
  soccer_uefa_europa_league: { name: 'Europa League', shortName: 'UEL', color: '#F47B20' },
  soccer_uefa_europa_conference_league: { name: 'Conference League', shortName: 'UECL', color: '#0AC44B' },
  // World Cup '26 has finished — hidden from the picker, kept in the
  // lookup so historical WC matches/pages still render correctly.
  soccer_fifa_world_cup: { name: 'FIFA World Cup', shortName: 'WC', color: '#D4AF37', hidden: true },
};

// Filtered helper for filter / picker UIs that should only show active
// leagues. Use this anywhere you iterate to render selectors; keep
// LEAGUE_CONFIG[key] for direct lookups so legacy data still renders.
export const VISIBLE_LEAGUES = Object.entries(LEAGUE_CONFIG).filter(([, v]) => !v.hidden);

// ===== Forecast Engine (/tools/forecast) =====
// Mirrors the payload shapes produced by backend
// app/services/forecast/engine.py — the payload blob is versioned by
// engine_version, so additive backend changes should extend these
// optionally rather than repurposing fields.

export interface ForecastSource {
  id: string;
  name: string;
  tier: number;
  detail: string;
}

export interface ForecastRegistry {
  engine_version: string;
  sources: ForecastSource[];
}

export interface ForecastStage {
  source: string;
  status: 'done' | 'empty' | 'error';
  headline: string;
  ms: number;
}

export interface ForecastEntry {
  team: string;
  probability: number;
  current_points: number;
  played: number;
  mean_points: number;
  // Polymarket outright winner book, when listed for this league —
  // market_implied is proportionally de-vigged, market_yes is the raw
  // cent price. Absent for top-4/relegation (no book exists yet).
  market_implied?: number;
  market_yes?: number;
}

export interface ForecastRationalePara {
  text: string;
  sources: string[];
}

export interface ForecastMarket {
  home: number;
  draw: number;
  away: number;
  fetched_at: string;
}

export interface ForecastMatchResult {
  home: string;
  away: string;
  venue_known: boolean;
  p_home: number;
  p_draw: number;
  p_away: number;
  lambda_home: number;
  lambda_away: number;
  commence_time: string | null;
  market: ForecastMarket | null;
  polymarket: Record<string, unknown> | null;
}

export interface ForecastResult {
  type: 'distribution' | 'binary' | 'match';
  outcome_label?: string;
  entries?: ForecastEntry[];
  binary?: {
    team: string;
    outcome_label: string;
    probability: number;
    market_implied?: number;
    market_yes?: number;
  };
  match?: ForecastMatchResult;
  meta?: {
    n_sims: number;
    remaining_fixtures: number;
    season: string;
    outright_market?: {
      venue: string;
      event_slug: string;
      fetched_at: string;
      age_hours: number;
      book_sum: number;
      event_volume: number | null;
    };
  };
}

export interface ForecastResponse {
  id?: number;
  question: string;
  kind: string;
  league: string | null;
  league_name?: string;
  status: 'ok' | 'unsupported' | 'error';
  reason?: string;
  suggestions?: string[];
  result: ForecastResult | null;
  rationale: ForecastRationalePara[];
  stages: ForecastStage[];
  evidence: Record<string, Record<string, unknown>>;
  warnings?: string[];
  engine_version: string;
  duration_ms: number;
  created_at?: string;
}

export interface RecentForecastsResponse {
  forecasts: Array<{
    id: number;
    question: string;
    kind: string;
    league: string | null;
    created_at: string;
    payload: ForecastResponse;
  }>;
}
