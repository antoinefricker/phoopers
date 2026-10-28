import { describe, expect, it } from 'vitest';
import { resolveBranch } from '../engine';
import { fixturePlay, P1, ROOT } from '../engine/__fixtures__/play';
import {
  TRACK_INSET_END_PX,
  TRACK_INSET_START_PX,
  cellPx,
  barResize,
  gridTicks,
  leftPx,
  rowsOf,
  spanPx,
  timeFromClientX,
} from './timelineGeometry';
import { TIME_GRID_S, gridTime } from '../play2d/transportMath';
import { ZOOM_LEVELS } from './timelineScale';

describe('rowsOf', () => {
  const timeline = resolveBranch(fixturePlay, ROOT);

  it('produces one row per player plus the ball, ball first', () => {
    // The ball leads: it is the one row a coach never reorders, so it sits where nothing has to
    // move past it, and `play.players` is left to carry the order of everything that does.
    const rows = rowsOf(timeline);

    expect(rows).toHaveLength(fixturePlay.players.length + 1);
    expect(rows[0]?.entityId).toBe('ball');
  });

  it('keeps the players in the order the play holds them', () => {
    expect(
      rowsOf(timeline)
        .slice(1)
        .map((r) => r.entityId),
    ).toEqual(fixturePlay.players.map((p) => p.id));
  });

  it('carries each entity keyframes, in time order', () => {
    const row = rowsOf(timeline).find((r) => r.entityId === P1);

    expect(row?.keyframes.map((k) => k.t)).toEqual([0, 2, 4]);
  });

  it('reads the ball keyframes from anchors, so attachments keep their player', () => {
    const row = rowsOf(timeline).find((r) => r.entityId === 'ball');

    expect(row?.keyframes).toHaveLength(4);
    expect(row?.keyframes.map((k) => k.attachedTo)).toEqual([P1, P1, 'p2', 'p2']);
  });

  it('carries a player number, their name and a team onto the row', () => {
    const row = rowsOf(timeline).find((r) => r.entityId === P1);

    expect(row?.number).toBe('1');
    // The fixture names nobody, which is the usual case: the views fall back to side + number.
    expect(row?.label).toBeUndefined();
    expect(row?.team).toBe('offense');
  });

  it('gives the ball no number, it wearing none', () => {
    expect(rowsOf(timeline).find((r) => r.entityId === 'ball')?.number).toBe('');
  });

  it('gives a player with no track an empty row rather than omitting them', () => {
    const sparse = resolveBranch(
      {
        ...fixturePlay,
        branches: fixturePlay.branches.map((b) =>
          b.id === ROOT ? { ...b, tracks: { ball: b.tracks.ball ?? [] } } : b,
        ),
      },
      ROOT,
    );

    // By id, not by position: the case is about the player keeping a row, and the ball leads
    // the list now.
    expect(rowsOf(sparse)).toHaveLength(fixturePlay.players.length + 1);
    expect(rowsOf(sparse).find((r) => r.entityId === P1)?.keyframes).toEqual([]);
  });
});

const rect = (left: number, width: number) => ({ left, width }) as DOMRect;

describe('timeFromClientX', () => {
  it('reads a pointer against the scale, whatever the box is', () => {
    // jsdom reports every bounding box as 0 wide, and the row's own width no longer matters:
    // 240 px from its left edge is 1 s at 24 px per 0.1 s cell.
    expect(timeFromClientX(340, rect(100, 0), 24, 8)).toBeCloseTo(1.0, 9);
  });

  it('is unmoved by the width of the box', () => {
    expect(timeFromClientX(340, rect(100, 5000), 24, 8)).toBeCloseTo(1.0, 9);
  });

  it('returns 0 for a non-positive or NaN duration', () => {
    // A play with no length has nowhere to point at; without the guard the upper clamp would be NaN.
    expect(timeFromClientX(340, rect(100, 200), 24, -8)).toBe(0);
    expect(timeFromClientX(340, rect(100, 200), 24, Number.NaN)).toBe(0);
  });

  it('returns 0 for a scale that is not usable rather than NaN', () => {
    // A zero scale is what a missing zoom level reads as; dividing by it would give Infinity.
    expect(timeFromClientX(340, rect(100, 200), 0, 8)).toBe(0);
  });

  it('returns 0 for a non-finite position rather than NaN', () => {
    expect(timeFromClientX(Number.NaN, rect(100, 200), 24, 8)).toBe(0);
  });

  it('clamps below zero and never returns NaN', () => {
    expect(timeFromClientX(-500, rect(0, 0), 24, 8)).toBe(0);
  });

  it('clamps at the end of the play', () => {
    expect(timeFromClientX(99999, rect(100, 200), 24, 8)).toBe(8);
  });
});

