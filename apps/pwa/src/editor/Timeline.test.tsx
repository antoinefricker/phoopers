import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { Play, StepId } from '../engine';
import { fixturePlay, P1, P2, ROOT, SCREEN_1, SWITCH } from '../engine/__fixtures__/play';
import { TIME_GRID_S } from '../play2d/transportMath';
import { TRACK_INSET_END_PX, TRACK_INSET_START_PX, leftPx, spanPx } from './timelineGeometry';
import { ZOOM_LEVELS, xOfTime } from './timelineScale';
import { Timeline } from './Timeline';
import { LABEL_WIDTH } from './TimelineRow';
import { dragElement, LivePlayback, readProbe, renderEditor, SelectBranch, trackOf } from './testUtils/renderEditor';

// The level the editor opens at, which is the one every expectation below is written against.
const [LEVEL_1 = 24] = ZOOM_LEVELS;

const rowFor = (entityId: string) => screen.getByTestId(`timeline-row-${entityId}`);
// Scoped to the track, not the whole row: the row's gutter carries the control that hides the
// entity from the court, which is a button too.
const markersIn = (entityId: string) => within(screen.getByTestId(`timeline-track-${entityId}`)).getAllByRole('button');
/** The same, for a row that may legitimately hold none. */
const markerCountIn = (entityId: string) =>
  within(screen.getByTestId(`timeline-track-${entityId}`)).queryAllByRole('button').length;

const withBranch = (
  play: Play,
  branchId: string,
  edit: (b: Play['branches'][number]) => Play['branches'][number],
): Play => ({
  ...play,
  branches: play.branches.map((b) => (b.id === branchId ? edit(b) : b)),
});

// A play where P1 holds a single keyframe, for the "last keyframe" rule.
const soleKeyframe = withBranch(fixturePlay, ROOT, (b) => ({
  ...b,
  tracks: { ...b.tracks, [P1]: [{ t: 0, position: { x: 4, y: 7.5 } }] },
}));

// The ball is attached to P1, released to a position at t=3, then caught by P2.
const releasedBall = withBranch(fixturePlay, ROOT, (b) => ({
  ...b,
  tracks: {
    ...b.tracks,
    ball: [
      { t: 0, attachedTo: P1 },
      { t: 1, attachedTo: P1 },
      { t: 3, position: { x: 9, y: 4 } },
      { t: 4, attachedTo: P2 },
    ],
  },
}));

