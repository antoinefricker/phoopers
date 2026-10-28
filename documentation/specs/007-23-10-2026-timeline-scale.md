# 007 — Timeline scale and zoom

The timeline measures time in pixels at a fixed scale, scrolls horizontally, and offers a zoom
with four fixed levels.

## Why

The timeline is elastic: a track fills the width it is given, and every time inside it is placed
as a share of the play's duration. How finely a coach can read and aim is therefore decided by
the window, not by the work. On a narrow window a 0.1 s cell — the grid every authored time
falls on — shrinks to a few pixels. Precision collapses with legibility: the cell a coach means
to drop a keyframe on is no longer a thing they can see or hit.

A fixed scale turns that around. A cell is the same size whatever the window, and the window
shows as much of the play as it can hold.

## The scale

Time is measured in pixels per 0.1 s cell — the authoring grid of
[spec 001](001-09-10-2026-model-animation-engine.md), unchanged by this spec.

| Level | px per 0.1 s | px per second | An 18 s exercise |
| ----- | ------------ | ------------- | ---------------- |
| 1     | **24**       | 240           | 4320 px          |
| 2     | 18           | 180           | 3240 px          |
| 3     | 12           | 120           | 2160 px          |
| 4     | 6            | 60            | 1080 px          |

Level 1 is where the timeline opens and the finest it goes: the ladder runs outwards only. The
levels are the whole of the scale — there is no continuous zoom and no fit-to-window level.

