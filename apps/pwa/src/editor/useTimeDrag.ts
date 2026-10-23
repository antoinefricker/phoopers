import { useRef } from 'react';
import type { KeyboardEvent, PointerEvent, RefObject } from 'react';
import { timeFromClientX } from './timelineGeometry';
import { useEdgeScroll } from './useEdgeScroll';
import { useTimelineViewportContext } from './useTimelineViewportContext';
import { TIME_GRID_S, snapToGrid } from '../play2d/transportMath';

// A press that moves less than this is a click with a twitch, not a drag. Without it a 1px wobble
// while clicking a 14px marker would retime it and swallow the selection click.
export const DRAG_SLOP_PX = 3;

// How far one arrow key moves an object along the time axis. One grid cell, so a nudge lands
// where a drag would: every authored time falls on the grid, and a finer key would only leave
// the object between two cells for the next drag to round away. Shift once meant a finer step
// and now means the same one, which is kept rather than dropped so a hand that holds it is not
// surprised by nothing happening.
export const COARSE_NUDGE_S = TIME_GRID_S;
export const FINE_NUDGE_S = TIME_GRID_S;

export interface TimeGesture {
  /** Where the model has this object now: the point a keyboard nudge counts from. */
  current: number;
  /**
   * Which part of the element sits at `current`. A marker and a tick are centred on their own
   * time; a bar's LEFT EDGE is its time and it extends to the right. Measuring the grab from
   * the wrong one makes the element jump by half its width on the first move.
   */
  anchor?: 'centre' | 'start';
  /**
   * Turns a raw time into the value the gesture may actually take (the constraint). `snap` is
   * true for the pointer, which benefits from landing on a step, and false for the keyboard,
   * whose nudge is a deliberate amount the snap must not eat.
   */
  resolve: (rawT: number, snap: boolean) => number;
  /** Shows the value on the dragged element by writing its style: no state, no render. */
  place: (element: HTMLElement, value: number) => void;
  /** Puts the element back where the model has it, so a refused commit does not leave it adrift. */
  restore: (element: HTMLElement) => void;
  /** Called once on release — and only if the pointer actually moved — or once per arrow key. */
  commit: (value: number) => void;
}

/**
 * A drag along a time axis. The pointer maps to a time across `trackRef`, the gesture resolves
 * that through its constraint, and the element follows it by direct style writes. The model is
 * written once, on release, so a gesture is one undoable commit and a marker can never sit
 * somewhere the model would refuse.
 */
export function useTimeDrag(trackRef: RefObject<HTMLElement | null>, duration: number) {
  const active = useRef<{ gesture: TimeGesture; moved: boolean; value: number; startX: number; grab: number } | null>(
    null,
  );
  const dragged = useRef(false);
  const { pxPerCell, scrollLeft } = useTimelineViewportContext();
  const edge = useEdgeScroll();

  const bind = (gesture: TimeGesture) => ({
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      dragged.current = false;
      // An ancestor may carry a gesture of its own — a step's bar holds this handle — and must
      // not act on an event this one has taken.
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      // Where on the element it was grabbed. The element follows the pointer's DELTA, not its
      // absolute position, so grabbing a marker off-centre does not make it jump on the first move.
      const box = event.currentTarget.getBoundingClientRect();
      const anchorX = gesture.anchor === 'start' ? box.left : box.left + box.width / 2;
      const grab = event.clientX - anchorX;
      active.current = {
        gesture,
        moved: false,
        value: 0,
        startX: event.clientX,
        grab: Number.isFinite(grab) ? grab : 0,
      };
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      event.stopPropagation();
      const drag = active.current;
      const measured = trackRef.current?.getBoundingClientRect();
      if (drag === null || measured === undefined) return;

      if (!drag.moved && Math.abs(event.clientX - drag.startX) < DRAG_SLOP_PX) return;

      drag.moved = true;
      // The view moves BEFORE the time is read, so the time the gesture resolves is the one under
      // the pointer once the view has moved, not the one it had just left. The track is the
      // translated content, so the window's own left edge is its left plus the offset.
      const windowLeft = measured.left + scrollLeft;
      const element = event.currentTarget;
      // Also run by each frame while the pointer is held at the edge, when no move event comes.
      const retime = (clientX: number, scrolled: number) => {
        // The content's left edge is worked out from the window's rather than re-measured: the
        // DOM has not caught up with the offset just written.
        const rect = new DOMRect(windowLeft - scrolled, measured.top, measured.width, measured.height);
        // Snapped to the grid BEFORE the gesture constrains it, never after: a constraint stops a
        // keyframe just short of its neighbour, and rounding that result would land it on top of
        // the thing the constraint exists to keep it off. The bound keeps the last word, so a
        // value that meets one can sit off the grid.
        drag.value = drag.gesture.resolve(
          snapToGrid(timeFromClientX(clientX - drag.grab, rect, pxPerCell, duration)),
          true,
        );
        drag.gesture.place(element, drag.value);
      };
      const scrolled = edge.follow(event.clientX, windowLeft, (next) => retime(event.clientX, next));
      retime(event.clientX, scrolled);
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      event.stopPropagation();
      const drag = active.current;
      active.current = null;
      edge.release();
      // A press with no movement is a click, not a retime.
      if (drag === null || !drag.moved) return;

      dragged.current = true;
      drag.gesture.restore(event.currentTarget);
      drag.gesture.commit(drag.value);
    },
    onPointerCancel: (event: PointerEvent<HTMLElement>) => {
      event.stopPropagation();
      const drag = active.current;
      active.current = null;
      edge.release();
      if (drag?.moved) drag.gesture.restore(event.currentTarget);
    },
    // The keyboard route to the same constraint. It writes the model on every press rather than
    // on a release, so there is nothing to place or restore: the element re-renders at its new
    // time. The arrows are the axis, Shift is the fine amount; everything else falls through, so
    // the Delete that removes a keyframe and the Enter that opens a step's editor still reach it.
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (direction === 0) return;

      event.preventDefault();
      // Consumed here: a bar carrying its own gesture would otherwise retime its step as well
      // as resizing what the handle inside it sets.
      event.stopPropagation();
      const delta = direction * (event.shiftKey ? FINE_NUDGE_S : COARSE_NUDGE_S);
      const value = gesture.resolve(snapToGrid(gesture.current + delta), false);
      // A nudge into a bound resolves back to where it already is. Committing that would be a
      // no-op write that still rebuilds the play, so it is skipped.
      if (value !== gesture.current) gesture.commit(value);
    },
  });

  /** True once after a drag: the click the browser fires on release must not also select or open. */
  const consumeDrag = () => {
    const was = dragged.current;
    dragged.current = false;

    return was;
  };

  return { bind, consumeDrag };
}
