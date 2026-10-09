import { ActionIcon, Box, Group, Slider, Text } from '@mantine/core';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { adjacentStep, sliderMax, snapToStep, stepMarks } from './transportMath';
import { usePlaybackContext } from './usePlaybackContext';
import { usePlaybackTimeContext } from './usePlaybackTimeContext';

const SNAP_THRESHOLD = 0.25;

export function PlaybackTransport() {
  const { t } = useTranslation();
  const { timeline, currentTimeRef, isPlaying, play, pause, seek } = usePlaybackContext();
  const { displayTime } = usePlaybackTimeContext();
  const max = sliderMax(timeline.duration);

  // The clock's seek() does not pause; stopping playback on any manual move is the transport's job.
  const scrubTo = (time: number) => {
    pause();
    seek(time);
  };

  // Read the live ref, not displayTime: the readout lags by up to a tenth of a second, and a
  // step inside that window would be skipped or repeated.
  // Mantine's Slider owns its own key handler, so the flag is set from a wrapper's capture phase.
  // Arrow keys move relative to the current value, so snapping them would pin the thumb to
  // any step it reaches (2.0 + 0.01 snaps straight back to 2.0). Only absolute moves snap.
  const keyboardMoveRef = useRef(false);

  const jump = (direction: 1 | -1) => {
    const next = adjacentStep(currentTimeRef.current, timeline.steps, direction);
    if (next !== undefined) {
      scrubTo(next);
    }
  };

  return (
    <Group gap="sm" align="center">
      <ActionIcon
        onClick={() => jump(-1)}
        aria-label={t('play.transport.previousStep', 'Previous step')}
        variant="default"
      >
        {'<'}
      </ActionIcon>
      <ActionIcon
        onClick={isPlaying ? pause : play}
        aria-label={isPlaying ? t('play.transport.pause', 'Pause') : t('play.transport.play', 'Play')}
        variant="filled"
      >
        {isPlaying ? '||' : '>'}
      </ActionIcon>
      <ActionIcon onClick={() => jump(1)} aria-label={t('play.transport.nextStep', 'Next step')} variant="default">
        {'>'}
      </ActionIcon>
      <Text size="sm" data-testid="current-time" w={48}>
        {displayTime.toFixed(1)}
      </Text>
      <Box
        flex="1 1 14rem"
        miw={0}
        onKeyDownCapture={(event) => {
          keyboardMoveRef.current = event.key.startsWith('Arrow');
        }}
      >
        <Slider
          min={0}
          max={max}
          step={0.01}
          value={Math.min(Math.max(displayTime, 0), max)}
          onChange={(value) => {
            const snap = !keyboardMoveRef.current;
            keyboardMoveRef.current = false;
            scrubTo(snap ? snapToStep(value, timeline.steps, SNAP_THRESHOLD) : value);
          }}
          marks={stepMarks(timeline.steps).map((mark) => ({
            ...mark,
            // The cap below can clip a long name; the title keeps it readable.
            label: <span title={mark.label}>{mark.label}</span>,
          }))}
          // Neighbouring step names would otherwise overprint on a narrow track; clip each with an
          // ellipsis instead. The cap grows with the viewport, so a wide screen has room to read.
          styles={{
            markLabel: {
              maxWidth: 'clamp(5.5rem, 12vw, 10rem)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            },
          }}
          label={(value) => value.toFixed(1)}
          aria-label={t('play.transport.scrubber', 'Playback position')}
        />
      </Box>
    </Group>
  );
}
