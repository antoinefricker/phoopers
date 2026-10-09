# Spec 001 — Phase 1a: data model and animation engine

**Roadmap phase:** 1 (sub-project 1a of 1a–1d)
**Date:** 09/10/2026

## Overview

A pure TypeScript module answering one question: **where is every player and the ball at
time `t`, on a given branch?** It has no rendering concerns and no framework dependencies.
Both the 2D renderer (1b) and the later 3D renderer consume it unchanged.

A play is a continuous keyframe timeline with smooth interpolation. Steps are named
synchronisation points on that timeline. Branches fork from a step to form a scenario tree.

## Scope

In scope: the data types, branch resolution, time sampling, derived movement kinds, and
structural validation.

Out of scope: rendering, the editor, persistence, undo/redo, court imagery, and validation
UI. Mutation helpers (add keyframe, fork branch) belong to 1c — 1a defines the shape and
reads it.

## Coordinates and units

Positions are **metres on a full court**, origin at one corner: `x ∈ [0, length]` along the
length, `y ∈ [0, width]` across. The play names its court rather than hardcoding dimensions.

- FIBA: 28 × 15 m
- NBA: 28.65 × 15.24 m

Half-court is a viewport concern — the renderer shows `x ∈ [0, length / 2]` — and never
touches stored data. The engine contains no pixel units.

## Types

```ts
type Vec2 = { x: number; y: number };

type PlayId = string & { readonly __brand: 'PlayId' };
type PlayerId = string & { readonly __brand: 'PlayerId' };
type BranchId = string & { readonly __brand: 'BranchId' };
type StepId = string & { readonly __brand: 'StepId' };
type ScreenId = string & { readonly __brand: 'ScreenId' };

type EntityId = PlayerId | 'ball';

type EasingPreset = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
type CubicBezierEasing = { x1: number; y1: number; x2: number; y2: number };
type Easing = EasingPreset | CubicBezierEasing;

interface Player {
  id: PlayerId;
  team: 'offense' | 'defense';
  label: string; // '1'…'5' for offense, 'X1'…'X5' for defense
}

interface Keyframe {
  t: number; // seconds from the start of the play
  position?: Vec2; // omitted only when attachedTo is set
  attachedTo?: PlayerId; // ball only
  handleOut?: Vec2; // absolute court coords; derived when absent
  handleIn?: Vec2;
  ease?: Easing; // governs the span FROM this keyframe; linear when absent
}

interface Step {
  id: StepId;
  t: number;
  name: string;
}

interface ScreenEvent {
  id: ScreenId;
  t: number;
  duration: number; // seconds the screen symbol stays live
  screenerId: PlayerId;
  beneficiaryId: PlayerId;
}

interface Branch {
  id: BranchId;
  parentId: BranchId | null;
  forkStepId: StepId | null; // null only for the root branch
  name: string;
  tracks: Record<EntityId, Keyframe[]>; // ascending t, all ≥ the fork time
  steps: Step[];
  screens: ScreenEvent[];
}

interface Play {
  id: PlayId;
  name: string;
  court: 'fiba' | 'nba';
  players: Player[];
  branches: Branch[];
  rootBranchId: BranchId;
}
```

All types are plain JSON-compatible data, so a play serialises without transformation.

Easing presets resolve to the CSS control points: `linear` → (0, 0, 1, 1), `easeIn` →
(0.42, 0, 1, 1), `easeOut` → (0, 0, 0.58, 1), `easeInOut` → (0.42, 0, 0.58, 1).

A keyframe's `ease` governs the span that follows it. A movement kind is never stored: a
dribble is a player moving while the ball is attached to them, and a pass is the ball
changing hands. A screen is an explicit event, because it is not movement.

## Engine

```ts
resolveBranch(play: Play, branchId: BranchId): ResolvedTimeline;
stateAt(timeline: ResolvedTimeline, t: number): PlayState;
```

