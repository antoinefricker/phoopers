import { describe, expect, it } from 'vitest';
import { COURT_SPEC, courtMarkings, fullCourtViewBox, halfCourtViewBox } from './court';
import type { CourtType, Marking } from './court';

const COURTS: CourtType[] = ['fiba', 'nba'];

/** Floating-point noise only: markings must lie on or inside the floor, with no real slack. */
const EPSILON = 1e-9;

interface Arc {
  x1: number;
  y1: number;
  radius: number;
  sweep: number;
  x2: number;
  y2: number;
}

function parseArc(marking: Marking | undefined): Arc {
  if (marking?.kind !== 'path') throw new Error('expected a path marking');
  const m = /^M ([\d.]+) ([\d.]+) A ([\d.]+) [\d.]+ 0 0 ([01]) ([\d.]+) ([\d.]+)$/.exec(marking.d);
  if (!m) throw new Error(`unparseable arc: ${marking.d}`);
  const [x1, y1, radius, sweep, x2, y2] = m.slice(1).map(Number);
  if (x1 === undefined || y1 === undefined || radius === undefined || sweep === undefined) {
    throw new Error('incomplete arc');
  }
  if (x2 === undefined || y2 === undefined) throw new Error('incomplete arc');
  return { x1, y1, radius, sweep, x2, y2 };
}

/** The first 3 markings are shared (floor, half-way line, centre circle); then 7 per end, left first. */
function ends(court: CourtType): { left: Marking[]; right: Marking[] } {
  const rest = courtMarkings(court).slice(3);
  const half = rest.length / 2;
  return { left: rest.slice(0, half), right: rest.slice(half) };
}

/** Midpoint of the minor arc, derived from the sweep flag (SVG: 1 = clockwise on a y-down screen). */
function arcMidpoint(arc: Arc): { x: number; y: number } {
  const mx = (arc.x1 + arc.x2) / 2;
  const my = (arc.y1 + arc.y2) / 2;
  const dx = arc.x2 - arc.x1;
  const dy = arc.y2 - arc.y1;
  const chord = Math.hypot(dx, dy);
  const h = Math.sqrt(arc.radius ** 2 - (chord / 2) ** 2);
  const sign = arc.sweep === 1 ? 1 : -1;
  // Clockwise travel keeps the centre on the right-hand side, (-dy, dx) on a y-down screen.
  const cx = mx + (sign * h * -dy) / chord;
  const cy = my + (sign * h * dx) / chord;
  const ux = (mx - cx) / h;
  const uy = (my - cy) / h;
  return { x: cx + arc.radius * ux, y: cy + arc.radius * uy };
}