**A track is as wide as the play is long**, `duration × px per second`, plus the room the axis
keeps at each end: 6 px at the start and 24 px at the end. A keyframe fills the cell that begins
at its time, so one on the last time hangs a whole cell past the axis, and the end keeps the
widest cell (level 1's) at every level, so the axis does not move as the coach zooms. The tracks
move their clip out by that cell at the end the view has reached; nothing hangs past the start.
It is no longer a
share of anything, so a time's position is `t × px per second` rather than a percentage, and the
map from a pointer's x back to a time is the same arithmetic inverted.

## Scrolling

The tracks, the step ruler, the time grid and the transport's scrubber share one time axis, and
they keep sharing it: all four take the same scale and scroll together, as one surface. A coach
therefore never sees a whole system at once unless it happens to fit. That is the price of the
alignment, paid deliberately.
What it costs, measured, is in
[limitations](../limitations.md#a-whole-system-can-no-longer-be-seen-at-once-unless-it-fits), and the one
thing it leaves a keyboard unable to do in
[limitations](../limitations.md#the-time-axis-cannot-be-scrolled-without-moving-focus-or-dragging).

**The horizontal scrollbar's place is reserved whether or not it is in use**, as the vertical
one's already is. A gutter that appeared with the bar would move the axis under the coach's
pointer the moment a play grew past the window. It is reserved **once**, below the shared
surface, and not under each of the four: the vertical budget of the time region is tight, and
four gutters would spend it four times over.

**Shift + the mouse wheel scrolls the axis sideways**, over the scrubber, the ruler, the tracks
or the grid: one offset, so all of them go together. The wheel's delta is the distance, taken
from whichever axis the browser sends it on and read in pixels, lines or pages. It stops at both
ends of the play. A wheel without Shift keeps scrolling the rows, one with Ctrl, Cmd or Alt is
left to the browser, and while the whole play fits the window nothing is taken, so the page keeps
what it would have done. The axis is moved by a transform rather than scrolled natively, which is
why the wheel has to be asked for.

**The gutter does not scroll.** The 180 px column holding the transport's buttons and every
row's name, symbol, hide toggle and menu stays where it is; only the time axis to its right
moves. A coach at t = 14 s can still rename or hide a player without scrolling back to the
start.

**Only the editor is scaled.** Watch mode draws no timeline — the scrubber is the one time
surface on screen — and there it stays elastic, spanning the window and showing the whole play,
with no scrolling and no zoom buttons. A coach who only wants to watch keeps the exercise whole
in front of them. The scale therefore belongs to the editor, not to playback.

**In edit mode the scrubber keeps everything it does today** — its thumb, its marks on the
steps, seeking with the arrow keys, the value shown on hover, and its snap to a nearby step. It
changes scale and it scrolls; it loses nothing.

**Past the end of the play there is nothing.** The rows run to the end and stop; the space
beyond, when the window is wider than the play, is empty — no grid, no track, nothing to click.

## The zoom control

Two buttons, **−** and **+**, with nothing written between them: the grid already says how close
the view is. They sit on a row of their own above the transport and the tracks, ranged right.

A button that cannot act is **disabled rather than hidden**, so the row does not change shape
under the hand: **+** at level 1, **−** at level 4.

**The level lives for as long as the editor is open.** It is not stored with the system, not
shared, and not carried from one system to the next: opening an editor starts at level 1, and
leaving it forgets the level.

## What the view does around a zoom

**The playhead keeps its place in the window.** A click on **−** or **+** leaves the playhead
the same fraction across the visible width as it was before, and the rest of the play slides
around it. Where the playhead is out of sight at that moment, the view is recentred on it.

Where the scroll would run past either end, it stops there, and the playhead takes whatever
position that leaves it — the ends of a play are reachable, not a region the view refuses to
enter.

## Following the playhead

**While the play runs**, the view follows the playhead, holding it between **10 % and 90 %** of
the visible width. Inside that band nothing scrolls; at its edge the view carries the playhead
along, so it is never lost off the end of the window.

**While the play is stopped**, the view never moves on its own. Scrolling is the coach's, with
one exception below.

**During a drag**, a pointer held at either edge of the window scrolls the view under it and the
drag goes on. Any time stays reachable in one gesture: a keyframe at 2 s can be dragged to 14 s
without first zooming out, as it could when the whole play was always on screen. This applies to
every drag the timeline carries — a keyframe's time, a step's, a screen's duration, a step
label's window — and to the playhead dragged along the surface.

## What this does not change

- The 0.1 s authoring grid, and every snap onto it.
- The time grid's rules: a line per cell, drawn more strongly on a whole second, and whole
  seconds alone once the lines would be too many to read. The cap is a count of lines and stays
  one, so a play past roughly 24 s shows whole seconds only, at every level — the cell lines
  were already gone there before this spec, and nothing here brings them back.
- Keyframe markers, screen bars, the step ruler's bars and every drag they carry. A drag reads
  a time from a pointer the way it always did; only the arithmetic underneath changes.
- The vertical axis: row heights, row order, the gutter's width, and what it holds.
- The transport's buttons, the playhead, seeking by clicking the timeline.

**One thing does change inside a drag.** The radius within which a dragged time snaps to a
neighbour is a fraction of the play's duration today, which under an elastic timeline was a
constant distance on screen. At a fixed scale it is not: on an 18 s play it would pull from
86 px away at level 1 and 22 px at level 4, strongest exactly where the coach asked for
precision. The radius becomes **a distance in pixels**, so a snap feels the same at every level
and on every play.

## Non-goals

- **No continuous or pinch zoom**, and no zoom from the keyboard or the wheel. Four levels,
  two buttons.
- **No fit-to-window level.** Making a whole play fit is what the elastic timeline did, and
  it is the behaviour this spec removes.
- **No overview strip.** The scrubber scrolls with everything else rather than standing in as a
  minimap of the whole play.
- **No persistence** of the level, per coach or per system.
- **No scaling in watch mode.** The scrubber there is left exactly as it is.
- **Nothing beyond the end of the play.** Filling that space — lengthening a play by dragging
  into it, for instance — is a separate question this spec does not answer.

## Left to the implementation

- How the four surfaces are kept in horizontal step: one scrolling container around all of
  them, or several kept in sync. The spec requires only that they never part company.
- Where the scale lives in the component tree, and how a row reaches it.
- Whether the empty space past the end of a short play is drawn by the rows or by their
  container.
