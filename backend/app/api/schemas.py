from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional


class OddsPoint(BaseModel):
    """Single point in odds history timeline"""
    timestamp: datetime
    home_odds: Optional[float] = None
    draw_odds: Optional[float] = None
    away_odds: Optional[float] = None


class MatchSummary(BaseModel):
    """Brief match info for list views"""
    id: str
    home_team: str
    away_team: str
    league_name: str
    sport_key: str
    commence_time: datetime
    current_home_odds: Optional[float] = None
    current_draw_odds: Optional[float] = None
    current_away_odds: Optional[float] = None
    opening_home_odds: Optional[float] = None
    opening_draw_odds: Optional[float] = None
    opening_away_odds: Optional[float] = None
    odds_count: int = 0
    # Last ~12 home implied probabilities (0-100) in chronological order,
    # used to render an inline sparkline on the match card.
    home_prob_spark: Optional[list[float]] = None
    # Which bookmaker current_*_odds came from. "pinnacle" unless this
    # match is one of the ones Pinnacle doesn't cover in The Odds API's
    # feed, in which case it's the Betfair Exchange fallback.
    current_odds_bookmaker: Optional[str] = None

    class Config:
        from_attributes = True


class MatchDetail(BaseModel):
    """Full match info with odds history"""
    id: str
    home_team: str
    away_team: str
    league_name: str
    sport_key: str
    commence_time: datetime
    created_at: datetime
    odds_history: list[OddsPoint]
    current_odds_bookmaker: Optional[str] = None

    class Config:
        from_attributes = True


class LeagueSummary(BaseModel):
    """Summary of a league"""
    sport_key: str
    league_name: str
    match_count: int
    upcoming_matches: int


class FetchStatus(BaseModel):
    """Status of the last/current fetch operation"""
    is_running: bool
    last_run: Optional[datetime] = None
    leagues_processed: int = 0
    matches_found: int = 0
    odds_stored: int = 0
    errors: list[str] = []


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    database: str
    scheduler: str
    timestamp: datetime


class SteamMoveResponse(BaseModel):
    """Steam move record for API response"""
    id: int
    match_id: str
    sport_key: str
    outcome: str
    team_name: str
    opening_odds: float
    previous_odds: float
    current_odds: float
    movement_percent: float
    detected_at: datetime
    match_commence_time: datetime
    minutes_before_kickoff: int
    result_updated: bool
    won: Optional[bool] = None
    home_score: Optional[int] = None
    away_score: Optional[int] = None

    class Config:
        from_attributes = True


class SteamMoveStats(BaseModel):
    """Statistics about steam moves"""
    total_moves: int
    moves_with_results: int
    moves_pending_results: int
    total_wins: int
    total_losses: int
    win_rate: Optional[float] = None
    avg_movement_percent: Optional[float] = None
    sample_moves: list[SteamMoveResponse]


class TeamSteamRanking(BaseModel):
    """Team ranked by steam move frequency"""
    team_name: str
    sport_key: str
    total_moves: int
    wins: int
    draws: int
    losses: int
    win_rate: Optional[float] = None
    avg_move_size: Optional[float] = None
    profit_loss: Optional[float] = None


class SteamResultsResponse(BaseModel):
    """Public steam results with stats and full move history"""
    total_moves: int
    total_wins: int
    total_draws: int
    total_losses: int
    win_rate: Optional[float] = None
    avg_movement_percent: Optional[float] = None
    moves: list[SteamMoveResponse]
    team_rankings: list[TeamSteamRanking]


class BiggestMover(BaseModel):
    """A match with significant odds movement"""
    match_id: str
    home_team: str
    away_team: str
    sport_key: str
    league_name: str
    commence_time: datetime
    market: str  # '1x2', 'totals', 'spreads'
    outcome: str  # 'home', 'draw', 'away', 'over', 'under', 'home_spread', 'away_spread'
    outcome_name: str  # Team name, 'Draw', 'O 2.5', 'U 2.5', 'AH -0.5', etc.
    opening_odds: float
    current_odds: float
    movement_percent: float
    direction: str  # 'up' or 'down'
    sparkline: Optional[list[float]] = None  # implied prob (0-100) trend for the mover outcome, oldest first

    class Config:
        from_attributes = True


