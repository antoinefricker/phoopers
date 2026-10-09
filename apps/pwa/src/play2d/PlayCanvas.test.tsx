import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'vitest';
import { pointOnCubic, resolveBranch, type Vec2 } from '../engine';
import { hornsPlay } from '../samples/horns';
import { PlaybackContextProvider } from './PlaybackContextProvider';
import { PlayCanvas } from './PlayCanvas';
import { COURT_SPEC, courtMarkings, fullCourtViewBox, halfCourtViewBox } from './geometry/court';
import { playerPathSegments } from './geometry/paths';
import { DRIBBLE_AMPLITUDE } from './pathSymbols';

function renderCanvas(halfCourt = false) {
  return render(
    <MantineProvider>
      <PlaybackContextProvider play={hornsPlay}>
        <PlayCanvas halfCourt={halfCourt} />
      </PlaybackContextProvider>
    </MantineProvider>,
  );
}

const timeline = resolveBranch(hornsPlay, hornsPlay.rootBranchId);

/** Every drawn path element, in document order, with the attributes that define its symbol. */
function snapshotPaths(container: HTMLElement) {
  return Array.from(container.querySelectorAll('[data-testid="player-path"] path, [data-testid="ball-path"]')).map(
    (el) => ({
      testid: el.getAttribute('data-testid'),
      kind: el.getAttribute('data-kind'),
      d: el.getAttribute('d'),
      dash: el.getAttribute('stroke-dasharray'),
      marker: el.getAttribute('marker-end'),
    }),
  );
}

function pointsOf(d: string): Vec2[] {
  const numbers = d.match(/-?\d+(\.\d+)?(e-?\d+)?/g)?.map(Number) ?? [];
  const points: Vec2[] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    points.push({ x: numbers[i] ?? NaN, y: numbers[i + 1] ?? NaN });
  }
  return points;
}

