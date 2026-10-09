import { describe, expect, it } from 'vitest';
import type { Step, StepId } from '../engine';
import { fixturePlay, P1, ROOT, SWITCH } from '../engine/__fixtures__/play';
import { constrainRetime, retimeBounds } from './constraints';

const steps: Step[] = [{ id: 's' as StepId, t: 1.5, name: 'Entry' }];

// Measured against the fixture: P1's root track is t = 0, 2, 4; on 'Defence switches' it is a
// single keyframe at t = 3, forked from the step at t = 2.
describe('retimeBounds', () => {
  it('bounds a middle keyframe strictly between its neighbours', () => {
    const { min, max } = retimeBounds(fixturePlay, ROOT, P1, 2);

    expect(min).toBeGreaterThan(0);
    expect(min).toBeLessThan(0.01);
    expect(max).toBeLessThan(4);
    expect(max).toBeGreaterThan(3.99);
  });

  it('bounds the first keyframe below by zero on the root branch', () => {
    expect(retimeBounds(fixturePlay, ROOT, P1, 0).min).toBe(0);
  });

  it('bounds the first keyframe below by the fork time on a child branch', () => {
    expect(retimeBounds(fixturePlay, SWITCH, P1, 3).min).toBe(2);
  });

  it('leaves the last keyframe unbounded above', () => {
    expect(retimeBounds(fixturePlay, ROOT, P1, 4).max).toBe(Infinity);
  });
});

describe('constrainRetime', () => {
  it('clamps below its lower bound instead of crossing a neighbour', () => {
    const result = constrainRetime(fixturePlay, ROOT, P1, 2, -5, [], 0);

    expect(result).toBeGreaterThan(0);
  });

  it('clamps above its upper bound instead of crossing a neighbour', () => {
    const result = constrainRetime(fixturePlay, ROOT, P1, 2, 9, [], 0);

    expect(result).toBeLessThan(4);
  });

  it('lets the last keyframe move later, which lengthens the play', () => {
    expect(constrainRetime(fixturePlay, ROOT, P1, 4, 9, [], 0)).toBe(9);
  });

  it('snaps to a nearby step', () => {
    expect(constrainRetime(fixturePlay, ROOT, P1, 2, 1.45, steps, 0.2)).toBe(1.5);
  });

  it('does not snap to a step outside the threshold', () => {
    expect(constrainRetime(fixturePlay, ROOT, P1, 2, 1.0, steps, 0.2)).toBe(1.0);
  });

  it('never returns a non-finite value', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(Number.isFinite(constrainRetime(fixturePlay, ROOT, P1, 2, bad, steps, 0.2))).toBe(true);
      expect(Number.isFinite(constrainRetime(fixturePlay, ROOT, P1, 4, bad, steps, 0.2))).toBe(true);
    }
  });
});
