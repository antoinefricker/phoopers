# 004 — Step label display

How long a step's name stays on screen, and the timeline control that sets it.

## Why

A step is an instant: a named moment a play passes through. Its name is shown twice — on the
timeline's ruler, and in the caption over the court — and in both places it appears when the
playhead reaches the step and stays until the next one. A coach has no say in that. A name
worth reading for two seconds and one worth reading for eight get the same treatment, and the
last step's name stays on the court for the rest of the play.

This gives the name a display window the coach sets, and puts that window on the timeline as
a bar, where a screen's duration already lives.

## What a step is

```ts
interface Step {
  id: StepId;
  t: number;
  name: string;
  duration?: number;
}
```

`duration` is the number of seconds the name is shown, measured from `t`. It is optional, and
absent means the name is shown until the next step — the behaviour before this spec — so a
play written without it reads exactly as it did.

**The duration governs display and nothing else.** A step remains an instant for every other
purpose: a branch forks at a step's `t`, prev/next-step navigation moves between `t` values,
and the scrubber snaps to them. Nothing in `resolveBranch` or in the sampler reads `duration`.

## The display window

A step's window is `[t, t + duration]`, or `[t, next step's t]` when it has no duration, or
`[t, end of play]` for a last step with neither.

**Windows never overlap.** A duration may not run past the next step's `t`, and the control
that sets it stops there. Where a step has no next step, its window may not run past the end of
the play. The name shown at any instant is therefore unambiguous: the window containing the
playhead, or nothing when the playhead is before the first step or past a window that ended.

The caption over the court shows the name of the window containing the playhead, and is empty
— drawn as nothing at all — outside every window. A play whose steps carry no duration behaves
as before, every instant from the first step onward falling inside some window.

## The timeline

A step is drawn as a bar spanning its window on the ruler, replacing the tick that marked its
instant. The bar carries:

- the step's **name**, inside the bar;
- a **handle on its right edge**, dragged to set the duration, floored at the same minimum a
  screen's duration is floored at and capped at the next step's `t`, or at the end of the play
  for a last step;
- a **handle on its left edge**, dragged to set where the window starts: the step is retimed
  and the window keeps ending where it did, so the duration becomes what is left. It stays
  within the step's own retime bounds (the fork floor of the branch that owns it and its
  ceiling), no earlier than the previous window ends, and leaves the minimum duration before
  the end that stays put. Where the previous step has no duration, its window runs until this
  step starts, so it is left that minimum rather than none. A step with no duration of its
  own gets an explicit one, ending where its implicit window did. The retime and the new
  duration are one change: a start the model refuses leaves the duration alone;
- an **edit** control and a **delete** control at the bar's end, inside it. Inside, because a
  window ending where the play does would otherwise push them off the panel, which then grows a
  horizontal scrollbar.

Each handle fills one grid cell, the bar's first for the left handle and its last for the right
one, so it occupies the interval whose edge it sets, as a keyframe's marker does. It is a cell
wide less a cell padding on each side, at every zoom, and never more than half the bar, which keeps the two apart on a window as
short as the minimum, one cell. The name and the controls sit between them rather than under
them. A handle is grabbed by the edge it sets, so a pointer that takes it away from that edge
does not shift the edge by the distance. A screen's bar, which this one shares its component
with, gives its right-edge handle the same cell.

Both handles are drawn as a keyframe's marker is: a white block with a grey border, the marker's
height and centred on the bar, so an edge of a label reads as a time the way a keyframe does. A
screen's bar draws its end handle the same way.

Dragging the bar itself still retimes the step, as dragging its tick did, under the fork
constraints that already govern a step's `t`; that moves the window whole, where the left
handle moves only its start. A step with no duration draws its implicit window
the same way; dragging its handle is what gives it an explicit one.

A retime moves the window with the step and does not shorten it, and a step may be added inside
a window that already exists. Either can therefore leave a duration running past the next
step's `t` — a state the handle itself can never produce. It is reported rather than prevented,
for the same reason the editor reports elsewhere: refusing the retime would make a step's time
depend on a name's display, which is backwards.

The bar is drawn by the same component as a screen's bar. A screen and a step label are
different things in the model — one is a play's content, the other is how it is annotated — but
they are the same object on screen: a span with a draggable end and controls at its edge.
Sharing the component is what lets the two be changed together later.

That component, `TrackBar`, owns the layout of a bar and not the look of its parts. It is given a
fill, an optional border and a message, a handle for each edge or none, and an ordered list of
controls. The parts are three components of their own in `editor/bar/`, usable on any bar: a
`BarHandle` (the corners' radius on each side, its fill and border colours and an optional icon,
drawn as a keyframe's marker by default, being a `TimeMarker`, the block a keyframe's marker is too) and a `BarActionButton` (its fill, its fill under the
pointer, an icon, the icon's colour and its width, which on the timeline is one grid cell, as a
handle's is, and as tall as a marker). The bar is as tall as a marker plus a cell padding on each side, centred in its row, so it encloses its handles. It places each handle a cell padding (2px, one shared value) in from the cell separator at its edge, as wide as a cell less a padding on each side, and never more than half the bar less one padding. It keeps its message clear of the handles and of anything laid over
its start. The ball's row draws its stretches with the same bar: a tinted one for possession, named after the holder as their row is, and one
carrying the name of a pass or a shot, both the same orange. A player's row draws a teal bar named
Dribble over each stretch where that player holds the ball at both ends and moves.

## Validation

`validatePlay` reports, for each step that carries one:

- a `duration` that is not a finite number, or is not greater than zero;
- a window that runs past the next step's `t` on the same branch;
- a window that runs past the end of the play, which is the later of the last keyframe and the
  system's own `duration`, as the timeline it is drawn on measures it.

A step without a duration is never reported: it has no window of its own to be wrong.

## What this does not do

- It does not make a step a phase. The duration says how long a name is shown, not how long
  anything lasts. A step that opens a passage of play, with a beginning and an end, is a
  different design and is not this one.
- It does not change how a branch forks, how the transport steps, or where the scrubber snaps.
- It does not give a screen's bar a name, nor a step's bar a screener. The two share a
  component, not a meaning.
