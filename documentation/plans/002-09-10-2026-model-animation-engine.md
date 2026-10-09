# Phase 1a — Model and Animation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the headless engine that answers "where is every player and the ball at time `t`, on a given branch?"

**Architecture:** Seven focused modules under `apps/pwa/src/engine/`, built bottom-up: vectors → easing → curves → branch resolution → sampling → validation → public surface. `resolveBranch` does all expensive preparation once (concatenating ancestor tracks, deriving handles, building arc-length tables); `stateAt` reads a flat prepared timeline and stays cheap enough to call every frame.

**Tech Stack:** TypeScript 6 (strict, `noUncheckedIndexedAccess`), Vitest 5. No runtime dependencies — all maths is written in-repo.

**Spec:** [documentation/specs/001-09-10-2026-model-animation-engine.md](../specs/001-09-10-2026-model-animation-engine.md)

## Global Constraints

- **No framework imports under `engine/`.** No `react`, `react-dom`, `@mantine/*`, `react-i18next`, and no DOM globals (`window`, `document`). `eslint.config.js` already enforces this for `apps/pwa/src/engine/**`.
- **No external maths dependency.** Vector arithmetic, de Casteljau evaluation, Catmull-Rom tangents, the arc-length table and the timing-curve solve are written in-repo.
- **All stored types are plain JSON-compatible data.** No classes, no `Float32Array`, no `Map`/`Set` in anything reachable from `Play`.
- **`noUncheckedIndexedAccess` is on.** `array[i]` and `record[key]` are typed `T | undefined`. Narrow explicitly — never use `!`.
- **`verbatimModuleSyntax` is on.** Type-only imports must be written `import type { … } from '…'`.
- **Engine strings are not user-facing** and are never routed through `t()`. `Issue.code` is the stable identifier; 1c renders its own translated copy. `i18next/no-literal-string` is disabled for `engine/` for this reason.
- **`pnpm lint` runs with `--max-warnings 0`.** A warning fails the gate exactly like an error.
- **LUT sample count is 32** (33 cumulative entries including the leading zero).
- **Easing presets:** `linear` → (0, 0, 1, 1), `easeIn` → (0.42, 0, 1, 1), `easeOut` → (0, 0, 0.58, 1), `easeInOut` → (0.42, 0, 0.58, 1).
- **Court dimensions:** FIBA 28 × 15 m, NBA 28.65 × 15.24 m. Positions are metres, origin at a corner.
- Conventional commits, no co-author lines. One commit per task.

## Review Focus

Failure modes the spec implies but whose happy paths no task would otherwise exercise. Each has its test placed in the task that owns the code.

1. **Exact boundary instants.** Sampling precisely at a keyframe time, at a fork time, or at `duration` must be well-defined — the resolution windows are `t1 ≤ t < t2`, so the instant of the fork belongs to the child. An off-by-one here shows as a one-frame flicker nobody can reproduce. → Tasks 4 and 5.
2. **Degenerate tracks.** A track with exactly one keyframe has no spans at all; a track absent from `tracks` entirely has none either. Both must sample to a sensible position rather than crashing or returning `undefined` through `noUncheckedIndexedAccess`. → Task 5.
3. **Zero-duration spans.** Two keyframes sharing a time make `p = (t − k0.t) / (k1.t − k0.t)` a division by zero, which propagates `NaN` into every position downstream and renders as players vanishing. Validation rejects it, but the sampler must not produce `NaN` if one reaches it. → Tasks 3 and 5.
4. **Ball attached to an unresolvable player.** `attachedTo` naming a player with no track, or one absent from `players`, must not crash the sampler. → Task 5.
5. **Timing curves that are valid but extreme.** `x1`/`x2` are constrained to `[0, 1]`, but e.g. (1, 0, 0, 1) is still a legal, nearly-vertical curve; the `x(u) = p` solve must terminate and stay monotonic rather than spinning or overshooting. → Task 2.

---

## File Structure

```
apps/pwa/src/engine/
  types.ts              # every data type; no logic
  vec2.ts               # vector arithmetic
  easing.ts             # preset resolution and the timing-curve solve
  curve.ts              # de Casteljau, Catmull-Rom tangents, arc-length LUT
  resolve.ts            # resolveBranch -> ResolvedTimeline
  sample.ts             # stateAt and the derived queries
  validate.ts           # validatePlay
  index.ts              # the public surface
  __fixtures__/play.ts  # shared test fixtures
```

Each file has one responsibility and is testable without its neighbours above it. `curve.ts` is deliberately the only place curve maths lives, so swapping in `bezier-js` for 1c touches one file.

---

### Task 1: Types and vector arithmetic

Deliverable: every engine type exists and the vector helpers are tested. The ESLint dependency rule already guards `engine/` — it landed with the lint configuration before this plan started, so this task only confirms it bites.

**Files:**

- Create: `apps/pwa/src/engine/types.ts`
- Create: `apps/pwa/src/engine/vec2.ts`
- Test: `apps/pwa/src/engine/vec2.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: all types in the spec, plus `add`, `sub`, `scale`, `lerp`, `distance`, `equals` from `vec2.ts`.

- [ ] **Step 1: Write the failing test**

`apps/pwa/src/engine/vec2.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { add, distance, equals, lerp, scale, sub } from './vec2';

