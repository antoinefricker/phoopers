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

/**
 * How far apart two player tokens have to be not to cover each other, in metres.
 *
 * A token is 0.9 m across, so centres any closer than that overlap. An overlapped player stops
 * answering clicks — hit targets are drawn in roster order and the newest sits on top — so the
 * one underneath cannot be picked up again until the other is dragged away.
 */
export const PLAYER_CLEARANCE = 0.9;

/** How far each attempt moves, in metres. Wider than a token, so one step always clears one. */
const STEP = 2;

/** How many steps to try before giving up and using the point as asked. */
const ATTEMPTS = 4;

/**
 * The nearest free place to put something, starting from where it was meant to go.
 *
 * Steps away from the attacked basket — which is towards midcourt, the basket being on the
 * right — until it finds a spot inside the bounds with nobody within `clearance` of it. Where
 * every attempt is taken or out of bounds it returns the point as asked: a token on top of
 * another is bad, but a token somewhere arbitrary is worse, and the coach can always drag it.
 */
export function freeSpot(play: CourtChoice, preferred: Vec2, taken: readonly Vec2[], clearance: number): Vec2 {
  const { minX, maxX } = courtBounds(play);
  const clear = (at: Vec2) => taken.every((p) => Math.hypot(p.x - at.x, p.y - at.y) >= clearance);

  for (let step = 0; step <= ATTEMPTS; step += 1) {
    const at = { x: preferred.x - step * STEP, y: preferred.y };
    if (at.x < minX || at.x > maxX) break;
    if (clear(at)) return at;
  }

  return preferred;
}
