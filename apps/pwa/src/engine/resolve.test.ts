import { describe, expect, it } from 'vitest';
import { fixturePlay, P1, P2, ROOT, SWITCH } from './__fixtures__/play';
import { resolveBranch } from './resolve';

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
