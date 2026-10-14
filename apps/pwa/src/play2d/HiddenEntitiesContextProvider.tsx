import { useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { EntityId } from '../engine';
import { EditorContext } from '../editor/useEditorContext';
import { HiddenEntitiesContext } from './useHiddenEntitiesContext';

const NOTHING_HIDDEN: ReadonlySet<EntityId> = new Set();

/**
 * Holds which entities the court leaves out, so a crowded play can be read a few tokens at a
 * time. It is a view aid, not play data: nothing here reaches the model.
 *
 * The edit-mode rule lives here rather than in the court's layers, so they need not know the
 * mode. What was hidden is kept while the mode changes, so a trip through play mode and back
 * returns the court as the coach left it.
 */
export function HiddenEntitiesContextProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState<ReadonlySet<EntityId>>(NOTHING_HIDDEN);
  // Read directly: the court renders without an editor around it, and then nothing can be
  // hidden because nothing offers to hide it.
  const editing = useContext(EditorContext)?.mode === 'edit';

  const value = useMemo(
    () => ({
      hidden: editing ? hidden : NOTHING_HIDDEN,
      toggleHidden: (entityId: EntityId) =>
        setHidden((current) => {
          const next = new Set(current);
          if (!next.delete(entityId)) next.add(entityId);

          return next;
        }),
    }),
    [editing, hidden],
  );

  return <HiddenEntitiesContext.Provider value={value}>{children}</HiddenEntitiesContext.Provider>;
}
