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

## Editor

### The court's colours trade legibility for looks, unresolved

The floor is a wood tone and the markings are white, so one ratio governs both the lines and the
white rim that separates each token from the floor. Measured against the colour in the tree at
the time of writing, `#d5c49a`: the lines and rims sit at **1.72:1**, under the 3:1 floor WCAG
1.4.11 sets for a graphic that carries meaning. The paths are worse and have no rim at all —
**2.07:1** for an offense run, **1.91:1** for a defense run, **1.49:1** for a pass.

Darkening the floor fixes the lines and rims and nothing else: for this hue and saturation the
3:1 threshold sits at 46% lightness, and the value has been through #b5651d, #cbc2a6, #dcd6c5,
#e8dab6, #b39038 and #d5c49a while the balance is settled. The token and path FILLS cannot be
fixed this way at all — a mid-luminance blue, red or orange never clears 3:1 against any wood,
because the floor passes through their value on the way darker.

It is left open deliberately: the colour is a design decision in progress, not a defect.

**Fix:** settle the floor's lightness at or below the 3:1 threshold for the white, and give the
paths the same treatment the tokens got — a white casing drawn under each stroke, which means
`PathLayer` rendering every segment twice.

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

### Removing a step a branch forks from does nothing, visibly nothing

`removeStep` refuses a step a branch forks from, since dropping it would orphan that branch.
The step's bar now carries its own delete control, so that refusal is one click away rather
than two inside a popover, and it still says nothing.

Measured in a browser on the sample play: pressing "Remove Entry pass" — the step `Switch to the
weak side` forks from — leaves both step bars on the ruler, changes no name or window, and
raises no `role="alert"` notice. Pressing "Remove Double high screen", which nothing forks from,
removes it.

It was left for the same reason as the two entries around it: having the bar decide would make
the component re-derive a rule the mutation owns, and two copies of a rule drift.

**Fix:** have `removeStep` in the context report whether it wrote anything, and have the bar
show a notice or render no delete control for a step a branch forks from — the second being
better, a control that cannot work is worse than none.

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

### Nothing on screen names the variant being watched

The branch tree moved from a panel beside the court into a menu in the header, whose trigger is
an icon with the accessible name "Branches" and no label. The tree marks the current branch with
`aria-current`, but only while the menu is open, so with it closed there is no way to tell which
variant the court is drawing short of opening the menu.

Measured in a browser: after switching to a child branch and closing the menu, the page's text
contains neither that branch's name nor the root's — the header carries the play's name alone.
The panel it replaced showed the selection permanently, by highlighting the active row.

It was left because the trigger was chosen icon-only deliberately: a trigger carrying the
branch name makes the header's width move with the play's data, and the names are author-supplied
and unbounded.

**Fix:** either put the name on the trigger with a fixed maximum width and an ellipsis, or show
it beside the play's name in the header, which costs no width when the root branch is current
and is the only case a coach sees most of the time.

### The court diagram exposes nothing of its contents to assistive technology

`PlayCanvas` gives the court SVG `role="img"` with the name "Court diagram: {{name}}". `img` is
a children-presentational role, so every descendant is removed from the accessibility tree:
players, their numbers, the paths, the screens and the ball are all unreachable. A screen-reader
user learns the play's name and nothing else about it.

Measured: adding `role="img"` and an `aria-label` to each of the ten player tokens changed
nothing for assistive technology — the names sit inside a presentational subtree — and broke the
five `PlayCanvas` cases that find the court with `getByRole('img')`, because the role was then
ambiguous. The experiment was reverted.

It was left because the fix is a design decision rather than an attribute: the court would stop
being one labelled image and become a container whose children are each named, which changes
what a screen reader hears from one sentence into a structure, and spec 002 specifies neither.
Note this predates the editor — the tokens were never announced, including when defenders were
labelled "X1".."X5".

**Fix:** give the SVG `role="group"` (or `role="application"` once the court is interactive),
name each token group, and give the paths text alternatives — then decide what a sensible
reading order over a play actually is.

