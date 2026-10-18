import { useState } from 'react';
import { Container, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes } from 'react-router';
import { useAuthContext } from '../auth/useAuthContext';
import { DraftContextProvider } from '../draft/DraftContextProvider';
import { readDraft } from '../draft/draftStorage';
import { EditorContextProvider } from '../editor/EditorContextProvider';
import { HomeScreen } from '../home/HomeScreen';
import { MyPlaysScreen } from '../mine/MyPlaysScreen';
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

/**
 * The editor on the stored draft. Task 13 replaces this with the real `/play` and `/play/:id`
 * screens. With no draft there is nothing to open — a blank system is made by the creation
 * dialog, never here — so the way back is the home screen.
 */
function DraftPlayRoute() {
  const [start] = useState(readDraft);
  if (start === null) return <Navigate to="/" replace />;
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
        <Route path="mine" element={<MyPlaysScreen />} />
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
