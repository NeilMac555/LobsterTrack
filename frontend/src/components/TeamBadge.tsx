import { useState } from 'react';
import { countryFlagImgUrl } from '../utils/countryFlags';

interface TeamBadgeProps {
  team: string;
  badgeUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  sm: 'w-5 h-5 text-[8px]',
  md: 'w-7 h-7 text-[10px]',
  lg: 'w-10 h-10 text-xs',
};

function initials(team: string) {
  const words = team.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.slice(0, 2).map(word => word[0]).join('') : team.slice(0, 2)).toUpperCase();
}

export default function TeamBadge({ team, badgeUrl, size = 'sm', className = '' }: TeamBadgeProps) {
  const [failed, setFailed] = useState(false);
  const countryFlag = countryFlagImgUrl(team, size === 'lg' ? 40 : size === 'md' ? 24 : 20);
  const src = !failed ? badgeUrl || countryFlag : null;

  if (src) {
    return (
      <img
        src={src}
        alt=""
        title={team}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`${sizes[size]} ${className} object-contain flex-shrink-0`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      title={team}
      className={`${sizes[size]} ${className} rounded-full bg-slate-700 border border-slate-600 text-slate-300 font-mono font-bold inline-flex items-center justify-center flex-shrink-0`}
    >
      {initials(team)}
    </span>
  );
}
