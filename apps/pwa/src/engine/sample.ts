import type { EntityId, Keyframe, PlayerId, PlayState, PreparedSpan, ResolvedTimeline, Step, Vec2 } from './types';
import { lutToParam, pointOnCubic } from './curve';
import { applyEasing } from './easing';
import { lerp } from './vec2';

const ORIGIN: Vec2 = { x: 0, y: 0 };

// Clamp to the entity's anchored range; a non-finite time samples the start.
function clampTime(anchors: readonly Keyframe[], t: number): number {
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (first === undefined || last === undefined) return 0;
  if (!Number.isFinite(t)) return first.t;
  return Math.min(last.t, Math.max(first.t, t));
}

// Span containing t, with a boundary instant belonging to the span that starts there.
// Zero-duration spans never match [fromT, toT), so they are skipped. At the very end of
// the track the last span is returned.
function spanIndexAt(spans: readonly PreparedSpan[], t: number): number {
  for (let i = 0; i < spans.length; i += 1) {
    const span = spans[i];
    if (span !== undefined && t >= span.fromT && t < span.toT) return i;
  }
  const last = spans[spans.length - 1];
  return last !== undefined && t >= last.toT ? spans.length - 1 : -1;
}

// Fraction of the span elapsed, eased. Never NaN: a zero-length span is already complete.
function easedProgress(span: PreparedSpan, t: number): number {
  const length = span.toT - span.fromT;
  if (!(length > 0)) return 1;
  const p = Math.min(1, Math.max(0, (t - span.fromT) / length));
  return applyEasing(span.ease, p);
}

function pointInSpan(span: PreparedSpan, t: number): Vec2 {
  if (!(span.toT - span.fromT > 0)) return span.p3;
  return pointOnCubic(span.p0, span.p1, span.p2, span.p3, lutToParam(span.lut, easedProgress(span, t)));
}

// Position of a player, from their own positional track only.
function playerPositionAt(timeline: ResolvedTimeline, id: PlayerId, rawT: number): Vec2 | undefined {
  const anchors = timeline.anchors[id] ?? [];
  const spans = timeline.spans[id] ?? [];
  const first = anchors[0];
  if (first === undefined) return undefined;
  const t = clampTime(anchors, rawT);

  const index = spanIndexAt(spans, t);
  const span = spans[index];
  if (span !== undefined) return pointInSpan(span, t);

  // No spans: a single-keyframe track.
  const last = anchors[anchors.length - 1];
  return last?.position ?? first.position;
}

function ballPositionAt(timeline: ResolvedTimeline, rawT: number): Vec2 {
  const anchors = timeline.anchors.ball ?? [];
  const spans = timeline.spans.ball ?? [];
  const first = anchors[0];
  if (first === undefined) return ORIGIN;
  const t = clampTime(anchors, rawT);

  // An attached endpoint has no position of its own: it is its carrier's position then.
  const endpoint = (k: Keyframe): Vec2 =>
    k.position ?? (k.attachedTo === undefined ? undefined : playerPositionAt(timeline, k.attachedTo, k.t)) ?? ORIGIN;

  const index = spanIndexAt(spans, t);
  const span = spans[index];
  const from = anchors[index];
  const to = anchors[index + 1];

  if (span === undefined || from === undefined || to === undefined) {
    // No spans: a single-keyframe track.
    return endpoint(anchors[anchors.length - 1] ?? first);
  }

  if (span.attachedTo !== null) {
    return playerPositionAt(timeline, span.attachedTo, t) ?? ORIGIN;
  }
  if (from.position !== undefined && to.position !== undefined) {
    return pointInSpan(span, t);
  }
  // In flight: an eased lerp between the endpoints' resolved positions, matching the
  // synthesis resolveBranch performs at a fork.
  return lerp(endpoint(from), endpoint(to), easedProgress(span, t));
}

function attachmentAt(timeline: ResolvedTimeline, rawT: number): PlayerId | null {
  const anchors = timeline.anchors.ball ?? [];
  const spans = timeline.spans.ball ?? [];
  const t = clampTime(anchors, rawT);
  const span = spans[spanIndexAt(spans, t)];
  if (span !== undefined) return span.attachedTo;
  return anchors[anchors.length - 1]?.attachedTo ?? null;
}

function isMoving(timeline: ResolvedTimeline, entity: EntityId, rawT: number): boolean {
  const spans = timeline.spans[entity] ?? [];
  const t = clampTime(timeline.anchors[entity] ?? [], rawT);
  const span = spans[spanIndexAt(spans, t)];
  if (span === undefined || t >= span.toT) return false;
  return span.length > 0;
}

export function stateAt(timeline: ResolvedTimeline, t: number): PlayState {
  const players: PlayState['players'] = {};

  for (const entity of Object.keys(timeline.anchors)) {
    if (entity === 'ball') continue;
    const id = entity as PlayerId;
    players[id] = { position: playerPositionAt(timeline, id, t) ?? ORIGIN, moving: isMoving(timeline, id, t) };
  }

  return {
    t,
    players,
    ball: { position: ballPositionAt(timeline, t), attachedTo: attachmentAt(timeline, t) },
    activeScreens: timeline.screens.filter((s) => t >= s.t && t <= s.t + s.duration),
  };
}

export function ballStateAt(timeline: ResolvedTimeline, t: number): 'held' | 'inFlight' {
  return attachmentAt(timeline, t) === null ? 'inFlight' : 'held';
}

export function spanKindAt(timeline: ResolvedTimeline, playerId: PlayerId, t: number): 'idle' | 'move' | 'dribble' {
  if (!isMoving(timeline, playerId, t)) return 'idle';
  return attachmentAt(timeline, t) === playerId ? 'dribble' : 'move';
}

export const duration = (timeline: ResolvedTimeline): number => timeline.duration;

export const stepsOf = (timeline: ResolvedTimeline): Step[] => timeline.steps;
