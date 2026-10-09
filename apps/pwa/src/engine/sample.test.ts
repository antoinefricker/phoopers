import { describe, expect, it } from 'vitest';
import { fixturePlay, P1, P2, ROOT, SWITCH } from './__fixtures__/play';
import { resolveBranch } from './resolve';
import { ballStateAt, duration, spanKindAt, stateAt, stepsOf } from './sample';
import type { Play, ResolvedTimeline, StepId } from './types';
import { distance } from './vec2';

const timeline = resolveBranch(fixturePlay, ROOT);

describe('stateAt', () => {
  it('returns exact keyframe positions at keyframe times', () => {
    expect(stateAt(timeline, 0).players[P1]?.position).toEqual({ x: 4, y: 7.5 });
    expect(stateAt(timeline, 4).players[P1]?.position).toEqual({ x: 12, y: 5 });
  });

  it('clamps outside the timeline rather than extrapolating', () => {
    expect(stateAt(timeline, -5).players[P1]?.position).toEqual({ x: 4, y: 7.5 });
    expect(stateAt(timeline, 99).players[P1]?.position).toEqual({ x: 12, y: 5 });
  });

  it('derives the ball position from its carrier while attached', () => {
    const state = stateAt(timeline, 0.5);

    expect(state.ball.attachedTo).toBe(P1);
    expect(state.ball.position).toEqual(state.players[P1]?.position);
  });

  it('puts the ball in flight between two different carriers', () => {
    const state = stateAt(timeline, 1.5);

    expect(state.ball.attachedTo).toBeNull();
    expect(ballStateAt(timeline, 1.5)).toBe('inFlight');
  });

  it('reports screens that are live at the sampled time', () => {
    expect(stateAt(timeline, 2.5).activeScreens).toHaveLength(1);
    expect(stateAt(timeline, 3.5).activeScreens).toHaveLength(0);
  });

  it('assigns a span boundary instant to the span that starts there', () => {
    expect(stateAt(timeline, 2).players[P1]?.position).toEqual({ x: 8, y: 5 });
    expect(stateAt(timeline, 2).ball.attachedTo).toBe(P2);
  });

  it('samples a single-keyframe track as a stationary entity', () => {
    const single: ResolvedTimeline = {
      ...timeline,
      anchors: { [P1]: [{ t: 0, position: { x: 1, y: 2 } }], ball: [] },
      spans: { [P1]: [], ball: [] },
    };

    expect(stateAt(single, 3).players[P1]).toEqual({ position: { x: 1, y: 2 }, moving: false });
  });

  it('survives an empty track without producing NaN', () => {
    const empty: ResolvedTimeline = { ...timeline, anchors: { ball: [] }, spans: { ball: [] } };
    const state = stateAt(empty, 1);

    expect(Number.isFinite(state.ball.position.x)).toBe(true);
    expect(Number.isFinite(state.ball.position.y)).toBe(true);
  });

  it('survives a zero-duration span without producing NaN', () => {
    const degenerate = resolveBranch(
      {
        ...fixturePlay,
        branches: fixturePlay.branches.map((branch) =>
          branch.id !== ROOT
            ? branch
            : {
                ...branch,
                tracks: {
                  ...branch.tracks,
                  [P1]: [
                    { t: 0, position: { x: 1, y: 1 } },
                    { t: 0, position: { x: 5, y: 5 } },
                  ],
                },
              },
        ),
      },
      ROOT,
    );
    const position = stateAt(degenerate, 0).players[P1]?.position;

    expect(Number.isFinite(position?.x)).toBe(true);
    expect(Number.isFinite(position?.y)).toBe(true);
  });

  it('survives a ball attached to a player with no track', () => {
    const orphan: ResolvedTimeline = {
      ...timeline,
      anchors: {
        ball: [
          { t: 0, attachedTo: P2 },
          { t: 2, attachedTo: P2 },
        ],
      },
      spans: {
        ball: [
          {
            fromT: 0,
            toT: 2,
            p0: { x: 0, y: 0 },
            p1: { x: 0, y: 0 },
            p2: { x: 0, y: 0 },
            p3: { x: 0, y: 0 },
            ease: { x1: 0, y1: 0, x2: 1, y2: 1 },
            lut: new Array(33).fill(0),
            length: 0,
            attachedTo: P2,
          },
        ],
      },
    };
    const state = stateAt(orphan, 1);

    expect(Number.isFinite(state.ball.position.x)).toBe(true);
  });
});

