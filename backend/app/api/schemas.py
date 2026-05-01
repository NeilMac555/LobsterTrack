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


class TeamPLViewStats(BaseModel):
    """
    P/L numbers for one of the three views (home / away / overall) of a
    team in a given season. Stake is implicit — caller knows the unit.
    """
    matches: int
    wins: int
    staked: float       # total £ staked in this view
    pl: float           # total £ profit (negative = loss)
    roi: Optional[float] = None  # P/L / staked × 100. None if no stake.


class TeamPLRow(BaseModel):
    """
    One row of the Team P/L table: a single team for a single season (or
    'all' for the aggregate). Each view (home/away/overall) is its own
    sub-object so the frontend can colour-code and sort independently.
    """
    team: str
    season: str           # 'all' = aggregate across loaded seasons, else 4-digit code
    home: TeamPLViewStats
    away: TeamPLViewStats
    overall: TeamPLViewStats


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


