import { createContext, useContext } from 'react';
import type { Settings } from '../types/Settings';

export interface SettingsContextValue {
  settings: Settings;
  /** Applies at once and is kept for the next visit. */
  setSetting: <K extends keyof Settings>(name: K, value: Settings[K]) => void;
}

export const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettingsContext(): SettingsContextValue {
  const value = useContext(SettingsContext);

  if (value === null) {
    throw new Error('useSettingsContext must be used inside a SettingsContextProvider');
  }

  return value;
}
