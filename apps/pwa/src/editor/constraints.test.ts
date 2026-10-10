import { describe, expect, it } from 'vitest';
import { fixturePlay, P1, ROOT, STEP_ENTRY, SWITCH } from '../engine/__fixtures__/play';
import type { Branch, BranchId, Play, ScreenId, Step, StepId } from '../engine';
import { constrainRetime, constrainStepRetime, retimeBounds } from './constraints';

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

const withSwitch = (edit: (b: Branch) => Branch): Play => ({
  ...fixturePlay,
  branches: fixturePlay.branches.map((b) => (b.id === SWITCH ? edit(b) : b)),
});
const bare = (b: Branch): Branch => ({ ...b, tracks: { ball: [] }, steps: [], screens: [] });

// The fixture's step 'Entry pass' sits at t=2 on the root, and SWITCH forks from it; SWITCH's
// earliest keyframe is at t=2 (P2 and the ball).
describe('constrainStepRetime', () => {
  it('stops a fork step at its child branch earliest keyframe, inclusive', () => {
    expect(constrainStepRetime(fixturePlay, STEP_ENTRY, 2, 9, [], 0)).toBe(2);
  });

  it('counts the ball track, not only players', () => {
    const play = withSwitch((b) => ({ ...bare(b), tracks: { ball: [{ t: 2.5, attachedTo: P1 }] } }));

    expect(constrainStepRetime(play, STEP_ENTRY, 2, 9, [], 0)).toBe(2.5);
  });

  it('counts the child own steps', () => {
    const play = withSwitch((b) => ({ ...bare(b), steps: [{ id: 'c' as StepId, t: 2.25, name: 'c' }] }));

    expect(constrainStepRetime(play, STEP_ENTRY, 2, 9, [], 0)).toBe(2.25);
  });

  it('counts the child own screens', () => {
    const play = withSwitch((b) => ({
      ...bare(b),
      screens: [{ id: 'sc' as ScreenId, t: 2.75, duration: 1, screenerId: P1, beneficiaryId: P1 }],
    }));

    expect(constrainStepRetime(play, STEP_ENTRY, 2, 9, [], 0)).toBe(2.75);
  });

  it('takes the earliest across every branch forked from the step', () => {
    const play: Play = {
      ...withSwitch((b) => ({ ...bare(b), steps: [{ id: 'c' as StepId, t: 3, name: 'c' }] })),
    };
    const sibling: Branch = {
      ...bare(fixturePlay.branches[1] as Branch),
      id: 'sibling' as BranchId,
      tracks: { ball: [{ t: 2.5, attachedTo: P1 }] },
    };

    expect(constrainStepRetime({ ...play, branches: [...play.branches, sibling] }, STEP_ENTRY, 2, 9, [], 0)).toBe(2.5);
  });

  it('lets a step nothing forks from move freely above its floor', () => {
    const play = withSwitch((b) => ({ ...b, steps: [{ id: 'c' as StepId, t: 3, name: 'c' }] }));

    expect(constrainStepRetime(play, 'c' as StepId, 3, 9, [], 0)).toBe(9);
  });

  it('floors a step at the fork time of its owning branch', () => {
    const play = withSwitch((b) => ({ ...b, steps: [{ id: 'c' as StepId, t: 3, name: 'c' }] }));

    expect(constrainStepRetime(play, 'c' as StepId, 3, 0, [], 0)).toBe(2);
  });

  it('floors the root step at 0', () => {
    expect(constrainStepRetime(fixturePlay, STEP_ENTRY, 2, -5, [], 0)).toBe(0);
  });

  it('snaps first and clamps second, so a snap past the ceiling is still clamped', () => {
    // Clamp-then-snap would pull the clamped 2 onto this step at 2.05, past the ceiling.
    const near: Step = { id: 'n' as StepId, t: 2.05, name: 'n' };

    expect(constrainStepRetime(fixturePlay, STEP_ENTRY, 2, 9, [near], 0.1)).toBe(2);
  });

  it('snaps to a nearby step inside the bounds', () => {
    const play = withSwitch(bare);
    const near: Step = { id: 'n' as StepId, t: 1, name: 'n' };

    expect(constrainStepRetime(play, STEP_ENTRY, 2, 1.05, [near], 0.1)).toBe(1);
  });

  it('keeps the step where it is for a non-finite request, and for an unknown step', () => {
    expect(constrainStepRetime(fixturePlay, STEP_ENTRY, 2, Number.NaN, [], 0)).toBe(2);
    expect(constrainStepRetime(fixturePlay, 'nope' as StepId, 7, 9, [], 0)).toBe(7);
  });
});
