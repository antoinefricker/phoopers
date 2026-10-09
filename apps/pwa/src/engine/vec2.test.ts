import { describe, expect, it } from 'vitest';
import { add, distance, equals, lerp, scale, sub } from './vec2';

describe('vec2', () => {
  it('adds and subtracts componentwise', () => {
    expect(add({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 });
    expect(sub({ x: 3, y: 4 }, { x: 1, y: 2 })).toEqual({ x: 2, y: 2 });
  });

  it('scales by a factor', () => {
    expect(scale({ x: 2, y: -3 }, 2.5)).toEqual({ x: 5, y: -7.5 });
  });

  it('lerps between endpoints', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 20 };

    expect(lerp(a, b, 0)).toEqual(a);
    expect(lerp(a, b, 1)).toEqual(b);
    expect(lerp(a, b, 0.25)).toEqual({ x: 2.5, y: 5 });
  });

  it('measures distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('compares within a tolerance', () => {
    expect(equals({ x: 1, y: 1 }, { x: 1 + 1e-12, y: 1 })).toBe(true);
    expect(equals({ x: 1, y: 1 }, { x: 1.5, y: 1 })).toBe(false);
  });
});
