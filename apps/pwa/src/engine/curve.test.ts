import { describe, expect, it } from 'vitest';
import { buildLut, derivedTangents, LUT_SAMPLES, lutToParam, pointOnCubic } from './curve';
import { distance } from './vec2';

const A = { x: 0, y: 0 };
const B = { x: 10, y: 0 };

describe('pointOnCubic', () => {
  it('returns the endpoints at u = 0 and u = 1', () => {
    expect(pointOnCubic(A, { x: 2, y: 5 }, { x: 8, y: 5 }, B, 0)).toEqual(A);
    expect(pointOnCubic(A, { x: 2, y: 5 }, { x: 8, y: 5 }, B, 1)).toEqual(B);
  });

  it('is the straight-line midpoint when handles are colinear', () => {
    const point = pointOnCubic(A, { x: 10 / 3, y: 0 }, { x: 20 / 3, y: 0 }, B, 0.5);

    expect(point.x).toBeCloseTo(5, 9);
    expect(point.y).toBeCloseTo(0, 9);
  });

  it('bulges toward the handles', () => {
    const point = pointOnCubic(A, { x: 0, y: 10 }, { x: 10, y: 10 }, B, 0.5);

    expect(point.y).toBeGreaterThan(0);
  });
});

describe('derivedTangents', () => {
  it('uses one-sided differences at the ends', () => {
    const { handleOut, handleIn } = derivedTangents(null, A, B, null);

    expect(handleOut).toEqual({ x: 10 / 6, y: 0 });
    expect(handleIn).toEqual({ x: 10 - 10 / 6, y: 0 });
  });

  it('uses neighbours when present', () => {
    const prev = { x: -6, y: 0 };
    const next = { x: 16, y: 0 };
    const { handleOut, handleIn } = derivedTangents(prev, A, B, next);

    expect(handleOut).toEqual({ x: (10 - -6) / 6, y: 0 });
    expect(handleIn).toEqual({ x: 10 - (16 - 0) / 6, y: 0 });
  });
});

describe('buildLut', () => {
  it('produces LUT_SAMPLES + 1 entries from 0 to 1', () => {
    const { lut } = buildLut(A, { x: 2, y: 0 }, { x: 8, y: 0 }, B);

    expect(lut).toHaveLength(LUT_SAMPLES + 1);
    expect(lut[0]).toBe(0);
    expect(lut[LUT_SAMPLES]).toBe(1);
  });

  it('measures a straight span as its chord length', () => {
    const { length } = buildLut(A, { x: 10 / 3, y: 0 }, { x: 20 / 3, y: 0 }, B);

    expect(length).toBeCloseTo(10, 3);
  });

  it('reports zero length for a degenerate span', () => {
    const { lut, length } = buildLut(A, A, A, A);

    expect(length).toBe(0);
    expect(lut.every((value) => Number.isFinite(value))).toBe(true);
  });
});

describe('lutToParam', () => {
  it('maps distance fraction to curve parameter on a straight span', () => {
    const { lut } = buildLut(A, { x: 10 / 3, y: 0 }, { x: 20 / 3, y: 0 }, B);

    expect(lutToParam(lut, 0)).toBeCloseTo(0, 6);
    expect(lutToParam(lut, 1)).toBeCloseTo(1, 6);
    expect(lutToParam(lut, 0.5)).toBeCloseTo(0.5, 2);
  });

  it('gives constant speed on a curve with asymmetric handles', () => {
    const p1 = { x: 0, y: 9 };
    const p2 = { x: 9.5, y: 0.2 };
    const { lut } = buildLut(A, p1, p2, B);

    const at = (s: number) => pointOnCubic(A, p1, p2, B, lutToParam(lut, s));
    const first = distance(at(0), at(0.25));
    const second = distance(at(0.25), at(0.5));
    const third = distance(at(0.5), at(0.75));

    expect(second / first).toBeCloseTo(1, 1);
    expect(third / first).toBeCloseTo(1, 1);
  });

  it('returns 0 for a degenerate span rather than NaN', () => {
    const { lut } = buildLut(A, A, A, A);

    expect(lutToParam(lut, 0.5)).toBe(0);
  });
});
