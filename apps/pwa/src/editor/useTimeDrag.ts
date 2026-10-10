import { useRef } from 'react';
import type { PointerEvent, RefObject } from 'react';
import { timeFromClientX } from './timelineGeometry';

// A press that moves less than this is a click with a twitch, not a drag. Without it a 1px wobble
// while clicking a 14px marker would retime it and swallow the selection click.
export const DRAG_SLOP_PX = 3;

export interface TimeGesture {
  /** Turns the pointer's raw time into the value the gesture may actually take (the constraint). */
  resolve: (rawT: number) => number;
  /** Shows the value on the dragged element by writing its style: no state, no render. */
  place: (element: HTMLElement, value: number) => void;
  /** Puts the element back where the model has it, so a refused commit does not leave it adrift. */
  restore: (element: HTMLElement) => void;
  /** Called once, on release, and only if the pointer actually moved. */
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

  const bind = (gesture: TimeGesture) => ({
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      dragged.current = false;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      // Where on the element it was grabbed. The element follows the pointer's DELTA, not its
      // absolute position, so grabbing a marker off-centre does not make it jump on the first move.
      const box = event.currentTarget.getBoundingClientRect();
      const grab = event.clientX - (box.left + box.width / 2);
      active.current = {
        gesture,
        moved: false,
        value: 0,
        startX: event.clientX,
        grab: Number.isFinite(grab) ? grab : 0,
      };
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const drag = active.current;
      const rect = trackRef.current?.getBoundingClientRect();
      if (drag === null || rect === undefined) return;

      if (!drag.moved && Math.abs(event.clientX - drag.startX) < DRAG_SLOP_PX) return;

      drag.moved = true;
      drag.value = drag.gesture.resolve(timeFromClientX(event.clientX - drag.grab, rect, duration));
      drag.gesture.place(event.currentTarget, drag.value);
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      const drag = active.current;
      active.current = null;
      // A press with no movement is a click, not a retime.
      if (drag === null || !drag.moved) return;

      dragged.current = true;
      drag.gesture.restore(event.currentTarget);
      drag.gesture.commit(drag.value);
    },
    onPointerCancel: (event: PointerEvent<HTMLElement>) => {
      const drag = active.current;
      active.current = null;
      if (drag?.moved) drag.gesture.restore(event.currentTarget);
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
