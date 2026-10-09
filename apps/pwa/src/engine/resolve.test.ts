import { describe, expect, it } from 'vitest';
import { fixturePlay, P1, P2, ROOT, SWITCH } from './__fixtures__/play';
import { resolveBranch } from './resolve';
import { stateAt } from './sample';
import { applyEasing } from './easing';
import { lutToParam, pointOnCubic } from './curve';
import type { Branch, Keyframe, Play, PlayerId, StepId } from './types';

describe('resolveBranch', () => {
  it('keeps every root keyframe when resolving the root', () => {
    const timeline = resolveBranch(fixturePlay, ROOT);

    expect(timeline.branchId).toBe(ROOT);
    expect(timeline.anchors[P1]).toHaveLength(3);
    expect(timeline.spans[P1]).toHaveLength(2);
    expect(timeline.duration).toBe(4);
  });

  it('prepares each span with resolved handles, easing and a table', () => {
    const [span] = resolveBranch(fixturePlay, ROOT).spans[P1] ?? [];
    if (span === undefined) throw new Error('expected a span');

    expect(span.fromT).toBe(0);
    expect(span.toT).toBe(2);
    expect(span.ease).toEqual({ x1: 0, y1: 0, x2: 1, y2: 1 });
    expect(span.lut).toHaveLength(33);
    expect(span.length).toBeGreaterThan(0);
  });

  it('takes the parent before the fork and the child after it', () => {
    const timeline = resolveBranch(fixturePlay, SWITCH);
    const anchors = timeline.anchors[P2] ?? [];

    expect(anchors.map((k) => k.t)).toEqual([0, 2, 4]);
    expect(anchors[2]?.position).toEqual({ x: 4, y: 4 });
  });

  it('carries the ancestors steps and screens', () => {
    const timeline = resolveBranch(fixturePlay, SWITCH);

    expect(timeline.steps.map((s) => s.t)).toEqual([2]);
    expect(timeline.screens).toHaveLength(1);
  });

  it('synthesises a keyframe at the fork when the branch starts later', () => {
    const anchors = resolveBranch(fixturePlay, SWITCH).anchors[P1] ?? [];

    expect(anchors.map((k) => k.t)).toEqual([0, 2, 3]);
    expect(anchors[1]?.position).toEqual({ x: 8, y: 5 });
  });

  it('assigns the fork instant to the child, not the parent', () => {
    const anchors = resolveBranch(fixturePlay, SWITCH).anchors[P2] ?? [];
    const atFork = anchors.filter((k) => k.t === 2);

    expect(atFork).toHaveLength(1);
    expect(atFork[0]?.position).toEqual({ x: 7, y: 3 });
  });

  it('throws for an unknown branch id', () => {
    expect(() => resolveBranch(fixturePlay, 'nope' as typeof ROOT)).toThrow(/unknown branch/i);
  });
});

const FORK = 'fork' as StepId;

// A root branch with a fork step at t=2 and a child that only adds keyframes after it.
function forkedPlay(rootTracks: Record<string, Keyframe[]>, childTracks: Record<string, Keyframe[]>): Play {
  return {
    ...fixturePlay,
    branches: [
      {
        id: ROOT,
        parentId: null,
        forkStepId: null,
        name: 'Base',
        steps: [{ id: FORK, t: 2, name: 'Fork' }],
        screens: [],
        tracks: rootTracks as Branch['tracks'],
      },
      {
        id: SWITCH,
        parentId: ROOT,
        forkStepId: FORK,
        name: 'Child',
        steps: [],
        screens: [],
        tracks: childTracks as Branch['tracks'],
      },
    ],
  };
}

const atFork = (anchors: Keyframe[] | undefined): Keyframe | undefined => (anchors ?? []).find((k) => k.t === 2);