describe('vec2', () => {
  it('adds and subtracts componentwise', () => {
    expect(add({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 });
    expect(sub({ x: 3, y: 4 }, { x: 1, y: 2 })).toEqual({ x: 2, y: 2 });
  });

  it('scales by a factor', () => {
    expect(scale({ x: 2, y: -3 }, 2.5)).toEqual({ x: 5, y: -7.5 });
  });

  it('lerps between endpoints', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 20 };

    expect(lerp(a, b, 0)).toEqual(a);
    expect(lerp(a, b, 1)).toEqual(b);
    expect(lerp(a, b, 0.25)).toEqual({ x: 2.5, y: 5 });
  });

  it('measures distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('compares within a tolerance', () => {
    expect(equals({ x: 1, y: 1 }, { x: 1 + 1e-12, y: 1 })).toBe(true);
    expect(equals({ x: 1, y: 1 }, { x: 1.5, y: 1 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @phoopers/pwa test vec2`
Expected: FAIL — `Failed to resolve import "./vec2"`.

- [ ] **Step 3: Write the types**

`apps/pwa/src/engine/types.ts` — copy the spec's Types section verbatim, plus the engine-side types:

```ts
export type Vec2 = { x: number; y: number };

export type PlayId = string & { readonly __brand: 'PlayId' };
export type PlayerId = string & { readonly __brand: 'PlayerId' };
export type BranchId = string & { readonly __brand: 'BranchId' };
export type StepId = string & { readonly __brand: 'StepId' };
export type ScreenId = string & { readonly __brand: 'ScreenId' };

export type EntityId = PlayerId | 'ball';

export type EasingPreset = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
export type CubicBezierEasing = { x1: number; y1: number; x2: number; y2: number };
export type Easing = EasingPreset | CubicBezierEasing;

export interface Player {
  id: PlayerId;
  team: 'offense' | 'defense';
  label: string;
}

export interface Keyframe {
  t: number;
  position?: Vec2;
  attachedTo?: PlayerId;
  handleOut?: Vec2;
  handleIn?: Vec2;
  ease?: Easing;
}

export interface Step {
  id: StepId;
  t: number;
  name: string;
}

export interface ScreenEvent {
  id: ScreenId;
  t: number;
  duration: number;
  screenerId: PlayerId;
  beneficiaryId: PlayerId;
}

export interface Branch {
  id: BranchId;
  parentId: BranchId | null;
  forkStepId: StepId | null;
  name: string;
  tracks: Record<EntityId, Keyframe[]>;
  steps: Step[];
  screens: ScreenEvent[];
}

export interface Play {
  id: PlayId;
  name: string;
  court: 'fiba' | 'nba';
  players: Player[];
  branches: Branch[];
  rootBranchId: BranchId;
}

export interface PreparedSpan {
  fromT: number;
  toT: number;
  p0: Vec2;
  p1: Vec2;
  p2: Vec2;
  p3: Vec2;
  ease: CubicBezierEasing;
  lut: number[];
  length: number;
  attachedTo: PlayerId | null;
}

export interface ResolvedTimeline {
  branchId: BranchId;
  players: Player[];
  court: Play['court'];
  spans: Record<EntityId, PreparedSpan[]>;
  anchors: Record<EntityId, Keyframe[]>;
  steps: Step[];
  screens: ScreenEvent[];
  duration: number;
}

export interface PlayState {
  t: number;
  players: Record<PlayerId, { position: Vec2; moving: boolean }>;
  ball: { position: Vec2; attachedTo: PlayerId | null };
  activeScreens: ScreenEvent[];
}

export const COURT_DIMENSIONS = {
  fiba: { length: 28, width: 15 },
  nba: { length: 28.65, width: 15.24 },
} as const;
```

`anchors` holds the flattened keyframe list per entity after ancestor concatenation. Sampling needs it for single-keyframe tracks, which produce no spans at all.

- [ ] **Step 4: Write the vector helpers**

`apps/pwa/src/engine/vec2.ts`:

```ts
import type { Vec2 } from './types';

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });

export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });

export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });

export const lerp = (a: Vec2, b: Vec2, k: number): Vec2 => ({
  x: a.x + (b.x - a.x) * k,
  y: a.y + (b.y - a.y) * k,
});

export const distance = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.y - a.y);

export const equals = (a: Vec2, b: Vec2, epsilon = 1e-9): boolean =>
  Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @phoopers/pwa test vec2`
Expected: PASS — 5 passed.

- [ ] **Step 6: Verify the existing dependency rule rejects a framework import**

```bash
printf "import { useState } from 'react';\nexport const x = useState;\n" > apps/pwa/src/engine/rule-probe.ts
pnpm exec eslint apps/pwa/src/engine/rule-probe.ts
```

Expected: FAIL — `'react' import is restricted from being used … rendering-independent`.

Then remove it:

```bash
rm apps/pwa/src/engine/rule-probe.ts
```

- [ ] **Step 7: Run the full gate and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add apps/pwa/src/engine
git commit -m "feat(engine): add model types and vector helpers"
```

---

### Task 2: Easing

Deliverable: preset resolution and a timing-curve solve that terminates on every legal easing.

**Files:**

- Create: `apps/pwa/src/engine/easing.ts`
- Test: `apps/pwa/src/engine/easing.test.ts`

**Interfaces:**

- Consumes: `Easing`, `EasingPreset`, `CubicBezierEasing` from `./types`.
- Produces: `EASING_PRESETS: Record<EasingPreset, CubicBezierEasing>`, `resolveEasing(ease: Easing | undefined): CubicBezierEasing`, `applyEasing(ease: CubicBezierEasing, p: number): number`.

- [ ] **Step 1: Write the failing test**

`apps/pwa/src/engine/easing.test.ts`. The last case is Review Focus #5.

```ts
import { describe, expect, it } from 'vitest';
import { applyEasing, EASING_PRESETS, resolveEasing } from './easing';

describe('resolveEasing', () => {
  it('defaults to linear when absent', () => {
    expect(resolveEasing(undefined)).toEqual({ x1: 0, y1: 0, x2: 1, y2: 1 });
  });

  it('resolves every preset to its CSS control points', () => {
    expect(EASING_PRESETS.linear).toEqual({ x1: 0, y1: 0, x2: 1, y2: 1 });
    expect(EASING_PRESETS.easeIn).toEqual({ x1: 0.42, y1: 0, x2: 1, y2: 1 });
    expect(EASING_PRESETS.easeOut).toEqual({ x1: 0, y1: 0, x2: 0.58, y2: 1 });
    expect(EASING_PRESETS.easeInOut).toEqual({ x1: 0.42, y1: 0, x2: 0.58, y2: 1 });
  });

  it('passes an explicit curve through unchanged', () => {
    const custom = { x1: 0.1, y1: 0.9, x2: 0.3, y2: 1 };

    expect(resolveEasing(custom)).toEqual(custom);
  });
});

describe('applyEasing', () => {
  const linear = EASING_PRESETS.linear;

  it('pins the endpoints', () => {
    expect(applyEasing(linear, 0)).toBe(0);
    expect(applyEasing(linear, 1)).toBe(1);
  });

  it('is the identity for linear', () => {
    for (const p of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(applyEasing(linear, p)).toBeCloseTo(p, 6);
    }
  });

  it('front-loads progress for easeOut', () => {
    expect(applyEasing(EASING_PRESETS.easeOut, 0.5)).toBeGreaterThan(0.5);
  });

  it('back-loads progress for easeIn', () => {
    expect(applyEasing(EASING_PRESETS.easeIn, 0.5)).toBeLessThan(0.5);
  });

  it('clamps input outside [0, 1]', () => {
    expect(applyEasing(linear, -0.5)).toBe(0);
    expect(applyEasing(linear, 1.5)).toBe(1);
  });

  it('terminates and stays monotonic for extreme but legal curves', () => {
    const extreme = { x1: 1, y1: 0, x2: 0, y2: 1 };
    const samples = [0, 0.2, 0.4, 0.6, 0.8, 1].map((p) => applyEasing(extreme, p));

    for (const value of samples) {
      expect(Number.isFinite(value)).toBe(true);
    }
    for (let i = 1; i < samples.length; i += 1) {
      const previous = samples[i - 1];
      const current = samples[i];
      if (previous === undefined || current === undefined) throw new Error('missing sample');
      expect(current).toBeGreaterThanOrEqual(previous - 1e-9);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @phoopers/pwa test easing`
