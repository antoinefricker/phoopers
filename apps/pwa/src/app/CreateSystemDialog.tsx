import { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { writeDraft } from '../draft/draftStorage';
import type { BranchId, PlayId } from '../engine';
import { CreatePlayDialog } from '../editor/CreatePlayDialog';
import { EditorContextProvider, NEW_PLAY_DURATION } from '../editor/EditorContextProvider';
import { createPlay } from '../editor/mutations';
import { EditorContext, useEditorContext } from '../editor/useEditorContext';

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

  // Nothing is open away from the editor, so there is no warning to give about discarding it.
  return <CreatePlayDialog opened={opened} onClose={onClose} hideDiscardWarning />;
}

/**
 * Creating a system, from wherever the coach asked for one.
 *
 * The menu offers it on every page, but the two places it is asked from want different things.
 * In the editor there is a system open and the new one replaces it, through the editor context
 * that is already there — anything else would leave the coach looking at the old system. Away
 * from it there is no context at all, so this hosts a throwaway one: the placeholder is never
 * drawn or stored, and the first play that replaces it becomes the draft, which `/play` opens.
 *
 * Read with `useContext` rather than `useEditorContext`: having no editor is the ordinary case
 * here, not a mistake, and the hook is right to throw for everyone else.
 */
export function CreateSystemDialog({ opened, onClose }: Props) {
  const editor = useContext(EditorContext);
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

  // The warning belongs to this branch alone: there is a system open, and it is about to go.
  if (editor !== null) return <CreatePlayDialog opened={opened} onClose={onClose} />;

  return (
    <EditorContextProvider initialPlay={placeholder}>
      <Handoff placeholderId={placeholder.id} opened={opened} onClose={onClose} />
    </EditorContextProvider>
  );
}
