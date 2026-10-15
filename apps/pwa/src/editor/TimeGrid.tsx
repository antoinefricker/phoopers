import { Box } from '@mantine/core';
import { usePlaybackContext } from '../play2d/usePlaybackContext';
import { SCROLLBAR_GUTTER_PX, SCRUBBER_AXIS_PX, TRACK_INSET_PX, fractionOf, gridTicks } from './timelineGeometry';
import { LABEL_WIDTH } from './TimelineRow';

/**
 * The vertical time grid behind the transport, the step ruler and the keyframe tracks: one line
 * per authoring cell, the whole seconds drawn more strongly than the cells between them.
 *
 * It is drawn once, for all three surfaces at once, rather than per surface — that is what makes
 * them read as one axis rather than as three that happen to agree. It therefore lives above them
 * in the tree, and NOT inside the timeline's scroll area: a vertical line has nothing to gain
 * from scrolling with the rows, and inside it the grid stopped at the ruler.
 *
 * Grey at two strengths rather than two colours: the whole second is the border token at full
 * strength and the cell between them the same token faded, so the pair stays in step with the
 * theme in light and in dark with nothing to tune twice.
 */
export function TimeGrid() {
  const { timeline } = usePlaybackContext();
  const { duration } = timeline;

  return (
    <Box
      data-testid="time-grid"
      aria-hidden
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        // The left gutter holds the transport's buttons and the rows' labels, and both surfaces
        // then inset their track by the same amount. On the right the scrollbar's gutter comes
        // first, reserved by both whether or not the rows are scrolling, and the inset inside it.
        left: `calc(${LABEL_WIDTH} + ${TRACK_INSET_PX}px)`,
        right: SCROLLBAR_GUTTER_PX + TRACK_INSET_PX,
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
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
            left: `${fractionOf(t, duration) * 100}%`,
            width: 1,
            background: 'var(--mantine-color-default-border)',
            opacity: major ? 0.5 : 0.2,
          }}
        />
      ))}
    </Box>
  );
}
