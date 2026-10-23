import { useState, type ReactNode } from 'react';
import { ActionIcon, Divider, Drawer, Group, NavLink, Stack, Text, Tooltip } from '@mantine/core';
import { IconMenu2 } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { DisplayNameDialog } from '../auth/DisplayNameDialog';
import { useAuthContext } from '../auth/useAuthContext';
import { useProfile } from '../auth/useProfile';
import { CreateSystemDialog } from './CreateSystemDialog';
import { UnsavedDot } from './UnsavedDot';

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

  const close = () => setOpened(false);
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
      {/* Nothing is written on it, so `aria-label` is the whole of its name — and the dot adds
          its own, which is how the burger says there is something to save without opening. */}
      <ActionIcon
        variant="light"
        // Grey, not the primary: the colour marks what acts on the play — the transport, the
        // add button — and this one leaves the play alone, as the drawer's own entries do.
        color="gray"
        size={36}
        onClick={() => setOpened(true)}
        aria-label={dirty ? t('app.menu.labelUnsaved', 'Menu, with unsaved changes') : t('app.menu.label', 'Menu')}
      >
        <Group component="span" gap={4} wrap="nowrap">
          <IconMenu2 size={18} stroke={1.5} />
          {dirty && <UnsavedDot decorative />}
        </Group>
      </ActionIcon>
      <Drawer
        opened={opened}
        onClose={close}
        position="left"
        size="xs"
        padding="md"
        // No `title`: Mantine renders one as a heading, and on the editor the system's name is
        // already the header's own `h2`. The close button keeps its own label.
        aria-label={t('app.menu.label', 'Menu')}
        closeButtonProps={{ 'aria-label': t('app.menu.close', 'Close the menu') }}
      >
        <Stack gap={0}>
          {editing !== undefined && (
            <>
              <Divider label={t('app.menu.editing', 'Editing')} labelPosition="left" mb="xs" />
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
