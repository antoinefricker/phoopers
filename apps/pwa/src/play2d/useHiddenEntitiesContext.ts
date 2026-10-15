import { createContext, useContext } from 'react';
import type { EntityId } from '../engine';

export interface HiddenEntitiesContextValue {
  /**
   * The entities the court must leave out right now. Empty outside edit mode: the control that
   * hides one lives in the timeline, which is not rendered while playing, so a hide that
   * survived into play mode could never be undone.
   */
  hidden: ReadonlySet<EntityId>;
  toggleHidden: (entityId: EntityId) => void;
  /**
   * Leaves `entityId` alone on the court and hides every other entity in `every` — or, when it
   * is already the only one showing, brings them all back.
   *
   * The roster comes from the caller rather than from this provider: what rows exist is the
   * timeline's question, and this provider sits above the playback context in some trees and
   * below it in others. `entityId` need not be showing — isolating a hidden entity reveals it,
   * which is what "show only this one" has to mean.
   */
  isolate: (entityId: EntityId, every: readonly EntityId[]) => void;
}

/** What is hidden when no provider is above: nothing. */
export const NOTHING_HIDDEN: ReadonlySet<EntityId> = new Set();

export const HiddenEntitiesContext = createContext<HiddenEntitiesContextValue | null>(null);

export function useHiddenEntitiesContext(): HiddenEntitiesContextValue {
  const value = useContext(HiddenEntitiesContext);

  if (value === null) {
    throw new Error('useHiddenEntitiesContext must be used inside a HiddenEntitiesContextProvider');
  }

  return value;
}
