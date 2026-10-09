import { describe, expect, it } from 'vitest';
import { COURT_SPEC, courtMarkings, fullCourtViewBox, halfCourtViewBox } from './court';

describe('courtMarkings', () => {
  it('bounds every marking inside the court for both court types', () => {
    for (const court of ['fiba', 'nba'] as const) {
      const spec = COURT_SPEC[court];
      for (const marking of courtMarkings(court)) {
        if (marking.kind === 'circle') {
          expect(marking.cx).toBeGreaterThanOrEqual(0);
          expect(marking.cx).toBeLessThanOrEqual(spec.length);
          expect(marking.cy).toBeGreaterThanOrEqual(0);
          expect(marking.cy).toBeLessThanOrEqual(spec.width);
        }
        if (marking.kind === 'line') {
          for (const v of [marking.x1, marking.x2]) {
            expect(v).toBeGreaterThanOrEqual(-0.01);
            expect(v).toBeLessThanOrEqual(spec.length + 0.01);
          }
        }
      }
    }
  });

  it('is mirror-symmetric about the half-way line', () => {
    const spec = COURT_SPEC.fiba;
    const circles = courtMarkings('fiba').filter((m) => m.kind === 'circle');
    const left = circles.filter((c) => c.cx < spec.length / 2).length;
    const right = circles.filter((c) => c.cx > spec.length / 2).length;

    expect(left).toBe(right);
    expect(left).toBeGreaterThan(0);
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

  it('half court spans the attacking half only', () => {
    expect(halfCourtViewBox('fiba')).toBe('0 0 14 15');
  });
});
