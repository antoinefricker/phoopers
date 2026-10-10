import type { BranchId, Play, StepId } from '../../engine';

// A child branch inherits everything before its fork from its ancestors, and a keyframe
// earlier than the fork is invalid (`keyframe-before-fork`). The editor refuses such a write
// here as well as dimming the region, so a presentation bug cannot produce an invalid play.
export function forkTimeOf(play: Play, branchId: BranchId): number {
  const branch = play.branches.find((b) => b.id === branchId);
  if (branch === undefined || branch.forkStepId === null) return 0;

  for (const candidate of play.branches) {
    const step = candidate.steps.find((s) => s.id === branch.forkStepId);
    if (step !== undefined) return step.t;
  }

  return 0;
}

// `validatePlay` does not check `Step.t` or `ScreenEvent.t`, so this is also their only finiteness guard.
// The one definition every writer shares: a write is legal when it is finite, not negative and
// not before the branch's fork.
export const writable = (play: Play, branchId: BranchId, t: number): boolean =>
  Number.isFinite(t) && t >= 0 && t >= forkTimeOf(play, branchId);

// The latest a step may sit: no later than anything a branch forked from it owns. `validatePlay`
// reports a keyframe earlier than its branch's fork, and the editor's own writes refuse a step or
// screen earlier than it, so moving a fork step past any of them would reach a state the rest
// of the model forbids. The bound is inclusive (the failure is `t < fork`, so landing exactly on
// the first keyframe is legal), and steps may share a time, so there is no epsilon. Grandchildren
// need no recursion: they fork from a step on the child, which is counted here.
export function stepCeiling(play: Play, stepId: StepId): number {
  let ceiling = Infinity;

  for (const branch of play.branches) {
    if (branch.forkStepId !== stepId) continue;

    const times = [
      ...Object.values(branch.tracks).flatMap((track) => track.map((k) => k.t)),
      ...branch.steps.map((s) => s.t),
      ...branch.screens.map((s) => s.t),
    ];
    ceiling = Math.min(ceiling, ...times);
  }

  return ceiling;
}
