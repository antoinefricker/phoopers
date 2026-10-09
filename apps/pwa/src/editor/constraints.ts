import type { BranchId, EntityId, Play, Step } from '../engine';
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
