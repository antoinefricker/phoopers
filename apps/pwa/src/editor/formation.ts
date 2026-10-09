import type { Vec2 } from '../engine';

// A standard 1-2-2 against a matched man defence, in FIBA metres on the right-hand half.
// Defenders sit one metre goal-side of their mark, which is what a coach expects to see
// before anyone has moved.
export const FORMATION: { offense: Vec2[]; defense: Vec2[] } = {
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
};