Expected: FAIL — `Failed to resolve import "./easing"`.

- [ ] **Step 3: Write the implementation**

`apps/pwa/src/engine/easing.ts`. The solve is bisection rather than Newton-Raphson: it cannot diverge on a near-vertical curve, and 32 iterations give ample precision for a timing value.

```ts
import type { CubicBezierEasing, Easing, EasingPreset } from './types';

export const EASING_PRESETS: Record<EasingPreset, CubicBezierEasing> = {
  linear: { x1: 0, y1: 0, x2: 1, y2: 1 },
  easeIn: { x1: 0.42, y1: 0, x2: 1, y2: 1 },
  easeOut: { x1: 0, y1: 0, x2: 0.58, y2: 1 },
  easeInOut: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
};

export function resolveEasing(ease: Easing | undefined): CubicBezierEasing {
  if (ease === undefined) return EASING_PRESETS.linear;
  if (typeof ease === 'string') return EASING_PRESETS[ease];
  return ease;
}

/** Cubic Bezier with endpoints pinned at 0 and 1, evaluated on one axis. */
function axisAt(c1: number, c2: number, u: number): number {
  const v = 1 - u;
  return 3 * v * v * u * c1 + 3 * v * u * u * c2 + u * u * u;
}

const SOLVE_ITERATIONS = 32;

export function applyEasing(ease: CubicBezierEasing, p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;

  let low = 0;
  let high = 1;
  let u = p;

  for (let i = 0; i < SOLVE_ITERATIONS; i += 1) {
    const x = axisAt(ease.x1, ease.x2, u);
    if (x < p) {
      low = u;
    } else {
      high = u;
    }
    u = (low + high) / 2;
  }

  return axisAt(ease.y1, ease.y2, u);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @phoopers/pwa test easing`
Expected: PASS — 9 passed.

- [ ] **Step 5: Commit**

```bash
pnpm lint && pnpm typecheck
git add apps/pwa/src/engine
git commit -m "feat(engine): add easing presets and the timing-curve solve"
```

---

### Task 3: Curve maths

Deliverable: cubic evaluation, derived tangents, and the arc-length table with its inverse.

**Files:**

- Create: `apps/pwa/src/engine/curve.ts`
- Test: `apps/pwa/src/engine/curve.test.ts`

**Interfaces:**

- Consumes: `Vec2` from `./types`; `add`, `sub`, `scale`, `distance` from `./vec2`.
- Produces: `LUT_SAMPLES = 32`, `pointOnCubic(p0, p1, p2, p3, u): Vec2`, `derivedTangents(prev, from, to, next): { handleOut: Vec2; handleIn: Vec2 }`, `buildLut(p0, p1, p2, p3): { lut: number[]; length: number }`, `lutToParam(lut, s): number`.

- [ ] **Step 1: Write the failing test**

`apps/pwa/src/engine/curve.test.ts`. The zero-length case is Review Focus #3.

```ts
import { describe, expect, it } from 'vitest';
import { buildLut, derivedTangents, LUT_SAMPLES, lutToParam, pointOnCubic } from './curve';
import { distance } from './vec2';

const A = { x: 0, y: 0 };
const B = { x: 10, y: 0 };

describe('pointOnCubic', () => {
  it('returns the endpoints at u = 0 and u = 1', () => {
    expect(pointOnCubic(A, { x: 2, y: 5 }, { x: 8, y: 5 }, B, 0)).toEqual(A);
    expect(pointOnCubic(A, { x: 2, y: 5 }, { x: 8, y: 5 }, B, 1)).toEqual(B);
  });

  it('is the straight-line midpoint when handles are colinear', () => {
    const point = pointOnCubic(A, { x: 10 / 3, y: 0 }, { x: 20 / 3, y: 0 }, B, 0.5);

    expect(point.x).toBeCloseTo(5, 9);
    expect(point.y).toBeCloseTo(0, 9);
  });

  it('bulges toward the handles', () => {
    const point = pointOnCubic(A, { x: 0, y: 10 }, { x: 10, y: 10 }, B, 0.5);

    expect(point.y).toBeGreaterThan(0);
  });
});

describe('derivedTangents', () => {
  it('uses one-sided differences at the ends', () => {
    const { handleOut, handleIn } = derivedTangents(null, A, B, null);

    expect(handleOut).toEqual({ x: 10 / 6, y: 0 });
    expect(handleIn).toEqual({ x: 10 - 10 / 6, y: 0 });
  });

  it('uses neighbours when present', () => {
    const prev = { x: -6, y: 0 };
    const next = { x: 16, y: 0 };
    const { handleOut, handleIn } = derivedTangents(prev, A, B, next);

    expect(handleOut).toEqual({ x: (10 - -6) / 6, y: 0 });
    expect(handleIn).toEqual({ x: 10 - (16 - 0) / 6, y: 0 });
  });
});

describe('buildLut', () => {
  it('produces LUT_SAMPLES + 1 entries from 0 to 1', () => {
    const { lut } = buildLut(A, { x: 2, y: 0 }, { x: 8, y: 0 }, B);

    expect(lut).toHaveLength(LUT_SAMPLES + 1);
    expect(lut[0]).toBe(0);
    expect(lut[LUT_SAMPLES]).toBe(1);
  });

  it('measures a straight span as its chord length', () => {
    const { length } = buildLut(A, { x: 10 / 3, y: 0 }, { x: 20 / 3, y: 0 }, B);

    expect(length).toBeCloseTo(10, 3);
  });

  it('reports zero length for a degenerate span', () => {
    const { lut, length } = buildLut(A, A, A, A);

    expect(length).toBe(0);
    expect(lut.every((value) => Number.isFinite(value))).toBe(true);
  });
});

describe('lutToParam', () => {
  it('maps distance fraction to curve parameter on a straight span', () => {
    const { lut } = buildLut(A, { x: 10 / 3, y: 0 }, { x: 20 / 3, y: 0 }, B);

    expect(lutToParam(lut, 0)).toBeCloseTo(0, 6);
    expect(lutToParam(lut, 1)).toBeCloseTo(1, 6);
    expect(lutToParam(lut, 0.5)).toBeCloseTo(0.5, 2);
  });

  it('gives constant speed on a curve with asymmetric handles', () => {
    const p1 = { x: 0, y: 9 };
    const p2 = { x: 9.5, y: 0.2 };
    const { lut } = buildLut(A, p1, p2, B);

    const at = (s: number) => pointOnCubic(A, p1, p2, B, lutToParam(lut, s));
    const first = distance(at(0), at(0.25));
    const second = distance(at(0.25), at(0.5));
    const third = distance(at(0.5), at(0.75));

    expect(second / first).toBeCloseTo(1, 1);
    expect(third / first).toBeCloseTo(1, 1);
  });

  it('returns 0 for a degenerate span rather than NaN', () => {
    const { lut } = buildLut(A, A, A, A);

    expect(lutToParam(lut, 0.5)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @phoopers/pwa test curve`
