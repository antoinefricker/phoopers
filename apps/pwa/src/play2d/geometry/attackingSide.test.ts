import { describe, expect, it } from 'vitest';
import { COURT_DIMENSIONS, resolveBranch } from '../../engine';
import type { ResolvedTimeline } from '../../engine';
import { HORNS_SWITCH, hornsPlay } from '../../samples/horns';
import { attackingSide } from './attackingSide';

const mirror = (timeline: ResolvedTimeline): ResolvedTimeline => ({
  ...timeline,
  anchors: Object.fromEntries(
    Object.entries(timeline.anchors).map(([id, keyframes]) => [
      id,
      keyframes.map((k) =>
        k.position === undefined
          ? k
          : { ...k, position: { ...k.position, x: COURT_DIMENSIONS.fiba.length - k.position.x } },
      ),
    ]),
  ) as ResolvedTimeline['anchors'],
});

describe('attackingSide', () => {
  it.each([hornsPlay.rootBranchId, HORNS_SWITCH])('finds the right basket in the horns sample (%s)', (branchId) => {
    expect(attackingSide(resolveBranch(hornsPlay, branchId))).toBe('right');
  });

  it('finds the left basket for the mirrored play', () => {
    expect(attackingSide(mirror(resolveBranch(hornsPlay, hornsPlay.rootBranchId)))).toBe('left');
  });

  it('falls back to the left half when there is no offense to read', () => {
    const timeline = resolveBranch(hornsPlay, hornsPlay.rootBranchId);

    expect(attackingSide({ ...timeline, players: [] })).toBe('left');
  });
});
