from pydantic import BaseModel
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
