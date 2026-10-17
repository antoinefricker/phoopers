import type { PlayerId, ResolvedTimeline, Vec2 } from '../engine';
import { stateAt } from '../engine';
import type { CourtChoice } from './bounds';
import { courtBounds, displayedCentre } from './bounds';

export function clampToCourt(point: Vec2, play: CourtChoice): Vec2 {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return displayedCentre(play);
  }

  const { minX, maxX, minY, maxY } = courtBounds(play);

  return {
    x: Math.min(Math.max(point.x, minX), maxX),
    y: Math.min(Math.max(point.y, minY), maxY),
  };
}

// The SVG viewBox is in court metres, so the inverse screen CTM maps a client point straight
// into court space with no scale factor of our own. Without layout (jsdom, or a hidden
// canvas) there is no CTM, and clampToCourt turns the resulting NaN into the centre of what
// is shown.
export function courtPointFromEvent(
  event: { clientX: number; clientY: number },
  svg: SVGSVGElement | null,
  play: CourtChoice,
): Vec2 {
  const ctm = svg?.getScreenCTM?.()?.inverse();
  if (svg === null || ctm === undefined || ctm === null) {
    return clampToCourt({ x: Number.NaN, y: Number.NaN }, play);
  }

  const origin = svg.createSVGPoint();
  origin.x = event.clientX;
  origin.y = event.clientY;
  const mapped = origin.matrixTransform(ctm);

  return clampToCourt({ x: mapped.x, y: mapped.y }, play);
}

// Which player is under the drop point at this instant. Asking the engine rather than reading
// keyframes means an attached ball and a mid-span position both resolve correctly.
export function dropTargetAt(timeline: ResolvedTimeline, t: number, point: Vec2, radius: number): PlayerId | null {
  const state = stateAt(timeline, t);
  let best: PlayerId | null = null;
  let bestDistance = radius;

  for (const [id, player] of Object.entries(state.players)) {
    const distance = Math.hypot(player.position.x - point.x, player.position.y - point.y);
    if (distance <= bestDistance) {
      best = id as PlayerId;
      bestDistance = distance;
    }
  }

  return best;
}