describe('track inset', () => {
  it('keeps room at the end for a marker on the last time, at every zoom', () => {
    // A marker fills the cell that begins at its time, so one on the very last time hangs a whole
    // cell past the axis. The end inset is the widest cell, so the axis does not move as the
    // coach zooms and the marker is never cut.
    expect(TRACK_INSET_END_PX).toBe(Math.max(...ZOOM_LEVELS));
  });

  it('keeps only a small margin at the start, where a marker does not overhang', () => {
    // The marker begins on its time, so nothing hangs left of t = 0. Every pixel of inset is a
    // pixel the axis does not span, on all the surfaces that share it.
    expect(TRACK_INSET_START_PX).toBeGreaterThan(0);
    expect(TRACK_INSET_START_PX).toBeLessThan(TRACK_INSET_END_PX);
  });
});

describe('cellPx', () => {
  it('is the width of one grid cell at each zoom', () => {
    for (const level of ZOOM_LEVELS) {
      expect(cellPx(level)).toBe(`${level}px`);
    }
  });

  it('is a usable width for a degenerate scale', () => {
    expect(cellPx(Number.NaN)).toBe('0px');
  });
});

describe('gridTicks', () => {
  // Written against TIME_GRID_S rather than its value: a line per authoring cell is the rule,
  // and the cell has been retuned once already.
  const CELLS_PER_SECOND = Math.round(1 / TIME_GRID_S);

  it('puts a line on every authoring cell, from zero to the duration', () => {
    // A minor line marks a time a keyframe can actually take.
    const ticks = gridTicks(2);

    expect(ticks).toHaveLength(2 * CELLS_PER_SECOND + 1);
    expect(ticks.map((tick) => tick.t)).toEqual(ticks.map((_, index) => gridTime(index)));
  });

  it('marks the whole seconds major and the cells between them minor', () => {
    const ticks = gridTicks(2);

    expect(ticks.filter((tick) => tick.major).map((tick) => tick.t)).toEqual([0, 1, 2]);
    expect(ticks.filter((tick) => !tick.major)).toHaveLength(ticks.length - 3);
  });

  it('keeps the times clean rather than letting a cell count drift', () => {
    // 63 cells of 0.1s multiply out to 6.300000000000001, which misses the `% 1 === 0` test.
    const ticks = gridTicks(20);

    expect(ticks.map((tick) => tick.t)).toEqual(ticks.map((tick) => Number(tick.t.toFixed(6))));
    expect(ticks.filter((tick) => tick.major)).toHaveLength(21);
  });

  it('stops short of the duration when it is not a whole number of cells', () => {
    const ticks = gridTicks(1 + TIME_GRID_S / 2);

    expect(ticks.at(-1)?.t).toBe(1);
  });

  it('drops the sub-second cells on a play too long to draw them all', () => {
    // 240 lines is the cutoff, so the shortest play that crosses it is 240 cells long.
    const ticks = gridTicks(240 * TIME_GRID_S);

    expect(ticks.every((tick) => tick.major)).toBe(true);
    expect(ticks).toHaveLength(240 / CELLS_PER_SECOND + 1);
  });

  it('has no grid for a duration that is not a positive number', () => {
    expect(gridTicks(0)).toEqual([]);
    expect(gridTicks(-1)).toEqual([]);
    expect(gridTicks(Number.NaN)).toEqual([]);
    expect(gridTicks(Number.POSITIVE_INFINITY)).toEqual([]);
  });
});

describe('placing a time', () => {
  it('is a distance, not a share', () => {
    expect(leftPx(2.5, 24)).toBe('600px');
    expect(spanPx(1, 2.5, 24)).toBe('360px');
  });

  it('gives a span that starts where it ends no width', () => {
    expect(spanPx(3, 3, 24)).toBe('0px');
  });

  it('survives a scale that is not usable rather than writing NaN', () => {
    // A missing zoom level reads as a zero scale, and `NaNpx` would be dropped by the browser.
    expect(leftPx(2, Number.NaN)).toBe('0px');
    expect(spanPx(2, 4, Number.NaN)).toBe('0px');
  });
});

describe('barResize', () => {
  // The handle is a child of the bar it resizes, which is the relationship the helper encodes.
  const handleInBar = () => {
    const bar = document.createElement('div');
    const handle = document.createElement('button');
    bar.appendChild(handle);

    return { bar, handle };
  };

  it('writes the width of the bar the handle sits on, not the handle', () => {
    const { bar, handle } = handleInBar();

    barResize(2, 4, 24).place(handle, 6);

    expect(bar.style.width).toBe('960px');
    expect(handle.style.width).toBe('');
  });

  it('puts the bar back to where the span ended when a drag is abandoned', () => {
    const { bar, handle } = handleInBar();
    barResize(2, 4, 24).place(handle, 6);

    barResize(2, 4, 24).restore(handle);

    expect(bar.style.width).toBe('480px');
  });

  it('measures from the span start, which a drag of the end never moves', () => {
    const { bar, handle } = handleInBar();

    barResize(4, 6, 24).place(handle, 8);

    expect(bar.style.width).toBe('960px');
  });

  it('writes nothing for a handle with no bar rather than throwing', () => {
    // The drag only previews; the commit that follows reads the model, not the DOM.
    const orphan = document.createElement('button');

    expect(() => barResize(2, 4, 24).place(orphan, 6)).not.toThrow();
    expect(() => barResize(2, 4, 24).restore(orphan)).not.toThrow();
  });
});
