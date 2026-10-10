# Basketball Play Designer — Global Roadmap

## Context

There is currently no easy-to-use tool for creating, saving, and viewing animated
basketball plays, both as a schematic "coach's whiteboard" view and as a 3D view. The
goal is to build a public, community-driven web application: a coach (or anyone) can
draw an offensive or defensive play, organize it into steps with branching scenarios
(e.g. a response to a defensive switch), and then replay it either on a 2D whiteboard
or in 3D with a free camera or a camera centered on a given player.

The project is deliberately split into 3 successive sub-projects, each with its own
spec and its own detailed implementation plan, produced via the
brainstorming/writing-plans workflow when tackling each phase. A phase too large for
one spec is split further (1a, 1b, …), and each piece gets its own full cycle.

## Validated framing decisions

- **Target audience**: a public/community tool — a shareable library of plays, not
  just personal use. This implies user accounts and server-side storage.
- **Model of a "play"**: a continuous keyframe timeline (smooth interpolation of
  player/ball positions), but with explicit, nameable **steps** on the timeline
  (named synchronization points: entry pass, screen, shot...).
- **Alternative scenarios**: from a given step, multiple **branches** can be created
  (e.g. reaction to a defensive switch vs. no switch), forming a scenario tree rather
  than a single timeline.
- **Branch navigation**: a visual tree representation; selecting a branch animates it
  from start to end (no side-by-side comparative playback in v1).
- **2D view ("coach's whiteboard")**: standard symbols (numbered circles = offense,
  X = defense, solid arrow = movement, wavy arrow = dribble, dashed arrow = pass,
  perpendicular line = screen), playback with play/pause and a scrubber, toggle
  between half-court and full-court.
- **3D view**: **stylized/schematic** rendering (colored pawns/capsules, ball = a
  sphere following a path) — no realistic animated human characters. This choice is
  driven by the lack of rigged/animated 3D basketball player assets (dribble, shot,
  screen) under a free or open license; the stylized approach avoids this blocker,
  stays consistent with the "coach's whiteboard" spirit, and costs far less to
  develop.
- **Player-centered 3D camera**: in addition to a free/overview camera, the ability to
  pick any player and follow the action with an **over-the-shoulder camera** (close
  third person, following the chosen player throughout the animation).
- **Phasing**: see below — the core (data model + editor + 2D) ships before investing
  in 3D, which itself ships before community features.
- **PWA**: the application must be installable and work as a Progressive Web App
  (manifest, service worker, offline-capable app shell) — not just a plain website.

## Recommended architecture & stack (to be refined in Phase 1)

- **Frontend**: React 19 + TypeScript, built with **Vite**, UI components from
  **Mantine**, server-state/data-fetching handled by **TanStack Query**. A
  **rendering-independent animation engine** (player/ball state at any instant t,
  derived from keyframes + steps + the active branch) feeds two different renderers:
  - 2D view: **SVG + React**, with attributes driven during playback via
    `requestAnimationFrame`/refs (bypassing React's render cycle per frame to stay
    smooth). Chosen over a canvas library (Konva.js) because the number of on-screen
    elements stays low (about a dozen players plus arrows), editing (drag & drop,
    drawing paths) stays simple with native pointer events at this scale, and above
    all because SVG enables a **clean printable export (vector PNG/PDF)** — a common
    need for a coach who wants to hand out a printed play.
  - 3D view (Phase 2): Three.js via React Three Fiber, with a camera system
    (overview + over-the-shoulder player camera).
  - Packaged as a **PWA** (manifest + service worker, e.g. via `vite-plugin-pwa`).
- **Backend** (required once community sharing arrives in Phase 3, though basic
  persistence can land as early as Phase 1): a platform such as Supabase
  (Postgres + auth + storage) quickly covers user accounts, saving plays (including
  their branching tree structure, storable as JSON), and a public library with
  search/tags — without standing up heavy infrastructure for a tool that starts
  small.
- **Hosting**: frontend on Vercel/Netlify, backend/DB on Supabase (or equivalent) —
  free tiers are enough to get started.
- **Testing**: **Vitest** for unit/component tests, **Playwright** for end-to-end
  browser tests (covering both the 2D and 3D views), **Supertest** for backend/API
  integration tests.
- **Tooling**: **GitHub Actions** for CI (lint, test, build on every push/PR),
  **Husky** for git hooks, **lint-staged** to run linting/formatting on staged files
  before each commit.

The parts this stack needed for 1a and 1b were validated in
[spec 001](specs/001-09-10-2026-model-animation-engine.md) and
[spec 002](specs/002-09-10-2026-2d-view-playback.md), and are in use: React 19,
TypeScript, Vite, Mantine, SVG rendering, Vitest, GitHub Actions, Husky and
lint-staged. The rest — TanStack Query, PWA packaging, Playwright, Supabase and
hosting — is still a recommendation awaiting the phase that needs it.

## Phasing (sub-projects)

### Phase 1 — Data model, editor, 2D view (in progress)

Too large for one spec, so split into four sub-projects:

- **1a — Data model and animation engine**: players (offense/defense), ball,
  keyframes, named steps, branch tree, and a headless engine answering where
  everything is at time `t` on a given branch.
- **1b — 2D playback**: coach's-whiteboard-style rendering, play/pause/scrubber,
  half-court/full-court, navigation through the branch tree.
- **1c — Editor**: place/move players, draw paths (movement, pass, dribble, screen),
  create steps, create alternative branches from a step.
- **1d — Basic persistence** (local or a minimal backend) to keep a play across
  sessions.

Which of these have shipped is recorded in the [spec](specs/index.md) and
[plan](plans/index.md) indexes, so the status lives in one place rather than here.

### Phase 2 — 3D view

- Stylized 3D rendering of the same data model (no data divergence from Phase 1, just
  a new renderer).
- Camera system: overview/free camera + over-the-shoulder camera centered on a
  selected player, synchronized with animation playback.

### Phase 3 — Community features

- User accounts, public play library, search/tags, shareable links.
- Details (moderation, ratings, comments, edit permissions) to be defined when
  scoping this phase.

## Next steps

1. Finish **Phase 1** — the sub-project that validates the functional core before
   investing in 3D and community features. 1a, 1b and 1c (the editor) are implemented;
   1d (persistence) is next, and gets brainstorming, a spec and a plan before any code.
2. Once Phase 1 is implemented and validated, scope **Phase 2** (3D view + cameras).
3. Finally, scope **Phase 3** (community features).

## Verification

This document is a high-level framing plan, with no code to run. Verification will
happen at each phase: for Phase 1, it means being able to create a complete play
(players + paths + steps + at least one alternative branch) and replay it in 2D with
play/pause/scrubber in a browser.
