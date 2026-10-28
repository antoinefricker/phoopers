import { useState, type ReactNode } from 'react';
import { ActionIcon, Divider, Drawer, Image, NavLink, Stack, Text, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconChevronRight, IconMenu2 } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import wordmark from '../assets/phoopers.png';
import { DisplayNameDialog } from '../auth/DisplayNameDialog';
import { useAuthContext } from '../auth/useAuthContext';
import { useProfile } from '../auth/useProfile';
import { DRAWER_HEADER_STYLES } from '../settings/drawerHeader';
import { SettingsDrawer } from '../settings/SettingsDrawer';
import { CreateSystemDialog } from './CreateSystemDialog';
import { UnsavedIndicator } from './UnsavedIndicator';

/** What Mantine's `xs` drawer measures, named so the settings drawer can sit exactly beside it. */
const MENU_DRAWER_SIZE = '20rem';

/** Two drawers of that width side by side: 40em. Under it this is a phone, and the drawers overlap. */
const BOTH_DRAWERS_FIT = '(min-width: 40em)';

// Mantine's own modal layer is 200. The menu keeps it; its overlay drops two below and the
// settings drawer sits between, so the page is dimmed under the settings and the settings slide
// out from behind the menu. Left to the defaults all three share a layer and the last rendered
// wins, which put the settings over the menu and the overlay over both.
const MENU_Z_INDEX = 200;

export interface AppMenuProps {
  /**
   * The page's own group, shown above Navigation — the editor's, today.
   *
   * A render prop rather than a node, because every entry has to close the drawer and only this
   * component holds that state. A page without one passes nothing and the group is absent.
   */
  editing?: (close: () => void) => ReactNode;
  /**
   * True when the page has something unsaved, which puts a dot on the burger.
   *
   * A prop rather than a hook of this component's own: `useDraftContext` throws outside its
   * provider, which is every page but the editor. The one place that knows passes it down.
   */
  dirty?: boolean;
  /**
   * Whether the drawer is open, for a page that has to close it from outside an entry — the
   * editor's save chord, which fires while the drawer is not even rendered. Left out, the menu
   * keeps its own state, which is every other page.
   */
  opened?: boolean;
  onOpenedChange?: (opened: boolean) => void;
}

/**
 * The one menu, on every page: where a coach goes, and who they are signed in as.
 *
 * It grew out of the editor's system menu, which was the only way around the app and existed on
 * the only page that did not need it — from the library or the home screen there was nothing to
 * press. Moving it into the header every page wears makes "where do I go?" have one answer, and
 * leaves the editor with just its own group to contribute.
 *
 * A drawer rather than a dropdown: these entries leave the page rather than act on it, and a
 * panel sliding in over what you were looking at reads as that. It comes in from the left, the
 * edge the burger sits at, so the movement starts where the hand just was.
 */
