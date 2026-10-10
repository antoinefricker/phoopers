import type { BranchId, EntityId, Play, Step, StepId } from '../engine';
import { snapToStep } from '../play2d/transportMath';
import { forkTimeOf } from './mutations';

// Keyframes may not cross: the model requires ascending times. A keyframe is therefore
// confined to the open interval between its neighbours, less a hair so it never lands exactly
// on one and collides.
const EPSILON = 1e-3;

export function retimeBounds(
  play: Play,
  branchId: BranchId,
  entityId: EntityId,
  t: number,
): { min: number; max: number } {
  const track = play.branches.find((b) => b.id === branchId)?.tracks[entityId] ?? [];
  const times = track.map((k) => k.t).sort((a, b) => a - b);
  const index = times.indexOf(t);
  const floor = forkTimeOf(play, branchId);
  const previous = index > 0 ? times[index - 1] : undefined;
  const next = index >= 0 ? times[index + 1] : undefined;

  return {
    min: previous === undefined ? floor : previous + EPSILON,
    max: next === undefined ? Infinity : next - EPSILON,
  };
}

// Pointer maths can hand over NaN (a bounding box of width 0 in jsdom or during layout), and
// nothing downstream checks Step.t for finiteness, so a non-finite request keeps the keyframe
// where it was rather than propagating.
export function constrainRetime(
  play: Play,
  branchId: BranchId,
  entityId: EntityId,
  fromT: number,
  desiredT: number,
  steps: readonly Step[],
  snapThreshold: number,
): number {
  const { min, max } = retimeBounds(play, branchId, entityId, fromT);
  const wanted = Number.isFinite(desiredT) ? desiredT : fromT;
  const snapped = snapToStep(wanted, steps, snapThreshold);

  return Math.min(Math.max(snapped, min), max);
}

// The latest a step may sit: no later than anything a branch forked from it owns. `validatePlay`
// reports a keyframe earlier than its branch's fork, and the editor's own writes refuse a step or
// screen earlier than it, so dragging a fork step past any of them would reach a state the rest
// of the UI forbids. The bound is inclusive (the failure is `t < fork`, so landing exactly on the
// first keyframe is legal), and steps may share a time, so there is no epsilon. Grandchildren
// need no recursion: they fork from a step on the child, which is counted here.
function stepCeiling(play: Play, stepId: StepId): number {
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

// The step counterpart of `constrainRetime`: same order (snap first, clamp second, so the result
// can never violate a bound), but the bounds come from the branch tree rather than from track
// neighbours. The floor is the fork time of the branch that OWNS the step, which is not
// necessarily the branch on screen. `steps` are the snap targets and should exclude the step.
export function constrainStepRetime(
  play: Play,
  stepId: StepId,
  fromT: number,
  desiredT: number,
  steps: readonly Step[],
  snapThreshold: number,
): number {
  const owner = play.branches.find((b) => b.steps.some((s) => s.id === stepId));
  if (owner === undefined) return fromT;

  const wanted = Number.isFinite(desiredT) ? desiredT : fromT;
  const snapped = snapToStep(wanted, steps, snapThreshold);

  return Math.min(Math.max(snapped, forkTimeOf(play, owner.id)), stepCeiling(play, stepId));
}
