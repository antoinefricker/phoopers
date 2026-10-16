import { Box, Text } from '@mantine/core';
import type { ReactElement, ReactNode } from 'react';
import type { useTimeDrag } from './useTimeDrag';

type BarGesture = ReturnType<ReturnType<typeof useTimeDrag>['bind']>;

export interface TimelineBarProps {
  /** Where the bar starts and how wide it is, as CSS the caller has already computed. */
  leftPercent: string;
  widthPercent: string;
  background: string;
  /**
   * The colour of the handle on the right edge. Expected wherever `handle` is set, and ignored
   * otherwise — an inherited bar has no handle to paint. No default: a handle has to sit against
   * the fill it is the edge of, so no one colour is right for every bar. The default that used
   * to be here was grape, and no bar had been grape for some time.
   */
  handleBackground?: string;
  testId: string;
  /** Marks a bar belonging to an ancestor branch, which this branch may not change. */
  inherited?: boolean;
  /**
   * A gesture on the bar itself, which moves the whole span. A step's bar retimes its step this
   * way, as its tick did; a screen's bar has none, a screen being retimed from its row.
   */
  bar?: BarGesture;
  /** Names the bar for a keyboard user. Required alongside `bar`, which makes it focusable. */
  label?: string;
  /** The right edge, dragged to set where the span ends. Absent on an inherited bar. */
  handle?: { testId: string; label: string; bind: BarGesture };
  /** Drawn at the bar's end, inside it. */
  actions?: ReactNode;
  /**
   * What the bar says it is, drawn along it: a step's name, or who a screen is set for. Elided
   * when the bar is too narrow, which is why it is the bar's job and not the caller's — the room
   * it has depends on the controls the bar is carrying, and each caller guessing that number
   * drifted the moment a control moved.
   */
  caption?: ReactNode;
  /** Fades the caption, for a bar this branch may read but not change. */
  captionDimmed?: boolean;
  /** Drawn inside the bar, positioned by the caller. */
  children?: ReactNode;
}

/**
 * A span on a timeline row: a tinted bar, a handle on its right edge that sets where it ends,
 * and controls at that end.
 *
 * Shared by a screen's duration and a step label's display window. The two mean different
 * things — one is a play's content, the other is how it is annotated — but they are the same
 * object on screen, and sharing the component is what lets them be changed together.
 */
export function TimelineBar({
  leftPercent,
  widthPercent,
  background,
  handleBackground,
  testId,
  inherited,
  bar,
  label,
  handle,
  actions,
  caption,
  captionDimmed,
  children,
}: TimelineBarProps): ReactElement {
  return (
    <Box
      data-testid={testId}
      data-inherited={inherited === true ? 'true' : undefined}
      // Focusable when it carries a gesture, so the arrow keys reach it: `useTimeDrag` handles
      // them, and that is how a step is retimed without a pointer. Not a `<button>` — it holds
      // the handle and the controls, and a button may not nest interactive content.
      tabIndex={bar === undefined ? undefined : 0}
      aria-label={bar === undefined ? undefined : label}
      {...(bar ?? {})}
      style={{
        position: 'absolute',
        top: '20%',
        height: '60%',
        left: leftPercent,
        width: widthPercent,
        background,
        borderRadius: 2,
        // Transparent to the pointer unless the bar itself is draggable: a row's markers sit
        // under a screen's bar and must stay reachable, so only the handle and the controls
        // take clicks. A step's bar IS what it retimes, so it takes them.
        pointerEvents: bar === undefined ? 'none' : 'auto',
        cursor: bar === undefined ? undefined : 'grab',
        touchAction: bar === undefined ? undefined : 'none',
      }}
    >
      {children}
      {(caption !== undefined || actions !== undefined) && (
        // One row for both, so the caption's room is what the controls leave rather than a
        // number each caller writes down: the caption takes the slack and elides into it, the
        // controls keep their natural width. The padding reproduces where they already sat —
        // 4px in at the start, 8px in at the end.
        <Box
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            paddingLeft: 4,
            paddingRight: 8,
            // Transparent as a whole, like the bar under it: a row's markers sit beneath a
            // screen and must stay grabbable. The controls opt back in for themselves.
            pointerEvents: 'none',
          }}
        >
          {caption !== undefined && (
            <Text
              size="xs"
              truncate="end"
              data-testid="bar-caption"
              style={{ flex: '1 1 auto', minWidth: 0, opacity: captionDimmed === true ? 0.6 : undefined }}
            >
              {caption}
            </Text>
          )}
          {actions !== undefined && (
            <Box
              style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', pointerEvents: 'auto' }}
              // The controls carry no gesture, so nothing else stops their events reaching the
              // bar. A press would be captured by it — `useTimeDrag` calls `setPointerCapture`,
              // which retargets the click away from the control — and an arrow key would retime
              // the step.
              onPointerDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              {actions}
            </Box>
          )}
        </Box>
      )}
      {handle !== undefined && (
        // A button, not a div: the handle is reachable by keyboard, and the arrow keys retime
        // it through the same constraint the drag uses.
        <button
          type="button"
          data-testid={handle.testId}
          aria-label={handle.label}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: -3,
            width: 6,
            padding: 0,
            border: 0,
            cursor: 'ew-resize',
            touchAction: 'none',
            pointerEvents: 'auto',
            background: handleBackground,
          }}
          {...handle.bind}
        />
      )}
    </Box>
  );
}
