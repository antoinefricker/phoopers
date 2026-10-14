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
