import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ZOOM_LEVELS, contentWidthPx as contentWidthOf } from './timelineScale';
import { clampScroll } from './timelineScroll';
import { TimelineViewportContext, type TimelineViewportContextValue } from './useTimelineViewportContext';

interface Props {
  duration: number;
  children: ReactNode;
}

// The level lives in this component's state, so it starts over each time the provider mounts:
// the zoom lasts as long as the editor is open and is stored nowhere.
export function TimelineViewportContextProvider({ duration, children }: Props) {
  const [levelIndex, setLevelIndex] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidthPx, setViewportWidthPx] = useState(0);

  const pxPerCell = ZOOM_LEVELS[levelIndex] ?? 0;
  const contentWidthPx = contentWidthOf(duration, pxPerCell);

  const scrollTo = useCallback(
    (x: number) => setScrollLeft(clampScroll(x, { scrollLeft, viewportWidthPx, contentWidthPx })),
    [scrollLeft, viewportWidthPx, contentWidthPx],
  );
  const zoomIn = useCallback(() => setLevelIndex((i) => Math.max(0, i - 1)), []);
  const zoomOut = useCallback(() => setLevelIndex((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1)), []);

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
