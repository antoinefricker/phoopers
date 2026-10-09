import type { PlayerId, ResolvedTimeline, SpanKind, Vec2 } from '../../engine';
import { ballStateAt, spanKindAt, stateAt } from '../../engine';

export interface PathSegment {
  d: string;
  kind: SpanKind;
}

export interface BallSegment {
  d: string;
  inFlight: boolean;
}

/**
 * A player's path, one cubic per span. Player spans never have attached endpoints, so
 * their control points are always real positions and the drawn curve is exactly the one
 * the engine samples.
 */
export function playerPathSegments(timeline: ResolvedTimeline, playerId: PlayerId): PathSegment[] {
  const spans = timeline.spans[playerId] ?? [];

  return spans.map((span) => ({
    d:
      `M ${span.p0.x} ${span.p0.y} ` +
      `C ${span.p1.x} ${span.p1.y} ${span.p2.x} ${span.p2.y} ${span.p3.x} ${span.p3.y}`,
    kind: spanKindAt(timeline, playerId, (span.fromT + span.toT) / 2),
  }));
}

export const polylineD = (points: readonly Vec2[]): string => {
  const [first, ...rest] = points;
  if (first === undefined) {
    return '';
  }
  return `M ${first.x} ${first.y}` + rest.map((p) => ` L ${p.x} ${p.y}`).join('');
};

/**
 * The ball is SAMPLED rather than read from its spans: a span substitutes {0,0} for an
 * attached endpoint, so drawing from control points would mean reimplementing the
 * sampler's carrier resolution. Segments break wherever the ball changes between held
 * and in flight, so a pass can be drawn dashed and a dribble cannot.
 */
export function ballPathSegments(timeline: ResolvedTimeline, samplesPerSecond = 20): BallSegment[] {
  if (timeline.duration <= 0) {
    return [];
  }

  const count = Math.max(2, Math.ceil(timeline.duration * samplesPerSecond));
  const segments: BallSegment[] = [];
  let points: Vec2[] = [];
  let current: boolean | undefined;

  for (let i = 0; i <= count; i += 1) {
    const t = (timeline.duration * i) / count;
    const inFlight = ballStateAt(timeline, t) === 'inFlight';
    const position = stateAt(timeline, t).ball.position;

    if (current === undefined) {
      current = inFlight;
    }

    if (inFlight !== current) {
      points.push(position);
      segments.push({ d: polylineD(points), inFlight: current });
      points = [position];
      current = inFlight;
    }

    points.push(position);
  }

  if (points.length > 1 && current !== undefined) {
    segments.push({ d: polylineD(points), inFlight: current });
  }

  return segments;
}

/** Resampled points per wavelength: enough for a smooth squiggle drawn as a polyline. */
const WAVY_SAMPLES_PER_WAVELENGTH = 12;

/**
 * A sine wiggle perpendicular to a sampled path, for the dribble symbol. The path is
 * resampled at a fixed arc-length step first, so the squiggle is smooth and its
 * wavelength is true whatever the density of the input samples (a coarse input would
 * otherwise alias to a flat line).
 */
export function wavyPathD(points: readonly Vec2[], amplitude: number, wavelength: number): string {
  if (points.length < 2 || wavelength <= 0) {
    return '';
  }

  const step = wavelength / WAVY_SAMPLES_PER_WAVELENGTH;
  const wavy: Vec2[] = [];
  let walked = 0; // arc length at the start of the current input segment
  let nextSample = 0; // arc length of the next output sample

  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    if (from === undefined || to === undefined) {
      continue;
    }

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) {
      continue;
    }

    const isLast = i === points.length - 1;
    // Emit every sample falling in this segment; the very end of the path is always emitted.
    while (nextSample <= walked + length + 1e-9 || (isLast && nextSample - step < walked + length - 1e-9)) {
      const along = Math.min(Math.max(nextSample - walked, 0), length);
      const offset = Math.sin((nextSample / wavelength) * Math.PI * 2) * amplitude;
      wavy.push({
        x: from.x + (dx / length) * along - (dy / length) * offset,
        y: from.y + (dy / length) * along + (dx / length) * offset,
      });
      nextSample += step;
    }
    walked += length;
  }

  return polylineD(wavy);
}