describe('PlayCanvas', () => {
  it('uses the full-court viewBox by default', () => {
    renderCanvas();

    expect(screen.getByRole('img')).toHaveAttribute('viewBox', fullCourtViewBox('fiba'));
  });

  it('switches only the viewBox for half court', () => {
    const full = renderCanvas(false);
    const fullViewBox = screen.getByRole('img').getAttribute('viewBox');
    const fullPaths = snapshotPaths(full.container);
    const fullInner = screen.getByRole('img').innerHTML;
    full.unmount();

    const half = renderCanvas(true);
    const halfViewBox = screen.getByRole('img').getAttribute('viewBox');

    expect(fullPaths.length).toBeGreaterThan(10);
    expect(halfViewBox).toBe(halfCourtViewBox('fiba'));
    expect(halfViewBox).not.toBe(fullViewBox);
    // Every path's geometry and symbol attributes are identical, as is all the markup inside the svg.
    expect(snapshotPaths(half.container)).toEqual(fullPaths);
    expect(screen.getByRole('img').innerHTML).toBe(fullInner);
  });

  it('draws a path group per player', () => {
    const { container } = renderCanvas();

    expect(container.querySelectorAll('[data-testid="player-path"]')).toHaveLength(timeline.players.length);
  });

  it('draws the ball path', () => {
    const { container } = renderCanvas();

    expect(container.querySelectorAll('[data-testid="ball-path"]').length).toBeGreaterThan(0);
  });

  it('renders every court marking', () => {
    const { container } = renderCanvas();

    expect(container.querySelectorAll('[data-testid="court"] > *')).toHaveLength(courtMarkings('fiba').length);
  });

  it('fits the court inside its own viewBox', () => {
    renderCanvas();
    const [, , width, height] = (screen.getByRole('img').getAttribute('viewBox') ?? '').split(' ').map(Number);

    expect(width).toBe(COURT_SPEC.fiba.length);
    expect(height).toBe(COURT_SPEC.fiba.width);
  });

  it('never draws an empty path', () => {
    const { container } = renderCanvas();

    for (const path of container.querySelectorAll('[data-testid="player-path"] path, [data-testid="ball-path"]')) {
      expect(path.getAttribute('d')).toMatch(/^M /);
    }
  });

  it('points every dribble arrowhead along the span end tangent (horns)', () => {
    const { container } = renderCanvas();
    let checked = 0;

    timeline.players.forEach((player, playerIndex) => {
      const spans = timeline.spans[player.id] ?? [];
      const paths =
        container.querySelectorAll('[data-testid="player-path"]')[playerIndex]?.querySelectorAll('path') ?? [];
      const drawn = Array.from(paths);
      const kinds = playerPathSegments(timeline, player.id);
      let cursor = 0;
      kinds.forEach((segment, index) => {
        if (segment.kind === 'idle') return;
        const el = drawn[cursor];
        cursor += 1;
        const span = spans[index];
        if (segment.kind !== 'dribble' || el === undefined || span === undefined) return;
        const pts = pointsOf(el.getAttribute('d') ?? '');
        const a = pts[pts.length - 2];
        const b = pts[pts.length - 1];
        if (a === undefined || b === undefined) throw new Error('short path');
        const diff = Math.atan2(b.y - a.y, b.x - a.x) - Math.atan2(span.p3.y - span.p2.y, span.p3.x - span.p2.x);
        expect(Math.abs((Math.atan2(Math.sin(diff), Math.cos(diff)) * 180) / Math.PI)).toBeLessThan(5);
        checked += 1;
      });
    });

    expect(checked).toBeGreaterThan(0);
  });

  describe('symbols', () => {
    function pathsOfKind(container: HTMLElement, kind: string) {
      return Array.from(container.querySelectorAll(`[data-testid="player-path"] path[data-kind="${kind}"]`));
    }

    it('draws movement as a solid cubic with an arrowhead', () => {
      const { container } = renderCanvas();
      const moves = pathsOfKind(container, 'move');

      expect(moves.length).toBeGreaterThan(0);
      for (const move of moves) {
        expect(move.getAttribute('d')).toContain(' C ');
        expect(move).not.toHaveAttribute('stroke-dasharray');
        expect(move).toHaveAttribute('marker-end', 'url(#arrowhead)');
      }
    });

    it('draws a dribble as a wavy line that oscillates around the span it follows, with an arrowhead', () => {
      const { container } = renderCanvas();
      const dribbles = pathsOfKind(container, 'dribble');
      expect(dribbles.length).toBeGreaterThan(0);

      for (const dribble of dribbles) {
        const d = dribble.getAttribute('d') ?? '';
        expect(d).not.toContain(' C ');
        expect(d).not.toMatch(/NaN|Infinity/);
        expect(dribble).not.toHaveAttribute('stroke-dasharray');
        expect(dribble).toHaveAttribute('marker-end', 'url(#arrowhead)');
      }

      // Find the span a dribble follows and measure its distance from the underlying cubic.
      const dribblingPlayer = timeline.players.find((player) =>
        playerPathSegments(timeline, player.id).some((segment) => segment.kind === 'dribble'),
      );
      if (dribblingPlayer === undefined) throw new Error('the horns play has no dribble');
      const segments = playerPathSegments(timeline, dribblingPlayer.id);
      const index = segments.findIndex((segment) => segment.kind === 'dribble');
      const span = timeline.spans[dribblingPlayer.id]?.[index];
      if (span === undefined) throw new Error('missing span');
      const curve = Array.from({ length: 400 }, (_, i) => pointOnCubic(span.p0, span.p1, span.p2, span.p3, i / 399));

      const group =
        container.querySelectorAll('[data-testid="player-path"]')[
          timeline.players.findIndex((player) => player.id === dribblingPlayer.id)
        ];
      const wavy = group?.querySelectorAll('path')[index];
      const points = pointsOf(wavy?.getAttribute('d') ?? '');
      const deviations = points.map((p) => Math.min(...curve.map((c) => Math.hypot(c.x - p.x, c.y - p.y))));
      const amplitude = DRIBBLE_AMPLITUDE;

      // It really wiggles (not a flat copy of the curve) yet never strays beyond the amplitude.
      expect(Math.max(...deviations)).toBeGreaterThan(amplitude * 0.9);
      expect(Math.max(...deviations)).toBeLessThanOrEqual(amplitude + 0.01);
      // It alternates sides of the curve: at least several zero crossings along the span.
      const sign = (p: Vec2) => {
        const nearest = curve.reduce((best, c) =>
          Math.hypot(c.x - p.x, c.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? c : best,
        );
        const next = curve[Math.min(curve.indexOf(nearest) + 1, curve.length - 1)] ?? nearest;
        const prev = curve[Math.max(curve.indexOf(nearest) - 1, 0)] ?? nearest;
        return Math.sign((next.x - prev.x) * (p.y - nearest.y) - (next.y - prev.y) * (p.x - nearest.x));
      };
      const signs = points.map(sign).filter((s) => s !== 0);
      const flips = signs.filter((s, i) => i > 0 && s !== signs[i - 1]).length;
      expect(flips).toBeGreaterThanOrEqual(4);
    });

    it('draws a pass as a dashed line with an arrowhead, and a held ball not at all', () => {
      const { container } = renderCanvas();
      const ball = Array.from(container.querySelectorAll('[data-testid="ball-path"]'));

      expect(ball.length).toBeGreaterThan(0);
      for (const segment of ball) {
        expect(segment).toHaveAttribute('stroke-dasharray');
        expect(segment).toHaveAttribute('marker-end', 'url(#arrowhead)');
      }
    });

    it('does not draw a symbol for a player standing still', () => {
      const { container } = renderCanvas();
      const idleCount = timeline.players.flatMap((p) =>
        playerPathSegments(timeline, p.id).filter((s) => s.kind === 'idle'),
      ).length;
      const total = timeline.players.flatMap((p) => playerPathSegments(timeline, p.id)).length;

      expect(container.querySelectorAll('[data-testid="player-path"] path')).toHaveLength(total - idleCount);
    });

    it('colours offense and defense differently through Mantine variables', () => {
      const { container } = renderCanvas();
      const strokes = Array.from(container.querySelectorAll('[data-testid="player-path"]')).map((g) =>
        g.getAttribute('stroke'),
      );

      expect(new Set(strokes).size).toBe(2);
      for (const stroke of strokes) expect(stroke).toMatch(/^var\(--mantine-color-/);
    });
  });
});
