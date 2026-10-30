"""Compare published overall ranks, retaining the baseline on same-snapshot rebuilds."""
def add_movement(data, previous):
    if previous and previous['as_of'] == data['as_of']:
        data['movement_as_of'] = previous.get('movement_as_of')
        old = {r['id']: r for r in previous['rows']}
        for row in data['rows']:
            row['rank_movement'] = old.get(row['id'], {}).get('rank_movement')
            row['rank_movement_status'] = old.get(row['id'], {}).get('rank_movement_status', 'unavailable')
        return
    if previous and previous['as_of'] > data['as_of']:
        raise ValueError('Cannot publish a snapshot older than its movement baseline')
    data['movement_as_of'] = previous['as_of'] if previous else None
    old = {r['id']: r['rank'] for r in previous['rows'] if r['eligible']} if previous else {}
    for row in data['rows']:
        row['rank_movement'] = None
        row['rank_movement_status'] = 'unavailable'
        if row['eligible'] and previous:
            if row['id'] in old:
                row['rank_movement'] = old[row['id']] - row['rank']
                row['rank_movement_status'] = 'ranked'
            else:
                row['rank_movement_status'] = 'new'
