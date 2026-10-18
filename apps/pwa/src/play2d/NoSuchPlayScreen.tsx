import { Button, Container, Group, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useAuthContext } from '../auth/useAuthContext';

/**
 * Shown for a system that does not exist and for a private one that is not the reader's, and says
 * the same thing for both: telling them apart would reveal that other coaches' private systems exist.
 */
export function NoSuchPlayScreen({ next }: { next: string }) {
  const { t } = useTranslation();
  const { status, configured } = useAuthContext();
  const invite = configured && status === 'signedOut';

  return (
    <Container size="xs" py="xl">
      <Stack align="center" gap="md" ta="center">
        <Title order={2}>{t('play.missing.title', 'No system at this address')}</Title>
        <Text>
          {t('play.missing.body', 'This system either does not exist or is private.')}
          {invite && ' ' + t('play.missing.invite', 'If it is yours, sign in to open it.')}
        </Text>
        <Group>
          {invite && (
            <Button component={Link} to={`/signin?next=${encodeURIComponent(next)}`}>
              {t('app.signIn', 'Sign in')}
            </Button>
          )}
          <Button component={Link} to="/" variant={invite ? 'default' : 'filled'}>
            {t('play.missing.home', 'Back to home')}
          </Button>
        </Group>
      </Stack>
    </Container>
  );
}
