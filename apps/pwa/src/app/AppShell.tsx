import { useState } from 'react';
import { Anchor, Button, Group, Menu, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router';
import { DisplayNameDialog } from '../auth/DisplayNameDialog';
import { useAuthContext } from '../auth/useAuthContext';
import { useProfile } from '../auth/useProfile';
import { LanguageSwitcher } from '../i18n/LanguageSwitcher';

function AccountControl() {
  const { t } = useTranslation();
  const { status, configured, signOut } = useAuthContext();
  const profile = useProfile();
  // The dialog stays mounted and is re-keyed on every open, so its field starts from the current name.
  const [dialog, setDialog] = useState({ opened: false, openCount: 0 });

  if (!configured || status === 'loading') return null;
  if (status === 'signedOut') {
    return (
      <Button component={Link} to="/signin" variant="light">
        {t('app.signIn', 'Sign in')}
      </Button>
    );
  }
  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <Button variant="subtle">{profile.data?.displayName ?? t('app.account', 'Account')}</Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item onClick={() => setDialog((d) => ({ opened: true, openCount: d.openCount + 1 }))}>
            {t('auth.displayName.change', 'Change my display name')}
          </Menu.Item>
          <Menu.Item onClick={() => void signOut()}>{t('app.signOut', 'Sign out')}</Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <DisplayNameDialog
        key={dialog.openCount}
        opened={dialog.opened}
        initialName={profile.data?.displayName ?? ''}
        onDone={() => setDialog((d) => ({ ...d, opened: false }))}
        onClose={() => setDialog((d) => ({ ...d, opened: false }))}
      />
    </>
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