`resolveBranch` is the only code that understands the tree, and it performs all expensive
preparation: concatenating ancestor tracks, deriving absent handles, resolving easing
presets, and building each span's arc-length lookup table. `stateAt` sees a flat, prepared
timeline and knows nothing about branching, so it is cheap to call 60 times a second.

A timeline carries both `spans` and `anchors`. Spans drive interpolation, but a track with a
single keyframe has no spans at all, so `anchors` is what makes such an entity sample to its
one position instead of nothing.

```ts
interface PreparedSpan {
  fromT: number;
  toT: number;
  p0: Vec2; // start position
  p1: Vec2; // resolved handleOut
  p2: Vec2; // resolved handleIn
  p3: Vec2; // end position
  ease: CubicBezierEasing;
  lut: number[]; // 33 cumulative arc lengths, normalised to [0, 1]
  length: number; // metres
  attachedTo: PlayerId | null; // ball spans only
}

interface ResolvedTimeline {
  branchId: BranchId;
  players: Player[];
  court: Play['court'];
  spans: Record<EntityId, PreparedSpan[]>;
  anchors: Record<EntityId, Keyframe[]>; // flattened keyframes after ancestor concatenation
  steps: Step[];
  screens: ScreenEvent[];
  duration: number; // seconds; the last keyframe time across all tracks
}

interface PlayState {
  t: number;
  players: Record<PlayerId, { position: Vec2; moving: boolean }>;
  ball: { position: Vec2; attachedTo: PlayerId | null };
  activeScreens: ScreenEvent[];
}
```

Derived queries:

```ts
spanKindAt(timeline, playerId, t): 'idle' | 'move' | 'dribble';
ballStateAt(timeline, t): 'held' | 'inFlight';
duration(timeline): number;
stepsOf(timeline): Step[];
```

### Branch resolution

For a chain `root → A → B`, where A forks at step time `t1` and B at `t2`:

- `root` contributes keyframes with `t < t1`
- `A` contributes `t1 ≤ t < t2`
- `B` contributes `t ≥ t2`

Steps and screens are concatenated under the same time windows, except that their upper
bound is inclusive: the fork step itself lives at the fork instant in the parent's list,
and the child's timeline must be able to name the step it forked from. Keyframe windows
stay half-open, so the fork instant's position still belongs to the child. A parent and a
child may therefore each contribute a distinct step or screen at exactly a fork instant.

If a branch's track has no keyframe exactly at its fork time, the engine synthesises one
there holding the parent's interpolated state at that instant — its position, or its
`attachedTo` for the ball. A branch whose first keyframe is later than the fork therefore
enters without discontinuity.

### Evaluation pipeline

Position within a span `[k0, k1]` is computed in four stages, which keeps shape and timing
independent of each other:

1. **Normalised time** — `p = (t − k0.t) / (k1.t − k0.t)`
2. **Easing** — `s = ease(p)`, solving the timing curve's `x(u) = p` for `u` and taking
   `y(u)`. `s` is the fraction of **distance** travelled.
3. **Arc length → curve parameter** — `u = invertLut(span, s)`
4. **Point** — the cubic Bezier on `(p0, p1, p2, p3)` at `u`

Each span is parameterised by arc length, so progress means "fraction of the distance
travelled" and linear easing yields constant speed regardless of handle lengths. The lookup
table samples the curve at 32 uniform parameter values, accumulates chord lengths, and is
inverted by binary search with linear interpolation between samples. It is built once by
`resolveBranch`.

Absent handles are derived Catmull-Rom-style:
`handleOut(k0) = k0.p + (k1.p − kprev.p) / 6` and
`handleIn(k1) = k1.p − (knext.p − k0.p) / 6`, using one-sided differences at the ends.

### Evaluation rules

- **Clamping.** `t` before the first keyframe yields the first position; after the last,
  the last. The engine never extrapolates.