### Isolating an entity is reachable by pointer only, and nothing announces it

Alt+click on a row's visibility button isolates that entity — it hides every other one, and a
second press brings them all back. The modifier is read off the click (`event.altKey` in
`TimelineRow`), so the whole feature hangs on a pointer gesture. Nothing on screen, and nothing
in the button's accessible name, says the gesture exists.

Measured in a browser on the sample play: with the button focused and Alt held, pressing Enter
fires no `click` event at all — the browser suppresses the default activation while Alt is down —
so the handler never runs and the court is unchanged. The plain toggle is unaffected: Enter
without Alt works as it always did. The button's accessible name is "Hide Offense 3" either way.

It was left because the alternatives each cost more than the gesture is worth on its own: a
second button per row doubles the controls in a gutter that already holds four, and putting
"alt+click to isolate" in the accessible name makes a voice-control user hear the instruction on
all eleven rows. The gesture is a shortcut for an action that is already possible by hand, so
nothing is unreachable — only slower.

**Fix:** give the button an `aria-keyshortcuts` and a visible hint in a tooltip, and add a
keyboard path that is not a modified activation — a shortcut on the focused row, or an entry in
the add menu acting on the selection. `isolate` in `HiddenEntitiesContextProvider` already takes
the whole decision, so any new caller is one line.

### A screen block's controls are under the non-text contrast floor

`TimelineBar` takes one colour and fills itself with that colour's `light` variant, and everything
it carries — the right-edge handle, and the edit and remove controls the callers put in it — wears
the normal variant of that same colour. The two are points on the same ramp, so how far apart they
land is a property of the hue, not something the component controls.

Measured in a browser, against the 3:1 that WCAG 1.4.11 asks of a non-text control. A screen
block (`blue`) puts its handle at 2.88:1 and its remove control at 2.88:1. The captions are
unaffected, at 17.01:1 and 18.82:1.

The step label bar (`primary`) is no longer among the failures: it cleared the floor when the
primary moved from yellow to violet, with no change to `TimelineBar` itself. Re-measured the same
way, its handle went from 1.67:1 — at which point it was not merely low-contrast but invisible,
with nothing to see at the bar's right edge — to **3.75:1**, and its edit and remove controls from
2.69:1 to **5.39:1**. This is the limitation's own point made twice over: the ratio is a property
of the hue, so the palette fixed it and the palette can break it again.

A second cost, on the step label bar only, which the palette change does not touch: its remove
control gave up the red it used to carry at 4.89:1. Colour was the only thing marking it as
destructive rather than ordinary, so it is now told apart from the edit control beside it by its
glyph alone. The screen block's remove control was never red and loses nothing.

It was left because one colour name driving the whole bar is the point of the prop — it is what
stops a caller picking a fill without a handle — and because no shade of a given hue can be relied
on to clear the floor once the primary is a setting: the darkest shade reaches 3.10:1 in blue,
3.81 in green and 2.69 in yellow — and 5.39:1 in the violet the primary wears today, which is
luck rather than a guarantee. The alternative below was offered and declined in favour of keeping
every part of a bar in one colour.

**Fix:** keep each control filled with its colour and give it a 1px `dark-6` outline, which
measured 12.17:1 against the bar back when the primary was yellow. The hue stays, the
perceivability comes from the outline, and it is one place in `TimelineBar` covering both bars. The destructive control additionally
wants something other than colour to mark it — a confirmation it already has, or a glyph weight.

### A system's court, extent and duration are fixed once it is created

The creation dialog is the only place any of them is written. The name is editable — from the
save dialog and from the rename action in My systems — but nothing moves a system from a full
court to a half, or changes its eight-second floor, and the only way to get a different one is
to create another system, which discards everything drawn, since `createPlay` replaces the whole
play.

Measured on the shipped build: creating a half-court system, placing three against three and
drawing one movement path, then deciding the set belongs on a full court, costs **every
keyframe, step, screen and branch** of that system. There is no partial recovery and no undo.

