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

export default function LeagueLogo({ sportKey, size = 'md', className = '' }: LeagueLogoProps) {
  const sizeClass = sizes[size];

  // League-specific colors and designs
  const logos: Record<string, JSX.Element> = {
    soccer_epl: (
      // Premier League - Purple lion
      <svg viewBox="0 0 40 40" className={`${sizeClass} ${className}`}>
        <circle cx="20" cy="20" r="18" fill="#3D195B" />
        <path
          d="M20 8c-2 0-3 1-3 2v4l-4-2c-1 0-2 1-2 2v6c0 1 1 2 2 2l4-2v6c0 2 2 4 3 4s3-2 3-4v-6l4 2c1 0 2-1 2-2v-6c0-1-1-2-2-2l-4 2v-4c0-1-1-2-3-2z"
          fill="#00FF85"
        />
        <circle cx="20" cy="14" r="2" fill="#fff" />
      </svg>
    ),

    soccer_spain_la_liga: (
      // La Liga - Orange/red with ball
      <svg viewBox="0 0 40 40" className={`${sizeClass} ${className}`}>
        <circle cx="20" cy="20" r="18" fill="#FF4B44" />
        <circle cx="20" cy="20" r="10" fill="#FF6B35" stroke="#fff" strokeWidth="1.5" />
        <path
          d="M15 20c0-3 2-5 5-5s5 2 5 5-2 5-5 5-5-2-5-5"
          fill="none"
          stroke="#fff"
          strokeWidth="1.5"
        />
        <path d="M20 15v10M15 20h10" stroke="#fff" strokeWidth="1" />
      </svg>
    ),

    soccer_germany_bundesliga: (
      // Bundesliga - Red with football
      <svg viewBox="0 0 40 40" className={`${sizeClass} ${className}`}>
        <circle cx="20" cy="20" r="18" fill="#D20515" />
        <circle cx="20" cy="20" r="10" fill="none" stroke="#fff" strokeWidth="2" />
        <path
          d="M20 10v6l5 4-2 6h-6l-2-6 5-4z"
          fill="#fff"
        />
      </svg>
    ),

    soccer_france_ligue_one: (
      // Ligue 1 - Navy blue
      <svg viewBox="0 0 40 40" className={`${sizeClass} ${className}`}>
        <circle cx="20" cy="20" r="18" fill="#091C3E" />
        <text
          x="20"
          y="24"
          textAnchor="middle"
          fill="#CDFF00"
          fontSize="12"
          fontWeight="bold"
          fontFamily="Arial"
        >
          L1
        </text>
        <circle cx="20" cy="20" r="14" fill="none" stroke="#CDFF00" strokeWidth="1.5" />
      </svg>
    ),

    soccer_italy_serie_a: (
      // Serie A - Blue with letter A
      <svg viewBox="0 0 40 40" className={`${sizeClass} ${className}`}>
        <circle cx="20" cy="20" r="18" fill="#024494" />
        <path
          d="M14 28l6-16 6 16M16 24h8"
          fill="none"
          stroke="#fff"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),

    soccer_uefa_champs_league: (
      // Champions League - Dark blue with stars
      <svg viewBox="0 0 40 40" className={`${sizeClass} ${className}`}>
        <circle cx="20" cy="20" r="18" fill="#071D49" />
        <circle cx="20" cy="20" r="12" fill="none" stroke="#fff" strokeWidth="1" />
        {/* Stars around the circle */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
          const rad = (angle * Math.PI) / 180;
          const x = 20 + 14 * Math.cos(rad);
          const y = 20 + 14 * Math.sin(rad);
          return (
            <circle key={i} cx={x} cy={y} r="1.5" fill="#fff" />
          );
        })}
        <path
          d="M20 12l1.5 4.5h4.5l-3.5 2.5 1.5 4.5-4-3-4 3 1.5-4.5-3.5-2.5h4.5z"
          fill="#fff"
        />
      </svg>
    ),
  };

  // Fallback for unknown leagues
  const fallback = (
    <svg viewBox="0 0 40 40" className={`${sizeClass} ${className}`}>
      <circle cx="20" cy="20" r="18" fill="#475569" />
      <circle cx="20" cy="20" r="8" fill="none" stroke="#fff" strokeWidth="2" />
    </svg>
  );

  return logos[sportKey] || fallback;
}
