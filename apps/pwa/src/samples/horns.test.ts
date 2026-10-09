import { describe, expect, it } from 'vitest';
import type { BranchId, PlayerId, ResolvedTimeline } from '../engine';
import { ballStateAt, duration, resolveBranch, spanKindAt, stateAt, validatePlay } from '../engine';
import { HORNS_ROOT, HORNS_STEP_ENTRY, HORNS_SWITCH, hornsPlay } from './horns';

const RING = { x: 26.425, y: 7.5 };
const SAMPLES = 161;

const sampleTimes = (timeline: ResolvedTimeline): number[] =>
  Array.from({ length: SAMPLES }, (_, i) => (duration(timeline) * i) / (SAMPLES - 1));

const pid = (id: string): PlayerId => id as PlayerId;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

// Who holds the ball over time, with consecutive repeats collapsed and flight shown as null.
// This is what a pass looks like: [o1, null, o2].
const holderSequence = (timeline: ResolvedTimeline): (string | null)[] => {
  const sequence: (string | null)[] = [];
  for (const t of sampleTimes(timeline)) {
    const holder = stateAt(timeline, t).ball.attachedTo;
    if (sequence[sequence.length - 1] !== holder) sequence.push(holder);
  }
  return sequence;
};

// Each defender's assignment; the guarded player must always be one of the nearest offensive players.
const MATCHUPS: [string, string][] = [
  ['x1', 'o1'],
  ['x2', 'o2'],
  ['x3', 'o3'],
  ['x4', 'o4'],
  ['x5', 'o5'],
];

