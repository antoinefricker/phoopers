import type { CourtExtent, Play } from './types';

/**
 * How far out of bounds anything may be put, in metres.
 *
 * A set starts with players out of bounds, so the editor lets them stand a metre past the lines
 * and the drawing leaves exactly that much room around the floor. Both the editor's bounds and
 * the view's apron derive from this one value: they are the same metre, and letting them drift
 * apart draws a token where it cannot be seen or clicked.
 */
export const OUT_OF_BOUNDS_MARGIN = 1;

/** A play written before systems declared their extent is a full-court one. */
export const extentOf = (play: Pick<Play, 'extent'>): CourtExtent => play.extent ?? 'full';
