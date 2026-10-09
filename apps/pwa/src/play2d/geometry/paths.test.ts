import { describe, expect, it } from 'vitest';
import { resolveBranch, spanKindAt } from '../../engine';
import { fixturePlay, P1, P2, ROOT } from '../../engine/__fixtures__/play';
import { ballPathSegments, dribblePathD, playerPathSegments, polylineD, wavyPathD } from './paths';

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
      expect(segment.kind).toBe(spanKindAt(timeline, P1, (span.fromT + span.toT) / 2));
    });
  });

  it('pins the fixture kinds at span midpoints', () => {
    // P1 holds the ball only until t=1, so the midpoint (t=1) of its first span is already a
    // move even though sampling at the span start (t=0) would say dribble.
    expect(playerPathSegments(timeline, P1).map((s) => s.kind)).toEqual(['move', 'move']);
    // P2 runs to the entry pass, then receives the ball and dribbles.
    expect(playerPathSegments(timeline, P2).map((s) => s.kind)).toEqual(['move', 'dribble']);
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
      expect(segment.d).not.toMatch(/NaN|Infinity/);
      const tokens = segment.d.split(/\s+/).filter((token) => !/^[MLC]$/.test(token));
      expect(tokens.length).toBeGreaterThan(0);
      for (const token of tokens) {
        expect(Number.isFinite(Number(token))).toBe(true);
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

/** Angle in degrees between the last drawn segment of a polyline `d` and the direction (dx, dy). */
function endTilt(d: string, dx: number, dy: number): number {
  const nums = (d.match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? []).map(Number);
  const n = nums.length;
  const [x1, y1, x2, y2] = [nums[n - 4], nums[n - 3], nums[n - 2], nums[n - 1]];
  if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) throw new Error('short path');
  const diff = Math.atan2(y2 - y1, x2 - x1) - Math.atan2(dy, dx);
  return Math.abs((Math.atan2(Math.sin(diff), Math.cos(diff)) * 180) / Math.PI);
}

describe('wavyPathD end direction', () => {
  it('ends exactly on the path end', () => {
    const d = wavyPathD(
      Array.from({ length: 11 }, (_, i) => ({ x: i * 0.37, y: i * 0.11 })),
      0.12,
      0.6,
    );

    expect(d.endsWith(`L ${10 * 0.37} ${10 * 0.11}`)).toBe(true);
  });

  it('points its final segment along the path, whatever phase the wave ends in', () => {
    // Lengths sweep the end phase through the whole wavelength.
    for (let length = 1; length <= 3; length += 0.07) {
      const points = Array.from({ length: 41 }, (_, i) => ({ x: (i / 40) * length, y: 2 }));
      expect(endTilt(wavyPathD(points, 0.12, 0.6), 1, 0)).toBeLessThan(5);
    }
  });

  it('points along the end tangent of real dribble cubics', () => {
    const spans = [
      { p0: { x: 0, y: 0 }, p1: { x: 1.3, y: 0.2 }, p2: { x: 2.1, y: 1.4 }, p3: { x: 3.3, y: 1.9 } },
      { p0: { x: 5, y: 5 }, p1: { x: 4, y: 6.5 }, p2: { x: 2.2, y: 6.9 }, p3: { x: 1.1, y: 5.6 } },
      { p0: { x: 0, y: 0 }, p1: { x: 0.3, y: 0.1 }, p2: { x: 0.6, y: 0.3 }, p3: { x: 0.9, y: 0.4 } },
    ];
    for (const span of spans) {
      const d = dribblePathD(span, 0.12, 0.6);
      expect(endTilt(d, span.p3.x - span.p2.x, span.p3.y - span.p2.y)).toBeLessThan(5);
    }
  });

  it('is empty for a zero-length dribble span', () => {
    const p = { x: 3, y: 3 };

    expect(dribblePathD({ p0: p, p1: p, p2: p, p3: p }, 0.12, 0.6)).toBe('');
  });
});