Expected: FAIL — `Failed to resolve import "./curve"`.

- [ ] **Step 3: Write the implementation**

`apps/pwa/src/engine/curve.ts`:

```ts
import type { Vec2 } from './types';
import { add, distance, scale, sub } from './vec2';

export const LUT_SAMPLES = 32;

export function pointOnCubic(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, u: number): Vec2 {
  const v = 1 - u;
  const a = v * v * v;
  const b = 3 * v * v * u;
  const c = 3 * v * u * u;
  const d = u * u * u;

  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/**
 * Catmull-Rom tangents for the span `from` -> `to`, using one-sided differences
 * when a neighbour is missing.
 */
export function derivedTangents(
  prev: Vec2 | null,
  from: Vec2,
  to: Vec2,
  next: Vec2 | null,
): { handleOut: Vec2; handleIn: Vec2 } {
  const before = prev ?? from;
  const after = next ?? to;

  return {
    handleOut: add(from, scale(sub(to, before), 1 / 6)),
    handleIn: sub(to, scale(sub(after, from), 1 / 6)),
  };
}

export function buildLut(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2): { lut: number[]; length: number } {
  const cumulative: number[] = [0];
  let total = 0;
  let previous = p0;

  for (let i = 1; i <= LUT_SAMPLES; i += 1) {
    const point = pointOnCubic(p0, p1, p2, p3, i / LUT_SAMPLES);
    total += distance(previous, point);
    cumulative.push(total);
    previous = point;
  }

  if (total === 0) {
    return { lut: cumulative.map(() => 0), length: 0 };
  }

  return { lut: cumulative.map((value) => value / total), length: total };
}

/** Inverts the table: distance fraction `s` -> curve parameter `u`. */
export function lutToParam(lut: readonly number[], s: number): number {
  if (s <= 0) return 0;
  if (s >= 1) return 1;

  const last = lut[lut.length - 1];
  if (last === undefined || last === 0) return 0;

  let low = 0;
  let high = lut.length - 1;

  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    const value = lut[mid];
    if (value === undefined) return 0;
    if (value <= s) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const lowValue = lut[low];
  const highValue = lut[high];
  if (lowValue === undefined || highValue === undefined) return 0;

  const segment = highValue - lowValue;
  const withinSegment = segment === 0 ? 0 : (s - lowValue) / segment;

  return (low + withinSegment) / (lut.length - 1);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @phoopers/pwa test curve`
Expected: PASS — 10 passed.

- [ ] **Step 5: Commit**

```bash
pnpm lint && pnpm typecheck
git add apps/pwa/src/engine
git commit -m "feat(engine): add cubic evaluation, tangents and arc-length tables"
```

---

### Task 4: Fixtures and branch resolution

Deliverable: `resolveBranch` flattens an ancestor chain into prepared spans, with the continuity rule honoured.

**Files:**

- Create: `apps/pwa/src/engine/__fixtures__/play.ts`
- Create: `apps/pwa/src/engine/resolve.ts`
- Test: `apps/pwa/src/engine/resolve.test.ts`

**Interfaces:**

- Consumes: types from `./types`; `resolveEasing` from `./easing`; `buildLut`, `derivedTangents`, `lutToParam`, `pointOnCubic` from `./curve`.
- Produces: `resolveBranch(play: Play, branchId: BranchId): ResolvedTimeline`; fixtures `fixturePlay`, `P1`, `P2`, `ROOT`, `SWITCH`, `STEP_ENTRY`.

- [ ] **Step 1: Write the fixtures**

`apps/pwa/src/engine/__fixtures__/play.ts`. The ball is attached to P1 through `t = 1` (a dribble), changes hands between 1 and 2 (a pass), then stays with P2. The `switch` branch forks at `t = 2` and its P1 track deliberately starts at `t = 3`, so the continuity rule has something to do.

```ts
import type { BranchId, Play, PlayerId, PlayId, ScreenId, StepId } from '../types';

export const P1 = 'p1' as PlayerId;
export const P2 = 'p2' as PlayerId;
export const ROOT = 'root' as BranchId;
export const SWITCH = 'switch' as BranchId;
export const STEP_ENTRY = 'step-entry' as StepId;
export const SCREEN_1 = 'screen-1' as ScreenId;

export const fixturePlay: Play = {
  id: 'play-1' as PlayId,
  name: 'Horns entry',
  court: 'fiba',
  players: [
    { id: P1, team: 'offense', label: '1' },
    { id: P2, team: 'offense', label: '2' },
  ],
  rootBranchId: ROOT,
  branches: [
    {
      id: ROOT,
      parentId: null,
      forkStepId: null,
      name: 'Base',
      steps: [{ id: STEP_ENTRY, t: 2, name: 'Entry pass' }],
      screens: [{ id: SCREEN_1, t: 2, duration: 1, screenerId: P2, beneficiaryId: P1 }],
      tracks: {
        [P1]: [
          { t: 0, position: { x: 4, y: 7.5 } },
          { t: 2, position: { x: 8, y: 5 } },
          { t: 4, position: { x: 12, y: 5 } },
        ],
        [P2]: [
          { t: 0, position: { x: 4, y: 3 } },
          { t: 2, position: { x: 7, y: 3 } },
          { t: 4, position: { x: 10, y: 6 } },
        ],
        ball: [
          { t: 0, attachedTo: P1 },
          { t: 1, attachedTo: P1 },
          { t: 2, attachedTo: P2 },
          { t: 4, attachedTo: P2 },
        ],
      },
    },
    {
      id: SWITCH,
      parentId: ROOT,
      forkStepId: STEP_ENTRY,
      name: 'Defence switches',
      steps: [],
      screens: [],
      tracks: {
        [P1]: [{ t: 3, position: { x: 6, y: 9 } }],
        [P2]: [
          { t: 2, position: { x: 7, y: 3 } },
          { t: 4, position: { x: 4, y: 4 } },
        ],
        ball: [
          { t: 2, attachedTo: P2 },
          { t: 4, attachedTo: P2 },
        ],
      },
    },
  ],
};
```

