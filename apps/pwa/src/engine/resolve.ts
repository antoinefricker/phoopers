import type {
  Branch,
  BranchId,
  EntityId,
  Keyframe,
  Play,
  PlayerId,
  PreparedSpan,
  ResolvedTimeline,
  ScreenEvent,
  Step,
  Vec2,
} from './types';
import { buildLut, derivedTangents, lutToParam, pointOnCubic } from './curve';
import { lerp } from './vec2';
import { applyEasing, resolveEasing } from './easing';

function chainOf(play: Play, branchId: BranchId): Branch[] {
  const byId = new Map(play.branches.map((branch) => [branch.id, branch]));
  const chain: Branch[] = [];
  const seen = new Set<BranchId>();

  let current = byId.get(branchId);
  if (current === undefined) {
    throw new Error(`unknown branch: ${branchId}`);
  }

  while (current !== undefined) {
    if (seen.has(current.id)) {
      throw new Error(`cycle in branch parents at: ${current.id}`);
    }
    seen.add(current.id);
    chain.unshift(current);
    if (current.parentId === null) {
      current = undefined;
    } else {
      const parent = byId.get(current.parentId);
      if (parent === undefined) throw new Error(`unknown parent branch: ${current.parentId}`);
      current = parent;
    }
  }

  return chain;
}

function forkTimeOf(chain: readonly Branch[], index: number): number {
  const branch = chain[index];
  // A root has no ancestors; a stray forkStepId on it is a validatePlay issue, not a crash.
  if (branch === undefined || index === 0 || branch.forkStepId === null) return 0;

  for (const ancestor of chain.slice(0, index)) {
    const step = ancestor.steps.find((candidate) => candidate.id === branch.forkStepId);
    if (step !== undefined) return step.t;
  }

  throw new Error(`fork step not found in ancestors: ${branch.forkStepId}`);
}

type TrackState = { position: Vec2 } | { attachedTo: PlayerId };

// Position along a track of positional keyframes, following the same pipeline as the
// sampler: normalised time -> easing -> arc-length inversion -> point on the cubic.
function positionOnTrack(track: readonly Keyframe[], t: number): Vec2 | undefined {
  const points = track.filter((k) => k.position !== undefined);
  const first = points[0];
  const last = points[points.length - 1];
  if (first?.position === undefined || last?.position === undefined) return undefined;
  if (t <= first.t) return first.position;
  if (t >= last.t) return last.position;

  // Neighbours are the adjacent keyframes of the full track, an attached one counting as
  // absent: exactly what prepareSpans does, so both agree on every span's tangents.
  for (let i = 0; i < track.length - 1; i += 1) {
    const from = track[i];
    const to = track[i + 1];
    if (from?.position === undefined || to?.position === undefined) continue;
    if (t === from.t) return from.position;
    if (t < from.t || t > to.t) continue;
    if (t === to.t) return to.position;

    const progress = applyEasing(resolveEasing(from.ease), (t - from.t) / (to.t - from.t));
    const derived = derivedTangents(
      track[i - 1]?.position ?? null,
      from.position,
      to.position,
      track[i + 2]?.position ?? null,
    );
    const p1 = from.handleOut ?? derived.handleOut;
    const p2 = to.handleIn ?? derived.handleIn;
    const { lut } = buildLut(from.position, p1, p2, to.position);
    return pointOnCubic(from.position, p1, p2, to.position, lutToParam(lut, progress));
  }

  return last.position;
}

function stateOf(keyframe: Keyframe): TrackState | undefined {
  if (keyframe.position !== undefined) return { position: keyframe.position };
  if (keyframe.attachedTo !== undefined) return { attachedTo: keyframe.attachedTo };
  return undefined;
}

