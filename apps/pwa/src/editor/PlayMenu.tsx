import { useState } from 'react';
import { Alert, Divider, Kbd, Loader, NavLink, Text, Tooltip, VisuallyHidden } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { AppMenu } from '../app/AppMenu';
import { UnsavedIndicator } from '../app/UnsavedIndicator';
import { usePlaybackContext } from '../play2d/usePlaybackContext';
import { ConfirmDelete } from './ConfirmDelete';
import { SavePlayDialog } from './SavePlayDialog';
import { useEditorContext } from './useEditorContext';
import { MODE_SHORTCUT, SAVE_SHORTCUT } from './editorShortcuts';
import { useEditorShortcut } from './useEditorShortcut';
import { useSaveSystem } from './useSaveSystem';

/**
 * What a coach does to the system they have open, rather than to where they are in the app.
 *
 * It is the Editing group of the app's one menu, not a menu of its own: navigation and the
 * account are the same everywhere, and the editor only adds the three things that need a system
 * to act on. The mode entry is in the group in both modes — it is the way back from watching,
 * and hiding it with the rest would leave the keyboard chord as the only way in. Clearing and
 * saving are authoring, so they are offered only while authoring.
 *
 * Its entries are grey rather than the app's primary: the primary marks the controls that act on
 * the play — the transport, the add button — and a list of plain choices that reached for it too
 * would spend the colour on something that is only a list.
 */