describe('Timeline', () => {
  it('renders one marker per keyframe', () => {
    renderEditor(fixturePlay, <Timeline />);

    expect(markersIn(P1)).toHaveLength(3);
    expect(markersIn('ball')).toHaveLength(4);
  });

  it('renders a row for every player and one for the ball', () => {
    renderEditor(fixturePlay, <Timeline />);

    expect(screen.getAllByTestId(/^timeline-row-/)).toHaveLength(fixturePlay.players.length + 1);
    expect(rowFor('ball')).toBeInTheDocument();
  });

  it('shows a player with no keyframes as an empty row', () => {
    const sparse = withBranch(fixturePlay, ROOT, (b) => ({ ...b, tracks: { ball: b.tracks.ball ?? [] } }));
    renderEditor(sparse, <Timeline />);

    expect(rowFor(P1)).toBeInTheDocument();
    // Empty of markers, not of controls: the gutter still carries the one that hides the
    // player from the court, which is what makes an empty row worth keeping on screen.
    expect(markerCountIn(P1)).toBe(0);
  });

  it('places a marker at its distance from the start of the play', () => {
    renderEditor(fixturePlay, <Timeline />);
    const [, second] = markersIn(P1);

    // P1's keyframe at t=2, at 24px per 0.1s cell: a distance, not a share of the panel.
    expect(second?.style.left).toBe(leftPx(2, LEVEL_1));
  });

  it('selects a keyframe when its marker is clicked', async () => {
    renderEditor(fixturePlay, <Timeline />);
    const [, second] = markersIn(P1);
    if (second === undefined) throw new Error('expected a second marker');

    await userEvent.click(second);

    expect(readProbe().selection).toEqual({ kind: 'keyframe', entityId: P1, t: 2 });
    expect(second).toHaveAttribute('aria-pressed', 'true');
  });

  it('seeks the playhead to the clicked keyframe', async () => {
    renderEditor(fixturePlay, <Timeline />);
    const [, second] = markersIn(P1);
    if (second === undefined) throw new Error('expected a second marker');

    expect(screen.getByTestId('timeline-playhead').style.left).toBe(leftPx(0, LEVEL_1));
    await userEvent.click(second);

    expect(screen.getByTestId('timeline-playhead').style.left).toBe(leftPx(2, LEVEL_1));
  });

  it('deletes the selected keyframe on Delete', async () => {
    renderEditor(fixturePlay, <Timeline />);
    const [, second] = markersIn(P1);
    if (second === undefined) throw new Error('expected a second marker');

    await userEvent.click(second);
    await userEvent.keyboard('{Delete}');

    expect(trackOf(readProbe().play, ROOT, P1).map((k) => k.t)).toEqual([0, 4]);
    expect(readProbe().selection).toBeNull();
  });

  it('deletes on the branch being viewed, not the root', async () => {
    renderEditor(
      fixturePlay,
      <>
        <SelectBranch branchId={SWITCH} />
        <Timeline />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: `select ${SWITCH}` }));
    const markers = markersIn(P2);
    const last = markers.at(-1);
    if (last === undefined) throw new Error('expected a marker');

    await userEvent.click(last);
    await userEvent.keyboard('{Delete}');

    expect(trackOf(readProbe().play, SWITCH, P2).map((k) => k.t)).toEqual([2]);
    expect(trackOf(readProbe().play, ROOT, P2)).toHaveLength(3);
  });

  it('refuses to delete a player last keyframe', async () => {
    renderEditor(soleKeyframe, <Timeline />);
    const [only] = markersIn(P1);
    if (only === undefined) throw new Error('expected one marker');

    await userEvent.click(only);
    await userEvent.keyboard('{Delete}');

    expect(trackOf(readProbe().play, ROOT, P1)).toHaveLength(1);
    // Pinned because it is documented: the refusal still clears the selection (limitations.md).
    expect(readProbe().selection).toBeNull();
  });

  it('allows deleting the ball last keyframe', async () => {
    const lone = withBranch(fixturePlay, ROOT, (b) => ({
      ...b,
      tracks: { ...b.tracks, ball: [{ t: 0, attachedTo: P1 }] },
    }));
    renderEditor(lone, <Timeline />);
    const [only] = markersIn('ball');
    if (only === undefined) throw new Error('expected a ball marker');

    await userEvent.click(only);
    await userEvent.keyboard('{Delete}');

    expect(trackOf(readProbe().play, ROOT, 'ball')).toHaveLength(0);
  });

  it('tints only what one player actually holds, not the pass between two of them', () => {
    renderEditor(fixturePlay, <Timeline />);

    // 0-1 is P1's and 2-4 is P2's. The 1-2 between them is a pass: both ends are attached, but
    // to DIFFERENT players, so the ball is in flight and nothing is held to tint.
    expect(within(rowFor('ball')).getAllByTestId(/^possession-/)).toHaveLength(2);
  });

  it('names the flight between two carriers a pass', () => {
    renderEditor(fixturePlay, <Timeline />);
    const flights = within(rowFor('ball')).getAllByTestId(/^flight-/);

    expect(flights).toHaveLength(1);
    expect(flights[0]).toHaveTextContent('Pass');
  });

  it('names a flight that ends on the court a shot', () => {
    // The ball is let go towards a point rather than towards a pair of hands.
    renderEditor(releasedBall, <Timeline />);
    const flights = within(rowFor('ball')).getAllByTestId(/^flight-/);

    // 1-3 is the shot; 3-4 is the ball travelling from where it landed into P2's hands.
    expect(flights.map((f) => f.textContent)).toEqual(['Shot', 'Pass']);
  });

  it('names no shot when the ball was already loose', () => {
    // A shot is the ball leaving someone's hands. A stretch between two points on the court —
    // a bounce, a roll, two authored positions — was sent by nobody, so naming it a shot said
    // something untrue about who did what.
    const looseThroughout = withBranch(fixturePlay, ROOT, (b) => ({
      ...b,
      tracks: {
        ...b.tracks,
        ball: [
          { t: 0, position: { x: 2, y: 2 } },
          { t: 2, position: { x: 6, y: 4 } },
          { t: 4, position: { x: 9, y: 6 } },
        ],
      },
    }));
    renderEditor(looseThroughout, <Timeline />);

    expect(within(rowFor('ball')).queryAllByTestId(/^flight-/)).toHaveLength(0);
  });

  it('still names a shot that left a pair of hands', () => {
    const shot = withBranch(fixturePlay, ROOT, (b) => ({
      ...b,
      tracks: {
        ...b.tracks,
        ball: [
          { t: 0, attachedTo: P1 },
          { t: 2, attachedTo: P1 },
          { t: 4, position: { x: 9, y: 6 } },
        ],
      },
    }));
    renderEditor(shot, <Timeline />);
    const flights = within(rowFor('ball')).getAllByTestId(/^flight-/);

    expect(flights.map((f) => f.textContent)).toEqual(['Shot']);
  });

  it('puts no flight label on a stretch the ball is held through', () => {
    const heldThroughout = withBranch(fixturePlay, ROOT, (b) => ({
      ...b,
      tracks: {
        ...b.tracks,
        ball: [
          { t: 0, attachedTo: P1 },
          { t: 4, attachedTo: P1 },
        ],
      },
    }));
    renderEditor(heldThroughout, <Timeline />);
    const ball = within(rowFor('ball'));

    expect(ball.queryAllByTestId(/^flight-/)).toHaveLength(0);
    expect(ball.getAllByTestId(/^possession-/)).toHaveLength(1);
  });

  it('lifts a flight label by the place of its box, so the last one cannot leave the track', () => {
    // The label used to be nudged clear of the row's line with a transform, which moved the BOX,
    // and the last flight ends at the end of the track: measured in a browser, its label sat 6px
    // past the panel and grew a horizontal scrollbar. The lift is in `top`, and a box that
    // ends where the track does keeps ending there.
    renderEditor(fixturePlay, <Timeline />);
    const flight = within(rowFor('ball')).getAllByTestId(/^flight-/)[0];
    if (flight === undefined) throw new Error('expected a flight label');

    expect(flight.style.top).toBe('calc(25% - 7px)');
    expect(flight.style.transform).toBe('');
  });

  it('starts a flight label past the marker that opens the flight', () => {
    // The marker fills the first cell of the flight, 24px at the default zoom, and sits above it.
    renderEditor(fixturePlay, <Timeline />);
    const flight = within(rowFor('ball')).getAllByTestId(/^flight-/)[0];
    if (flight === undefined) throw new Error('expected a flight label');

    expect(within(flight).getByTestId('bar-caption').parentElement?.style.paddingLeft).toBe('28px');
  });

  it('keeps a flight label from spilling into its neighbours', () => {
    // A flight can be a fraction of a second wide. The label has to give way rather than run
    // over the possession on either side of it.
    renderEditor(fixturePlay, <Timeline />);
    const flight = within(rowFor('ball')).getAllByTestId(/^flight-/)[0];
    if (flight === undefined) throw new Error('expected a flight label');
    const label = within(flight).getByTestId('bar-caption');

    // Mantine draws the ellipsis from a class, which jsdom does not apply: the attribute is the
    // thing to read.
    expect(label).toHaveAttribute('data-truncate', 'end');
  });

  it('breaks possession where the ball is released, and marks that keyframe hollow', () => {
    renderEditor(releasedBall, <Timeline />);
    const ball = within(rowFor('ball'));

    expect(ball.getAllByTestId(/^possession-/)).toHaveLength(1);
    expect(markersIn('ball').map((m) => m.getAttribute('data-kind'))).toEqual([
      'attached',
      'attached',
      'position',
      'attached',
    ]);
  });
});

