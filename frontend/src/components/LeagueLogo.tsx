interface LeagueLogoProps {
  sportKey: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  sm: 'w-5 h-5',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
};

// Flag CDN URLs (flagcdn.com)
const flags: Record<string, string> = {
  soccer_epl: 'https://flagcdn.com/w80/gb-eng.png',
  soccer_spain_la_liga: 'https://flagcdn.com/w80/es.png',
  soccer_germany_bundesliga: 'https://flagcdn.com/w80/de.png',
  soccer_france_ligue_one: 'https://flagcdn.com/w80/fr.png',
  soccer_italy_serie_a: 'https://flagcdn.com/w80/it.png',
  soccer_uefa_champs_league: 'https://flagcdn.com/w80/eu.png',
};

export default function LeagueLogo({ sportKey, size = 'md', className = '' }: LeagueLogoProps) {
  const sizeClass = sizes[size];
  const flagSrc = flags[sportKey];

  if (!flagSrc) {
    return (
      <div className={`${sizeClass} ${className} rounded-full bg-slate-600 flex items-center justify-center`}>
        <span className="text-white text-xs">?</span>
      </div>
    );
  }

  return (
    <img
      src={flagSrc}
      alt={sportKey}
      className={`${sizeClass} ${className} rounded object-cover`}
    />
  );
}
