"""
Twitter / X posting service.

Posts to the @Steamwatchio account using OAuth 1.0a user-context auth.
Credentials are stored as Railway env vars set by Neil — never check
them into source. If any of the four are missing we report it cleanly
rather than crashing, so the admin diagnostic endpoint can tell Neil
exactly which one is missing.

Reference: https://docs.tweepy.org/en/stable/authentication.html#oauth-1-0a-user-context
"""
import os
from dataclasses import dataclass
from typing import Optional

import structlog
import tweepy

logger = structlog.get_logger()


@dataclass
class TwitterStatus:
    """Result of a verify/post call. Always returns this; never raises."""
    ok: bool
    detail: str
    tweet_id: Optional[str] = None
    handle: Optional[str] = None


def _credentials() -> tuple[Optional[str], Optional[str], Optional[str], Optional[str], list[str]]:
    """Pull the four OAuth 1.0a env vars; return them + a list of any missing ones."""
    api_key = os.getenv("TWITTER_API_KEY")
    api_secret = os.getenv("TWITTER_API_SECRET")
    access_token = os.getenv("TWITTER_ACCESS_TOKEN")
    access_token_secret = os.getenv("TWITTER_ACCESS_TOKEN_SECRET")
    missing = [
        name
        for name, val in (
            ("TWITTER_API_KEY", api_key),
            ("TWITTER_API_SECRET", api_secret),
            ("TWITTER_ACCESS_TOKEN", access_token),
            ("TWITTER_ACCESS_TOKEN_SECRET", access_token_secret),
        )
        if not val
    ]
    return api_key, api_secret, access_token, access_token_secret, missing


def _client() -> tuple[Optional[tweepy.Client], list[str]]:
    """Build a tweepy v2 Client. Returns (None, missing-names) if any env var absent."""
    api_key, api_secret, access_token, access_token_secret, missing = _credentials()
    if missing:
        return None, missing
    client = tweepy.Client(
        consumer_key=api_key,
        consumer_secret=api_secret,
        access_token=access_token,
        access_token_secret=access_token_secret,
        wait_on_rate_limit=False,
    )
    return client, []


def _safe_prefix(val: Optional[str], n: int = 4) -> str:
    """Show the first n chars of a secret + its length — enough to identify
    a mix-up (e.g. someone pasted the OAuth 2.0 Client ID into the Consumer
    Key slot) without leaking the actual value."""
    if not val:
        return "(empty)"
    return f"{val[:n]}…(len={len(val)})"


def credentials_fingerprint() -> dict:
    """Diagnostic: prefix + length of each env var, never the full value.
    Used to spot which env var has the wrong content when auth fails."""
    api_key, api_secret, access_token, access_token_secret, _ = _credentials()
    return {
        "TWITTER_API_KEY": _safe_prefix(api_key),
        "TWITTER_API_SECRET": _safe_prefix(api_secret),
        "TWITTER_ACCESS_TOKEN": _safe_prefix(access_token),
        "TWITTER_ACCESS_TOKEN_SECRET": _safe_prefix(access_token_secret),
    }


def verify_credentials() -> TwitterStatus:
    """
    Confirm the OAuth 1.0a credentials work by asking the API who the
    authenticated user is. Doesn't post anything — safe to call repeatedly.
    """
    client, missing = _client()
    if not client:
        return TwitterStatus(ok=False, detail=f"Missing env vars: {', '.join(missing)}")
    try:
        me = client.get_me()
        if me.data:
            handle = me.data.username
            logger.info("Twitter credentials verified", handle=handle)
            return TwitterStatus(ok=True, detail=f"Authenticated as @{handle}", handle=handle)
        return TwitterStatus(ok=False, detail="get_me() returned no data")
    except tweepy.errors.Unauthorized as e:
        return TwitterStatus(ok=False, detail=f"Unauthorized — credentials are wrong or app permission is Read-only: {e}")
    except tweepy.errors.Forbidden as e:
        return TwitterStatus(ok=False, detail=f"Forbidden — app permission likely Read-only (need Read+Write): {e}")
    except Exception as e:
        return TwitterStatus(ok=False, detail=f"{type(e).__name__}: {e}")


def post_tweet(text: str) -> TwitterStatus:
    """
    Post `text` to the authenticated account (@Steamwatchio).
    Tweet length limit is 280 chars on the free tier; tweepy will surface
    a 403 if we exceed it.
    """
    client, missing = _client()
    if not client:
        return TwitterStatus(ok=False, detail=f"Missing env vars: {', '.join(missing)}")
    if not text or not text.strip():
        return TwitterStatus(ok=False, detail="Empty tweet text")
    try:
        resp = client.create_tweet(text=text)
        tweet_id = str(resp.data.get("id")) if resp.data else None
        logger.info("Tweet posted", tweet_id=tweet_id, length=len(text))
        return TwitterStatus(
            ok=True,
            detail=f"Posted tweet {tweet_id}",
            tweet_id=tweet_id,
        )
    except tweepy.errors.Unauthorized as e:
        return TwitterStatus(ok=False, detail=f"Unauthorized — credentials wrong or revoked: {e}")
    except tweepy.errors.Forbidden as e:
        return TwitterStatus(ok=False, detail=f"Forbidden — likely Read-only app permission, or duplicate tweet, or rate-limited: {e}")
    except Exception as e:
        return TwitterStatus(ok=False, detail=f"{type(e).__name__}: {e}")
