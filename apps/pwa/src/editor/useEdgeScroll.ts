import { useCallback, useEffect, useRef } from 'react';
import { scrollForEdgeDrag } from './timelineScroll';
import { useTimelineViewportContext } from './useTimelineViewportContext';

interface Hold {
  clientX: number;
  // The window's own left edge on screen. It does not move when the view scrolls (the content
  // does), which is what lets a frame ask where the pointer sits in the window without
  // re-measuring anything.
  windowLeft: number;
  reapply: (scrollLeft: number) => void;
}

/**
 * Carries a drag along while the pointer is held at the window's edge.
 *
 * `scrollForEdgeDrag` is one step; a pointer held still fires no event, so the step is repeated
 * here, once per animation frame, for as long as the pointer sits in an edge zone and the view
 * has room to move. Without that a keyframe at 2 s could only reach 14 s by wiggling the
 * pointer, which is the one-gesture reach the timeline promises.
 *
 * Each frame re-runs the caller's `reapply` with the new offset, because the time under a still
 * pointer changes as the content slides beneath it.
 */
export function useEdgeScroll() {
  const { scrollLeft, scrollTo, viewportWidthPx, contentWidthPx } = useTimelineViewportContext();
  // What a frame reads. State only catches up after a render, which a frame can beat; the
  // offset written below is recorded here at once so two frames never step from the same one.
  const view = useRef({ scrollLeft, scrollTo, viewportWidthPx, contentWidthPx });
  useEffect(() => {
    view.current = { scrollLeft, scrollTo, viewportWidthPx, contentWidthPx };
  });
  const hold = useRef<Hold | null>(null);
  const frame = useRef<number | null>(null);

  const stepOnce = useCallback((h: Hold): boolean => {
    const current = view.current;
    // A window with no measured width has no edge to be at: until its first measurement lands
    // (and in a harness that never lays anything out) every pointer would read as past it.
    if (current.viewportWidthPx <= 0) return false;

    const next = scrollForEdgeDrag(h.clientX - h.windowLeft, current);
    if (next === current.scrollLeft) return false;

    view.current = { ...current, scrollLeft: next };
    current.scrollTo(next);
    h.reapply(next);

    return true;
  }, []);

  // A frame schedules the next one, so the function has to name itself; a ref is how a hook
  // callback does that without reading its own binding before it exists.
  const loop = useRef<() => void>(() => {});
  useEffect(() => {
    loop.current = () => {
      frame.current = null;
      const h = hold.current;
      // Out of the zone, or at an end of the content: the repeat stops here and the next pointer
      // move starts it again if it is still wanted.
      if (h === null || !stepOnce(h)) return;

      frame.current = requestAnimationFrame(() => loop.current());
    };
  }, [stepOnce]);

  /** Ends the repeat. Called on release and cancel: a timer left running would scroll for ever. */
  const release = useCallback(() => {
    hold.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  useEffect(() => release, [release]);

  /**
   * Notes where the pointer is and starts the repeat if it is in an edge zone. Returns the
   * offset the view is at once this move's own step is taken, so the caller reads its time
   * from the content where it now is.
   */
  const follow = (clientX: number, windowLeft: number, reapply: (scrollLeft: number) => void): number => {
    const h: Hold = { clientX, windowLeft, reapply };
    hold.current = h;
    stepOnce(h);
    if (frame.current === null) frame.current = requestAnimationFrame(() => loop.current());

    return view.current.scrollLeft;
  };

  return { follow, release };
}
