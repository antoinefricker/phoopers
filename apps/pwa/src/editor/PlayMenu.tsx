import { useState } from 'react';
import { ActionIcon, Alert, Box, Button, Divider, Popover, Stack, Text, Tooltip } from '@mantine/core';
import { IconMenu2 } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { CreatePlayDialog } from './CreatePlayDialog';
import { SavePlayDialog } from './SavePlayDialog';
import { useEditorContext } from './useEditorContext';
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
  // The dialog stays mounted so Mantine's transitions survive, and its `key` changes on each
  // open so its fields reset on a fresh instance rather than through an effect.
  const [creating, setCreating] = useState({ opened: false, count: 0 });

  const pick = (act: () => void) => () => {
    setOpened(false);
    act();
  };

  return (
    <>
      <Popover opened={opened} onChange={setOpened} width={240} position="bottom-start" shadow="md" trapFocus>
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
            <Button
              variant="subtle"
              color="gray"
              fullWidth
              justify="flex-start"
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
                  justify="flex-start"
                  disabled={saving.disabled}
                  loading={saving.busy}
                  onClick={() => {
                    // An overwrite has no dialog to report in, so the menu stays open to say how it went.
                    if (saving.start()) setOpened(false);
                  }}
                  rightSection={
                    saving.isDirty ? (
                      <Box
                        component="span"
                        role="img"
                        aria-label={t('play.save.unsaved', 'Unsaved changes')}
                        w={8}
                        h={8}
                        bg="orange"
                        style={{ borderRadius: '50%' }}
                      />
                    ) : null
                  }
                >
                  {t('play.menu.save', 'Save')}
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