describe('hornsPlay', () => {
  it('is structurally valid', () => {
    expect(validatePlay(hornsPlay)).toEqual([]);
  });

  it('fields five offense and five defense players', () => {
    const offense = hornsPlay.players.filter((p) => p.team === 'offense');
    const defense = hornsPlay.players.filter((p) => p.team === 'defense');

    expect(offense).toHaveLength(5);
    expect(defense).toHaveLength(5);
  });

  it('has a switch branch forking from the entry step, which exists in the root', () => {
    const branch = hornsPlay.branches.find((b) => b.id === HORNS_SWITCH);
    const root = hornsPlay.branches.find((b) => b.id === HORNS_ROOT);
    const entry = root?.steps.find((s) => s.id === HORNS_STEP_ENTRY);

    expect(branch?.parentId).toBe(HORNS_ROOT);
    expect(branch?.forkStepId).toBe(HORNS_STEP_ENTRY);
    expect(entry).toBeDefined();

    const times = Object.values(branch?.tracks ?? {}).flatMap((track) => track.map((k) => k.t));
    expect(times.length).toBeGreaterThan(0);
    expect(Math.min(...times)).toBeGreaterThanOrEqual(entry?.t ?? Number.POSITIVE_INFINITY);
  });

  it('screens: two offensive bigs screen for the point guard, standing still while they do', () => {
    const timeline = resolveBranch(hornsPlay, HORNS_ROOT);

    expect(timeline.screens.map((s) => s.screenerId).sort()).toEqual(['o4', 'o5']);
    for (const screen of timeline.screens) {
      expect(screen.beneficiaryId).toBe('o1');
      const start = stateAt(timeline, screen.t).players[screen.screenerId]?.position ?? { x: NaN, y: NaN };
      for (const fraction of [0.1, 0.5, 0.9, 1]) {
        const t = screen.t + screen.duration * fraction;
        const position = stateAt(timeline, t).players[screen.screenerId]?.position ?? { x: NaN, y: NaN };
        expect(dist(position, start)).toBeLessThan(0.001);
        expect(spanKindAt(timeline, screen.screenerId, t)).toBe('idle');
        expect(stateAt(timeline, t).activeScreens.map((s) => s.id)).toContain(screen.id);
      }
    }
  });

  it('o1 dribbles up the floor, then passes to o2, who dribbles in to shoot', () => {
    const timeline = resolveBranch(hornsPlay, HORNS_ROOT);
    const times = sampleTimes(timeline);

    // A dribble is a player moving while holding the ball: check who, not just that one exists.
    const dribblers = new Set(
      times.flatMap((t) =>
        hornsPlay.players.filter((p) => spanKindAt(timeline, p.id, t) === 'dribble').map((p) => p.id),
      ),
    );
    expect([...dribblers].sort()).toEqual(['o1', 'o2']);

    // Defenders move without the ball but never dribble.
    expect(times.some((t) => spanKindAt(timeline, pid('x1'), t) === 'move')).toBe(true);

    // The pass: o1 -> in flight -> o2, then the shot leaves o2's hands.
    expect(holderSequence(timeline)).toEqual(['o1', null, 'o2', null]);
    expect(times.some((t) => ballStateAt(timeline, t) === 'held')).toBe(true);
  });

  it('ends with the ball free and heading to the ring, which is the shot', () => {
    const timeline = resolveBranch(hornsPlay, HORNS_ROOT);
    const end = stateAt(timeline, duration(timeline));

    expect(ballStateAt(timeline, duration(timeline))).toBe('inFlight');
    expect(dist(end.ball.position, RING)).toBeLessThan(0.5);
    // ...and just before the shot the shooter really was holding it, close to the basket.
    const release = stateAt(timeline, duration(timeline) - 1.05);
    expect(release.ball.attachedTo).toBe('o2');
    expect(dist(release.players[pid('o2')]?.position ?? { x: 0, y: 0 }, RING)).toBeLessThan(3);
  });

  it('switch branch swings the ball to o3 instead of o2, after the shared opening', () => {
    const root = resolveBranch(hornsPlay, HORNS_ROOT);
    const alt = resolveBranch(hornsPlay, HORNS_SWITCH);

    expect(holderSequence(alt)).toEqual(['o1', null, 'o3', null]);
    expect(holderSequence(root)).not.toEqual(holderSequence(alt));
    expect(duration(alt)).toBeGreaterThan(0);

    // Identical before the fork, different after it.
    const before = stateAt(root, 3);
    expect(stateAt(alt, 3)).toEqual(before);
    expect(stateAt(alt, 6.5).ball.attachedTo).toBe('o3');
    expect(stateAt(root, 6.5).ball.attachedTo).toBe('o2');
  });

  describe.each([HORNS_ROOT, HORNS_SWITCH] as BranchId[])('physical plausibility of %s', (branchId) => {
    const timeline = resolveBranch(hornsPlay, branchId);
    const times = sampleTimes(timeline);

    it('keeps every player and the ball on the court', () => {
      for (const t of times) {
        const state = stateAt(timeline, t);
        const points = [...Object.values(state.players).map((p) => p.position), state.ball.position];
        for (const p of points) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThanOrEqual(28);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeLessThanOrEqual(15);
        }
      }
    });

    it('never stacks two teammates on the same point', () => {
      for (const t of times) {
        const { players } = stateAt(timeline, t);
        for (const team of ['offense', 'defense'] as const) {
          const ids = hornsPlay.players.filter((p) => p.team === team).map((p) => p.id);
          for (const a of ids) {
            for (const b of ids) {
              if (a >= b) continue;
              const pa = players[a]?.position;
              const pb = players[b]?.position;
              if (pa === undefined || pb === undefined) throw new Error('missing player');
              expect(dist(pa, pb), `${a}/${b} at t=${t}`).toBeGreaterThan(0.6);
            }
          }
        }
      }
    });

    it('keeps every defender within 2.5 m of the player they guard', () => {
      for (const t of times) {
        const { players } = stateAt(timeline, t);
        for (const [x, o] of MATCHUPS) {
          const px = players[pid(x)]?.position;
          const po = players[pid(o)]?.position;
          if (px === undefined || po === undefined) throw new Error('missing player');
          expect(dist(px, po), `${x} on ${o} at t=${t}`).toBeLessThan(2.5);
        }
      }
    });
  });
});
