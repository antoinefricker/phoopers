import type { CubicBezierEasing, Easing, EasingPreset } from './types';

export const EASING_PRESETS: Record<EasingPreset, CubicBezierEasing> = {
  linear: { x1: 0, y1: 0, x2: 1, y2: 1 },
  easeIn: { x1: 0.42, y1: 0, x2: 1, y2: 1 },
  easeOut: { x1: 0, y1: 0, x2: 0.58, y2: 1 },
  easeInOut: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
};

export function resolveEasing(ease: Easing | undefined): CubicBezierEasing {
  if (ease === undefined) return EASING_PRESETS.linear;
  if (typeof ease === 'string') return EASING_PRESETS[ease];
  return ease;
}

/** Cubic Bezier with endpoints pinned at 0 and 1, evaluated on one axis. */
function axisAt(c1: number, c2: number, u: number): number {
  const v = 1 - u;
  return 3 * v * v * u * c1 + 3 * v * u * u * c2 + u * u * u;
}

const SOLVE_ITERATIONS = 32;

export function applyEasing(ease: CubicBezierEasing, p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;

  let low = 0;
  let high = 1;
  let u = p;

  for (let i = 0; i < SOLVE_ITERATIONS; i += 1) {
    const x = axisAt(ease.x1, ease.x2, u);
    if (x < p) {
      low = u;
    } else {
      high = u;
    }
    u = (low + high) / 2;
  }

  return axisAt(ease.y1, ease.y2, u);
}
