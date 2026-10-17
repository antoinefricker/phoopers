import { describe, expect, it } from 'vitest';
import type { BranchId, PlayId, PlayerId } from '../../engine';
import { validatePlay } from '../../engine';
import type { LineupKind } from '../lineups';
import { LINEUPS } from '../lineups';
import type { CreatePlayIds, CreatePlayOptions } from './create';
import { createPlay } from './create';

const idsFor = (lineup: LineupKind): CreatePlayIds => ({
  playId: 'new-play' as PlayId,
  rootBranchId: 'new-root' as BranchId,
  offense: LINEUPS[lineup].offense.map((_, i) => `o${i}` as PlayerId),
  defense: LINEUPS[lineup].defense.map((_, i) => `d${i}` as PlayerId),
});

const options = (over: Partial<CreatePlayOptions> = {}): CreatePlayOptions => ({
  name: 'Flex',
  court: 'fiba',
  extent: 'half',
  lineup: 'empty',
  duration: 8,
  ...over,
});

describe('createPlay', () => {
  it('seats five against five with a keyframe each at zero', () => {
    const ids = idsFor('fiveOnFive');
    const play = createPlay(options({ lineup: 'fiveOnFive' }), ids);

    expect(play.players).toHaveLength(10);
    expect(play.branches[0]?.tracks[ids.offense[0] as PlayerId]).toEqual([{ t: 0, position: { x: 16, y: 7.5 } }]);
  });

  it('numbers each side from one', () => {
    const play = createPlay(options({ lineup: 'fiveOnFive' }), idsFor('fiveOnFive'));

    expect(play.players.filter((p) => p.team === 'defense').map((p) => p.number)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('leaves the ball loose at the centre of what is shown', () => {
    const play = createPlay(options(), idsFor('empty'));

    expect(play.branches[0]?.tracks.ball).toEqual([{ t: 0, position: { x: 21, y: 7.5 } }]);
  });

  it('puts the ball at the floor centre on a full court', () => {
    const play = createPlay(options({ extent: 'full' }), idsFor('empty'));

    expect(play.branches[0]?.tracks.ball).toEqual([{ t: 0, position: { x: 14, y: 7.5 } }]);
  });

  it('shifts the ball towards midcourt when the centre is on a player', () => {
    // Three on three puts the ball-handler on the centre of the shown half. A ball drawn under
    // a token cannot be picked up: the click is ambiguous and the coach cannot assign it.
    const play = createPlay(options({ lineup: 'threeOnThree' }), idsFor('threeOnThree'));

    expect(play.branches[0]?.tracks.ball).toEqual([{ t: 0, position: { x: 19, y: 7.5 } }]);
  });

  it('carries the name, court, extent and duration it was given', () => {
    const play = createPlay(options(), idsFor('empty'));

    expect(play).toMatchObject({ id: 'new-play', name: 'Flex', court: 'fiba', extent: 'half', duration: 8 });
    expect(play.rootBranchId).toBe('new-root');
    expect(play.branches).toHaveLength(1);
    expect(play.branches[0]?.name).toBe('Flex');
  });

  it('builds a valid play from every lineup', () => {
    for (const lineup of ['empty', 'fiveOnFive', 'threeOnThree'] as const) {
      expect(validatePlay(createPlay(options({ lineup }), idsFor(lineup)))).toEqual([]);
    }
  });
});
