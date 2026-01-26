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
  colorClass,
  bgClass
}: OddsWithMovementProps) {
  const formatOdds = (odds: number | null) => {
    if (odds === null) return '-';
    return odds.toFixed(2);
  };

  const movement = calculateMovement(current, opening);
  const isSignificant = Math.abs(movement.percentage) >= 5;

  return (
    <div className={`px-3 py-2 rounded ${bgClass} text-center min-w-[80px]`}>
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className={`text-lg font-bold ${colorClass} font-mono flex items-center justify-center gap-1`}>
        <span className={isSignificant ? 'underline decoration-2' : ''}>
          {formatOdds(current)}
        </span>
        {movement.direction === 'up' && (
          <span className="text-emerald-400 text-sm">↑</span>
        )}
        {movement.direction === 'down' && (
          <span className="text-red-400 text-sm">↓</span>
        )}
      </div>
      {movement.direction !== 'none' && (
        <div className={`text-xs mt-0.5 ${
          movement.direction === 'up' ? 'text-emerald-400' : 'text-red-400'
        } ${isSignificant ? 'font-bold' : ''}`}>
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
  const formatOdds = (odds: number | null) => {
    if (odds === null) return '-';
    return odds.toFixed(2);
  };

  const homeMovement = calculateMovement(home, openingHome);
  const drawMovement = calculateMovement(draw, openingDraw);
  const awayMovement = calculateMovement(away, openingAway);

  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1.5',
  };

  const renderOddsBox = (
    current: number | null,
    movement: ReturnType<typeof calculateMovement>,
    bgClass: string,
    textClass: string,
    title: string
  ) => {
    const isSignificant = Math.abs(movement.percentage) >= 5;

    return (
      <div
        className={`${sizeClasses[size]} rounded ${bgClass} ${textClass} font-mono font-semibold flex items-center gap-0.5`}
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
      {renderOddsBox(home, homeMovement, 'bg-emerald-500/20', 'text-emerald-400', 'Home')}
      {renderOddsBox(draw, drawMovement, 'bg-yellow-500/20', 'text-yellow-400', 'Draw')}
      {renderOddsBox(away, awayMovement, 'bg-red-500/20', 'text-red-400', 'Away')}
    </div>
  );
}

// Get the biggest mover for summary display
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

  const biggest = movements.reduce((max, curr) =>
    Math.abs(curr.percentage) > Math.abs(max.percentage) ? curr : max
  );

  if (biggest.direction === 'none') return null;

  return {
    outcome: biggest.outcome,
    percentage: biggest.percentage,
    direction: biggest.direction,
  };
}
