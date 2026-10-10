# Known limitations

Every limitation, known defect and coverage gap in the project, in one place. Each entry says
what it is, what it was **measured** to cost, why it was not fixed, and how to fix it.

Nothing here is a bug waiting to be triaged. Each one was found, understood and deliberately
left — usually because fixing it is a behavioural decision rather than a correction, or
because it belongs to a sub-project that has not started. Entries are removed when fixed.

Specs and plans link into the headings below rather than repeating the detail.

## Interpolation and motion

### A hold keyframe between two moving spans drifts

Repeating a position to mean "wait here" does not hold a player still. The surrounding
keyframes still produce Catmull-Rom tangents, so the hold span is a real loop.

Measured on the track (0,0)@0 → (5,0)@2 → (5,0)@4 → (5,5)@6: the hold span has length
**1.199 m**, the player wanders to (5.31, −0.31) and back, and `spanKindAt` reports `dribble`.

This is spec-conformant — [spec 001's tangent derivation](specs/001-09-10-2026-model-animation-engine.md#evaluation-pipeline)
prescribes it — which makes it a design flaw rather than a bug. A hold at the **start or end**
of a track is unaffected, because one-sided differences give it zero-length tangents.

**It is not hypothetical.** `apps/pwa/src/samples/horns.ts` defines a `hold()` helper that
sets `handleIn` and `handleOut` to the point itself, and **seven of its ten tracks depend on
it**. That helper is exactly the fix below, applied by hand at the data layer — so every play
author must remember it until the engine does it for them.

**Fix:** zero both handles when a span's endpoints coincide. Small, but a behavioural change.

### Two implementations of the same interpolation

Fork synthesis evaluates a span with its own `positionOnTrack` rather than calling the
sampler's. They agree today, by construction of their tangent neighbours, and a test fails if
they drift — but they are two copies of one piece of maths.

**Fix:** collapse them. The natural moment is when 1c touches this code for curve splitting.

## Branching and forks

### A mid-span fork replays the opening only approximately

When a fork falls part-way along a parent span rather than on one of its keyframes, the
synthesised anchor splits that span in two, and two Catmull-Rom spans joined at a point do not
reproduce the original cubic.

Measured worst-case divergence on a court-scale path: **0.5 m** for a player, **0.46 m** for
the ball. That is half a player's width, not a rounding error. Forks placed **on** a keyframe
are exact.

**Fix:** de Casteljau splitting at the fork parameter — deferred with the rest of the
curve-splitting work to 1c.

### The ball diverges at a fork on a mixed-attachment span

When a child's fork keyframe is an attachment and the ancestor's span into that fork mixes
attached and free endpoints, `ballPositionAt` interpolates toward the child's carrier and
ignores the span's resolved end position.

Measured worst case: **7.04 m**. This is the one remaining edge where
[acceptance criterion 5](specs/001-09-10-2026-model-animation-engine.md#acceptance-criteria)
does not hold, and it affects the ball only — players are exact.

## Validation gaps

### `Step.t` and `ScreenEvent.t` are not checked for finiteness

`validatePlay` sweeps every number on a keyframe, but not on steps or screens. A `NaN` step
time validates clean and then silently empties the child's time window: every entity resolves
to the court origin, with no `NaN` and no throw.

Wrong but quiet, which is the hardest kind to notice.

**Fix:** extend the existing `non-finite-number` sweep to steps and screens.

### A player with no track vanishes silently

A player listed in `play.players` with no keyframes in the selected branch is not drawn at
all. That is the correct _render_ — the sampler returns the court origin for one, so drawing
it would place a player out of bounds at (0,0) — but nothing tells the author their player is
missing.

**Fix:** a `validatePlay` issue code for a player with no track in a branch.

## Rendering and symbols

### Very short dribbles render as runs

The dribble wave tapers to zero over its final wavelength so the arrowhead points along the
path rather than along the wiggle. A dribble shorter than about **0.4 m** has no untapered
region left and renders nearly straight — indistinguishable from a run.

Measured maximum deviation from a straight line, at 0.12 m amplitude against a 0.08 m stroke:

| Dribble length   | Max deviation | Reads as             |
| ---------------- | ------------- | -------------------- |
| 0.3 m            | 0.027 m       | effectively straight |
| 0.5 m            | 0.077 m       | a faint single bump  |
| 0.8 m and longer | 0.120 m       | full amplitude       |

A token's radius is 0.45 m, so a dribble that short covers less than one player width — the
sample play's shortest is 2.86 m. The alternative, an untapered wave, puts the arrowhead
**40–68° off** the true direction, which is worse.

**Fix, if it ever matters:** taper over `min(wavelength, total / 2)` instead.

### A shot is indistinguishable from a pass

Both render as dashed in-flight ball segments with an arrowhead. This is spec-conformant —
[spec 002's symbol table](specs/002-09-10-2026-2d-view-playback.md#symbols) defines only a
Pass symbol for the ball — but a coach reading a diagram cannot tell the two apart.

**Fix:** a distinct shot symbol, which is a spec change rather than a correction.

### Arrowheads fall back to black in some browsers

The arrow marker uses `fill="context-stroke"` to inherit each path's colour. Chromium does not
support it, so arrowheads render black rather than in the team colour. Several SVG tools do not
support it either, which matters for the deferred print and vector-export goal.

**Fix:** a per-team marker with an explicit `fill`. This also removes a jsdom blind spot, since
`context-stroke` cannot be asserted there.

## Court data

### Some NBA court dimensions are unverified against primary text

FIBA figures were read directly from the 2024 rules PDF (Art. 2). These were **not** confirmed
against primary rulebook text and rest on secondary sources:

- NBA 94 × 50 ft court
- NBA 16 ft lane
- NBA 6 ft circles
- NBA 4 ft backboard offset — which also underpins the NBA basket centre and free-throw line

FIBA backboard width and ring radius come from Equipment-document excerpts rather than the
rules PDF. All cross-checks are mutually consistent, so the risk is low.

**Fix:** one look at the NBA Rule 1 diagram closes it.

### The attacking half is a heuristic

`attackingSide` picks the half-court viewport from the mean `x` of offense keyframes against
the half-way line. A play that legitimately straddles half-way — a full-court press, a
transition play — is a coin flip.

It only ever chooses a **viewport**, never geometry, and degenerate input returns `'left'`
rather than `NaN`.

**Fix:** let a play declare its attacking basket, which is data the editor should own.

## Editor

### A drag cannot lengthen the play

A timeline drag maps the pointer to a time with `timeFromClientX`, which clamps to the row, so
the latest time a drag can produce is the current duration. The model allows more:
`constrainRetime` returns `9` for the last keyframe of the fixture's 4 s P1 track dragged to 9,
and `retimeBounds` leaves it unbounded above. Measured in the UI: releasing that keyframe far
beyond the right edge commits `t = 4`, not later. The same clamp applies to a step tick and to a
screen's right edge.

So a coach cannot extend a play by dragging its last keyframe, step or screen later; the play
only grows when a keyframe is authored on the court at a later clock time.

**Fix:** let the row's time axis extend past the duration while a drag is in flight (for example
by padding the track with a spare fraction of the duration) and clamp to that instead. It changes
how the ruler scales mid-gesture, which is a design decision rather than a correction.

### One ball drop cannot express a hold

A span's `attachedTo` is non-null only when both of its keyframes name the same player
(`resolve.ts`, `from.attachedTo === to.attachedTo`), so holding the ball takes a pair of
attachment keyframes bracketing the hold, as the `horns` sample writes (`{4: O1}, {5: O2}` the
pass, `{5: O2}, {7: O2}` the hold, `{7: O2}, {8: position}` the shot). The drop gesture writes
one attachment keyframe per drop (`attachBall`, called once from `CourtEditLayer`).

Measured on the acceptance play's ball track `{0: o1}, {3: o2}, {5: position}`: `stateAt` returns
`ball.attachedTo === null` at t = 0, 1, 2.9, 3, 4 and 5, so the ball is never held. A coach
expects o1 to carry it until the pass and o2 to carry it from t = 3 until the shot.

The pass and the shot are not wrong: each is spread across the whole span, which is a legitimate
reading of the keyframes. What cannot be expressed by one drop is the hold, and nothing in the UI
tells the coach they must drop twice. This is a different problem from
[the fork-boundary entry](#the-ball-diverges-at-a-fork-on-a-mixed-attachment-span), which is about
interpolation at a fork and involves no editor gesture.

Left as is because spec 003's ball model is deliberate: a pass is two consecutive attachments and
there is no pass object. Changing the drop gesture is a spec-level decision, not a defect.

**Fix:** either `attachBall` writes a second attachment keyframe to close a hold (at the next
keyframe time or after a default hold), or the UI asks for a hold duration on drop.

### "Add step" before the fork does nothing, silently

On a child branch, `addStep` refuses a step earlier than the branch's fork (the same rule that
refuses a keyframe there). `StepRuler` calls it and shows nothing either way. Measured (the
"adds no step before the fork" case in `StepRuler.test.tsx`): viewing `Defence switches`, forked
at t = 2, with the playhead at t = 0, pressing "Add step" leaves that branch's `steps` at 0
entries and the ruler's rendered content identical, and raises no `role="alert"` notice.

It was left because the alternative has the component re-derive the fork rule the mutation
owns, and two copies of a rule drift. It mirrors [the delete-refusal entry](#refusing-to-delete-a-players-last-keyframe-gives-no-feedback) below.

**Fix:** have `addStep` in the context report whether it wrote anything (the identity check
`forkBranch` already uses), and have `StepRuler` show a notice, or disable the button while the
playhead is before the fork.

### Placing a screen before the fork does nothing, silently

On a child branch, `addScreen` refuses a screen earlier than the branch's fork. The court click
that names the beneficiary calls it and ends the gesture either way. Measured (the "writes
nothing before the fork" case in `selectionActions.test.tsx`): viewing `Defence switches`, forked
at t = 2, with the playhead at t = 0, selecting player 1, choosing "Place a screen" and clicking
player 2 leaves that branch's `screens` at 0 entries, the placement hint gone, and no
`role="alert"` notice. The coach sees the mode end and nothing appear.

Left for the same reason as [the add-step entry](#add-step-before-the-fork-does-nothing-silently):
the alternative has the component re-derive the fork rule the mutation owns.

**Fix:** the same one: have `addScreen` in the context report whether it wrote anything, and
show a notice (or keep the placement mode open) when it did not.

### Refusing to delete a player's last keyframe gives no feedback

`removeKeyframe` refuses to remove the only keyframe of a player's track (a player with no
keyframe has no position and would vanish). `Timeline` still calls `select(null)` after pressing
Delete, so for that refusal the marker stays exactly where it was, its selection ring disappears
and nothing says why. Measured (the `soleKeyframe` case in `Timeline.test.tsx`): with a player's only
keyframe selected, Delete leaves the track at one keyframe and `selection` at `null`.

It was accepted rather than fixed because the alternative has the component duplicate the rule
the mutation owns (`current.length <= 1`), and two copies of a rule drift.

**Fix:** have `removeKeyframe` in the context return whether it removed anything (the same
identity check `forkBranch` already uses), and have `Timeline` keep the selection and show a
notice when it did not.

## Test coverage gaps

### The animation loop is not unit-testable

The `requestAnimationFrame` loop's effects are covered indirectly — the clock hook under fake
timers, and `stateAt` exhaustively by 1a — but no test proves the loop writes the right
transform to the right element.

**Fix:** end-to-end coverage, which waits for Playwright.

### Layout is not testable in jsdom

Nothing in the suite can see how the page looks. The responsive layout, the court filling its
panel, and label collisions were all verified by hand in a browser at 1440×900 and 375×812.
Tests cover only the logic beneath them — which breakpoint is active, whether a toggle hides a
region.

This gap is why the half-court viewport bug survived to the final review: three tests asserted
the viewBox _changed_ without asserting anything was _visible_ inside it.

**Fix:** Playwright, deferred.