export function PlayMenu() {
  const { t } = useTranslation();
  const { play, mode, setMode, clearPlay } = useEditorContext();
  const { selectBranch, seek } = usePlaybackContext();
  // Owned here rather than inside `AppMenu`: the save chord fires while the drawer is closed
  // and has to be able to close it, and a callback handed out during a render cannot do that.
  const [opened, setOpened] = useState(false);
  const saving = useSaveSystem();
  // Offered in both modes — saving the work is not authoring it — but there is nothing to do
  // when a save would write nothing, or when there is nowhere to write it.
  const cannotSave = saving.disabled || saving.upToDate;
  // Here, and not in a hook of its own beside the mode's: `useSaveSystem` holds the dialog's
  // state and this component renders the dialog, so a second instance anywhere else would open
  // one that nothing displays. Disabled while there is nothing to save to, or a write is already
  // in flight — a repeated chord must not start a second one.
  useEditorShortcut(
    SAVE_SHORTCUT,
    () => {
      if (saving.start()) setOpened(false);
    },
    !cannotSave && !saving.busy,
  );
  // The dialog stays mounted so Mantine's transitions survive, and its `key` changes on each
  // open so it starts from a fresh instance rather than through an effect.
  const [clearing, setClearing] = useState({ opened: false, count: 0 });

  const clear = () => {
    clearPlay();
    // Nothing remounts — it is the same system — so the branch on screen has to be put back by
    // hand, exactly as deleting the branch you are watching does. The variants are all gone.
    selectBranch(play.rootBranchId);
    seek(0);
    setClearing((c) => ({ ...c, opened: false }));
  };

  return (
    <>
      <AppMenu
        dirty={saving.isDirty}
        opened={opened}
        onOpenedChange={setOpened}
        editing={(close) => {
          const pick = (act: () => void) => () => {
            close();
            act();
          };

          return (
            <>
              {/* The system's name, only where the header has had to drop it. Plain text and not
                  a heading: the header's own `h2` stays in the DOM when CSS hides it, and a
                  second element carrying the same name would make "the heading named X"
                  ambiguous to a screen reader and to a test alike. */}
              <Text fw={600} hiddenFrom="sm" style={{ overflowWrap: 'anywhere' }}>
                {play.name}
              </Text>
              <Divider hiddenFrom="sm" />
              {/* NavLink, Mantine's own component for a list of entries down the side of a
                  panel. `component="button"` because every one of these acts on the system — the
                  default `a` with no href is reachable by neither tab nor Enter. */}
              {/* One entry, never two: the mode you are not in is the only one worth offering,
                  and a pair would ask the coach to read which of them is already true. No glyph
                  — an eye and a pencil said no more than the words beside them. */}
              {/* The entry carries the key it shares with `useModeShortcut`: a bare chord nobody
                  is told about is a chord nobody presses. `aria-keyshortcuts` says the same thing
                  to a screen reader, which cannot see the hint. */}
              <NavLink
                component="button"
                type="button"
                aria-keyshortcuts={MODE_SHORTCUT.aria}
                label={mode === 'play' ? t('play.menu.editMode', 'Edit mode') : t('play.menu.playMode', 'Play mode')}
                // Hidden from the accessibility tree: `aria-keyshortcuts` above already carries
                // the key, and leaving the hint in the name makes a screen reader read the entry
                // as "Edit mode Alt + Shift + E". The glyph is for the eyes an attribute cannot
                // reach.
                rightSection={
                  <Kbd size="xs" aria-hidden="true" style={{ whiteSpace: 'nowrap' }}>
                    {t('play.menu.modeShortcut', 'Alt + Shift + E')}
                  </Kbd>
                }
                onClick={pick(() => setMode(mode === 'play' ? 'edit' : 'play'))}
              />
              <Tooltip
                label={
                  saving.disabled
                    ? t('play.save.unavailable', 'Saving needs an account, which this app is not set up for')
                    : t('play.save.upToDate', 'Everything is saved')
                }
                disabled={!cannotSave}
              >
                {/* `aria-disabled` and a guarded handler, not the native `disabled`: NavLink
                      keeps its own `disabled` prop for styling and never forwards it to the
                      element, so the attribute would not arrive. Announcing it this way also
                      leaves the entry focusable, which is what lets the tooltip above explain
                      why it cannot be used — the native attribute used to swallow those events
                      and needed a wrapper span. */}
                <NavLink
                  component="button"
                  type="button"
                  mod={{ disabled: cannotSave }}
                  aria-disabled={cannotSave || undefined}
                  aria-keyshortcuts={SAVE_SHORTCUT.aria}
                  // NavLink's body clips, so that a long label truncates with an ellipsis
                  // rather than pushing the chord off the entry. The unsaved mark hangs a
                  // few pixels above the word it sits on, which that clipping cut in half.
                  // This label is one short word and has nothing to truncate.
                  styles={{ body: { overflow: 'visible' } }}
                  onClick={() => {
                    if (cannotSave) return;
                    // An overwrite has no dialog to report in, so the drawer stays open to
                    // say how it went.
                    if (saving.start()) close();
                  }}
                  // The mark rides on the word rather than sitting at the far edge: it says
                  // something about THIS entry — that there is something to save — and across
                  // the gap it read as a third column of its own. The indicator is
                  // decorative, so the words beside it are what a screen reader is told.
                  label={
                    <UnsavedIndicator dirty={saving.isDirty} inline>
                      {t('play.menu.save', 'Save')}
                      {saving.isDirty && <VisuallyHidden> {t('play.save.unsaved', 'Unsaved changes')}</VisuallyHidden>}
                    </UnsavedIndicator>
                  }
                  // NavLink has no `loading` of its own, so the write in flight takes the
                  // place of the chord: the hint is of no use while the only thing to do is
                  // wait.
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
              {/* Clearing is authoring and saving the work is not, so this is the one entry
                  that goes when the coach is merely watching. */}
              {mode === 'edit' && (
                <NavLink
                  component="button"
                  type="button"
                  label={t('play.menu.clear', 'Clear')}
                  // The drawer stays open behind the confirmation: dismissing it must leave the
                  // coach where they were, with the entry they nearly pressed still in front
                  // of them.
                  onClick={() => setClearing((c) => ({ opened: true, count: c.count + 1 }))}
                />
              )}
            </>
          );
        }}
      />
      <ConfirmDelete
        key={`clear-${clearing.count}`}
        opened={clearing.opened}
        title={t('play.menu.clear', 'Clear')}
        body={t(
          'play.clear.body',
          'Everything on the court will be erased: the players, their movement, the steps, the screens and every variant. The system keeps its name and its court.',
        )}
        confirmLabel={t('play.clear.confirm', 'Erase everything')}
        onConfirm={clear}
        onClose={() => setClearing((c) => ({ ...c, opened: false }))}
      />
      <SavePlayDialog key={`save-${saving.dialogKey}`} {...saving.dialogProps} />
    </>
  );
}
