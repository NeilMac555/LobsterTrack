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

const textSizes = {
  sm: 'text-[8px]',
  md: 'text-[10px]',
  lg: 'text-xs',
};

// Country flags (flagcdn.com) for the domestic leagues.
const flags: Record<string, string> = {
  soccer_epl: 'https://flagcdn.com/w80/gb-eng.png',
  soccer_spain_la_liga: 'https://flagcdn.com/w80/es.png',
  soccer_germany_bundesliga: 'https://flagcdn.com/w80/de.png',
  soccer_france_ligue_one: 'https://flagcdn.com/w80/fr.png',
  soccer_italy_serie_a: 'https://flagcdn.com/w80/it.png',
};

// UEFA competition brand pills — use each tournament's official color.
const uefaBadges: Record<string, { label: string; color: string }> = {
  soccer_uefa_champs_league: { label: 'UCL', color: '#071D49' },
  soccer_uefa_europa_league: { label: 'UEL', color: '#F47B20' },
  soccer_uefa_europa_conference_league: { label: 'UECL', color: '#0AC44B' },
};

export default function LeagueLogo({ sportKey, size = 'md', className = '' }: LeagueLogoProps) {
  const sizeClass = sizes[size];
  const textSizeClass = textSizes[size];

  // UEFA competition — render a solid brand-colored pill with the short code.
  const badge = uefaBadges[sportKey];
  if (badge) {
    return (
      <div
        className={`${sizeClass} ${className} rounded-full flex items-center justify-center font-black text-white leading-none shadow-sm`}
        style={{ backgroundColor: badge.color }}
        title={badge.label}
      >
        <span className={`${textSizeClass} tracking-tight`}>{badge.label}</span>
      </div>
    );
  }

  // Domestic league — render the country flag.
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
