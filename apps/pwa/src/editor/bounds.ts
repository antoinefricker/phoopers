import type { Play, Vec2 } from '../engine';
import { COURT_DIMENSIONS, OUT_OF_BOUNDS_MARGIN, extentOf } from '../engine';

/**
 * The part of a play that decides where editing may reach: which floor, and how much of it.
 *
 * Narrower than `Play` on purpose — `createPlay` has to place the ball from the court it is
 * about to build, before any `Play` exists to pass.
 */
export type CourtChoice = Pick<Play, 'court' | 'extent'>;

/** How far past the shown floor anything may be put. The same metre the view's apron draws. */
export const DROP_MARGIN = OUT_OF_BOUNDS_MARGIN;

export interface CourtBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Where the shown floor starts, along the length: the baseline, or the halfway line. */
const startX = (play: CourtChoice): number => (extentOf(play) === 'half' ? COURT_DIMENSIONS[play.court].length / 2 : 0);

/**
 * Where a player or the ball may be put, in metres.
 *
 * The shown floor widened by `DROP_MARGIN` on every side, the halfway cut of a half-court
 * system included: a defender dropping back out of a set belongs in the picture, and anything
 * put outside these bounds would be drawn where it cannot be clicked again.
 */
export function courtBounds(play: CourtChoice): CourtBounds {
  const { length, width } = COURT_DIMENSIONS[play.court];

  return {
    minX: startX(play) - DROP_MARGIN,
    maxX: length + DROP_MARGIN,
    minY: -DROP_MARGIN,
    maxY: width + DROP_MARGIN,
  };
}

/**
 * The middle of what is on screen — the floor's centre, or the centre of the shown half.
 *
 * Without the margin: this is where something lands when it has nowhere better to go, and that
 * should be the middle of the picture, not the middle of the picture plus its apron.
 */
export function displayedCentre(play: CourtChoice): Vec2 {
  const { length, width } = COURT_DIMENSIONS[play.court];

  return { x: (startX(play) + length) / 2, y: width / 2 };
}
