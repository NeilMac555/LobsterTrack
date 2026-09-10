"""Community opinion is a bounded absolute offset, never model training data."""
from datetime import timedelta

MIN_VOTERS = 5
MIN_AGREEMENT = .8
MAX_OFFSET = 15.
MAX_WEEKLY_STEP = 3.
EXPIRY_DAYS = 30
RATING_RESET = 20.


def eligible(vote, score, now):
    return (vote.direction in (-1, 1)
            and now - timedelta(days=EXPIRY_DAYS) < vote.updated_at <= now
            and abs(vote.rating_at_vote - score) <= RATING_RESET)


def adjustment(votes, score, previous, now):
    active = [v for v in votes if eligible(v, score, now)]
    up = sum(v.direction == 1 for v in active)
    down = len(active) - up
    target = 0.
    if len(active) >= MIN_VOTERS and max(up, down) / len(active) >= MIN_AGREEMENT:
        # Shrink small electorates towards zero; participation and agreement
        # both matter. Five unanimous votes target five points, not the cap.
        target = MAX_OFFSET * (up - down) / (len(active) + 10)
    offset = max(-MAX_OFFSET, min(MAX_OFFSET, previous + max(-MAX_WEEKLY_STEP, min(MAX_WEEKLY_STEP, target-previous))))
    return round(offset, 2), {'up': up, 'down': down, 'voters': len(active)}