// jsdom has no layout. A width is no longer part of the arithmetic — a pointer's x is read
// against the scale, not against the box — so what a test gives a row is its track's LEFT edge,
// and a draggable (a marker or a screen handle) a zero-width box whose centre is `markerCentre`.
const withTrackAt = (trackLeft: number, markerCentre = 0) =>
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const draggable = this.tagName === 'BUTTON' || (this.dataset['testid'] ?? '').startsWith('screen-handle');
    const left = draggable ? markerCentre : trackLeft;

    return { left, width: 0, right: left, top: 0, bottom: 0, height: 0, x: left, y: 0, toJSON: () => ({}) };
  });

// `dragElement` presses at clientX 0 and releases at 120. A track whose left edge is this far to
// the LEFT therefore takes that release at t = 2.4 — the time the cases below drop a marker on.
// A negative left is what a scrolled timeline genuinely reports: the start of the play is off
// the left of the window, and the pointer is still measured from it.
const DROP_T = 2.4;
const TRACK_LEFT = 120 - xOfTime(DROP_T, LEVEL_1);

const secondMarker = (entityId: string) => {
  const marker = markersIn(entityId)[1];
  if (marker === undefined) throw new Error('expected a second marker');

  return marker;
};

// The keyboard commits on every press, so the view must follow the model between presses: the
// second nudge of a keyframe counts from where the first one left it.
const renderLive = (play: Play, extra?: ReactNode) =>
  renderEditor(
    play,
    <LivePlayback>
      {extra}
      <Timeline />
    </LivePlayback>,
    { wrapPlayback: false },
  );

