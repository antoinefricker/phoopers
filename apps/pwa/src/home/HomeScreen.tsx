import { useState } from 'react';
import { Button, Card, Container, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { useAuthContext } from '../auth/useAuthContext';
import { readDraft } from '../draft/draftStorage';
import { CreateSystemDialog } from './CreateSystemDialog';
import { ResumeDraftDialog } from './ResumeDraftDialog';

interface DoorProps {
  title: string;
  description: string;
  children?: React.ReactNode;
}

/** One of the three ways in. They are equal on purpose: none is the primary action. */
function Door({ title, description, children }: DoorProps) {
  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="sm" h="100%" justify="space-between">
        <Stack gap="xs">
          <Title order={2} size="h3">
            {title}
          </Title>
          <Text c="dimmed">{description}</Text>
        </Stack>
        {children}
      </Stack>
    </Card>
  );
}

export function HomeScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { status, configured } = useAuthContext();
  // Both dialogs stay mounted so Mantine's transitions survive; each `key` changes on every open
  // so their fields reset on a fresh instance rather than through an effect.
  const [resume, setResume] = useState({ opened: false, count: 0, name: '' });
  const [creating, setCreating] = useState({ opened: false, count: 0 });

  const openCreating = () => setCreating((c) => ({ opened: true, count: c.count + 1 }));

  // The draft is read when asked, not at render: it changes in the editor, not on this screen.
  const startSystem = () => {
    const draft = readDraft();
    if (draft === null) {
      openCreating();
      return;
    }
    setResume((r) => ({ opened: true, count: r.count + 1, name: draft.play.name }));
  };

  const startNew = () => {
    setResume((r) => ({ ...r, opened: false }));
    openCreating();
  };

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <SimpleGrid cols={{ base: 1, md: 3 }}>
          <Door
            title={t('home.new.title', 'New system')}
            description={t(
              'home.new.description',
              'Draw a system from a blank court. Nothing is saved until you sign in.',
            )}
          >
            <Button variant="light" onClick={startSystem}>
              {t('home.new.title', 'New system')}
            </Button>
          </Door>
          <Door
            title={t('home.public.title', 'Public systems')}
            description={t('home.public.description', 'Browse the systems other coaches have shared.')}
          >
            {configured && (
              <Button component={Link} to="/library" variant="light">
                {t('home.public.open', 'Browse public systems')}
              </Button>
            )}
          </Door>
          <Door
            title={t('home.mine.title', 'My systems')}
            description={t('home.mine.description', 'The systems you have saved, public or private.')}
          >
            {configured &&
              (status === 'signedIn' ? (
                <Button component={Link} to="/mine" variant="light">
                  {t('home.mine.open', 'Open my systems')}
                </Button>
              ) : (
                <Button
                  component={Link}
                  to={`/signin?next=${encodeURIComponent('/mine')}`}
                  variant="light"
                  disabled={status === 'loading'}
                >
                  {t('home.mine.signIn', 'Sign in to see your systems')}
                </Button>
              ))}
          </Door>
        </SimpleGrid>
        {!configured && (
          <Text c="dimmed" ta="center">
            {t(
              'home.notConfigured',
              'This app is not configured with a Supabase project, so public and saved systems are unavailable. You can still draw a system.',
            )}
          </Text>
        )}
      </Stack>
      <ResumeDraftDialog
        key={`resume-${resume.count}`}
        opened={resume.opened}
        name={resume.name}
        onResume={() => void navigate('/play')}
        onStartNew={startNew}
        onClose={() => setResume((r) => ({ ...r, opened: false }))}
      />
      <CreateSystemDialog
        key={`create-${creating.count}`}
        opened={creating.opened}
        onClose={() => setCreating((c) => ({ ...c, opened: false }))}
      />
    </Container>
  );
}
