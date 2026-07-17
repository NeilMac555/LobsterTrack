import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { TimeMode } from '../utils/time';

interface TimePreferenceContextType {
  mode: TimeMode;
  toggle: () => void;
  setMode: (mode: TimeMode) => void;
}

const TimePreferenceContext = createContext<TimePreferenceContextType | null>(null);

export function useTimePreference(): TimePreferenceContextType {
  const ctx = useContext(TimePreferenceContext);
  if (!ctx) throw new Error('useTimePreference must be used within TimePreferenceProvider');
  return ctx;
}

const STORAGE_KEY = 'time_display_mode';

function isTimeMode(v: string | null): v is TimeMode {
  return v === 'local' || v === 'utc';
}

export function TimePreferenceProvider({ children }: { children: ReactNode }) {
  // Defaults to 'local' (auto-detected via the browser's own timezone —
  // no explicit detection step needed, every Date/Intl call already
  // renders in the browser's local zone unless we ask for UTC). A
  // previously-saved choice in localStorage wins over the default.
  const [mode, setModeState] = useState<TimeMode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isTimeMode(stored) ? stored : 'local';
  });

  const setMode = useCallback((next: TimeMode) => {
    localStorage.setItem(STORAGE_KEY, next);
    setModeState(next);
  }, []);

  const toggle = useCallback(() => {
    setMode(mode === 'local' ? 'utc' : 'local');
  }, [mode, setMode]);

  return (
    <TimePreferenceContext.Provider value={{ mode, toggle, setMode }}>
      {children}
    </TimePreferenceContext.Provider>
  );
}
