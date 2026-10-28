import { ActionIcon, Box, Group, Menu, Slider } from '@mantine/core';
import { useContext, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
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
  SCROLLBAR_GUTTER_PX,
  TIME_GRID_S,
  TRACK_INSET_END_PX,
  TRACK_INSET_START_PX,
  TRANSPORT_ROW_HEIGHT_PX,
  adjacentStep,
  sliderMax,
  snapToGrid,
  snapToStep,
  stepMarks,
} from './transportMath';
import { TimeWindow } from '../editor/TimeWindow';
import { EditorContext } from '../editor/useEditorContext';
import { usePlayPauseShortcut } from './usePlayPauseShortcut';
import { usePlaybackContext } from './usePlaybackContext';
import { usePlaybackTimeContext } from './usePlaybackTimeContext';

// Big enough to see and to grab. It may overhang the track: the margin on the Box absorbs part
// of it, and the gutter beside it the rest.
export const THUMB_SIZE_PX = 16;

const SNAP_THRESHOLD = 0.25;

export function PlaybackTransport() {
  const { t } = useTranslation();
  const { timeline, branchId, end, currentTimeRef, isPlaying, play, pause, seek } = usePlaybackContext();
  const togglePlayback = isPlaying ? pause : play;
  // Beside the button it mirrors, so the key and the click cannot come to mean different things.
  usePlayPauseShortcut(togglePlayback);
  const { displayTime } = usePlaybackTimeContext();
  const max = sliderMax(end);

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
    const next = adjacentStep(currentTimeRef.current, timeline.steps, direction, end);
    if (next !== undefined) {
      scrubTo(next);
    }
  };

  const noteKeyboardMove = (event: KeyboardEvent<HTMLElement>) => {
    keyboardMoveRef.current = event.key.startsWith('Arrow');
  };

  // Mantine pads the slider root by a fixed 8px so the thumb's centre can reach either end
  // without overflowing. That inset is its own, not ours, and it left the scrubber's axis 8px
  // inside the tracks' at both ends, so it is dropped.
  // The thumb's size is deliberately NOT tied to the track inset: what has to line up across the
  // three surfaces is the TRACK, and the thumb only overhangs it. Tying them once meant the thumb
  // shrank to 8px — invisible against an 8px bar — the moment the inset followed the markers
  // down to 4. While authoring the window would clip that overhang, so it is told how far the thumb
  // reaches (`overhangPx`) and widens its clip without moving the axis.
  const slider = (
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
      // Only those the playhead can reach: a mark past the end would sit outside the track.
      marks={stepMarks(timeline.steps)
        .filter(({ value }) => value <= max)
        .map(({ value }) => ({ value }))}
      styles={{ root: { paddingInline: 0 } }}
      label={(value) => value.toFixed(1)}
      aria-label={t('play.transport.scrubber', 'Playback position')}
    />
  );

  return (
    // The same gutter the tracks below keep for their scrollbar, so the scrubber ends where
    // the markers do whether or not the rows are scrolling. See `SCROLLBAR_GUTTER_PX`.
    <Group
      gap={0}
      align="center"
      wrap="nowrap"
      data-testid="transport-row"
      // Stated rather than left to the buttons to settle: the time grid starts on this row's
      // midline, and a height nobody wrote down is one the grid cannot follow when it changes.
      // In the style and not through `h`, which Mantine rewrites to rem against its own scale:
      // the grid's offset is raw px, like the rest of the axis geometry, and two units that
      // scale differently would part company the moment the root font size moved.
      style={{ height: TRANSPORT_ROW_HEIGHT_PX, paddingRight: SCROLLBAR_GUTTER_PX }}
    >
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
                // Filled in the app's own colour, not `default`: that variant is the neutral
                // outlined button and ignores colour entirely, so filling it is the only way to
                // colour it. No `color` prop — a filled ActionIcon is the primary already.
                variant="filled"
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
          onClick={togglePlayback}
          aria-keyshortcuts="Space"
          aria-label={isPlaying ? t('play.transport.pause', 'Pause') : t('play.transport.play', 'Play')}
          variant="filled"
        >
          {isPlaying ? <IconPlayerPause size={18} stroke={1.5} /> : <IconPlayerPlay size={18} stroke={1.5} />}
        </ActionIcon>
        <ActionIcon onClick={() => jump(1)} aria-label={t('play.transport.nextStep', 'Next step')} variant="default">
          <IconPlayerSkipForward size={18} stroke={1.5} />
        </ActionIcon>
      </Group>
      {/* Only the editor is scaled. Watching draws no timeline, so the scrubber is the one time
          surface on screen and stays elastic: it spans the window and shows the whole play. */}
      {editing ? (
        // The window carries the same inset the tracks' windows do, so the margin the elastic
        // branch puts on its Box is not repeated here. Its content is as wide as the play at the
        // timeline's zoom and scrolls with the shared offset, which keeps the thumb and the step
        // dots on the same x as the rows below.
        <TimeWindow testId="scrubber-window" overhangPx={THUMB_SIZE_PX / 2}>
          <Box
            h="100%"
            style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
            onKeyDownCapture={noteKeyboardMove}
          >
            {slider}
          </Box>
        </TimeWindow>
      ) : (
        <Box
          flex="1 1 14rem"
          miw={0}
          style={{ marginLeft: TRACK_INSET_START_PX, marginRight: TRACK_INSET_END_PX }}
          onKeyDownCapture={noteKeyboardMove}
        >
          {slider}
        </Box>
      )}
    </Group>
  );
}
