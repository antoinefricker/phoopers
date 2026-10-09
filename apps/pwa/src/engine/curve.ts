import type { Vec2 } from './types';
import { add, distance, sub } from './vec2';

export const LUT_SAMPLES = 32;

export function pointOnCubic(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, u: number): Vec2 {
  const v = 1 - u;
  const a = v * v * v;
  const b = 3 * v * v * u;
  const c = 3 * v * u * u;
  const d = u * u * u;

  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

const divideBySix = (v: Vec2): Vec2 => ({ x: v.x / 6, y: v.y / 6 });

/**
 * Catmull-Rom tangents for the span `from` -> `to`, using one-sided differences
 * when a neighbour is missing.
 */
export function derivedTangents(
  prev: Vec2 | null,
  from: Vec2,
  to: Vec2,
  next: Vec2 | null,
): { handleOut: Vec2; handleIn: Vec2 } {
  const before = prev ?? from;
  const after = next ?? to;

  // Divide rather than multiply by 1/6: `x * (1 / 6)` is not bit-identical to `x / 6`.
  return {
    handleOut: add(from, divideBySix(sub(to, before))),
    handleIn: sub(to, divideBySix(sub(after, from))),
  };
}

export function buildLut(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2): { lut: number[]; length: number } {
  const cumulative: number[] = [0];
  let total = 0;
  let previous = p0;

  for (let i = 1; i <= LUT_SAMPLES; i += 1) {
    const point = pointOnCubic(p0, p1, p2, p3, i / LUT_SAMPLES);
    total += distance(previous, point);
    cumulative.push(total);
    previous = point;
  }

  if (total === 0) {
    return { lut: cumulative.map(() => 0), length: 0 };
  }

  return { lut: cumulative.map((value) => value / total), length: total };
}

/** Inverts the table: distance fraction `s` -> curve parameter `u`. */
export function lutToParam(lut: readonly number[], s: number): number {
  if (s <= 0) return 0;
  if (s >= 1) return 1;

  const last = lut[lut.length - 1];
  if (last === undefined || last === 0) return 0;

  let low = 0;
  let high = lut.length - 1;

  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    const value = lut[mid];
    if (value === undefined) return 0;
    if (value <= s) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const lowValue = lut[low];
  const highValue = lut[high];
  if (lowValue === undefined || highValue === undefined) return 0;

  const segment = highValue - lowValue;
  const withinSegment = segment === 0 ? 0 : (s - lowValue) / segment;

  return (low + withinSegment) / (lut.length - 1);
}
