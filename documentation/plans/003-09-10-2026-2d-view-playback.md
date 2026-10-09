# Phase 1b — 2D View and Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only coach's-whiteboard view that draws a play, animates it, and lets you scrub it and switch between its branches.

**Architecture:** Pure geometry first (court markings, path construction, symbol strokes), then data, then React. Two rendering layers with different update rates: a static layer React re-renders only on a branch switch, and an animated layer a `requestAnimationFrame` loop drives by writing transforms onto refs. The engine is consumed unchanged — `resolveBranch` once per branch, `stateAt` per frame.

**Tech Stack:** React 19, Mantine 9, SVG, Vitest + Testing Library, the 1a engine at `apps/pwa/src/engine/`.

**Spec:** [documentation/specs/002-09-10-2026-2d-view-playback.md](../specs/002-09-10-2026-2d-view-playback.md)

## Global Constraints

- **Reach for Mantine first, but it is a default rather than a cage.** Use Mantine components and hooks where they fit, and compose custom components from Mantine primitives so spacing, colour and dark mode stay consistent. Where Mantine has no good fit, use plain elements rather than contorting around it, themed through Mantine's CSS variables. The SVG canvas is plain markup by necessity.
- **All user-facing strings go through `t('<namespace>.<key>', 'English default')`**, enforced by `i18next/no-literal-string`. Branch names, step names and player labels are DATA and are not translated.
- **Context naming**: `PlaybackContextProvider` in `PlaybackContextProvider.tsx`; `usePlaybackContext` co-located with `PlaybackContextValue` and `createContext` in `usePlaybackContext.ts`. The hook throws outside the provider, naming both.
- **No `useState` setter inside `useEffect`** — `react-hooks/set-state-in-effect` is an error.
- **`noUncheckedIndexedAccess` is ON**: `array[i]` and `record[key]` are `T | undefined`. Narrow explicitly — NEVER use `!`.
- **`verbatimModuleSyntax` is ON**: type-only imports are `import type { … }`.
- **`pnpm lint` runs with `--max-warnings 0`** — a warning fails the gate like an error.
- **Coordinates are court metres**, origin at a corner, `x ∈ [0, length]`, `y ∈ [0, width]`. The SVG `viewBox` is in those units; there is no pixel conversion anywhere.
- **The engine is read-only here.** Nothing in `apps/pwa/src/play2d/` may import from `engine/` except through `engine/index.ts`, and nothing may modify a `Play`.
- Conventional commits, no attribution lines. One commit per task.

## Review Focus

Failure modes the spec implies but whose happy paths no task would otherwise exercise.

1. **Switching branch mid-playback with the clock past the new branch's duration.** Branches have different lengths; a 6-second play switched for a 3-second one leaves the clock at 5s. Expect the clock to clamp to the new duration rather than render a frozen frame off the end of the timeline. → Task 4.
2. **The animation loop outliving its component.** An uncancelled `requestAnimationFrame` keeps calling `stateAt` and writing to detached DOM nodes after unmount or a branch switch. → Task 4.
3. **A play whose duration is 0** (every keyframe at `t = 0`). The scrubber's progress is `t / duration` — a divide by zero putting `NaN` into a `viewBox` or a slider value. → Tasks 4 and 7.
4. **Two steps at the same time.** Spec 001 explicitly permits a parent and a child each contributing a step at a fork instant. Two ticks land on the same pixel and snapping must still resolve to one of them deterministically. → Task 7.
5. **A player in `players` with no track in the selected branch.** Spec 001 records that an empty track samples to the court origin while a missing track is absent entirely — so the view can silently draw a phantom token at the corner. → Task 6.

---

## File Structure

```
apps/pwa/src/play2d/
  geometry/court.ts              # COURT_SPEC -> Marking[]; pure
  geometry/court.test.ts
  geometry/paths.ts              # spans -> SVG path segments; ball polyline; wavy; pure
  geometry/paths.test.ts
  usePlaybackContext.ts          # PlaybackContextValue, context, hook
  PlaybackContextProvider.tsx    # timeline + clock ref + isPlaying
  usePlaybackClock.ts            # the rAF loop
  usePlaybackClock.test.ts
  Court.tsx                      # static markings
  PathLayer.tsx                  # static paths per entity
  TokenLayer.tsx                 # animated tokens, ref-driven
  PlayCanvas.tsx                 # SVG root
  PlaybackTransport.tsx          # play/pause, scrubber, step ticks, prev/next
  BranchTree.tsx                 # Mantine Tree
  PlayView.tsx                   # assembles everything, owns the court toggle
apps/pwa/src/samples/horns.ts    # the 5-on-5 sample play
apps/pwa/src/samples/horns.test.ts
apps/pwa/src/i18n/locales/{en,fr}/play.json
```

Geometry is pure and testable without a DOM. Components stay thin because the maths lives outside them.

---

### Task 1: Court geometry

Deliverable: a pure function turning a court type into drawable markings.

**Files:**

- Create: `apps/pwa/src/play2d/geometry/court.ts`
- Test: `apps/pwa/src/play2d/geometry/court.test.ts`

**Interfaces:**

- Consumes: `COURT_DIMENSIONS` from `../../engine`.
- Produces: `type Marking`, `COURT_SPEC`, `courtMarkings(court: 'fiba' | 'nba'): Marking[]`, `halfCourtViewBox(court)` and `fullCourtViewBox(court)`.

- [ ] **Step 1: Verify the dimensions against the rulebook**

The spec requires this and it is not optional. The values below are the plan's starting point, NOT verified fact. Check each against the current official FIBA and NBA rulebooks before writing the file. Correct any that differ and record what you changed in your report.

| Measure                               | FIBA    | NBA           |
| ------------------------------------- | ------- | ------------- |
| Court length × width (m)              | 28 × 15 | 28.65 × 15.24 |
| Three-point arc radius (m)            | 6.75    | 7.24          |
| Three-point corner distance (m)       | 6.60    | 6.70          |
| Key width (m)                         | 4.90    | 4.88          |
| Free-throw line from baseline (m)     | 5.80    | 5.79          |
| Free-throw / centre circle radius (m) | 1.80    | 1.83          |
| Basket centre from baseline (m)       | 1.575   | 1.575         |
| Backboard width (m)                   | 1.80    | 1.83          |
| Rim radius (m)                        | 0.225   | 0.2286        |

- [ ] **Step 2: Write the failing test**

`apps/pwa/src/play2d/geometry/court.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { COURT_SPEC, courtMarkings, fullCourtViewBox, halfCourtViewBox } from './court';

describe('courtMarkings', () => {
  it('bounds every marking inside the court for both court types', () => {
    for (const court of ['fiba', 'nba'] as const) {
      const spec = COURT_SPEC[court];
      for (const marking of courtMarkings(court)) {
        if (marking.kind === 'circle') {
          expect(marking.cx).toBeGreaterThanOrEqual(0);
          expect(marking.cx).toBeLessThanOrEqual(spec.length);
          expect(marking.cy).toBeGreaterThanOrEqual(0);
          expect(marking.cy).toBeLessThanOrEqual(spec.width);
        }
        if (marking.kind === 'line') {
          for (const v of [marking.x1, marking.x2]) {
            expect(v).toBeGreaterThanOrEqual(-0.01);
            expect(v).toBeLessThanOrEqual(spec.length + 0.01);
          }
        }
      }
    }
  });

  it('is mirror-symmetric about the half-way line', () => {
    const spec = COURT_SPEC.fiba;
    const circles = courtMarkings('fiba').filter((m) => m.kind === 'circle');
    const left = circles.filter((c) => c.cx < spec.length / 2).length;
    const right = circles.filter((c) => c.cx > spec.length / 2).length;

    expect(left).toBe(right);
    expect(left).toBeGreaterThan(0);
  });

  it('places the centre circle at the exact centre', () => {
    const spec = COURT_SPEC.fiba;
    const centre = courtMarkings('fiba').find((m) => m.kind === 'circle' && Math.abs(m.cx - spec.length / 2) < 1e-9);

    expect(centre).toBeDefined();
    expect(centre?.kind === 'circle' ? centre.cy : undefined).toBeCloseTo(spec.width / 2, 9);
  });

  it('agrees with the engine on court dimensions', () => {
    expect(COURT_SPEC.fiba.length).toBe(28);
    expect(COURT_SPEC.fiba.width).toBe(15);
    expect(COURT_SPEC.nba.length).toBe(28.65);
    expect(COURT_SPEC.nba.width).toBe(15.24);
  });
});

describe('viewBoxes', () => {
  it('full court spans the whole floor', () => {
    expect(fullCourtViewBox('fiba')).toBe('0 0 28 15');
  });

  it('half court spans the attacking half only', () => {
    expect(halfCourtViewBox('fiba')).toBe('0 0 14 15');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @phoopers/pwa test court`