describe('resolveBranch fork continuity', () => {
  it('applies the parent span easing when synthesising the fork keyframe', () => {
    const play = forkedPlay(
      {
        [P1]: [
          { t: 0, position: { x: 0, y: 0 }, ease: 'easeIn' },
          { t: 4, position: { x: 10, y: 0 } },
        ],
        ball: [],
      },
      { [P1]: [{ t: 6, position: { x: 10, y: 0 } }], ball: [] },
    );
    const [span] = resolveBranch(play, ROOT).spans[P1] ?? [];
    if (span === undefined) throw new Error('expected a span');
    const u = lutToParam(span.lut, applyEasing(span.ease, 0.5));
    const expected = pointOnCubic(span.p0, span.p1, span.p2, span.p3, u);

    const position = atFork(resolveBranch(play, SWITCH).anchors[P1])?.position;
    expect(position?.x).toBeCloseTo(expected.x, 9);
    expect(position?.x).toBeLessThan(5);
  });

  it('synthesises a free position for a ball going attached to free', () => {
    const play = forkedPlay(
      {
        [P1]: [
          { t: 0, position: { x: 0, y: 0 } },
          { t: 4, position: { x: 0, y: 0 } },
        ],
        ball: [
          { t: 0, attachedTo: P1 },
          { t: 4, position: { x: 9, y: 9 } },
        ],
      },
      { ball: [{ t: 6, position: { x: 9, y: 9 } }] },
    );
    const k = atFork(resolveBranch(play, SWITCH).anchors.ball);

    expect(k?.attachedTo).toBeUndefined();
    expect(k?.position?.x).toBeCloseTo(4.5, 6);
    expect(k?.position?.y).toBeCloseTo(4.5, 6);
  });

  it('synthesises a free position for a ball going free to attached', () => {
    const play = forkedPlay(
      {
        [P1]: [
          { t: 0, position: { x: 8, y: 8 } },
          { t: 4, position: { x: 8, y: 8 } },
        ],
        ball: [
          { t: 0, position: { x: 0, y: 0 } },
          { t: 4, attachedTo: P1 },
        ],
      },
      { ball: [{ t: 6, attachedTo: P1 }] },
    );
    const k = atFork(resolveBranch(play, SWITCH).anchors.ball);

    expect(k?.attachedTo).toBeUndefined();
    expect(k?.position?.x).toBeCloseTo(4, 6);
    expect(k?.position?.y).toBeCloseTo(4, 6);
  });

  it('keeps the ball in flight when forking mid-pass', () => {
    const play = forkedPlay(
      {
        [P1]: [
          { t: 0, position: { x: 0, y: 0 } },
          { t: 4, position: { x: 0, y: 0 } },
        ],
        [P2]: [
          { t: 0, position: { x: 10, y: 0 } },
          { t: 4, position: { x: 10, y: 0 } },
        ],
        ball: [
          { t: 0, attachedTo: P1 },
          { t: 4, attachedTo: P2 },
        ],
      },
      { ball: [{ t: 6, attachedTo: P2 }] },
    );
    const k = atFork(resolveBranch(play, SWITCH).anchors.ball);

    expect(k?.attachedTo).toBeUndefined();
    expect(k?.position?.x).toBeCloseTo(5, 6);
    expect(k?.position?.y).toBeCloseTo(0, 6);
  });

  it('keeps an attachment that is held across the fork', () => {
    const k = atFork(resolveBranch(fixturePlay, ROOT).anchors.ball);
    const play = forkedPlay(
      {
        ball: [
          { t: 0, attachedTo: P1 },
          { t: 4, attachedTo: P1 },
        ],
      },
      { ball: [{ t: 6, attachedTo: P1 }] },
    );
    const synthesised = atFork(resolveBranch(play, SWITCH).anchors.ball);

    expect(k).toBeDefined();
    expect(synthesised).toEqual({ t: 2, attachedTo: P1 });
  });

  it('does not synthesise a keyframe for an entity that first appears in the child', () => {
    const p3 = 'p3' as PlayerId;
    const play = forkedPlay(
      { [P1]: [{ t: 0, position: { x: 1, y: 1 } }], ball: [] },
      { [p3]: [{ t: 5, position: { x: 3, y: 3 } }] },
    );
    const anchors = resolveBranch(play, SWITCH).anchors[p3] ?? [];

    expect(anchors.map((k) => k.t)).toEqual([5]);
  });

  it('always provides ball tracks, even when the play has none', () => {
    const play = forkedPlay({ [P1]: [{ t: 0, position: { x: 1, y: 1 } }] }, {});
    const timeline = resolveBranch(play, ROOT);

    expect(timeline.anchors.ball).toEqual([]);
    expect(timeline.spans.ball).toEqual([]);
  });
});

