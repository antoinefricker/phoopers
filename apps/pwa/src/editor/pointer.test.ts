import { describe, expect, it } from 'vitest';
import { resolveBranch } from '../engine';
import { fixturePlay, P1, P2, ROOT } from '../engine/__fixtures__/play';
import type { CourtChoice } from './bounds';
import { clampToCourt, courtPointFromEvent, dropTargetAt } from './pointer';

const fullCourt: CourtChoice = { court: 'fiba', extent: 'full' };
const halfCourt: CourtChoice = { court: 'fiba', extent: 'half' };

describe('clampToCourt', () => {
  it('keeps a point within a metre of the court', () => {
    expect(clampToCourt({ x: -3, y: 40 }, fullCourt)).toEqual({ x: -1, y: 16 });
  });

  it('passes an interior point through', () => {
    expect(clampToCourt({ x: 10, y: 7 }, fullCourt)).toEqual({ x: 10, y: 7 });
  });

  it('lets a player stand a metre out of bounds', () => {
    // Where a set starts: out of bounds, waiting to come in.
    expect(clampToCourt({ x: 21, y: -0.8 }, halfCourt)).toEqual({ x: 21, y: -0.8 });
  });

  it('stops a drag at the margin rather than losing it off the shown half', () => {
    expect(clampToCourt({ x: 4, y: 7.5 }, halfCourt)).toEqual({ x: 13, y: 7.5 });
  });

  it('returns the centre of what is shown for a non-finite point', () => {
    expect(clampToCourt({ x: Number.NaN, y: 2 }, halfCourt)).toEqual({ x: 21, y: 7.5 });
  });

  it('uses the NBA dimensions when the play says so', () => {
    const clamped = clampToCourt({ x: 999, y: 999 }, { court: 'nba' });

    expect(clamped.x).toBeCloseTo(29.65);
    expect(clamped.y).toBeCloseTo(16.24);
  });
});

describe('courtPointFromEvent', () => {
  it('falls back to the centre of what is shown when there is no screen CTM', () => {
    // jsdom gives no layout, so getScreenCTM() returns null. The gesture must still resolve
    // to a usable point rather than NaN reaching a mutation.
    const event = { clientX: 40, clientY: 40 };

    expect(courtPointFromEvent(event, null, halfCourt)).toEqual({ x: 21, y: 7.5 });
  });
});

describe('dropTargetAt', () => {
  const timeline = resolveBranch(fixturePlay, ROOT);

  it('finds the player under the point within the radius', () => {
    // P1 sits at {4, 7.5} at t=0 in the fixture.
    expect(dropTargetAt(timeline, 0, { x: 4.2, y: 7.6 }, 1)).toBe(P1);
  });

  it('returns null when no player is within the radius', () => {
    expect(dropTargetAt(timeline, 0, { x: 27, y: 1 }, 1)).toBeNull();
  });

  it('prefers the nearer player when two are in range', () => {
    // P2 sits at {4, 3} at t=0 and is second in iteration order, so a first-in-range-wins
    // implementation would return P1 here.
    expect(dropTargetAt(timeline, 0, { x: 4, y: 3.1 }, 99)).toBe(P2);
  });
});
