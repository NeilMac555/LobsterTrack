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

// Flag image paths for each league
const flags: Record<string, string> = {
  soccer_epl: '/flags/uk-en-circle-01.png',
  soccer_spain_la_liga: '/flags/es-circle-01.png',
  soccer_germany_bundesliga: '/flags/de-circle-01.png',
  soccer_france_ligue_one: '/flags/fr-circle-01.png',
  soccer_italy_serie_a: '/flags/it-circle-01.png',
  soccer_uefa_champs_league: '/flags/org-eu-circle-01.png',
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
      className={`${sizeClass} ${className} rounded-full object-cover`}
    />
  );
}
