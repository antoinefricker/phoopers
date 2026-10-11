import { ActionIcon, Box, Group, Slider, Text } from '@mantine/core';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { IconPlayerPause, IconPlayerPlay, IconPlayerSkipBack, IconPlayerSkipForward } from '@tabler/icons-react';
import {
  GUTTER_WIDTH,
  TIME_READOUT_PX,
  TRACK_INSET_PX,
  adjacentStep,
  sliderMax,
  snapToStep,
  stepMarks,
} from './transportMath';
import { usePlaybackContext } from './usePlaybackContext';
import { usePlaybackTimeContext } from './usePlaybackTimeContext';

// Big enough to see and to grab. It may overhang the track: the margin on the Box absorbs part
// of it, and the gutter beside it the rest.
const THUMB_SIZE_PX = 16;

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
    <Group gap={0} align="center" wrap="nowrap">
      {/* The buttons fill the same gutter the timeline gives its row labels, so the scrubber
          and the tracks begin at the same x and one playhead reads true across all three. */}
      <Group gap="xs" w={GUTTER_WIDTH} wrap="nowrap" style={{ flexShrink: 0 }}>
        {/* The aria-labels are the only accessible name these buttons have now that the glyphs
          are icons, so they carry the meaning rather than decorating it. */}
        <ActionIcon
          onClick={() => jump(-1)}
          aria-label={t('play.transport.previousStep', 'Previous step')}
          variant="default"
        >
          <IconPlayerSkipBack size={18} stroke={1.5} />
        </ActionIcon>
        <ActionIcon
          onClick={isPlaying ? pause : play}
          aria-label={isPlaying ? t('play.transport.pause', 'Pause') : t('play.transport.play', 'Play')}
          variant="filled"
        >
          {isPlaying ? <IconPlayerPause size={18} stroke={1.5} /> : <IconPlayerPlay size={18} stroke={1.5} />}
        </ActionIcon>
        <ActionIcon onClick={() => jump(1)} aria-label={t('play.transport.nextStep', 'Next step')} variant="default">
          <IconPlayerSkipForward size={18} stroke={1.5} />
        </ActionIcon>
      </Group>
      <Box
        flex="1 1 14rem"
        miw={0}
        style={{ marginInline: TRACK_INSET_PX }}
        onKeyDownCapture={(event) => {
          keyboardMoveRef.current = event.key.startsWith('Arrow');
        }}
      >
        {/* Mantine pads the slider root by a fixed 8px so the thumb's centre can reach either
            end without overflowing. That inset is its own, not ours, and it left the scrubber's
            axis 8px inside the tracks' at both ends, so it is dropped.
            The thumb's size is deliberately NOT tied to the track inset: what has to line up
            across the three surfaces is the TRACK, and the thumb only overhangs it. Tying them
            once meant the thumb shrank to 8px — invisible against an 8px bar — the moment the
            inset followed the markers down to 4. */}
        <Slider
          thumbSize={THUMB_SIZE_PX}
          min={0}
          max={max}
          step={0.01}
          value={Math.min(Math.max(displayTime, 0), max)}
          onChange={(value) => {
            const snap = !keyboardMoveRef.current;
            keyboardMoveRef.current = false;
            scrubTo(snap ? snapToStep(value, timeline.steps, SNAP_THRESHOLD) : value);
          }}
          // Dots without names: they show where a drag will snap, while the step ruler sits
          // directly below on the same axis and names each step in full. Labelling them here
          // too printed every name twice, centred and ellipsised against the ruler's
          // left-aligned full text.
          marks={stepMarks(timeline.steps).map(({ value }) => ({ value }))}
          styles={{ root: { paddingInline: 0 } }}
          label={(value) => value.toFixed(1)}
          aria-label={t('play.transport.scrubber', 'Playback position')}
        />
      </Box>
      <Text size="sm" data-testid="current-time" w={TIME_READOUT_PX} ta="right" style={{ flexShrink: 0 }}>
        {displayTime.toFixed(1)}
      </Text>
    </Group>
  );
}