describe('retiming', () => {
  afterEach(() => vi.restoreAllMocks());

  it('retimes one keyframe on release, without creating or losing any', async () => {
    renderEditor(fixturePlay, <Timeline />);

    await dragElement(secondMarker(P1));

    // Every box is at x=0 in jsdom, so the release at clientX 120 is 120px along the axis: half
    // a second at 24px a cell. The exact time proves the keyframe MOVED; the length proves none
    // was added.
    const times = trackOf(readProbe().play, ROOT, P1).map((k) => k.t);
    expect(times).toHaveLength(3);
    expect(times[1]).toBeCloseTo(0.5, 6);
  });

  it('commits the time the scale reads from the track own left edge', async () => {
    withTrackAt(TRACK_LEFT);
    renderEditor(fixturePlay, <Timeline />);

    await dragElement(secondMarker(P1));

    // The same release as the case above, on a track that starts further left: the pointer is a
    // distance from the START OF THE PLAY, so the time it lands on moves with that edge.
    expect(trackOf(readProbe().play, ROOT, P1).map((k) => k.t)).toEqual([0, DROP_T, 4]);
  });

  it('does not jump when a block is grabbed away from its left edge', async () => {
    // A marker is a block one cell wide that begins on its time, so a pointer that grabs it 20px
    // in has not grabbed its time. The drag follows the pointer's DELTA from that grab: measured
    // from the middle instead, the block would land half a cell off on the very first move.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const block = this.tagName === 'BUTTON';
      const left = block ? xOfTime(2, LEVEL_1) : 0;
      const width = block ? LEVEL_1 : 0;

      return { left, width, right: left + width, top: 0, bottom: 0, height: 0, x: left, y: 0, toJSON: () => ({}) };
    });
    renderEditor(fixturePlay, <Timeline />);
    const marker = secondMarker(P1);
    const grabX = xOfTime(2, LEVEL_1) + 20;

    await userEvent.setup().pointer([
      { keys: '[MouseLeft>]', target: marker, coords: { clientX: grabX, clientY: 0 } },
      { target: marker, coords: { clientX: grabX + 48, clientY: 0 } },
      { keys: '[/MouseLeft]', target: marker, coords: { clientX: grabX + 48, clientY: 0 } },
    ]);

    // 48px is two cells: the block moves by exactly what the pointer did, from 2s to 2.2s.
    expect(trackOf(readProbe().play, ROOT, P1).map((k) => k.t)).toEqual([0, 2.2, 4]);
  });

  it('never lets a keyframe cross its neighbour', async () => {
    withTrackAt(TRACK_LEFT);
    renderEditor(fixturePlay, <Timeline />);

    // Drag the first marker (t=0) rightwards to 2.4s: it must stop short of the keyframe at 2.
    const first = markersIn(P1)[0];
    if (first === undefined) throw new Error('expected a first marker');
    await dragElement(first);

    const times = trackOf(readProbe().play, ROOT, P1).map((k) => k.t);
    expect(times).toHaveLength(3);
    expect(times[0]).toBeCloseTo(2 - 0.001, 6);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('snaps to a nearby step', async () => {
    // The release lands on 1.0s; a step at 1.03 is inside the 0.05s radius (12 px at the finest level).
    withTrackAt(120 - xOfTime(1, LEVEL_1));
    const withNearbyStep = withBranch(fixturePlay, ROOT, (b) => ({
      ...b,
      steps: [...b.steps, { id: 'near' as StepId, t: 1.03, name: 'Near' }],
    }));
    renderEditor(withNearbyStep, <Timeline />);

    await dragElement(secondMarker(P1));

    expect(trackOf(readProbe().play, ROOT, P1).map((k) => k.t)).toEqual([0, 1.03, 4]);
  });

  it('leaves the play untouched while the drag is in flight', async () => {
    renderEditor(fixturePlay, <Timeline />);
    const user = userEvent.setup();
    const second = secondMarker(P1);
    const before = JSON.stringify(readProbe().play);
    expect(second.style.left).toBe(leftPx(2, LEVEL_1));

    await user.pointer([
      { keys: '[MouseLeft>]', target: second },
      { target: second, coords: { clientX: 40, clientY: 0 } },
    ]);

    // The marker followed the pointer (so the gesture is live) yet nothing was committed.
    expect(second.style.left).not.toBe(leftPx(2, LEVEL_1));
    expect(JSON.stringify(readProbe().play)).toBe(before);
  });

  it('nudges the focused keyframe by one grid cell per arrow press', async () => {
    // No layout is needed: a nudge counts from the keyframe's own time, not from the pointer.
    // Shift once meant a finer step; every authored time is on the grid now, so it means the
    // same one — a press either moves a cell or does nothing.
    renderLive(fixturePlay);
    const user = userEvent.setup();
    const second = secondMarker(P1);
    second.focus();

    await user.keyboard('{ArrowRight}');
    expect(trackOf(readProbe().play, ROOT, P1).map((k) => k.t)).toEqual([0, 2 + TIME_GRID_S, 4]);

    // The same element is still focused: the marker is keyed by position, so retiming it does
    // not remount it and a second press lands on the keyframe the first one moved.
    await user.keyboard('{Shift>}{ArrowLeft}{/Shift}');
    expect(trackOf(readProbe().play, ROOT, P1).map((k) => k.t)).toEqual([0, 2, 4]);
  });

  it('stops a nudged keyframe at its neighbour instead of crossing it', async () => {
    renderLive(fixturePlay);
    const user = userEvent.setup();
    const first = markersIn(P1)[0];
    if (first === undefined) throw new Error('expected a first marker');
    first.focus();

    // Enough presses to ask for 2.0s, which is exactly the neighbour: the bound holds it just
    // below, and one more press has nowhere to go and writes nothing. Counted from the cell, so
    // the case survives the grid being retuned.
    const toTheNeighbour = Math.round(2 / TIME_GRID_S);
    await user.keyboard('{ArrowRight}'.repeat(toTheNeighbour + 1));

    const times = trackOf(readProbe().play, ROOT, P1).map((k) => k.t);
    expect(times).toHaveLength(3);
    expect(times[0]).toBeCloseTo(2 - 0.001, 6);
  });

  it('nudges a screen edge from its handle, which the keyboard can reach', async () => {
    renderLive(fixturePlay);
    const user = userEvent.setup();
    // The handle used to be a div: focusing it did nothing and no key reached the gesture.
    const handle = screen.getByTestId(`screen-handle-${SCREEN_1}`);
    handle.focus();
    expect(document.activeElement).toBe(handle);

    await user.keyboard('{ArrowRight}');

    const screens = readProbe().play.branches.find((b) => b.id === ROOT)?.screens ?? [];
    expect(screens.map((s) => s.duration)).toEqual([1 + TIME_GRID_S]);
  });

  it('does not retime on a plain click', async () => {
    // P1 starts at t=1, so a stray drop at t=0 would be a legal move: only the click rule stops it.
    const gap = withBranch(fixturePlay, ROOT, (b) => ({
      ...b,
      tracks: {
        ...b.tracks,
        [P1]: [
          { t: 1, position: { x: 4, y: 7.5 } },
          { t: 2, position: { x: 8, y: 5 } },
          { t: 4, position: { x: 12, y: 5 } },
        ],
      },
    }));
    renderEditor(gap, <Timeline />);
    const first = markersIn(P1)[0];
    if (first === undefined) throw new Error('expected a first marker');

    await userEvent.click(first);

    expect(trackOf(readProbe().play, ROOT, P1).map((k) => k.t)).toEqual([1, 2, 4]);
    expect(readProbe().selection).toEqual({ kind: 'keyframe', entityId: P1, t: 1 });
  });

  it('keeps the selection on the keyframe it dragged', async () => {
    withTrackAt(TRACK_LEFT);
    renderEditor(fixturePlay, <Timeline />);
    await userEvent.click(secondMarker(P1));
    expect(readProbe().selection).toEqual({ kind: 'keyframe', entityId: P1, t: 2 });

    // The keyframe being dragged is the selected one, so selecting must follow it to its new time.
    await dragElement(secondMarker(P1));

    expect(readProbe().selection).toEqual({ kind: 'keyframe', entityId: P1, t: DROP_T });
  });
});

