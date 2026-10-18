import { Button, Card, Container, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { useAuthContext } from '../auth/useAuthContext';
import { clearDraft, readDraft } from '../draft/draftStorage';

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
  // Read at render: the home screen is remounted on every visit, and a draft only changes in the editor.
  const hasDraft = readDraft() !== null;

  const startOver = () => {
    clearDraft();
    void navigate('/play');
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
            {hasDraft ? (
              <Stack gap="xs">
                <Button component={Link} to="/play" variant="light">
                  {t('home.new.continue', 'Continue the draft')}
                </Button>
                <Button variant="default" onClick={startOver}>
                  {t('home.new.startOver', 'Start a new system')}
                </Button>
              </Stack>
            ) : (
              <Button component={Link} to="/play" variant="light">
                {t('home.new.title', 'New system')}
              </Button>
            )}
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
    </Container>
  );
}