// The state of a track at time t as exactly one of a position or an attachment, or
// undefined when the entity has no state yet at t.
function stateOnTrack(
  track: readonly Keyframe[],
  t: number,
  holderPosition: (id: PlayerId, at: number) => Vec2 | undefined,
): TrackState | undefined {
  const first = track[0];
  const last = track[track.length - 1];
  if (first === undefined || last === undefined || t < first.t) return undefined;

  const exact = track.find((k) => k.t === t);
  if (exact !== undefined) return stateOf(exact);
  if (t > last.t) return stateOf(last);

  for (let i = 0; i < track.length - 1; i += 1) {
    const from = track[i];
    const to = track[i + 1];
    if (from === undefined || to === undefined || t < from.t || t > to.t) continue;

    if (from.position !== undefined && to.position !== undefined) {
      const position = positionOnTrack(track, t);
      return position === undefined ? undefined : { position };
    }
    if (from.attachedTo !== undefined && from.attachedTo === to.attachedTo) {
      return { attachedTo: from.attachedTo };
    }

    // Mixed or changing attachment: the entity is in flight between two endpoints.
    const endpoint = (k: Keyframe): Vec2 | undefined =>
      k.position ?? (k.attachedTo === undefined ? undefined : holderPosition(k.attachedTo, k.t));
    const start = endpoint(from);
    const end = endpoint(to);
    if (start === undefined || end === undefined) return stateOf(from);
    const progress = applyEasing(resolveEasing(from.ease), (t - from.t) / (to.t - from.t));
    return { position: lerp(start, end, progress) };
  }

  return stateOf(last);
}

function entityIds(chain: readonly Branch[]): EntityId[] {
  const ids = new Set<EntityId>();
  for (const branch of chain) {
    for (const id of Object.keys(branch.tracks)) {
      ids.add(id as EntityId);
    }
  }
  return [...ids];
}

// How the span that ends at a fork boundary is shaped. That span belongs to the ancestors'
// opening, so everything about it comes from the ancestors, never from the child's keyframe
// at that instant: the child's keyframe only describes where the child departs from.
interface ForkEnd {
  next: Vec2 | null; // the ancestor's own next position, for the derived tangent
  position?: Vec2; // the ancestor's position at the fork instant (p3)
  handleIn?: Vec2; // the ancestor's incoming handle at the fork instant
}

// The flattened anchors of an entity, plus the fork-end overrides keyed by anchor index.
interface FlatTrack {
  anchors: Keyframe[];
  forkEnds: Map<number, ForkEnd>;
}

function flattenTrack(chain: readonly Branch[], entity: EntityId): FlatTrack {
  const anchors: Keyframe[] = [];
  const forks: ({ t: number } & ForkEnd)[] = [];

  for (let i = 0; i < chain.length; i += 1) {
    const branch = chain[i];
    if (branch === undefined) continue;

    const from = forkTimeOf(chain, i);
    const until = i + 1 < chain.length ? forkTimeOf(chain, i + 1) : Number.POSITIVE_INFINITY;
    const track = branch.tracks[entity] ?? [];
    const window = track.filter((k) => k.t >= from && k.t < until);

    if (i > 0 && from < until) {
      const ancestors = chain.slice(0, i);
      const parentAnchors = flattenTrack(ancestors, entity).anchors;
      const state = stateOnTrack(parentAnchors, from, (id, at) =>
        positionOnTrack(flattenTrack(ancestors, id).anchors, at),
      );
      // The parent's fork keyframe is excluded from its window, so its handles would be
      // lost; carry them so the span that ends here keeps the parent's exact shape.
      const parentFork = parentAnchors.find((k) => k.t === from);
      const handles: Pick<Keyframe, 'handleIn' | 'handleOut'> = {};
      if (state !== undefined && 'position' in state) {
        if (parentFork?.handleIn !== undefined) handles.handleIn = parentFork.handleIn;
        if (parentFork?.handleOut !== undefined) handles.handleOut = parentFork.handleOut;
      }

      // Continuity: a child whose first keyframe is later than its fork inherits the
      // parent's state at the fork instant, so it enters without teleporting.
      if (state !== undefined && !window.some((k) => k.t === from)) {
        anchors.push({ t: from, ...state, ...handles });
      }

      const parentNext = parentAnchors.find((k) => k.t > from);
      const end: ForkEnd = { next: parentNext?.position ?? null };
      if (state !== undefined && 'position' in state) {
        end.position = state.position;
        if (handles.handleIn !== undefined) end.handleIn = handles.handleIn;
      }
      forks.push({ t: from, ...end });
    }

    anchors.push(...window);
  }

  anchors.sort((a, b) => a.t - b.t);

  const forkEnds = new Map<number, ForkEnd>();
  for (const fork of forks) {
    // The last anchor at the fork instant is the one the child departs from.
    const index = anchors.findIndex((k) => k.t === fork.t);
    if (index >= 0) forkEnds.set(index, { next: fork.next, position: fork.position, handleIn: fork.handleIn });
  }

  return { anchors, forkEnds };
}

