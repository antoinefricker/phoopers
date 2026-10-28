import { useCallback, useMemo, type ReactNode } from 'react';
import { useLocalStorage } from '@mantine/hooks';
import { DEFAULT_SETTINGS, type Settings } from '../types/Settings';
import { SettingsContext, type SettingsContextValue } from './useSettingsContext';

const STORAGE_KEY = 'phoopers-settings';

interface Props {
  children: ReactNode;
}

export function SettingsContextProvider({ children }: Props) {
  // Only what the coach changed is stored, laid over the defaults: a setting added later reads
  // as its default for everyone who saved before it existed, rather than as undefined.
  // Read on the first render, not in an effect, so the court never draws once with the default.
  const [stored, setStored] = useLocalStorage<Partial<Settings>>({
    key: STORAGE_KEY,
    defaultValue: {},
    getInitialValueInEffect: false,
  });

  const settings = useMemo<Settings>(() => ({ ...DEFAULT_SETTINGS, ...stored }), [stored]);

  const setSetting = useCallback<SettingsContextValue['setSetting']>(
    (name, value) => setStored((current) => ({ ...current, [name]: value })),
    [setStored],
  );

  const value = useMemo<SettingsContextValue>(() => ({ settings, setSetting }), [settings, setSetting]);

  return <SettingsContext value={value}>{children}</SettingsContext>;
}