describe('drag feel', () => {
  afterEach(() => vi.restoreAllMocks());

  // P1 starts at t=1, so a drop anywhere near 0 would be a legal move: only the rules under test stop it.
  const gap = withBranch(fixturePlay, ROOT, (b) => ({
    ...b,
    tracks: {
      ...b.tracks,
      [P1]: [
        { t: 1, position: { x: 4, y: 7.5 } },
        { t: 2, position: { x: 8, y: 5 } },
        { t: 4, position: { x: 12, y: 5 } },
      ],
    },
  }));

  it('moves by the pointer delta, not its absolute position, when grabbed off-centre', async () => {
    // Marker centre at 20px; pressed at 50px (30px right of centre), released at 150px. The
    // marker lands where its CENTRE would be, 150 - 30 = 120px along the axis, which the track's
    // left edge puts at 2.4s — not at the 2.5s that reading the pointer's absolute x would give.
    // The grab has to be wider than half a grid cell (12px at this level), or both readings
    // round to the same answer and the case stops telling them apart.
    withTrackAt(TRACK_LEFT, 20);
    renderEditor(fixturePlay, <Timeline />);
    const user = userEvent.setup();

    await user.pointer([
      { keys: '[MouseLeft>]', target: secondMarker(P1), coords: { clientX: 50, clientY: 0 } },
      { target: secondMarker(P1), coords: { clientX: 100, clientY: 0 } },
      { target: secondMarker(P1), coords: { clientX: 150, clientY: 0 } },
      { keys: '[/MouseLeft]', target: secondMarker(P1) },
    ]);

    expect(trackOf(readProbe().play, ROOT, P1).map((k) => k.t)).toEqual([0, DROP_T, 4]);
  });

  it('treats a twitch under the slop as a click, not a retime', async () => {
    renderEditor(gap, <Timeline />);
    const user = userEvent.setup();
    const first = markersIn(P1)[0];
    if (first === undefined) throw new Error('expected a first marker');

    await user.pointer([
      { keys: '[MouseLeft>]', target: first, coords: { clientX: 0, clientY: 0 } },
      { target: first, coords: { clientX: 2, clientY: 0 } },
      { keys: '[/MouseLeft]', target: first },
    ]);

    expect(trackOf(readProbe().play, ROOT, P1).map((k) => k.t)).toEqual([1, 2, 4]);
    expect(readProbe().selection).toEqual({ kind: 'keyframe', entityId: P1, t: 1 });
  });

  it('starts dragging once the pointer clears the slop', async () => {
    renderEditor(gap, <Timeline />);
    const user = userEvent.setup();
    const first = markersIn(P1)[0];
    if (first === undefined) throw new Error('expected a first marker');

    await user.pointer([
      { keys: '[MouseLeft>]', target: first, coords: { clientX: 0, clientY: 0 } },
      { target: first, coords: { clientX: 4, clientY: 0 } },
      { keys: '[/MouseLeft]', target: first },
    ]);

    // 4px is under a sixth of a cell, which the grid rounds to zero: the keyframe moved from 1
    // to 0, so the drag cleared the slop and was placed and committed rather than read as the
    // click that would have left it where it was.
    expect(trackOf(readProbe().play, ROOT, P1).map((k) => k.t)).toEqual([0, 2, 4]);
  });
});

