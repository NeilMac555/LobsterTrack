// Odds display formatting — decimal (site default) vs American ("US").
//
// Storage and math stay decimal EVERYWHERE (API, movement %, models);
// American is a display-only transform applied at render time via
// useOddsFormat() + formatOdds(). Chart AXES deliberately stay decimal
// in both modes: American odds are discontinuous around evens (+100/-100
// with no values between), so a continuous axis in that scale would be
// misleading — this matches standard practice on odds sites.

export type OddsFormat = 'decimal' | 'american';

export function toAmerican(decimal: number): string {
  // Evens and better: +profit per 100 staked. Odds-on: stake to win 100.
  if (decimal >= 2) return `+${Math.round((decimal - 1) * 100)}`;
  return `${Math.round(-100 / (decimal - 1))}`;
}

export function formatOdds(
  decimal: number | null | undefined,
  format: OddsFormat,
): string {
  if (decimal == null) return '-';
  if (format === 'american') {
    // Guard degenerate prices (<=1.0 can't convert; shouldn't occur in
    // real data but a bad row shouldn't render "Infinity").
    if (decimal <= 1.0) return decimal.toFixed(2);
    return toAmerican(decimal);
  }
  return decimal.toFixed(2);
}
