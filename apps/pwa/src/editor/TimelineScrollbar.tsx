import { Box } from '@mantine/core';
import { useEffect, useRef } from 'react';
import { SCROLLBAR_GUTTER_PX, TRACK_INSET_PX } from './timelineGeometry';
import { LABEL_WIDTH } from './TimelineRow';
import { useTimelineViewportContext } from './useTimelineViewportContext';

/**
 * The one horizontal scrollbar for every time surface at once.
 *
 * A real overflowing strip rather than a drawn bar, so it is the platform's own scrollbar: it
 * follows the coach's trackpad, their wheel and their scrollbar-click habits with nothing to
 * reimplement. It holds nothing but a spacer as wide as the play, and reports where it was
 * dragged to through `scrollTo`.
 *
 * Its place is reserved whether or not it has anywhere to go. A gutter that appeared only once a
 * play outgrew the window would move the axis under the coach's pointer the moment they added a
 * keyframe past the fold.
 *
 * Hidden from assistive technology: it carries no content of its own, and the times it scrolls
 * to are already on the markers.
 */
export function TimelineScrollbar() {
  const { contentWidthPx, scrollLeft, scrollTo } = useTimelineViewportContext();
  const stripRef = useRef<HTMLDivElement>(null);

  // The offset also moves without this bar being touched — the playhead carries the view while
  // the play runs, a zoom re-anchors it — so the strip follows the context rather than owning
  // the position. Writing the same value back fires a scroll event that resolves to a no-op.
  useEffect(() => {
    const strip = stripRef.current;
    if (strip !== null && strip.scrollLeft !== scrollLeft) strip.scrollLeft = scrollLeft;
  }, [scrollLeft]);

  return (
    <Box
      ref={stripRef}
      data-testid="timeline-scrollbar"
      aria-hidden
      onScroll={(event) => scrollTo(event.currentTarget.scrollLeft)}
      style={{
        // Aligned with the axis it drives rather than with the panel: the gutter on the left
        // holds names, the inset at each end is room the axis does not span, and the rows'
        // vertical scrollbar takes its own gutter off the right. Measured, a strip 12px wider
        // than its axis cannot reach the last 12px of the play, its own range being shorter
        // than the one the context clamps to.
        marginLeft: `calc(${LABEL_WIDTH} + ${TRACK_INSET_PX}px)`,
        marginRight: SCROLLBAR_GUTTER_PX + TRACK_INSET_PX,
        height: SCROLLBAR_GUTTER_PX,
        flexShrink: 0,
        overflowX: 'auto',
        overflowY: 'hidden',
      }}
    >
      <Box style={{ width: contentWidthPx, height: 1 }} />
    </Box>
  );
}
