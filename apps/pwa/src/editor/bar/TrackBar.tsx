import { Box, Text } from '@mantine/core';
import type { ReactElement, ReactNode } from 'react';
import type { BarGesture } from './BarHandle';

export interface TrackBarProps {
  /** Where the bar starts and how wide it is, as CSS the caller has already computed. */
  left: string;
  width: string;
  testId: string;
  /** Where the bar sits in its row, as CSS: a fifth of the way down, left out. */
  top?: string;
  /** How tall the bar is, as CSS: three fifths of its row, left out. */
  height?: string;
  background: string;
  /** Any CSS colour. Left out, the bar has no border. */
  borderColor?: string;
  /** Any CSS colour: the message's. Left out, the text's own. */
  messageColor?: string;
  /** What the bar says it is, drawn along it. Elided when the bar is too narrow. */
  message?: ReactNode;
  /** Fades the message, for a bar this branch may read but not change. */
  messageDimmed?: boolean;
  /** The handle on the left edge, or none. A `BarHandle`, which the bar sizes and places. */
  startHandle?: ReactNode | null;
  /** The handle on the right edge, or none. A `BarHandle`, which the bar sizes and places. */
  endHandle?: ReactNode | null;
  /** The controls drawn at the bar's end, inside it: `BarActionButton`s, in order. */
  actions?: ReactNode[];
  /**
   * How wide a handle is, as CSS: one grid cell, so a handle occupies the cell it sets the edge
   * of. Never more than half the bar, so a bar as short as it may be still has room for both.
   * Left out, a handle is a 6px strip.
   */
  handleWidth?: string;
  /** Marks a bar belonging to an ancestor branch, which this branch may not change. */
  inherited?: boolean;
  /**
   * A gesture on the bar itself, which moves the whole span. A step's bar retimes its step this
   * way; a screen's bar has none, a screen being retimed from its row.
   */
  bar?: BarGesture;
  /** Names the bar for a keyboard user. Required alongside `bar`, which makes it focusable. */
  label?: string;
  /**
   * How far from the bar's start, in px, the message must begin to stay clear of something drawn
   * over the bar's start: a row's keyframe marker, which sits above the bars. At least the bar's
   * own padding; left out, the message starts there.
   */
  messageClearPx?: number;
}

/**
 * A span on a timeline row: a tinted bar, a handle on each edge that sets where it starts and
 * ends, and controls at the end. What goes in each slot is the caller's: the bar owns the layout
 * (where the handles sit, how much room the message keeps) and not the look of its parts.
 *
 * Shared by a screen's duration and a step label's display window. The two mean different
 * things — one is a play's content, the other is how it is annotated — but they are the same
 * object on screen, and sharing the component is what lets them be changed together.
 */
export function TrackBar({
  left,
  width,
  testId,
  top = '20%',
  height = '60%',
  background,
  borderColor,
  messageColor,
  message,
  messageDimmed,
  startHandle = null,
  endHandle = null,
  actions = [],
  handleWidth = '6px',
  inherited,
  bar,
  label,
  messageClearPx = 0,
}: TrackBarProps): ReactElement {
  const hasStart = startHandle !== null;
  const hasEnd = endHandle !== null;

  return (
    <Box
      data-testid={testId}
      data-inherited={inherited === true ? 'true' : undefined}
      // Focusable when it carries a gesture, so the arrow keys reach it: `useTimeDrag` handles
      // them, and that is how a step is retimed without a pointer. Not a `<button>` — it holds
      // the handles and the controls, and a button may not nest interactive content.
      tabIndex={bar === undefined ? undefined : 0}
      aria-label={bar === undefined ? undefined : label}
      {...(bar ?? {})}
      style={{
        position: 'absolute',
        top,
        height,
        left,
        width,
        background,
        border: borderColor === undefined ? undefined : `1px solid ${borderColor}`,
        borderRadius: 2,
        // Transparent to the pointer unless the bar itself is draggable: a row's markers sit
        // under a screen's bar and must stay reachable, so only the handles and the controls
        // take clicks. A step's bar IS what it retimes, so it takes them.
        pointerEvents: bar === undefined ? 'none' : 'auto',
        cursor: bar === undefined ? undefined : 'grab',
        touchAction: bar === undefined ? undefined : 'none',
      }}
    >
      {(message !== undefined || actions.length > 0) && (
        // One row for both, so the message's room is what the controls leave rather than a
        // number each caller writes down: the message takes the slack and elides into it, the
        // controls keep their natural width.
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
            // Even on both sides, 8px, or past a handle where there is one: a handle covers a
            // whole cell and would sit over the message or the controls; the 2px it always left
            // is kept.
            paddingLeft: hasStart ? `calc(${edgeWidth(handleWidth)} + 2px)` : Math.max(8, messageClearPx),
            paddingRight: hasEnd ? `calc(${edgeWidth(handleWidth)} + 2px)` : 8,
            // Transparent as a whole, like the bar under it: a row's markers sit beneath a
            // screen and must stay grabbable. The controls opt back in for themselves.
            pointerEvents: 'none',
          }}
        >
          {message !== undefined && (
            <Text
              size="xs"
              truncate="end"
              data-testid="bar-caption"
              c={messageColor}
              style={{ flex: '1 1 auto', minWidth: 0, opacity: messageDimmed === true ? 0.6 : undefined }}
            >
              {message}
            </Text>
          )}
          {actions.length > 0 && (
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
      {hasStart && <HandleSlot edge="left" width={edgeWidth(handleWidth)} handle={startHandle} />}
      {hasEnd && <HandleSlot edge="right" width={edgeWidth(handleWidth)} handle={endHandle} />}
    </Box>
  );
}

/** A handle's width: a cell, but at most half the bar, which is what keeps two from overlapping. */
const edgeWidth = (handleWidth: string): string => `min(${handleWidth}, 50%)`;

/** Where a handle sits: the bar's edge, full height, the handle centring itself in it. */
function HandleSlot({ edge, width, handle }: { edge: 'left' | 'right'; width: string; handle: ReactNode }) {
  return (
    <Box
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        [edge]: 0,
        width,
        display: 'flex',
        alignItems: 'center',
        // The handle opts back in; the slot is as transparent as the bar around it.
        pointerEvents: 'none',
      }}
    >
      {handle}
    </Box>
  );
}
