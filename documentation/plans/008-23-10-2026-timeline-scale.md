# Timeline Scale and Zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure the editor's timeline in pixels at a fixed scale, scroll it horizontally as one surface, and give it a four-level zoom.

**Architecture:** Two pure modules carry the arithmetic — `timelineScale.ts` turns a time into an x at a level, `timelineScroll.ts` answers "where should the view be" for the three cases that move it. A `TimelineViewportContext` holds the level and the scroll offset for every surface at once. The surfaces keep their current markup and gain a window: a clipping box whose child is `contentWidthPx` wide and translated by `-scrollLeft`, so the 180 px gutter stays pinned without restructuring a row. One real scrollbar sits below them all and writes the offset.

**Tech Stack:** React 19, Mantine 9, Vitest + Testing Library, the editor at `apps/pwa/src/editor/`.

**Spec:** [documentation/specs/007-23-10-2026-timeline-scale.md](../specs/007-23-10-2026-timeline-scale.md)

## Decisions

Chosen during brainstorming, before the spec was written. One row per decision that could
reasonably have gone the other way.

| #   | Chosen                                                               | Rejected, and why                                                                                                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | A fixed scale in px per 0.1 s cell                                   | _Keep the elastic timeline and enlarge the cell on narrow windows_ — the cell size would still depend on the window, which is the defect; it only moves the threshold at which it bites.                                                                                                                           |
| D2  | Four levels, 24 / 18 / 12 / 6, outwards only                         | _Continuous zoom_ — needs a slider or a wheel gesture, a minimum and a maximum anyway, and lands on scales where a cell is a fraction of a pixel. _Levels above 24_ — nothing asked to go finer than a 24 px cell, and the ladder would grow without a stop.                                                       |
| D3  | One clipping window per surface, translated by a shared `scrollLeft` | _Native `overflow-x` on each surface, synced on scroll_ — every surface grows its own scrollbar, and syncing scroll events between four of them is a feedback loop to damp. _A two-column layout, gutter beside one scroller_ — splits every row in two and breaks the vertical drag-to-reorder that owns the row. |
| D4  | One real scrollbar, below the surfaces, driving the offset           | _The window itself scrolls natively_ — then the gutter scrolls with it, and the spec pins the gutter.                                                                                                                                                                                                              |
| D5  | The view's three movements live in pure functions                    | _Compute them inside the components_ — jsdom has no layout, so the rules would be testable only through stubbed `getBoundingClientRect`s, which is how the current timeline tests already strain.                                                                                                                  |
| D6  | The level and the offset share one context                           | _Two contexts_ — a zoom changes both in one go, and two providers would make that two renders and a sync problem.                                                                                                                                                                                                  |
| D7  | The px helpers replace the percent helpers outright                  | _Keep both and migrate surface by surface_ — two sources of truth for where a time sits, and the two would disagree the first time one was changed.                                                                                                                                                                |
| D8  | Watch mode keeps the elastic scrubber                                | _Scale it too, for consistency_ — a coach who only wants to watch would have to scroll to follow their own exercise, and there is no timeline there for it to align with.                                                                                                                                          |
| D9  | The snap radius becomes a distance in pixels                         | _Leave it at 2 % of the duration_ — a constant on-screen distance under an elastic timeline, but four times stronger at level 1 than at level 4 under a fixed one, pulling hardest exactly where precision was the point.                                                                                          |
| D10 | A drag at the window's edge scrolls the view                         | _Accept that a drag reaches only what is on screen_ — moving a keyframe from 2 s to 14 s would need a zoom out, a drag, and a zoom back in; the gesture exists to be direct.                                                                                                                                       |

## Global Constraints

Copied from `AGENTS.md`; every task's requirements implicitly include these.

