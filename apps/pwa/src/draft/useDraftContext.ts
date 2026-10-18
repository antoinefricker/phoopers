import { createContext, useContext } from 'react';
import type { DraftOrigin } from './draftStorage';

export interface DraftContextValue {
  /** Where the open system was stored, or null when it never was. */
  origin: DraftOrigin | null;
  /** True when the open system differs from what is stored, or was never stored. */
  isDirty: boolean;
  /** Called once a write succeeded: the open system is now what is stored, under `origin`. */
  markSaved: (origin: DraftOrigin) => void;
  /** Drops the browser's copy of the draft. */
  discard: () => void;
}

export const DraftContext = createContext<DraftContextValue | null>(null);

export function useDraftContext(): DraftContextValue {
  const value = useContext(DraftContext);
  if (!value) throw new Error('useDraftContext must be used within a DraftContextProvider');
  return value;
}
