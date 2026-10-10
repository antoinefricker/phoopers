import { useState } from 'react';
import { Button, Group, Paper, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { PlayerId } from '../engine';
import { ConfirmDelete } from './ConfirmDelete';
import { useEditorContext } from './useEditorContext';

/**
 * What can be done to the selected player: place a screen from them, or remove them. A selected
 * keyframe names its player too, so selecting a marker on the timeline reaches the same actions.
 * The ball has none, so it renders nothing.
 */
export function SelectionActions() {
  const { t } = useTranslation();
  const { play, selection, select, placingScreen, setPlacingScreen, removePlayer } = useEditorContext();
  // The dialog stays mounted for Mantine's exit transition, and `target` outlives the selection so
  // the body does not blank out mid-transition. `count` re-keys it per open (see ConfirmDelete).
  const [removing, setRemoving] = useState<{ target: PlayerId | null; opened: boolean; count: number }>({
    target: null,
    opened: false,
    count: 0,
  });

  const player = selection === null ? undefined : play.players.find((p) => p.id === selection.entityId);
  const targetLabel = play.players.find((p) => p.id === removing.target)?.label ?? '';

  return (
    <>
      {player !== undefined && (
        <Paper withBorder p="xs" data-testid="selection-actions">
          <Group gap="sm">
            <Text size="sm" fw={500}>
              {t('play.editor.selectedPlayer', 'Player {{label}}', { label: player.label })}
            </Text>
            <Button
              size="xs"
              variant={placingScreen ? 'filled' : 'default'}
              aria-pressed={placingScreen}
              onClick={() => setPlacingScreen(!placingScreen)}
            >
              {placingScreen
                ? t('play.editor.cancelScreen', 'Cancel screen')
                : t('play.editor.placeScreen', 'Place a screen')}
            </Button>
            <Button
              size="xs"
              color="red"
              variant="light"
              onClick={() => setRemoving((r) => ({ target: player.id, opened: true, count: r.count + 1 }))}
            >
              {t('play.editor.removePlayer', 'Remove player')}
            </Button>
            {placingScreen && (
              <Text size="sm" c="dimmed" role="status">
                {t('play.editor.placeScreenHint', 'Click the player being screened on the court.')}
              </Text>
            )}
          </Group>
        </Paper>
      )}
      <ConfirmDelete
        key={removing.count}
        opened={removing.opened}
        title={t('play.editor.removePlayerTitle', 'Remove player {{label}}?', { label: targetLabel })}
        body={t(
          'play.editor.removePlayerBody',
          'Player {{label}} will be removed from every branch, together with every screen they are part of.',
          { label: targetLabel },
        )}
        confirmLabel={t('play.editor.remove', 'Remove')}
        onConfirm={() => {
          if (removing.target !== null) removePlayer(removing.target);
          setRemoving((r) => ({ ...r, opened: false }));
          select(null);
        }}
        onClose={() => setRemoving((r) => ({ ...r, opened: false }))}
      />
    </>
  );
}
