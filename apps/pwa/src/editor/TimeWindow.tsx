import { Box } from '@mantine/core';
import { useCallback } from 'react';
import type { ReactNode, RefObject } from 'react';
import { TRACK_INSET_PX } from './timelineGeometry';
import { useTimelineViewportContext } from './useTimelineViewportContext';

interface Props {
  children: ReactNode;
  /** Names the window. Its content box takes the same id with `-content`. */
  testId: string;
  /**
   * The content box, which a gesture measures to turn a pointer's x into a time. It is the
   * TRANSLATED box, so its left edge is the start of the timeline wherever the view is scrolled
   * to — the scroll offset is already in the rect and nothing has to add it back.
   */
  contentRef?: RefObject<HTMLDivElement | null>;
  /**
   * Reports this window's width to the context. Exactly one window does, because the windows are
   * not all the same width: the grid's reserves the vertical scrollbar's gutter and the rows'
   * does not. Two of them reporting would leave the context flipping between two numbers for
   * ever, each write re-rendering the other.
   */
  measure?: boolean;
}

/**
 * The clipping box a time surface draws its axis inside: as wide as the window leaves it, holding
 * a child as wide as the whole play, shifted left by the shared scroll offset.
 *
 * All four surfaces — the grid, the ruler, every row's track and the playhead overlay — wrap
 * their axis in one of these, which is what makes them scroll as a single surface rather than as
 * four that agree by accident. The 180 px gutter stays OUTSIDE the window in every case, so it
 * does not move; the spec pins it there.
 *
 * The inset each end of the axis keeps for a marker centred on t = 0 or t = duration lives on the
 * window rather than inside it: inside, it would be a distance the content carried and the axis
 * would start half a marker late.
 *
 * A transform rather than a real `scrollLeft`: one offset in the context drives every surface,
 * and native scrolling would mean four scrollbars and four scroll events to keep damped.
 */
export function TimeWindow({ children, testId, contentRef, measure = false }: Props) {
  const { scrollLeft, contentWidthPx, setViewportWidthPx } = useTimelineViewportContext();

  // A ref callback, not an effect: `react-hooks/set-state-in-effect` forbids a setter in an
  // effect body, and the width has to be read once on mount — the observer only ever fires on a
  // LATER change, and under test it is a stub that never fires at all, so a window measured by
  // the observer alone would report zero for ever.
  const watch = useCallback(
    (node: HTMLDivElement | null): (() => void) | undefined => {
      if (node === null) return undefined;

      const report = () => setViewportWidthPx(node.getBoundingClientRect().width);
      report();
      const observer = new ResizeObserver(report);
      observer.observe(node);

      return () => observer.disconnect();
    },
    [setViewportWidthPx],
  );

  return (
    <Box
      data-testid={testId}
      ref={measure ? watch : undefined}
      style={{
        flex: 1,
        // Or the window refuses to shrink below its content and the gutter is pushed off screen.
        minWidth: 0,
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
        marginLeft: TRACK_INSET_PX,
        marginRight: TRACK_INSET_PX,
      }}
    >
      <Box
        ref={contentRef}
        data-testid={`${testId}-content`}
        style={{
          position: 'relative',
          height: '100%',
          width: contentWidthPx,
          // `-0` stringifies as "0", so a view at rest carries no negative zero into the style.
          transform: `translateX(${-scrollLeft}px)`,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
