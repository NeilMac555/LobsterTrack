"""Live, non-accumulating one-place community swaps around the weekly model."""
from copy import deepcopy
from datetime import timedelta

MIN_VOTERS = 5
MIN_AGREEMENT = .8
EXPIRY_DAYS = 30
RATING_RESET = 20.


def eligible(vote, score, now):
    return (vote.direction in (-1, 1)
            and now - timedelta(days=EXPIRY_DAYS) < vote.updated_at <= now
            and abs(vote.rating_at_vote - score) <= RATING_RESET)


def ranked_board(board, votes, now):
    result = deepcopy(board)
    teams = result['teams']
    # Ignore old point offsets and one-off publication edits. Opinions are
    # assessed against model strength, so moving a rank cannot invalidate them.
    for team in teams:
        team['score'] = team.get('base_score', team['score'])
        team['community_adjustment'] = 0
        team['community_rank_change'] = 0
        team['community_reason'] = None
        previous = team.get('previous_score')
        team['score_change'] = round(team['score']-previous, 2) if previous is not None else None
    teams.sort(key=lambda t: (-t['score'], t['name']))
    counts = {t['id']: [0, 0] for t in teams}
    scores = {t['id']: t['score'] for t in teams}
    for vote in votes:
        if vote.club_id in scores and eligible(vote, scores[vote.club_id], now):
            counts[vote.club_id][0 if vote.direction == 1 else 1] += 1
    directions, candidates = {}, []
    for i, team in enumerate(teams):
        team['rank'] = i+1
        up, down = counts[team['id']]
        n = up+down
        direction = (1 if up > down else -1) if n >= MIN_VOTERS and max(up, down)/n >= MIN_AGREEMENT else 0
        directions[i] = direction
        if direction:
            candidates.append((-abs(up-down), -n, team['id'], i, direction))
    # Disjoint adjacent swaps keep EVERY club within one place of its model
    # rank. Stronger support wins overlapping claims; ID breaks exact ties.
    # Rebuild from the model on every read: reloads cannot cause a ratchet.
    used = set()
    for _, _, _, i, direction in sorted(candidates):
        j = i-direction
        if not 0 <= j < len(teams) or i in used or j in used:
            continue
        if directions[j] == direction:
            continue  # Never displace a qualifying neighbour against its vote.
        first, second = teams[i], teams[j]
        first['community_rank_change'] = direction
        first['community_reason'] = 'consensus'
        second['community_rank_change'] = -direction
        second['community_reason'] = 'consensus' if directions[j] == -direction else 'neighbour'
        teams[i], teams[j] = second, first
        used.update((i, j))
    for rank, team in enumerate(teams, 1):
        team['rank'] = rank
        previous = team.get('previous_rank')
        team['rank_change'] = previous-rank if previous is not None else None
    return result
