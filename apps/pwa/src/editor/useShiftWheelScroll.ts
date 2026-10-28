import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { wheelDeltaPx } from './timelineScroll';
import { useTimelineViewportContext } from './useTimelineViewportContext';

/**
 * Turns Shift + the mouse wheel over `ref` into horizontal scrolling of the shared time axis.
 *
 * The axis is not a native scroller: the windows clip and a transform moves them, so a browser
 * has no horizontal scroll to give the wheel. This asks for the same offset the scrollbar and the
 * playhead's follow move, so every surface goes together.
 *
 * Left alone: a wheel without Shift, which keeps scrolling the rows; a press with Ctrl, Cmd or
 * Alt, which is a pinch or the browser's own; and any wheel while the whole play fits the window,
 * where there is nowhere to go and the browser keeps what it would have done.
 *
 * A native listener, not React's `onWheel`: React registers wheel passively, and a passive
 * listener cannot cancel the vertical scroll the same event would otherwise cause.
 */
export function useShiftWheelScroll(ref: RefObject<HTMLElement | null>): void {
  const { scrollLeft, scrollTo, viewportWidthPx, contentWidthPx } = useTimelineViewportContext();
  // What a gesture reads. A ref, so the listener is attached once rather than torn down and put
  // back each time the view moves, which a held wheel does continually.
  const view = useRef({ scrollLeft, scrollTo, viewportWidthPx, contentWidthPx });
  useEffect(() => {
    view.current = { scrollLeft, scrollTo, viewportWidthPx, contentWidthPx };
  });

  useEffect(() => {
    const element = ref.current;
    if (element === null) return undefined;

    const onWheel = (event: WheelEvent) => {
      if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;

      const now = view.current;
      if (now.contentWidthPx <= now.viewportWidthPx) return;

      // Browsers disagree on which axis Shift + the wheel arrives on: some turn it into a
      // horizontal delta themselves, others leave it vertical and set the key.
      const raw = event.deltaX !== 0 ? event.deltaX : event.deltaY;
      event.preventDefault();
      now.scrollTo(now.scrollLeft + wheelDeltaPx(raw, event.deltaMode, now.viewportWidthPx));
    };

    element.addEventListener('wheel', onWheel, { passive: false });

    return () => element.removeEventListener('wheel', onWheel);
  }, [ref]);
}
