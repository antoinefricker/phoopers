import { Box } from '@mantine/core';
import { usePlaybackContext } from '../play2d/usePlaybackContext';
import { SCROLLBAR_GUTTER_PX, SCRUBBER_AXIS_PX, gridTicks, leftPx } from './timelineGeometry';
import { TimeWindow } from './TimeWindow';
import { LABEL_WIDTH } from './TimelineRow';
import { useTimelineViewportContext } from './useTimelineViewportContext';

/**
 * The vertical time grid behind the transport, the step ruler and the keyframe tracks: one line
 * per authoring cell, the whole seconds drawn more strongly than the cells between them.
 *
 * It is drawn once, for all three surfaces at once, rather than per surface — that is what makes
 * them read as one axis rather than as three that happen to agree. It therefore lives above them
 * in the tree, and NOT inside the timeline's scroll area: a vertical line has nothing to gain
 * from scrolling with the rows, and inside it the grid stopped at the ruler.
 *
 * Horizontally it scrolls with everything else, which is why its lines live in a `TimeWindow`:
 * at a fixed scale a line is at a distance from t = 0, not at a share of the panel, so the grid
 * has to be carried by the same offset as the markers it sits behind.
 *
 * Grey at two strengths rather than two colours: the whole second is the border token at full
 * strength and the cell between them the same token faded, so the pair stays in step with the
 * theme in light and in dark with nothing to tune twice.
 */
export function TimeGrid() {
  const { timeline } = usePlaybackContext();
  const { duration } = timeline;
  const { pxPerCell } = useTimelineViewportContext();

  return (
    <Box
      data-testid="time-grid"
      aria-hidden
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        // The left gutter holds the transport's buttons and the rows' labels. On the right the
        // vertical scrollbar's gutter comes first, reserved by the rows' scroll area whether or
        // not they are scrolling. The inset inside both ends belongs to the window.
        left: LABEL_WIDTH,
        right: SCROLLBAR_GUTTER_PX,
        display: 'flex',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      <TimeWindow testId="time-grid-window">
        {gridTicks(duration).map(({ t, major }) => (
          <div
            key={t}
            data-testid={major ? 'time-grid-major' : 'time-grid-minor'}
            style={{
              position: 'absolute',
              // Not the top of the box, which is the top of the transport's row: a line starts on
              // the scrubber's own axis. See `SCRUBBER_AXIS_PX`.
              top: SCRUBBER_AXIS_PX,
              bottom: 0,
              left: leftPx(t, pxPerCell),
              width: 1,
              background: 'var(--mantine-color-default-border)',
              opacity: major ? 0.5 : 0.2,
            }}
          />
        ))}
      </TimeWindow>
    </Box>
  );
}
