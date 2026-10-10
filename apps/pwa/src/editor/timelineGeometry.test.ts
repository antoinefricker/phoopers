import { describe, expect, it } from 'vitest';
import { resolveBranch } from '../engine';
import { fixturePlay, P1, ROOT } from '../engine/__fixtures__/play';
import { fractionOf, rowsOf } from './timelineGeometry';

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
