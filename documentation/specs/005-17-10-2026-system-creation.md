# Spec 005 — Creating a system

Phase 1d, part A. Part B (Supabase accounts and persistence) gets its own spec; this one
must land first, because B persists what A defines.

## Intent

Today a play is born in one of two ways: the app boots on the `hornsPlay` sample, or the
"New play" button wipes the court down to a loose ball at centre. Neither lets a coach say
what they are about to draw. They cannot name it, they cannot say whether it is a
half-court set or a full-court press, and they cannot start from five-on-five without
hunting for a second button. Worse, a play born this way has nowhere to put a keyframe:
its duration is the time of its last keyframe, there are no keyframes, so the timeline is
zero seconds wide and the editor is unusable until something is dragged into existence.

This spec replaces that with one deliberate act of creation: a form that asks for the
three things a coach knows before drawing — the name, the court, who is on it — and hands
back a system ready to edit.

## Vocabulary

The domain term in code, documentation and English strings stays **play**: `Play`,
`newPlay`, `play.editor.*`. Only the French catalogue changes, where "jeu" becomes
**« système »**, which is what a French coach calls it. No identifier is renamed.

## Goals

- A coach can create a named system, choose its court, and start from a sensible placement,
  in one dialog.
- A newly created system is immediately editable: the timeline has width, so a keyframe can
  be dropped.
- The court a system is played on is a property of the system, not of the viewer.
- Editing obeys the court the system declares: nothing can be put where it cannot be seen,
  and a player can stand a metre out of bounds, as they do in a real set.

## Non-goals

- Saving, loading, listing or reopening a system. That is part B.
- Accounts and authentication. Part B.
- Editing a system's court, extent, name or duration after creation. All representable in
  the model, but no control exposes them in this lot.
- Offering NBA courts in the creation form.

## Anti-goals

Failures even if the feature technically works:

- A system created through the form that still cannot take a keyframe.
- Losing an unsaved system to a misclick with no warning at all.
- A half-court system that a viewer control can silently turn back into a full court,
  reintroducing the split between what the system declares and what is drawn.

## The model

Two additions to `Play` (`apps/pwa/src/engine/types.ts`):

| Field      | Type               | Meaning                                                                |
| ---------- | ------------------ | ---------------------------------------------------------------------- |
| `extent`   | `'full' \| 'half'` | How much of the court this system uses. Persisted, not a view setting. |
| `duration` | `number` (seconds) | The floor for the system's length.                                     |

`court` keeps its current meaning and its current values, `'fiba' | 'nba'`: it is the
dimension standard, and it is orthogonal to `extent`. The four combinations are all valid;
the creation form offers two of them.

A system with `extent: 'half'` always shows the **right-hand** half, with the attacked
basket on the right. The side is no longer derived: `attackingSide`, which infers it from
where the offense stands and falls back to the left half when there is no offense, would
open an empty half-court system on the wrong side with its ball off-screen. `PlayCanvas`
stops calling it.

### Drawing the half

The half is drawn alone and in landscape, with the attacked basket at the top. Three things
make that so, and none of them touches the model:

- **Clip.** The floor is clipped to the half plus the apron, and the markings to the half
  itself, cut half a line's width before the halfway line so that line draws whole. The centre
  circle therefore shows as a half circle on the halfway line. A frame alone is not enough: an
  svg narrower than its panel shows whatever lies past the frame, so the other half appeared
  beside the one framed.
- **Turn.** The court group is rotated a quarter anticlockwise, which takes court `(x, y)` to
  screen `(y, -x)`: the court's width runs across the screen and its length up it. It is a
  rotation, not a mirror, so left and right stay the players'. `halfCourtTurn(side)` returns the
  angle, `-90` for the right half and `90` for the left.
- **Frame.** `halfCourtViewBox` frames the half as turned, so it is wider than it is tall: the
  court's width plus two aprons across, the half's length plus two aprons up.

Coordinates in the play stay as written above — attacked basket on the right, the full-court
plane — whether `extent` is `'full'` or `'half'`. Editing bounds, the starting placements and
the stored play are the same with or without the turn.

### Duration as a floor

`ResolvedTimeline.duration` becomes `max(play.duration, last keyframe t)` instead of the
last keyframe's `t` alone. A system with nothing moving is therefore `play.duration` long;
one whose animation runs past it is as long as its animation, exactly as today. Nothing
else in the engine reads `play.duration` but validation, which measures the end of the play
the same way when it judges whether a step's label window outlasts it: sampling and resolution
are unchanged.

A system created through the form has `duration: 8`.

A play written before this spec has neither field. Both are optional in the type and read
through defaults — `extent: 'full'`, `duration: 0` — so `hornsPlay` and every existing
fixture keep their current behaviour with no edit.

## Starting placements

Three, offered at creation. Coordinates are in FIBA metres on the full-court plane, the
attacked basket on the right, identical whether `extent` is `'full'` or `'half'` — on a
full court the left half simply stays empty.

In all three the ball is **loose**, attached to nobody, placed at the centre of the
**displayed** area: `x = length * 3/4` when `extent` is `'half'`, `x = length / 2` when it
is `'full'`, `y = width / 2` in both. It is never on a player, so the coach assigns it —
and where that centre would land on one, the ball shifts two metres towards midcourt
instead. That happens in exactly one case today, three-on-three on a half court, where the
centre of the shown half and the ball-handler are both at `(21, 7.5)`; the ball goes to
`(19, 7.5)`.

**Empty** — no players, the ball alone.

**Five on five** — the 1-2-2 already in `apps/pwa/src/editor/formation.ts`, unchanged, with
each defender a metre goal-side of their mark. Offense `(16, 7.5) (20, 2) (20, 13) (23, 5)
(23, 10)`, defense `(17.5, 7.5) (21, 2.6) (21, 12.4) (23.8, 5.6) (23.8, 9.4)`.

