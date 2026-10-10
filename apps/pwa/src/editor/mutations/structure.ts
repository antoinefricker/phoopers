import type { Branch, BranchId, Play, PlayerId, ScreenId, Step, StepId } from '../../engine';
import { stepCeiling, writable } from './fork';

const mapBranch = (play: Play, branchId: BranchId, mutate: (b: Branch) => Branch): Play => ({
  ...play,
  branches: play.branches.map((b) => (b.id === branchId ? mutate(b) : b)),
});

// Steps are kept in ascending time order so the transport's marks and the ruler read the same
// sequence without either having to sort.
const ordered = (steps: readonly Step[]): Step[] => [...steps].sort((a, b) => a.t - b.t);

export function addStep(play: Play, branchId: BranchId, t: number, name: string, id: StepId): Play {
  if (!writable(play, branchId, t)) return play;

  return mapBranch(play, branchId, (b) => ({ ...b, steps: ordered([...b.steps, { id, t, name }]) }));
}

const mapStep = (play: Play, stepId: StepId, mutate: (s: Step) => Step): Play => ({
  ...play,
  branches: play.branches.map((b) => ({
    ...b,
    steps: ordered(b.steps.map((s) => (s.id === stepId ? mutate(s) : s))),
  })),
});

export const renameStep = (play: Play, stepId: StepId, name: string): Play =>
  mapStep(play, stepId, (s) => ({ ...s, name }));

// Bounded by the model, not only by the drag: the floor is the fork time of the branch that OWNS
// the step (not the one on screen), the ceiling is `stepCeiling`. `constrainStepRetime` clamps to
// the same bounds so a drag lands on them; this refuses what a caller bypassing it asks for.
export function moveStep(play: Play, stepId: StepId, t: number): Play {
  const owner = play.branches.find((b) => b.steps.some((s) => s.id === stepId));
  if (owner === undefined || !writable(play, owner.id, t) || t > stepCeiling(play, stepId)) return play;

  return mapStep(play, stepId, (s) => ({ ...s, t }));
}

// A step that a branch forks from cannot be removed: dropping it orphans that branch, which
// `validatePlay` reports as `fork-step-not-in-ancestors`. Removing the branch first is the
// way to remove such a step.
export function removeStep(play: Play, stepId: StepId): Play {
  if (play.branches.some((b) => b.forkStepId === stepId)) return play;

  return {
    ...play,
    branches: play.branches.map((b) => ({ ...b, steps: b.steps.filter((s) => s.id !== stepId) })),
  };
}

const DEFAULT_SCREEN_DURATION = 1;

export function addScreen(
  play: Play,
  branchId: BranchId,
  t: number,
  screenerId: PlayerId,
  beneficiaryId: PlayerId,
  id: ScreenId,
): Play {
  const known = (p: PlayerId) => play.players.some((player) => player.id === p);
  if (screenerId === beneficiaryId || !known(screenerId) || !known(beneficiaryId)) return play;
  if (!writable(play, branchId, t)) return play;

  return mapBranch(play, branchId, (b) => ({
    ...b,
    screens: [...b.screens, { id, t, duration: DEFAULT_SCREEN_DURATION, screenerId, beneficiaryId }],
  }));
}

export function setScreenDuration(play: Play, screenId: ScreenId, duration: number): Play {
  if (!Number.isFinite(duration) || duration <= 0) return play;

  return {
    ...play,
    branches: play.branches.map((b) => ({
      ...b,
      screens: b.screens.map((s) => (s.id === screenId ? { ...s, duration } : s)),
    })),
  };
}

export const removeScreen = (play: Play, screenId: ScreenId): Play => ({
  ...play,
  branches: play.branches.map((b) => ({ ...b, screens: b.screens.filter((s) => s.id !== screenId) })),
});

const ancestorChain = (play: Play, branchId: BranchId): Branch[] => {
  const chain: Branch[] = [];
  let current = play.branches.find((b) => b.id === branchId);

  // Guarded by the branch count: a cycle in parentId would otherwise spin here, and
  // `validatePlay` reports `branch-cycle` rather than preventing one.
  while (current !== undefined && chain.length <= play.branches.length) {
    chain.push(current);
    const parentId = current.parentId;
    current = parentId === null ? undefined : play.branches.find((b) => b.id === parentId);
  }

  return chain;
};

// Returns the SAME `play` reference when it refuses: the editor context detects a refused fork by
// identity (`=== play`), so changing this to return a copy would make every refusal look accepted.
export function forkBranch(play: Play, parentBranchId: BranchId, forkStepId: StepId, name: string, id: BranchId): Play {
  const onChain = ancestorChain(play, parentBranchId).some((b) => b.steps.some((s) => s.id === forkStepId));
  if (!onChain || play.branches.some((b) => b.id === id)) return play;

  return {
    ...play,
    branches: [
      ...play.branches,
      // `ball` is a required key of `tracks`; an empty track means the ball is inherited.
      { id, parentId: parentBranchId, forkStepId, name, tracks: { ball: [] }, steps: [], screens: [] },
    ],
  };
}

export function descendantsOf(play: Play, branchId: BranchId): BranchId[] {
  const seen = new Set<BranchId>([branchId]);
  const out: BranchId[] = [];
  const queue: BranchId[] = [branchId];

  // Iterative with a seen set, so a parentId cycle cannot recurse forever.
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    for (const b of play.branches) {
      if (b.parentId === next && !seen.has(b.id)) {
        seen.add(b.id);
        out.push(b.id);
        queue.push(b.id);
      }
    }
  }

  return out;
}

export function removeBranch(play: Play, branchId: BranchId): Play {
  if (branchId === play.rootBranchId) return play;
  const doomed = new Set<BranchId>([branchId, ...descendantsOf(play, branchId)]);

  return { ...play, branches: play.branches.filter((b) => !doomed.has(b.id)) };
}
