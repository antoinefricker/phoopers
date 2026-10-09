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
import { resolveEasing } from './easing';

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

function positionOfAnchors(anchors: readonly Keyframe[], t: number): Vec2 | undefined {
  if (anchors.length === 0) return undefined;

  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (first === undefined || last === undefined) return undefined;
  if (t <= first.t) return first.position;
  if (t >= last.t) return last.position;

  for (let i = 0; i < anchors.length - 1; i += 1) {
    const from = anchors[i];
    const to = anchors[i + 1];
    if (from === undefined || to === undefined) continue;
    if (t >= from.t && t <= to.t && from.position !== undefined && to.position !== undefined) {
      const span = to.t - from.t;
      const p = span === 0 ? 0 : (t - from.t) / span;
      const previous = anchors[i - 1]?.position ?? null;
      const next = anchors[i + 2]?.position ?? null;
      const derived = derivedTangents(previous, from.position, to.position, next);
      const p1 = from.handleOut ?? derived.handleOut;
      const p2 = to.handleIn ?? derived.handleIn;
      const { lut } = buildLut(from.position, p1, p2, to.position);
      return pointOnCubic(from.position, p1, p2, to.position, lutToParam(lut, p));
    }
  }

  return last.position;
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
        // The parent's window excludes the fork instant, so look ahead at its keyframes
        // from the fork onwards to interpolate (or land exactly on) its state there.
        const parentTrack = chain[i - 1]?.tracks[entity] ?? [];
        const lookahead = [...anchors, ...parentTrack.filter((k) => k.t >= from)].sort((a, b) => a.t - b.t);
        const parentState = positionOfAnchors(lookahead, from);
        const inherited = [...lookahead].reverse().find((k) => k.t <= from);
        anchors.push({
          t: from,
          ...(parentState !== undefined ? { position: parentState } : {}),
          ...(inherited?.attachedTo !== undefined ? { attachedTo: inherited.attachedTo } : {}),
        });
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
  const anchors = {} as Record<EntityId, Keyframe[]>;
  const spans = {} as Record<EntityId, PreparedSpan[]>;

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
