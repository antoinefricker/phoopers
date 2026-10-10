import { describe, expect, it } from 'vitest';
import type { BranchId, Play, PlayerId, PlayId, ScreenId, StepId } from '../engine';
import { resolveBranch, stateAt, validatePlay } from '../engine';
import {
  addPlayer,
  addScreen,
  addStep,
  applyFormation,
  attachBall,
  forkBranch,
  releaseBall,
  setKeyframe,
} from './mutations';

const ROOT = 'root' as BranchId;
const VARIANT = 'variant' as BranchId;
const ENTRY = 'step-entry' as StepId;

// `tracks` is `{ ball: [] }`, never `{}`: `ball` is a required key of the tracks record.
const emptyPlay: Play = {
  id: 'built' as PlayId,
  name: 'Built in the editor',
  court: 'fiba',
  players: [],
  rootBranchId: ROOT,
  branches: [
    { id: ROOT, parentId: null, forkStepId: null, name: 'Base', tracks: { ball: [] }, steps: [], screens: [] },
  ],
};

const o1 = 'o1' as PlayerId;
const o2 = 'o2' as PlayerId;
const offense = [o1, o2, 'o3', 'o4', 'o5'] as PlayerId[];
const defense = ['d1', 'd2', 'd3', 'd4', 'd5'] as PlayerId[];

const branchOf = (play: Play, id: BranchId) => {
  const branch = play.branches.find((b) => b.id === id);
  if (branch === undefined) throw new Error(`no branch ${id}`);

  return branch;
};

// This drives the mutations directly, so it proves the model, not the UI: that a control reaches
// each mutation is proved in selectionActions.test.tsx.
describe('building a play from an empty court', () => {
  it('produces a valid, watchable play with players, motion, a ball, a step, a screen and a fork', () => {
    let play = applyFormation(emptyPlay, { offense, defense });
    expect(play.players).toHaveLength(10);

    // Motion: 1 moves to the wing by t = 2, 2 lifts from the corner by t = 3.
    play = setKeyframe(play, ROOT, o1, 2, { x: 20, y: 9.5 });
    play = setKeyframe(play, ROOT, o2, 3, { x: 23, y: 2.5 });

    // The ball: held by 1 from the formation, passed to 2 at t = 3, shot at t = 5.
    play = attachBall(play, ROOT, 0, o1);
    play = attachBall(play, ROOT, 3, o2);
    play = releaseBall(play, ROOT, 5, { x: 26.4, y: 7.5 });

    play = addStep(play, ROOT, 2, 'Entry pass', ENTRY);

    play = addScreen(play, ROOT, 2, o2, o1, 'screen-1' as ScreenId);

    play = forkBranch(play, ROOT, ENTRY, 'Switch', VARIANT);
    // A keyframe on the variant, after the fork at t = 2.
    play = setKeyframe(play, VARIANT, o1, 4, { x: 24, y: 12 });

    expect(validatePlay(play)).toEqual([]);
    expect(play.branches).toHaveLength(2);
    expect(branchOf(play, ROOT).steps).toHaveLength(1);
    expect(branchOf(play, ROOT).screens).toHaveLength(1);
    expect(branchOf(play, ROOT).tracks.ball).toHaveLength(3);
    expect(branchOf(play, VARIANT).parentId).toBe(ROOT);
    expect(branchOf(play, VARIANT).forkStepId).toBe(ENTRY);

    // The screen names who sets it and for whom, the right way round.
    const screen = branchOf(play, ROOT).screens[0];
    expect(screen?.screenerId).toBe(o2);
    expect(screen?.beneficiaryId).toBe(o1);

    // It resolves and samples: well-formed is not the same as watchable.
    const root = resolveBranch(play, ROOT);
    expect(root.duration).toBeGreaterThanOrEqual(5);

    // The ball. `attachedTo` is only non-null across a span whose two ends name the SAME player, so
    // the pass (0 to 3) and the shot (3 to 5) both read as in flight; who holds the ball is read
    // off its position at the keyframes instead: with 1 at t = 0, with 2 at t = 3.
    expect(stateAt(root, 0).ball.position).toEqual(stateAt(root, 0).players[o1]?.position);
    expect(stateAt(root, 3).ball.position).toEqual({ x: 23, y: 2.5 });
    expect(stateAt(root, 3).ball.position).toEqual(stateAt(root, 3).players[o2]?.position);
    expect(stateAt(root, 3).ball.position).not.toEqual(stateAt(root, 3).players[o1]?.position);
    // Mid-pass the ball is neither with 1 nor with 2.
    const pass = stateAt(root, 1.5).ball;
    expect(pass.attachedTo).toBeNull();
    expect(pass.position).not.toEqual(stateAt(root, 1.5).players[o1]?.position);
    expect(pass.position).not.toEqual(stateAt(root, 1.5).players[o2]?.position);
    // Loose at the shot position.
    expect(stateAt(root, 5).ball).toEqual({ position: { x: 26.4, y: 7.5 }, attachedTo: null });

    // Anchors on the players' own tracks.
    expect(stateAt(root, 2).players[o1]?.position).toEqual({ x: 20, y: 9.5 });
    expect(stateAt(root, 3).players[o2]?.position).toEqual({ x: 23, y: 2.5 });

    // Between keyframes: 1 is mid-way from the formation spot (16, 7.5) to the wing (20, 9.5).
    const between = stateAt(root, 1).players[o1]?.position;
    expect(between?.x).toBeGreaterThan(16);
    expect(between?.x).toBeLessThan(20);
    expect(between?.y).toBeGreaterThan(7.5);
    expect(between?.y).toBeLessThan(9.5);

    // The variant replays the shared opening, then follows its own keyframe.
    const variant = resolveBranch(play, VARIANT);
    expect(variant.duration).toBeGreaterThan(0);
    expect(stateAt(variant, 4).players[o1]?.position).toEqual({ x: 24, y: 12 });
    expect(stateAt(variant, 2).players[o1]?.position).toEqual({ x: 20, y: 9.5 });
  });

  it('refuses a keyframe on the variant before its fork', () => {
    let play = applyFormation(emptyPlay, { offense, defense });
    play = addStep(play, ROOT, 2, 'Entry pass', ENTRY);
    play = forkBranch(play, ROOT, ENTRY, 'Switch', VARIANT);

    const attempted = setKeyframe(play, VARIANT, o1, 1, { x: 5, y: 5 });

    expect(attempted).toEqual(play);
    expect(validatePlay(attempted)).toEqual([]);
  });

  it('adds a player beyond the formation without breaking validity', () => {
    const play = addPlayer(applyFormation(emptyPlay, { offense, defense }), 'offense', 'o6' as PlayerId);

    expect(play.players).toHaveLength(11);
    expect(play.players.at(-1)?.label).toBe('6');
    expect(validatePlay(play)).toEqual([]);
  });
});