Expected: FAIL — `Failed to resolve import "./court"`.

- [ ] **Step 4: Write the implementation**

`apps/pwa/src/play2d/geometry/court.ts`. `COURT_SPEC` extends the engine's dimensions with marking geometry; the test above asserts the two agree, so a change to one without the other fails.

```ts
import { COURT_DIMENSIONS } from '../../engine';

export type CourtType = 'fiba' | 'nba';

export interface CourtSpec {
  length: number;
  width: number;
  threePointRadius: number;
  threePointCorner: number;
  keyWidth: number;
  freeThrowFromBaseline: number;
  circleRadius: number;
  basketFromBaseline: number;
  backboardWidth: number;
  rimRadius: number;
}

export const COURT_SPEC: Record<CourtType, CourtSpec> = {
  fiba: {
    ...COURT_DIMENSIONS.fiba,
    threePointRadius: 6.75,
    threePointCorner: 6.6,
    keyWidth: 4.9,
    freeThrowFromBaseline: 5.8,
    circleRadius: 1.8,
    basketFromBaseline: 1.575,
    backboardWidth: 1.8,
    rimRadius: 0.225,
  },
  nba: {
    ...COURT_DIMENSIONS.nba,
    threePointRadius: 7.24,
    threePointCorner: 6.7,
    keyWidth: 4.88,
    freeThrowFromBaseline: 5.79,
    circleRadius: 1.83,
    basketFromBaseline: 1.575,
    backboardWidth: 1.83,
    rimRadius: 0.2286,
  },
};

export type Marking =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'path'; d: string };

/** Markings for one end, mirrored by the caller. `side` is 1 for the left basket, -1 for the right. */
function endMarkings(spec: CourtSpec, side: 1 | -1): Marking[] {
  const baseline = side === 1 ? 0 : spec.length;
  const inward = (distance: number) => baseline + side * distance;
  const midY = spec.width / 2;
  const basketX = inward(spec.basketFromBaseline);
  const cornerY = spec.width / 2 - spec.threePointCorner;

  // Where the arc meets the straight corner lines.
  const dx = Math.sqrt(Math.max(0, spec.threePointRadius ** 2 - (spec.threePointCorner - 0) ** 2));
  const breakX = inward(spec.basketFromBaseline + dx);

  return [
    // Key
    {
      kind: 'rect',
      x: Math.min(baseline, inward(spec.freeThrowFromBaseline)),
      y: midY - spec.keyWidth / 2,
      w: spec.freeThrowFromBaseline,
      h: spec.keyWidth,
    },
    // Free-throw circle
    { kind: 'circle', cx: inward(spec.freeThrowFromBaseline), cy: midY, r: spec.circleRadius },
    // Backboard
    {
      kind: 'line',
      x1: inward(spec.basketFromBaseline - spec.rimRadius),
      y1: midY - spec.backboardWidth / 2,
      x2: inward(spec.basketFromBaseline - spec.rimRadius),
      y2: midY + spec.backboardWidth / 2,
    },
    // Rim
    { kind: 'circle', cx: basketX, cy: midY, r: spec.rimRadius },
    // Three-point corner lines
    { kind: 'line', x1: baseline, y1: cornerY, x2: breakX, y2: cornerY },
    {
      kind: 'line',
      x1: baseline,
      y1: spec.width - cornerY,
      x2: breakX,
      y2: spec.width - cornerY,
    },
    // Three-point arc
    {
      kind: 'path',
      d:
        `M ${breakX} ${cornerY} ` +
        `A ${spec.threePointRadius} ${spec.threePointRadius} 0 0 ${side === 1 ? 1 : 0} ` +
        `${breakX} ${spec.width - cornerY}`,
    },
  ];
}

export function courtMarkings(court: CourtType): Marking[] {
  const spec = COURT_SPEC[court];

  return [
    { kind: 'rect', x: 0, y: 0, w: spec.length, h: spec.width },
    { kind: 'line', x1: spec.length / 2, y1: 0, x2: spec.length / 2, y2: spec.width },
    { kind: 'circle', cx: spec.length / 2, cy: spec.width / 2, r: spec.circleRadius },
    ...endMarkings(spec, 1),
    ...endMarkings(spec, -1),
  ];
}

export const fullCourtViewBox = (court: CourtType): string => {
  const spec = COURT_SPEC[court];
  return `0 0 ${spec.length} ${spec.width}`;
};

export const halfCourtViewBox = (court: CourtType): string => {
  const spec = COURT_SPEC[court];
  return `0 0 ${spec.length / 2} ${spec.width}`;
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @phoopers/pwa test court`
Expected: PASS — 6 passed.

- [ ] **Step 6: Commit**

```bash
pnpm format && pnpm lint && pnpm typecheck
git add apps/pwa/src/play2d
git commit -m "feat(play2d): add court geometry for FIBA and NBA floors"
```

---

### Task 2: Path and symbol geometry

Deliverable: pure functions turning a resolved timeline into drawable path segments carrying their symbol kind.

**Files:**

- Create: `apps/pwa/src/play2d/geometry/paths.ts`
- Test: `apps/pwa/src/play2d/geometry/paths.test.ts`

**Interfaces:**

- Consumes: `PreparedSpan`, `ResolvedTimeline`, `PlayerId`, `SpanKind`, `Vec2`, `spanKindAt`, `stateAt`, `ballStateAt` from `../../engine`.
- Produces: `interface PathSegment { d: string; kind: SpanKind }`, `playerPathSegments(timeline, playerId): PathSegment[]`, `ballPathSegments(timeline, samplesPerSecond?): { d: string; inFlight: boolean }[]`, `wavyPathD(points, amplitude, wavelength): string`, `polylineD(points): string`.

- [ ] **Step 1: Write the failing test**

`apps/pwa/src/play2d/geometry/paths.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveBranch } from '../../engine';
import { fixturePlay, P1, ROOT } from '../../engine/__fixtures__/play';
import { ballPathSegments, playerPathSegments, polylineD, wavyPathD } from './paths';

const timeline = resolveBranch(fixturePlay, ROOT);

describe('playerPathSegments', () => {
  it('produces one segment per span, each a cubic starting with a moveto', () => {
    const segments = playerPathSegments(timeline, P1);

    expect(segments.length).toBe(timeline.spans[P1]?.length);
    for (const segment of segments) {
      expect(segment.d.startsWith('M ')).toBe(true);
      expect(segment.d).toContain(' C ');
    }
  });

  it('starts at the first keyframe position', () => {
    const [first] = playerPathSegments(timeline, P1);
    const start = timeline.spans[P1]?.[0]?.p0;
    if (first === undefined || start === undefined) throw new Error('missing span');

    expect(first.d).toContain(`M ${start.x} ${start.y}`);
  });

  it('labels each segment with the kind the engine reports at its midpoint', () => {
    const segments = playerPathSegments(timeline, P1);
    const spans = timeline.spans[P1] ?? [];

    segments.forEach((segment, index) => {
      const span = spans[index];
      if (span === undefined) throw new Error('missing span');
      expect(['idle', 'move', 'dribble']).toContain(segment.kind);
    });
  });

  it('returns no segments for a player with no track', () => {
    expect(playerPathSegments(timeline, 'ghost' as typeof P1)).toEqual([]);
  });
});

describe('ballPathSegments', () => {
  it('splits the ball path where it changes between held and in flight', () => {
    const segments = ballPathSegments(timeline);

    expect(segments.length).toBeGreaterThan(1);
    const flags = segments.map((s) => s.inFlight);
    for (let i = 1; i < flags.length; i += 1) {
      expect(flags[i]).not.toBe(flags[i - 1]);
    }
  });

  it('produces finite coordinates only', () => {
    for (const segment of ballPathSegments(timeline)) {
      for (const n of segment.d.match(/-?\d+(\.\d+)?/g) ?? []) {
        expect(Number.isFinite(Number(n))).toBe(true);
      }
    }
  });
});

describe('polylineD', () => {
  it('is a moveto followed by linetos', () => {
    expect(
      polylineD([
        { x: 0, y: 0 },
        { x: 1, y: 2 },
      ]),
    ).toBe('M 0 0 L 1 2');
  });

  it('is empty for no points', () => {
    expect(polylineD([])).toBe('');
  });
});

describe('wavyPathD', () => {
  it('stays within the amplitude of the straight line it follows', () => {
    const points = Array.from({ length: 21 }, (_, i) => ({ x: i * 0.5, y: 5 }));
    const d = wavyPathD(points, 0.2, 1);
    const ys = (d.match(/(?<= )-?\d+(\.\d+)?(?= |$)/g) ?? []).map(Number).filter((_, i) => i % 2 === 1);

    for (const y of ys) {
      expect(Math.abs(y - 5)).toBeLessThanOrEqual(0.2 + 1e-9);
    }
  });

  it('is empty for fewer than two points', () => {
    expect(wavyPathD([{ x: 0, y: 0 }], 0.2, 1)).toBe('');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @phoopers/pwa test paths`
