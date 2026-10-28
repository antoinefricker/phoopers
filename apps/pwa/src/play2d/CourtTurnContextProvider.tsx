import type { ReactNode } from 'react';
import { CourtTurnContext } from './useCourtTurnContext';

interface Props {
  /** Degrees the court is turned by on screen. */
  turn: number;
  children: ReactNode;
}

/**
 * Tells what is drawn inside a turned court that it is turned, so it can undo the turn where it
 * must stay upright (a number) or point the same way on screen (a shadow).
 */
export function CourtTurnContextProvider({ turn, children }: Props) {
  return <CourtTurnContext value={turn}>{children}</CourtTurnContext>;
}
