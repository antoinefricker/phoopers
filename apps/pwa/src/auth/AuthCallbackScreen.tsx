import { Alert, Button, Center, Loader, Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router';
import { DisplayNameDialog } from './DisplayNameDialog';
import { safeNext } from './safeNext';
import { useAuthContext } from './useAuthContext';
import { useProfile } from './useProfile';

/**
 * `/auth/callback`: where Google sends the coach back. It waits for the session, asks for a
 * display name when there is no profile yet, and only then goes on to `next`. The profile is
 * what a system's owner references, so the name is never skippable here.
 */
export function AuthCallbackScreen() {
  const { t } = useTranslation();
  const { status } = useAuthContext();
  const profile = useProfile();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));

  if (status === 'signedOut') return <Navigate to={`/signin?next=${encodeURIComponent(next)}`} replace />;
  if (profile.data) return <Navigate to={next} replace />;
  if (profile.isSuccess) return <DisplayNameDialog opened />;
  if (profile.isError) {
    return (
      <Center py="xl">
        <Stack align="center">
          <Alert color="red">{t('auth.callback.error', 'Your account could not be loaded.')}</Alert>
          <Button onClick={() => void profile.refetch()}>{t('auth.callback.retry', 'Try again')}</Button>
        </Stack>
      </Center>
    );
  }
  return (
    <Center py="xl">
      <Loader />
    </Center>
  );
}