Expected: FAIL — `Failed to resolve import "./paths"`.

- [ ] **Step 3: Write the implementation**

`apps/pwa/src/play2d/geometry/paths.ts`:

```ts
import type { PlayerId, ResolvedTimeline, SpanKind, Vec2 } from '../../engine';
import { ballStateAt, spanKindAt, stateAt } from '../../engine';

export interface PathSegment {
  d: string;
  kind: SpanKind;
}

export interface BallSegment {
  d: string;
  inFlight: boolean;
}

/**
 * A player's path, one cubic per span. Player spans never have attached endpoints, so
 * their control points are always real positions and the drawn curve is exactly the one
 * the engine samples.
 */
export function playerPathSegments(timeline: ResolvedTimeline, playerId: PlayerId): PathSegment[] {
  const spans = timeline.spans[playerId] ?? [];

  return spans.map((span) => ({
    d:
      `M ${span.p0.x} ${span.p0.y} ` +
      `C ${span.p1.x} ${span.p1.y} ${span.p2.x} ${span.p2.y} ${span.p3.x} ${span.p3.y}`,
    kind: spanKindAt(timeline, playerId, (span.fromT + span.toT) / 2),
  }));
}

export const polylineD = (points: readonly Vec2[]): string => {
  const [first, ...rest] = points;
  if (first === undefined) {
    return '';
  }
  return `M ${first.x} ${first.y}` + rest.map((p) => ` L ${p.x} ${p.y}`).join('');
};

/**
 * The ball is SAMPLED rather than read from its spans: a span substitutes {0,0} for an
 * attached endpoint, so drawing from control points would mean reimplementing the
 * sampler's carrier resolution. Segments break wherever the ball changes between held
 * and in flight, so a pass can be drawn dashed and a dribble cannot.
 */
export function ballPathSegments(timeline: ResolvedTimeline, samplesPerSecond = 20): BallSegment[] {
  if (timeline.duration <= 0) {
    return [];
  }

  const count = Math.max(2, Math.ceil(timeline.duration * samplesPerSecond));
  const segments: BallSegment[] = [];
  let points: Vec2[] = [];
  let current: boolean | undefined;

  for (let i = 0; i <= count; i += 1) {
    const t = (timeline.duration * i) / count;
    const inFlight = ballStateAt(timeline, t) === 'inFlight';
    const position = stateAt(timeline, t).ball.position;

    if (current === undefined) {
      current = inFlight;
    }

    if (inFlight !== current) {
      points.push(position);
      segments.push({ d: polylineD(points), inFlight: current });
      points = [position];
      current = inFlight;
    }

    points.push(position);
  }

  if (points.length > 1 && current !== undefined) {
    segments.push({ d: polylineD(points), inFlight: current });
  }

  return segments;
}

/** A sine wiggle perpendicular to a sampled path, for the dribble symbol. */
export function wavyPathD(points: readonly Vec2[], amplitude: number, wavelength: number): string {
  if (points.length < 2 || wavelength <= 0) {
    return '';
  }

  let travelled = 0;
  const wavy: Vec2[] = [];

  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const previous = points[i - 1];
    const next = points[i + 1];
    if (point === undefined) {
      continue;
    }

    if (previous !== undefined) {
      travelled += Math.hypot(point.x - previous.x, point.y - previous.y);
    }

    const along = next ?? point;
    const back = previous ?? point;
    const dx = along.x - back.x;
    const dy = along.y - back.y;
    const length = Math.hypot(dx, dy);
    const offset = Math.sin((travelled / wavelength) * Math.PI * 2) * amplitude;

    wavy.push(length === 0 ? point : { x: point.x + (-dy / length) * offset, y: point.y + (dx / length) * offset });
  }

  return polylineD(wavy);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @phoopers/pwa test paths`
Expected: PASS — 9 passed.

- [ ] **Step 5: Commit**

```bash
pnpm format && pnpm lint && pnpm typecheck
git add apps/pwa/src/play2d
git commit -m "feat(play2d): build drawable path segments from a resolved timeline"
```

---

### Task 3: The sample play

Deliverable: a realistic 5-on-5 play that exercises every symbol, with a test proving it is valid.

**Files:**

- Create: `apps/pwa/src/samples/horns.ts`
- Test: `apps/pwa/src/samples/horns.test.ts`

**Interfaces:**

- Consumes: the model types and `validatePlay`, `resolveBranch`, `stateAt`, `spanKindAt`, `ballStateAt` from `../engine`.
- Produces: `hornsPlay: Play`, plus the exported ids `HORNS_ROOT`, `HORNS_SWITCH`, `HORNS_STEP_ENTRY`.

- [ ] **Step 1: Write the failing test**

`apps/pwa/src/samples/horns.test.ts`. These assertions are what make the sample worth having — they pin that it genuinely covers every symbol.

```ts
import { describe, expect, it } from 'vitest';
import { ballStateAt, duration, resolveBranch, spanKindAt, validatePlay } from '../engine';
import { HORNS_ROOT, HORNS_SWITCH, hornsPlay } from './horns';

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

  it('has a branch forking from a named step', () => {
    const branch = hornsPlay.branches.find((b) => b.id === HORNS_SWITCH);

    expect(branch?.parentId).toBe(HORNS_ROOT);
    expect(branch?.forkStepId).not.toBeNull();
  });

  it('contains at least one screen', () => {
    const screens = hornsPlay.branches.flatMap((b) => b.screens);

    expect(screens.length).toBeGreaterThan(0);
  });

  it('contains a dribble and a pass', () => {
    const timeline = resolveBranch(hornsPlay, HORNS_ROOT);
    const samples = Array.from({ length: 101 }, (_, i) => (duration(timeline) * i) / 100);

    const kinds = new Set(samples.flatMap((t) => hornsPlay.players.map((p) => spanKindAt(timeline, p.id, t))));
    const ballStates = new Set(samples.map((t) => ballStateAt(timeline, t)));

    expect(kinds.has('dribble')).toBe(true);
    expect(kinds.has('move')).toBe(true);
    expect(ballStates.has('held')).toBe(true);
    expect(ballStates.has('inFlight')).toBe(true);
  });

  it('ends with the ball free, which is the shot', () => {
    const timeline = resolveBranch(hornsPlay, HORNS_ROOT);

    expect(ballStateAt(timeline, duration(timeline))).toBe('inFlight');
  });

  it('resolves both branches without issue', () => {
    for (const branchId of [HORNS_ROOT, HORNS_SWITCH]) {
      expect(duration(resolveBranch(hornsPlay, branchId))).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @phoopers/pwa test horns`
Expected: FAIL — `Failed to resolve import './horns'`.

- [ ] **Step 3: Author the sample play**

`apps/pwa/src/samples/horns.ts`. A horns set on a FIBA floor: the point guard (1) dribbles over half-way, both bigs (4 and 5) set high screens, 1 passes to 2 in the corner, 2 drives and shoots. The `switch` branch diverges after the entry pass.

Coordinates are court metres with the origin at a corner: `x` runs 0→28 along the length, `y` runs 0→15 across. The offense attacks the basket at `x ≈ 26.4`. Keep every position inside `0 ≤ x ≤ 28` and `0 ≤ y ≤ 15`, and keep defenders a plausible 1–2 m from the player they guard.

Write it with these ids and this shape:

