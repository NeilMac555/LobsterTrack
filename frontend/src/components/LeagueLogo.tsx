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

// Local league assets in /public/flags/
// Domestic leagues use country flag circles; UEFA comps use official logos.
const images: Record<string, string> = {
  soccer_fifa_world_cup: '/flags/fifa-world-cup-2026.png',
  soccer_epl: '/flags/uk-en-circle-01.png',
  soccer_spain_la_liga: '/flags/es-circle-01.png',
  soccer_germany_bundesliga: '/flags/de-circle-01.png',
  soccer_france_ligue_one: '/flags/fr-circle-01.png',
  soccer_italy_serie_a: '/flags/it-circle-01.png',
  soccer_uefa_champs_league: '/flags/UEFA_Champions_League_logo_no_text.svg.png',
  soccer_uefa_europa_league: '/flags/UEFA_Europa_League_logo_(2024_version).svg.png',
  soccer_uefa_europa_conference_league: '/flags/UEFA_Conference_League_full_logo_(2024_version).svg.png',
};

export default function LeagueLogo({ sportKey, size = 'md', className = '' }: LeagueLogoProps) {
  const sizeClass = sizes[size];
  const src = images[sportKey];

  if (!src) {
    return (
      <div className={`${sizeClass} ${className} rounded-full bg-slate-600 flex items-center justify-center`}>
        <span className="text-white text-xs">?</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={sportKey}
      className={`${sizeClass} ${className} object-contain`}
    />
  );
}
