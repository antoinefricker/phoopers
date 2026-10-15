import { describe, expect, it } from 'vitest';
import { resolveBranch } from '../engine';
import { fixturePlay, P1, ROOT } from '../engine/__fixtures__/play';
import { MARKER_WIDTH_PX, TRACK_INSET_PX, fractionOf, gridTicks, rowsOf, timeFromClientX } from './timelineGeometry';
import { TIME_GRID_S, gridTime } from '../play2d/transportMath';

describe('fractionOf', () => {
  it('maps a time to its fraction of the duration', () => {
    expect(fractionOf(2, 8)).toBe(0.25);
  });

  it('returns 0 for a zero duration rather than NaN', () => {
    expect(fractionOf(0, 0)).toBe(0);
  });

  it('clamps a time beyond the duration to 1', () => {
    expect(fractionOf(12, 8)).toBe(1);
  });
});

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

  it('labels a player row with the player label and a team', () => {
    const row = rowsOf(timeline).find((r) => r.entityId === P1);

    expect(row?.label).toBe('1');
    expect(row?.team).toBe('offense');
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
  it('maps a position across the row to a time', () => {
    expect(timeFromClientX(150, rect(100, 200), 8)).toBe(2);
  });

  it('returns 0 for a zero-width row rather than NaN', () => {
    // jsdom reports every bounding box as 0x0, so this is the only branch most component tests take.
    expect(timeFromClientX(150, rect(100, 0), 8)).toBe(0);
  });

  it('returns 0 for a non-positive or NaN duration', () => {
    // A zero duration alone would not pin the guard: clamp(f) * 0 is 0 either way.
    expect(timeFromClientX(150, rect(100, 200), -8)).toBe(0);
    expect(timeFromClientX(150, rect(100, 200), Number.NaN)).toBe(0);
  });

  it('returns 0 for a non-finite position rather than NaN', () => {
    expect(timeFromClientX(Number.NaN, rect(100, 200), 8)).toBe(0);
  });

  it('clamps beyond either end', () => {
    expect(timeFromClientX(0, rect(100, 200), 8)).toBe(0);
    expect(timeFromClientX(999, rect(100, 200), 8)).toBe(8);
  });
});

describe('track inset', () => {
  it('reserves half the marker width, which is what a marker overhangs', () => {
    // The marker is centred on its time, so it reaches half its width past it. It used to be a
    // square rotated 45 degrees, where the overhang was half the DIAGONAL and the inset had to
    // be larger than the width suggested; upright, the width is the whole story.
    expect(TRACK_INSET_PX).toBeGreaterThanOrEqual(MARKER_WIDTH_PX / 2);
  });

  it('is no larger than a marker needs, so the track keeps the room', () => {
    // Every pixel of inset is a pixel the time axis does not span, on all three surfaces that
    // share it. An inset well past the overhang is waste, not safety.
    expect(TRACK_INSET_PX).toBeLessThanOrEqual(MARKER_WIDTH_PX);
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