```ts
import type { BranchId, Play, PlayerId, PlayId, ScreenId, StepId } from '../engine';

const O1 = 'o1' as PlayerId;
const O2 = 'o2' as PlayerId;
const O3 = 'o3' as PlayerId;
const O4 = 'o4' as PlayerId;
const O5 = 'o5' as PlayerId;
const X1 = 'x1' as PlayerId;
const X2 = 'x2' as PlayerId;
const X3 = 'x3' as PlayerId;
const X4 = 'x4' as PlayerId;
const X5 = 'x5' as PlayerId;

export const HORNS_ROOT = 'horns-root' as BranchId;
export const HORNS_SWITCH = 'horns-switch' as BranchId;
export const HORNS_STEP_ENTRY = 'horns-step-entry' as StepId;
export const HORNS_STEP_SCREEN = 'horns-step-screen' as StepId;

export const hornsPlay: Play = {
  id: 'horns' as PlayId,
  name: 'Horns — high double screen',
  court: 'fiba',
  rootBranchId: HORNS_ROOT,
  players: [
    { id: O1, team: 'offense', label: '1' },
    { id: O2, team: 'offense', label: '2' },
    { id: O3, team: 'offense', label: '3' },
    { id: O4, team: 'offense', label: '4' },
    { id: O5, team: 'offense', label: '5' },
    { id: X1, team: 'defense', label: 'X1' },
    { id: X2, team: 'defense', label: 'X2' },
    { id: X3, team: 'defense', label: 'X3' },
    { id: X4, team: 'defense', label: 'X4' },
    { id: X5, team: 'defense', label: 'X5' },
  ],
  branches: [
    {
      id: HORNS_ROOT,
      parentId: null,
      forkStepId: null,
      name: 'Base',
      steps: [
        { id: HORNS_STEP_SCREEN, t: 2, name: 'Double high screen' },
        { id: HORNS_STEP_ENTRY, t: 4, name: 'Entry pass' },
      ],
      screens: [
        { id: 'screen-4' as ScreenId, t: 2, duration: 1.5, screenerId: O4, beneficiaryId: O1 },
        { id: 'screen-5' as ScreenId, t: 2, duration: 1.5, screenerId: O5, beneficiaryId: O1 },
      ],
      tracks: {
        // 1 dribbles up, uses the screens, then passes. The ball stays attached to O1
        // through t=4 (a dribble), flies to O2 between 4 and 5 (a pass), then O2 holds
        // it until the shot at t=7, after which it is free (the shot).
        [O1]: [
          { t: 0, position: { x: 16, y: 7.5 } },
          { t: 2, position: { x: 19, y: 7.5 } },
          { t: 4, position: { x: 21, y: 9.5 } },
          { t: 7, position: { x: 21.5, y: 10.5 } },
        ],
        ball: [
          { t: 0, attachedTo: O1 },
          { t: 4, attachedTo: O1 },
          { t: 5, attachedTo: O2 },
          { t: 7, attachedTo: O2 },
          { t: 8, position: { x: 26.4, y: 7.5 } },
        ],
        // …remaining tracks per the narrative above
      },
    },
    // …the HORNS_SWITCH branch, forking at HORNS_STEP_ENTRY (t = 4)
  ],
};
```

Fill in the remaining nine tracks and the `switch` branch yourself, following the narrative. The constraints the tests enforce:

- every player has a track in the root branch, with ascending times
- the ball is attached to the same player across at least one span (a dribble) and changes hands across at least one (a pass)
- the final ball keyframe has a `position` and no `attachedTo` (the shot)
- the `switch` branch sets `parentId: HORNS_ROOT` and `forkStepId: HORNS_STEP_ENTRY`, and every keyframe in it is at `t ≥ 4`
- `validatePlay` returns `[]`

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @phoopers/pwa test horns`
Expected: PASS — 7 passed. If `validatePlay` reports issues, read the `code` and fix the data — the engine is correct here, the sample is new.

- [ ] **Step 5: Commit**

```bash
pnpm format && pnpm lint && pnpm typecheck
git add apps/pwa/src/samples
git commit -m "feat(samples): add the horns sample play"
```

---

### Task 4: Playback context and clock

Deliverable: the context holding the timeline and clock, and the `requestAnimationFrame` loop that drives it.

**Files:**

- Create: `apps/pwa/src/play2d/usePlaybackContext.ts`
- Create: `apps/pwa/src/play2d/PlaybackContextProvider.tsx`
- Create: `apps/pwa/src/play2d/usePlaybackClock.ts`
- Test: `apps/pwa/src/play2d/usePlaybackClock.test.ts`

**Interfaces:**

- Consumes: `Play`, `BranchId`, `ResolvedTimeline`, `resolveBranch`, `duration` from `../engine`.
- Produces: `PlaybackContextValue`, `usePlaybackContext()`, `PlaybackContextProvider`, `usePlaybackClock(...)`.

`PlaybackContextValue`:

```ts
export interface PlaybackContextValue {
  timeline: ResolvedTimeline;
  branchId: BranchId;
  selectBranch: (branchId: BranchId) => void;
  currentTimeRef: React.RefObject<number>;
  displayTime: number;
  isPlaying: boolean;
  play: () => void;
  pause: () => void;
  seek: (t: number) => void;
  subscribe: (listener: (t: number) => void) => () => void;
}
```

`subscribe` is how the animated layer receives frames without React re-rendering: the clock calls every listener with the new time each frame.

- [ ] **Step 1: Write the failing test**

`apps/pwa/src/play2d/usePlaybackClock.test.ts`. Cases 4–6 are Review Focus items 1, 2 and 3.

```ts
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlaybackClock } from './usePlaybackClock';

let now = 0;
let frames: FrameRequestCallback[] = [];

