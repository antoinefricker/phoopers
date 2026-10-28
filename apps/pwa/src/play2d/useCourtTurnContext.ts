import { createContext, useContext } from 'react';

/** How far the court is turned on screen, in degrees: 0 for a full court, a quarter turn for a half. */
export type CourtTurnContextValue = number;

export const CourtTurnContext = createContext<CourtTurnContextValue | null>(null);

export function useCourtTurnContext(): CourtTurnContextValue {
  const value = useContext(CourtTurnContext);

  if (value === null) {
    throw new Error('useCourtTurnContext must be used inside a CourtTurnContextProvider');
  }

  return value;
}
