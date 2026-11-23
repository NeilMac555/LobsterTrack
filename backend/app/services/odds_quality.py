"""One policy for complete 1X2 books, shared by ingest and historical repair.

112% is total implied probability (12% margin), not a 112% margin.
The existing 90% floor is retained for exchange fallback coverage.
"""
from math import isfinite

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import aliased

MIN_BOOK = 0.90
MAX_BOOK = 1.12
EPSILON = 1e-10
POLICY = 'complete-1x2-max112-v1'


def rejection_reason(home, draw, away):
    values = (home, draw, away)
    if any(not isinstance(v, (int, float)) or isinstance(v, bool)
           or not isfinite(v) or v <= 1 for v in values):
        return 'missing_or_invalid_price'
    book = sum(1 / v for v in values)
    if book > MAX_BOOK + EPSILON:
        return 'book_above_112_percent'
    if book < MIN_BOOK - EPSILON:
        return 'book_below_90_percent'
    return None


def valid_book_sql(home, draw, away):
    """NULL-safe; comparisons also reject PostgreSQL NaN and infinities."""
    book = sum(1.0 / func.nullif(v, 0) for v in (home, draw, away))
    return func.coalesce(and_(
        *(and_(v > 1, v < float('inf')) for v in (home, draw, away)),
        book >= MIN_BOOK - EPSILON, book <= MAX_BOOK + EPSILON,
    ), False)


def valid_snapshot_sql(model):
    return valid_book_sql(model.home_odds, model.draw_odds, model.away_odds)


def preferred_snapshot_sql(model):
    """A chart uses Pinnacle when covered; never splice earlier exchange prices."""
    other = aliased(model)
    has_pinnacle = select(other.id).where(
        other.match_id == model.match_id, other.bookmaker == 'pinnacle',
        other.in_play.is_(False), valid_snapshot_sql(other),
    ).correlate(model).exists()
    return and_(valid_snapshot_sql(model), model.in_play.is_(False),
                or_(model.bookmaker == 'pinnacle', ~has_pinnacle))
