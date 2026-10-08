# Spec 001 — Phase 1a: data model and animation engine

**Status:** approved, not yet implemented
**Roadmap phase:** 1 (sub-project 1a of 1a–1d)
**Date:** 09/10/2026

## Context

The roadmap's Phase 1 covers four subsystems: the data model and animation engine, the 2D
coach's-whiteboard view, the editor, and persistence. This spec covers **1a only** — the
headless model and engine. 1b (2D view + playback), 1c (editor) and 1d (persistence) get
their own spec → plan → implementation cycles.

1a is specified first because it is the decision most expensive to change later. The
roadmap commits Phase 2 (3D view) and Phase 3 (community library) to the same data shape,
so a wrong branch-tree or keyframe representation propagates into both.

## Goal

A pure TypeScript module answering one question: **where is every player and the ball at
time `t`, on a given branch?** No rendering concerns, no framework dependencies. Both the
2D renderer (1b) and the later 3D renderer consume it unchanged.

## Out of scope

Rendering, the editor, persistence, undo/redo, court imagery, and validation _UI_.
Mutation helpers (add keyframe, fork branch) belong to 1c — 1a defines the shape and reads
it.

## Decisions

Each was chosen against named alternatives, recorded so a later reader does not
re-litigate them.

### D1 — Per-entity keyframes, global steps

Each player and the ball owns its own keyframe list with independent times. Steps are
separate named markers on the shared timeline.

Rejected: _global keyframes_ — moving one player would force positions for all ten, and
the data grows as players × times. Rejected: _steps are the only keyframes_ — a multi-leg
path between two named moments would need unnamed steps, reintroducing the distinction
under a worse name.

### D2 — A branch forks at a step and owns the keyframes after it

A branch records its parent, the step it forks from, and its own per-entity keyframes from
that time onward. Resolution walks the ancestor chain.

Rejected: _sparse overlay_ — resolution becomes ambiguous when the parent later moves an
entity the branch also moved. Rejected: _full copy from t=0_ — editing the shared opening
means editing every branch, and branches drift apart silently.

### D3 — Ball keyframes carry an optional `attachedTo`

The ball has its own keyframe list, but a keyframe may name a player instead of a position.
While attached, the ball's position derives from that player.

Rejected: _separate possession timeline_ — two structures that can contradict each other.
Rejected: _plain entity_ — any edit to a carrier's path silently desynchronises the ball.

### D4 — Movement kinds are derived; a screen is an explicit event

A dribble is a player moving while the ball is attached to them. A pass is the ball
changing hands. Neither is stored, so no stored field can contradict the ball's timeline. A
screen is not movement — a player stops and occupies space for a teammate — so it is an
explicit event naming screener, beneficiary, time and duration.

Rejected: _explicit kind on every span_ — admits states that cannot happen. Rejected:
_kinds authoritative, ball derived_ — makes the ball's position a side effect of
annotations on ten separate timelines.

### D5 — Cubic Bezier with optional explicit control points

`handleIn` / `handleOut` are optional. When absent, the engine derives tangents
Catmull-Rom-style from neighbouring keyframes, so a freshly dropped keyframe already curves
smoothly. Explicit handles win when present.

Rejected: _Catmull-Rom only_ — no way to hand-tune a specific arc. Rejected: _linear_ — the
roadmap promises smooth interpolation, and retrofitting would change the keyframe shape.

### D6 — Arc-length parameterisation (revised)

**This decision reverses an earlier draft** that mapped time directly onto the Bezier
parameter. That is wrong once easing exists (D7), and it was subtly wrong even without it.

Under direct mapping, speed is proportional to `|dP/du|`, which varies with **handle
length**. Handle length would therefore act as a hidden speed control: reshaping a cut
would silently change its timing. Shape and timing must not interfere.

The engine therefore parameterises each span by arc length, so progress `s ∈ [0, 1]` means
"fraction of the distance travelled". Linear easing then yields genuinely constant speed.

Implementation is a per-span lookup table: sample the curve at 32 uniform parameter values,
accumulate chord lengths, and invert by binary search with linear interpolation between
samples. The LUT is built once by `resolveBranch`, never per frame.

### D7 — Optional per-span cubic-bezier easing

Each keyframe carries an optional easing governing the span that _follows_ it, expressed
CSS-style as `cubic-bezier(x1, y1, x2, y2)` with named presets resolving to those values.
Absent means linear, so the data stays sparse.

This is the right granularity: a player explodes off a cut on one span and decelerates into
a screen on the next.

Rejected: _named presets only_ — no way to express a specific acceleration profile, and
widening it later changes the stored shape. Rejected: _one easing per entity track_ — the
common case needs two profiles on one path. Rejected: _no easing_ — acceleration becomes
manual keyframe spam, and the handle-length speed coupling stays unresolved.

### D8 — No external math dependency in 1a