describe('inherited markers', () => {
  afterEach(() => vi.restoreAllMocks());

  const viewSwitch = async () => {
    renderEditor(
      fixturePlay,
      <>
        <SelectBranch branchId={SWITCH} />
        <Timeline />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: `select ${SWITCH}` }));
  };

  it('marks the synthesised fork anchor as inherited and the branch own keyframe as its own', async () => {
    await viewSwitch();
    const [ancestor, forkAnchor, own] = markersIn(P1);

    // P1 on SWITCH has one keyframe, at 3. The root's keyframe at 0 is inherited, and so is the
    // one synthesised at the fork instant (2).
    expect(ancestor).toHaveAttribute('data-inherited', 'true');
    expect(forkAnchor).toHaveAttribute('data-inherited', 'true');
    expect(own).not.toHaveAttribute('data-inherited');
  });

  it('does not move the selection when an inherited marker is dragged', async () => {
    withTrackAt(TRACK_LEFT);
    await viewSwitch();
    const forkAnchor = markersIn(P1)[1];
    if (forkAnchor === undefined) throw new Error('expected the fork anchor');

    await userEvent.click(forkAnchor);
    await dragElement(forkAnchor);

    expect(readProbe().selection).toEqual({ kind: 'keyframe', entityId: P1, t: 2 });
    expect(trackOf(readProbe().play, SWITCH, P1).map((k) => k.t)).toEqual([3]);
  });

  it('still lets the branch own marker be dragged', async () => {
    withTrackAt(TRACK_LEFT);
    await viewSwitch();
    const own = markersIn(P1)[2];
    if (own === undefined) throw new Error('expected the own marker');

    await dragElement(own);

    // Released at 2.4s, inside the branch's bounds (floor 2).
    expect(trackOf(readProbe().play, SWITCH, P1).map((k) => k.t)).toEqual([DROP_T]);
  });
});