describe('courtMarkings', () => {
  it('keeps every marking inside the court for both court types', () => {
    for (const court of COURTS) {
      const spec = COURT_SPEC[court];
      const inX = (v: number) => {
        expect(v).toBeGreaterThanOrEqual(-EPSILON);
        expect(v).toBeLessThanOrEqual(spec.length + EPSILON);
      };
      const inY = (v: number) => {
        expect(v).toBeGreaterThanOrEqual(-EPSILON);
        expect(v).toBeLessThanOrEqual(spec.width + EPSILON);
      };

      for (const marking of courtMarkings(court)) {
        if (marking.kind === 'circle') {
          inX(marking.cx - marking.r);
          inX(marking.cx + marking.r);
          inY(marking.cy - marking.r);
          inY(marking.cy + marking.r);
        } else if (marking.kind === 'line') {
          inX(marking.x1);
          inX(marking.x2);
          inY(marking.y1);
          inY(marking.y2);
        } else if (marking.kind === 'rect') {
          inX(marking.x);
          inX(marking.x + marking.w);
          inY(marking.y);
          inY(marking.y + marking.h);
        } else {
          const arc = parseArc(marking);
          inX(arc.x1);
          inX(arc.x2);
          inY(arc.y1);
          inY(arc.y2);
        }
      }
    }
  });

  it('mirrors every left-end marking onto the right end about the half-way line', () => {
    for (const court of COURTS) {
      const { length } = COURT_SPEC[court];
      const { left, right } = ends(court);

      expect(right).toHaveLength(left.length);
      left.forEach((l, i) => {
        const r = right[i];
        expect(r?.kind).toBe(l.kind);
        if (l.kind === 'rect' && r?.kind === 'rect') {
          expect(r.x).toBeCloseTo(length - l.x - l.w, 9);
          expect(r.y).toBeCloseTo(l.y, 9);
          expect(r.w).toBeCloseTo(l.w, 9);
          expect(r.h).toBeCloseTo(l.h, 9);
        } else if (l.kind === 'line' && r?.kind === 'line') {
          expect(r.x1).toBeCloseTo(length - l.x1, 9);
          expect(r.x2).toBeCloseTo(length - l.x2, 9);
          expect(r.y1).toBeCloseTo(l.y1, 9);
          expect(r.y2).toBeCloseTo(l.y2, 9);
        } else if (l.kind === 'circle' && r?.kind === 'circle') {
          expect(r.cx).toBeCloseTo(length - l.cx, 9);
          expect(r.cy).toBeCloseTo(l.cy, 9);
          expect(r.r).toBeCloseTo(l.r, 9);
        } else if (l.kind === 'path') {
          const la = parseArc(l);
          const ra = parseArc(r);
          expect(ra.x1).toBeCloseTo(length - la.x1, 9);
          expect(ra.x2).toBeCloseTo(length - la.x2, 9);
          expect(ra.y1).toBeCloseTo(la.y1, 9);
          expect(ra.y2).toBeCloseTo(la.y2, 9);
          expect(ra.radius).toBeCloseTo(la.radius, 9);
        }
      });
    }
  });

  it('bulges each three-point arc away from its own baseline', () => {
    for (const court of COURTS) {
      const { length } = COURT_SPEC[court];
      const { left, right } = ends(court);
      const cases = [
        { arc: parseArc(left.find((m) => m.kind === 'path')), baseline: 0 },
        { arc: parseArc(right.find((m) => m.kind === 'path')), baseline: length },
      ];

      for (const { arc, baseline } of cases) {
        const mid = arcMidpoint(arc);

        expect(Math.abs(mid.x - baseline)).toBeGreaterThan(Math.abs(arc.x1 - baseline) + 1);
        expect(Math.abs(mid.x - baseline)).toBeGreaterThan(Math.abs(arc.x2 - baseline) + 1);
      }
    }
  });

  it('places the centre circle at the exact centre', () => {
    const spec = COURT_SPEC.fiba;
    const centre = courtMarkings('fiba').find((m) => m.kind === 'circle' && Math.abs(m.cx - spec.length / 2) < 1e-9);

    expect(centre).toBeDefined();
    expect(centre?.kind === 'circle' ? centre.cy : undefined).toBeCloseTo(spec.width / 2, 9);
  });

  it('agrees with the engine on court dimensions', () => {
    expect(COURT_SPEC.fiba.length).toBe(28);
    expect(COURT_SPEC.fiba.width).toBe(15);
    expect(COURT_SPEC.nba.length).toBe(28.65);
    expect(COURT_SPEC.nba.width).toBe(15.24);
  });

  it('starts the three-point arc exactly one radius from the basket', () => {
    for (const court of ['fiba', 'nba'] as const) {
      const spec = COURT_SPEC[court];
      const arc = courtMarkings(court).find((m) => m.kind === 'path');
      const match = arc?.kind === 'path' ? /^M ([\d.]+) ([\d.]+) /.exec(arc.d) : null;
      const x = Number(match?.[1]);
      const y = Number(match?.[2]);

      expect(Math.hypot(x - spec.basketFromBaseline, y - spec.width / 2)).toBeCloseTo(spec.threePointRadius, 9);
    }
  });

  it('places the backboard face at its own distance from the baseline', () => {
    for (const court of ['fiba', 'nba'] as const) {
      const spec = COURT_SPEC[court];
      const board = courtMarkings(court).find(
        (m) => m.kind === 'line' && Math.abs(m.y2 - m.y1 - spec.backboardWidth) < 1e-9,
      );

      expect(board?.kind === 'line' ? board.x1 : undefined).toBeCloseTo(spec.backboardFromBaseline, 9);
    }
  });
});

describe('viewBoxes', () => {
  it('full court spans the whole floor', () => {
    expect(fullCourtViewBox('fiba')).toBe('0 0 28 15');
  });

  it('half court spans exactly one half of the floor, chosen by side', () => {
    expect(halfCourtViewBox('fiba', 'left')).toBe('0 0 14 15');
    expect(halfCourtViewBox('fiba', 'right')).toBe('14 0 14 15');
    expect(halfCourtViewBox('nba', 'right')).toBe(`${28.65 / 2} 0 ${28.65 / 2} 15.24`);
  });
});