- [ ] **Step 2: Write the failing test**

`apps/pwa/src/engine/resolve.test.ts`. The last two cases are Review Focus #1 and the continuity rule.

```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @phoopers/pwa test resolve`
Expected: FAIL — `Failed to resolve import "./resolve"`.

- [ ] **Step 4: Write the implementation**

`apps/pwa/src/engine/resolve.ts`:

```ts
import type {
  Branch,
  BranchId,
  EntityId,
  Keyframe,
  Play,
  PlayerId,
  PreparedSpan,
  ResolvedTimeline,
  ScreenEvent,
  Step,
  Vec2,
} from './types';
import { buildLut, derivedTangents, lutToParam, pointOnCubic } from './curve';
import { resolveEasing } from './easing';

function chainOf(play: Play, branchId: BranchId): Branch[] {
  const byId = new Map(play.branches.map((branch) => [branch.id, branch]));
  const chain: Branch[] = [];
  const seen = new Set<BranchId>();

  let current = byId.get(branchId);
  if (current === undefined) {
    throw new Error(`unknown branch: ${branchId}`);
  }

  while (current !== undefined) {
    if (seen.has(current.id)) {
      throw new Error(`cycle in branch parents at: ${current.id}`);
    }
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }

  return chain;
}

function forkTimeOf(chain: readonly Branch[], index: number): number {
  const branch = chain[index];
  if (branch === undefined || branch.forkStepId === null) return 0;

  for (const ancestor of chain.slice(0, index)) {
    const step = ancestor.steps.find((candidate) => candidate.id === branch.forkStepId);
    if (step !== undefined) return step.t;
  }

  throw new Error(`fork step not found in ancestors: ${branch.forkStepId}`);
}

function positionOfAnchors(anchors: readonly Keyframe[], t: number): Vec2 | undefined {
  if (anchors.length === 0) return undefined;

  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (first === undefined || last === undefined) return undefined;
  if (t <= first.t) return first.position;
  if (t >= last.t) return last.position;

  for (let i = 0; i < anchors.length - 1; i += 1) {
    const from = anchors[i];
    const to = anchors[i + 1];
    if (from === undefined || to === undefined) continue;
    if (t >= from.t && t <= to.t && from.position !== undefined && to.position !== undefined) {
      const span = to.t - from.t;
      const p = span === 0 ? 0 : (t - from.t) / span;
      const previous = anchors[i - 1]?.position ?? null;
      const next = anchors[i + 2]?.position ?? null;
      const derived = derivedTangents(previous, from.position, to.position, next);
      const p1 = from.handleOut ?? derived.handleOut;
      const p2 = to.handleIn ?? derived.handleIn;
      const { lut } = buildLut(from.position, p1, p2, to.position);
      return pointOnCubic(from.position, p1, p2, to.position, lutToParam(lut, p));
    }
  }

  return last.position;
}

function entityIds(chain: readonly Branch[]): EntityId[] {
  const ids = new Set<EntityId>();
  for (const branch of chain) {
    for (const id of Object.keys(branch.tracks)) {
      ids.add(id as EntityId);
    }
  }
  return [...ids];
}

function flattenTrack(chain: readonly Branch[], entity: EntityId): Keyframe[] {
  const anchors: Keyframe[] = [];

  for (let i = 0; i < chain.length; i += 1) {
    const branch = chain[i];
    if (branch === undefined) continue;

    const from = forkTimeOf(chain, i);
    const until = i + 1 < chain.length ? forkTimeOf(chain, i + 1) : Number.POSITIVE_INFINITY;
    const track = branch.tracks[entity] ?? [];
    const window = track.filter((k) => k.t >= from && k.t < until);

    // Continuity: a child whose first keyframe is later than its fork inherits the
    // parent's state at the fork instant, so it enters without teleporting.
    if (i > 0 && from < until) {
      const hasFork = window.some((k) => k.t === from);
      if (!hasFork) {
        const parentState = anchors.length > 0 ? positionOfAnchors(anchors, from) : undefined;
        const inherited = anchors[anchors.length - 1];
        anchors.push({
          t: from,
          ...(parentState !== undefined ? { position: parentState } : {}),
          ...(inherited?.attachedTo !== undefined ? { attachedTo: inherited.attachedTo } : {}),
        });
      }
    }

    anchors.push(...window);
  }

  return anchors.sort((a, b) => a.t - b.t);
}

function prepareSpans(anchors: readonly Keyframe[]): PreparedSpan[] {
  const spans: PreparedSpan[] = [];

  for (let i = 0; i < anchors.length - 1; i += 1) {
    const from = anchors[i];
    const to = anchors[i + 1];
    if (from === undefined || to === undefined) continue;

    const fromPosition = from.position ?? { x: 0, y: 0 };
    const toPosition = to.position ?? { x: 0, y: 0 };
    const derived = derivedTangents(
      anchors[i - 1]?.position ?? null,
      fromPosition,
      toPosition,
      anchors[i + 2]?.position ?? null,
    );
    const p1 = from.handleOut ?? derived.handleOut;
    const p2 = to.handleIn ?? derived.handleIn;
    const { lut, length } = buildLut(fromPosition, p1, p2, toPosition);
    const attachedTo: PlayerId | null =
      from.attachedTo !== undefined && from.attachedTo === to.attachedTo ? from.attachedTo : null;

    spans.push({
      fromT: from.t,
      toT: to.t,
      p0: fromPosition,
      p1,
      p2,
      p3: toPosition,
      ease: resolveEasing(from.ease),
      lut,
      length,
      attachedTo,
    });
  }

  return spans;
}

export function resolveBranch(play: Play, branchId: BranchId): ResolvedTimeline {
  const chain = chainOf(play, branchId);
  const anchors: Record<EntityId, Keyframe[]> = {};
  const spans: Record<EntityId, PreparedSpan[]> = {};

  for (const entity of entityIds(chain)) {
    const track = flattenTrack(chain, entity);
    anchors[entity] = track;
    spans[entity] = prepareSpans(track);
  }

  const steps: Step[] = [];
  const screens: ScreenEvent[] = [];

  for (let i = 0; i < chain.length; i += 1) {
    const branch = chain[i];
    if (branch === undefined) continue;
    const from = forkTimeOf(chain, i);
    const until = i + 1 < chain.length ? forkTimeOf(chain, i + 1) : Number.POSITIVE_INFINITY;
    steps.push(...branch.steps.filter((s) => s.t >= from && s.t < until));
    screens.push(...branch.screens.filter((s) => s.t >= from && s.t < until));
  }

  const duration = Object.values(anchors).reduce((longest, track) => {
    const last = track[track.length - 1];
    return last === undefined ? longest : Math.max(longest, last.t);
  }, 0);

  return {
    branchId,
    players: play.players,
    court: play.court,
    anchors,
    spans,
    steps: steps.sort((a, b) => a.t - b.t),
    screens: screens.sort((a, b) => a.t - b.t),
    duration,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @phoopers/pwa test resolve`
