import { ActionIcon, Group } from '@mantine/core';
import { IconMinus, IconPlus } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useTimelineViewportContext } from './useTimelineViewportContext';

// Gray and light like the header's own icon buttons: a zoom changes the view, not the play, so
// it does not take the primary colour the editor keeps for what acts on the play.
// Disabled at either end rather than hidden, so the row keeps its shape under the hand.
export function TimelineZoomControls() {
  const { t } = useTranslation();
  const { canZoomIn, canZoomOut, zoomIn, zoomOut } = useTimelineViewportContext();

  return (
    <Group gap="xs" justify="flex-end">
      <ActionIcon
        variant="light"
        color="gray"
        aria-label={t('play.timeline.zoomOut', 'Zoom out')}
        disabled={!canZoomOut}
        onClick={zoomOut}
      >
        <IconMinus size={18} stroke={1.5} />
      </ActionIcon>
      <ActionIcon
        variant="light"
        color="gray"
        aria-label={t('play.timeline.zoomIn', 'Zoom in')}
        disabled={!canZoomIn}
        onClick={zoomIn}
      >
        <IconPlus size={18} stroke={1.5} />
      </ActionIcon>
    </Group>
  );
}