describe('resolveBranch ancestor opening', () => {
  // The invariant behind spec criterion 5: before the fork, the child IS the parent.
  function expectSameOpening(play: Play): void {
    const root = resolveBranch(play, ROOT);
    const child = resolveBranch(play, SWITCH);

    for (let t = 0; t < 2; t += 0.05) {
      const a = stateAt(root, t);
      const b = stateAt(child, t);
      for (const id of Object.keys(a.players) as PlayerId[]) {
        expect(b.players[id]?.position.x, `${id}.x @${t}`).toBeCloseTo(a.players[id]?.position.x ?? NaN, 9);
        expect(b.players[id]?.position.y, `${id}.y @${t}`).toBeCloseTo(a.players[id]?.position.y ?? NaN, 9);
      }
      expect(b.ball.position.x, `ball.x @${t}`).toBeCloseTo(a.ball.position.x, 9);
      expect(b.ball.position.y, `ball.y @${t}`).toBeCloseTo(a.ball.position.y, 9);
      expect(b.ball.attachedTo).toBe(a.ball.attachedTo);
    }
  }

  it('matches the root before the fork for every entity of the fixture', () => {
    expectSameOpening(fixturePlay);
  });

  it('matches the root when the parent fork keyframe carries handles', () => {
    const play = forkedPlay(
      {
        [P1]: [
          { t: 0, position: { x: 0, y: 0 } },
          { t: 2, position: { x: 6, y: 4 }, handleIn: { x: 8, y: 9 }, handleOut: { x: 9, y: 1 } },
          { t: 4, position: { x: 12, y: 0 } },
        ],
        [P2]: [
          { t: 0, position: { x: 1, y: 1 } },
          { t: 2, position: { x: 5, y: 5 } },
          { t: 4, position: { x: 9, y: 2 } },
        ],
        ball: [
          { t: 0, attachedTo: P1 },
          { t: 4, attachedTo: P1 },
        ],
      },
      { [P1]: [{ t: 4, position: { x: 3, y: 3 } }] },
    );

    expectSameOpening(play);
  });

  const openingTracks = (): Record<string, Keyframe[]> => ({
    [P1]: [
      { t: 0, position: { x: 0, y: 0 } },
      { t: 2, position: { x: 6, y: 4 }, handleIn: { x: 8, y: 9 }, handleOut: { x: 9, y: 1 } },
      { t: 4, position: { x: 12, y: 0 } },
    ],
    ball: [],
  });

  it('keeps the ancestor opening when the child owns the fork keyframe with a different handleIn', () => {
    const play = forkedPlay(openingTracks(), {
      [P1]: [
        { t: 2, position: { x: 6, y: 4 }, handleIn: { x: 7, y: 12 } },
        { t: 5, position: { x: 3, y: 3 } },
      ],
      ball: [],
    });

    expectSameOpening(play);
  });

  it('keeps the ancestor opening when the child owns the fork keyframe at a different position', () => {
    const play = forkedPlay(openingTracks(), {
      [P1]: [
        { t: 2, position: { x: 20, y: 12 } },
        { t: 5, position: { x: 3, y: 3 } },
      ],
      ball: [],
    });

    expectSameOpening(play);
    // The child still departs from the position it chose.
    expect(atFork(resolveBranch(play, SWITCH).anchors[P1])?.position).toEqual({ x: 20, y: 12 });
  });

  it('carries the parent fork handleOut into the child departing span', () => {
    const play = forkedPlay(openingTracks(), { [P1]: [{ t: 5, position: { x: 3, y: 3 } }], ball: [] });
    const departing = (resolveBranch(play, SWITCH).spans[P1] ?? []).find((s) => s.fromT === 2);

    expect(departing?.p1).toEqual({ x: 9, y: 1 });
  });

  it('matches the sampler when synthesising a fork across an attached ball keyframe', () => {
    const play = forkedPlay(
      {
        ball: [
          { t: 0, position: { x: 0, y: 0 } },
          { t: 1, position: { x: 2, y: 6 } },
          { t: 2, attachedTo: P1 },
          { t: 3, position: { x: 9, y: 1 } },
          { t: 5, position: { x: 14, y: 8 } },
        ],
        [P1]: [{ t: 0, position: { x: 0, y: 0 } }],
      },
      { ball: [{ t: 6, position: { x: 1, y: 1 } }] },
    );
    // Fork at 2 is attached; use a later fork step inside the free/free span instead.
    const root = play.branches[0];
    if (root === undefined) throw new Error('expected root');
    const shifted: Play = {
      ...play,
      branches: [{ ...root, steps: [{ id: FORK, t: 4, name: 'Fork' }] }, ...play.branches.slice(1)],
    };
    const expected = stateAt(resolveBranch(shifted, ROOT), 4).ball.position;
    const synthesised = resolveBranch(shifted, SWITCH).anchors.ball?.find((k) => k.t === 4)?.position;

    expect(synthesised?.x).toBeCloseTo(expected.x, 9);
    expect(synthesised?.y).toBeCloseTo(expected.y, 9);
  });
});
