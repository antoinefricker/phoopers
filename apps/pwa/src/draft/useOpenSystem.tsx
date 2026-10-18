import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { PlayId } from '../engine';
import { LeaveDraftDialog } from './LeaveDraftDialog';
import { isUnsaved, readDraft } from './draftStorage';

interface Leaving {
  opened: boolean;
  count: number;
  target: PlayId | null;
  name: string;
}

/**
 * Opening a system replaces the draft, so the lists open one through this: silently when nothing
 * would be lost, after a confirmation when the held draft has unsaved changes. Render `dialog` once.
 */
export function useOpenSystem(): { open: (id: PlayId) => void; dialog: ReactNode } {
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState<Leaving>({ opened: false, count: 0, target: null, name: '' });

  const go = (id: PlayId) => void navigate(`/play/${id}`);

  const open = (id: PlayId) => {
    const draft = readDraft();
    const replaced = draft !== null && draft.play.id !== id;
    if (replaced && isUnsaved(draft)) {
      setLeaving((l) => ({ opened: true, count: l.count + 1, target: id, name: draft.play.name }));
      return;
    }
    go(id);
  };

  const dialog = (
    <LeaveDraftDialog
      key={leaving.count}
      opened={leaving.opened}
      name={leaving.name}
      onConfirm={() => {
        setLeaving((l) => ({ ...l, opened: false }));
        if (leaving.target !== null) go(leaving.target);
      }}
      onClose={() => setLeaving((l) => ({ ...l, opened: false }))}
    />
  );

  return { open, dialog };
}