The court + `extent` and the `duration` are plain fields on `Play`, so the model is already able
to hold a change; only the controls are missing. It was left because
[spec 005](specs/005-17-10-2026-system-creation.md#non-goals) and
[spec 006](specs/006-18-10-2026-accounts-and-persistence.md) both name editing them after
creation a non-goal.

**Fix:** two mutations that set the fields on the existing play, reached from the system menu
behind a small form. None of them touches `createPlay`; a court change additionally wants the
existing keyframes clamped to the new bounds, which `clampToCourt` already computes.

### Following the playhead re-renders the timeline on every frame

While a play runs, the playhead moves by direct style writes and re-renders nothing. The view
that follows it does not: once the playhead reaches the far edge of the follow band, which is
where the follow holds it for the rest of the play, every frame sets the scroll offset in the
viewport provider's state, so every row, the ruler, the grid and the scrollbar re-render once per
frame.

Measured with the React Profiler under jsdom on the horns set (11 rows) with a 400 px window and
frames 16 ms apart: **0.4 ms of render work per frame while the playhead is inside the band, 8.9
to 13.6 ms per frame once it is carried** (534 ms over 60 frames, 41 of them committing). jsdom
does no layout or paint, so this is React work alone and a real browser adds to it; it was not
profiled in one. The ratio, about 23 times, is the finding, not the absolute figure.

It was not fixed because the offset is one value shared by five windows and the scrollbar, and
the only way to keep it single while writing it directly is a store they all subscribe to,
which is a refactor of how every time surface reads the scroll rather than a change to the
follow.

**Fix:** hold the offset in a ref plus a subscription, as the playback clock does, with each
`TimeWindow` and the scrollbar registering to write its own transform; commit to state only when
the play stops or a gesture moves the view.

## Timeline

### A long play shows no cell lines at any zoom

`gridTicks` draws one line per 0.1 s cell and gives up the cells for whole seconds once the play
would need more than `MAX_GRID_LINES` (240) of them. The cap counts lines, not pixels, so it
does not know the zoom: a play past the cap loses its cell lines at level 1, where a cell is a
comfortable 24 px, exactly as at level 4.

Read from `gridTicks`: a **23.99 s** play keeps 240 lines (215 of them minor); a **24 s** play
keeps 25, none minor, and every duration from 24 s up does the same. At level 1 a 24 s play is
5760 px wide with a line only every 240 px.

This is not a regression. The cap and its threshold are unchanged, and before the fixed scale
the same play lost its cell lines the same way, because the cap never read the width either. What
changed is that the fixed scale makes the loss visible as a loss: a coach at level 1 now sees
cells large enough to aim at and no lines to aim by.

It was not fixed because it is a decision about how the grid should thin, not a correction, and
the spec left the grid's rules alone. The same section holds a second, smaller consequence of the
fixed scale: at level 4 the cell lines of a play under 24 s fall **6 px** apart, which reads as
hatching rather than as a grid.

**Fix:** decide by spacing, not by count. `gridTicks` would take the zoom and draw the cells
whenever `pxPerCell` stays at or above a floor of about 8 px, which keeps them at levels 1 to 3
(24, 18 and 12 px) and drops them at level 4 (6 px) on any play. The line count is then bounded by
the window the lines are drawn in rather than by the play, so the 240 cap goes.

### A whole system can no longer be seen at once unless it fits

The scrubber used to span the window and show the entire play. It now shares the fixed scale and
scrolls with the tracks, so the coach has no overview: a play wider than the window can only be
seen in part. [Spec 007](specs/007-23-10-2026-timeline-scale.md#scrolling) accepted this as the
price of keeping the four time surfaces aligned.

Measured by arithmetic from the layout in the code. The visible axis is the window less the
page's 16 px padding each side (32), the 180 px label column, the 12 px scrollbar gutter, and 6 px
of inset each end (12): **window − 236 px**. A play takes `duration × px per second`, which is 60
px per second at level 4.

| Window         | Visible axis | Longest play that fits at level 4 | At level 1 (240 px/s) |
| -------------- | ------------ | --------------------------------- | --------------------- |
| 1440 px laptop | 1204 px      | **20.07 s** (1204 / 60)           | 5.02 s                |
| 390 px phone   | 154 px       | **2.57 s** (154 / 60)             | 0.64 s                |

A new system is 8 s long, so it fits a laptop at level 4 (480 px) and not at level 1 (1920 px,
37 % of it off screen at rest). On a phone nothing past 2.57 s fits even at the widest level, so
an 8 s play shows about a third of its length at level 4.

It was left because an overview and a shared scale are in tension: spec 007 chose alignment
over overview, and lists a fit-to-window level and an overview strip as non-goals.

**Fix:** an overview strip, a minimap of the whole play with the visible window marked on it,
which is the one surface allowed to be elastic; or a fifth, fit-to-window level.

### The time axis cannot be scrolled without moving focus or dragging

Tab focus carries the view: since commit 48eb599, `TimeWindow` handles `onFocusCapture` by moving
the shared offset through `scrollTo`, so a keyboard user who tabs to a marker, bar or handle
outside the window has the view brought to it. What is left is that nothing scrolls the axis
_without_ changing focus. The scrollbar strip is `aria-hidden` and the view moves by a CSS
transform, so there is no keyboard equivalent of dragging the strip. A coach who wants to look
further along the play without changing what is selected has to zoom out with the buttons, or tab
through everything that lies between.

Measured by arithmetic from the layout (window less 236 px, as in the entry above). At level 1 a
1440 px window shows **5.02 s** of axis (1204 px at 240 px/s), so on the 8 s sample the last
**2.98 s**, 37 % of the play, is off screen at rest. On a 390 px phone it shows **0.64 s**, so
almost every marker is. At level 4 a 1440 px window shows 20.07 s and the same play fits whole.

It was not fixed because a scroll key has to be chosen against the arrow keys, which already mean
"nudge the selected object by 0.1 s", and against the page's own scrolling.

**Fix:** make the scrollbar strip a keyboard-operable control, focusable with `role="scrollbar"`
or a slider and arrow, Home and End keys calling `scrollTo` through the viewport context, so the
view can be moved without moving focus. It takes its own tab stop, which keeps the arrows on the
timeline's objects meaning what they mean now.

## Accounts and persistence

### No automated test covers the Row Level Security policies

The whole guarantee that a private system is unreadable by anyone but its owner rests on a
reviewer reading `supabase/migrations/0001_plays_and_profiles.sql`. No test in the repository
reaches a database: the plays API is tested against a mocked client, which proves the calls are
well formed and says nothing about what Postgres lets through. A policy that is too loose, or
dropped by a later migration, fails no build.

It was left because a database test needs a Postgres with the migration applied, which CI does
not have and the project has not yet decided how to provide.

**Fix:** run the migrations against a local Supabase (the CLI's Docker stack) in CI and add tests
that sign in as two users and an anonymous visitor, then assert who can select, update and
delete a private and a public system.

### The lists have a fixed ceiling and no pagination

`LIST_LIMIT = 100` in `apps/pwa/src/plays/playsApi.ts` caps both My systems and the public
library, newest first. Beyond the hundredth, systems simply do not appear, and nothing on screen
says so: a coach with a hundred and one systems sees a hundred and cannot reach the oldest from
the lists, and the library gives no hint that it is truncated.

It was left because no one is near the ceiling yet, and pagination is a design decision (pages,
infinite scroll, search) rather than a correction.

**Fix:** cursor pagination on `updated_at` with a "Load more" control, using TanStack Query's
infinite queries; at the same time, search, which the library will need first.

### Two tabs holding the same system overwrite each other

A save writes the whole document with no version check, so when the same system is open in two
tabs, or on two devices, the last save wins silently and the other's changes are lost with no
warning to either coach.

It was left because the roadmap's v1 has one author per system and the check needs a column
the schema does not have.

**Fix:** a version (or compare against `updated_at`) sent with the update and matched in its
`where` clause; a save that matches no row reports a conflict and offers to reload or to save
a copy.

### The app is not deployed

A public system has its own address, `/play/:id`, but it exists only on `localhost`, so sharing
a link to one does not work yet: nobody but the author's machine can open it.

What the repository could carry is now carried: `vercel.json` holds the install and build
commands, the output directory, and the rewrite that serves `index.html` for every path, so a
shared address survives a reload rather than 404ing. What is left is not code — importing the
repository into Vercel, setting `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` there, and
adding the deployed origin to Supabase's Site URL and Redirect URLs. The README's Deployment
section lists the steps.

**Fix:** do those three things once. Delete this entry when a deployment answers.

### Leaving a dirty draft is guarded only on the Open buttons

The Open buttons in My systems and the library ask for confirmation before replacing a draft
with unsaved changes. Nothing else does: a typed address, a shared link, a reload on another
`/play/:id` or the browser's back button all replace the draft without the confirmation the
guard promises elsewhere, and the unsaved work is gone.

It was left because the guard sits in the click handlers; covering navigation as a whole means
moving it into the router.

**Fix:** a router-level blocker (React Router's `useBlocker`) plus a `beforeunload` handler for
reloads and tab closes, both reading the same dirty flag the Open buttons use.

### A failed save is announced only inside the system menu

The alert for a failed save lives in the system menu's popover. A coach who closes the popover
sees nothing but the unsaved mark, and no message says the save did not happen. This is also
what a resumed overwrite looks like when it fails after signing in: the save is retried with
nothing on screen announcing its outcome.

It was left because a notification is a placement decision across the app, not just a save
concern.

**Fix:** report the failure with a Mantine notification, outside the popover, and keep the
inline alert for the dialog that triggered it.

### A system deleted elsewhere can still be open

A resumed dirty draft skips the existence check that opening from the lists performs. If the
system was deleted in another tab or device in the meantime, saving does not report it gone: it
offers to store the draft again under the same id, so the coach's work is kept but the deletion
is silently undone.

It was left because the check costs a request on every resume, and keeping the work was judged
the safer failure.

**Fix:** check the row's existence when a resumed draft carries an id, and say so in the resume
dialog when it is gone, offering to save it as a new system.

## Test coverage gaps

### The animation loop is not unit-testable

The `requestAnimationFrame` loop's effects are covered indirectly — the clock hook under fake
timers, and `stateAt` exhaustively by 1a — but no test proves the loop writes the right
transform to the right element.

**Fix:** end-to-end coverage, which waits for Playwright.

### No test reorders a timeline row

The handle, its name, its absence on the ball's row, the ball keeping the head of the list, and
a cancelled drag leaving the order alone are all covered. The gesture that actually moves a row
is not.

dnd-kit decides what a move passes by measuring nodes, through layout and a `ResizeObserver`
that reports. jsdom has neither: every box is zero-high and the suite's observer is an inert
stub, so the pointer and the keyboard both end up with no neighbour to move past. Measured:
with per-row `getBoundingClientRect` stubs giving each row a distinct 32px band, and with
`Element.prototype.scrollIntoView` stubbed — which dnd-kit's keyboard sensor calls and whose
absence was throwing — the order after a full pick-up, arrow, drop sequence is unchanged.

Both paths were verified by hand in a browser instead: the keyboard moved offense 1 below
offense 2 and announced "Ligne 1 saisie, position 1 sur 10", and a 64px pointer drag over 32px
rows moved offense 2 down several places.

It was left because making it testable means simulating the library's measurement — a stub that
reports sizes it invents — which would test the stub as much as the feature.

**Fix:** Playwright, the same answer as the entry below, which this is a particular case of.

### Layout is not testable in jsdom

Nothing in the suite can see how the page looks. The responsive layout, the court filling its
panel, and label collisions were all verified by hand in a browser at 1440×900 and 375×812.
Tests cover only the logic beneath them — which breakpoint is active, whether a toggle hides a
region.

This gap is why the half-court viewport bug survived to the final review: three tests asserted
the viewBox _changed_ without asserting anything was _visible_ inside it.

**Fix:** Playwright, deferred.