Expected: PASS — 7 passed.

- [ ] **Step 6: Commit**

```bash
pnpm lint && pnpm typecheck
git add apps/pwa/src/engine
git commit -m "feat(engine): resolve a branch into a flat prepared timeline"
```

---

### Task 5: Sampling and derived queries

Deliverable: `stateAt` plus the derived queries, safe on degenerate input.

**Files:**

- Create: `apps/pwa/src/engine/sample.ts`
- Test: `apps/pwa/src/engine/sample.test.ts`

**Interfaces:**

- Consumes: `ResolvedTimeline`, `PlayState`, `PreparedSpan` from `./types`; `applyEasing` from `./easing`; `lutToParam`, `pointOnCubic` from `./curve`; `resolveBranch` from `./resolve`.
- Produces: `stateAt(timeline, t): PlayState`, `spanKindAt(timeline, playerId, t): 'idle' | 'move' | 'dribble'`, `ballStateAt(timeline, t): 'held' | 'inFlight'`, `duration(timeline): number`, `stepsOf(timeline): Step[]`.

- [ ] **Step 1: Write the failing test**

`apps/pwa/src/engine/sample.test.ts`. Cases 6–9 are Review Focus #1, #2, #3 and #4.

```ts
import { describe, expect, it } from 'vitest';
import { fixturePlay, P1, P2, ROOT } from './__fixtures__/play';
import { resolveBranch } from './resolve';
import { ballStateAt, duration, spanKindAt, stateAt, stepsOf } from './sample';
import type { ResolvedTimeline } from './types';
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
    expect(spanKindAt(timeline, P2, 2.5)).toBe('move');
  });

  it('exposes duration and steps', () => {
    expect(duration(timeline)).toBe(4);
    expect(stepsOf(timeline).map((s) => s.name)).toEqual(['Entry pass']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @phoopers/pwa test sample`
Expected: FAIL — `Failed to resolve import "./sample"`.

- [ ] **Step 3: Write the implementation**

`apps/pwa/src/engine/sample.ts`:

```ts
import type { EntityId, PlayerId, PlayState, PreparedSpan, ResolvedTimeline, Step, Vec2 } from './types';
import { lutToParam, pointOnCubic } from './curve';
import { applyEasing } from './easing';

const ORIGIN: Vec2 = { x: 0, y: 0 };

function spanAt(spans: readonly PreparedSpan[], t: number): PreparedSpan | undefined {
  for (const span of spans) {
    if (t >= span.fromT && t < span.toT) return span;
  }
  const last = spans[spans.length - 1];
  return last !== undefined && t >= last.toT ? last : undefined;
}

function pointInSpan(span: PreparedSpan, t: number): Vec2 {
  const length = span.toT - span.fromT;
  if (length <= 0) return span.p3;

  const p = Math.min(1, Math.max(0, (t - span.fromT) / length));
  const s = applyEasing(span.ease, p);

  return pointOnCubic(span.p0, span.p1, span.p2, span.p3, lutToParam(span.lut, s));
}

function positionOf(timeline: ResolvedTimeline, entity: EntityId, t: number): Vec2 {
  const spans = timeline.spans[entity] ?? [];
  const anchors = timeline.anchors[entity] ?? [];

  const first = anchors[0];
  if (first !== undefined && t <= first.t) return first.position ?? ORIGIN;

  const span = spanAt(spans, t);
  if (span !== undefined) return pointInSpan(span, t);

  // No spans at all: a single-keyframe or empty track.
  const last = anchors[anchors.length - 1];
  return last?.position ?? first?.position ?? ORIGIN;
}

function attachmentAt(timeline: ResolvedTimeline, t: number): PlayerId | null {
  const span = spanAt(timeline.spans.ball ?? [], t);
  return span?.attachedTo ?? null;
}

function isMoving(timeline: ResolvedTimeline, entity: EntityId, t: number): boolean {
  const span = spanAt(timeline.spans[entity] ?? [], t);
  if (span === undefined || t >= span.toT) return false;
  return span.length > 0;
}

export function stateAt(timeline: ResolvedTimeline, t: number): PlayState {
  const players: PlayState['players'] = {};

  for (const entity of Object.keys(timeline.anchors)) {
    if (entity === 'ball') continue;
    const id = entity as PlayerId;
    players[id] = { position: positionOf(timeline, id, t), moving: isMoving(timeline, id, t) };
  }

  const attachedTo = attachmentAt(timeline, t);
  const ballPosition =
    attachedTo === null
      ? positionOf(timeline, 'ball', t)
      : (players[attachedTo]?.position ?? positionOf(timeline, 'ball', t));

  return {
    t,
    players,
    ball: { position: ballPosition, attachedTo },
    activeScreens: timeline.screens.filter((s) => t >= s.t && t <= s.t + s.duration),
  };
}

export function ballStateAt(timeline: ResolvedTimeline, t: number): 'held' | 'inFlight' {
  return attachmentAt(timeline, t) === null ? 'inFlight' : 'held';
}

export function spanKindAt(timeline: ResolvedTimeline, playerId: PlayerId, t: number): 'idle' | 'move' | 'dribble' {
  if (!isMoving(timeline, playerId, t)) return 'idle';
  return attachmentAt(timeline, t) === playerId ? 'dribble' : 'move';
}

export const duration = (timeline: ResolvedTimeline): number => timeline.duration;

export const stepsOf = (timeline: ResolvedTimeline): Step[] => timeline.steps;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @phoopers/pwa test sample`
Expected: PASS — 13 passed.

