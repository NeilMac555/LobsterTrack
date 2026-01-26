interface LeagueLogoProps {
  sportKey: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  sm: 'text-lg',
  md: 'text-2xl',
  lg: 'text-4xl',
};

// Country flags for each league
const flags: Record<string, string> = {
  soccer_epl: '🇬🇧',
  soccer_spain_la_liga: '🇪🇸',
  soccer_germany_bundesliga: '🇩🇪',
  soccer_france_ligue_one: '🇫🇷',
  soccer_italy_serie_a: '🇮🇹',
  soccer_uefa_champs_league: '🇪🇺',
};

export default function LeagueLogo({ sportKey, size = 'md', className = '' }: LeagueLogoProps) {
  const sizeClass = sizes[size];
  const flag = flags[sportKey] || '⚽';

  return (
    <span className={`${sizeClass} ${className}`} role="img" aria-label={sportKey}>
      {flag}
    </span>
  );
}
