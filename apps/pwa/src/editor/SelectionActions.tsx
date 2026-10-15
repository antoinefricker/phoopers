import { Button, Group, Paper, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useEditorContext } from './useEditorContext';

/**
 * What can be done to the selected player: place a screen from them. A selected keyframe names
 * its player too, so selecting a marker on the timeline reaches the same action. Removing a
 * player lives on that player's timeline row instead, where it needs no selection first.
 * The ball has none, so it renders nothing.
 */
export function SelectionActions() {
  const { t } = useTranslation();
  const { play, selection, placingScreen, setPlacingScreen } = useEditorContext();
  const player = selection === null ? undefined : play.players.find((p) => p.id === selection.entityId);

  return (
    <>
      {player !== undefined && (
        <Paper withBorder p="xs" data-testid="selection-actions">
          <Group gap="sm">
            <Text size="sm" fw={500}>
              {t('play.editor.selectedPlayer', 'Player {{label}}', { label: player.number })}
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
            {placingScreen && (
              <Text size="sm" c="dimmed" role="status">
                {t('play.editor.placeScreenHint', 'Click the player being screened on the court.')}
              </Text>
            )}
          </Group>
        </Paper>
      )}
    </>
  );
}
