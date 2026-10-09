import type { BranchId, Play, PlayerId, PlayId, ScreenId, StepId } from '../types';

export const P1 = 'p1' as PlayerId;
export const P2 = 'p2' as PlayerId;
export const ROOT = 'root' as BranchId;
export const SWITCH = 'switch' as BranchId;
export const STEP_ENTRY = 'step-entry' as StepId;
export const SCREEN_1 = 'screen-1' as ScreenId;

export const fixturePlay: Play = {
  id: 'play-1' as PlayId,
  name: 'Horns entry',
  court: 'fiba',
  players: [
    { id: P1, team: 'offense', label: '1' },
    { id: P2, team: 'offense', label: '2' },
  ],
  rootBranchId: ROOT,
  branches: [
    {
      id: ROOT,
      parentId: null,
      forkStepId: null,
      name: 'Base',
      steps: [{ id: STEP_ENTRY, t: 2, name: 'Entry pass' }],
      screens: [{ id: SCREEN_1, t: 2, duration: 1, screenerId: P2, beneficiaryId: P1 }],
      tracks: {
        [P1]: [
          { t: 0, position: { x: 4, y: 7.5 } },
          { t: 2, position: { x: 8, y: 5 } },
          { t: 4, position: { x: 12, y: 5 } },
        ],
        [P2]: [
          { t: 0, position: { x: 4, y: 3 } },
          { t: 2, position: { x: 7, y: 3 } },
          { t: 4, position: { x: 10, y: 6 } },
        ],
        ball: [
          { t: 0, attachedTo: P1 },
          { t: 1, attachedTo: P1 },
          { t: 2, attachedTo: P2 },
          { t: 4, attachedTo: P2 },
        ],
      },
    },
    {
      id: SWITCH,
      parentId: ROOT,
      forkStepId: STEP_ENTRY,
      name: 'Defence switches',
      steps: [],
      screens: [],
      tracks: {
        [P1]: [{ t: 3, position: { x: 6, y: 9 } }],
        [P2]: [
          { t: 2, position: { x: 7, y: 3 } },
          { t: 4, position: { x: 4, y: 4 } },
        ],
        ball: [
          { t: 2, attachedTo: P2 },
          { t: 4, attachedTo: P2 },
        ],
      },
    },
  ],
};
