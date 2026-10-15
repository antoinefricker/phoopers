import { ActionIcon, Box, Group, Menu, Slider } from '@mantine/core';
import { useContext, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerSkipBack,
  IconPlayerSkipForward,
  IconPlus,
} from '@tabler/icons-react';
import {
  GUTTER_WIDTH,
  TIME_GRID_S,
  TRACK_INSET_PX,
  adjacentStep,
  sliderMax,
  snapToGrid,
  snapToStep,
  stepMarks,
} from './transportMath';
import { EditorContext } from '../editor/useEditorContext';
import { usePlaybackContext } from './usePlaybackContext';
import { usePlaybackTimeContext } from './usePlaybackTimeContext';

// Big enough to see and to grab. It may overhang the track: the margin on the Box absorbs part
// of it, and the gutter beside it the rest.
const THUMB_SIZE_PX = 16;

const SNAP_THRESHOLD = 0.25;

export function PlaybackTransport() {
  const { t } = useTranslation();
  const { timeline, branchId, currentTimeRef, isPlaying, play, pause, seek } = usePlaybackContext();
  const { displayTime } = usePlaybackTimeContext();
  const max = sliderMax(timeline.duration);

  // The clock's seek() does not pause; stopping playback on any manual move is the transport's job.
  const scrubTo = (time: number) => {
    pause();
    // The playhead lands on the grid too: a step, a screen or a keyframe created here takes
    // the time it reads, so a continuous playhead would put them between two cells.
    seek(snapToGrid(time));
  };

  // Read the live ref, not displayTime: the thumb's value lags by up to a tenth of a second,
  // and a step inside that window would be skipped or repeated.
  // Mantine's Slider owns its own key handler, so the flag is set from a wrapper's capture phase.
  // Arrow keys move relative to the current value, so snapping them would pin the thumb to
  // any step it reaches (2.0 + 0.01 snaps straight back to 2.0). Only absolute moves snap.
  const keyboardMoveRef = useRef(false);

  // Read the context directly rather than through the hook: the transport renders without an
  // editor around it (the 1b tests do), and then there is nothing to add. `PlayCanvas` reads it
  // the same way, for the same reason.
  const editor = useContext(EditorContext);
  const editing = editor?.mode === 'edit';
  const [addOpen, setAddOpen] = useState(false);

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
        {/* The three things a coach adds, leading the row: a step is born at the playhead and a
            player joins the play it marks, so they belong beside it rather than after the
            controls that move it. Edit mode only — all three write to the model, and this bar
            is rendered while playing too. */}
        {editing && editor !== null && (
          <Menu opened={addOpen} onChange={setAddOpen} position="bottom-start" shadow="md" trapFocus>
            <Menu.Target>
              <ActionIcon
                variant="default"
                onClick={() => setAddOpen((open) => !open)}
                aria-label={t('play.transport.add', 'Add')}
              >
                <IconPlus size={18} stroke={1.5} />
              </ActionIcon>
            </Menu.Target>
            {/* A Menu rather than a Popover of buttons: a list of commands is what it is for,
                and it brings the menu and menuitem roles, arrow-key navigation, Escape and
                closing on a choice without any of them being written here. */}
            <Menu.Dropdown data-testid="add-menu">
              <Menu.Item
                onClick={() => {
                  // The clock runs continuously while a play plays, so the instant a step is
                  // born at is rounded here rather than trusted.
                  editor.addStep(
                    branchId,
                    snapToGrid(currentTimeRef.current),
                    t('play.editor.stepDefault', 'Step {{n}}', { n: timeline.steps.length + 1 }),
                  );
                }}
              >
                {t('play.editor.addStep', 'Add step')}
              </Menu.Item>
              <Menu.Item onClick={() => editor.addPlayer('offense')}>
                {t('play.editor.addOffense', 'Add offense')}
              </Menu.Item>
              <Menu.Item onClick={() => editor.addPlayer('defense')}>
                {t('play.editor.addDefense', 'Add defense')}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        )}
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
          step={TIME_GRID_S}
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
    </Group>
  );
}
