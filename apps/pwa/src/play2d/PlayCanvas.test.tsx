import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'vitest';
import { pointOnCubic, resolveBranch, stateAt, type Vec2 } from '../engine';
import { HORNS_SWITCH, hornsPlay } from '../samples/horns';
import { PlaybackContextProvider } from './PlaybackContextProvider';
import { PlayCanvas } from './PlayCanvas';
import { APRON, COURT_SPEC, courtMarkings, fullCourtViewBox, halfCourtViewBox } from './geometry/court';
import { playerPathSegments } from './geometry/paths';
import { DRIBBLE_AMPLITUDE } from './pathSymbols';

function renderCanvas(half = false) {
  return render(
    <MantineProvider>
      <PlaybackContextProvider play={hornsPlay}>
        <PlayCanvas extent={half ? 'half' : 'full'} playName={hornsPlay.name} />
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

  it('frames, clips and turns the half court without touching the play', () => {
    const full = renderCanvas(false);
    const fullViewBox = screen.getByRole('img').getAttribute('viewBox');
    const fullPaths = snapshotPaths(full.container);
    expect(screen.getByTestId('court-turn')).not.toHaveAttribute('transform');
    expect(full.container.querySelector('clipPath')).toBeNull();
    full.unmount();

    const half = renderCanvas(true);
    const halfViewBox = screen.getByRole('img').getAttribute('viewBox');

    expect(fullPaths.length).toBeGreaterThan(10);
    // A half-court system always shows the right half, where the attacked basket is, turned a
    // quarter so that it is in landscape with the basket at the top.
    expect(halfViewBox).toBe(halfCourtViewBox('fiba', 'right'));
    expect(halfViewBox).not.toBe(fullViewBox);
    expect(screen.getByTestId('court-turn')).toHaveAttribute('transform', 'rotate(-90)');
    // Only that half is drawn: the floor and the markings are both clipped to it.
    expect(screen.getByTestId('court-floor')).toHaveAttribute('clip-path', 'url(#court-floor-clip)');
    expect(screen.getByTestId('court')).toHaveAttribute('clip-path', 'url(#court-markings-clip)');
    // The turn and the clip are the view's: every path's geometry and symbol are the full court's.
    expect(snapshotPaths(half.container)).toEqual(fullPaths);
  });

  it('draws each token upright inside a turned court, and leaves a full court alone', () => {
    const full = renderCanvas(false);
    const fullTurns = Array.from(full.container.querySelectorAll('[data-testid="token"] > g')).map((g) =>
      g.getAttribute('transform'),
    );
    full.unmount();

    const half = renderCanvas(true);
    const halfTurns = Array.from(half.container.querySelectorAll('[data-testid="token"] > g')).map((g) =>
      g.getAttribute('transform'),
    );

    expect(fullTurns.length).toBeGreaterThan(0);
    expect(fullTurns.every((turn) => turn === null)).toBe(true);
    expect(halfTurns).toHaveLength(fullTurns.length);
    expect(halfTurns.every((turn) => turn === 'rotate(90)')).toBe(true);
    expect(screen.getByTestId('ball-token').firstElementChild).toHaveAttribute('transform', 'rotate(90)');
  });

  it.each([
    ['root', hornsPlay.rootBranchId],
    ['switch', HORNS_SWITCH],
  ])('shows every entity inside the half-court viewBox at the start and end (%s branch)', (_name, branchId) => {
    // Read the viewBox and the turn off the rendered svg, not off the geometry helpers: a
    // function compared to itself cannot disagree with itself, which is how the wrong half once
    // shipped. An entity's court position goes through the turn the court is drawn with.
    const branch = resolveBranch(hornsPlay, branchId);
    renderCanvas(true);
    const [x, y, w, h] = (screen.getByRole('img').getAttribute('viewBox') ?? '').split(' ').map(Number);
    if (x === undefined || y === undefined || w === undefined || h === undefined) throw new Error('bad viewBox');
    const degrees = Number(
      /rotate\((-?[\d.]+)\)/.exec(screen.getByTestId('court-turn').getAttribute('transform') ?? '')?.[1],
    );
    const radians = (degrees * Math.PI) / 180;

    for (const t of [0, branch.duration]) {
      const state = stateAt(branch, t);
      const points = [...Object.values(state.players).map((p) => p.position), state.ball.position];
      expect(points.length).toBe(branch.players.length + 1);
      for (const p of points) {
        const screenX = p.x * Math.cos(radians) - p.y * Math.sin(radians);
        const screenY = p.x * Math.sin(radians) + p.y * Math.cos(radians);
        expect(screenX).toBeGreaterThanOrEqual(x);
        expect(screenX).toBeLessThanOrEqual(x + w);
        expect(screenY).toBeGreaterThanOrEqual(y);
        expect(screenY).toBeLessThanOrEqual(y + h);
      }
    }
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

  it('frames the floor and the apron around it', () => {
    // The apron gives the boundary line somewhere to sit: centred on the court's edge, half of
    // it would fall outside a frame cut exactly to the floor and draw at half thickness.
    renderCanvas();
    const [x, y, width, height] = (screen.getByRole('img').getAttribute('viewBox') ?? '').split(' ').map(Number);

    expect(width).toBe(COURT_SPEC.fiba.length + APRON * 2);
    expect(height).toBe(COURT_SPEC.fiba.width + APRON * 2);
    expect(x).toBe(-APRON);
    expect(y).toBe(-APRON);
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

  describe('screens', () => {
    function marks(container: HTMLElement) {
      return Array.from(container.querySelectorAll('[data-testid="screen-mark"]'));
    }

    it('draws one mark per screen in the resolved timeline', () => {
      const { container } = renderCanvas();

      expect(timeline.screens.length).toBeGreaterThanOrEqual(2);
      expect(marks(container)).toHaveLength(timeline.screens.length);
    });

    it('centres each mark on its screener at the time of the screen, across the screener path', () => {
      const { container } = renderCanvas();

      timeline.screens.forEach((screenEvent, index) => {
        const mark = marks(container)[index];
        const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((a) => Number(mark?.getAttribute(a)));
        const at = stateAt(timeline, screenEvent.t).players[screenEvent.screenerId]?.position;
        const before = stateAt(timeline, screenEvent.t - 0.1).players[screenEvent.screenerId]?.position;
        if (at === undefined || before === undefined) throw new Error('no screener');

        expect([x1, y1, x2, y2].every(Number.isFinite)).toBe(true);
        expect(((x1 ?? NaN) + (x2 ?? NaN)) / 2).toBeCloseTo(at.x, 6);
        expect(((y1 ?? NaN) + (y2 ?? NaN)) / 2).toBeCloseTo(at.y, 6);
        // Not a dot: it has a real length, and it is perpendicular to the way the screener arrived.
        expect(Math.hypot((x2 ?? 0) - (x1 ?? 0), (y2 ?? 0) - (y1 ?? 0))).toBeGreaterThan(0.5);
        const dot = ((x2 ?? 0) - (x1 ?? 0)) * (at.x - before.x) + ((y2 ?? 0) - (y1 ?? 0)) * (at.y - before.y);
        expect(Math.abs(dot)).toBeLessThan(1e-6);
        // The screener actually travelled, so the perpendicular claim above is not vacuous.
        expect(Math.hypot(at.x - before.x, at.y - before.y)).toBeGreaterThan(0.01);
      });
    });
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

describe('text selection', () => {
  it('makes the court unselectable, so a drag does not select the player labels', () => {
    // Without this a drag across the court highlights "1 2 3 4 5 X1 …" — the classic
    // drag-on-SVG artefact. The labels are not content to copy; they are part of the drawing.
    const { container } = renderCanvas();
    const svg = container.querySelector('svg');

    expect(svg?.style.userSelect).toBe('none');
  });
});
