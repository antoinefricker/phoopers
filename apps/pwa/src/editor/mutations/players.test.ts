import { describe, expect, it } from 'vitest';
import type { Play, PlayerId } from '../../engine';
import { validatePlay } from '../../engine';
import { fixturePlay, P1, ROOT } from '../../engine/__fixtures__/play';
import { FORMATION } from '../formation';
import { addPlayer, applyFormation, nextLabel, removePlayer } from './players';

const NEW = 'p-new' as PlayerId;
const trackOf = (play: Play, id: PlayerId) => play.branches.find((b) => b.id === ROOT)?.tracks[id];

const root = fixturePlay.branches.find((b) => b.id === ROOT);
if (root === undefined) throw new Error('fixture has no root branch');

describe('addPlayer', () => {
  it('appends the player and writes a keyframe at t=0 on the root branch', () => {
    const play = addPlayer(fixturePlay, 'defense', NEW);

    expect(play.players.map((p) => p.id)).toContain(NEW);
    expect(trackOf(play, NEW)).toEqual([{ t: 0, position: expect.any(Object) }]);
    expect(validatePlay(play)).toEqual([]);
  });

  it('leaves the input play untouched', () => {
    const before = JSON.stringify(fixturePlay);
    addPlayer(fixturePlay, 'offense', NEW);

    expect(JSON.stringify(fixturePlay)).toBe(before);
  });

  it('numbers offense and defense independently', () => {
    expect(nextLabel(fixturePlay.players, 'offense')).toBe('3');
    expect(nextLabel(fixturePlay.players, 'defense')).toBe('X1');
  });
});

describe('removePlayer', () => {
  it('removes the player, their tracks and any screen referencing them, on every branch', () => {
    const play = removePlayer(fixturePlay, P1);

    expect(play.players.map((p) => p.id)).not.toContain(P1);
    for (const branch of play.branches) {
      expect(branch.tracks[P1]).toBeUndefined();
      expect(branch.screens.some((s) => s.screenerId === P1 || s.beneficiaryId === P1)).toBe(false);
    }
  });

  it('does not sweep ball keyframes attached to the removed player', () => {
    const play = removePlayer(fixturePlay, P1);

    expect(trackOf(play, 'ball' as PlayerId)?.some((k) => k.attachedTo === P1)).toBe(true);
    expect(validatePlay(play).map((i) => i.code)).toContain('unknown-player-reference');
  });

  it('leaves the input play untouched', () => {
    const before = JSON.stringify(fixturePlay);
    removePlayer(fixturePlay, P1);

    expect(JSON.stringify(fixturePlay)).toBe(before);
  });

  it('is a no-op for an unknown player', () => {
    const unknown = 'nobody' as PlayerId;

    expect(removePlayer(fixturePlay, unknown)).toEqual(fixturePlay);
  });
});

describe('applyFormation', () => {
  it('places five against five with the ball attached to the point guard', () => {
    const empty: Play = { ...fixturePlay, players: [], branches: [{ ...root, tracks: {}, screens: [] }] };
    const ids = {
      offense: ['o1', 'o2', 'o3', 'o4', 'o5'] as PlayerId[],
      defense: ['d1', 'd2', 'd3', 'd4', 'd5'] as PlayerId[],
    };

    const play = applyFormation(empty, ids);

    expect(play.players).toHaveLength(10);
    expect(FORMATION.offense).toHaveLength(5);
    const ball = play.branches[0]?.tracks.ball;
    expect(ball).toEqual([{ t: 0, attachedTo: ids.offense[0] }]);
    expect(validatePlay(play)).toEqual([]);
  });
});
