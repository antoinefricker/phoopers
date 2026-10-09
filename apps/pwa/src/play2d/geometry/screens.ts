import type { PlayerId, ResolvedTimeline, ScreenEvent, Vec2 } from '../../engine';
import { stateAt } from '../../engine';

export interface ScreenMark {
  id: ScreenEvent['id'];
  screenerId: PlayerId;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Half the tick's length, in metres: a token is ~0.45 m in radius, so the tick pokes out either side. */
export const SCREEN_TICK_HALF_LENGTH = 0.8;

const LOOK = 0.1;
const MIN_DIRECTION = 1e-9;

const position = (timeline: ResolvedTimeline, id: PlayerId, t: number): Vec2 | undefined =>
  stateAt(timeline, t).players[id]?.position;

/**
 * Which way the screener is heading as the screen is set: where they were just before, to where
 * they are; failing that (they only start moving afterwards) where they go next. Sampled rather
 * than read from the spans, so it follows the engine's own idea of position.
 */
function heading(timeline: ResolvedTimeline, screen: ScreenEvent, at: Vec2): Vec2 | undefined {
  const before = position(timeline, screen.screenerId, screen.t - LOOK);
  const after = position(timeline, screen.screenerId, screen.t + LOOK);
  const candidates: Vec2[] = [];
  if (before !== undefined) candidates.push({ x: at.x - before.x, y: at.y - before.y });
  if (after !== undefined) candidates.push({ x: after.x - at.x, y: after.y - at.y });
  return candidates.find((v) => Math.hypot(v.x, v.y) > MIN_DIRECTION);
}

/**
 * One perpendicular tick per screen, centred on the screener at the screen's time. With no
 * movement to be perpendicular to, the tick lies across the line to the beneficiary instead
 * (the screen is set facing the player it frees); with neither, it is vertical.
 */
export function screenMarks(timeline: ResolvedTimeline): ScreenMark[] {
  return timeline.screens.flatMap((screen) => {
    const at = position(timeline, screen.screenerId, screen.t);
    if (at === undefined) {
      return [];
    }

    let direction = heading(timeline, screen, at);
    if (direction === undefined) {
      const beneficiary = position(timeline, screen.beneficiaryId, screen.t);
      direction = beneficiary === undefined ? { x: 1, y: 0 } : { x: beneficiary.x - at.x, y: beneficiary.y - at.y };
    }
    const length = Math.hypot(direction.x, direction.y);
    const unit = length > MIN_DIRECTION ? { x: direction.x / length, y: direction.y / length } : { x: 1, y: 0 };
    const dx = -unit.y * SCREEN_TICK_HALF_LENGTH;
    const dy = unit.x * SCREEN_TICK_HALF_LENGTH;

    return [
      { id: screen.id, screenerId: screen.screenerId, x1: at.x - dx, y1: at.y - dy, x2: at.x + dx, y2: at.y + dy },
    ];
  });
}