class EmailSignupRequest(BaseModel):
    """Request to sign up for email alerts"""
    email: EmailStr


class EmailSignupResponse(BaseModel):
    """Response after email signup"""
    success: bool
    message: str


class EmailSubscriberInfo(BaseModel):
    """Email subscriber info for admin"""
    id: int
    email: str
    created_at: datetime

    class Config:
        from_attributes = True


class AdminEmailsResponse(BaseModel):
    """Response for admin emails endpoint"""
    count: int
    subscribers: list[EmailSubscriberInfo]


class TotalsPoint(BaseModel):
    """Single point in totals history timeline"""
    timestamp: datetime
    line: float
    over_odds: Optional[float] = None
    under_odds: Optional[float] = None


class MatchTotalsResponse(BaseModel):
    """Totals data for a match"""
    match_id: str
    totals_history: list[TotalsPoint]


class SyndicateMove(BaseModel):
    """A late sharp money move - high conviction signal"""
    match_id: str
    home_team: str
    away_team: str
    sport_key: str
    league_name: str
    commence_time: datetime
    market: str  # '1x2', 'totals', 'spreads'
    outcome: str  # 'home', 'draw', 'away', 'over', 'under', 'home_spread', 'away_spread'
    outcome_name: str  # Team name, 'Draw', 'O 2.5', 'U 2.5', 'AH -0.5', etc.
    opening_odds: float
    current_odds: float
    movement_percent: float
    direction: str  # 'up' or 'down'
    minutes_to_kickoff: int  # Time remaining until match starts
    moved_at: datetime  # When the significant move was detected

    class Config:
        from_attributes = True


class SpreadsPoint(BaseModel):
    """Single point in spreads (Asian Handicap) history timeline"""
    timestamp: datetime
    line: float  # Handicap line from home team perspective
    home_odds: Optional[float] = None
    away_odds: Optional[float] = None


class MatchSpreadsResponse(BaseModel):
    """Spreads (Asian Handicap) data for a match"""
    match_id: str
    spreads_history: list[SpreadsPoint]


class ClosingLineResponse(BaseModel):
    """A single closing line record"""
    id: int
    match_id: str
    league: str
    home_team: str
    away_team: str
    kickoff_time: datetime
    market_type: str
    close_home: Optional[float] = None
    close_draw: Optional[float] = None
    close_away: Optional[float] = None
    close_line: Optional[float] = None
    close_home_price: Optional[float] = None
    close_away_price: Optional[float] = None
    close_over_price: Optional[float] = None
    close_under_price: Optional[float] = None
    captured_at: datetime
    minutes_before_kickoff: int

    class Config:
        from_attributes = True


class ClosingLinesListResponse(BaseModel):
    """Paginated list of closing lines"""
    total: int
    closing_lines: list[ClosingLineResponse]


class MatchClosingLines(BaseModel):
    """All closing lines for a single match, grouped by market"""
    match_id: str
    home_team: str
    away_team: str
    league: str
    kickoff_time: datetime
    h2h: Optional[ClosingLineResponse] = None
    asian_handicap: Optional[ClosingLineResponse] = None
    totals: Optional[ClosingLineResponse] = None


class MatchClosingLinesListResponse(BaseModel):
    """List of matches with their grouped closing lines"""
    total: int
    matches: list[MatchClosingLines]


class XGDataPoint(BaseModel):
    """Single match npxG data point"""
    team_name: str
    league: str
    season: str
    match_number: int
    npxg_for: float
    npxg_against: float
    match_date: datetime

    class Config:
        from_attributes = True


