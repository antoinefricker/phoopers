import { describe, expect, it } from 'vitest';
import type { Play, PlayerId } from '../../engine';
import { resolveBranch, stateAt, validatePlay } from '../../engine';
import { distance } from '../../engine/vec2';
import { fixturePlay, P1, P2, ROOT } from '../../engine/__fixtures__/play';
import { FORMATION } from '../formation';
import { addPlayer, applyFormation, movePlayer, nextNumber, removePlayer } from './players';

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
    expect(nextNumber(fixturePlay.players, 'offense')).toBe('3');
    // Defenders were "X1".."X5" when the symbol was an X. The symbol is now an outlined
    // circle, so the number stands alone and the teams are told apart by the circle's fill.
    expect(nextNumber(fixturePlay.players, 'defense')).toBe('1');
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

  it('releases the ball where the player was, rather than leaving it on a ghost', () => {
    // The ball used to keep naming the removed player. The sampler resolves an attached
    // keyframe to its carrier's position, and a carrier that no longer exists has none, so the
    // ball was drawn at the court's corner for the whole stretch it was held.
    const held = trackOf(fixturePlay, 'ball' as PlayerId)?.filter((k) => k.attachedTo === P1) ?? [];
    expect(held.length).toBeGreaterThan(0);
    const wherePlayerWas = stateAt(resolveBranch(fixturePlay, ROOT), held[0]!.t).players[P1]?.position;

    const play = removePlayer(fixturePlay, P1);

    const ball = trackOf(play, 'ball' as PlayerId) ?? [];
    expect(ball.some((k) => k.attachedTo === P1)).toBe(false);
    expect(ball.find((k) => k.t === held[0]!.t)?.position).toEqual(wherePlayerWas);
  });

  it('leaves a valid play behind', () => {
    expect(validatePlay(removePlayer(fixturePlay, P1))).toEqual([]);
  });

  it('keeps the ball where it was drawn, exactly at each released instant', () => {
    // The release is not supposed to move the ball, only to stop it depending on someone who
    // is gone. At the instants it holds a keyframe the position is the carrier's, to the digit.
    const before = resolveBranch(fixturePlay, ROOT);
    const after = resolveBranch(removePlayer(fixturePlay, P1), ROOT);
    const releasedAt = (fixturePlay.branches[0]?.tracks.ball ?? []).filter((k) => k.attachedTo === P1).map((k) => k.t);
    expect(releasedAt.length).toBeGreaterThan(0);

    for (const t of releasedAt) {
      expect(stateAt(after, t).ball.position).toEqual(stateAt(before, t).ball.position);
    }
  });

  it('follows its own path between them, close to the one it was carried along', () => {
    // Between two released keyframes the ball interpolates its own way instead of riding a
    // player's curve, so the two paths part slightly. What matters is the order of magnitude:
    // a ball left on a ghost was drawn at the court's corner, metres away.
    const before = resolveBranch(fixturePlay, ROOT);
    const after = resolveBranch(removePlayer(fixturePlay, P1), ROOT);

    for (const t of [0.25, 0.5, 0.75]) {
      expect(distance(stateAt(after, t).ball.position, stateAt(before, t).ball.position)).toBeLessThan(0.01);
    }
  });

  it('leaves a ball attached to someone else alone', () => {
    const play = removePlayer(fixturePlay, P1);
    const stillAttached = trackOf(play, 'ball' as PlayerId)?.filter((k) => k.attachedTo === P2) ?? [];

    expect(stillAttached.length).toBeGreaterThan(0);
  });

  it('releases on every branch, not only the one the player was removed from', () => {
    const play = removePlayer(fixturePlay, P1);

    for (const branch of play.branches) {
      expect((branch.tracks.ball ?? []).some((k) => k.attachedTo === P1)).toBe(false);
    }
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
    const empty: Play = { ...fixturePlay, players: [], branches: [{ ...root, tracks: { ball: [] }, screens: [] }] };
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

describe('movePlayer', () => {
  const ids = (play: Play) => play.players.map((p) => p.id);
  const three = {
    ...fixturePlay,
    players: [...fixturePlay.players, { id: 'p3' as PlayerId, team: 'defense' as const, number: 'X1' }],
  };

  it('moves a player to the index asked for', () => {
    expect(ids(movePlayer(three, 'p3' as PlayerId, 0))).toEqual(['p3', P1, P2]);
    expect(ids(movePlayer(three, P1, 2))).toEqual([P2, 'p3', P1]);
  });

  it('moves one back without disturbing the rest', () => {
    expect(ids(movePlayer(three, P2, 0))).toEqual([P2, P1, 'p3']);
  });

  it('is a no-op when the player is already there', () => {
    expect(movePlayer(three, P1, 0)).toBe(three);
  });

  it('clamps an index outside the roster rather than dropping anyone', () => {
    // The caller is a drag, and a drop past the last row is a thing a hand does.
    expect(ids(movePlayer(three, P1, 99))).toEqual([P2, 'p3', P1]);
    expect(ids(movePlayer(three, 'p3' as PlayerId, -5))).toEqual(['p3', P1, P2]);
  });

  it('is a no-op for a player the play does not have', () => {
    expect(movePlayer(three, 'nobody' as PlayerId, 0)).toBe(three);
  });

  it('touches nothing but the order', () => {
    const moved = movePlayer(three, P1, 2);

    expect(moved.branches).toEqual(three.branches);
    expect(new Set(ids(moved))).toEqual(new Set(ids(three)));
    expect(validatePlay(moved)).toEqual([]);
  });

  it('leaves the input play untouched', () => {
    const before = JSON.stringify(three);
    movePlayer(three, P1, 2);

    expect(JSON.stringify(three)).toBe(before);
  });
});
