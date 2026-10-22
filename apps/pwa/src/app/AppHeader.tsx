import { useState, type ReactNode } from 'react';
import { Anchor, Button, Group, Image, Menu, Title, type MantineSpacing } from '@mantine/core';
import { IconUser } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import wordmark from '../assets/phoopers.png';
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
      <Button
        component={Link}
        to="/signin"
        variant="light"
        color="gray"
        leftSection={<IconUser size={18} stroke={1.5} />}
      >
        {t('app.signIn', 'Sign in')}
      </Button>
    );
  }
  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <Button variant="light" color="gray" leftSection={<IconUser size={18} stroke={1.5} />}>
            {profile.data?.displayName ?? t('app.account', 'Account')}
          </Button>
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

export interface AppHeaderProps {
  /**
   * Controls that sit ahead of the wordmark, for a page whose own menu is the first thing a
   * coach reaches for — the editor's system menu.
   */
  leading?: ReactNode;
  /** Controls between the wordmark and the title, such as the editor's branch menu. */
  controls?: ReactNode;
  /**
   * What this page is looking at, when that is not the app itself — a system's name. Hidden below
   * `sm`, where the header has no room for it beside the controls: a page that passes one is
   * responsible for putting it somewhere a phone can still reach, as the editor does in its menu.
   */
  title?: string;
  /** The editor's own layout already pads the column the header sits in, so it passes 0. */
  p?: MantineSpacing;
}

/**
 * The one header every page wears: the wordmark, whatever the page puts beside it, the language
 * and the account.
 *
 * It exists because the editor drew a header of its own and that copy never grew an account
 * control, so a coach editing a system could neither see who they were signed in as nor sign out.
 * Anything added here from now on reaches every page by construction.
 */
export function AppHeader({ leading, controls, title, p = 'md' }: AppHeaderProps) {
  const { t } = useTranslation();

  return (
    <Group component="header" justify="space-between" align="center" gap="sm" p={p} style={{ flex: '0 0 auto' }}>
      <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
        {leading}
        <Anchor component={Link} to="/" underline="never" c="inherit" style={{ flex: '0 0 auto' }}>
          {/* The wordmark is the heading on every page, including the ones that pass a title:
              that title is hidden on a phone, and an `h1` that disappears with it would leave
              those pages with no heading at all. The alt text is the app's name, so the heading
              reads the same to a screen reader as it did when it was text. `lh={0}` stops the
              heading's line box adding space under an image that has none of its own. */}
          <Title order={1} size="h2" lh={0}>
            <Image src={wordmark} alt={t('app.name', 'phoopers')} h={32} w="auto" />
          </Title>
        </Anchor>
        {controls}
        {title !== undefined && (
          <Title
            order={2}
            visibleFrom="sm"
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {title}
          </Title>
        )}
      </Group>
      <Group gap="md" wrap="nowrap">
        <LanguageSwitcher />
        <AccountControl />
      </Group>
    </Group>
  );
}