- [ ] **Step 5: Commit**

```bash
pnpm lint && pnpm typecheck
git add apps/pwa/src/engine
git commit -m "feat(engine): sample a timeline and derive movement kinds"
```

---

### Task 6: Validation

Deliverable: `validatePlay` reporting every issue code, never throwing.

**Files:**

- Create: `apps/pwa/src/engine/validate.ts`
- Test: `apps/pwa/src/engine/validate.test.ts`

**Interfaces:**

- Consumes: types from `./types`; `fixturePlay` from `./__fixtures__/play`.
- Produces: `IssueCode`, `Issue`, `validatePlay(play: Play): Issue[]`.

- [ ] **Step 1: Add the issue types**

Append to `apps/pwa/src/engine/types.ts`:

```ts
export type IssueCode =
  | 'fork-step-not-in-ancestors'
  | 'keyframe-before-fork'
  | 'ball-keyframe-missing-position'
  | 'ball-keyframe-position-and-attachment'
  | 'player-keyframe-has-attachment'
  | 'keyframe-times-not-monotonic'
  | 'duplicate-id'
  | 'unknown-player-reference'
  | 'branch-cycle'
  | 'non-root-branch-without-fork'
  | 'root-branch-with-parent'
  | 'easing-out-of-range';

export interface Issue {
  code: IssueCode;
  message: string;
  entityId?: string;
}
```

- [ ] **Step 2: Write the failing test**

`apps/pwa/src/engine/validate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fixturePlay, P1, P2, ROOT, STEP_ENTRY, SWITCH } from './__fixtures__/play';
import { validatePlay } from './validate';
import type { Branch, BranchId, Play, PlayerId, StepId } from './types';

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
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @phoopers/pwa test validate`
Expected: FAIL — `Failed to resolve import "./validate"`.

- [ ] **Step 4: Write the implementation**

`apps/pwa/src/engine/validate.ts`:

```ts
import type { Branch, Issue, IssueCode, Keyframe, Play, PlayerId } from './types';

function issue(code: IssueCode, message: string, entityId?: string): Issue {
  return entityId === undefined ? { code, message } : { code, message, entityId };
}

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) repeated.add(id);
    seen.add(id);
  }
  return [...repeated];
}

function ancestorChain(play: Play, branch: Branch): Branch[] | 'cycle' {
  const byId = new Map(play.branches.map((b) => [b.id, b]));
  const chain: Branch[] = [];
  const seen = new Set<string>();
  let current: Branch | undefined = branch;

  while (current !== undefined) {
    if (seen.has(current.id)) return 'cycle';
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }

  return chain;
}

function forkTime(chain: readonly Branch[], branch: Branch): number | undefined {
  if (branch.forkStepId === null) return 0;
  for (const ancestor of chain) {
    if (ancestor.id === branch.id) break;
    const step = ancestor.steps.find((s) => s.id === branch.forkStepId);
    if (step !== undefined) return step.t;
  }
  return undefined;
}

function checkKeyframes(
  entity: string,
  keyframes: readonly Keyframe[],
  knownPlayers: ReadonlySet<string>,
  branchId: string,
  fork: number | undefined,
  issues: Issue[],
): void {
  const isBall = entity === 'ball';
  let previous = Number.NEGATIVE_INFINITY;

  for (const keyframe of keyframes) {
    if (keyframe.t <= previous) {
      issues.push(issue('keyframe-times-not-monotonic', `${entity} keyframes are not ascending`, branchId));
    }
    previous = keyframe.t;

    if (fork !== undefined && keyframe.t < fork) {
      issues.push(issue('keyframe-before-fork', `${entity} has a keyframe before the fork`, branchId));
    }

    if (isBall) {
      if (keyframe.position === undefined && keyframe.attachedTo === undefined) {
        issues.push(issue('ball-keyframe-missing-position', 'ball keyframe has no state', branchId));
      }
      if (keyframe.position !== undefined && keyframe.attachedTo !== undefined) {
        issues.push(issue('ball-keyframe-position-and-attachment', 'ball keyframe has both', branchId));
      }
      if (keyframe.attachedTo !== undefined && !knownPlayers.has(keyframe.attachedTo)) {
        issues.push(issue('unknown-player-reference', `unknown player ${keyframe.attachedTo}`, branchId));
      }
    } else if (keyframe.attachedTo !== undefined) {
      issues.push(issue('player-keyframe-has-attachment', `${entity} keyframe has attachedTo`, branchId));
    }

    const ease = keyframe.ease;
    if (ease !== undefined && typeof ease !== 'string') {
      if (ease.x1 < 0 || ease.x1 > 1 || ease.x2 < 0 || ease.x2 > 1) {
        issues.push(issue('easing-out-of-range', `${entity} easing x is outside [0, 1]`, branchId));
      }
    }
  }
}

export function validatePlay(play: Play): Issue[] {
  const issues: Issue[] = [];
  const knownPlayers = new Set<string>(play.players.map((p) => p.id));

  for (const id of duplicates(play.players.map((p) => p.id))) {
    issues.push(issue('duplicate-id', `duplicate player id ${id}`, id));
  }
  for (const id of duplicates(play.branches.map((b) => b.id))) {
    issues.push(issue('duplicate-id', `duplicate branch id ${id}`, id));
  }
  for (const id of duplicates(play.branches.flatMap((b) => b.steps.map((s) => s.id)))) {
    issues.push(issue('duplicate-id', `duplicate step id ${id}`, id));
  }
  for (const id of duplicates(play.branches.flatMap((b) => b.screens.map((s) => s.id)))) {
    issues.push(issue('duplicate-id', `duplicate screen id ${id}`, id));
  }

  for (const branch of play.branches) {
    const isRoot = branch.id === play.rootBranchId;

    if (isRoot && branch.parentId !== null) {
      issues.push(issue('root-branch-with-parent', 'the root branch has a parent', branch.id));
    }
    if (!isRoot && branch.forkStepId === null) {
      issues.push(issue('non-root-branch-without-fork', 'a non-root branch has no fork step', branch.id));
    }

    const chain = ancestorChain(play, branch);
    if (chain === 'cycle') {
      issues.push(issue('branch-cycle', 'branch parents form a cycle', branch.id));
      continue;
    }

    const fork = isRoot ? 0 : forkTime(chain, branch);
    if (!isRoot && fork === undefined) {
      issues.push(issue('fork-step-not-in-ancestors', `fork step ${branch.forkStepId} not found`, branch.id));
    }

    for (const screen of branch.screens) {
      for (const playerId of [screen.screenerId, screen.beneficiaryId] as PlayerId[]) {
        if (!knownPlayers.has(playerId)) {
          issues.push(issue('unknown-player-reference', `unknown player ${playerId}`, screen.id));
        }
      }
    }

    for (const [entity, keyframes] of Object.entries(branch.tracks)) {
      checkKeyframes(entity, keyframes, knownPlayers, branch.id, fork, issues);
    }
  }

  return issues;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @phoopers/pwa test validate`
