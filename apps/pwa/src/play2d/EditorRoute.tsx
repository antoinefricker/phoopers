import { useEffect, useRef, useState } from 'react';
import { Alert, Center, Container, Loader } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { DraftContextProvider } from '../draft/DraftContextProvider';
import { fingerprint, isUnsaved, readDraft, type Draft } from '../draft/draftStorage';
import { EditorContextProvider } from '../editor/EditorContextProvider';
import { useEditorContext } from '../editor/useEditorContext';
import type { PlayId } from '../engine';
import { useStoredPlay } from '../plays/usePlays';
import { NoSuchPlayScreen } from './NoSuchPlayScreen';
import { PlayView } from './PlayView';

/**
 * Keeps the address naming the system that is open. Creating a new system inside the editor
 * replaces the play under the providers; `/play/:id` would then name a system nobody is editing,
 * and a reload there would throw the new one away. `/play` names whatever the draft holds.
 */
function AddressFollowsPlay({ openedId }: { openedId: PlayId }) {
  const { play } = useEditorContext();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const followed = useRef(openedId);

  useEffect(() => {
    if (play.id === followed.current) return;
    followed.current = play.id;
    if (pathname !== '/play') void navigate('/play', { replace: true });
  }, [play.id, pathname, navigate]);

  return null;
}

/** Both providers read their initial value once, so each is keyed by the system's id. */
function Editor({ start }: { start: Draft }) {
  return (
    <EditorContextProvider key={start.play.id} initialPlay={start.play}>
      <DraftContextProvider key={start.play.id} initialOrigin={start.origin}>
        <AddressFollowsPlay openedId={start.play.id} />
        <PlayView />
      </DraftContextProvider>
    </EditorContextProvider>
  );
}

/** `/play`: the editor on the stored draft. With none there is nothing to open, so home. */
export function DraftEditorRoute() {
  const [start] = useState(readDraft);
  if (start === null) return <Navigate to="/" replace />;
  return <Editor start={start} />;
}

/**
 * `/play/:id`: a stored system, opened in the full editor for anyone who may read it. Unsaved
 * changes to this very system, left in the draft, win over the server's copy; any other draft
 * is replaced by what is fetched.
 */
export function StoredEditorRoute() {
  const { id } = useParams();
  // Keyed by the address so a draft is read afresh for every system opened.
  return <StoredEditor key={id} id={id as PlayId} />;
}

function StoredEditor({ id }: { id: PlayId }) {
  const { t } = useTranslation();
  const [held] = useState(readDraft);
  const stored = useStoredPlay(id);
  // Once an editor has been shown, later query states (a refocus refetch that fails or comes back
  // empty) must not swap it out from under the coach: the first resolved start is kept.
  const [latched, setLatched] = useState<Draft | null>(null);

  let start = latched;
  if (start === null) {
    if (held !== null && held.play.id === id && isUnsaved(held)) start = held;
    else if (stored.data) {
      const { play, ownerId, isPublic } = stored.data;
      start = { play, origin: { playId: play.id, ownerId, isPublic, fingerprint: fingerprint(play) } };
    }
    if (start !== null) setLatched(start);
  }
  if (start !== null) return <Editor start={start} />;

  if (stored.isPending) {
    return (
      <Center h="100vh">
        <Loader aria-label={t('play.loading', 'Loading the system')} />
      </Center>
    );
  }
  if (stored.isError) {
    return (
      <Container size="xs" py="xl">
        <Alert color="red">{t('play.loadError', 'Something went wrong. Please try again.')}</Alert>
      </Container>
    );
  }
  return <NoSuchPlayScreen next={`/play/${id}`} />;
}
