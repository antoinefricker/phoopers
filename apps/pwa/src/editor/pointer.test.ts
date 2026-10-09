import { describe, expect, it } from 'vitest';
import { resolveBranch } from '../engine';
import { fixturePlay, P1, P2, ROOT } from '../engine/__fixtures__/play';
import { clampToCourt, courtPointFromEvent, dropTargetAt } from './pointer';

describe('clampToCourt', () => {
  it('keeps a point inside the court', () => {
    expect(clampToCourt({ x: -3, y: 40 }, 'fiba')).toEqual({ x: 0, y: 15 });
  });

  it('passes an interior point through', () => {
    expect(clampToCourt({ x: 10, y: 7 }, 'fiba')).toEqual({ x: 10, y: 7 });
  });

  it('returns the court centre for a non-finite point', () => {
    expect(clampToCourt({ x: Number.NaN, y: 2 }, 'fiba')).toEqual({ x: 14, y: 7.5 });
  });

  it('uses the NBA dimensions when the play says so', () => {
    expect(clampToCourt({ x: 999, y: 999 }, 'nba')).toEqual({ x: 28.65, y: 15.24 });
  });
});

describe('courtPointFromEvent', () => {
  it('falls back to the court centre when there is no screen CTM', () => {
    // jsdom gives no layout, so getScreenCTM() returns null. The gesture must still resolve
    // to a usable point rather than NaN reaching a mutation.
    const event = { clientX: 40, clientY: 40 };

    expect(courtPointFromEvent(event, null, 'fiba')).toEqual({ x: 14, y: 7.5 });
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
    const near = dropTargetAt(timeline, 0, { x: 4.1, y: 7.5 }, 99);

    expect(near).toBe(P1);
    expect(near).not.toBe(P2);
  });
});
