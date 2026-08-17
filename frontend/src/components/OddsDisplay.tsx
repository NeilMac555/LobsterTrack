import { useOddsFormat } from '../contexts/OddsFormatContext';
import { formatOdds as formatOddsUtil } from '../utils/odds';

interface OddsDisplayProps {
  home: number | null;
  draw: number | null;
  away: number | null;
  size?: 'sm' | 'md' | 'lg';
}

export default function OddsDisplay({ home, draw, away, size = 'md' }: OddsDisplayProps) {
  const { format } = useOddsFormat();
  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1.5',
    lg: 'text-base px-4 py-2',
  };

  const formatOdds = (odds: number | null) => formatOddsUtil(odds, format);

  return (
    <div className="flex gap-1">
      <div
        className={`${sizeClasses[size]} rounded bg-emerald-500/20 text-emerald-400 font-mono font-semibold`}
        title="Home"
      >
        {formatOdds(home)}
      </div>
      <div
        className={`${sizeClasses[size]} rounded bg-yellow-500/20 text-yellow-400 font-mono font-semibold`}
        title="Draw"
      >
        {formatOdds(draw)}
      </div>
      <div
        className={`${sizeClasses[size]} rounded bg-red-500/20 text-red-400 font-mono font-semibold`}
        title="Away"
      >
        {formatOdds(away)}
      </div>
    </div>
  );
}
