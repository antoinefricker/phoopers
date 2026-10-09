import { describe, expect, it } from 'vitest';
import { fixturePlay, P1, P2, ROOT, STEP_ENTRY, SWITCH } from './__fixtures__/play';
import { resolveBranch } from './resolve';
import { validatePlay } from './validate';
import type { Branch, BranchId, Keyframe, Play, PlayerId, StepId } from './types';

const codesFor = (play: Play) => validatePlay(play).map((issue) => issue.code);

function withRoot(mutate: (branch: Branch) => Branch): Play {
  return {
    ...fixturePlay,
    branches: fixturePlay.branches.map((b) => (b.id === ROOT ? mutate(b) : b)),
  };
}

describe('validatePlay', () => {
  it('reports nothing for the valid fixture', () => {
    expect(validatePlay(fixturePlay)).toEqual([]);
  });

  it('reports a fork step that is not in the ancestor chain', () => {
    const play: Play = {
      ...fixturePlay,
      branches: fixturePlay.branches.map((b) => (b.id === SWITCH ? { ...b, forkStepId: 'ghost' as StepId } : b)),
    };

    expect(codesFor(play)).toContain('fork-step-not-in-ancestors');
  });

  it('reports keyframes earlier than their branch fork', () => {
    const play: Play = {
      ...fixturePlay,
      branches: fixturePlay.branches.map((b) =>
        b.id === SWITCH ? { ...b, tracks: { ...b.tracks, [P1]: [{ t: 0, position: { x: 1, y: 1 } }] } } : b,
      ),
    };

    expect(codesFor(play)).toContain('keyframe-before-fork');
  });

  it('reports a ball keyframe with neither position nor attachment', () => {
    const play = withRoot((b) => ({ ...b, tracks: { ...b.tracks, ball: [{ t: 0 }] } }));

    expect(codesFor(play)).toContain('ball-keyframe-missing-position');
  });

  it('reports a ball keyframe with both position and attachment', () => {
    const play = withRoot((b) => ({
      ...b,
      tracks: { ...b.tracks, ball: [{ t: 0, position: { x: 1, y: 1 }, attachedTo: P1 }] },
    }));

    expect(codesFor(play)).toContain('ball-keyframe-position-and-attachment');
  });

  it('reports a player keyframe carrying an attachment', () => {
    const play = withRoot((b) => ({
      ...b,
      tracks: { ...b.tracks, [P1]: [{ t: 0, position: { x: 1, y: 1 }, attachedTo: P2 }] },
    }));

    expect(codesFor(play)).toContain('player-keyframe-has-attachment');
  });

  it('reports non-monotonic keyframe times', () => {
    const play = withRoot((b) => ({
      ...b,
      tracks: {
        ...b.tracks,
        [P1]: [
          { t: 2, position: { x: 1, y: 1 } },
          { t: 1, position: { x: 2, y: 2 } },
        ],
      },
    }));

    expect(codesFor(play)).toContain('keyframe-times-not-monotonic');
  });

  it('reports duplicate ids', () => {
    const play: Play = {
      ...fixturePlay,
      players: [...fixturePlay.players, { id: P1, team: 'defense', label: 'X1' }],
    };

    expect(codesFor(play)).toContain('duplicate-id');
  });

  it('reports a screen naming an unknown player', () => {
    const play = withRoot((b) => ({
      ...b,
      screens: b.screens.map((s) => ({ ...s, screenerId: 'ghost' as PlayerId })),
    }));

    expect(codesFor(play)).toContain('unknown-player-reference');
  });

  it('reports a cycle in branch parents', () => {
    const play: Play = {
      ...fixturePlay,
      branches: fixturePlay.branches.map((b) =>
        b.id === ROOT ? { ...b, parentId: SWITCH, forkStepId: STEP_ENTRY } : b,
      ),
    };

    expect(codesFor(play)).toContain('branch-cycle');
  });

  it('reports a non-root branch without a fork step', () => {
    const play: Play = {
      ...fixturePlay,
      branches: fixturePlay.branches.map((b) => (b.id === SWITCH ? { ...b, forkStepId: null } : b)),
    };

    expect(codesFor(play)).toContain('non-root-branch-without-fork');
  });

  it('reports a root branch that has a parent', () => {
    const play = withRoot((b) => ({ ...b, parentId: SWITCH as BranchId }));

    expect(codesFor(play)).toContain('root-branch-with-parent');
  });

  it('reports an easing whose x falls outside [0, 1]', () => {
    const play = withRoot((b) => ({
      ...b,
      tracks: {
        ...b.tracks,
        [P1]: [
          { t: 0, position: { x: 1, y: 1 }, ease: { x1: -0.5, y1: 0, x2: 0.5, y2: 1 } },
          { t: 1, position: { x: 2, y: 2 } },
        ],
      },
    }));

    expect(codesFor(play)).toContain('easing-out-of-range');
  });

  it('never throws on malformed input', () => {
    const malformed = [
      {},
      { players: null, branches: null },
      { ...fixturePlay, branches: [{ id: ROOT }] },
      withRoot((b) => ({ ...b, tracks: { [P1]: null, ball: [null, { t: 0, ease: null }] } }) as unknown as Branch),
    ] as unknown as Play[];

    for (const play of malformed) {
      expect(() => validatePlay(play)).not.toThrow();
      const issues = validatePlay(play);
      expect(issues).not.toEqual([]);
      expect(issues.map((issue) => issue.code)).toContain('malformed-play');
    }

    // A single half-edited branch must not be reported as a clean play.
    const halfEdited = {
      ...fixturePlay,
      branches: fixturePlay.branches.map((b) => (b.id === SWITCH ? { ...b, steps: undefined } : b)),
    } as unknown as Play;
    expect(codesFor(halfEdited)).toContain('malformed-play');
  });

  describe('non-finite numbers', () => {
    const rootP1 = (keyframes: Keyframe[]): Play =>
      withRoot((b) => ({ ...b, tracks: { ...b.tracks, [P1]: keyframes } }));
    const at = (position: { x: number; y: number }): Keyframe[] => [
      { t: 0, position: { x: 0, y: 0 } },
      { t: 1, position },
    ];

    it.each([
      ['NaN position', rootP1(at({ x: Number.NaN, y: 0 }))],
      ['Infinity position', rootP1(at({ x: Number.POSITIVE_INFINITY, y: 0 }))],
      [
        'NaN handleOut',
        rootP1([
          { t: 0, position: { x: 0, y: 0 }, handleOut: { x: Number.NaN, y: 0 } },
          { t: 1, position: { x: 1, y: 1 } },
        ]),
      ],
      [
        'NaN handleIn',
        rootP1([
          { t: 0, position: { x: 0, y: 0 } },
          { t: 1, position: { x: 1, y: 1 }, handleIn: { x: 0, y: Number.NaN } },
        ]),
      ],
      [
        'NaN easing control point',
        rootP1([
          { t: 0, position: { x: 0, y: 0 }, ease: { x1: 0, y1: Number.NaN, x2: 1, y2: 1 } },
          { t: 1, position: { x: 1, y: 1 } },
        ]),
      ],
      [
        'NaN time on a middle keyframe',
        rootP1([
          { t: 0, position: { x: 0, y: 0 } },
          { t: Number.NaN, position: { x: 1, y: 1 } },
          { t: 2, position: { x: 2, y: 2 } },
        ]),
      ],
      [
        'NaN time on the last keyframe',
        rootP1([
          { t: 0, position: { x: 0, y: 0 } },
          { t: Number.NaN, position: { x: 1, y: 1 } },
        ]),
      ],
    ])('reports %s', (_label, play) => {
      expect(codesFor(play)).toContain('non-finite-number');
    });
  });

  it('reports an unknown easing preset name', () => {
    const play = withRoot((b) => ({
      ...b,
      tracks: {
        ...b.tracks,
        [P1]: [
          { t: 0, position: { x: 0, y: 0 }, ease: 'bouncy' as unknown as 'linear' },
          { t: 1, position: { x: 1, y: 1 } },
        ],
      },
    }));

    expect(codesFor(play)).toContain('unknown-easing-preset');
  });

  it('reports a root branch that carries a fork step, consistently with resolveBranch', () => {
    const play = withRoot((b) => ({ ...b, forkStepId: STEP_ENTRY }));

    expect(codesFor(play)).toContain('root-branch-with-fork');
    // The root's fork step is ignored when resolving; validate flagging it is the contract.
    expect(() => resolveBranch(play, ROOT)).not.toThrow();
  });

  it('reports a parent id that resolves to no branch, and resolveBranch agrees it is broken', () => {
    const play: Play = {
      ...fixturePlay,
      branches: fixturePlay.branches.map((b) => (b.id === SWITCH ? { ...b, parentId: 'ghost' as BranchId } : b)),
    };

    expect(codesFor(play)).toContain('dangling-parent-branch');
    expect(codesFor(play)).not.toContain('fork-step-not-in-ancestors');
    expect(() => resolveBranch(play, SWITCH)).toThrow(/unknown parent branch/);
  });

  it('reports a root branch id that matches no branch', () => {
    const play: Play = { ...fixturePlay, rootBranchId: 'ghost' as BranchId };

    expect(codesFor(play)).toContain('unknown-root-branch');
  });
});