Vector arithmetic and cubic Bezier evaluation are written in-repo. The decisive constraint
is D-types being plain JSON: 1d persists them and Phase 3 ships them over the wire, so a
`Float32Array` (`gl-matrix`) or a class instance (three.js `Vector2`) in `Keyframe.position`
would break serialisation and force conversion at every boundary.

What 1a needs — add, subtract, scale, lerp, distance, de Casteljau evaluation, Catmull-Rom
tangents, an arc-length LUT and a timing-curve solve — is roughly 100 lines of branch-free
arithmetic, fully covered by table-driven tests.

The harder operations arrive in **1c**: splitting a curve at a parameter (inserting a
keyframe mid-path without changing its shape) and projecting a point onto a curve (clicking
near a path to grab it). `bezier-js` (MIT, ~1.5M weekly downloads, by the author of _A
Primer on Bézier Curves_) does both. **Caveat for whoever picks that up:** it ships no
TypeScript types, and `@types/bezier-js` is at 4.1.3 against library 6.1.4 — two majors
behind — so it needs either stale community types or a small hand-written declaration.

To keep that swap cheap, all curve math sits behind `engine/curve.ts` with a deliberately
small surface. Replacing its internals touches one file, not the model.

## Coordinates and units

Positions are **metres on a full court**, origin at one corner: `x ∈ [0, length]` along the
length, `y ∈ [0, width]` across. The play names its court rather than hardcoding dimensions.

- FIBA: 28 × 15 m
- NBA: 28.65 × 15.24 m

Half-court is a **viewport** concern — the renderer shows `x ∈ [0, length / 2]` — and never
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
  position?: Vec2; // omitted only when attachedTo is set (ball only)
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

Easing presets resolve to the CSS values: `linear` → (0, 0, 1, 1), `easeIn` → (0.42, 0, 1,
1), `easeOut` → (0, 0, 0.58, 1), `easeInOut` → (0.42, 0, 0.58, 1).

## Engine

Two pure functions with a deliberate seam:

```ts
resolveBranch(play: Play, branchId: BranchId): ResolvedTimeline
stateAt(timeline: ResolvedTimeline, t: number): PlayState
```

The prepared timeline and the validation issue are defined as:

