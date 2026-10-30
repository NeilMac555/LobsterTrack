function movementBadge(row) {
  if (row.rank_movement_status === 'new') return '<span class="rank-move new" title="New to the main ranking since the previous update">New</span>';
  if (row.rank_movement_status !== 'ranked') return '<span class="rank-move flat" aria-label="Rank movement unavailable" title="No comparable overall rank">—</span>';
  const change = row.rank_movement;
  const label = change === 0 ? 'Overall rank unchanged' : `Overall rank ${change > 0 ? 'up' : 'down'} ${Math.abs(change)} ${Math.abs(change) === 1 ? 'place' : 'places'} since the previous update`;
  const icon = change === 0 ? '—' : `<svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${change > 0 ? 'M8 13V3M3 8l5-5 5 5' : 'M8 3v10M3 8l5 5 5-5'}"/></svg>${Math.abs(change)}`;
  return `<span class="rank-move ${change > 0 ? 'up' : change < 0 ? 'down' : 'flat'}" aria-label="${label}" title="${label}">${icon}</span>`;
}
