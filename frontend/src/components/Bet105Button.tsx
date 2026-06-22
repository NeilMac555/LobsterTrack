import { useCallback } from 'react';

const BET105_URL = 'https://bit.ly/mac105';
const BET105_BLUE = '#1B7CEC';

type Variant = 'compact' | 'full';

interface Props {
  variant?: Variant;
  className?: string;
  location?: string;
}

declare global {
  interface Window {
    plausible?: (event: string, opts?: { props?: Record<string, string> }) => void;
  }
}

export default function Bet105Button({ variant = 'full', className = '', location }: Props) {
  const handleClick = useCallback(() => {
    try {
      window.plausible?.('Bet105 Click', location ? { props: { location } } : undefined);
    } catch {
      // Plausible may not be loaded — never block the navigation.
    }
  }, [location]);

  if (variant === 'compact') {
    return (
      <a
        href={BET105_URL}
        target="_blank"
        rel="sponsored noopener noreferrer"
        onClick={handleClick}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-black border border-slate-700/60 hover:border-slate-500 transition-colors font-mono text-[11px] font-bold uppercase tracking-[0.1em] ${className}`}
        title="Bet at Bet105 — same odds as Pinnacle"
      >
        <span className="text-white">Bet at</span>
        <span style={{ color: BET105_BLUE }}>105</span>
        <span className="text-slate-500 normal-case font-medium tracking-normal">· Pin odds</span>
        <span className="text-slate-400">→</span>
      </a>
    );
  }

  return (
    <a
      href={BET105_URL}
      target="_blank"
      rel="sponsored noopener noreferrer"
      onClick={handleClick}
      className={`group block w-full max-w-md rounded-lg bg-black border border-slate-700/60 hover:border-slate-500 transition-colors px-4 py-3 ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="font-bold text-[18px] tracking-tight leading-tight">
            <span className="text-white">Bet at </span>
            <span className="text-white">bet</span>
            <span style={{ color: BET105_BLUE }}>105</span>
          </span>
          <span className="text-[11px] font-mono uppercase tracking-[0.1em] text-slate-400 mt-1">
            Same odds as Pinnacle
          </span>
        </div>
        <span className="text-slate-400 group-hover:text-white text-lg transition-colors">→</span>
      </div>
    </a>
  );
}
