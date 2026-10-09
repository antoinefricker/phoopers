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
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }

  return chain;
}

function forkTimeOf(chain: readonly Branch[], index: number): number {
  const branch = chain[index];
  if (branch === undefined || branch.forkStepId === null) return 0;

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

  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i];
    const to = points[i + 1];
    if (from?.position === undefined || to?.position === undefined) continue;
    if (t === from.t) return from.position;
    if (t < from.t || t > to.t) continue;
    if (t === to.t) return to.position;

    const progress = applyEasing(resolveEasing(from.ease), (t - from.t) / (to.t - from.t));
    const derived = derivedTangents(
      points[i - 1]?.position ?? null,
      from.position,
      to.position,
      points[i + 2]?.position ?? null,
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
  holderPosition: (id: PlayerId) => Vec2 | undefined,
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
      k.position ?? (k.attachedTo === undefined ? undefined : holderPosition(k.attachedTo));
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

function flattenTrack(chain: readonly Branch[], entity: EntityId): Keyframe[] {
  const anchors: Keyframe[] = [];

  for (let i = 0; i < chain.length; i += 1) {
    const branch = chain[i];
    if (branch === undefined) continue;

    const from = forkTimeOf(chain, i);
    const until = i + 1 < chain.length ? forkTimeOf(chain, i + 1) : Number.POSITIVE_INFINITY;
    const track = branch.tracks[entity] ?? [];
    const window = track.filter((k) => k.t >= from && k.t < until);

    // Continuity: a child whose first keyframe is later than its fork inherits the
    // parent's state at the fork instant, so it enters without teleporting.
    if (i > 0 && from < until) {
      const hasFork = window.some((k) => k.t === from);
      if (!hasFork) {
        const ancestors = chain.slice(0, i);
        const state = stateOnTrack(flattenTrack(ancestors, entity), from, (id) =>
          positionOnTrack(flattenTrack(ancestors, id), from),
        );
        if (state !== undefined) anchors.push({ t: from, ...state });
      }
    }

    anchors.push(...window);
  }

  return anchors.sort((a, b) => a.t - b.t);
}

function prepareSpans(anchors: readonly Keyframe[]): PreparedSpan[] {
  const spans: PreparedSpan[] = [];

  for (let i = 0; i < anchors.length - 1; i += 1) {
    const from = anchors[i];
    const to = anchors[i + 1];
    if (from === undefined || to === undefined) continue;

    const fromPosition = from.position ?? { x: 0, y: 0 };
    const toPosition = to.position ?? { x: 0, y: 0 };
    const derived = derivedTangents(
      anchors[i - 1]?.position ?? null,
      fromPosition,
      toPosition,
      anchors[i + 2]?.position ?? null,
    );
    const p1 = from.handleOut ?? derived.handleOut;
    const p2 = to.handleIn ?? derived.handleIn;
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
    const track = flattenTrack(chain, entity);
    anchors[entity] = track;
    spans[entity] = prepareSpans(track);
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