describe('easing affects distance covered', () => {
  it('covers equal distance in equal time under linear easing', () => {
    const at = (t: number) => stateAt(timeline, t).players[P2]?.position ?? { x: 0, y: 0 };
    const first = distance(at(0), at(0.5));
    const second = distance(at(0.5), at(1));

    expect(second / first).toBeCloseTo(1, 1);
  });
});

describe('derived queries', () => {
  it('reports dribble, move and idle', () => {
    expect(spanKindAt(timeline, P1, 0.5)).toBe('dribble');
    expect(spanKindAt(timeline, P1, 3)).toBe('move');
    expect(spanKindAt(timeline, P2, 1.5)).toBe('move');
    expect(spanKindAt(timeline, P2, 2.5)).toBe('dribble');
    expect(spanKindAt(timeline, P1, 99)).toBe('idle');
  });

  it('exposes duration and steps', () => {
    expect(duration(timeline)).toBe(4);
    expect(stepsOf(timeline).map((s) => s.name)).toEqual(['Entry pass']);
  });
});

describe('ball flight', () => {
  it('flies between the carriers resolved positions, not the court corner', () => {
    const mid = stateAt(timeline, 1.5);
    const p1 = stateAt(timeline, 1.5).players[P1]?.position;

    expect(mid.ball.position.x).toBeGreaterThan(3);
    expect(mid.ball.position.y).toBeGreaterThan(2);
    expect(stateAt(timeline, 1).ball.position).toEqual(stateAt(timeline, 1).players[P1]?.position);
    expect(p1).toBeDefined();
  });

  it('never returns NaN for a non-finite time', () => {
    const state = stateAt(timeline, Number.NaN);

    expect(Number.isFinite(state.ball.position.x)).toBe(true);
    expect(Number.isFinite(state.players[P1]?.position.x)).toBe(true);
  });
});

describe('time edge cases', () => {
  it('clamps infinities to the ends and sanitises NaN in the returned time', () => {
    expect(stateAt(timeline, Number.POSITIVE_INFINITY).players[P1]?.position).toEqual({ x: 12, y: 5 });
    expect(stateAt(timeline, Number.NEGATIVE_INFINITY).players[P1]?.position).toEqual({ x: 4, y: 7.5 });
    expect(stateAt(timeline, Number.NaN).t).toBe(0);
  });
});

describe('cross-branch continuity', () => {
  it('keeps the ball where it is when forking mid-pass', () => {
    const MID = 'step-mid' as StepId;
    const play: Play = {
      ...fixturePlay,
      branches: fixturePlay.branches.map((branch) =>
        branch.id === ROOT
          ? { ...branch, steps: [...branch.steps, { id: MID, t: 1.5, name: 'Mid pass' }] }
          : branch.id === SWITCH
            ? { ...branch, forkStepId: MID }
            : branch,
      ),
    };
    const parent = resolveBranch(play, ROOT);
    const child = resolveBranch(play, SWITCH);
    const a = stateAt(parent, 1.5).ball.position;
    const b = stateAt(child, 1.5).ball.position;

    expect(distance(a, b)).toBeLessThan(1e-6);
  });
});

describe('moving versus standing still', () => {
  const walker = (end: { x: number; y: number }): ResolvedTimeline =>
    resolveBranch(
      {
        id: 'p' as Play['id'],
        name: 'standing',
        court: 'fiba',
        rootBranchId: ROOT,
        players: [{ id: P1, team: 'offense', label: '1' }],
        branches: [
          {
            id: ROOT,
            parentId: null,
            forkStepId: null,
            name: 'Base',
            steps: [],
            screens: [],
            tracks: {
              [P1]: [
                { t: 0, position: { x: 7.3, y: 4.1 } },
                { t: 4, position: end },
              ],
              ball: [{ t: 0, attachedTo: P1 }],
            },
          },
        ],
      },
      ROOT,
    );

  it('reports a player whose endpoints coincide as idle, not moving', () => {
    const standing = walker({ x: 7.3, y: 4.1 });

    expect(stateAt(standing, 2).players[P1]?.moving).toBe(false);
    expect(spanKindAt(standing, P1, 2)).toBe('idle');
  });

  it('still reports a genuine 5 cm move as moving (the epsilon is not absurdly high)', () => {
    const creeping = walker({ x: 7.35, y: 4.1 });

    expect(stateAt(creeping, 2).players[P1]?.moving).toBe(true);
    expect(spanKindAt(creeping, P1, 2)).toBe('dribble');
  });
});
