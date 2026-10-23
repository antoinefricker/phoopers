import { createContext, useContext } from 'react';

export interface TimelineViewportContextValue {
  /** The pixels one 0.1 s grid cell occupies at the current zoom. */
  pxPerCell: number;
  /** False at the finest level, where there is nothing finer to go to. */
  canZoomIn: boolean;
  /** False at the coarsest level, where there is nothing coarser to go to. */
  canZoomOut: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  scrollLeft: number;
  /** Moves the window, stopping at both ends of the content. */
  scrollTo: (x: number) => void;
  viewportWidthPx: number;
  setViewportWidthPx: (px: number) => void;
  /** The width the whole play needs at the current zoom. */
  contentWidthPx: number;
}

export const TimelineViewportContext = createContext<TimelineViewportContextValue | null>(null);

export function useTimelineViewportContext(): TimelineViewportContextValue {
  const value = useContext(TimelineViewportContext);

  if (value === null) {
    throw new Error('useTimelineViewportContext must be used inside a TimelineViewportContextProvider');
  }

  return value;
}
