import type { Branch, BranchId, EntityId, Keyframe, Play, PlayerId, Vec2 } from '../../engine';
import { writable } from './fork';

const mapBranch = (play: Play, branchId: BranchId, mutate: (branch: Branch) => Branch): Play => ({
  ...play,
  branches: play.branches.map((b) => (b.id === branchId ? mutate(b) : b)),
});

// Keyframes are stored in ascending time order; every writer goes through this so the model's
// monotonic ordering is a property of the module rather than of each call site.
const upsert = (keyframes: readonly Keyframe[], next: Keyframe): Keyframe[] =>
  [...keyframes.filter((k) => k.t !== next.t), next].sort((a, b) => a.t - b.t);

function writeKeyframe(play: Play, branchId: BranchId, entityId: EntityId, next: Keyframe): Play {
  if (!writable(play, branchId, next.t)) return play;

  return mapBranch(play, branchId, (branch) => ({
    ...branch,
    tracks: { ...branch.tracks, [entityId]: upsert(branch.tracks[entityId] ?? [], next) },
  }));
}

export const setKeyframe = (play: Play, branchId: BranchId, entityId: EntityId, t: number, position: Vec2): Play =>
  writeKeyframe(play, branchId, entityId, { t, position });

export function attachBall(play: Play, branchId: BranchId, t: number, playerId: PlayerId): Play {
  if (!play.players.some((p) => p.id === playerId)) return play;

  return writeKeyframe(play, branchId, 'ball', { t, attachedTo: playerId });
}

export const releaseBall = (play: Play, branchId: BranchId, t: number, position: Vec2): Play =>
  writeKeyframe(play, branchId, 'ball', { t, position });

export function removeKeyframe(play: Play, branchId: BranchId, entityId: EntityId, t: number): Play {
  const branch = play.branches.find((b) => b.id === branchId);
  const current = branch?.tracks[entityId] ?? [];
  if (!current.some((k) => k.t === t)) return play;
  if (entityId !== 'ball' && current.length <= 1) return play;

  return mapBranch(play, branchId, (b) => ({
    ...b,
    tracks: { ...b.tracks, [entityId]: current.filter((k) => k.t !== t) },
  }));
}

export function moveKeyframe(play: Play, branchId: BranchId, entityId: EntityId, fromT: number, toT: number): Play {
  const branch = play.branches.find((b) => b.id === branchId);
  const current = branch?.tracks[entityId] ?? [];
  const moving = current.find((k) => k.t === fromT);
  if (moving === undefined) return play;
  if (!writable(play, branchId, toT)) return play;
  if (current.some((k) => k.t === toT)) return play;

  return mapBranch(play, branchId, (b) => ({
    ...b,
    tracks: {
      ...b.tracks,
      [entityId]: upsert(
        current.filter((k) => k.t !== fromT),
        { ...moving, t: toT },
      ),
    },
  }));
}
