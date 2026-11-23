"""Read a fixture list's opening/latest prices, count and trend in one scan."""
from sqlalchemy import func, or_

from app.models import OddsSnapshot
from app.services.odds_quality import preferred_snapshot_sql


def match_odds_summary(db, match_ids, spark_points=12):
    if not match_ids:
        return {}, {}, {}, {}
    ranked = db.query(
        OddsSnapshot.match_id, OddsSnapshot.home_odds,
        OddsSnapshot.draw_odds, OddsSnapshot.away_odds,
        OddsSnapshot.bookmaker, OddsSnapshot.fetched_at,
        func.row_number().over(partition_by=OddsSnapshot.match_id,
                               order_by=OddsSnapshot.fetched_at.desc()).label('latest_rank'),
        func.row_number().over(partition_by=OddsSnapshot.match_id,
                               order_by=OddsSnapshot.fetched_at.asc()).label('opening_rank'),
        func.count().over(partition_by=OddsSnapshot.match_id).label('snapshot_count'),
    ).filter(
        OddsSnapshot.match_id.in_(match_ids), preferred_snapshot_sql(OddsSnapshot),
    ).subquery()
    rows = db.query(ranked).filter(or_(
        ranked.c.latest_rank <= spark_points, ranked.c.opening_rank == 1,
    )).order_by(ranked.c.match_id, ranked.c.fetched_at.asc()).all()

    latest, opening, counts, sparks = {}, {}, {}, {}
    for row in rows:
        prices = dict(home=row.home_odds, draw=row.draw_odds, away=row.away_odds)
        if row.latest_rank == 1:
            latest[row.match_id] = {**prices, 'bookmaker': row.bookmaker}
        if row.opening_rank == 1:
            opening[row.match_id] = prices
        counts[row.match_id] = row.snapshot_count
        if row.latest_rank <= spark_points:
            sparks.setdefault(row.match_id, []).append(round(100 / row.home_odds, 2))
    return latest, opening, counts, sparks
