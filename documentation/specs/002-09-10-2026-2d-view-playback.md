# Spec 002 — Phase 1b: 2D view and playback

**Roadmap phase:** 1 (sub-project 1b of 1a–1d)
**Date:** 09/10/2026
**Depends on:** [spec 001](001-09-10-2026-model-animation-engine.md) — the animation engine, implemented.

## Overview

A read-only coach's-whiteboard view of a play: the court, every player's path drawn as its
conventional symbol, numbered tokens animating along those paths, a transport to play, pause
and scrub, and a tree for switching between branches.

The view consumes the 1a engine unchanged: `resolveBranch(play, branchId)` once per branch
switch, then `stateAt(timeline, t)` per frame. It never reads `Keyframe` or walks the branch
tree itself — every question about where something is goes through the engine.

## Scope

In scope: court rendering, path and symbol rendering, per-frame animation, the playback
transport, branch-tree navigation, the half/full-court toggle, and one realistic sample play.

Out of scope: editing of any kind (1c), persistence (1d), printing and vector export,
side-by-side branch comparison, and the 3D view (Phase 2).

## What a frame shows

Every player's complete path is drawn from the outset, and the tokens slide along it as time
advances. A paused frame is therefore a readable coach's diagram at any instant, and the
animation layers timing on top of a picture that already makes sense without it.

## Layout

One full-height view in three regions:

- **Court**, filling the centre. An SVG whose `viewBox` is court metres, so engine
  coordinates pass through with no conversion layer.
- **Transport**, directly beneath: play/pause, a time readout, a scrubber carrying a labelled
  tick per step, and prev/next-step buttons.
- **Branch tree**, a collapsible right sidebar.

Half-court narrows the `viewBox` to the attacking half. It is a viewport change only and
never touches stored data.

## Rendering

Two layers with different update rates.

### Static layer — React-rendered

Court markings, every entity's full path, step markers. Re-renders only when the resolved
timeline changes, which is on a branch or play switch.

Player paths are built directly from `PreparedSpan` control points as a cubic SVG path
(`M p0 C p1 p2 p3 …`), so the drawn arrow is the same curve the engine samples rather than an
approximation of it.

### Animated layer — ref-driven

Player tokens and the ball. A `requestAnimationFrame` loop calls `stateAt(timeline, t)` and
writes `transform` onto element refs. No React state per frame and no reconciliation.

### The ball is sampled, not derived from spans

The ball's drawn path is sampled from `stateAt` into a polyline rather than read from its
spans. A span substitutes `{x: 0, y: 0}` for an attached endpoint, so drawing the ball from
control points would mean reimplementing the carrier resolution that lives in the sampler.
Spec 001 already records two implementations of that interpolation as a known defect; this
avoids adding a third.

Players never have attached endpoints, so their spans are always drawable directly.

## The clock

`PlaybackContextProvider` / `usePlaybackContext` owns the `ResolvedTimeline` returned by
`resolveBranch`, a `currentTime` **ref**, and `isPlaying` **state**. Selecting a branch calls
`resolveBranch` again and replaces the timeline.

The animation loop advances the ref and mutates the DOM. It pushes to React state only when
the rounded scrubber value changes — roughly 15 Hz — so the `Slider` stays controlled without
sixty re-renders a second. Scrubbing writes the ref and pauses playback. Playback stops at
`duration(timeline)`.

## Transport behaviour

- The scrubber spans `[0, duration]` in continuous time.
- Each step from `stepsOf(timeline)` renders as a labelled tick. Dragging within a snap
  threshold of a tick lands exactly on that step's time.
- Prev/next-step buttons jump to the adjacent step time. At the ends they clamp.
- Play from the end restarts from zero.

## Symbols

| Element        | Rendering                                     | Source                                       |
| -------------- | --------------------------------------------- | -------------------------------------------- |
| Offense player | Numbered circle                               | `Player.label`, `team: 'offense'`            |
| Defense player | X                                             | `Player.label`, `team: 'defense'`            |
| Movement       | Solid stroke, arrowhead                       | `spanKindAt` → `'move'`                      |
| Dribble        | Wavy stroke, arrowhead                        | `spanKindAt` → `'dribble'`                   |
| Pass           | Dashed stroke, arrowhead                      | ball span where `ballStateAt` → `'inFlight'` |
| Screen         | Perpendicular tick across the screener's path | `PlayState.activeScreens`                    |

A span's kind is read at its midpoint. Each token is one SVG group so the whole symbol moves
with a single `transform`.

## Court geometry

A pure module turns `COURT_DIMENSIONS` into markings: boundary, centre line and circle, both
keys, free-throw circles, three-point arcs with their corner lines, backboards and rims.

**Every marking dimension must be verified against the current official rulebook during
implementation.** FIBA and NBA differ in three-point distance, corner distance and key width,
and a coach notices when an arc is wrong. No figure in this spec is a substitute for that
check. Both court types in `COURT_DIMENSIONS` must render.

## Sample play

One realistic 5-on-5 set in `apps/pwa/src/samples/` — application data, not engine test
fixtures. It contains five offense and five defense players, an entry pass, a screen, a
dribble drive, a shot, and two branches forking from one step, so that every symbol above is
exercised by real content.

A test asserts `validatePlay(samplePlay)` returns no issues.

## Conventions

- All user-facing strings go through `t()`. Branch names, step names and player labels are
  data and are not translated.
- Reach for Mantine first: use its components and hooks where they fit, and compose custom
  components from Mantine primitives so spacing, colour and dark mode stay consistent. It is
  the default, not a constraint. The SVG canvas is plain markup by necessity — it is the
  drawing surface, not UI chrome — and anything else Mantine serves badly may use plain
  elements, themed through Mantine's CSS variables.
- The context follows the `XxxContextProvider` / `useXxxContext` pattern, with the hook
  throwing outside its provider.

## Testing

- **Pure units** — path construction from spans, court geometry, symbol selection, snap
  resolution. Plain Vitest.
- **Components** — Testing Library: a token renders per player; the scrubber reflects the
  current time; prev/next land exactly on step times; selecting a branch swaps the timeline;
  the half-court toggle changes only the `viewBox`.
- **The clock hook** — tested in isolation with fake timers.
- **Sample data** — `validatePlay` returns no issues.

**Known coverage gap:** the `requestAnimationFrame` loop itself is not unit-testable. Its
effects are covered indirectly — the clock hook under fake timers, and `stateAt` exhaustively
by 1a — but no test proves the loop writes the right transform to the right element. End-to-end
coverage waits for Playwright, which remains deferred.

## Acceptance criteria

1. The sample play renders: a court, ten tokens, every player's path in its correct symbol,
   and the ball.
2. Pressing play animates tokens along their drawn paths and stops at the end.
3. Scrubbing moves every token to the sampled position for that time, and pauses playback.
4. Prev/next-step lands exactly on a step time; dragging near a tick snaps to it.
5. Selecting a branch replays the shared opening and diverges after the fork.
6. The half-court toggle changes the `viewBox` only — no stored data and no path geometry
   changes.
7. `validatePlay(samplePlay)` returns no issues.
8. `pnpm lint`, `pnpm typecheck`, `pnpm i18n:check`, `pnpm test` and `pnpm build` pass.

## Deferred

- Printing and vector export, which is why SVG was chosen; the renderer should stay
  export-friendly but 1b ships no export.
- Side-by-side branch comparison.
- Playwright end-to-end coverage, including the animation loop.
- Court imagery beyond line markings (floor texture, logos).