- **Ball attachment.** The ball is `held` over a span only when both endpoints are attached
  to the same player; its position is that player's position at `t`. Otherwise it is
  `inFlight`, interpolating between the endpoints' resolved positions. A pass is two
  attached keyframes naming different players; a shot is an attached keyframe followed by a
  free one.
- **`moving`.** True when the player's position changes over the span containing `t`.
- **`spanKindAt`.** `idle` when not moving; `dribble` when moving and the ball is held by
  that player; `move` otherwise.
- **`activeScreens`.** Screens whose `[t, t + duration]` contains the sampled time.

## Validation

`validatePlay(play: Play): Issue[]` reports; it never throws, so the editor (1c) can show
problems inline.

```ts
type IssueCode =
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

interface Issue {
  code: IssueCode;
  message: string; // English, for developers; not user-facing copy
  entityId?: string; // the offending player, branch, step or screen
}
```

`easing-out-of-range` covers an easing whose `x1` or `x2` falls outside `[0, 1]`; `y` may
overshoot.

`Issue.code` is the stable identifier. 1c renders its own translated copy, so engine
messages are never routed through `t()`.

## Location and dependencies

`apps/pwa/src/engine/`. An ESLint `no-restricted-imports` rule for that directory bans
`react`, `react-dom`, `@mantine/*` and DOM globals, enforcing rendering independence as a
dependency rule.

The module has no external math dependency. Vector arithmetic, de Casteljau evaluation,
Catmull-Rom tangents, the arc-length table and the timing-curve solve are written in-repo —
roughly 100 lines of branch-free arithmetic. All curve math sits behind `engine/curve.ts`
with a small surface, so its internals can be replaced without touching the model.

## Testing

Pure functions, so plain Vitest with no DOM. Table-driven where the cases are data:

- **Interpolation** — endpoints exact; midpoint on the curve; derived vs explicit handles;
  before-first and after-last clamped; a zero-length span.
- **Arc length** — under linear easing, equal time slices cover equal distances, on a
  straight span and on a curved span with asymmetric handles.
- **Easing** — `linear` matches no easing exactly; `easeOut` covers more than half the
  distance in the first half of the span; a custom cubic-bezier matches known CSS values;
  presets resolve to their documented control points.
- **Branch resolution** — root only; one fork; nested forks; a fork at `t = 0`; a branch
  whose first keyframe is later than its fork.
- **Ball** — attached through a dribble; in flight during a pass; the handoff instant; a
  shot ending at a free position.
- **Derived kinds** — idle, move and dribble for the same player at different times.
- **Validation** — one case per issue code, plus a valid play producing no issues.

Fixtures live in `apps/pwa/src/engine/__fixtures__/`: a two-player play with a ball, one
named step and one branch.

## Acceptance criteria

1. A fixture play resolves on any branch and samples cleanly at any `t`, including outside
   its bounds.
2. Under linear easing, a player covers equal distance in equal time on a curved span with
   asymmetric handles.
3. An `easeOut` span decelerates: distance covered in the first half exceeds the second.
4. A pass, a dribble and a shot are each distinguishable from the model alone.
5. A nested branch replays its ancestors' opening and diverges only after its fork, with no
   discontinuity at the fork instant.
6. `validatePlay` returns at least one issue for every code, and none for the valid fixture.
7. `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass; the ESLint rule rejects
   a React import added anywhere under `engine/`.

## Deferred

- **Curve splitting and point projection** — needed by 1c to insert a keyframe mid-path and
  to grab a path by clicking near it. `bezier-js` (MIT) covers both; it ships no TypeScript
  types and `@types/bezier-js` is two majors behind the library, so it needs a hand-written
  declaration.
- **Court imagery and zone geometry** (three-point arc, the key) — 1b, presentation only.
- **Mutation helpers** — 1c.
- **Serialisation format and schema versioning** — 1d.
- **Adaptive LUT sample count**, if 32 samples prove insufficient for very long curved
  spans.
