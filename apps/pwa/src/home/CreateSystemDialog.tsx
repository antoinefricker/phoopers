import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { writeDraft } from '../draft/draftStorage';
import type { BranchId, PlayId } from '../engine';
import { CreatePlayDialog } from '../editor/CreatePlayDialog';
import { EditorContextProvider, NEW_PLAY_DURATION } from '../editor/EditorContextProvider';
import { createPlay } from '../editor/mutations';
import { useEditorContext } from '../editor/useEditorContext';

interface Props {
  opened: boolean;
  onClose: () => void;
}

/** Hands whatever the creation dialog makes to the editor: it becomes the draft, and `/play` opens it. */
function Handoff({ placeholderId, opened, onClose }: Props & { placeholderId: PlayId }) {
  const { play } = useEditorContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (play.id === placeholderId) return;
    writeDraft({ play, origin: null });
    void navigate('/play');
  }, [play, placeholderId, navigate]);

  return <CreatePlayDialog opened={opened} onClose={onClose} hideDiscardWarning />;
}

/**
 * The creation dialog away from the editor. The dialog builds its system through the editor
 * context, so this hosts a throwaway one: the placeholder is never drawn or stored, and the
 * first play that replaces it is the coach's.
 */
export function CreateSystemDialog({ opened, onClose }: Props) {
  const [placeholder] = useState(() =>
    createPlay(
      { name: '', court: 'fiba', extent: 'full', lineup: 'empty', duration: NEW_PLAY_DURATION },
      {
        playId: crypto.randomUUID() as PlayId,
        rootBranchId: crypto.randomUUID() as BranchId,
        offense: [],
        defense: [],
      },
    ),
  );

  return (
    <EditorContextProvider initialPlay={placeholder}>
      <Handoff placeholderId={placeholder.id} opened={opened} onClose={onClose} />
    </EditorContextProvider>
  );
}
