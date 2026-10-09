import { describe, expect, it } from 'vitest';
import { resolveBranch } from '../../engine';
import { fixturePlay, P1, ROOT } from '../../engine/__fixtures__/play';
import { ballPathSegments, playerPathSegments, polylineD, wavyPathD } from './paths';

const timeline = resolveBranch(fixturePlay, ROOT);

describe('playerPathSegments', () => {
  it('produces one segment per span, each a cubic starting with a moveto', () => {
    const segments = playerPathSegments(timeline, P1);

    expect(segments.length).toBe(timeline.spans[P1]?.length);
    for (const segment of segments) {
      expect(segment.d.startsWith('M ')).toBe(true);
      expect(segment.d).toContain(' C ');
    }
  });

  it('starts at the first keyframe position', () => {
    const [first] = playerPathSegments(timeline, P1);
    const start = timeline.spans[P1]?.[0]?.p0;
    if (first === undefined || start === undefined) throw new Error('missing span');

    expect(first.d).toContain(`M ${start.x} ${start.y}`);
  });

  it('labels each segment with the kind the engine reports at its midpoint', () => {
    const segments = playerPathSegments(timeline, P1);
    const spans = timeline.spans[P1] ?? [];

    segments.forEach((segment, index) => {
      const span = spans[index];
      if (span === undefined) throw new Error('missing span');
      expect(['idle', 'move', 'dribble']).toContain(segment.kind);
    });
  });

  it('returns no segments for a player with no track', () => {
    expect(playerPathSegments(timeline, 'ghost' as typeof P1)).toEqual([]);
  });
});

describe('ballPathSegments', () => {
  it('splits the ball path where it changes between held and in flight', () => {
    const segments = ballPathSegments(timeline);

    expect(segments.length).toBeGreaterThan(1);
    const flags = segments.map((s) => s.inFlight);
    for (let i = 1; i < flags.length; i += 1) {
      expect(flags[i]).not.toBe(flags[i - 1]);
    }
  });

  it('produces finite coordinates only', () => {
    for (const segment of ballPathSegments(timeline)) {
      for (const n of segment.d.match(/-?\d+(\.\d+)?/g) ?? []) {
        expect(Number.isFinite(Number(n))).toBe(true);
      }
    }
  });
});

describe('polylineD', () => {
  it('is a moveto followed by linetos', () => {
    expect(
      polylineD([
        { x: 0, y: 0 },
        { x: 1, y: 2 },
      ]),
    ).toBe('M 0 0 L 1 2');
  });

  it('is empty for no points', () => {
    expect(polylineD([])).toBe('');
  });
});

describe('wavyPathD', () => {
  it('stays within the amplitude of the straight line it follows', () => {
    const points = Array.from({ length: 21 }, (_, i) => ({ x: i * 0.5, y: 5 }));
    const d = wavyPathD(points, 0.2, 1);
    const ys = (d.match(/(?<= )-?\d+(\.\d+)?(?= |$)/g) ?? []).map(Number).filter((_, i) => i % 2 === 1);

    for (const y of ys) {
      expect(Math.abs(y - 5)).toBeLessThanOrEqual(0.2 + 1e-9);
    }
  });

  it('is empty for fewer than two points', () => {
    expect(wavyPathD([{ x: 0, y: 0 }], 0.2, 1)).toBe('');
  });
});

describe('wavyPathD squiggle', () => {
  it('actually oscillates, even when the input samples are sparser than the wavelength', () => {
    const points = Array.from({ length: 21 }, (_, i) => ({ x: i * 0.5, y: 5 }));
    const d = wavyPathD(points, 0.2, 1);
    const ys = (d.match(/(?<= )-?\d+(\.\d+)?(?= |$)/g) ?? []).map(Number).filter((_, i) => i % 2 === 1);

    expect(Math.max(...ys.map((y) => Math.abs(y - 5)))).toBeGreaterThan(0.19);
    expect(ys.length).toBeGreaterThan(points.length * 2);
  });
});