beforeEach(() => {
  now = 0;
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames[id - 1] = () => undefined;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function advance(ms: number) {
  now += ms;
  const pending = frames;
  frames = [];
  act(() => {
    for (const frame of pending) {
      frame(now);
    }
  });
}

describe('usePlaybackClock', () => {
  it('does not advance while paused', () => {
    const { result } = renderHook(() => usePlaybackClock(10));

    advance(1000);

    expect(result.current.currentTimeRef.current).toBe(0);
  });

  it('advances in real time while playing', () => {
    const { result } = renderHook(() => usePlaybackClock(10));

    act(() => result.current.play());
    advance(0);
    advance(500);

    expect(result.current.currentTimeRef.current).toBeCloseTo(0.5, 2);
  });

  it('stops at the end rather than running past it', () => {
    const { result } = renderHook(() => usePlaybackClock(1));

    act(() => result.current.play());
    advance(0);
    advance(5000);

    expect(result.current.currentTimeRef.current).toBe(1);
    expect(result.current.isPlaying).toBe(false);
  });

  it('clamps the clock when the duration shrinks under it', () => {
    const { result, rerender } = renderHook(({ d }) => usePlaybackClock(d), {
      initialProps: { d: 10 },
    });

    act(() => result.current.seek(8));
    rerender({ d: 3 });

    expect(result.current.currentTimeRef.current).toBeLessThanOrEqual(3);
  });

  it('cancels its frame on unmount', () => {
    const cancel = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancel);
    const { result, unmount } = renderHook(() => usePlaybackClock(10));

    act(() => result.current.play());
    advance(0);
    unmount();

    expect(cancel).toHaveBeenCalled();
  });

  it('survives a zero duration without producing NaN', () => {
    const { result } = renderHook(() => usePlaybackClock(0));

    act(() => result.current.play());
    advance(100);

    expect(Number.isFinite(result.current.currentTimeRef.current)).toBe(true);
    expect(Number.isFinite(result.current.displayTime)).toBe(true);
  });

  it('notifies subscribers each frame and stops after unsubscribe', () => {
    const { result } = renderHook(() => usePlaybackClock(10));
    const listener = vi.fn();

    let unsubscribe = () => undefined as void;
    act(() => {
      unsubscribe = result.current.subscribe(listener);
      result.current.play();
    });
    advance(0);
    advance(100);
    const seen = listener.mock.calls.length;
    act(() => unsubscribe());
    advance(100);

    expect(seen).toBeGreaterThan(0);
    expect(listener.mock.calls.length).toBe(seen);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @phoopers/pwa test usePlaybackClock`
Expected: FAIL — `Failed to resolve import "./usePlaybackClock"`.

- [ ] **Step 3: Write the clock**

`apps/pwa/src/play2d/usePlaybackClock.ts`. `displayTime` updates only when the rounded tenth changes, so the slider re-renders at about 10 Hz while the DOM is written every frame.

```ts
import { useCallback, useEffect, useRef, useState } from 'react';

export interface PlaybackClock {
  currentTimeRef: React.RefObject<number>;
  displayTime: number;
  isPlaying: boolean;
  play: () => void;
  pause: () => void;
  seek: (t: number) => void;
  subscribe: (listener: (t: number) => void) => () => void;
}

const clamp = (t: number, duration: number): number => {
  if (!Number.isFinite(t)) {
    return 0;
  }
  return Math.min(Math.max(t, 0), Math.max(duration, 0));
};

export function usePlaybackClock(duration: number): PlaybackClock {
  const currentTimeRef = useRef(0);
  const [displayTime, setDisplayTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const listenersRef = useRef(new Set<(t: number) => void>());
  const frameRef = useRef<number | null>(null);
  const lastStampRef = useRef<number | null>(null);
  const durationRef = useRef(duration);

  const emit = useCallback((t: number) => {
    for (const listener of listenersRef.current) {
      listener(t);
    }
    setDisplayTime((previous) => (Math.round(previous * 10) === Math.round(t * 10) ? previous : t));
  }, []);

  const seek = useCallback(
    (t: number) => {
      const next = clamp(t, durationRef.current);
      currentTimeRef.current = next;
      emit(next);
    },
    [emit],
  );

  // The duration changes when the branch changes. A clock left past the new end would
  // render a frozen frame off the end of the timeline.
  useEffect(() => {
    durationRef.current = duration;
    if (currentTimeRef.current > duration) {
      currentTimeRef.current = clamp(currentTimeRef.current, duration);
      emit(currentTimeRef.current);
    }
  }, [duration, emit]);

  useEffect(() => {
    if (!isPlaying) {
      lastStampRef.current = null;
      return;
    }

    const step = (stamp: number) => {
      const last = lastStampRef.current;
      lastStampRef.current = stamp;

      if (last !== null) {
        const next = currentTimeRef.current + (stamp - last) / 1000;
        if (next >= durationRef.current) {
          currentTimeRef.current = durationRef.current;
          emit(currentTimeRef.current);
          setIsPlaying(false);
          return;
        }
        currentTimeRef.current = next;
        emit(next);
      }

      frameRef.current = requestAnimationFrame(step);
    };

    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [isPlaying, emit]);

  const play = useCallback(() => {
    if (currentTimeRef.current >= durationRef.current) {
      currentTimeRef.current = 0;
      emit(0);
    }
    setIsPlaying(true);
  }, [emit]);

  const pause = useCallback(() => setIsPlaying(false), []);

  const subscribe = useCallback((listener: (t: number) => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  return { currentTimeRef, displayTime, isPlaying, play, pause, seek, subscribe };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @phoopers/pwa test usePlaybackClock`
Expected: PASS — 7 passed.

- [ ] **Step 5: Write the context and provider**

`apps/pwa/src/play2d/usePlaybackContext.ts`:

```ts
import { createContext, useContext } from 'react';
import type { BranchId, ResolvedTimeline } from '../engine';

export interface PlaybackContextValue {
  timeline: ResolvedTimeline;
  branchId: BranchId;
  selectBranch: (branchId: BranchId) => void;
  currentTimeRef: React.RefObject<number>;
  displayTime: number;
  isPlaying: boolean;
  play: () => void;
  pause: () => void;
  seek: (t: number) => void;
  subscribe: (listener: (t: number) => void) => () => void;
}

export const PlaybackContext = createContext<PlaybackContextValue | null>(null);

export function usePlaybackContext(): PlaybackContextValue {
  const value = useContext(PlaybackContext);

  if (value === null) {
    throw new Error('usePlaybackContext must be used inside a PlaybackContextProvider');
  }

  return value;
}
```

`apps/pwa/src/play2d/PlaybackContextProvider.tsx`:

```tsx
import { useMemo, useState, type ReactNode } from 'react';
import type { BranchId, Play } from '../engine';
import { resolveBranch } from '../engine';
import { PlaybackContext } from './usePlaybackContext';
import { usePlaybackClock } from './usePlaybackClock';

interface Props {
  play: Play;
  children: ReactNode;
}

export function PlaybackContextProvider({ play, children }: Props) {
  const [branchId, setBranchId] = useState<BranchId>(play.rootBranchId);
  const timeline = useMemo(() => resolveBranch(play, branchId), [play, branchId]);
  const clock = usePlaybackClock(timeline.duration);

  const value = useMemo(
    () => ({ timeline, branchId, selectBranch: setBranchId, ...clock }),
    [timeline, branchId, clock],
  );

  return <PlaybackContext value={value}>{children}</PlaybackContext>;
}
```

- [ ] **Step 6: Verify the hook throws outside its provider**

Add to `apps/pwa/src/play2d/usePlaybackClock.test.ts`:

```ts
import { PlaybackContextProvider } from './PlaybackContextProvider';
import { usePlaybackContext } from './usePlaybackContext';
import { hornsPlay } from '../samples/horns';

describe('usePlaybackContext', () => {
  it('throws outside its provider', () => {
    expect(() => renderHook(() => usePlaybackContext())).toThrow(
      /usePlaybackContext.*PlaybackContextProvider/s,
    );
  });

  it('exposes the resolved timeline inside its provider', () => {
    const { result } = renderHook(() => usePlaybackContext(), {
      wrapper: ({ children }) => (
        <PlaybackContextProvider play={hornsPlay}>{children}</PlaybackContextProvider>
      ),
    });

    expect(result.current.timeline.duration).toBeGreaterThan(0);
  });
});
```

Rename the file to `usePlaybackClock.test.tsx` so the JSX wrapper compiles.

- [ ] **Step 7: Run the tests and commit**

Run: `pnpm --filter @phoopers/pwa test usePlaybackClock`
Expected: PASS — 9 passed.

```bash
pnpm format && pnpm lint && pnpm typecheck
git add apps/pwa/src/play2d
git commit -m "feat(play2d): add the playback context and animation clock"
```

---

### Task 5: Static rendering — court and paths

Deliverable: the SVG canvas drawing the court and every entity's path in its symbol.

**Files:**

- Create: `apps/pwa/src/play2d/Court.tsx`
- Create: `apps/pwa/src/play2d/PathLayer.tsx`
- Create: `apps/pwa/src/play2d/PlayCanvas.tsx`
- Test: `apps/pwa/src/play2d/PlayCanvas.test.tsx`

**Interfaces:**

- Consumes: `courtMarkings`, `fullCourtViewBox`, `halfCourtViewBox` (Task 1); `playerPathSegments`, `ballPathSegments`, `wavyPathD`, `polylineD` (Task 2); `usePlaybackContext` (Task 4).
- Produces: `Court`, `PathLayer`, `PlayCanvas` — `PlayCanvas` takes `{ halfCourt: boolean }`.

- [ ] **Step 1: Write the failing test**

`apps/pwa/src/play2d/PlayCanvas.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'vitest';
import { hornsPlay } from '../samples/horns';
import { PlaybackContextProvider } from './PlaybackContextProvider';
import { PlayCanvas } from './PlayCanvas';
import { fullCourtViewBox, halfCourtViewBox } from './geometry/court';

function renderCanvas(halfCourt = false) {
  return render(
    <MantineProvider>
      <PlaybackContextProvider play={hornsPlay}>
        <PlayCanvas halfCourt={halfCourt} />
      </PlaybackContextProvider>
    </MantineProvider>,
  );
}

describe('PlayCanvas', () => {
  it('uses the full-court viewBox by default', () => {
    renderCanvas();

    expect(screen.getByRole('img')).toHaveAttribute('viewBox', fullCourtViewBox('fiba'));
  });

  it('switches only the viewBox for half court', () => {
    const { container } = renderCanvas(false);
    const fullPaths = container.querySelectorAll('[data-testid="player-path"]').length;
    const { container: half } = renderCanvas(true);

    expect(screen.getAllByRole('img')[1]).toHaveAttribute('viewBox', halfCourtViewBox('fiba'));
    expect(half.querySelectorAll('[data-testid="player-path"]').length).toBe(fullPaths);
  });

  it('draws a path group per player with a track', () => {
    const { container } = renderCanvas();

    expect(container.querySelectorAll('[data-testid="player-path"]').length).toBeGreaterThan(0);
  });

  it('draws the ball path', () => {
    const { container } = renderCanvas();

    expect(container.querySelectorAll('[data-testid="ball-path"]').length).toBeGreaterThan(0);
  });

  it('renders court markings', () => {
    const { container } = renderCanvas();

    expect(container.querySelectorAll('[data-testid="court"] *').length).toBeGreaterThan(5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @phoopers/pwa test PlayCanvas`
Expected: FAIL — `Failed to resolve import "./PlayCanvas"`.

- [ ] **Step 3: Write `Court.tsx`**

```tsx
import { courtMarkings, type CourtType } from './geometry/court';

interface Props {
  court: CourtType;
}

export function Court({ court }: Props) {
  return (
    <g data-testid="court" fill="none" stroke="currentColor" strokeWidth={0.05} opacity={0.6}>
      {courtMarkings(court).map((marking, index) => {
        const key = `${marking.kind}-${index}`;
        switch (marking.kind) {
          case 'rect':
            return <rect key={key} x={marking.x} y={marking.y} width={marking.w} height={marking.h} />;
          case 'line':
            return <line key={key} x1={marking.x1} y1={marking.y1} x2={marking.x2} y2={marking.y2} />;
          case 'circle':
            return <circle key={key} cx={marking.cx} cy={marking.cy} r={marking.r} />;
          case 'path':
            return <path key={key} d={marking.d} />;
        }
      })}
    </g>
  );
}
```

- [ ] **Step 4: Write `PathLayer.tsx`**

A dribble is drawn by sampling the span's cubic into points and wiggling them; a move is the cubic itself; the ball's in-flight segments are dashed.

```tsx
import { usePlaybackContext } from './usePlaybackContext';
import { ballPathSegments, playerPathSegments } from './geometry/paths';

export function PathLayer() {
  const { timeline } = usePlaybackContext();

  return (
    <g fill="none" strokeWidth={0.08} strokeLinecap="round">
      {timeline.players.map((player) => (
        <g
          key={player.id}
          data-testid="player-path"
          stroke={player.team === 'offense' ? 'var(--mantine-color-blue-6)' : 'var(--mantine-color-red-6)'}
        >
          {playerPathSegments(timeline, player.id).map((segment, index) => (
            <path
              key={`${player.id}-${index}`}
              d={segment.d}
              strokeDasharray={segment.kind === 'idle' ? '0.1 0.2' : undefined}
              markerEnd="url(#arrowhead)"
            />
          ))}
        </g>
      ))}
      {ballPathSegments(timeline).map((segment, index) => (
        <path
          key={`ball-${index}`}
          data-testid="ball-path"
          d={segment.d}
          stroke="var(--mantine-color-orange-6)"
          strokeDasharray={segment.inFlight ? '0.3 0.2' : undefined}
        />
      ))}
    </g>
  );
}
```

- [ ] **Step 5: Write `PlayCanvas.tsx`**

```tsx
import { usePlaybackContext } from './usePlaybackContext';
import { Court } from './Court';
import { PathLayer } from './PathLayer';
import { fullCourtViewBox, halfCourtViewBox } from './geometry/court';

interface Props {
  halfCourt: boolean;
}

export function PlayCanvas({ halfCourt }: Props) {
  const { timeline } = usePlaybackContext();
  const court = timeline.court;

  return (
    <svg
      role="img"
      viewBox={halfCourt ? halfCourtViewBox(court) : fullCourtViewBox(court)}
      style={{ width: '100%', height: '100%' }}
    >
      <defs>
        <marker
          id="arrowhead"
          markerWidth={4}
          markerHeight={4}
          refX={3}
          refY={2}
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M 0 0 L 4 2 L 0 4 z" fill="context-stroke" />
        </marker>
      </defs>
      <Court court={court} />
      <PathLayer />
    </svg>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @phoopers/pwa test PlayCanvas`
Expected: PASS — 5 passed.

- [ ] **Step 7: Commit**

```bash
pnpm format && pnpm lint && pnpm typecheck
git add apps/pwa/src/play2d
git commit -m "feat(play2d): render the court and play paths"
```

---

### Task 6: Animated tokens

Deliverable: player and ball tokens that move every frame without React re-rendering.

**Files:**

- Create: `apps/pwa/src/play2d/TokenLayer.tsx`
- Modify: `apps/pwa/src/play2d/PlayCanvas.tsx` (add `<TokenLayer />` after `<PathLayer />`)
- Test: `apps/pwa/src/play2d/TokenLayer.test.tsx`

**Interfaces:**

- Consumes: `usePlaybackContext` (Task 4), `stateAt` from `../engine`.
- Produces: `TokenLayer`.

- [ ] **Step 1: Write the failing test**

`apps/pwa/src/play2d/TokenLayer.test.tsx`. The last case is Review Focus item 5.

```tsx
import { render, screen, act } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'vitest';
import { hornsPlay } from '../samples/horns';
import { PlaybackContextProvider } from './PlaybackContextProvider';
import { TokenLayer } from './TokenLayer';

function renderTokens() {
  return render(
    <MantineProvider>
      <PlaybackContextProvider play={hornsPlay}>
        <svg>
          <TokenLayer />
        </svg>
      </PlaybackContextProvider>
    </MantineProvider>,
  );
}

describe('TokenLayer', () => {
  it('renders one token per player in the timeline', () => {
    const { container } = renderTokens();

    expect(container.querySelectorAll('[data-testid="token"]').length).toBe(hornsPlay.players.length);
  });

  it('labels offense with their number and defense with an X label', () => {
    renderTokens();

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('X1')).toBeInTheDocument();
  });

  it('positions every token at a finite court coordinate on mount', () => {
    const { container } = renderTokens();

    for (const token of container.querySelectorAll('[data-testid="token"]')) {
      const transform = token.getAttribute('transform') ?? '';
      const numbers = (transform.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      expect(numbers).toHaveLength(2);
      for (const n of numbers) {
        expect(Number.isFinite(n)).toBe(true);
      }
    }
  });

  it('renders a ball token', () => {
    const { container } = renderTokens();

    expect(container.querySelector('[data-testid="ball-token"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @phoopers/pwa test TokenLayer`
Expected: FAIL — `Failed to resolve import "./TokenLayer"`.

- [ ] **Step 3: Write the implementation**

`apps/pwa/src/play2d/TokenLayer.tsx`. The layer subscribes to the clock and writes `transform` directly; it never re-renders during playback.

```tsx
import { useEffect, useRef } from 'react';
import { stateAt } from '../engine';
import type { PlayerId } from '../engine';
import { usePlaybackContext } from './usePlaybackContext';

export function TokenLayer() {
  const { timeline, subscribe, currentTimeRef } = usePlaybackContext();
  const playerRefs = useRef(new Map<PlayerId, SVGGElement>());
  const ballRef = useRef<SVGGElement | null>(null);

  useEffect(() => {
    const paint = (t: number) => {
      const state = stateAt(timeline, t);

      for (const player of timeline.players) {
        const node = playerRefs.current.get(player.id);
        const position = state.players[player.id]?.position;
        if (node !== undefined && position !== undefined) {
          node.setAttribute('transform', `translate(${position.x} ${position.y})`);
        }
      }

      if (ballRef.current !== null) {
        ballRef.current.setAttribute('transform', `translate(${state.ball.position.x} ${state.ball.position.y})`);
      }
    };

    paint(currentTimeRef.current);
    return subscribe(paint);
  }, [timeline, subscribe, currentTimeRef]);

  return (
    <g>
      {timeline.players.map((player) => (
        <g
          key={player.id}
          data-testid="token"
          ref={(node) => {
            if (node === null) {
              playerRefs.current.delete(player.id);
            } else {
              playerRefs.current.set(player.id, node);
            }
          }}
          transform="translate(0 0)"
        >
          {player.team === 'offense' ? (
            <circle r={0.45} fill="var(--mantine-color-blue-6)" />
          ) : (
            <g stroke="var(--mantine-color-red-6)" strokeWidth={0.12}>
              <line x1={-0.35} y1={-0.35} x2={0.35} y2={0.35} />
              <line x1={-0.35} y1={0.35} x2={0.35} y2={-0.35} />
            </g>
          )}
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={0.5}
            fill={player.team === 'offense' ? 'white' : 'var(--mantine-color-red-6)'}
            dy={player.team === 'offense' ? 0 : -0.7}
          >
            {player.label}
          </text>
        </g>
      ))}
      <g data-testid="ball-token" ref={ballRef} transform="translate(0 0)">
        <circle r={0.18} fill="var(--mantine-color-orange-6)" />
      </g>
    </g>
  );
}
```

- [ ] **Step 4: Add it to the canvas**

In `apps/pwa/src/play2d/PlayCanvas.tsx`, import `TokenLayer` and render `<TokenLayer />` immediately after `<PathLayer />`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @phoopers/pwa test TokenLayer PlayCanvas`
Expected: PASS — 9 passed.

- [ ] **Step 6: Commit**

```bash
pnpm format && pnpm lint && pnpm typecheck
git add apps/pwa/src/play2d
git commit -m "feat(play2d): animate player and ball tokens from the clock"
```

---

### Task 7: The transport

Deliverable: play/pause, a scrubber with snapping step ticks, prev/next-step buttons, and a time readout.

**Files:**

- Create: `apps/pwa/src/play2d/PlaybackTransport.tsx`
- Test: `apps/pwa/src/play2d/PlaybackTransport.test.tsx`

**Interfaces:**

- Consumes: `usePlaybackContext` (Task 4), `stepsOf` from `../engine`.
- Produces: `PlaybackTransport`, and the exported helpers `snapToStep(t, steps, threshold)`, `adjacentStep(t, steps, direction)`.

- [ ] **Step 1: Write the failing test**

`apps/pwa/src/play2d/PlaybackTransport.test.tsx`. Cases 1–4 pin the snapping helpers, including Review Focus items 3 and 4.

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'vitest';
import type { Step, StepId } from '../engine';
import { hornsPlay } from '../samples/horns';
import { PlaybackContextProvider } from './PlaybackContextProvider';
import { PlaybackTransport, adjacentStep, snapToStep } from './PlaybackTransport';

const steps: Step[] = [
  { id: 's1' as StepId, t: 2, name: 'Screen' },
  { id: 's2' as StepId, t: 4, name: 'Entry' },
];

describe('snapToStep', () => {
  it('snaps to a step inside the threshold', () => {
    expect(snapToStep(2.1, steps, 0.25)).toBe(2);
  });

  it('leaves a time outside the threshold alone', () => {
    expect(snapToStep(3, steps, 0.25)).toBe(3);
  });

  it('is deterministic when two steps share a time', () => {
    const duplicates: Step[] = [
      { id: 'a' as StepId, t: 4, name: 'A' },
      { id: 'b' as StepId, t: 4, name: 'B' },
    ];

    expect(snapToStep(4.05, duplicates, 0.25)).toBe(4);
  });

  it('returns the time unchanged when there are no steps', () => {
    expect(snapToStep(1.5, [], 0.25)).toBe(1.5);
  });
});

describe('adjacentStep', () => {
  it('finds the next step strictly after the current time', () => {
    expect(adjacentStep(2, steps, 1)).toBe(4);
  });

  it('finds the previous step strictly before the current time', () => {
    expect(adjacentStep(4, steps, -1)).toBe(2);
  });

  it('returns undefined past the ends', () => {
    expect(adjacentStep(4, steps, 1)).toBeUndefined();
    expect(adjacentStep(2, steps, -1)).toBeUndefined();
  });
});

function renderTransport() {
  return render(
    <MantineProvider>
      <PlaybackContextProvider play={hornsPlay}>
        <PlaybackTransport />
      </PlaybackContextProvider>
    </MantineProvider>,
  );
}

describe('PlaybackTransport', () => {
  it('toggles between play and pause', async () => {
    const user = userEvent.setup();
    renderTransport();

    const button = screen.getByRole('button', { name: 'Play' });
    await user.click(button);

    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('renders a labelled tick per step', () => {
    renderTransport();

    expect(screen.getByText('Entry pass')).toBeInTheDocument();
  });

  it('jumps to the next step', async () => {
    const user = userEvent.setup();
    renderTransport();

    await user.click(screen.getByRole('button', { name: 'Next step' }));

    expect(screen.getByTestId('current-time')).toHaveTextContent('2.0');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @phoopers/pwa test PlaybackTransport`
Expected: FAIL — `Failed to resolve import "./PlaybackTransport"`.

- [ ] **Step 3: Write the implementation**

`apps/pwa/src/play2d/PlaybackTransport.tsx`:

```tsx
import { ActionIcon, Group, Slider, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { Step } from '../engine';
import { usePlaybackContext } from './usePlaybackContext';

const SNAP_THRESHOLD = 0.25;

export function snapToStep(t: number, steps: readonly Step[], threshold: number): number {
  let best: number | undefined;
  let bestDistance = Infinity;

  for (const step of steps) {
    const distance = Math.abs(step.t - t);
    if (distance <= threshold && distance < bestDistance) {
      best = step.t;
      bestDistance = distance;
    }
  }

  return best ?? t;
}

export function adjacentStep(t: number, steps: readonly Step[], direction: 1 | -1): number | undefined {
  const times = steps
    .map((step) => step.t)
    .filter((time) => (direction === 1 ? time > t + 1e-6 : time < t - 1e-6))
    .sort((a, b) => (direction === 1 ? a - b : b - a));

  return times[0];
}

export function PlaybackTransport() {
  const { t: translate } = useTranslation();
  const { timeline, displayTime, isPlaying, play, pause, seek } = usePlaybackContext();

  const jump = (direction: 1 | -1) => {
    const next = adjacentStep(displayTime, timeline.steps, direction);
    if (next !== undefined) {
      pause();
      seek(next);
    }
  };

  return (
    <Group gap="sm" wrap="nowrap" align="center">
      <ActionIcon
        onClick={() => jump(-1)}
        aria-label={translate('play.transport.previousStep', 'Previous step')}
        variant="default"
      >
        {'<'}
      </ActionIcon>
      <ActionIcon
        onClick={isPlaying ? pause : play}
        aria-label={isPlaying ? translate('play.transport.pause', 'Pause') : translate('play.transport.play', 'Play')}
        variant="filled"
      >
        {isPlaying ? '||' : '>'}
      </ActionIcon>
      <ActionIcon
        onClick={() => jump(1)}
        aria-label={translate('play.transport.nextStep', 'Next step')}
        variant="default"
      >
        {'>'}
      </ActionIcon>
      <Text size="sm" data-testid="current-time" w={48}>
        {displayTime.toFixed(1)}
      </Text>
      <Slider
        flex={1}
        min={0}
        max={Math.max(timeline.duration, 0.001)}
        step={0.01}
        value={displayTime}
        onChange={(value) => {
          pause();
          seek(snapToStep(value, timeline.steps, SNAP_THRESHOLD));
        }}
        marks={timeline.steps.map((step) => ({ value: step.t, label: step.name }))}
        label={(value) => value.toFixed(1)}
      />
    </Group>
  );
}
```

`max` is floored at `0.001` so a zero-duration play cannot give the slider an empty range.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @phoopers/pwa test PlaybackTransport`
Expected: PASS — 10 passed.

- [ ] **Step 5: Commit**

```bash
pnpm format && pnpm lint && pnpm typecheck
git add apps/pwa/src/play2d
git commit -m "feat(play2d): add the playback transport with step snapping"
```

---

### Task 8: Branch tree

Deliverable: a tree of the play's branches; selecting one switches the timeline.

**Files:**

- Create: `apps/pwa/src/play2d/BranchTree.tsx`
- Test: `apps/pwa/src/play2d/BranchTree.test.tsx`

**Interfaces:**

- Consumes: `usePlaybackContext` (Task 4), `Play` from `../engine`.
- Produces: `BranchTree` — takes `{ play: Play }`; and `branchTreeData(play)` returning Mantine `TreeNodeData[]`.

- [ ] **Step 1: Write the failing test**

`apps/pwa/src/play2d/BranchTree.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'vitest';
import { hornsPlay } from '../samples/horns';
import { PlaybackContextProvider } from './PlaybackContextProvider';
import { BranchTree, branchTreeData } from './BranchTree';

describe('branchTreeData', () => {
  it('nests a child branch under its parent', () => {
    const [root] = branchTreeData(hornsPlay);

    expect(root?.value).toBe(hornsPlay.rootBranchId);
    expect(root?.children?.length).toBeGreaterThan(0);
  });

  it('labels each node with the branch name', () => {
    const [root] = branchTreeData(hornsPlay);

    expect(root?.label).toBe('Base');
  });
});

describe('BranchTree', () => {
  it('renders every branch name', () => {
    render(
      <MantineProvider>
        <PlaybackContextProvider play={hornsPlay}>
          <BranchTree play={hornsPlay} />
        </PlaybackContextProvider>
      </MantineProvider>,
    );

    for (const branch of hornsPlay.branches) {
      expect(screen.getByText(branch.name)).toBeInTheDocument();
    }
  });

  it('switches the timeline when a branch is selected', async () => {
    const user = userEvent.setup();
    const child = hornsPlay.branches.find((b) => b.parentId !== null);
    if (child === undefined) throw new Error('fixture needs a child branch');

    render(
      <MantineProvider>
        <PlaybackContextProvider play={hornsPlay}>
          <BranchTree play={hornsPlay} />
          <span data-testid="branch-id">
            <BranchIdProbe />
          </span>
        </PlaybackContextProvider>
      </MantineProvider>,
    );

    await user.click(screen.getByText(child.name));

    expect(screen.getByTestId('branch-id')).toHaveTextContent(child.id);
  });
});

function BranchIdProbe() {
  const { branchId } = usePlaybackContext();
  return <>{branchId}</>;
}
```

Add `import { usePlaybackContext } from './usePlaybackContext';` to the test's imports.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @phoopers/pwa test BranchTree`
Expected: FAIL — `Failed to resolve import "./BranchTree"`.

- [ ] **Step 3: Write the implementation**

`apps/pwa/src/play2d/BranchTree.tsx`:

```tsx
import { Tree, type TreeNodeData } from '@mantine/core';
import type { BranchId, Play } from '../engine';
import { usePlaybackContext } from './usePlaybackContext';

export function branchTreeData(play: Play): TreeNodeData[] {
  const childrenOf = (parentId: BranchId | null): TreeNodeData[] =>
    play.branches
      .filter((branch) => branch.parentId === parentId)
      .map((branch) => ({
        value: branch.id,
        label: branch.name,
        children: childrenOf(branch.id),
      }));

  return childrenOf(null);
}

interface Props {
  play: Play;
}

export function BranchTree({ play }: Props) {
  const { selectBranch } = usePlaybackContext();

  return (
    <Tree
      data={branchTreeData(play)}
      renderNode={({ node, elementProps }) => (
        <div
          {...elementProps}
          onClick={(event) => {
            elementProps.onClick?.(event);
            selectBranch(node.value as BranchId);
          }}
        >
          {node.label}
        </div>
      )}
    />
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @phoopers/pwa test BranchTree`
Expected: PASS — 4 passed.

- [ ] **Step 5: Commit**

```bash
pnpm format && pnpm lint && pnpm typecheck
git add apps/pwa/src/play2d
git commit -m "feat(play2d): add branch tree navigation"
```

---

### Task 9: Assembly, court toggle and i18n

Deliverable: the whole view wired into the app, with its strings extracted.

**Files:**

- Create: `apps/pwa/src/play2d/PlayView.tsx`
- Create: `apps/pwa/src/i18n/locales/en/play.json`
- Create: `apps/pwa/src/i18n/locales/fr/play.json`
- Modify: `apps/pwa/src/i18n/resources.ts`
- Modify: `apps/pwa/src/App.tsx`
- Modify: `apps/pwa/src/App.test.tsx`
- Test: `apps/pwa/src/play2d/PlayView.test.tsx`

**Interfaces:**

- Consumes: everything from Tasks 1–8.
- Produces: `PlayView` — takes `{ play: Play }`.

- [ ] **Step 1: Write the failing test**

`apps/pwa/src/play2d/PlayView.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'vitest';
import { hornsPlay } from '../samples/horns';
import { PlayView } from './PlayView';
import { fullCourtViewBox, halfCourtViewBox } from './geometry/court';

function renderView() {
  return render(
    <MantineProvider>
      <PlayView play={hornsPlay} />
    </MantineProvider>,
  );
}

describe('PlayView', () => {
  it('renders the court, the transport and the branch tree together', () => {
    renderView();

    expect(screen.getByRole('img')).toHaveAttribute('viewBox', fullCourtViewBox('fiba'));
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByText('Base')).toBeInTheDocument();
  });

  it('toggles between full and half court', async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole('radio', { name: 'Half court' }));

    expect(screen.getByRole('img')).toHaveAttribute('viewBox', halfCourtViewBox('fiba'));
  });

  it('shows the play name', () => {
    renderView();

    expect(screen.getByText(hornsPlay.name)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @phoopers/pwa test PlayView`
Expected: FAIL — `Failed to resolve import "./PlayView"`.

- [ ] **Step 3: Write `PlayView.tsx`**

```tsx
import { useState } from 'react';
import { Group, Paper, SegmentedControl, Stack, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { Play } from '../engine';
import { PlaybackContextProvider } from './PlaybackContextProvider';
import { PlayCanvas } from './PlayCanvas';
import { PlaybackTransport } from './PlaybackTransport';
import { BranchTree } from './BranchTree';

interface Props {
  play: Play;
}

export function PlayView({ play }: Props) {
  const { t } = useTranslation();
  const [halfCourt, setHalfCourt] = useState(false);

  return (
    <PlaybackContextProvider play={play}>
      <Stack h="100%" p="md" gap="sm">
        <Group justify="space-between" align="center">
          <Title order={2}>{play.name}</Title>
          <SegmentedControl
            value={halfCourt ? 'half' : 'full'}
            onChange={(value) => setHalfCourt(value === 'half')}
            data={[
              { value: 'full', label: t('play.court.full', 'Full court') },
              { value: 'half', label: t('play.court.half', 'Half court') },
            ]}
          />
        </Group>
        <Group align="stretch" flex={1} wrap="nowrap" gap="md">
          <Paper flex={1} withBorder p="xs">
            <PlayCanvas halfCourt={halfCourt} />
          </Paper>
          <Paper w={220} withBorder p="xs">
            <Title order={6} mb="xs">
              {t('play.branches.title', 'Branches')}
            </Title>
            <BranchTree play={play} />
          </Paper>
        </Group>
        <PlaybackTransport />
      </Stack>
    </PlaybackContextProvider>
  );
}
```

- [ ] **Step 4: Wire it into the app**

Replace the body of `apps/pwa/src/App.tsx` so it renders the view:

```tsx
import { hornsPlay } from './samples/horns';
import { PlayView } from './play2d/PlayView';

export default function App() {
  return <PlayView play={hornsPlay} />;
}
```

Then update `apps/pwa/src/App.test.tsx` to assert on the view rather than the old placeholder heading: replace its body with an assertion that `screen.getByText(hornsPlay.name)` is in the document, wrapping `App` in `MantineProvider` as before.

- [ ] **Step 5: Register the `play` namespace**

In `apps/pwa/src/i18n/resources.ts`, import both `play.json` files and add `play` to each locale's object, exactly as `common` is handled.

- [ ] **Step 6: Extract and translate**

```bash
pnpm --filter @phoopers/pwa extract:i18n
```

Fill in the French values in `apps/pwa/src/i18n/locales/fr/play.json` — `Full court` → `Terrain complet`, `Half court` → `Demi-terrain`, `Branches` → `Variantes`, `Play` → `Lecture`, `Pause` → `Pause`, `Previous step` → `Étape précédente`, `Next step` → `Étape suivante`.

- [ ] **Step 7: Verify the whole gate**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm i18n:check && pnpm test && pnpm build
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add apps/pwa/src
git commit -m "feat(play2d): assemble the play view and wire it into the app"
```

---

## Verification

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm i18n:check`, `pnpm test` and `pnpm build` all pass.
- [ ] Every acceptance criterion in the spec has a passing test, except criterion 8 which is the command above.
- [ ] `pnpm --filter @phoopers/pwa dev` shows the horns play; pressing play animates it, scrubbing works, prev/next lands on steps, the branch tree switches timelines, and the court toggle changes only the viewBox.
- [ ] No file under `play2d/` imports from `engine/` except via `engine/index.ts`.

## Follow-ups (not in this plan)

- Printing and vector export.
- Side-by-side branch comparison.
- Playwright coverage, including the animation loop.
- 1c: the editor.