describe('screen bars', () => {
  afterEach(() => vi.restoreAllMocks());

  const screensOfRoot = () => readProbe().play.branches.find((b) => b.id === ROOT)?.screens ?? [];

  it('renders a screen as a bar on its screener row, spanning its duration', () => {
    renderEditor(fixturePlay, <Timeline />);
    const bar = within(rowFor(P2)).getByTestId(`screen-bar-${SCREEN_1}`);

    // The fixture's screen: P2 screens for P1, from t=2 for 1s.
    expect(bar.style.left).toBe(leftPx(2, LEVEL_1));
    expect(bar.style.width).toBe(spanPx(2, 3, LEVEL_1));
    expect(within(rowFor(P1)).queryByTestId(`screen-bar-${SCREEN_1}`)).toBeNull();
  });

  it('sets the duration by dragging the right edge', async () => {
    withTrackAt(TRACK_LEFT);
    renderEditor(fixturePlay, <Timeline />);

    await dragElement(within(rowFor(P2)).getByTestId(`screen-handle-${SCREEN_1}`));

    // The edge is released at 2.4s and the screen starts at 2s.
    expect(screensOfRoot()[0]?.duration).toBeCloseTo(DROP_T - 2, 6);
  });

  it('shows an ancestor screen on a descendant branch without a handle or a remove control', async () => {
    renderEditor(
      fixturePlay,
      <>
        <SelectBranch branchId={SWITCH} />
        <Timeline />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: `select ${SWITCH}` }));

    // The root's screen starts at 2, the instant SWITCH forks, so it is inside the dimmed region.
    const bar = within(rowFor(P2)).getByTestId(`screen-bar-${SCREEN_1}`);
    expect(bar).toHaveAttribute('data-inherited', 'true');
    expect(within(rowFor(P2)).queryByTestId(`screen-handle-${SCREEN_1}`)).toBeNull();
    expect(within(rowFor(P2)).queryByRole('button', { name: 'Remove screen' })).toBeNull();
    expect(screensOfRoot()[0]?.duration).toBe(1);
  });

  it('keeps the duration positive when the edge is dragged left of its own start', async () => {
    renderEditor(fixturePlay, <Timeline />);

    await dragElement(within(rowFor(P2)).getByTestId(`screen-handle-${SCREEN_1}`));

    // No layout: the drop maps to 0.5s, before the screen starts. It floors at one grid cell,
    // rather than being refused (which would leave 1), so the drag demonstrably acted.
    expect(screensOfRoot()[0]?.duration).toBeCloseTo(TIME_GRID_S, 6);
  });
});

describe('track alignment', () => {
  it('insets the row window, the ruler window and the overlay window by the same amount', () => {
    // jsdom has no layout, so it cannot see the overflow this inset exists to prevent. What it
    // CAN pin is that the three windows sharing one time axis agree: if a later change insets
    // the rows but not the overlay, the playhead drifts from the markers by that amount.
    // The inset lives on the WINDOW rather than on the track inside it: inside, it would be a
    // distance the scrolling content carried and the axis would start half a marker late.
    renderEditor(fixturePlay, <Timeline />);

    // By test id, not by child order: the row also holds the always-mounted dialog that
    // confirms removing a screen, which is a sibling of the window.
    const windows = [
      screen.getByTestId(`timeline-window-${P1}`),
      screen.getByTestId('step-ruler-window'),
      screen.getByTestId('timeline-axis'),
    ];

    // A small margin at the start and a whole cell at the end, where a marker on the last time
    // hangs past the axis. The ruler and the overlay keep the same ends the rows do.
    for (const surface of windows) {
      expect(surface.style.marginLeft).toBe(`${TRACK_INSET_START_PX}px`);
      expect(surface.style.marginRight).toBe(`${TRACK_INSET_END_PX}px`);
    }
  });

  it('starts the overlay where the gutter ends', () => {
    // The gutter holds the names and does not scroll, so every window begins where it ends. The
    // rows and the ruler get there by laying the gutter out beside them; the overlay, being
    // absolutely positioned over both, has to say so itself.
    renderEditor(fixturePlay, <Timeline />);

    expect(screen.getByTestId('timeline-axis-area').style.left).toBe(LABEL_WIDTH);
  });
});

describe('text selection', () => {
  it('makes the timeline unselectable, so a marker drag does not select row labels', () => {
    renderEditor(fixturePlay, <Timeline />);
    const surface = screen.getByTestId('timeline-surface');

    expect(surface.style.userSelect).toBe('none');
  });
});

describe('the ball row for a screen reader', () => {
  it('names a held keyframe differently from a loose one', () => {
    // The row shows possession as a tinted segment versus a hollow marker. Shape and colour
    // carry nothing to assistive technology, and `data-kind` is not exposed, so the accessible
    // name is the only place the distinction can live.
    // The engine fixture's ball is attached at every keyframe, so a loose one is added here —
    // without it the test passes even if every marker is named "held".
    const withShot: Play = {
      ...fixturePlay,
      branches: fixturePlay.branches.map((b) =>
        b.id === ROOT
          ? { ...b, tracks: { ...b.tracks, ball: [...(b.tracks.ball ?? []), { t: 6, position: { x: 25, y: 7 } }] } }
          : b,
      ),
    };
    renderEditor(withShot, <Timeline />);
    const ballRow = rowFor('ball');

    expect(within(ballRow).getByRole('button', { name: 'Ball loose at 6s' })).toBeInTheDocument();
    expect(within(ballRow).getByRole('button', { name: 'Ball held at 0s' })).toBeInTheDocument();
    expect(within(ballRow).queryAllByRole('button', { name: /loose/i })).toHaveLength(1);
    expect(within(ballRow).queryAllByRole('button', { name: /^Keyframe at/ })).toHaveLength(0);
  });
});