```ts
interface PreparedSpan {
  fromT: number;
  toT: number;
  p0: Vec2; // start position
  p1: Vec2; // resolved handleOut (explicit or derived)
  p2: Vec2; // resolved handleIn
  p3: Vec2; // end position
  ease: CubicBezierEasing; // presets already resolved
  lut: number[]; // 33 cumulative arc lengths, normalised to [0, 1]
  length: number; // metres
  attachedTo: PlayerId | null; // ball spans only; null for players and free ball spans
}

interface ResolvedTimeline {
  branchId: BranchId;
  players: Player[];
  court: Play['court'];
  spans: Record<EntityId, PreparedSpan[]>; // ancestors concatenated, continuity inserted
  steps: Step[];
  screens: ScreenEvent[];
  duration: number; // seconds; the last keyframe time across all tracks
}

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

`resolveBranch` is the only code that understands the tree, and it does all the expensive
preparation: concatenating ancestor tracks, deriving absent handles, and building each
span's arc-length LUT. `stateAt` sees a flat, prepared timeline and knows nothing about
branching — which is what makes it cheap to call 60 times a second and trivial to test.

### Branch resolution

For a chain `root → A → B`, where A forks at step time `t1` and B at `t2`:

- `root` contributes keyframes with `t < t1`
- `A` contributes `t1 ≤ t < t2`
- `B` contributes `t ≥ t2`

**Continuity rule:** if a branch's track has no keyframe exactly at its fork time, the
engine synthesises one there holding the parent's interpolated state at that instant
(position, or `attachedTo` for the ball). Without this, a branch whose first keyframe is
later than the fork would teleport on entry.

Steps and screens are concatenated under the same time windows.

### Evaluation pipeline

Position within a span `[k0, k1]` is computed in three stages, keeping shape and timing
independent:

1. **Normalised time** — `p = (t − k0.t) / (k1.t − k0.t)`
2. **Easing** — `s = ease(p)`, solving the timing curve's `x(u) = p` for `u` then taking
   `y(u)`. `s` is the fraction of **distance** travelled.
3. **Arc length → curve parameter** — `u = invertLut(span, s)`
4. **Point** — the cubic Bezier on `(k0.position, k0.handleOut, k1.handleIn, k1.position)`
   at `u`

Absent handles are derived Catmull-Rom-style:
`handleOut(k0) = k0.p + (k1.p − kprev.p) / 6` and
`handleIn(k1) = k1.p − (knext.p − k0.p) / 6`, using one-sided differences at the ends.

### Other evaluation rules

- **Clamping.** `t` before the first keyframe yields the first position; after the last,
  the last. The engine never extrapolates.
- **Ball attachment.** The ball is `held` over a span only when _both_ endpoints are
  attached to the **same** player; its position is that player's position at `t`. Otherwise
  it is `inFlight`, interpolating between the endpoints' resolved positions. A pass is
  therefore two attached keyframes naming different players; a shot is an attached keyframe
  followed by a free one.
- **`moving`.** True when the player's position changes over the span containing `t`.
- **`spanKindAt`.** `idle` when not moving; `dribble` when moving and the ball is held by
  that player; `move` otherwise.
- **`activeScreens`.** Screens whose `[t, t + duration]` contains the sampled time.

### State

```ts
interface PlayState {
  t: number;
  players: Record<PlayerId, { position: Vec2; moving: boolean }>;
  ball: { position: Vec2; attachedTo: PlayerId | null };
  activeScreens: ScreenEvent[];
}
```

Derived queries, implementing D4:

```ts
spanKindAt(timeline, playerId, t): 'idle' | 'move' | 'dribble'
ballStateAt(timeline, t): 'held' | 'inFlight'
duration(timeline): number
stepsOf(timeline): Step[]
```

## Validation

`validatePlay(play: Play): Issue[]` — **reports, never throws**, so the editor (1c) can show
problems inline rather than crashing. It catches what the type system cannot:

- a branch forking at a step outside its ancestor chain
- keyframes earlier than their branch's fork time
- a ball keyframe with neither `position` nor `attachedTo`, or with both
- a player keyframe carrying `attachedTo`
- non-monotonic or duplicate keyframe times within a track
- duplicate ids among players, branches, steps or screens
- a screen or `attachedTo` naming an unknown player
- a cycle in `parentId`, or a non-root branch with `forkStepId: null`
- a root branch whose `parentId` is not `null`
- an easing whose `x1` or `x2` falls outside `[0, 1]` (CSS constraint; `y` may overshoot)

Each `Issue` carries a machine-readable `code`, a human-readable `message`, and the id of
the offending entity.

## Location and dependency rule

`apps/pwa/src/engine/`, with an ESLint `no-restricted-imports` rule for that directory
banning `react`, `react-dom`, `@mantine/*` and DOM globals. This enforces
"rendering-independent" as a dependency rule rather than packaging ceremony, and keeps
AGENTS.md's `src/types/` convention intact. Extracting a `packages/engine` workspace later
is mechanical.

The module is internal, so its strings are not user-facing and are **not** routed through
`t()`. `Issue.code` is the stable identifier; 1c renders its own translated copy.

## Testing

Pure functions, so plain Vitest with no DOM. Table-driven where the cases are data:

- **Interpolation** — endpoints exact; midpoint on the curve; derived vs explicit handles;
  before-first and after-last clamped; a zero-length span.
- **Arc length** — a straight span is traversed at constant speed under linear easing
  (equal time slices cover equal distances, within the LUT's tolerance); a curved span with
  asymmetric handles is _also_ constant speed, which is the regression test for D6.
- **Easing** — `linear` matches no-easing exactly; `easeOut` covers more than half the
  distance in the first half of the span; a custom cubic-bezier matches known CSS values;
  presets resolve to their documented control points.
- **Branch resolution** — root only; one fork; nested forks; a fork at `t = 0`; the
  continuity rule when a branch's first keyframe is later than its fork.
- **Ball** — attached through a dribble; in flight during a pass; the handoff instant; a
  shot ending at a free position.
- **Derived kinds** — idle, move and dribble for the same player at different times.
- **Validation** — one case per issue code, plus a valid play producing no issues.

Shared fixtures live in `apps/pwa/src/engine/__fixtures__/`: a two-player play with a ball,
one named step and one branch.

## Acceptance criteria

1. A fixture play resolves on any branch and samples cleanly at any `t`, including outside
   its bounds.
2. Under linear easing, a player covers equal distance in equal time on a curved span with
   asymmetric handles — proving shape and timing are independent (D6).
3. An `easeOut` span visibly decelerates: distance covered in the first half exceeds the
   second.
4. A pass, a dribble and a shot are each distinguishable from the model alone, with no
   stored movement kinds.
5. A nested branch replays its ancestors' opening and diverges only after its fork, with no
   discontinuity at the fork instant.
6. `validatePlay` returns at least one issue for every code listed above, and none for the
   valid fixture.
7. `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass; the ESLint rule rejects
   a React import added anywhere under `engine/`.

## Deferred

- **`bezier-js` adoption** for curve splitting and point projection — 1c (see D8).
- **Court imagery and zone geometry** (three-point arc, the key) — 1b, presentation only.
- **Mutation helpers** — 1c.
- **Serialisation format and schema versioning** — 1d. The types are JSON-compatible by
  construction, so this is a later concern, not a constraint on 1a.
- **LUT sample count** is fixed at 32. If precision proves insufficient for very long
  curved spans, it becomes a per-span adaptive count — a contained change inside
  `engine/curve.ts`.
