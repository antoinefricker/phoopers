# Step Label Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a step's name a display window the coach sets, shown on the timeline as a bar with a draggable end, edit and delete controls.

**Architecture:** `Step` gains an optional `duration`, read by nothing in the engine's sampler — it governs display only. A window query beside `stepAt` turns `(t, steps, playDuration)` into the step whose name is showing. The screen bar is extracted into a shared component first, with screens still its only caller and every existing test green, and the step bar is then its second caller.

**Tech Stack:** React 19, Mantine 9, Vitest + Testing Library, the engine at `apps/pwa/src/engine/`.

**Spec:** [documentation/specs/004-14-10-2026-step-label-display.md](../specs/004-14-10-2026-step-label-display.md)

## Decisions

Chosen during brainstorming, before the spec was written. One row per decision that could
reasonably have gone the other way.

| #   | Chosen                                                                             | Rejected, and why                                                                                                                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | A `duration` on `Step`                                                             | _A separate `labels` collection_ — two near-identical concepts in the model, and the names already written on steps would not show. More model, more validation, more interface, for a flexibility nothing asks for yet.                                                                  |
| D2  | The duration governs display only                                                  | _The duration is a phase of play_ — makes a step an interval, which changes what forking at a step means, what prev/next navigation moves between, and what the engine resolves. A far larger change, and not what was asked.                                                             |
| D3  | `duration` is optional; absent means "until the next step"                         | _Required, with a default set at creation_ — every authored step, the sample play and every fixture would need one, and a play written before this change would read differently from how its author left it. Optional costs one fallback branch and keeps existing plays byte-identical. |
| D4  | Windows may not overlap: the handle stops at the next step                         | _Overlap allowed, latest step wins_ — two bars drawn over each other on one row, and a name that depends on reading order. The non-overlap rule makes "which name is showing" answerable by position alone.                                                                               |
| D5  | A retime or an inserted step may leave a window overrunning; validation reports it | _Constrain the retime by the duration_ — a step's instant would depend on how long its name shows, which is backwards: the name annotates the moment, not the reverse. _Truncate the duration silently_ — loses what the coach set, with no way to notice.                                |
| D6  | The bar is a component shared with the screen bar                                  | _Two independent bars_ — the handle, the drag plumbing and the controls would be written twice and drift apart. Sharing is also what the request asked for, so the two can be changed together later.                                                                                     |

## Global Constraints

Copied from `AGENTS.md`; every task's requirements implicitly include these.