// A scrub reads two boxes, and jsdom lays out neither. The axis AREA is the fixed region beside
// the label column: it decides whether a press was on the time axis at all, so it is given a
// width and placed away from x=0, which makes a press in the label column to its left a real
// case here. The CONTENT inside it is the play: its left edge is t=0 — the distance from there
// is what the scale turns into a time — and it is as wide as the play is long.
const AXIS_LEFT = 40;
// The fixture is a 4s play, which is 960px at this level. The area is given MORE than that on
// purpose: a window wider than the play is the ordinary case, and the strip of area past the
// content's right edge is the empty space the spec says holds nothing to click.
const CONTENT_WIDTH = xOfTime(4, LEVEL_1);
const AXIS_WIDTH = CONTENT_WIDTH + 200;
const withAxis = () =>
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const id = this.dataset['testid'];
    const area = id === 'timeline-axis-area';
    const onAxis = area || id === 'timeline-axis-content';
    const left = onAxis ? AXIS_LEFT : 0;
    const width = area ? AXIS_WIDTH : onAxis ? CONTENT_WIDTH : 0;

    return { left, width, right: left + width, top: 0, bottom: 0, height: 0, x: left, y: 0, toJSON: () => ({}) };
  });

/** The clientX at which a time falls, on the stubbed axis above. */
const atTime = (t: number) => AXIS_LEFT + xOfTime(t, LEVEL_1);

/** Press, optionally drag through `through`, and release — all on the timeline surface. */
const scrub = async (clientX: number, through: number[] = []) => {
  const surface = screen.getByTestId('timeline-surface');
  await userEvent.pointer([
    { keys: '[MouseLeft>]', target: surface, coords: { clientX, clientY: 0 } },
    ...through.map((x) => ({ target: surface, coords: { clientX: x, clientY: 0 } })),
    { keys: '[/MouseLeft]', target: surface, coords: { clientX: through.at(-1) ?? clientX, clientY: 0 } },
  ]);
};

const playheadLeft = () => screen.getByTestId('timeline-playhead').style.left;

describe('scrubbing the timeline', () => {
  afterEach(() => vi.restoreAllMocks());

  it('moves the playhead to where the timeline was pressed', async () => {
    withAxis();
    renderLive(fixturePlay);

    await scrub(atTime(1));

    expect(playheadLeft()).toBe(leftPx(1, LEVEL_1));
  });

  it('follows the pointer while the button is held', async () => {
    withAxis();
    renderLive(fixturePlay);

    await scrub(atTime(1), [atTime(2), atTime(3)]);

    expect(playheadLeft()).toBe(leftPx(3, LEVEL_1));
  });

  it('holds the playhead at the end when the drag runs past the axis', async () => {
    withAxis();
    renderLive(fixturePlay);

    // Past the last second of the play, where there is nothing: the playhead stops at the end
    // rather than running on into the empty space beside it.
    await scrub(atTime(2), [atTime(4) + 500]);

    expect(playheadLeft()).toBe(leftPx(4, LEVEL_1));
  });

  it('leaves the playhead alone for a press in the label column', async () => {
    withAxis();
    renderLive(fixturePlay);

    await scrub(AXIS_LEFT - 10);

    expect(playheadLeft()).toBe(leftPx(0, LEVEL_1));
  });

  it('leaves the playhead alone when a control inside the timeline is pressed', async () => {
    withAxis();
    renderLive(fixturePlay);

    // Not a drag gesture, so nothing stops the event reaching the surface: the guard does.
    await userEvent.click(within(rowFor(P1)).getByRole('button', { name: /^Actions for/ }));

    expect(playheadLeft()).toBe(leftPx(0, LEVEL_1));
  });

  it('leaves the playhead alone for a press past the end of the play', async () => {
    // INSIDE the axis area and to the right of the content: the empty strip a window wider than
    // the play leaves beyond it. The spec says there is nothing there — no grid, no track,
    // nothing to click — so a press is a press on nothing, not a seek to the last instant.
    // It is the one bound the area alone cannot give: the area reaches the panel's edge.
    withAxis();
    renderLive(fixturePlay);

    await scrub(atTime(4) + 100);

    expect(playheadLeft()).toBe(leftPx(0, LEVEL_1));
  });

  it('still carries a drag that runs past the end to the end', async () => {
    // The press bound above and the clamp inside the drag are different rules, and this pins
    // that adding the first did not quietly take the second: a gesture already under way that
    // leaves the content holds the playhead at the end rather than dropping it there.
    withAxis();
    renderLive(fixturePlay);

    await scrub(atTime(2), [atTime(4) + 100]);

    expect(playheadLeft()).toBe(leftPx(4, LEVEL_1));
  });
});
