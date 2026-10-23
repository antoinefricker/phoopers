import { useCallback, useMemo, useState, type ReactNode, type RefObject } from 'react';
import { ZOOM_LEVELS, contentWidthPx as contentWidthOf, xOfTime } from './timelineScale';
import { clampScroll, scrollAroundZoom } from './timelineScroll';
import { TimelineViewportContext, type TimelineViewportContextValue } from './useTimelineViewportContext';

interface Props {
  duration: number;
  /**
   * The playback clock's time, which a zoom reads to keep the playhead where it was in the
   * window. A ref rather than a value because the clock ticks and this provider must not.
   * Required: a caller that left it out would anchor every zoom on t = 0 with no error to say so.
   */
  playheadTimeRef: RefObject<number>;
  children: ReactNode;
}

// The level lives in this component's state, so it starts over each time the provider mounts:
// the zoom lasts as long as the editor is open and is stored nowhere.
export function TimelineViewportContextProvider({ duration, playheadTimeRef, children }: Props) {
  const [levelIndex, setLevelIndex] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidthPx, setViewportWidthPx] = useState(0);

  const pxPerCell = ZOOM_LEVELS[levelIndex] ?? 0;
  const contentWidthPx = contentWidthOf(duration, pxPerCell);

  const scrollTo = useCallback(
    (x: number) => setScrollLeft(clampScroll(x, { scrollLeft, viewportWidthPx, contentWidthPx })),
    [scrollLeft, viewportWidthPx, contentWidthPx],
  );
  // The offset is settled together with the level, from the playhead's x on both sides. Left to
  // follow the level afterwards it would sit one render on an offset that fits the OLD width, and
  // a zoom out would briefly show it past the new, shorter end. `scrollAroundZoom` clamps against
  // the NEW content width, which is what settles that.
  const zoomTo = useCallback(
    (nextIndex: number) => {
      const nextPx = ZOOM_LEVELS[nextIndex];
      if (nextPx === undefined || nextIndex === levelIndex) return;

      const time = playheadTimeRef.current;
      setLevelIndex(nextIndex);
      setScrollLeft(
        scrollAroundZoom(xOfTime(time, pxPerCell), xOfTime(time, nextPx), {
          scrollLeft,
          viewportWidthPx,
          contentWidthPx: contentWidthOf(duration, nextPx),
        }),
      );
    },
    [levelIndex, playheadTimeRef, pxPerCell, scrollLeft, viewportWidthPx, duration],
  );
  const zoomIn = useCallback(() => zoomTo(Math.max(0, levelIndex - 1)), [zoomTo, levelIndex]);
  const zoomOut = useCallback(() => zoomTo(Math.min(ZOOM_LEVELS.length - 1, levelIndex + 1)), [zoomTo, levelIndex]);

  const value = useMemo<TimelineViewportContextValue>(
    () => ({
      pxPerCell,
      canZoomIn: levelIndex > 0,
      canZoomOut: levelIndex < ZOOM_LEVELS.length - 1,
      zoomIn,
      zoomOut,
      scrollLeft,
      scrollTo,
      viewportWidthPx,
      setViewportWidthPx,
      contentWidthPx,
    }),
    [pxPerCell, levelIndex, zoomIn, zoomOut, scrollLeft, scrollTo, viewportWidthPx, contentWidthPx],
  );

  return <TimelineViewportContext value={value}>{children}</TimelineViewportContext>;
}
