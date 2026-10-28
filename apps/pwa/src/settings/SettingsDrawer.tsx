import { ActionIcon, Divider, Drawer, Group, Stack, Switch } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { DRAWER_HEADER_STYLES } from './drawerHeader';
import { useSettingsContext } from './useSettingsContext';

interface Props {
  opened: boolean;
  onClose: () => void;
  /**
   * How far from the left edge the drawer starts: the width of the menu it opens beside. Left
   * out, it starts at the edge and covers the menu, which is what a screen too narrow for both
   * needs.
   */
  inset?: string;
  /** Whether to show the ✕: on a phone, where nothing else says how to leave. */
  withCloseButton?: boolean;
  /** The layer it sits on: under the menu's, so it slides out from behind it. */
  zIndex?: number;
}

/**
 * Every setting a coach can change, one group per area, in a drawer that opens beside the menu it
 * was opened from. A change applies as it is made, so there is nothing to confirm.
 *
 * Two drawers side by side rather than a `Drawer.Stack`: the stack hides the drawer below the
 * top one (measured: opacity 0), so the menu would vanish behind its own sub-drawer. This one
 * draws no overlay of its own, because the menu's already dims the page, and sits on a layer
 * under the menu's: it slides in from the edge, so it comes out from behind the menu, which
 * keeps its place on the left. The host turns its own Escape handling and focus trap off while this is
 * open, so each gesture reaches only this one.
 */
export function SettingsDrawer({ opened, onClose, inset, zIndex, withCloseButton = false }: Props) {
  const { t } = useTranslation();

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="left"
      size="xs"
      padding="md"
      withOverlay={false}
      zIndex={zIndex}
      closeButtonProps={{ 'aria-label': t('settings.close', 'Close the settings') }}
      styles={{ ...DRAWER_HEADER_STYLES, inner: { paddingInlineStart: inset } }}
      title={
        <Group gap="xs">
          {/* The ✕ is there too, but alone it reads as closing everything; the arrow says that
              this goes back to the menu. */}
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={onClose}
            aria-label={t('settings.back', 'Back to the menu')}
          >
            <IconArrowLeft size={18} stroke={1.5} />
          </ActionIcon>
          {t('settings.title', 'Settings')}
        </Group>
      }
      withCloseButton={withCloseButton}
    >
      <SettingsGroups />
    </Drawer>
  );
}

// Its own component so the context is read only while the drawer is open: Mantine mounts a
// drawer's children on open, and the menu that hosts it is also rendered where no settings
// provider is.
//
// Built like the menu: a group label over a list of rows, so the two drawers read as one kind of
// thing. A new area of settings is a new group below, not a new tab.
function SettingsGroups() {
  const { t } = useTranslation();
  const { settings, setSetting } = useSettingsContext();

  return (
    <Stack gap={0}>
      <Divider label={t('settings.groups.editing', 'Editing')} labelPosition="left" my="xs" />
      <Switch
        px="sm"
        py="xs"
        label={t('settings.showHitAreas.label', 'Outline reactive areas')}
        description={t(
          'settings.showHitAreas.description',
          'Outlines the token under the pointer on the court, so you can see where a press lands.',
        )}
        checked={settings.showHitAreas}
        onChange={(event) => setSetting('showHitAreas', event.currentTarget.checked)}
      />
    </Stack>
  );
}
