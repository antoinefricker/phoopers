import type { Vec2 } from '../engine';

/** The placements a coach can start a system from. */
export type LineupKind = 'empty' | 'fiveOnFive' | 'threeOnThree';

export interface Lineup {
  offense: Vec2[];
  defense: Vec2[];
}

/**
 * Starting placements, in FIBA metres on the full-court plane with the attacked basket on the
 * right. The same positions serve a half-court system and a full-court one — on a full court the
 * left half simply stays empty, which is what a set looks like before anyone has moved.
 *
 * Defenders sit a metre goal-side of their mark throughout, which is what a coach expects to see
 * on a whiteboard that has not been drawn on yet.
 */
export const LINEUPS: Record<LineupKind, Lineup> = {
  // The ball and nothing else. The coach places their own players.
  empty: { offense: [], defense: [] },
  // A standard 1-2-2 against a matched man defence.
  fiveOnFive: {
    offense: [
      { x: 16, y: 7.5 },
      { x: 20, y: 2 },
      { x: 20, y: 13 },
      { x: 23, y: 5 },
      { x: 23, y: 10 },
    ],
    defense: [
      { x: 17.5, y: 7.5 },
      { x: 21, y: 2.6 },
      { x: 21, y: 12.4 },
      { x: 23.8, y: 5.6 },
      { x: 23.8, y: 9.4 },
    ],
  },
  // A triangle of ball-handler, wing and post, each matched.
  threeOnThree: {
    offense: [
      { x: 21, y: 7.5 },
      { x: 23, y: 3 },
      { x: 25.2, y: 10.2 },
    ],
    defense: [
      { x: 22, y: 7.5 },
      { x: 23.6, y: 3.8 },
      { x: 25.6, y: 9.3 },
    ],
  },
};
