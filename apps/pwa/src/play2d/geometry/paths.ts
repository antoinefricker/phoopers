import type { PlayerId, PreparedSpan, ResolvedTimeline, SpanKind, Vec2 } from '../../engine';
import { ballStateAt, pointOnCubic, spanKindAt, stateAt } from '../../engine';

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
 *
 * The wave is tapered to nothing over the final wavelength (a smoothstep envelope, so the
 * envelope is flat as well as zero at the end). The path therefore ends exactly on the
 * underlying curve and its last segment runs along the curve's end tangent: an arrowhead
 * placed on the end points the way the path is going whatever phase the wave finishes in.
 */
export function wavyPathD(points: readonly Vec2[], amplitude: number, wavelength: number): string {
  if (points.length < 2 || wavelength <= 0) {
    return '';
  }

  // Cumulative arc length at each input point, skipping nothing (zero-length steps are harmless).
  const cumulative = [0];
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    if (from === undefined || to === undefined) {
      return '';
    }
    cumulative.push((cumulative[i - 1] ?? 0) + Math.hypot(to.x - from.x, to.y - from.y));
  }
  const total = cumulative[cumulative.length - 1] ?? 0;
  if (total < 1e-9) {
    return '';
  }

  const step = wavelength / WAVY_SAMPLES_PER_WAVELENGTH;
  const sampleCount = Math.ceil(total / step - 1e-9);
  const wavy: Vec2[] = [];
  let segment = 1;

  for (let n = 0; n <= sampleCount; n += 1) {
    // The last sample is the path end itself; its arc length is clamped BEFORE the offset is computed.
    const arc = n === sampleCount ? total : n * step;
    while (segment < points.length - 1 && (cumulative[segment] ?? 0) < arc) {
      segment += 1;
    }
    const from = points[segment - 1];
    const to = points[segment];
    const start = cumulative[segment - 1];
    const end = cumulative[segment];
    if (from === undefined || to === undefined || start === undefined || end === undefined || end === start) {
      continue;
    }

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    const along = Math.min(Math.max(arc - start, 0), end - start) / (end - start);
    const remaining = Math.min((total - arc) / wavelength, 1);
    const envelope = remaining * remaining * (3 - 2 * remaining);
    const offset = Math.sin((arc / wavelength) * Math.PI * 2) * amplitude * envelope;

    wavy.push({
      x: from.x + dx * along - (dy / length) * offset,
      y: from.y + dy * along + (dx / length) * offset,
    });
  }

  return polylineD(wavy);
}

/** Points sampled along a span's cubic before the wiggle is applied; ample for a smooth curve. */
const DRIBBLE_SPAN_SAMPLES = 48;

/**
 * The dribble symbol for one span: its cubic sampled into points, then wiggled. Empty for a
 * zero-length span, which has no direction to draw.
 */
export function dribblePathD(
  span: Pick<PreparedSpan, 'p0' | 'p1' | 'p2' | 'p3'>,
  amplitude: number,
  wavelength: number,
): string {
  const points = Array.from({ length: DRIBBLE_SPAN_SAMPLES + 1 }, (_, i) =>
    pointOnCubic(span.p0, span.p1, span.p2, span.p3, i / DRIBBLE_SPAN_SAMPLES),
  );
  return wavyPathD(points, amplitude, wavelength);
}
