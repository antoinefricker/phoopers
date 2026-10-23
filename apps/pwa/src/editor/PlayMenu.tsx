import { useState } from 'react';
import {
  ActionIcon,
  Alert,
  Box,
  Divider,
  Drawer,
  Group,
  Kbd,
  Loader,
  NavLink,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
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
 * with it. Controlled, for the same reason the branches menu beside it is — picking an entry has
 * to close the panel, which nothing but the state above can do.
 *
 * A drawer rather than a dropdown anchored to the burger: these entries act on the system as a
 * whole, and a panel that slides in over the court reads as leaving the court for a moment
 * rather than as a list hanging off a button. It comes in from the left, the edge the burger
 * sits at, so the movement starts where the hand just was.
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
      {/* An icon button, matching the branches control it shares the header line with, and a
          sibling of the drawer rather than a target, since a drawer is not anchored to
          anything. Nothing is written on it, so `aria-label` is the whole of its name. */}
      <ActionIcon
        variant="light"
        // Grey, not the primary: the colour marks what acts on the play — the transport, the
        // add button — and this one leaves the play alone, as the drawer's own entries do.
        color="gray"
        size={36}
        onClick={() => setOpened(true)}
        aria-label={t('play.menu.label', 'System menu')}
      >
        <IconMenu2 size={18} stroke={1.5} />
      </ActionIcon>
      <Drawer
        opened={opened}
        onClose={() => setOpened(false)}
        position="left"
        size="xs"
        padding="md"
        // No `title`: Mantine renders one as a heading, and the system's name is already the
        // header's own `h2`. A second element carrying it would make "the heading named X"
        // ambiguous to a screen reader and to a test alike — the same reason the name below is
        // plain text. The close button keeps its own label.
        aria-label={t('play.menu.label', 'System menu')}
        closeButtonProps={{ 'aria-label': t('play.menu.close', 'Close the system menu') }}
      >
        <Stack gap={0}>
          {/* The system's name, only where the header has had to drop it. Plain text and not a
                heading: the header's own `h2` stays in the DOM when CSS hides it, and a second
                element carrying the same name would make "the heading named X" ambiguous to a
                screen reader and to a test alike. */}
          <Text fw={600} hiddenFrom="sm" style={{ overflowWrap: 'anywhere' }}>
            {play.name}
          </Text>
          <Divider hiddenFrom="sm" />
          {/* NavLink, Mantine's own component for a list of entries down the side of a panel,
              rather than the full-width buttons this was while it hung off the burger: a drawer
              is where that component belongs, and it puts the label and its hint in the two
              sections it already has. `component="button"` because every one of these acts on
              the system — the default `a` with no href is reachable by neither tab nor Enter. */}
          {/* One entry, never two: the mode you are not in is the only one worth offering, and
              a pair would ask the coach to read which of them is already true. No glyph — an eye
              and a pencil said no more than the words beside them. */}
          {/* The entry carries the key it shares with `useModeShortcut`: a bare letter nobody
                is told about is a letter nobody presses. `aria-keyshortcuts` says the same thing
                to a screen reader, which cannot see the hint. */}
          <NavLink
            component="button"
            type="button"
            aria-keyshortcuts={MODE_SHORTCUT.aria}
            label={mode === 'play' ? t('play.menu.editMode', 'Edit mode') : t('play.menu.playMode', 'Play mode')}
            // Hidden from the accessibility tree: `aria-keyshortcuts` above already carries the
            // key, and leaving the hint in the name makes a screen reader read the entry as
            // "Edit mode E". The glyph is for the eyes that cannot be told by an attribute.
            rightSection={
              <Kbd size="xs" aria-hidden="true" style={{ whiteSpace: 'nowrap' }}>
                {t('play.menu.modeShortcut', 'Alt + Shift + E')}
              </Kbd>
            }
            onClick={pick(() => setMode(mode === 'play' ? 'edit' : 'play'))}
          />
          <Divider />
          <NavLink
            component="button"
            type="button"
            label={t('play.menu.create', 'Create a new system')}
            onClick={pick(() => setCreating((c) => ({ opened: true, count: c.count + 1 })))}
          />
          <Tooltip
            label={t('play.save.unavailable', 'Saving needs an account, which this app is not set up for')}
            disabled={!saving.disabled}
          >
            {/* `aria-disabled` and a guarded handler, not the native `disabled`: NavLink keeps
                its own `disabled` prop for styling and never forwards it to the element, so the
                attribute would not arrive. Announcing it this way also leaves the entry
                focusable, which is what lets the tooltip above explain why it cannot be used —
                the native attribute used to swallow those events and needed a wrapper span. */}
            <NavLink
              component="button"
              type="button"
              mod={{ disabled: saving.disabled }}
              aria-disabled={saving.disabled || undefined}
              aria-keyshortcuts={SAVE_SHORTCUT.aria}
              onClick={() => {
                if (saving.disabled) return;
                // An overwrite has no dialog to report in, so the drawer stays open to say how it went.
                if (saving.start()) setOpened(false);
              }}
              // The dot rides with the word rather than sitting at the far edge: it says
              // something about THIS entry — that there is something to save — and across the
              // gap it read as a third column of its own. A span, not Group's default div,
              // because it lives inside the entry's label.
              label={
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
              }
              // NavLink has no `loading` of its own, so the write in flight takes the place of
              // the chord: the hint is of no use while the only thing to do is wait.
              rightSection={
                saving.busy ? (
                  <Loader size="xs" />
                ) : (
                  <Kbd size="xs" aria-hidden="true" style={{ whiteSpace: 'nowrap' }}>
                    {t('play.menu.saveShortcut', 'Alt + Shift + S')}
                  </Kbd>
                )
              }
            />
          </Tooltip>
          {saving.overwriteFailed && (
            <Alert color="red" p="xs">
              {t('play.save.error', 'The system could not be saved. Your work is kept here; try again.')}
            </Alert>
          )}
        </Stack>
      </Drawer>
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
