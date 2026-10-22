import { useState } from 'react';
import { ActionIcon, Alert, Box, Button, Divider, Group, Kbd, Popover, Stack, Text, Tooltip } from '@mantine/core';
import { IconMenu2 } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { CreatePlayDialog } from './CreatePlayDialog';
import { SavePlayDialog } from './SavePlayDialog';
import { useEditorContext } from './useEditorContext';
import { MODE_SHORTCUT, SAVE_SHORTCUT } from './editorShortcuts';
import { useEditorShortcut } from './useEditorShortcut';
import { useSaveSystem } from './useSaveSystem';

/**
 * What a coach does to a system as a whole, rather than to what is on the court.
 *
 * Its entries are grey rather than the app's primary: the primary marks the controls that act on
 * the play — the transport, the add button — and a dropdown of plain choices that reached for it
 * too would spend the colour on something that is only a list.
 *
 * Shown in both modes, unlike the authoring controls: watching a system and editing one are both
 * things you arrive at from here, and a menu that vanished in play mode would take the way back
 * with it. Controlled like the branches menu beside it, for the same reason — picking an entry
 * has to close the dropdown, which an uncontrolled popover has no way to do.
 */
export function PlayMenu() {
  const { t } = useTranslation();
  const { play, mode, setMode } = useEditorContext();
  const [opened, setOpened] = useState(false);
  const saving = useSaveSystem();
  // Here, and not in a hook of its own beside the mode's: `useSaveSystem` holds the dialog's
  // state and this component renders the dialog, so a second instance anywhere else would open
  // one that nothing displays. Disabled while there is nothing to save to, or a write is already
  // in flight — a repeated chord must not start a second one.
  useEditorShortcut(
    SAVE_SHORTCUT,
    () => {
      if (saving.start()) setOpened(false);
    },
    !saving.disabled && !saving.busy,
  );
  // The dialog stays mounted so Mantine's transitions survive, and its `key` changes on each
  // open so its fields reset on a fresh instance rather than through an effect.
  const [creating, setCreating] = useState({ opened: false, count: 0 });

  const pick = (act: () => void) => () => {
    setOpened(false);
    act();
  };

  return (
    <>
      <Popover opened={opened} onChange={setOpened} width={260} position="bottom-start" shadow="md" trapFocus>
        <Popover.Target>
          <ActionIcon
            variant="default"
            size={36}
            onClick={() => setOpened((open) => !open)}
            aria-label={t('play.menu.label', 'System menu')}
          >
            <IconMenu2 size={18} stroke={1.5} />
          </ActionIcon>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs">
            {/* The system's name, only where the header has had to drop it. Plain text and not a
                heading: the header's own `h2` stays in the DOM when CSS hides it, and a second
                element carrying the same name would make "the heading named X" ambiguous to a
                screen reader and to a test alike. */}
            <Text fw={600} hiddenFrom="sm" style={{ overflowWrap: 'anywhere' }}>
              {play.name}
            </Text>
            <Divider hiddenFrom="sm" />
            {/* One entry, never two: the mode you are not in is the only one worth offering, and
              a pair would ask the coach to read which of them is already true. No glyph — an eye
              and a pencil said no more than the words beside them. */}
            {/* The entry carries the key it shares with `useModeShortcut`: a bare letter nobody
                is told about is a letter nobody presses. `aria-keyshortcuts` says the same thing
                to a screen reader, which cannot see the hint. */}
            <Button
              variant="subtle"
              color="gray"
              fullWidth
              // Not flex-start, unlike the entries with nothing on their right: this pushes the
              // hint to the far edge, so the two chords line up in a column rather than each
              // starting wherever its own label happens to end.
              justify="space-between"
              aria-keyshortcuts={MODE_SHORTCUT.aria}
              // Hidden from the accessibility tree: `aria-keyshortcuts` above already carries the
              // key, and leaving the hint in the name makes a screen reader read the entry as
              // "Edit mode E". The glyph is for the eyes that cannot be told by an attribute.
              rightSection={
                <Kbd size="xs" aria-hidden="true" style={{ whiteSpace: 'nowrap' }}>
                  {t('play.menu.modeShortcut', 'Alt + Shift + E')}
                </Kbd>
              }
              onClick={pick(() => setMode(mode === 'play' ? 'edit' : 'play'))}
            >
              {mode === 'play' ? t('play.menu.editMode', 'Edit mode') : t('play.menu.playMode', 'Play mode')}
            </Button>
            <Divider />
            <Button
              variant="subtle"
              color="gray"
              fullWidth
              justify="flex-start"
              onClick={pick(() => setCreating((c) => ({ opened: true, count: c.count + 1 })))}
            >
              {t('play.menu.create', 'Create a new system')}
            </Button>
            <Tooltip
              label={t('play.save.unavailable', 'Saving needs an account, which this app is not set up for')}
              disabled={!saving.disabled}
            >
              {/* Mantine needs the disabled control wrapped for the tooltip to receive events. */}
              <span>
                <Button
                  variant="subtle"
                  color="gray"
                  fullWidth
                  justify="space-between"
                  disabled={saving.disabled}
                  loading={saving.busy}
                  onClick={() => {
                    // An overwrite has no dialog to report in, so the menu stays open to say how it went.
                    if (saving.start()) setOpened(false);
                  }}
                  aria-keyshortcuts={SAVE_SHORTCUT.aria}
                  // Hidden from the accessibility tree for the reason the mode entry's is:
                  // `aria-keyshortcuts` already carries the chord.
                  rightSection={
                    <Kbd size="xs" aria-hidden="true" style={{ whiteSpace: 'nowrap' }}>
                      {t('play.menu.saveShortcut', 'Alt + Shift + S')}
                    </Kbd>
                  }
                >
                  {/* The dot rides with the word rather than sitting at the far edge: it says
                      something about THIS entry — that there is something to save — and across
                      the gap it read as a third column of its own. A span, not Group's default
                      div, because it lives inside the button's label. */}
                  <Group component="span" gap={6} wrap="nowrap">
                    {t('play.menu.save', 'Save')}
                    {saving.isDirty && (
                      <Box
                        component="span"
                        role="img"
                        aria-label={t('play.save.unsaved', 'Unsaved changes')}
                        w={8}
                        h={8}
                        bg="orange"
                        style={{ borderRadius: '50%' }}
                      />
                    )}
                  </Group>
                </Button>
              </span>
            </Tooltip>
            {saving.overwriteFailed && (
              <Alert color="red" p="xs">
                {t('play.save.error', 'The system could not be saved. Your work is kept here; try again.')}
              </Alert>
            )}
          </Stack>
        </Popover.Dropdown>
      </Popover>
      {/* Prefixed per dialog, not the bare counter: both counters start at 0, so two siblings
          carried the key `0` and React warned about it on every render of the editor. */}
      <SavePlayDialog key={`save-${saving.dialogKey}`} {...saving.dialogProps} />
      <CreatePlayDialog
        key={`create-${creating.count}`}
        opened={creating.opened}
        onClose={() => setCreating((c) => ({ ...c, opened: false }))}
      />
    </>
  );
}