export function AppMenu({ editing, dirty = false, opened: controlled, onOpenedChange }: AppMenuProps) {
  const { t } = useTranslation();
  const { status, configured, signOut } = useAuthContext();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const profile = useProfile();
  const [uncontrolled, setUncontrolled] = useState(false);
  const opened = controlled ?? uncontrolled;
  const setOpened = (next: boolean) => {
    setUncontrolled(next);
    onOpenedChange?.(next);
  };
  // Both dialogs stay mounted so Mantine's transitions survive; each `key` changes on every open
  // so their fields reset on a fresh instance rather than through an effect.
  const [creating, setCreating] = useState({ opened: false, count: 0 });
  const [naming, setNaming] = useState({ opened: false, count: 0 });
  const [settingsOpened, setSettingsOpened] = useState(false);
  // Beside the menu when two drawers fit across the screen, over it when they do not.
  const roomForBoth = useMediaQuery(BOTH_DRAWERS_FIT) ?? false;

  const close = () => {
    setSettingsOpened(false);
    setOpened(false);
  };
  /** Every entry closes the drawer: a panel left open over the page it just left is in the way. */
  const pick = (act: () => void) => () => {
    close();
    act();
  };
  const go = (to: string) => pick(() => void navigate(to));

  const signedIn = status === 'signedIn';
  // Nothing of the coach's own exists without a session, and nothing at all without a project.
  const mineUnavailable = !configured || status !== 'signedIn';

  return (
    <>
      {/* The mark rides on the corner of the burger rather than inside it, so the glyph keeps
          its own room. It is decorative, so the button's `aria-label` is what says there is
          something to save — which is how the burger says it without being opened. */}
      <UnsavedIndicator dirty={dirty}>
        <ActionIcon
          variant="light"
          // Grey, not the primary: the colour marks what acts on the play — the transport, the
          // add button — and this one leaves the play alone, as the drawer's own entries do.
          color="gray"
          size={36}
          onClick={() => setOpened(true)}
          aria-label={dirty ? t('app.menu.labelUnsaved', 'Menu, with unsaved changes') : t('app.menu.label', 'Menu')}
        >
          <IconMenu2 size={18} stroke={1.5} />
        </ActionIcon>
      </UnsavedIndicator>
      <Drawer
        opened={opened}
        onClose={close}
        // While the settings are open beside it, they own the keyboard: Escape closes them, not
        // both, and two focus traps would take focus back from each other.
        closeOnEscape={!settingsOpened}
        trapFocus={!settingsOpened}
        position="left"
        size={MENU_DRAWER_SIZE}
        zIndex={MENU_Z_INDEX}
        overlayProps={{ zIndex: MENU_Z_INDEX - 2 }}
        padding="md"
        // The wordmark is the title, as it is the header's: the page behind it is dimmed, and
        // this says whose menu it is. The ✕ is for a phone only: beside the page the overlay and
        // Escape close it, and the arrow in the settings drawer's header goes back, but where the
        // drawer fills the screen there is little overlay left to press.
        title={<Image src={wordmark} alt={t('app.name', 'phoopers')} h={28} w="auto" />}
        withCloseButton={!roomForBoth}
        closeButtonProps={{ 'aria-label': t('app.menu.close', 'Close the menu') }}
        styles={DRAWER_HEADER_STYLES}
      >
        <Stack gap={0}>
          {editing !== undefined && (
            <>
              <Divider label={t('app.menu.editing', 'Editing')} labelPosition="left" my="xs" />
              {editing(close)}
            </>
          )}
          <Divider label={t('app.menu.navigation', 'Navigation')} labelPosition="left" my="xs" />
          {/* NavLink, Mantine's own component for a list of entries down the side of a panel.
              `component="button"` because these act rather than link: the default `a` with no
              href is reachable by neither tab nor Enter. */}
          <NavLink
            component="button"
            type="button"
            label={t('app.menu.create', 'Create a new system')}
            onClick={pick(() => setCreating((c) => ({ opened: true, count: c.count + 1 })))}
          />
          <Tooltip
            label={t('app.menu.needsProject', 'This needs an account, which this app is not set up for')}
            disabled={configured}
          >
            <NavLink
              component="button"
              type="button"
              mod={{ disabled: !configured }}
              aria-disabled={!configured || undefined}
              label={t('app.menu.browse', 'Browse systems')}
              onClick={configured ? go('/library') : undefined}
            />
          </Tooltip>
          <Tooltip
            label={
              configured
                ? t('app.menu.mineNeedsAccount', 'Sign in to see your systems')
                : t('app.menu.needsProject', 'This needs an account, which this app is not set up for')
            }
            disabled={!mineUnavailable}
          >
            {/* `aria-disabled` and no handler, not the native `disabled`: NavLink keeps its own
                `disabled` prop for styling and never forwards it to the element, so the attribute
                would not arrive. Announcing it this way also leaves the entry focusable, which is
                what lets the tooltip above explain why it cannot be used. */}
            <NavLink
              component="button"
              type="button"
              mod={{ disabled: mineUnavailable }}
              aria-disabled={mineUnavailable || undefined}
              label={t('app.menu.mine', 'My systems')}
              onClick={mineUnavailable ? undefined : go('/mine')}
            />
          </Tooltip>
          <NavLink
            component="button"
            type="button"
            label={t('app.menu.settings', 'Settings')}
            // Not `pick`: this entry goes one level deeper rather than leaving, so the menu stays
            // open underneath. The chevron is what says so.
            rightSection={<IconChevronRight size={14} stroke={1.5} />}
            onClick={() => setSettingsOpened(true)}
          />
          <Divider label={t('app.menu.account', 'Account')} labelPosition="left" my="xs" />
          {!configured ? (
            <Text size="sm" c="dimmed" px="sm">
              {t('app.menu.noAccounts', 'This app is not set up with a project, so there are no accounts.')}
            </Text>
          ) : signedIn ? (
            <>
              <NavLink
                component="button"
                type="button"
                label={t('app.menu.profile', 'My information')}
                description={profile.data?.displayName}
                onClick={pick(() => setNaming((n) => ({ opened: true, count: n.count + 1 })))}
              />
              <NavLink
                component="button"
                type="button"
                label={t('app.signOut', 'Sign out')}
                onClick={pick(() => void signOut())}
              />
            </>
          ) : (
            <NavLink
              component="button"
              type="button"
              mod={{ disabled: status === 'loading' }}
              aria-disabled={status === 'loading' || undefined}
              label={t('app.signIn', 'Sign in')}
              // Back to where the coach was: signing in is rarely the thing they came to do.
              onClick={status === 'loading' ? undefined : go(`/signin?next=${encodeURIComponent(pathname)}`)}
            />
          )}
        </Stack>
      </Drawer>
      {/* Open only while the menu is: closing the menu from outside, as the editor's save chord
          does, must not leave this one behind. */}
      <SettingsDrawer
        opened={opened && settingsOpened}
        onClose={() => setSettingsOpened(false)}
        inset={roomForBoth ? MENU_DRAWER_SIZE : undefined}
        // Under the menu so it slides out from behind it; over it on a phone, where it covers the
        // menu instead of sitting beside it and would otherwise open out of sight.
        zIndex={roomForBoth ? MENU_Z_INDEX - 1 : MENU_Z_INDEX + 1}
        withCloseButton={!roomForBoth}
      />
      <CreateSystemDialog
        key={`create-${creating.count}`}
        opened={creating.opened}
        onClose={() => setCreating((c) => ({ ...c, opened: false }))}
      />
      <DisplayNameDialog
        key={`name-${naming.count}`}
        opened={naming.opened}
        initialName={profile.data?.displayName ?? ''}
        onDone={() => setNaming((n) => ({ ...n, opened: false }))}
        onClose={() => setNaming((n) => ({ ...n, opened: false }))}
      />
    </>
  );
}