**Three on three** — new. A triangle of ball-handler, wing and post, defenders a metre
goal-side:

| Role         | Offense        | Defense       |
| ------------ | -------------- | ------------- |
| Ball-handler | `(21, 7.5)`    | `(22, 7.5)`   |
| Wing         | `(23, 3)`      | `(23.6, 3.8)` |
| Post         | `(25.2, 10.2)` | `(25.6, 9.3)` |

Players are numbered per side from "1", as `Player.number` already requires, and carry no
`label`.

## The interface

### The menu

The editor toolbar's two buttons, "Starting formation" and "New play", are **both removed**,
and with the formation button goes the `applyFormation` mutation and its context method:
nothing reaches them afterwards, and they do the wrong thing for creation anyway — they
append to the current roster and hand the ball to the point guard, where creation wants a
fresh roster and a loose ball.
In their place, one icon button opening a Mantine `Popover` with two entries:

- **Create a new system** — opens the creation dialog.
- **Save** — present, disabled, with a tooltip saying it arrives with persistence. It is
  shown now so the menu does not change shape when part B fills it in.

The menu sits where the two buttons sat, in `EditorToolbar`, and like them is visible in
edit mode only.

### The creation dialog

A Mantine `Modal`, not a drawer. Three controls, in this order:

1. **Name** — text input, required. The submit button stays disabled while it is empty or
   whitespace.
2. **Court** — two choices: _FIBA full court_ (`court: 'fiba'`, `extent: 'full'`) and
   _FIBA half court_ (`court: 'fiba'`, `extent: 'half'`). Full court is preselected.
3. **Starting placement** — three choices: _Empty, ball only_ (preselected), _5 on 5_,
   _3 on 3_.

The dialog shows a warning above the submit button saying the current system and all its
branches will be discarded. The warning is unconditional: the app always has a system open
— it boots on `hornsPlay` and `EditorContextProvider` holds a non-nullable `Play` — so there
is no state in which it would be wrong. `play` does not become nullable in this lot. There
is no separate confirmation step: the dialog is the confirmation, and `ConfirmDelete` is no
longer used for this.

Submitting closes the dialog and replaces the current play with the new one: a fresh
`PlayId` and `BranchId`, the chosen name on both the play and its root branch, the chosen
court and extent, `duration: 8`, the chosen placement's players each with a single keyframe
at `t = 0`, and the ball likewise. Selection is cleared. As today, the new `PlayId` is what
makes `PlayView` remount its playback provider.

Cancelling changes nothing.

### The court view

`PlayView`'s half/full `SegmentedControl` is **removed**. `PlayCanvas` keeps taking its
extent as a prop, which `PlayView` now reads from `play.extent` rather than from local
state — the same route `playName` already takes. `extent` deliberately does **not** enter
`ResolvedTimeline`: the canvas reads the resolved timeline so that the 1b view tests can
render it with no editor present, and the engine has no use for a drawing decision. There
is no longer any way for the viewer to disagree with the system about which court is drawn.

### Editing bounds

Editing is confined to what the system shows, with a margin. A player or the ball can be
dragged, or dropped, anywhere inside the **displayed area expanded by one metre on every
side** — a metre past the baselines and sidelines, because a set starts with players out of
bounds, and a metre past the halfway line on a half-court system, because a defender
dropping back belongs in the picture.

- `clampToCourt` clamps to those bounds instead of `0..length` and `0..width`, so it needs
  the system's extent as well as its court.
- A player added from the editor lands at the centre of the displayed area, not at
  full-court centre — on a half court the latter sits on the halfway line, at the very edge
  of what is shown.
- `APRON`, the margin `fullCourtViewBox` and `halfCourtViewBox` leave around the floor, is
  0.5 m today, so a token at the edge of the new bounds would be drawn outside the viewBox
  and clipped. It grows to at least one metre, and the halfway cut of a half-court viewBox
  gains the same margin rather than cutting flush.

## Strings

All new strings go through `t()` with an English default and a filled French translation,
under the existing `play.*` prefix — `play.menu.*` for the popover, `play.create.*` for the
dialog. The French catalogue's wording for a play becomes « système » throughout, including
in strings that exist today.

## Verification

The feature is done when, in a browser:

- The menu opens, "Save" is visibly disabled, "Create a new system" opens the dialog.
- Submitting with a name, FIBA half court and 5 on 5 closes the dialog, draws only the
  attacking half, in landscape with the basket at the top, with ten players and a loose
  ball, and shows the name in the header.
- The timeline of that system is eight seconds wide and accepts a new keyframe immediately,
  with nothing dragged first.
- Reopening the dialog with that system open shows the discard warning; cancelling leaves
  it untouched.
- The half/full control is gone, and the sample `hornsPlay` still loads on a full court.
- On that half-court system, a player dropped from the editor lands in the middle of the
  shown half, a player can be dragged a metre past the baseline and stays visible there, and
  no drag can put one where it cannot be clicked again. Dragging a token down the screen moves
  it away from the basket, and dragging it right moves it along the court's width.

## Open to the implementer

- Which icon the menu trigger uses, and whether its entries are `Menu` items or buttons
  inside a `Popover` — the existing branches menu uses a controlled `Popover`, and matching
  it is reasonable.
- How the court and placement choices are rendered: `Radio.Group`, `SegmentedControl` or
  `Select` are all acceptable; the spec fixes the options, not the widget.
- Whether the placement data lives in `formation.ts` alongside the existing 5v5 or in a new
  module beside it.
- Test placement and granularity, within the repo's existing Vitest conventions.
