import { describe, expect, it } from 'vitest';
import { ballStateAt, resolveBranch, spanKindAt, stateAt, validatePlay } from './index';
import { fixturePlay, P1, P2, ROOT, STEP_ENTRY, SWITCH } from './__fixtures__/play';
import { distance } from './vec2';
import type { Branch, BranchId, IssueCode, Keyframe, Play, PlayerId, StepId } from './index';

function withBranch(branchId: BranchId, mutate: (branch: Branch) => Branch): Play {
  return { ...fixturePlay, branches: fixturePlay.branches.map((b) => (b.id === branchId ? mutate(b) : b)) };
}

const withRootTrack = (entity: PlayerId | 'ball', keyframes: Keyframe[]): Play =>
  withBranch(ROOT, (b) => ({ ...b, tracks: { ...b.tracks, [entity]: keyframes } }));

describe('acceptance', () => {
  it('1. resolves and samples any branch at any t', () => {
    for (const branchId of [ROOT, SWITCH]) {
      const timeline = resolveBranch(fixturePlay, branchId);
      for (const t of [-1, 0, 1.5, 2, 3.999, 4, 10, Infinity, -Infinity, NaN]) {
        const state = stateAt(timeline, t);
        expect(Number.isFinite(state.players[P1]?.position.x)).toBe(true);
        expect(Number.isFinite(state.players[P1]?.position.y)).toBe(true);
        expect(Number.isFinite(state.ball.position.x)).toBe(true);
        expect(Number.isFinite(state.ball.position.y)).toBe(true);
      }
    }
  });

  it('2. covers equal distance in equal time under linear easing', () => {
    const play = withRootTrack(P1, [
      { t: 0, position: { x: 0, y: 0 }, handleOut: { x: 0, y: 9 } },
      { t: 4, position: { x: 10, y: 0 }, handleIn: { x: 9.5, y: 0.2 } },
    ]);
    const timeline = resolveBranch(play, ROOT);
    const at = (t: number) => stateAt(timeline, t).players[P1]?.position ?? { x: 0, y: 0 };
    const quarters = [distance(at(0), at(1)), distance(at(1), at(2)), distance(at(2), at(3)), distance(at(3), at(4))];
    const first = quarters[0];
    if (first === undefined) throw new Error('missing quarter');

    for (const quarter of quarters) {
      expect(quarter / first).toBeCloseTo(1, 1);
    }
  });

  it('3. decelerates under easeOut', () => {
    const play = withRootTrack(P1, [
      { t: 0, position: { x: 0, y: 0 }, ease: 'easeOut' },
      { t: 4, position: { x: 10, y: 0 } },
    ]);
    const timeline = resolveBranch(play, ROOT);
    const at = (t: number) => stateAt(timeline, t).players[P1]?.position ?? { x: 0, y: 0 };

    expect(distance(at(0), at(2))).toBeGreaterThan(distance(at(2), at(4)));
  });

  it('4. distinguishes a dribble, a pass and a held ball from the model alone', () => {
    const timeline = resolveBranch(fixturePlay, ROOT);

    expect(spanKindAt(timeline, P1, 0.5)).toBe('dribble');
    expect(spanKindAt(timeline, P2, 0.5)).toBe('move');
    expect(ballStateAt(timeline, 1.5)).toBe('inFlight');
    expect(ballStateAt(timeline, 3)).toBe('held');
  });

  it('4. distinguishes a shot: a held ball released to a free position', () => {
    const play = withRootTrack('ball', [
      { t: 0, attachedTo: P1 },
      { t: 2, attachedTo: P1 },
      { t: 3, position: { x: 14, y: 7.5 } },
    ]);
    const timeline = resolveBranch(play, ROOT);

    expect(ballStateAt(timeline, 1)).toBe('held');
    expect(ballStateAt(timeline, 2.5)).toBe('inFlight');
    expect(stateAt(timeline, 3).ball.attachedTo).toBeNull();
    expect(stateAt(timeline, 3).ball.position).toEqual({ x: 14, y: 7.5 });
  });

  it('5. replays the ancestor opening then diverges without a discontinuity', () => {
    const root = resolveBranch(fixturePlay, ROOT);
    const branch = resolveBranch(fixturePlay, SWITCH);

    expect(stateAt(branch, 1).players[P2]?.position).toEqual(stateAt(root, 1).players[P2]?.position);
    expect(stateAt(branch, 4).players[P2]?.position).toEqual({ x: 4, y: 4 });

    const before = stateAt(branch, 1.999).players[P1]?.position ?? { x: 0, y: 0 };
    const after = stateAt(branch, 2.001).players[P1]?.position ?? { x: 99, y: 99 };
    expect(distance(before, after)).toBeLessThan(0.05);
  });

  it('6. reports no issues for the valid fixture', () => {
    expect(validatePlay(fixturePlay)).toEqual([]);
  });

  it('6. reports at least one issue for every issue code', () => {
    // Record<IssueCode, ...> makes this table exhaustive at compile time.
    const broken: Record<IssueCode, Play> = {
      'fork-step-not-in-ancestors': withBranch(SWITCH, (b) => ({ ...b, forkStepId: 'ghost' as StepId })),
      'keyframe-before-fork': withBranch(SWITCH, (b) => ({
        ...b,
        tracks: { ...b.tracks, [P1]: [{ t: 0, position: { x: 1, y: 1 } }] },
      })),
      'ball-keyframe-missing-position': withRootTrack('ball', [{ t: 0 }]),
      'ball-keyframe-position-and-attachment': withRootTrack('ball', [
        { t: 0, position: { x: 1, y: 1 }, attachedTo: P1 },
      ]),
      'player-keyframe-has-attachment': withRootTrack(P1, [{ t: 0, position: { x: 1, y: 1 }, attachedTo: P2 }]),
      'keyframe-times-not-monotonic': withRootTrack(P1, [
        { t: 2, position: { x: 1, y: 1 } },
        { t: 1, position: { x: 2, y: 2 } },
      ]),
      'duplicate-id': { ...fixturePlay, players: [...fixturePlay.players, { id: P1, team: 'defense', label: 'X1' }] },
      'unknown-player-reference': withBranch(ROOT, (b) => ({
        ...b,
        screens: b.screens.map((s) => ({ ...s, screenerId: 'ghost' as PlayerId })),
      })),
      'branch-cycle': withBranch(ROOT, (b) => ({ ...b, parentId: SWITCH, forkStepId: STEP_ENTRY })),
      'non-root-branch-without-fork': withBranch(SWITCH, (b) => ({ ...b, forkStepId: null })),
      'root-branch-with-parent': withBranch(ROOT, (b) => ({ ...b, parentId: SWITCH })),
      'easing-out-of-range': withRootTrack(P1, [
        { t: 0, position: { x: 1, y: 1 }, ease: { x1: -0.5, y1: 0, x2: 0.5, y2: 1 } },
        { t: 1, position: { x: 2, y: 2 } },
      ]),
      'malformed-play': { ...fixturePlay, branches: null } as unknown as Play,
    };

    for (const [code, play] of Object.entries(broken)) {
      expect(
        validatePlay(play).map((issue) => issue.code),
        code,
      ).toContain(code);
    }
  });
});
