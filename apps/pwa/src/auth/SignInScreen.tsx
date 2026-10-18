import { useState } from 'react';
import { Alert, Button, Container, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { safeNext } from './safeNext';
import { useAuthContext } from './useAuthContext';

/** `/signin`: Google is the only way in, so the screen is one button. */
export function SignInScreen() {
  const { t } = useTranslation();
  const { configured, signInWithGoogle } = useAuthContext();
  const [params] = useSearchParams();
  const [failed, setFailed] = useState(false);
  const next = safeNext(params.get('next'));

  const submit = () => {
    setFailed(false);
    signInWithGoogle(next).catch(() => setFailed(true));
  };

  return (
    <Container size="xs" py="xl">
      <Stack align="center" gap="md" ta="center">
        <Title order={2}>{t('app.signIn', 'Sign in')}</Title>
        {configured ? (
          <>
            <Text>{t('auth.signIn.purpose', 'To save your systems and find them again anywhere')}</Text>
            <Button size="md" onClick={submit}>
              {t('auth.signIn.google', 'Continue with Google')}
            </Button>
            {failed && <Alert color="red">{t('auth.signIn.error', 'Signing in failed. Try again in a moment.')}</Alert>}
            <Text size="sm" c="dimmed">
              {t('auth.signIn.reassurance', 'No password to remember, and nothing is published without your consent.')}
            </Text>
          </>
        ) : (
          <Text c="dimmed">
            {t(
              'app.notConfigured',
              'This app is not configured with a Supabase project, so this screen is unavailable.',
            )}
          </Text>
        )}
      </Stack>
    </Container>
  );
}
