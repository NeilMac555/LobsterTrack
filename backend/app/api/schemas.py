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


class BiggestMover(BaseModel):
    """A match with significant odds movement"""
    match_id: str
    home_team: str
    away_team: str
    sport_key: str
    league_name: str
    commence_time: datetime
    outcome: str  # 'home', 'draw', 'away'
    outcome_name: str  # Team name or 'Draw'
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
