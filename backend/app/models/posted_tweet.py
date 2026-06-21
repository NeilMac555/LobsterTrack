from sqlalchemy import Column, String, DateTime, BigInteger, ForeignKey, Index
from datetime import datetime
from .database import Base


class PostedTweet(Base):
    """
    Tracks tweets we've already posted to @Steamwatchio so the auto-poster
    never sends the same content twice. Each row records (match_id,
    tweet_type) — if a row exists with that pair, we skip the post.

    tweet_type values:
      - 'late_steam'   — fired by the syndicate alerter, one per match max
      - 'closing_line' — T-15 min pre-KO snapshot, one per match
      - 'inplay_recap' — T+10 min post-KO Pinnacle→Polymarket gap, one per match
      - 'morning_brief' — once-per-day matchday brief (match_id=NULL, uses YYYY-MM-DD)
    """
    __tablename__ = "posted_tweets"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    # Nullable for tweet_types that don't tie to a single match (morning_brief).
    match_id = Column(String(64), ForeignKey("matches.id"), nullable=True, index=True)
    tweet_type = Column(String(32), nullable=False)
    # The tweet ID returned by the X API — useful for debug or future deletion.
    tweet_id = Column(String(32), nullable=True)
    # For tweet_types where match_id is NULL, store a daily key like '2026-06-21'.
    day_key = Column(String(16), nullable=True)
    posted_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_posted_match_type", "match_id", "tweet_type"),
        Index("idx_posted_day_type", "day_key", "tweet_type"),
    )

    def __repr__(self):
        return f"<PostedTweet {self.tweet_type} match={self.match_id} day={self.day_key}>"
