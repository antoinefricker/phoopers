import type { EntityId, Keyframe, ResolvedTimeline } from '../engine';
import { TIME_GRID_S, gridTime } from '../play2d/transportMath';
import { timeAtX, xOfTime } from './timelineScale';

export interface TimelineRowModel {
  entityId: EntityId;
  /** The number drawn inside the symbol. Empty for the ball, which wears none. */
  number: string;
  /** The coach's own name for the entity, absent while they have not given one. */
  label?: string;
  team: 'offense' | 'defense' | 'ball';
  keyframes: Keyframe[];
}

// A keyframe marker is an upright rectangle, taller than it is wide, so it reads as an instant
// rather than as a blob. It is centred on its time with `translate(-50%)`, so it reaches half
// its WIDTH past that time — which is what the track has to keep room for at either end.
export const MARKER_WIDTH_PX = 12;
export const MARKER_HEIGHT_PX = 18;

// Both live with the shared axis geometry because the transport needs them too: the inset is
// the room each end of the axis keeps, and must stay at or above half `MARKER_WIDTH_PX` or a
// marker at t = 0 or t = duration overflows its track again; the gutter is the scrollbar's
// width, reserved on the scrubber as well as on the tracks so the axis ends at one x.
export { SCROLLBAR_GUTTER_PX, SCRUBBER_AXIS_PX, TRACK_INSET_PX } from '../play2d/transportMath';

// Past this many lines the grid stops being a reading aid and becomes a smear of DOM nodes, so
// a play long enough to cross it keeps only its whole seconds. 240 is four minutes of them.
const MAX_GRID_LINES = 240;

export interface GridTick {
  t: number;
  /** A whole second, drawn more strongly than the half-second between two of them. */
  major: boolean;
}

/**
 * The vertical lines behind the ruler and the tracks: one per `TIME_GRID_S` cell, from 0 to the
 * duration inclusive, each marked major on a whole second.
 *
 * The cell is the authoring grid, so a minor line is literally "a time a keyframe can take".
 * A duration that is not a positive number has no grid rather than one line or an endless loop.
 *
 * Times come from `gridTime`, which is what keeps a cell count a clean decimal: accumulating
 * the cell, or simply multiplying by it, drifts into values like 6.300000000000001 that miss
 * the `% 1 === 0` test deciding major from minor.
 */
export function gridTicks(duration: number): GridTick[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];

  const cells = Math.floor(duration / TIME_GRID_S);
  // Minors first, and only while they stay legible; beyond that the whole seconds carry the grid.
  const step = cells + 1 > MAX_GRID_LINES ? Math.round(1 / TIME_GRID_S) : 1;
  const ticks: GridTick[] = [];
  for (let index = 0; index <= cells; index += step) {
    const t = gridTime(index);
    ticks.push({ t, major: t % 1 === 0 });
  }

  return ticks;
}

/** A time as a distance from the start of the timeline, ready for a bar's `left`. */
export const leftPx = (t: number, pxPerCell: number): string => `${xOfTime(t, pxPerCell)}px`;

/** The span from `from` to `to` as a distance, ready for a bar's `width`. */
export const spanPx = (from: number, to: number, pxPerCell: number): string =>
  `${xOfTime(to, pxPerCell) - xOfTime(from, pxPerCell)}px`;

/**
 * The `place` and `restore` a bar's right-edge handle needs, which are the same for every bar
 * that has one: dragging the edge changes the bar's WIDTH, and the bar is the handle's parent.
 *
 * Both a screen's duration and a step label's window are resized this way, and both used to
 * carry their own copy of the parent lookup and the width formula — four of them between the
 * two, which is three too many for a rule that is identical in every case.
 *
 * `from` is where the span starts and does not move; `to` is where it ends when the drag is
 * abandoned. A handle with no parent writes nothing rather than throwing: the drag is a
 * presentational preview, and the commit that follows it reads the model, not the DOM.
 */
export function barResize(from: number, to: number, pxPerCell: number) {
  const setWidth = (element: HTMLElement, end: number) => {
    const bar = element.parentElement;
    if (bar !== null) bar.style.width = spanPx(from, end, pxPerCell);
  };

  return {
    place: (element: HTMLElement, value: number) => setWidth(element, value),
    restore: (element: HTMLElement) => setWidth(element, to),
  };
}

// Reads `anchors`, which carries each entity's keyframes, NOT `spans`: a prepared span
// substitutes {0,0} for an attached ball endpoint, so building rows from spans would draw the
// ball's markers at the court corner. A player with no track still gets a row (empty), so the
// coach can see they have no motion and has a row on which to author it.
export function rowsOf(timeline: ResolvedTimeline): TimelineRowModel[] {
  const players: TimelineRowModel[] = timeline.players.map((player) => ({
    entityId: player.id,
    number: player.number,
    label: player.label,
    team: player.team,
    keyframes: timeline.anchors[player.id] ?? [],
  }));

  // The ball leads. It is the one row a coach never reorders — it is not a player and has no
  // place in `play.players`, which carries the order of everything that is — so it sits where
  // nothing has to be dragged past it.
  // The ball wears no number and is never renamed: the views name it outright.
  return [{ entityId: 'ball', number: '', team: 'ball', keyframes: timeline.anchors.ball ?? [] }, ...players];
}

// Maps a pointer's x to a time across a row, reading its distance from the row's left edge
// against the scale rather than against the box's width: the row is as wide as the play needs
// at the current zoom, so its width says nothing the scale does not. The play's end is still the
// upper bound, which is why the duration comes along. Nothing downstream checks a time for
// finiteness, so every degenerate input resolves to 0 rather than NaN.
export function timeFromClientX(clientX: number, rect: DOMRect, pxPerCell: number, duration: number): number {
  if (!(duration > 0)) return 0;

  return Math.min(Math.max(timeAtX(clientX - rect.left, pxPerCell), 0), duration);
}
