import type { BranchId, Keyframe, Play, PlayerId, PlayId, ScreenId, StepId } from '../engine';

// A horns set on a FIBA floor, attacking the basket at the right-hand end (ring centre at
// x = 26.425, y = 7.5). Coordinates are court metres, origin at a corner.
//
// Markings used for placement: the free-throw line is at x = 22.2, so the elbows are at
// (22.2, 5.05) and (22.2, 9.95); the three-point arc is 6.75 m from the ring (top at
// x = 19.675, corners 0.9 m in from the sidelines).

const O1 = 'o1' as PlayerId;
const O2 = 'o2' as PlayerId;
const O3 = 'o3' as PlayerId;
const O4 = 'o4' as PlayerId;
const O5 = 'o5' as PlayerId;
const X1 = 'x1' as PlayerId;
const X2 = 'x2' as PlayerId;
const X3 = 'x3' as PlayerId;
const X4 = 'x4' as PlayerId;
const X5 = 'x5' as PlayerId;

export const HORNS_ROOT = 'horns-root' as BranchId;
export const HORNS_SWITCH = 'horns-switch' as BranchId;
export const HORNS_STEP_ENTRY = 'horns-step-entry' as StepId;
export const HORNS_STEP_SCREEN = 'horns-step-screen' as StepId;

const at = (t: number, x: number, y: number): Keyframe => ({ t, position: { x, y } });

// A stop: both handles sit on the point, so a player standing still stays still instead of
// drifting along tangents derived from the neighbouring keyframes.
const hold = (t: number, x: number, y: number): Keyframe => ({
  t,
  position: { x, y },
  handleIn: { x, y },
  handleOut: { x, y },
});

export const hornsPlay: Play = {
  id: 'horns' as PlayId,
  name: 'Horns — high double screen',
  court: 'fiba',
  rootBranchId: HORNS_ROOT,
  players: [
    { id: O1, team: 'offense', label: '1' },
    { id: O2, team: 'offense', label: '2' },
    { id: O3, team: 'offense', label: '3' },
    { id: O4, team: 'offense', label: '4' },
    { id: O5, team: 'offense', label: '5' },
    { id: X1, team: 'defense', label: 'X1' },
    { id: X2, team: 'defense', label: 'X2' },
    { id: X3, team: 'defense', label: 'X3' },
    { id: X4, team: 'defense', label: 'X4' },
    { id: X5, team: 'defense', label: 'X5' },
  ],
  branches: [
    {
      id: HORNS_ROOT,
      parentId: null,
      forkStepId: null,
      name: 'Base',
      steps: [
        { id: HORNS_STEP_SCREEN, t: 2, name: 'Double high screen' },
        { id: HORNS_STEP_ENTRY, t: 4, name: 'Entry pass' },
      ],
      screens: [
        { id: 'screen-4' as ScreenId, t: 2, duration: 1.5, screenerId: O4, beneficiaryId: O1 },
        { id: 'screen-5' as ScreenId, t: 2, duration: 1.5, screenerId: O5, beneficiaryId: O1 },
      ],
      tracks: {
        // 1 dribbles up (0-4), uses the screens, passes to 2 in the corner (4-5). 2 holds the
        // ball through a drive into the paint (5-7), then shoots: the ball is free from 7 to 8.
        [O1]: [at(0, 16, 7.5), at(2, 19, 7.5), at(4, 21, 9.5), at(7, 21.5, 10.5)],
        // 2 waits in the right corner, then drives toward the basket.
        [O2]: [hold(0, 24.6, 14), hold(4, 24.6, 14), hold(5, 24.6, 14), at(7, 25, 9.4), hold(8, 25, 9.4)],
        // 3 spaces the weak-side wing, just outside the arc.
        [O3]: [hold(0, 22.5, 1.8), hold(4, 22.5, 1.8), hold(8, 22.5, 1.8)],
        // The bigs walk to the elbows and anchor the screens from t = 2.
        [O4]: [at(0, 20.5, 4), hold(2, 22, 5.2), hold(4, 22, 5.2), hold(8, 22, 5.2)],
        [O5]: [at(0, 20.5, 11), hold(2, 22, 9.8), hold(4, 22, 9.8), hold(8, 22, 9.8)],
        // X1 chases 1 over the screen and trails.
        [X1]: [at(0, 17.4, 7.5), at(2, 20.3, 7.6), at(4, 22.2, 8.7), at(7, 22.5, 9.3)],
        // X2 guards the corner, then slides with the drive on the baseline side.
        [X2]: [hold(0, 25.6, 13.1), hold(4, 25.6, 13.1), hold(5, 25.6, 13.1), at(7, 26, 10.5), hold(8, 26, 10.5)],
        [X3]: [hold(0, 23.6, 2.6), hold(4, 23.6, 2.6), hold(5, 23.6, 2.6), hold(8, 23.6, 2.9)],
        [X4]: [at(0, 21.8, 4.4), hold(2, 23.2, 5.3), hold(4, 23.2, 5.3), hold(8, 23.2, 5.3)],
        // X5 steps up to hedge the screen, then drops back toward the ball.
        [X5]: [at(0, 21.8, 10.6), at(2, 23.2, 9.9), at(4, 23.4, 9.8), at(8, 23.6, 10.4)],
        ball: [
          { t: 0, attachedTo: O1 },
          { t: 4, attachedTo: O1 },
          { t: 5, attachedTo: O2 },
          { t: 7, attachedTo: O2 },
          { t: 8, position: { x: 26.4, y: 7.5 } },
        ],
      },
    },
    {
      id: HORNS_SWITCH,
      parentId: HORNS_ROOT,
      forkStepId: HORNS_STEP_ENTRY,
      name: 'Switch to the weak side',
      steps: [],
      screens: [],
      tracks: {
        // Same opening; at the entry step 1 swings the ball to 3 instead, and 3 drives.
        [O1]: [at(7, 21.5, 10.5)],
        [O3]: [hold(5, 22.5, 1.8), at(7, 24.4, 4.6), hold(8, 24.4, 4.6)],
        [X1]: [at(7, 22.5, 9.3)],
        [X3]: [hold(5, 23.6, 2.6), at(7, 25.2, 5.6), hold(8, 25.2, 5.6)],
        [X5]: [at(8, 23.6, 10.4)],
        ball: [
          { t: 4, attachedTo: O1 },
          { t: 5, attachedTo: O3 },
          { t: 7, attachedTo: O3 },
          { t: 8, position: { x: 26.4, y: 7.5 } },
        ],
      },
    },
  ],
};
