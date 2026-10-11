import { describe, expect, it } from 'vitest';
import { resolveBranch } from '../engine';
import { fixturePlay, P1, ROOT } from '../engine/__fixtures__/play';
import { MARKER_WIDTH_PX, TRACK_INSET_PX, fractionOf, rowsOf, timeFromClientX } from './timelineGeometry';

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

  it('produces one row per player plus the ball, ball last', () => {
    const rows = rowsOf(timeline);

    expect(rows).toHaveLength(fixturePlay.players.length + 1);
    expect(rows.at(-1)?.entityId).toBe('ball');
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

    expect(rowsOf(sparse)).toHaveLength(fixturePlay.players.length + 1);
    expect(rowsOf(sparse)[0]?.keyframes).toEqual([]);
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
