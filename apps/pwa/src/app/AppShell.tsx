import { Anchor, Button, Group, Menu, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router';
import { useAuthContext } from '../auth/useAuthContext';
import { useProfile } from '../auth/useProfile';
import { LanguageSwitcher } from '../i18n/LanguageSwitcher';

function AccountControl() {
  const { t } = useTranslation();
  const { status, configured, signOut } = useAuthContext();
  const profile = useProfile();

  if (!configured || status === 'loading') return null;
  if (status === 'signedOut') {
    return (
      <Anchor component={Link} to="/signin">
        {t('app.signIn', 'Sign in')}
      </Anchor>
    );
  }
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <Button variant="subtle">{profile.data?.displayName ?? t('app.account', 'Account')}</Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item onClick={() => void signOut()}>{t('app.signOut', 'Sign out')}</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

/** The header every page but the editor wears: the app's name, the language, and the way in or out. */
export function AppShell() {
  const { t } = useTranslation();
  return (
    <>
      <Group component="header" justify="space-between" p="md">
        <Anchor component={Link} to="/" underline="never" c="inherit">
          <Title order={1} size="h2">
            {t('app.name', 'phoopers')}
          </Title>
        </Anchor>
        <Group gap="md">
          <LanguageSwitcher />
          <AccountControl />
        </Group>
      </Group>
      <main>
        <Outlet />
      </main>
    </>
  );
}
