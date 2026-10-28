import { Box } from '@mantine/core';
import { useEffect, useRef } from 'react';
import { SCROLLBAR_GUTTER_PX, TRACK_INSET_END_PX, TRACK_INSET_START_PX } from './timelineGeometry';
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

  // The positions the strip reported that the context has not yet committed, oldest first. While
  // the coach drags, the browser owns the position and React is always a step behind it: the
  // commit for a report lands after the strip has reported (and moved to) a newer one, and
  // writing that older offset back drags the bar backwards under the pointer. Comparing with the
  // latest report alone is not enough for that reason — the committed value is already stale by
  // then — so every report is kept until its own commit shows up.
  const pendingRef = useRef<number[]>([]);

  // The offset also moves without this bar being touched — the playhead carries the view while
  // the play runs, a zoom re-anchors it, a clamp pulls it back — so an offset the strip never
  // reported is written onto it. Writing the same value back fires a scroll event that resolves
  // to a no-op.
  useEffect(() => {
    const strip = stripRef.current;
    if (strip === null) return;
    const pending = pendingRef.current;
    const reported = pending.indexOf(scrollLeft);
    if (reported !== -1) {
      pending.splice(0, reported + 1);
      return;
    }
    pending.length = 0;
    if (strip.scrollLeft !== scrollLeft) strip.scrollLeft = scrollLeft;
  }, [scrollLeft]);

  return (
    <Box
      ref={stripRef}
      data-testid="timeline-scrollbar"
      aria-hidden
      onScroll={(event) => {
        pendingRef.current.push(event.currentTarget.scrollLeft);
        scrollTo(event.currentTarget.scrollLeft);
      }}
      style={{
        // Aligned with the axis it drives rather than with the panel: the gutter on the left
        // holds names, the inset at each end is room the axis does not span, and the rows'
        // vertical scrollbar takes its own gutter off the right. Measured, a strip 12px wider
        // than its axis cannot reach the last 12px of the play, its own range being shorter
        // than the one the context clamps to.
        marginLeft: `calc(${LABEL_WIDTH} + ${TRACK_INSET_START_PX}px)`,
        marginRight: SCROLLBAR_GUTTER_PX + TRACK_INSET_END_PX,
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