- Every user-facing string goes through `t('<area>.<feature>.<purpose>', 'English default')`, and `pnpm --filter @phoopers/pwa extract:i18n` runs in the same commit as the source change, with the French value filled in. `pnpm --filter @phoopers/pwa i18n:check` must pass.
- `pnpm lint` (eslint with `--max-warnings 0`, then prettier) must pass before every commit.
- `pnpm --filter @phoopers/pwa typecheck` must pass before every commit.
- Conventional commits (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`), no co-author lines.
- Mantine first for components; plain elements only where Mantine fights the job.
- A React context follows the `XxxContextProvider` / `useXxxContext` pattern, the hook co-located with its value type and `createContext` call, throwing outside the provider.
- This plan file and its `documentation/plans/index.md` entry are committed as `docs: add plan 008 — Timeline scale and zoom` BEFORE any implementation commit.

## Review Focus

Input classes the spec implies but no task's obvious test exercises. Each line's test is added
to the task that owns the code, in that task's own step style.

1. **A play shorter than the window.** `contentWidthPx` is then under the viewport width, every scroll target clamps to 0, and the scrollbar must not offer a range. Owned by Task 2.
2. **A duration of zero, or a non-finite one.** `rowsOf` still yields rows and the grid still renders; a content width of `NaN` would put every marker at `NaN` px. Owned by Task 1.
3. **A zoom while the playhead sits at t = 0 or at the very end.** The anchor rule and the clamp fight: the spec says the clamp wins and the playhead takes whatever place that leaves. Owned by Task 2.
4. **A viewport width of zero**, which is what jsdom reports and what a collapsed panel gives. Every rule must return a finite offset rather than dividing by it. Owned by Task 2.
5. **A drag whose pointer leaves the window entirely**, past the edge rather than at it. The auto-scroll must keep its last direction rather than stopping or reversing. Owned by Task 8.

## File Structure

**Created**

- `apps/pwa/src/editor/timelineScale.ts` — the levels and the time ↔ x arithmetic. Pure.
- `apps/pwa/src/editor/timelineScroll.ts` — where the view should be, for the three cases that move it. Pure.
- `apps/pwa/src/editor/TimelineViewportContextProvider.tsx` — holds the level and the offset.
- `apps/pwa/src/editor/useTimelineViewportContext.ts` — the hook, the value type and the context.
- `apps/pwa/src/editor/TimelineZoomControls.tsx` — the two buttons.
- `apps/pwa/src/editor/TimelineScrollbar.tsx` — the one real scrollbar.
- `apps/pwa/src/editor/TimeWindow.tsx` — the clipping box every surface wraps its time axis in.

**Modified**

- `apps/pwa/src/editor/timelineGeometry.ts` — percent helpers out, px helpers in.
- `apps/pwa/src/editor/TimelineRow.tsx`, `StepRuler.tsx`, `TimeGrid.tsx`, `Timeline.tsx` — px positions, inside a `TimeWindow`.
- `apps/pwa/src/editor/useTimeDrag.ts` — edge auto-scroll.
- `apps/pwa/src/play2d/PlaybackTransport.tsx` — the scrubber at a fixed scale in edit mode only.
- `apps/pwa/src/play2d/PlayView.tsx` — the provider, the zoom row, the scrollbar.
- `documentation/limitations.md` — what the fixed scale costs.

---

### Task 1: The scale

**Files:**

- Create: `apps/pwa/src/editor/timelineScale.ts`
- Test: `apps/pwa/src/editor/timelineScale.test.ts`

**Interfaces:**

- Consumes: `TIME_GRID_S` from `apps/pwa/src/play2d/transportMath.ts`.
- Produces: `ZOOM_LEVELS: readonly number[]` (px per cell, `[24, 18, 12, 6]`), `type ZoomLevel = number`, `pxPerSecond(pxPerCell: number): number`, `xOfTime(t: number, pxPerCell: number): number`, `timeAtX(x: number, pxPerCell: number): number`, `contentWidthPx(duration: number, pxPerCell: number): number`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('the timeline scale', () => {
  it('runs from 24 px a cell outwards', () => {
    expect(ZOOM_LEVELS).toEqual([24, 18, 12, 6]);
  });
  it('turns a cell size into a speed', () => {
    expect(pxPerSecond(24)).toBe(240);
    expect(pxPerSecond(6)).toBe(60);
  });
  it('places a time at its distance from zero', () => {
    expect(xOfTime(2.5, 24)).toBe(600);
    expect(xOfTime(0, 24)).toBe(0);
  });
  it('reads a time back from a distance', () => {
    expect(timeAtX(600, 24)).toBeCloseTo(2.5, 9);
  });
  it('is as wide as the play is long', () => {
    expect(contentWidthPx(18, 24)).toBe(4320);
  });
  // Review Focus 2: a degenerate duration yields a width, never NaN.
  it('gives a zero width to a duration that is zero or not a number', () => {
    expect(contentWidthPx(0, 24)).toBe(0);
    expect(contentWidthPx(Number.NaN, 24)).toBe(0);
    expect(contentWidthPx(-3, 24)).toBe(0);
  });
  it('reads a non-finite distance as time zero', () => {
    expect(timeAtX(Number.NaN, 24)).toBe(0);
    expect(timeAtX(100, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @phoopers/pwa test -- src/editor/timelineScale.test.ts`
Expected: FAIL, the module does not exist.

- [ ] **Step 3: Implement the module**

`pxPerSecond` is `pxPerCell / TIME_GRID_S`. Every function returns 0 rather than a non-finite number, the way `timeFromClientX` already does for a degenerate box.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @phoopers/pwa test -- src/editor/timelineScale.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/src/editor/timelineScale.ts apps/pwa/src/editor/timelineScale.test.ts
git commit -m "feat: measure the timeline in pixels per grid cell"
```

---

### Task 2: Where the view should be

**Files:**

- Create: `apps/pwa/src/editor/timelineScroll.ts`
- Test: `apps/pwa/src/editor/timelineScroll.test.ts`

**Interfaces:**

- Consumes: nothing from Task 1 — these are pixel rules and take pixels.
- Produces: `interface ViewportBox { scrollLeft: number; viewportWidthPx: number; contentWidthPx: number }`, `clampScroll(scrollLeft: number, box: ViewportBox): number`, `scrollToFollow(playheadX: number, box: ViewportBox): number`, `scrollAroundZoom(playheadXBefore: number, playheadXAfter: number, box: ViewportBox): number`, `scrollForEdgeDrag(pointerOffsetX: number, box: ViewportBox): number`, and the constants `FOLLOW_BAND_MIN = 0.1`, `FOLLOW_BAND_MAX = 0.9`, `EDGE_SCROLL_PX = 24`.

- [ ] **Step 1: Write the failing tests**

```ts
const box = (over: Partial<ViewportBox> = {}): ViewportBox => ({
  scrollLeft: 0,
  viewportWidthPx: 1000,
  contentWidthPx: 4320,
  ...over,
});

describe('clampScroll', () => {
  it('stops at both ends', () => {
    expect(clampScroll(-50, box())).toBe(0);
    expect(clampScroll(9999, box())).toBe(3320); // content - viewport
  });
  // Review Focus 1: nothing to scroll when the play fits.
  it('has nowhere to go when the play is narrower than the window', () => {
    expect(clampScroll(200, box({ contentWidthPx: 400 }))).toBe(0);
  });
  // Review Focus 4: jsdom and a collapsed panel both report zero.
  it('returns a finite offset for a window of no width', () => {
    expect(clampScroll(100, box({ viewportWidthPx: 0 }))).toBe(100);
    expect(clampScroll(100, box({ viewportWidthPx: 0, contentWidthPx: 0 }))).toBe(0);
  });
});

describe('scrollToFollow', () => {
  it('leaves the view alone inside the band', () => {
    expect(scrollToFollow(500, box())).toBe(0); // 50 % across
    expect(scrollToFollow(899, box())).toBe(0);
  });
  it('carries the playhead at the far edge of the band', () => {
    expect(scrollToFollow(950, box())).toBe(50); // back to 90 %
  });
  it('carries it at the near edge when the play runs backwards', () => {
    expect(scrollToFollow(150, box({ scrollLeft: 100 }))).toBe(50); // back to 10 %
  });
});

describe('scrollAroundZoom', () => {
  it('keeps the playhead the same fraction across the window', () => {
    // 30 % across before; the same 30 % after, at the new scale.
    expect(scrollAroundZoom(300, 600, box())).toBe(300);
  });
  // Review Focus 3: the clamp has the last word at either end.
  it('stops at the start rather than holding the fraction', () => {
    expect(scrollAroundZoom(100, 40, box())).toBe(0);
  });
  it('centres the playhead when it was out of sight', () => {
    expect(scrollAroundZoom(-200, 2000, box())).toBe(1500); // centred in 1000
  });
});

describe('scrollForEdgeDrag', () => {
  it('does nothing away from the edges', () => {
    expect(scrollForEdgeDrag(500, box({ scrollLeft: 100 }))).toBe(100);
  });
  it('pulls the view along at either edge', () => {
    expect(scrollForEdgeDrag(995, box({ scrollLeft: 100 }))).toBe(124);
    expect(scrollForEdgeDrag(5, box({ scrollLeft: 100 }))).toBe(76);
  });
  // Review Focus 5: past the edge keeps the direction rather than reversing.
  it('keeps scrolling when the pointer is beyond the window', () => {
    expect(scrollForEdgeDrag(1400, box({ scrollLeft: 100 }))).toBe(124);
    expect(scrollForEdgeDrag(-300, box({ scrollLeft: 100 }))).toBe(76);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @phoopers/pwa test -- src/editor/timelineScroll.test.ts`
Expected: FAIL, the module does not exist.

- [ ] **Step 3: Implement the module**

`playheadX` and `pointerOffsetX` are distances from the content's left edge and from the window's left edge respectively; every function returns a `clampScroll`ed offset. The edge zone is `EDGE_SCROLL_PX` wide at each end of the window, and a pointer past the window counts as being in the nearer zone.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @phoopers/pwa test -- src/editor/timelineScroll.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/src/editor/timelineScroll.ts apps/pwa/src/editor/timelineScroll.test.ts
git commit -m "feat: decide where the timeline's view belongs"
```

---

### Task 3: The viewport context

**Files:**

- Create: `apps/pwa/src/editor/useTimelineViewportContext.ts`, `apps/pwa/src/editor/TimelineViewportContextProvider.tsx`
- Test: `apps/pwa/src/editor/timelineViewport.test.tsx`

**Interfaces:**

- Consumes: `ZOOM_LEVELS`, `contentWidthPx` (Task 1); `clampScroll` (Task 2).
- Produces: `TimelineViewportContextValue { pxPerCell: number; canZoomIn: boolean; canZoomOut: boolean; zoomIn: () => void; zoomOut: () => void; scrollLeft: number; scrollTo: (x: number) => void; viewportWidthPx: number; setViewportWidthPx: (px: number) => void; contentWidthPx: number }`, the provider `TimelineViewportContextProvider({ duration, children })`, and the hook `useTimelineViewportContext()`.

- [ ] **Step 1: Write the failing tests**

```tsx
// A probe component reads the context and prints what the assertions need.
describe('the timeline viewport', () => {
  it('opens at the finest level, where it cannot go finer', () => {
    // pxPerCell 24, canZoomIn false, canZoomOut true
  });
  it('steps outwards and back along the ladder', () => {
    // zoomOut thrice: 18, 12, 6; canZoomOut false at 6; zoomIn once: 12
  });
  it('is as wide as the play is long at the current level', () => {
    // duration 18 → 4320 at level 1, 1080 after three zoomOuts
  });
  it('refuses a scroll past either end', () => {
    // scrollTo(-10) → 0; scrollTo(99999) → contentWidthPx - viewportWidthPx
  });
  it('throws when used outside its provider', () => {
    expect(() => render(<Probe />)).toThrow(/useTimelineViewportContext.*TimelineViewportContextProvider/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @phoopers/pwa test -- src/editor/timelineViewport.test.tsx`
Expected: FAIL, the module does not exist.

- [ ] **Step 3: Implement the hook, the value type and the context in `useTimelineViewportContext.ts`, the provider in `TimelineViewportContextProvider.tsx`**

The provider holds a level index and a `scrollLeft` in state, and derives `pxPerCell`, `contentWidthPx`, `canZoomIn` and `canZoomOut`. `scrollTo` clamps through `clampScroll`. The level resets when the provider mounts, which is what makes it per-editor-session.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @phoopers/pwa test -- src/editor/timelineViewport.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/src/editor/useTimelineViewportContext.ts apps/pwa/src/editor/TimelineViewportContextProvider.tsx apps/pwa/src/editor/timelineViewport.test.tsx
git commit -m "feat: hold the timeline's zoom level and scroll offset"
```

---

### Task 4: Pixel geometry

**Files:**

- Modify: `apps/pwa/src/editor/timelineGeometry.ts` — remove `percentOf`, `spanWidth`, `fractionOf`'s use as a position, and `timeFromClientX`'s dependence on the box's width
- Modify: `apps/pwa/src/editor/TimelineRow.tsx:286-287,337-338,439-454`, `apps/pwa/src/editor/StepRuler.tsx:108-157`
- Test: `apps/pwa/src/editor/timelineGeometry.test.ts`

**Interfaces:**

- Consumes: `xOfTime`, `timeAtX` (Task 1); `pxPerCell` from the context (Task 3).
- Produces: `leftPx(t: number, pxPerCell: number): string`, `spanPx(from: number, to: number, pxPerCell: number): string` (both CSS lengths, e.g. `'600px'`), `barResize(from, to, pxPerCell)` keeping its current shape, and `timeFromClientX(clientX: number, rect: DOMRect, pxPerCell: number): number` reading `clientX - rect.left` against the scale rather than against `rect.width`.

`TimelineBar`'s props are renamed with them: `leftPercent` → `left`, `widthPercent` → `width`, both CSS lengths.

- [ ] **Step 1: Write the failing tests**

```ts
describe('placing a time', () => {
  it('is a distance, not a share', () => {
    expect(leftPx(2.5, 24)).toBe('600px');
    expect(spanPx(1, 2.5, 24)).toBe('360px');
  });
  it('reads a pointer against the scale, whatever the box is', () => {
    const rect = { left: 100, width: 0 } as DOMRect; // jsdom's own answer
    expect(timeFromClientX(340, rect, 24)).toBeCloseTo(1.0, 9);
  });
  it('clamps below zero and never returns NaN', () => {
    expect(timeFromClientX(-500, { left: 0, width: 0 } as DOMRect, 24)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @phoopers/pwa test -- src/editor/timelineGeometry.test.ts`
Expected: FAIL, `leftPx` is not exported.

- [ ] **Step 3: Replace the percent helpers and their callers**

The duration no longer reaches these helpers at all: a row, a bar and a ruler tick take `pxPerCell` from the context instead of `duration` from their props. `timeFromClientX` keeps its upper clamp at the play's duration, which it now receives alongside the scale.

- [ ] **Step 4: Run the whole suite**

Run: `pnpm --filter @phoopers/pwa test`
Expected: the geometry tests PASS. Timeline tests that stub `getBoundingClientRect` widths are expected to fail here and are repaired in Task 5, which is the commit they belong to; if they pass unchanged, say so rather than changing them.

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/src/editor/timelineGeometry.ts apps/pwa/src/editor/timelineGeometry.test.ts apps/pwa/src/editor/TimelineRow.tsx apps/pwa/src/editor/StepRuler.tsx apps/pwa/src/editor/TimelineBar.tsx
git commit -m "feat: position the timeline's contents in pixels"
```

---

### Task 5: One scrolling surface

**Files:**

- Create: `apps/pwa/src/editor/TimeWindow.tsx`, `apps/pwa/src/editor/TimelineScrollbar.tsx`
- Modify: `apps/pwa/src/editor/Timeline.tsx:157-262`, `apps/pwa/src/editor/TimeGrid.tsx`, `apps/pwa/src/editor/TimelineRow.tsx:260-270`, `apps/pwa/src/editor/StepRuler.tsx`
- Test: `apps/pwa/src/editor/timelineScrolling.test.tsx`

**Interfaces:**

- Consumes: the context (Task 3).
- Produces: `TimeWindow({ children, testId }: { children: ReactNode; testId?: string })` — a box with `overflow: hidden` whose single child is `contentWidthPx` wide and carries `transform: translateX(-scrollLeft)`; it measures itself with a `ResizeObserver` and reports through `setViewportWidthPx`. `TimelineScrollbar()` — a `SCROLLBAR_GUTTER_PX`-tall strip of `overflow-x: auto` holding a spacer of `contentWidthPx`, whose `onScroll` calls `scrollTo`.

- [ ] **Step 1: Write the failing tests**

```tsx
describe('the timeline as one surface', () => {
  it('gives every time surface the same offset', async () => {
    // scroll the scrollbar to 300; the grid, the ruler and each row's track all read
    // transform: translateX(-300px)
  });
  it('is as wide as the play, not as wide as the window', () => {
    // a row's content box has width: 4320px for an 18 s play at level 1
  });
  it('keeps the gutter still while the tracks move', () => {
    // the row's label box carries no transform after a scroll
  });
  it('reserves the scrollbar place whether or not it scrolls', () => {
    // the strip is in the document for a 2 s play that fits
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @phoopers/pwa test -- src/editor/timelineScrolling.test.tsx`
Expected: FAIL, `TimeWindow` does not exist.

- [ ] **Step 3: Wrap each surface's time axis in a `TimeWindow`**

Four call sites: the grid's lines, the ruler's bars, each row's track, and the playhead overlay in `Timeline.tsx`. The gutter stays outside the window in every case, and the `TRACK_INSET_PX` margin each surface already carries stays on the window rather than moving inside it, so the inset the spec asks for at each end of the axis is the one that is there today. The scrollbar is rendered once, below the rows, inside `Timeline`.

- [ ] **Step 4: Repair the timeline tests that stubbed widths**

The stubs in `Timeline.test.tsx:284-294` and `:718-720` exist because jsdom reports a zero-width box; with the scale the arithmetic no longer reads a width, so a stub that fed a width now feeds nothing. Delete the stub where the test passes without it and keep it only where the test genuinely needs a `left`.

- [ ] **Step 5: Run the whole suite**

Run: `pnpm --filter @phoopers/pwa test`
Expected: PASS, including the files Task 4 left red.

- [ ] **Step 6: Commit**

```bash
git add apps/pwa/src/editor/TimeWindow.tsx apps/pwa/src/editor/TimelineScrollbar.tsx apps/pwa/src/editor/Timeline.tsx apps/pwa/src/editor/TimeGrid.tsx apps/pwa/src/editor/TimelineRow.tsx apps/pwa/src/editor/StepRuler.tsx apps/pwa/src/editor/Timeline.test.tsx apps/pwa/src/editor/timelineScrolling.test.tsx
git commit -m "feat: scroll the timeline's surfaces as one"
```

---

### Task 6: The scrubber at a fixed scale

**Files:**

- Modify: `apps/pwa/src/play2d/PlaybackTransport.tsx:149-184`
- Test: `apps/pwa/src/play2d/playbackTransport.test.tsx`

**Interfaces:**

- Consumes: the context (Task 3), `TimeWindow` (Task 5).
- Produces: nothing new. The `Slider` keeps every prop it has — `marks`, `step`, `label`, `aria-label`, keyboard seeking, `snapToStep` — and is wrapped in a `TimeWindow` whose content is `contentWidthPx` wide **only in edit mode**. Watch mode renders exactly what it renders today.

- [ ] **Step 1: Write the failing tests**

```tsx
describe('the scrubber', () => {
  it('takes the timeline scale while authoring', () => {
    // in edit mode, the slider's box is contentWidthPx wide and sits in a TimeWindow
  });
  it('stays elastic while watching', () => {
    // in play mode there is no TimeWindow and no scrollbar around it
  });
  it('still seeks with the arrow keys at a fixed scale', () => {
    // focus the slider in edit mode, press ArrowRight, the playhead time advances one cell
  });
  it('still shows a mark for every step', () => {
    // the mark count equals the step count in both modes
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @phoopers/pwa test -- src/play2d/playbackTransport.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Wrap the slider for edit mode only**

The mode comes from `useEditorContext`, which the transport already reads. Watch mode takes the branch that exists today, untouched.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @phoopers/pwa test -- src/play2d`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/src/play2d/PlaybackTransport.tsx apps/pwa/src/play2d/playbackTransport.test.tsx
git commit -m "feat: scale the scrubber with the tracks while authoring"
```

---

### Task 7: The zoom control

**Files:**

- Create: `apps/pwa/src/editor/TimelineZoomControls.tsx`
- Modify: `apps/pwa/src/play2d/PlayView.tsx:136-152`, `apps/pwa/src/i18n/locales/{en,fr}/common.json`
- Test: `apps/pwa/src/editor/timelineZoom.test.tsx`

**Interfaces:**

- Consumes: the context (Task 3).
- Produces: `TimelineZoomControls()` — a right-ranged `Group` of two `ActionIcon`s, `IconMinus` and `IconPlus`, labelled `t('play.timeline.zoomOut', 'Zoom out')` and `t('play.timeline.zoomIn', 'Zoom in')`, each `disabled` at its end of the ladder. Rendered in edit mode only, on its own row above the transport.

- [ ] **Step 1: Write the failing tests**

```tsx
describe('the zoom control', () => {
  it('cannot go finer than the level it opens at', () => {
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled();
  });
  it('widens the view a step at a time', async () => {
    // three clicks on Zoom out; a row's content width goes 4320 → 3240 → 2160 → 1080
  });
  it('stops at the widest level', async () => {
    // after three clicks, Zoom out is disabled and Zoom in is not
  });
  it('is absent while watching', () => {
    expect(screen.queryByRole('button', { name: 'Zoom out' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @phoopers/pwa test -- src/editor/timelineZoom.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Build the control and place it**

The row sits above `PlaybackTransport` inside the time region, outside the grid's layer so the grid does not run behind it.

- [ ] **Step 4: Extract and translate the strings**

Run: `pnpm --filter @phoopers/pwa extract:i18n`, fill the French values, then `pnpm --filter @phoopers/pwa i18n:check`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @phoopers/pwa test -- src/editor/timelineZoom.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/pwa/src/editor/TimelineZoomControls.tsx apps/pwa/src/play2d/PlayView.tsx apps/pwa/src/editor/timelineZoom.test.tsx apps/pwa/src/i18n/locales
git commit -m "feat: zoom the timeline with two buttons"
```

---

### Task 8: The view follows

**Files:**

- Modify: `apps/pwa/src/editor/Timeline.tsx:33-45`, `apps/pwa/src/editor/TimelineViewportContextProvider.tsx`, `apps/pwa/src/editor/useTimeDrag.ts:72-87`
- Test: `apps/pwa/src/editor/timelineFollow.test.tsx`

**Interfaces:**

- Consumes: `scrollToFollow`, `scrollAroundZoom`, `scrollForEdgeDrag` (Task 2); `xOfTime` (Task 1); the context (Task 3).
- Produces: nothing new. Three wirings — the playhead subscription calls `scrollToFollow` while playing, `zoomIn`/`zoomOut` call `scrollAroundZoom` with the playhead's x before and after, and `useTimeDrag`'s `onPointerMove` calls `scrollForEdgeDrag`.

- [ ] **Step 1: Write the failing tests**

```tsx
describe('the view while the play runs', () => {
  it('holds still while the playhead is inside the band', () => {});
  it('carries the playhead at the far edge', () => {});
  it('does not move on its own while the play is stopped', () => {});
});
describe('the view around a zoom', () => {
  it('keeps the playhead where it was in the window', () => {});
});
describe('the view during a drag', () => {
  // Review Focus 5 lives in Task 2's unit tests; this is the wiring.
  it('scrolls when the pointer reaches the edge, and the drag goes on', () => {});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @phoopers/pwa test -- src/editor/timelineFollow.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Wire the three rules**

The follow runs inside the existing `subscribe` callback, beside the direct style write, so a playing clock still re-renders nothing. The drag's scroll happens before the pointer's time is read, so the time the gesture resolves is the one under the pointer after the view moved.

- [ ] **Step 4: Run the whole suite**

Run: `pnpm --filter @phoopers/pwa test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/src/editor/Timeline.tsx apps/pwa/src/editor/TimelineViewportContextProvider.tsx apps/pwa/src/editor/useTimeDrag.ts apps/pwa/src/editor/timelineFollow.test.tsx
git commit -m "feat: move the timeline's view with the playhead and the pointer"
```

---

### Task 9: The snap radius in pixels

**Files:**

- Modify: `apps/pwa/src/editor/TimelineRow.tsx:50`, `apps/pwa/src/editor/StepRuler.tsx:14`
- Test: `apps/pwa/src/editor/snapRadius.test.ts`

**Interfaces:**

- Consumes: `timeAtX` (Task 1).
- Produces: `SNAP_RADIUS_PX = 12`, replacing `SNAP_FRACTION`. The radius in seconds is `timeAtX(SNAP_RADIUS_PX, pxPerCell)`, so it is the same distance on screen at every level.

- [ ] **Step 1: Write the failing test**

```ts
it('pulls from the same distance on screen at every level', () => {
  expect(snapRadiusSeconds(24)).toBeCloseTo(0.05, 9);
  expect(snapRadiusSeconds(6)).toBeCloseTo(0.2, 9);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @phoopers/pwa test -- src/editor/snapRadius.test.ts`
Expected: FAIL.

- [ ] **Step 3: Replace the fraction with the pixel radius at both call sites**

- [ ] **Step 4: Run the whole suite**

Run: `pnpm --filter @phoopers/pwa test`
Expected: PASS. A snapping test written against `SNAP_FRACTION` may need its expected time changed; change the expectation, not the rule.

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/src/editor/TimelineRow.tsx apps/pwa/src/editor/StepRuler.tsx apps/pwa/src/editor/snapRadius.test.ts
git commit -m "feat: make the timeline's snap the same distance at every zoom"
```

---

### Task 10: What it costs, written down

**Files:**

- Modify: `documentation/limitations.md`, `documentation/specs/index.md`, `documentation/plans/index.md`

- [ ] **Step 1: Record the limitations the spec accepted**

Under a `## Timeline` heading: a play past roughly 24 s shows whole seconds only at every level, because the grid's cap counts lines rather than measuring them; and a whole system can no longer be seen at once unless it fits, the scrubber having given up its overview. Each entry says what it costs **measured** — the shortest play that loses its cell lines, and the longest play that still fits a 1440 px window at level 4 — why it was left, and how it would be fixed.

- [ ] **Step 2: Mark spec 007 and plan 008 Implemented in both indexes**

- [ ] **Step 3: Run the checks**

Run: `pnpm lint && pnpm --filter @phoopers/pwa typecheck && pnpm --filter @phoopers/pwa test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add documentation
git commit -m "docs: record what the timeline's fixed scale costs"
```