- Every user-facing string goes through `t('<area>.<feature>.<purpose>', 'English default')`, and `pnpm --filter @phoopers/pwa extract:i18n` runs in the same commit as the source change, with the French value filled in. `pnpm --filter @phoopers/pwa i18n:check` must pass.
- `pnpm lint` (eslint with `--max-warnings 0`, then prettier) must pass before every commit.
- `pnpm --filter @phoopers/pwa typecheck` must pass before every commit.
- Conventional commits (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`), no co-author lines.
- Mantine first for components; plain elements only where Mantine fights the job.
- This plan file and its `documentation/plans/index.md` entry are committed as `docs: add plan 005 — Step label display` BEFORE any implementation commit.

## Review Focus

Input classes the spec implies but no task's obvious test exercises. Each line's test is added
to the task that owns the code, in that task's own step style.

1. **Two steps at the same `t`.** A window capped at "the next step" is then zero-length. The caption must still name one of them rather than flickering or naming none. Owned by Task 2.
2. **A non-finite `duration` reaching the view.** `validatePlay` reports it, but reporting does not remove it: the caption and the bar must not show a name for ever nor compute a `NaN` width. Owned by Task 2 and Task 6.
3. **An inherited step's window on a child branch.** An ancestor's step is shown but not editable: its bar must offer no handle and no controls. The caption needs no case of its own — `stepLabelAt` reads `timeline.steps`, which `resolveBranch` has already filled with the ancestors' steps. Owned by Task 6.
4. **A step at the very end of the play, and a play of zero duration.** The cap is the end of the play, which may equal the step's own `t`. Owned by Task 5.
5. **A duration overrunning the next step after a retime.** D5 lets this state exist. The caption must pick a name deterministically — the window that starts latest at or before the playhead — rather than depending on array order. Owned by Task 2.

---

## File Structure

| File                                            | Responsibility                                                                          |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| `apps/pwa/src/engine/types.ts`                  | `Step.duration?`, and the two new `IssueCode` members                                   |
| `apps/pwa/src/engine/validate.ts`               | Reports a bad duration and an overrunning window                                        |
| `apps/pwa/src/play2d/transportMath.ts`          | `stepLabelAt`: which step's name is showing at a time                                   |
| `apps/pwa/src/play2d/StepCaption.tsx`           | Reads `stepLabelAt` instead of `stepAt`                                                 |
| `apps/pwa/src/editor/TimelineBar.tsx`           | **New.** The bar shared by a screen and a step label: span, right-edge handle, controls |
| `apps/pwa/src/editor/TimelineRow.tsx`           | Screen bar rebuilt on `TimelineBar`                                                     |
| `apps/pwa/src/editor/mutations/structure.ts`    | `setStepDuration`                                                                       |
| `apps/pwa/src/editor/useEditorContext.ts`       | `setStepDuration` on the context value                                                  |
| `apps/pwa/src/editor/EditorContextProvider.tsx` | Wires `setStepDuration`                                                                 |
| `apps/pwa/src/editor/StepRuler.tsx`             | Ticks become bars on `TimelineBar`, with handle, edit and delete                        |

---

### Task 1: `Step.duration` in the model, and its validation

**Files:**

- Modify: `apps/pwa/src/engine/types.ts` (the `Step` interface and `IssueCode`)
- Modify: `apps/pwa/src/engine/validate.ts`
- Test: `apps/pwa/src/engine/validate.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `Step.duration?: number`; issue codes `'step-duration-not-positive'` and `'step-label-window-overruns'`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/pwa/src/engine/validate.test.ts`:

```ts
describe('step label durations', () => {
  const withSteps = (steps: Step[]): Play => ({
    ...fixturePlay,
    branches: fixturePlay.branches.map((b) => (b.id === ROOT ? { ...b, steps } : b)),
  });

  it('accepts a step with no duration at all', () => {
    // Absent means "until the next step", which is the behaviour every play written before
    // this field had. Such a play must stay valid untouched.
    expect(validatePlay(withSteps([{ id: 's1' as StepId, t: 1, name: 'Entry' }]))).toEqual([]);
  });

  it('accepts a duration that ends before the next step', () => {
    const play = withSteps([
      { id: 's1' as StepId, t: 1, name: 'Entry', duration: 0.5 },
      { id: 's2' as StepId, t: 2, name: 'Switch' },
    ]);

    expect(validatePlay(play)).toEqual([]);
  });

  it('reports a duration that is not a positive number', () => {
    for (const duration of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const codes = validatePlay(withSteps([{ id: 's1' as StepId, t: 1, name: 'Entry', duration }])).map((i) => i.code);

      expect(codes).toContain('step-duration-not-positive');
    }
  });

  it('reports a window that runs past the next step', () => {
    const play = withSteps([
      { id: 's1' as StepId, t: 1, name: 'Entry', duration: 2 },
      { id: 's2' as StepId, t: 2, name: 'Switch' },
    ]);
    const issue = validatePlay(play).find((i) => i.code === 'step-label-window-overruns');

    expect(issue?.entityId).toBe('s1');
  });

  it('reports a window that runs past the end of the play', () => {
    // The fixture's last keyframe is at t=4, so the play is 4s long.
    const play = withSteps([{ id: 's1' as StepId, t: 3, name: 'Entry', duration: 2 }]);
    const codes = validatePlay(play).map((i) => i.code);

    expect(codes).toContain('step-label-window-overruns');
  });

  it('judges each branch on its own steps', () => {
    // A child's step at t=3 is not "the next step" for a root step at t=1: they are on
    // different branches and never both shown.
    const play: Play = {
      ...fixturePlay,
      branches: fixturePlay.branches.map((b) =>
        b.id === ROOT ? { ...b, steps: [{ id: 's1' as StepId, t: 1, name: 'Entry', duration: 1.5 }] } : b,
      ),
    };

    expect(validatePlay(play).filter((i) => i.code === 'step-label-window-overruns')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/pwa && pnpm vitest run src/engine/validate.test.ts -t "step label durations"`
Expected: FAIL — the issue codes do not exist, so `toContain` finds nothing.

- [ ] **Step 3: Add the field and the codes**

In `apps/pwa/src/engine/types.ts`, the `Step` interface becomes:

```ts
export interface Step {
  id: StepId;
  t: number;
  name: string;
  /**
   * Seconds the step's name is shown for, from `t`. Absent means "until the next step", which
   * is how a play written before this field reads. Display only: nothing in `resolveBranch` or
   * the sampler reads it.
   */
  duration?: number;
}
```

And two members join `IssueCode`, after `'non-finite-number'`:

```ts
  | 'step-duration-not-positive'
  | 'step-label-window-overruns'
```

- [ ] **Step 4: Write the validation**

In `apps/pwa/src/engine/validate.ts`, inside the per-branch loop that already walks
`branch.steps` for duplicate ids, add:

```ts
// A label's window may not reach the next step's instant, nor the end of the play. The
// editor's handle cannot produce either, but a retime or an inserted step can, so the state
// is reported rather than assumed away.
const ordered = [...branch.steps].sort((a, b) => a.t - b.t);
ordered.forEach((step, index) => {
  if (step.duration === undefined) return;
  if (!Number.isFinite(step.duration) || step.duration <= 0) {
    issues.push(issue('step-duration-not-positive', `step ${step.id} has a non-positive duration`, step.id));
    return;
  }
  const limit = ordered[index + 1]?.t ?? playDuration;
  if (step.t + step.duration > limit) {
    issues.push(issue('step-label-window-overruns', `step ${step.id} label outlasts its window`, step.id));
  }
});
```

`playDuration` is the largest keyframe time across the play; compute it once above the branch
loop:

```ts
const playDuration = Math.max(
  0,
  ...play.branches.flatMap((b) => Object.values(b.tracks).flatMap((track) => track.map((k) => k.t))),
);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/pwa && pnpm vitest run src/engine/validate.test.ts`
Expected: PASS, with every pre-existing case still green.

- [ ] **Step 6: Run the whole suite**

Run: `pnpm test`
Expected: PASS. `Step` gained an optional field, so no existing play or fixture changes.

- [ ] **Step 7: Commit**

```bash
git add apps/pwa/src/engine/types.ts apps/pwa/src/engine/validate.ts apps/pwa/src/engine/validate.test.ts
git commit -m "feat: give a step an optional label duration, and validate it"
```

---

### Task 2: Which step's name is showing

**Files:**

- Modify: `apps/pwa/src/play2d/transportMath.ts`
- Test: `apps/pwa/src/play2d/PlaybackTransport.test.tsx` (where `stepAt` is already tested)

**Interfaces:**

- Consumes: `Step.duration` from Task 1.
- Produces: `stepLabelAt(t: number, steps: readonly Step[], playDuration: number): Step | undefined`.

- [ ] **Step 1: Write the failing tests**

Add to `apps/pwa/src/play2d/PlaybackTransport.test.tsx`, beside the `stepAt` describe:

```ts
describe('stepLabelAt', () => {
  const entry: Step = { id: 's1' as StepId, t: 2, name: 'Screen' };
  const switchTo: Step = { id: 's2' as StepId, t: 4, name: 'Entry' };

  it('names nothing before the first step', () => {
    expect(stepLabelAt(1, [entry, switchTo], 8)).toBeUndefined();
  });

  it('runs to the next step when the step has no duration', () => {
    expect(stepLabelAt(3.9, [entry, switchTo], 8)?.name).toBe('Screen');
    expect(stepLabelAt(4, [entry, switchTo], 8)?.name).toBe('Entry');
  });

  it('runs to the end of the play for a last step with no duration', () => {
    expect(stepLabelAt(7.9, [entry, switchTo], 8)?.name).toBe('Entry');
  });

  it('stops naming a step once its duration is spent', () => {
    const brief = { ...entry, duration: 0.5 };

    expect(stepLabelAt(2.4, [brief, switchTo], 8)?.name).toBe('Screen');
    expect(stepLabelAt(2.6, [brief, switchTo], 8)).toBeUndefined();
  });

  it('names the window that starts latest when one overruns another', () => {
    // Review Focus 5: a retime can leave this state, and the answer must not depend on the
    // order the steps happen to sit in the array.
    const overrunning = { ...entry, duration: 5 };

    expect(stepLabelAt(4.5, [overrunning, switchTo], 8)?.name).toBe('Entry');
    expect(stepLabelAt(4.5, [switchTo, overrunning], 8)?.name).toBe('Entry');
  });

  it('names one of two steps sharing a time rather than none', () => {
    // Review Focus 1: the window is zero-length, so a half-open test would name neither.
    const tied: Step = { id: 's3' as StepId, t: 2, name: 'Also here' };

    expect(stepLabelAt(2, [entry, tied], 8)).toBeDefined();
  });

  it('names nothing for a duration that is not a number', () => {
    // Review Focus 2: validatePlay reports it, which does not remove it from the play.
    const broken = { ...entry, duration: Number.NaN };

    expect(stepLabelAt(3, [broken, switchTo], 8)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/pwa && pnpm vitest run src/play2d/PlaybackTransport.test.tsx -t stepLabelAt`
Expected: FAIL with "stepLabelAt is not a function".

- [ ] **Step 3: Write the implementation**

In `apps/pwa/src/play2d/transportMath.ts`, beside `stepAt`:

```ts
/**
 * The step whose name is showing at `t`, or undefined when none is.
 *
 * A step's window is `[t, t + duration]`, or `[t, the next step's t]` with no duration, or
 * `[t, playDuration]` for a last step with none. Windows cannot overlap by construction — the
 * editor's handle stops at the next step — but a retime can leave one overrunning, so the
 * window starting latest at or before `t` wins; the answer never depends on array order.
 *
 * A duration that is not a positive number gives no window at all. `validatePlay` reports it,
 * which does not remove it from the play, and showing a name for ever would be worse.
 */
export function stepLabelAt(t: number, steps: readonly Step[], playDuration: number): Step | undefined {
  if (!Number.isFinite(t)) return undefined;

  const ordered = [...steps].sort((a, b) => a.t - b.t);
  let showing: Step | undefined;
  ordered.forEach((step, index) => {
    if (step.t > t) return;
    const implicit = ordered[index + 1]?.t ?? playDuration;
    const end =
      step.duration === undefined
        ? implicit
        : Number.isFinite(step.duration) && step.duration > 0
          ? step.t + step.duration
          : step.t;
    // Inclusive at the end so two steps sharing a time still name something.
    if (t <= end) showing = step;
  });

  return showing;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/pwa && pnpm vitest run src/play2d/PlaybackTransport.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/src/play2d/transportMath.ts apps/pwa/src/play2d/PlaybackTransport.test.tsx
git commit -m "feat: resolve which step label is showing at a time"
```

---

### Task 3: The court caption honours the window

**Files:**

- Modify: `apps/pwa/src/play2d/StepCaption.tsx`
- Test: `apps/pwa/src/play2d/StepCaption.test.tsx`

**Interfaces:**

- Consumes: `stepLabelAt` from Task 2.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Add to `apps/pwa/src/play2d/StepCaption.test.tsx`:

```ts
it('stops naming a step once its display duration is spent', async () => {
  const brief: Play = {
    ...hornsPlay,
    branches: hornsPlay.branches.map((b) =>
      b.id === hornsPlay.rootBranchId
        ? { ...b, steps: b.steps.map((s, i) => (i === 0 ? { ...s, duration: 0.5 } : s)) }
        : b,
    ),
  };
  const first = brief.branches[0]?.steps[0];
  if (first === undefined) throw new Error('the sample play has steps');
  renderCaption(brief);

  act(() => controls().seek(first.t + 0.2));
  expect(caption()).toBe(first.name);

  act(() => controls().seek(first.t + 0.8));
  expect(caption()).toBe('');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/pwa && pnpm vitest run src/play2d/StepCaption.test.tsx -t "display duration is spent"`
Expected: FAIL — the caption still shows the name until the next step.

- [ ] **Step 3: Switch the caption to the window**

In `apps/pwa/src/play2d/StepCaption.tsx`, replace the `stepAt` import and call:

```ts
import { stepLabelAt } from './transportMath';
```

```ts
const name = stepLabelAt(t, timeline.steps, timeline.duration)?.name ?? '';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/pwa && pnpm vitest run src/play2d/StepCaption.test.tsx`
Expected: PASS, the earlier cases included — the sample play's steps carry no duration, so they
still run to the next step.

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/src/play2d/StepCaption.tsx apps/pwa/src/play2d/StepCaption.test.tsx
git commit -m "feat: end the court caption when a step's label duration is spent"
```

---

### Task 4: Extract the bar a screen and a step label share

A refactor with no behaviour change: screens are its only caller when the task ends, and every
existing screen case must pass untouched.

**Files:**

- Create: `apps/pwa/src/editor/TimelineBar.tsx`
- Modify: `apps/pwa/src/editor/TimelineRow.tsx` (the screen bar, around lines 100-180)
- Test: `apps/pwa/src/editor/Timeline.test.tsx` (existing screen cases)

**Interfaces:**

- Consumes: `TimeGesture` and `useTimeDrag`'s `bind`, already in `apps/pwa/src/editor/useTimeDrag.ts`.
- Produces:

```ts
type Bound = ReturnType<ReturnType<typeof useTimeDrag>['bind']>;

export interface TimelineBarProps {
  /** Where the bar starts and ends, as fractions of the track, already computed by the caller. */
  leftPercent: string;
  widthPercent: string;
  background: string;
  testId: string;
  /**
   * A gesture on the bar itself, which moves the whole span. A step's bar retimes the step
   * this way, as its tick did; a screen's bar has none, a screen being retimed from its row.
   */
  bar?: Bound;
  /** Absent on an inherited object, which cannot be retimed from here. */
  handle?: { label: string; bind: Bound; testId: string };
  /** Drawn at the bar's end, after the handle. */
  actions?: ReactNode;
  children?: ReactNode;
}
export function TimelineBar(props: TimelineBarProps): ReactElement;
```

- [ ] **Step 1: Write the component**

Create `apps/pwa/src/editor/TimelineBar.tsx`:

```tsx
import { Box } from '@mantine/core';
import type { ReactElement, ReactNode } from 'react';
import type { useTimeDrag } from './useTimeDrag';

export interface TimelineBarProps {
  leftPercent: string;
  widthPercent: string;
  background: string;
  testId: string;
  handle?: { label: string; bind: Record<string, unknown>; testId: string };
  actions?: ReactNode;
  children?: ReactNode;
}

/**
 * A span on a timeline row: a tinted bar, a handle on its right edge that sets where it ends,
 * and controls at that end.
 *
 * Shared by a screen's duration and a step label's display window. The two mean different
 * things — one is a play's content, the other is how it is annotated — but they are the same
 * object on screen, and sharing the component is what lets them be changed together.
 */
export function TimelineBar({
  leftPercent,
  widthPercent,
  background,
  testId,
  bar,
  handle,
  actions,
  children,
}: TimelineBarProps): ReactElement {
  return (
    <Box
      data-testid={testId}
      {...(bar ?? {})}
      style={{
        position: 'absolute',
        top: '25%',
        height: '50%',
        left: leftPercent,
        width: widthPercent,
        background,
        // Transparent to the pointer unless the bar itself is draggable: a screen's row holds
        // the markers the coach reaches past it, and only the handle and the controls take
        // clicks. A step's bar IS the thing it retimes, so it takes them.
        pointerEvents: bar === undefined ? 'none' : 'auto',
        cursor: bar === undefined ? undefined : 'grab',
        touchAction: bar === undefined ? undefined : 'none',
      }}
    >
      {children}
      {handle !== undefined && (
        // A button, not a div: the handle is reachable by keyboard, and the arrow keys retime
        // it through the same constraint the drag uses.
        <button
          type="button"
          data-testid={handle.testId}
          aria-label={handle.label}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: -3,
            width: 6,
            padding: 0,
            border: 0,
            cursor: 'ew-resize',
            touchAction: 'none',
            pointerEvents: 'auto',
            background: 'var(--mantine-color-grape-filled)',
          }}
          {...handle.bind}
        />
      )}
      {actions !== undefined && (
        <Box style={{ position: 'absolute', top: 0, bottom: 0, left: '100%', display: 'flex', pointerEvents: 'auto' }}>
          {actions}
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Rebuild the screen bar on it**

In `apps/pwa/src/editor/TimelineRow.tsx`, the screen's `<Box>` + handle + `CloseButton` become
one `TimelineBar`, with no `bar` prop — a screen is retimed from its row, not from its bar.
The geometry, the `bind({...})` call, the `place`/`restore` bodies and the `CloseButton` move
across unchanged; only their nesting changes. Keep `data-testid` values
exactly as they are — `screen-bar-${screen.id}`, `screen-handle-${screen.id}`,
`screen-remove-${screen.id}` — so no existing case has to move.

- [ ] **Step 3: Run the screen cases to verify nothing moved**

Run: `cd apps/pwa && pnpm vitest run src/editor/Timeline.test.tsx src/editor/selectionActions.test.tsx`
Expected: PASS, with no test file edited in this task.

- [ ] **Step 4: Run the whole suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/src/editor/TimelineBar.tsx apps/pwa/src/editor/TimelineRow.tsx
git commit -m "refactor: extract the bar a screen and a step label share"
```

---

### Task 5: `setStepDuration`

**Files:**

- Modify: `apps/pwa/src/editor/mutations/structure.ts`
- Modify: `apps/pwa/src/editor/useEditorContext.ts`
- Modify: `apps/pwa/src/editor/EditorContextProvider.tsx`
- Test: `apps/pwa/src/editor/mutations/structure.test.ts`

**Interfaces:**

- Consumes: `Step.duration` from Task 1.
- Produces: `setStepDuration(play: Play, stepId: StepId, duration: number): Play`, and the same
  name on `EditorContextValue` as `(stepId: StepId, duration: number) => void`.

- [ ] **Step 1: Write the failing tests**

Add to `apps/pwa/src/editor/mutations/structure.test.ts`:

```ts
describe('setStepDuration', () => {
  it('sets the duration of the step that owns it', () => {
    const play = setStepDuration(fixturePlay, STEP_ENTRY, 1.5);

    expect(steps(play).find((s) => s.id === STEP_ENTRY)?.duration).toBe(1.5);
  });

  it('refuses a duration that is not a positive number', () => {
    // The caller is a drag, which can produce a zero-width bar at the limits of a short play.
    for (const duration of [0, -1, Number.NaN]) {
      expect(setStepDuration(fixturePlay, STEP_ENTRY, duration)).toBe(fixturePlay);
    }
  });

  it('leaves a play without that step untouched', () => {
    expect(setStepDuration(fixturePlay, 'nope' as StepId, 1)).toBe(fixturePlay);
  });

  it('caps nothing itself: the view owns the bounds', () => {
    // Review Focus 4 and D5: the mutation writes what it is given, and validatePlay reports an
    // overrun. Constraining here would need the play's duration, which the view already has.
    const play = setStepDuration(fixturePlay, STEP_ENTRY, 99);

    expect(steps(play).find((s) => s.id === STEP_ENTRY)?.duration).toBe(99);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/pwa && pnpm vitest run src/editor/mutations/structure.test.ts -t setStepDuration`
Expected: FAIL with "setStepDuration is not a function".

- [ ] **Step 3: Write the mutation**

In `apps/pwa/src/editor/mutations/structure.ts`, beside `setScreenDuration`:

```ts
/**
 * Writes a step label's display window. It caps nothing: the handle that calls it already
 * knows the next step and the play's length, and `validatePlay` reports a window that
 * overruns either, which a retime can produce and no constraint here could prevent.
 */
export function setStepDuration(play: Play, stepId: StepId, duration: number): Play {
  if (!Number.isFinite(duration) || duration <= 0) return play;
  const owner = play.branches.find((b) => b.steps.some((s) => s.id === stepId));
  if (owner === undefined) return play;

  return mapBranch(play, owner.id, (b) => ({
    ...b,
    steps: b.steps.map((s) => (s.id === stepId ? { ...s, duration } : s)),
  }));
}
```

- [ ] **Step 4: Put it on the context**

In `apps/pwa/src/editor/useEditorContext.ts`, beside `setScreenDuration`:

```ts
  setStepDuration: (stepId: StepId, duration: number) => void;
```

In `apps/pwa/src/editor/EditorContextProvider.tsx`, beside the other step callbacks:

```ts
const setStepDuration = useCallback<EditorContextValue['setStepDuration']>((stepId, duration) => {
  setPlay((current) => mutations.setStepDuration(current, stepId, duration));
}, []);
```

and add `setStepDuration` to both the value object and its `useMemo` dependency array.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/pwa && pnpm vitest run src/editor/mutations/structure.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/pwa/src/editor/mutations/structure.ts apps/pwa/src/editor/useEditorContext.ts apps/pwa/src/editor/EditorContextProvider.tsx apps/pwa/src/editor/mutations/structure.test.ts
git commit -m "feat: add the mutation that sets a step label's duration"
```

---

### Task 6: Step bars on the ruler

**Files:**

- Modify: `apps/pwa/src/editor/StepRuler.tsx`
- Modify: `apps/pwa/src/i18n/locales/en/common.json`, `apps/pwa/src/i18n/locales/fr/common.json`
- Test: `apps/pwa/src/editor/StepRuler.test.tsx`

**Interfaces:**

- Consumes: `TimelineBar` (Task 4), `setStepDuration` (Task 5), `stepLabelAt` (Task 2, for nothing here — the ruler draws windows, it does not resolve them).
- Produces: test ids `step-bar-${step.id}`, `step-handle-${step.id}`, `step-remove-${step.id}`,
  `step-edit-${step.id}`.

- [ ] **Step 1: Write the failing tests**

Add to `apps/pwa/src/editor/StepRuler.test.tsx`:

```tsx
describe('step label bars', () => {
  it('draws a bar per own step, with a handle and controls', () => {
    renderEditor(fixturePlay, <StepRuler />);

    expect(screen.getByTestId(`step-bar-${STEP_ENTRY}`)).toBeInTheDocument();
    expect(screen.getByTestId(`step-handle-${STEP_ENTRY}`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Entry pass' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Entry pass' })).toBeInTheDocument();
  });

  it('spans to the next step when the step has no duration', () => {
    // The fixture's play is 4s; STEP_ENTRY sits at 2 and is the last step, so its implicit
    // window runs to the end.
    renderEditor(fixturePlay, <StepRuler />);

    expect(screen.getByTestId(`step-bar-${STEP_ENTRY}`).style.width).toBe('50%');
  });

  it('spans its duration when it has one', () => {
    const brief = {
      ...fixturePlay,
      branches: fixturePlay.branches.map((b) =>
        b.id === ROOT ? { ...b, steps: b.steps.map((s) => ({ ...s, duration: 1 })) } : b,
      ),
    };
    renderEditor(brief, <StepRuler />);

    expect(screen.getByTestId(`step-bar-${STEP_ENTRY}`).style.width).toBe('25%');
  });

  it('gives an inherited step a bar with no handle and no controls', () => {
    // Review Focus 3: an ancestor's step is shown as a snap mark but belongs to that ancestor.
    renderEditor(
      fixturePlay,
      <LivePlayback>
        <SelectBranch branchId={SWITCH} />
        <StepRuler />
      </LivePlayback>,
      { wrapPlayback: false },
    );

    const inherited = screen.getByTestId(`step-bar-${STEP_ENTRY}`);
    expect(inherited).toHaveAttribute('data-inherited', 'true');
    expect(screen.queryByTestId(`step-handle-${STEP_ENTRY}`)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Entry pass' })).not.toBeInTheDocument();
  });

  it('draws no bar at all for a duration that is not a number', () => {
    // Review Focus 2: a NaN width would collapse the whole ruler's layout.
    const broken = {
      ...fixturePlay,
      branches: fixturePlay.branches.map((b) =>
        b.id === ROOT ? { ...b, steps: b.steps.map((s) => ({ ...s, duration: Number.NaN })) } : b,
      ),
    };
    renderEditor(broken, <StepRuler />);

    expect(screen.getByTestId(`step-bar-${STEP_ENTRY}`).style.width).not.toContain('NaN');
  });

  it('draws a bar on a play with no duration at all', () => {
    // Review Focus 4: a play whose keyframes are all at zero has `duration` 0, so every
    // fraction divides by zero. The ruler must still render rather than writing NaN widths.
    const instant = {
      ...fixturePlay,
      branches: fixturePlay.branches.map((b) =>
        b.id === ROOT ? { ...b, tracks: { ball: [] }, steps: [{ id: STEP_ENTRY, t: 0, name: 'Entry pass' }] } : b,
      ),
    };
    renderEditor(instant, <StepRuler />);

    expect(screen.getByTestId(`step-bar-${STEP_ENTRY}`).style.width).not.toContain('NaN');
  });

  it('stops the handle at the next step', async () => {
    const twoSteps = {
      ...fixturePlay,
      branches: fixturePlay.branches.map((b) =>
        b.id === ROOT
          ? {
              ...b,
              steps: [
                { id: STEP_ENTRY, t: 1, name: 'Entry pass' },
                { id: 'later' as StepId, t: 2, name: 'Later' },
              ],
            }
          : b,
      ),
    };
    renderLiveWithWidth(twoSteps, 100);

    // Drag the handle far past the next step; the commit must stop at it.
    await dragElement(screen.getByTestId(`step-handle-${STEP_ENTRY}`));

    expect(stepsOfRoot().find((s) => s.id === STEP_ENTRY)?.duration).toBeCloseTo(1, 6);
  });
});
```

`renderLiveWithWidth` is the existing pattern in this file: stub `getBoundingClientRect` to the
given width, then `renderEditor(play, <LivePlayback><StepRuler /></LivePlayback>, { wrapPlayback: false })`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/pwa && pnpm vitest run src/editor/StepRuler.test.tsx -t "step label bars"`
Expected: FAIL — `step-bar-*` does not exist.

- [ ] **Step 3: Draw the bar**

In `apps/pwa/src/editor/StepRuler.tsx`, compute each step's window above the map:

```tsx
const ordered = [...steps].sort((a, b) => a.t - b.t);
const windowEnd = (step: Step, index: number) => {
  const limit = ordered[index + 1]?.t ?? duration;
  if (step.duration === undefined) return limit;

  return Number.isFinite(step.duration) && step.duration > 0 ? Math.min(step.t + step.duration, limit) : step.t;
};
```

The inherited branch returns a `TimelineBar` with `data-inherited="true"`, no `bar`, no
`handle` and no `actions`, its name as children. The own-step branch keeps the retime gesture
the tick carried, now on the bar through the `bar` prop — the same `bind({ current: step.t,
resolve: constrainStepRetime(...), ... })` call, moved across unchanged — and adds the duration
gesture on the handle:

```tsx
handle={{
  testId: `step-handle-${step.id}`,
  label: t('play.editor.stepDuration', 'Label duration'),
  bind: bind({
    current: windowEnd(step, index),
    // Floored at a screen's minimum and capped at the next step, or the end of the play for a
    // last step: spec 004 forbids two windows overlapping.
    resolve: (rawT) => Math.min(Math.max(rawT, step.t + MIN_SCREEN_DURATION), ordered[index + 1]?.t ?? duration),
    place: (element, value) => {
      const bar = element.parentElement;
      if (bar !== null) bar.style.width = `${(fractionOf(value, duration) - fractionOf(step.t, duration)) * 100}%`;
    },
    restore: (element) => {
      const bar = element.parentElement;
      if (bar !== null) {
        bar.style.width = `${(fractionOf(windowEnd(step, index), duration) - fractionOf(step.t, duration)) * 100}%`;
      }
    },
    commit: (value) => setStepDuration(step.id, value - step.t),
  }),
}}
actions={
  <>
    <ActionIcon
      size="xs"
      variant="subtle"
      data-testid={`step-edit-${step.id}`}
      aria-label={t('play.editor.editStep', 'Edit {{name}}', { name: step.name })}
      onClick={() => setOpenId(step.id)}
    >
      <IconPencil size={12} stroke={1.5} />
    </ActionIcon>
    <ActionIcon
      size="xs"
      variant="subtle"
      color="red"
      data-testid={`step-remove-${step.id}`}
      aria-label={t('play.editor.removeStep', 'Remove {{name}}', { name: step.name })}
      onClick={() => removeStep(step.id)}
    >
      <IconX size={12} stroke={1.5} />
    </ActionIcon>
  </>
}
```

`MIN_SCREEN_DURATION` is imported from `./TimelineRow`; the popover stays as it is, opened by
the edit control instead of by clicking the bar.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/pwa && pnpm vitest run src/editor/StepRuler.test.tsx`
Expected: PASS, the pre-existing retiming and rename cases included.

- [ ] **Step 5: Extract and translate the strings**

```bash
cd apps/pwa && pnpm extract:i18n
```

Fill the French values in `apps/pwa/src/i18n/locales/fr/common.json`:
`play.editor.stepDuration` → `"Durée du label"`, `play.editor.editStep` → `"Modifier {{name}}"`,
`play.editor.removeStep` → `"Supprimer {{name}}"`. Then:

```bash
cd apps/pwa && pnpm i18n:check
```

Expected: "i18n catalogue is up to date."

- [ ] **Step 6: Run the whole suite, lint and typecheck**

```bash
pnpm lint && pnpm --filter @phoopers/pwa typecheck && pnpm test
```

Expected: all pass.

- [ ] **Step 7: Verify it in a browser**

Start the dev server, switch to edit mode, and check: each own step shows a bar reaching the
next step; dragging a bar's right edge shortens it and stops at the next step; the edit control
opens the rename popover; the delete control removes the step; a child branch shows its
ancestor's step as a bar with no handle.

- [ ] **Step 8: Commit**

```bash
git add apps/pwa/src/editor/StepRuler.tsx apps/pwa/src/editor/StepRuler.test.tsx apps/pwa/src/i18n/locales
git commit -m "feat: draw a step's label as a bar with a settable duration"
```

---

### Task 7: Documentation

**Files:**

- Modify: `documentation/specs/index.md` (status to Implemented)
- Modify: `documentation/plans/index.md` (status to Implemented)
- Modify: `documentation/limitations.md` (only if the browser pass in Task 6 found something left)

- [ ] **Step 1: Set both statuses**

Change spec 004's and plan 005's Status column from `Not started` to `Implemented`.

- [ ] **Step 2: Record anything knowingly left**

If Task 6's browser pass found a limitation — a bar too narrow to show its name, say — add it to
`documentation/limitations.md` under `## Editor`, with what it costs **measured**, why it was
left, and how it would be fixed. If nothing was found, change nothing here.

- [ ] **Step 3: Commit**

```bash
git add documentation
git commit -m "docs: mark spec 004 and plan 005 implemented"
```
