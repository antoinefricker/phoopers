import { describe, expect, it } from 'vitest';
import type { Play, PlayerId } from '../../engine';
import { validatePlay } from '../../engine';
import { fixturePlay, P1, ROOT, SWITCH } from '../../engine/__fixtures__/play';
import { forkTimeOf } from './fork';
import { attachBall, moveKeyframe, releaseBall, removeKeyframe, setKeyframe } from './keyframes';

const track = (play: Play, branchId = ROOT, entity: Parameters<typeof setKeyframe>[2] = P1) =>
  play.branches.find((b) => b.id === branchId)?.tracks[entity] ?? [];

describe('forkTimeOf', () => {
  it('is 0 for the root branch', () => {
    expect(forkTimeOf(fixturePlay, ROOT)).toBe(0);
  });

  it('is the fork step time for a child branch', () => {
    expect(forkTimeOf(fixturePlay, SWITCH)).toBeGreaterThan(0);
  });
});

describe('setKeyframe', () => {
  it('inserts a keyframe in time order', () => {
    const play = setKeyframe(fixturePlay, ROOT, P1, 1, { x: 6, y: 6 });

    expect(track(play).map((k) => k.t)).toEqual([0, 1, 2, 4]);
    expect(validatePlay(play)).toEqual([]);
  });

  it('replaces the keyframe already at that time rather than adding a second', () => {
    const play = setKeyframe(fixturePlay, ROOT, P1, 2, { x: 9, y: 9 });

    expect(track(play).filter((k) => k.t === 2)).toHaveLength(1);
    expect(track(play).find((k) => k.t === 2)?.position).toEqual({ x: 9, y: 9 });
  });

  it('refuses a non-finite time', () => {
    expect(setKeyframe(fixturePlay, ROOT, P1, Number.NaN, { x: 1, y: 1 })).toEqual(fixturePlay);
    expect(setKeyframe(fixturePlay, ROOT, P1, Infinity, { x: 1, y: 1 })).toEqual(fixturePlay);
  });

  it('refuses a negative time', () => {
    expect(setKeyframe(fixturePlay, ROOT, P1, -1, { x: 1, y: 1 })).toEqual(fixturePlay);
  });

  it('refuses a write before the fork on a non-root branch', () => {
    const play = setKeyframe(fixturePlay, SWITCH, P1, 0.5, { x: 1, y: 1 });

    expect(play).toEqual(fixturePlay);
    expect(validatePlay(play)).toEqual([]);
  });

  it('does not mutate its input', () => {
    const before = structuredClone(fixturePlay);
    setKeyframe(fixturePlay, ROOT, P1, 1, { x: 6, y: 6 });

    expect(fixturePlay).toEqual(before);
  });
});

describe('the ball', () => {
  it('attaches to a player, with no position', () => {
    const play = attachBall(fixturePlay, ROOT, 1, P1);
    const written = track(play, ROOT, 'ball').find((k) => k.t === 1);

    expect(written).toEqual({ t: 1, attachedTo: P1 });
    expect(validatePlay(play)).toEqual([]);
  });

  it('releases to a free position, with no attachment', () => {
    const play = releaseBall(fixturePlay, ROOT, 3, { x: 25, y: 7 });
    const written = track(play, ROOT, 'ball').find((k) => k.t === 3);

    expect(written).toEqual({ t: 3, position: { x: 25, y: 7 } });
    expect(validatePlay(play)).toEqual([]);
  });

  it('replaces an attachment with a release at the same time', () => {
    const attached = attachBall(fixturePlay, ROOT, 3, P1);
    const released = releaseBall(attached, ROOT, 3, { x: 25, y: 7 });

    expect(track(released, ROOT, 'ball').filter((k) => k.t === 3)).toHaveLength(1);
    expect(track(released, ROOT, 'ball').find((k) => k.t === 3)?.attachedTo).toBeUndefined();
  });

  it('refuses to attach the ball to an unknown player', () => {
    expect(attachBall(fixturePlay, ROOT, 1, 'ghost' as PlayerId)).toEqual(fixturePlay);
  });

  it('does not mutate its input', () => {
    const before = structuredClone(fixturePlay);
    attachBall(fixturePlay, ROOT, 1, P1);
    releaseBall(fixturePlay, ROOT, 3, { x: 25, y: 7 });

    expect(fixturePlay).toEqual(before);
  });
});

describe('removeKeyframe', () => {
  it('removes the keyframe at that time', () => {
    const play = removeKeyframe(fixturePlay, ROOT, P1, 2);

    expect(track(play).map((k) => k.t)).not.toContain(2);
  });

  it('refuses to remove a player last keyframe', () => {
    const onlyOne = removeKeyframe(removeKeyframe(fixturePlay, ROOT, P1, 2), ROOT, P1, 4);

    expect(track(onlyOne).map((k) => k.t)).toEqual([0]);

    expect(removeKeyframe(onlyOne, ROOT, P1, 0)).toEqual(onlyOne);
  });

  it('allows removing the ball last keyframe', () => {
    let play = fixturePlay;
    for (const k of track(fixturePlay, ROOT, 'ball')) play = removeKeyframe(play, ROOT, 'ball', k.t);

    expect(track(play, ROOT, 'ball')).toEqual([]);
  });

  it('does not mutate its input', () => {
    const before = structuredClone(fixturePlay);
    removeKeyframe(fixturePlay, ROOT, P1, 2);

    expect(fixturePlay).toEqual(before);
  });
});

describe('moveKeyframe', () => {
  it('retimes a keyframe, keeping the track ordered', () => {
    const play = moveKeyframe(fixturePlay, ROOT, P1, 2, 1);

    expect(track(play).map((k) => k.t)).toEqual([0, 1, 4]);
    expect(validatePlay(play)).toEqual([]);
  });

  it('refuses to move a keyframe onto a neighbour time', () => {
    expect(moveKeyframe(fixturePlay, ROOT, P1, 2, 0)).toEqual(fixturePlay);
  });

  it('refuses a non-finite destination', () => {
    expect(moveKeyframe(fixturePlay, ROOT, P1, 2, Number.NaN)).toEqual(fixturePlay);
  });

  it('does not mutate its input', () => {
    const before = structuredClone(fixturePlay);
    moveKeyframe(fixturePlay, ROOT, P1, 2, 1);

    expect(fixturePlay).toEqual(before);
  });
});
