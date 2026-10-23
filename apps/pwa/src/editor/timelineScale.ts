import { TIME_GRID_S } from '../play2d/transportMath';

// The timeline used to lay the whole play across the width of its panel, so a 0.1 s cell
// shrank as the window grew and a long play became unreadable on a narrow screen. A fixed
// scale in pixels per cell decouples the two: the cell keeps its size and the window scrolls
// instead of squeezing. The levels run from the default size down, so zooming out only ever
// shrinks the cell and never enlarges it past the size the coach is used to.
export const ZOOM_LEVELS: readonly number[] = [24, 18, 12, 6];

// A zoom level is the number of pixels one grid cell occupies. It is a plain number rather
// than a union of the levels above, so a level that is not on the list (a restored value, a
// test fixture) still runs through the same arithmetic.
export type ZoomLevel = number;

// Every function below returns a finite number whatever it is given. Callers feed these
// straight into a style and a scroll position, where NaN or Infinity does not fail loudly:
// it lays the timeline out at a width of NaN and the panel silently collapses. So a
// degenerate input reads as zero, the same way `timeFromClientX` treats a zero-width box.

/**
 * The pixels one second of play occupies at a given zoom.
 *
 * Derived from the grid cell rather than stored, so the scale and the grid cannot disagree
 * about how long a cell is.
 */
export function pxPerSecond(pxPerCell: number): number {
  if (!Number.isFinite(pxPerCell)) return 0;

  return pxPerCell / TIME_GRID_S;
}

/**
 * The horizontal position of a time, measured from the start of the timeline.
 *
 * A time that is not a number has no position, so it reads as the start.
 */
export function xOfTime(t: number, pxPerCell: number): number {
  if (!Number.isFinite(t)) return 0;

  const x = t * pxPerSecond(pxPerCell);

  return Number.isFinite(x) ? x : 0;
}

/**
 * The time under a horizontal position, the inverse of `xOfTime`.
 *
 * With no usable scale there is no time to read a distance against, so the result is zero
 * rather than a division by zero.
 */
export function timeAtX(x: number, pxPerCell: number): number {
  const speed = pxPerSecond(pxPerCell);

  if (!Number.isFinite(x) || speed === 0) return 0;

  const t = x / speed;

  return Number.isFinite(t) ? t : 0;
}

// How close a dropped keyframe or step must land to another to snap onto it, in pixels on
// screen. It is a distance rather than a share of the play's length because a share is a pull
// that varies with the scale: 2 % of an 18 s play is 86 px at the finest zoom and 22 px at the
// widest, so the pull would be strongest exactly where the coach zoomed in for precision, and
// weakest where they are working coarsely. A fixed distance feels the same at every level and
// on every play. Twelve pixels is half a grid cell at the finest level, which is as close as the
// grid itself resolves.
export const SNAP_RADIUS_PX = 12;

/**
 * The snap radius in seconds at a given zoom: the same distance on screen at every level, so
 * the pull feels identical whatever the scale and whatever the play's length.
 */
export function snapRadiusSeconds(pxPerCell: number): number {
  return timeAtX(SNAP_RADIUS_PX, pxPerCell);
}

/**
 * The width the timeline needs to show a play of the given duration at this zoom.
 *
 * A zero, negative or non-numeric duration is a play with no length to draw, so its width is
 * zero rather than a number the scroll container cannot use.
 */
export function contentWidthPx(duration: number, pxPerCell: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;

  return xOfTime(duration, pxPerCell);
}
