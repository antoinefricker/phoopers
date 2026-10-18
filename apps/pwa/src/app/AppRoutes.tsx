import { useState } from 'react';
import { Container, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes } from 'react-router';
import { useAuthContext } from '../auth/useAuthContext';
import { DraftContextProvider } from '../draft/DraftContextProvider';
import { readDraft } from '../draft/draftStorage';
import type { BranchId, Play, PlayId, PlayerId } from '../engine';
import { EditorContextProvider, NEW_PLAY_DURATION } from '../editor/EditorContextProvider';
import { createPlay } from '../editor/mutations';
import { HomeScreen } from '../home/HomeScreen';
import { PlayView } from '../play2d/PlayView';
import { AppShell } from './AppShell';

/** A screen a later task fills in. It already says why it is empty when there is no server. */
function PendingScreen({ title }: { title: string }) {
  const { t } = useTranslation();
  const { configured } = useAuthContext();
  return (
    <Container size="lg" py="xl">
      <Title order={2}>{title}</Title>
      {!configured && (
        <Text c="dimmed" mt="sm">
          {t('app.notConfigured', 'This app is not configured with a Supabase project, so this screen is unavailable.')}
        </Text>
      )}
    </Container>
  );
}

const blankPlay = (): Play =>
  createPlay(
    { name: 'New system', court: 'fiba', extent: 'full', lineup: 'empty', duration: NEW_PLAY_DURATION },
    {
      playId: crypto.randomUUID() as PlayId,
      rootBranchId: crypto.randomUUID() as BranchId,
      offense: [] as PlayerId[],
      defense: [] as PlayerId[],
    },
  );

/**
 * The editor on the stored draft, or on a blank system. Task 13 replaces this with the real
 * `/play` and `/play/:id` screens; it exists so New system has somewhere to go.
 */
function DraftPlayRoute() {
  const [start] = useState(() => {
    const draft = readDraft();
    return draft ?? { play: blankPlay(), origin: null };
  });
  // Both providers read their initial value once, so each is keyed by the system's id.
  return (
    <EditorContextProvider key={start.play.id} initialPlay={start.play}>
      <DraftContextProvider key={start.play.id} initialOrigin={start.origin}>
        <PlayView />
      </DraftContextProvider>
    </EditorContextProvider>
  );
}

export function AppRoutes() {
  const { t } = useTranslation();
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomeScreen />} />
        <Route path="library" element={<PendingScreen title={t('home.public.title', 'Public systems')} />} />
        <Route path="mine" element={<PendingScreen title={t('home.mine.title', 'My systems')} />} />
        <Route path="signin" element={<PendingScreen title={t('app.signIn', 'Sign in')} />} />
        <Route path="auth/callback" element={<PendingScreen title={t('app.signIn', 'Sign in')} />} />
      </Route>
      {/* Outside the shell: the editor draws its own header and fills the window. */}
      <Route path="play" element={<DraftPlayRoute />} />
      <Route path="play/:id" element={<PendingScreen title={t('app.system', 'System')} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