Expected: PASS — 13 passed.

- [ ] **Step 6: Commit**

```bash
pnpm lint && pnpm typecheck
git add apps/pwa/src/engine
git commit -m "feat(engine): validate play structure without throwing"
```

---

### Task 7: Public surface and acceptance

Deliverable: a single import point, and tests asserting the spec's acceptance criteria end to end.

**Files:**

- Create: `apps/pwa/src/engine/index.ts`
- Test: `apps/pwa/src/engine/acceptance.test.ts`

**Interfaces:**

- Consumes: everything built in Tasks 1–6.
- Produces: the module's public surface, which 1b imports as `@/engine` equivalent relative paths.

- [ ] **Step 1: Write the failing acceptance test**

`apps/pwa/src/engine/acceptance.test.ts`. Each case maps to a numbered acceptance criterion in the spec.

```ts
import { describe, expect, it } from 'vitest';
import { ballStateAt, resolveBranch, spanKindAt, stateAt, validatePlay } from './index';
import { fixturePlay, P1, P2, ROOT, SWITCH } from './__fixtures__/play';
import { distance } from './vec2';
import type { Play } from './index';

describe('acceptance', () => {
  it('1. resolves and samples any branch at any t', () => {
    for (const branchId of [ROOT, SWITCH]) {
      const timeline = resolveBranch(fixturePlay, branchId);
      for (const t of [-1, 0, 1.5, 2, 3.999, 4, 10]) {
        const state = stateAt(timeline, t);
        expect(Number.isFinite(state.players[P1]?.position.x)).toBe(true);
        expect(Number.isFinite(state.ball.position.y)).toBe(true);
      }
    }
  });

  it('2. covers equal distance in equal time under linear easing', () => {
    const play: Play = {
      ...fixturePlay,
      branches: fixturePlay.branches.map((b) =>
        b.id !== ROOT
          ? b
          : {
              ...b,
              tracks: {
                ...b.tracks,
                [P1]: [
                  { t: 0, position: { x: 0, y: 0 }, handleOut: { x: 0, y: 9 } },
                  { t: 4, position: { x: 10, y: 0 }, handleIn: { x: 9.5, y: 0.2 } },
                ],
              },
            },
      ),
    };
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
    const play: Play = {
      ...fixturePlay,
      branches: fixturePlay.branches.map((b) =>
        b.id !== ROOT
          ? b
          : {
              ...b,
              tracks: {
                ...b.tracks,
                [P1]: [
                  { t: 0, position: { x: 0, y: 0 }, ease: 'easeOut' },
                  { t: 4, position: { x: 10, y: 0 } },
                ],
              },
            },
      ),
    };
    const timeline = resolveBranch(play, ROOT);
    const at = (t: number) => stateAt(timeline, t).players[P1]?.position ?? { x: 0, y: 0 };

    expect(distance(at(0), at(2))).toBeGreaterThan(distance(at(2), at(4)));
  });

  it('4. distinguishes a dribble, a pass and a held ball from the model alone', () => {
    const timeline = resolveBranch(fixturePlay, ROOT);

    expect(spanKindAt(timeline, P1, 0.5)).toBe('dribble');
    expect(ballStateAt(timeline, 1.5)).toBe('inFlight');
    expect(ballStateAt(timeline, 3)).toBe('held');
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
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @phoopers/pwa test acceptance`
Expected: FAIL — `Failed to resolve import "./index"`.

- [ ] **Step 3: Write the public surface**

`apps/pwa/src/engine/index.ts`:

```ts
export type {
  Branch,
  BranchId,
  CubicBezierEasing,
  Easing,
  EasingPreset,
  EntityId,
  Issue,
  IssueCode,
  Keyframe,
  Play,
  PlayId,
  Player,
  PlayerId,
  PlayState,
  PreparedSpan,
  ResolvedTimeline,
  ScreenEvent,
  ScreenId,
  Step,
  StepId,
  Vec2,
} from './types';
export { COURT_DIMENSIONS } from './types';
export { resolveBranch } from './resolve';
export { ballStateAt, duration, spanKindAt, stateAt, stepsOf } from './sample';
export { validatePlay } from './validate';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @phoopers/pwa test acceptance`
Expected: PASS — 6 passed.

- [ ] **Step 5: Verify the whole gate, including the dependency rule**

```bash
pnpm lint && pnpm typecheck && pnpm i18n:check && pnpm test && pnpm build
```

Expected: all pass. Then confirm the rule still bites:

```bash
printf "import { createRoot } from 'react-dom/client';\nexport const x = createRoot;\n" > apps/pwa/src/engine/final-probe.ts
pnpm exec eslint apps/pwa/src/engine/final-probe.ts
rm apps/pwa/src/engine/final-probe.ts
```

Expected: FAIL on the probe with the rendering-independence message, then a clean tree.

- [ ] **Step 6: Commit**

```bash
git add apps/pwa/src/engine
git commit -m "feat(engine): expose the public surface and acceptance tests"
```

---

## Verification

The phase is complete when:

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm i18n:check`, `pnpm test` and `pnpm build` all pass.
- [ ] Every acceptance criterion in the spec has a passing test in `acceptance.test.ts`.
- [ ] An added `react` or `react-dom` import anywhere under `engine/` fails lint.
- [ ] No file under `engine/` imports anything outside `engine/`.
- [ ] CI is green on the branch.

## Follow-ups (not in this plan)

- 1b: the 2D renderer and playback transport.
- 1c: mutation helpers, curve splitting and point projection (see the spec's Deferred section on `bezier-js`).
- 1d: serialisation and schema versioning.