class XGDataResponse(BaseModel):
    """All npxG data for a team"""
    team_name: str
    league: str
    data: list[XGDataPoint]


class XGTeamsResponse(BaseModel):
    """List of teams with xG data for a league"""
    teams: list[str]


class LeagueConstantsItem(BaseModel):
    """Live-computed avgGoalsPerTeam/homeAwayRatio for one league."""
    league: str
    avg_goals_per_team: float
    home_away_ratio: float
    sample_matches: float
    computed_at: datetime

    class Config:
        from_attributes = True


class LeagueConstantsResponse(BaseModel):
    """
    Current league_constants rows. Only leagues with a successfully
    computed row are included — a league missing here means it has never
    cleared the refresher's minimum-sample guard, and callers should fall
    back to their own hardcoded default for it.
    """
    constants: list[LeagueConstantsItem]


class PowerRatingItem(BaseModel):
    """One team's current cross-league power rating."""
    team: str
    league: str
    rating: float
    weighted_matches: float
    computed_at: datetime
    # From a manually-updated Transfermarkt snapshot (see
    # squad_value_importer.py). Shown as its own column AND blended into
    # `rating` as a fading prior (see power_ranking_fitter.py). None
    # where we have no squad-value entry for the team.
    squad_value_eur: int | None = None

    class Config:
        from_attributes = True


class PowerRatingsResponse(BaseModel):
    """
    Current power_ratings rows, cross-league comparable (unlike
    league_constants, ratings here are on ONE shared scale — see
    app/services/power_ranking_fitter.py).
    """
    ratings: list[PowerRatingItem]
    computed_at: datetime | None = None


class PowerRatingHistoryPoint(BaseModel):
    """One weekly snapshot of a team's rating, for the trend chart."""
    rating: float
    weighted_matches: float
    computed_at: datetime

    class Config:
        from_attributes = True


class PowerRatingHistoryResponse(BaseModel):
    team: str
    league: str
    history: list[PowerRatingHistoryPoint]


class TeamPLViewStats(BaseModel):
    """
    P/L numbers for one venue (home / away / overall) of a single
    side (back / fade) of a team in a given season. Stake is implicit
    — caller knows the unit.
    """
    matches: int
    wins: int           # bet wins — for fade rows this means the opposing team won
    staked: float       # total £ staked in this view
    pl: float           # total £ profit (negative = loss)
    roi: Optional[float] = None  # P/L / staked × 100. None if no stake.


class TeamPLSide(BaseModel):
    """
    The home/away/overall venue split for one side of a bet (back or
    fade) on a given team-season.
    """
    home: TeamPLViewStats
    away: TeamPLViewStats
    overall: TeamPLViewStats


class TeamPLRow(BaseModel):
    """
    One row of the Team P/L table: a single team for a single season (or
    'all' for the aggregate). Each row carries both a 'back' side
    (stake the team to win) and a 'fade' side (stake their opponent to
    win) so the frontend can flip between perspectives without a refetch.
    """
    team: str
    season: str           # 'all' = aggregate across loaded seasons, else 4-digit code
    back: TeamPLSide
    fade: TeamPLSide


class TeamPLResponse(BaseModel):
    """
    Response for /team-pnl. Includes the rows plus a small bit of metadata
    so the frontend can render the methodology note accurately (which
    seasons were loaded, what the assumed stake was, how many rows used
    open-fallback prices instead of the close).
    """
    league: str           # 'soccer_epl' for now
    seasons_loaded: list[str]
    stake: float          # £ per match
    rows_close: int
    rows_open_fallback: int
    rows_missing_price: int
    rows: list[TeamPLRow]
    # When the caller filters to ?opponents=top, this lists the canonical
    # team names that qualify in this league. Null if the filter isn't
    # active or the league has no top set defined yet.
    top_teams: Optional[list[str]] = None
    opponents_filter: Optional[str] = None   # echo of the filter applied: None or 'top'


