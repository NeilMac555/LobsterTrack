import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { OddsFormat } from '../utils/odds';

// Mirrors TimePreferenceContext (the LOCAL/UTC toggle) — same shape,
// same localStorage persistence, same header-toggle UI in Layout.tsx.

interface OddsFormatContextType {
  format: OddsFormat;
  toggle: () => void;
  setFormat: (format: OddsFormat) => void;
}

const OddsFormatContext = createContext<OddsFormatContextType | null>(null);

export function useOddsFormat(): OddsFormatContextType {
  const ctx = useContext(OddsFormatContext);
  if (!ctx) throw new Error('useOddsFormat must be used within OddsFormatProvider');
  return ctx;
}

const STORAGE_KEY = 'odds_display_format';

function isOddsFormat(v: string | null): v is OddsFormat {
  return v === 'decimal' || v === 'american';
}

export function OddsFormatProvider({ children }: { children: ReactNode }) {
  // Decimal is the site default (all stored/streamed odds are decimal);
  // a previously-saved choice in localStorage wins over the default.
  const [format, setFormatState] = useState<OddsFormat>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isOddsFormat(stored) ? stored : 'decimal';
  });

  const setFormat = useCallback((next: OddsFormat) => {
    localStorage.setItem(STORAGE_KEY, next);
    setFormatState(next);
  }, []);

  const toggle = useCallback(() => {
    setFormat(format === 'decimal' ? 'american' : 'decimal');
  }, [format, setFormat]);

  return (
    <OddsFormatContext.Provider value={{ format, toggle, setFormat }}>
      {children}
    </OddsFormatContext.Provider>
  );
}
