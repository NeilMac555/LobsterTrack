import { useOddsFormat } from '../contexts/OddsFormatContext';
import { formatOdds as formatOddsUtil } from '../utils/odds';

interface OddsWithMovementProps {
  current: number | null;
  opening: number | null;
  label: string;
  colorClass: string;
  bgClass: string;
}

export function calculateMovement(current: number | null, opening: number | null) {
  if (current === null || opening === null || opening === 0) {
    return { change: 0, percentage: 0, direction: 'none' as const };
  }

  const change = current - opening;
  const percentage = ((current - opening) / opening) * 100;

  if (Math.abs(percentage) < 0.1) {
    return { change: 0, percentage: 0, direction: 'none' as const };
  }

  return {
    change,
    percentage,
    direction: change > 0 ? 'up' as const : 'down' as const,
  };
}

export default function OddsWithMovement({
  current,
  opening,
  label,
  bgClass
}: OddsWithMovementProps) {
  const { format } = useOddsFormat();
  const formatOdds = (odds: number | null) => formatOddsUtil(odds, format);

  const movement = calculateMovement(current, opening);
  const isSignificant = Math.abs(movement.percentage) >= 5;

  // Color logic (site convention since 2026-09-03): Red = shortening (down), Green = drifting (up)
  // Shortening odds = sharp money backing = good signal
  // Drifting odds = money leaving = bad signal
  const movementColorClass = movement.direction === 'down' ? 'text-red-400' : 'text-emerald-400';

  return (
    <div className={`px-2 sm:px-3 py-2 sm:py-3 rounded ${bgClass} text-center min-w-[60px] sm:min-w-[80px]`}>
      <div className="text-[10px] sm:text-xs text-slate-400 mb-0.5 sm:mb-1">{label}</div>
      <div className="text-base sm:text-lg font-bold text-white font-mono flex items-center justify-center gap-0.5 sm:gap-1">
        <span className={isSignificant ? 'underline decoration-2' : ''}>
          {formatOdds(current)}
        </span>
        {movement.direction === 'up' && (
          <span className="text-emerald-400 text-xs sm:text-sm">↑</span>
        )}
        {movement.direction === 'down' && (
          <span className="text-red-400 text-xs sm:text-sm">↓</span>
        )}
      </div>
      {movement.direction !== 'none' && (
        <div className={`text-[10px] sm:text-xs mt-0.5 ${movementColorClass} ${isSignificant ? 'font-bold' : ''}`}>
          {movement.direction === 'up' ? '+' : ''}{movement.percentage.toFixed(1)}%
        </div>
      )}
    </div>
  );
}

// Compact version for match cards
interface OddsDisplayWithMovementProps {
  home: number | null;
  draw: number | null;
  away: number | null;
  openingHome: number | null;
  openingDraw: number | null;
  openingAway: number | null;
  size?: 'sm' | 'md';
}

export function OddsDisplayWithMovement({
  home,
  draw,
  away,
  openingHome,
  openingDraw,
  openingAway,
  size = 'md'
}: OddsDisplayWithMovementProps) {
  const { format } = useOddsFormat();
  const formatOdds = (odds: number | null) => formatOddsUtil(odds, format);

  const homeMovement = calculateMovement(home, openingHome);
  const drawMovement = calculateMovement(draw, openingDraw);
  const awayMovement = calculateMovement(away, openingAway);

  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1.5',
  };

  const moveBg = (m: ReturnType<typeof calculateMovement>) =>
    m.direction === 'down' ? 'bg-red-500/20' : m.direction === 'up' ? 'bg-emerald-500/20' : 'bg-slate-700/40';

  const renderOddsBox = (
    current: number | null,
    movement: ReturnType<typeof calculateMovement>,
    bgClass: string,
    _textClass: string,
    title: string
  ) => {
    const isSignificant = Math.abs(movement.percentage) >= 5;

    // Color logic (site convention since 2026-09-03): Red = shortening (down), Green = drifting (up)
    // Odds values are white, only movement indicators are colored
    return (
      <div
        className={`${sizeClasses[size]} rounded ${bgClass} text-white font-mono font-semibold flex items-center gap-0.5`}
        title={title}
      >
        <span className={isSignificant ? 'font-bold' : ''}>
          {formatOdds(current)}
        </span>
        {movement.direction === 'up' && (
          <span className="text-emerald-400 text-[10px]">↑</span>
        )}
        {movement.direction === 'down' && (
          <span className="text-red-400 text-[10px]">↓</span>
        )}
      </div>
    );
  };

  return (
    <div className="flex gap-1">
      {/* Box colour follows the MOVE, not the outcome (Neil, 2026-09-03):
          red = price has dropped (shortening), green = price has risen
          (drifting), slate = no move yet. */}
      {renderOddsBox(home, homeMovement, moveBg(homeMovement), '', 'Home')}
      {renderOddsBox(draw, drawMovement, moveBg(drawMovement), '', 'Draw')}
      {renderOddsBox(away, awayMovement, moveBg(awayMovement), '', 'Away')}
    </div>
  );
}

// Get the biggest mover for summary display — only shortening (backed) outcomes
export function getBiggestMover(
  homeMovement: ReturnType<typeof calculateMovement>,
  drawMovement: ReturnType<typeof calculateMovement>,
  awayMovement: ReturnType<typeof calculateMovement>
): { outcome: string; percentage: number; direction: 'up' | 'down' | 'none' } | null {
  const movements = [
    { outcome: 'H', ...homeMovement },
    { outcome: 'D', ...drawMovement },
    { outcome: 'A', ...awayMovement },
  ];

  // Only consider shortening odds (direction === 'down') — the side being backed
  const shortening = movements.filter(m => m.direction === 'down');

  if (shortening.length === 0) return null;

  const biggest = shortening.reduce((max, curr) =>
    Math.abs(curr.percentage) > Math.abs(max.percentage) ? curr : max
  );

  return {
    outcome: biggest.outcome,
    percentage: biggest.percentage,
    direction: biggest.direction,
  };
}