function prepareSpans(anchors: readonly Keyframe[], forkEnds: ReadonlyMap<number, ForkEnd>): PreparedSpan[] {
  const spans: PreparedSpan[] = [];

  for (let i = 0; i < anchors.length - 1; i += 1) {
    const from = anchors[i];
    const to = anchors[i + 1];
    if (from === undefined || to === undefined) continue;

    const forkEnd = forkEnds.get(i + 1);
    const fromPosition = from.position ?? { x: 0, y: 0 };
    const toPosition = forkEnd?.position ?? to.position ?? { x: 0, y: 0 };
    const derived = derivedTangents(
      anchors[i - 1]?.position ?? null,
      fromPosition,
      toPosition,
      forkEnd !== undefined ? forkEnd.next : (anchors[i + 2]?.position ?? null),
    );
    const p1 = from.handleOut ?? derived.handleOut;
    const p2 = (forkEnd === undefined ? to.handleIn : forkEnd.handleIn) ?? derived.handleIn;
    const { lut, length } = buildLut(fromPosition, p1, p2, toPosition);
    const attachedTo: PlayerId | null =
      from.attachedTo !== undefined && from.attachedTo === to.attachedTo ? from.attachedTo : null;

    spans.push({
      fromT: from.t,
      toT: to.t,
      p0: fromPosition,
      p1,
      p2,
      p3: toPosition,
      ease: resolveEasing(from.ease),
      lut,
      length,
      attachedTo,
    });
  }

  return spans;
}

export function resolveBranch(play: Play, branchId: BranchId): ResolvedTimeline {
  const chain = chainOf(play, branchId);
  // 'ball' is always present so the types are honest even for a play without a ball track.
  const anchors: Record<EntityId, Keyframe[]> = { ball: [] };
  const spans: Record<EntityId, PreparedSpan[]> = { ball: [] };

  for (const entity of entityIds(chain)) {
    const { anchors: track, forkEnds } = flattenTrack(chain, entity);
    anchors[entity] = track;
    spans[entity] = prepareSpans(track, forkEnds);
  }

  const steps: Step[] = [];
  const screens: ScreenEvent[] = [];

  for (let i = 0; i < chain.length; i += 1) {
    const branch = chain[i];
    if (branch === undefined) continue;
    const from = forkTimeOf(chain, i);
    const until = i + 1 < chain.length ? forkTimeOf(chain, i + 1) : Number.POSITIVE_INFINITY;
    // Inclusive upper bound: the fork step (and anything at the fork instant) stays visible
    // in the child's timeline, since it is what the child forks from.
    steps.push(...branch.steps.filter((s) => s.t >= from && s.t <= until));
    screens.push(...branch.screens.filter((s) => s.t >= from && s.t <= until));
  }

  const duration = Object.values(anchors).reduce((longest, track) => {
    const last = track[track.length - 1];
    return last === undefined ? longest : Math.max(longest, last.t);
  }, 0);

  return {
    branchId,
    players: play.players,
    court: play.court,
    anchors,
    spans,
    steps: steps.sort((a, b) => a.t - b.t),
    screens: screens.sort((a, b) => a.t - b.t),
    duration,
  };
}
