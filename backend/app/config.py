from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database - defaults to SQLite for local testing
    database_url: str = "sqlite:///./lobstertrack.db"

    # The Odds API
    odds_api_key: str = ""
    odds_api_base_url: str = "https://api.the-odds-api.com/v4"

    # Scheduler
    fetch_interval_minutes: int = 15

    # Logging
    log_level: str = "INFO"

    # Telegram notifications
    telegram_bot_token: str = ""
    telegram_channel_id: str = ""
    admin_notify_email: str = "neilmac@bookieinsiders.io"  # Where sign-up/payment alerts go

    # Auth
    jwt_secret: str = "change-me-in-production"
    jwt_expiry_hours: int = 168  # 7 days
    magic_link_expiry_minutes: int = 15
    frontend_url: str = "http://localhost:5173"

    # Stripe
    stripe_secret_key: str = ""
    stripe_publishable_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_id: str = ""

    # Email (Resend)
    resend_api_key: str = ""
    email_from: str = "SteamWatch <noreply@steamwatch.io>"

    # League mappings for The Odds API. Format: sport_key for the API.
    # Order here does NOT drive frontend display order (that's entirely
    # controlled by LEAGUE_CONFIG's key order in frontend/src/types/index.ts) —
    # this dict only affects backend fetch/scheduling iteration order.
    leagues: dict = {
        "soccer_epl": "English Premier League",
        "soccer_efl_champ": "EFL Championship",
        "soccer_spain_la_liga": "La Liga",
        "soccer_germany_bundesliga": "Bundesliga",
        "soccer_france_ligue_one": "Ligue 1",
        "soccer_italy_serie_a": "Serie A",
        "soccer_uefa_champs_league": "Champions League",
        "soccer_uefa_champs_league_qualification": "Champions League Qualifying",
        "soccer_uefa_europa_league": "Europa League",
        "soccer_uefa_europa_conference_league": "Conference League",
        "soccer_fifa_world_cup": "FIFA World Cup",
    }

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
