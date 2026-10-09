import { describe, expect, it } from 'vitest';
import { applyEasing, EASING_PRESETS, resolveEasing } from './easing';

describe('resolveEasing', () => {
  it('defaults to linear when absent', () => {
    expect(resolveEasing(undefined)).toEqual({ x1: 0, y1: 0, x2: 1, y2: 1 });
  });

  it('resolves every preset to its CSS control points', () => {
    expect(EASING_PRESETS.linear).toEqual({ x1: 0, y1: 0, x2: 1, y2: 1 });
    expect(EASING_PRESETS.easeIn).toEqual({ x1: 0.42, y1: 0, x2: 1, y2: 1 });
    expect(EASING_PRESETS.easeOut).toEqual({ x1: 0, y1: 0, x2: 0.58, y2: 1 });
    expect(EASING_PRESETS.easeInOut).toEqual({ x1: 0.42, y1: 0, x2: 0.58, y2: 1 });
  });

  it('resolves a known preset name to its control points', () => {
    expect(resolveEasing('easeIn')).toEqual(EASING_PRESETS.easeIn);
    expect(resolveEasing('easeInOut')).toEqual(EASING_PRESETS.easeInOut);
  });

  it('falls back to linear for an unknown preset name instead of returning undefined', () => {
    expect(resolveEasing('bouncy' as unknown as 'linear')).toEqual(EASING_PRESETS.linear);
  });

  it('passes an explicit curve through unchanged', () => {
    const custom = { x1: 0.1, y1: 0.9, x2: 0.3, y2: 1 };

    expect(resolveEasing(custom)).toEqual(custom);
  });
});

describe('applyEasing', () => {
  const linear = EASING_PRESETS.linear;

  it('pins the endpoints', () => {
    expect(applyEasing(linear, 0)).toBe(0);
    expect(applyEasing(linear, 1)).toBe(1);
  });

  it('is the identity for linear', () => {
    for (const p of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(applyEasing(linear, p)).toBeCloseTo(p, 6);
    }
  });

  it('front-loads progress for easeOut', () => {
    expect(applyEasing(EASING_PRESETS.easeOut, 0.5)).toBeGreaterThan(0.5);
  });

  it('back-loads progress for easeIn', () => {
    expect(applyEasing(EASING_PRESETS.easeIn, 0.5)).toBeLessThan(0.5);
  });

  it('clamps input outside [0, 1]', () => {
    expect(applyEasing(linear, -0.5)).toBe(0);
    expect(applyEasing(linear, 1.5)).toBe(1);
  });

  it('terminates and stays monotonic for extreme but legal curves', () => {
    const extreme = { x1: 1, y1: 0, x2: 0, y2: 1 };
    const samples = [0, 0.2, 0.4, 0.6, 0.8, 1].map((p) => applyEasing(extreme, p));

    for (const value of samples) {
      expect(Number.isFinite(value)).toBe(true);
    }
    for (let i = 1; i < samples.length; i += 1) {
      const previous = samples[i - 1];
      const current = samples[i];
      if (previous === undefined || current === undefined) throw new Error('missing sample');
      expect(current).toBeGreaterThanOrEqual(previous - 1e-9);
    }
  });
});
