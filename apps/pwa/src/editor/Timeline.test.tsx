import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { Play, StepId } from '../engine';
import { fixturePlay, P1, P2, ROOT, SCREEN_1, SWITCH } from '../engine/__fixtures__/play';
import { TRACK_INSET_PX } from './timelineGeometry';
import { Timeline } from './Timeline';
import { dragElement, LivePlayback, readProbe, renderEditor, SelectBranch, trackOf } from './testUtils/renderEditor';

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

  it('places a marker at its fraction of the duration', () => {
    renderEditor(fixturePlay, <Timeline />);
    const [, second] = markersIn(P1);

    // P1 keyframe at t=2 of a 4s play.
    expect(second?.style.left).toBe('50%');
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

    expect(screen.getByTestId('timeline-playhead').style.left).toBe('0%');
    await userEvent.click(second);

    expect(screen.getByTestId('timeline-playhead').style.left).toBe('50%');
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

  it('offsets a flight label inside its own box, so the last one cannot leave the track', () => {
    // The label is nudged clear of the marker that opens the flight. Done with a transform it
    // moved the BOX, and the last flight ends at the end of the track: measured in a browser,
    // its label sat 6px past the panel and grew a horizontal scrollbar. Padding moves the text
    // within a box that still ends where the track does.
    renderEditor(fixturePlay, <Timeline />);
    const label = within(rowFor('ball')).getAllByTestId(/^flight-/)[0];
    if (label === undefined) throw new Error('expected a flight label');

    expect(label.style.paddingLeft).not.toBe('');
    expect(label.style.transform).not.toContain('translate(');
  });

  it('keeps a flight label from spilling into its neighbours', () => {
    // A flight can be a fraction of a second wide. The label has to give way rather than run
    // over the possession on either side of it.
    renderEditor(fixturePlay, <Timeline />);
    const label = within(rowFor('ball')).getAllByTestId(/^flight-/)[0];
    if (label === undefined) throw new Error('expected a flight label');

    expect(label.style.overflow).toBe('hidden');
    expect(label.style.whiteSpace).toBe('nowrap');
    expect(label.style.textOverflow).toBe('ellipsis');
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

// jsdom has no layout. Where a test needs real arithmetic, the timeline rows get this width, and
// a draggable (a marker or a screen handle) is a zero-width box whose centre is `markerCentre`.
// The drag helper presses at clientX 0 and releases at 120, so with the centre at 0 the grab
// offset is 0 and the release lands at 120 / width of the duration.
const withRowWidth = (width: number, markerCentre = 0) =>
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const draggable = this.tagName === 'BUTTON' || (this.dataset['testid'] ?? '').startsWith('screen-handle');
    const left = draggable ? markerCentre : 0;
    const w = draggable ? 0 : width;

    return { left, width: w, right: left + w, top: 0, bottom: 0, height: 0, x: left, y: 0, toJSON: () => ({}) };
  });

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

    // Without layout the drop maps to t=0, which the neighbour bound pushes just above the
    // keyframe at 0. The exact 0.001 proves the keyframe MOVED; the length proves none was added.
    const times = trackOf(readProbe().play, ROOT, P1).map((k) => k.t);
    expect(times).toHaveLength(3);
    expect(times[1]).toBeCloseTo(0.001, 6);
  });

  it('commits the pixel-derived time when the row has layout', async () => {
    withRowWidth(200);
    renderEditor(fixturePlay, <Timeline />);

    await dragElement(secondMarker(P1));

    // clientX 120 of a 200px row across a 4s play.
    // 120 / 200 * 4 = 2.4s, which the grid rounds to the nearest half second.
    expect(trackOf(readProbe().play, ROOT, P1).map((k) => k.t)).toEqual([0, 2.5, 4]);
  });

  it('never lets a keyframe cross its neighbour', async () => {
    withRowWidth(200);
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
    // clientX 120 of 480px is 1.0s of a 4s play; a step at 1.03 is inside the 0.08s threshold.
    withRowWidth(480);
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
    expect(second.style.left).toBe('50%');

    await user.pointer([
      { keys: '[MouseLeft>]', target: second },
      { target: second, coords: { clientX: 40, clientY: 0 } },
    ]);

    // The marker followed the pointer (so the gesture is live) yet nothing was committed.
    expect(second.style.left).not.toBe('50%');
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
    expect(trackOf(readProbe().play, ROOT, P1).map((k) => k.t)).toEqual([0, 2.5, 4]);

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

    // Four coarse presses ask for 2.0s, which is exactly the neighbour: the bound holds it just
    // below, and the fifth press has nowhere to go and writes nothing.
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}');

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
    expect(screens.map((s) => s.duration)).toEqual([1.5]);
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
    withRowWidth(200);
    renderEditor(fixturePlay, <Timeline />);
    await userEvent.click(secondMarker(P1));
    expect(readProbe().selection).toEqual({ kind: 'keyframe', entityId: P1, t: 2 });

    // The keyframe being dragged is the selected one, so selecting must follow it to its new time.
    await dragElement(secondMarker(P1));

    expect(readProbe().selection).toEqual({ kind: 'keyframe', entityId: P1, t: 2.5 });
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
    // marker lands where its CENTRE would be: (150 - 30) / 200 * 4 = 2.4s, which the grid
    // rounds to 2.5 — not 150 / 200 * 4 = 3s, which the grid would leave at 3.
    // The grab has to be wider than half a grid cell, or both readings round to the same
    // answer and the case stops telling them apart.
    withRowWidth(200, 20);
    renderEditor(fixturePlay, <Timeline />);
    const user = userEvent.setup();

    await user.pointer([
      { keys: '[MouseLeft>]', target: secondMarker(P1), coords: { clientX: 50, clientY: 0 } },
      { target: secondMarker(P1), coords: { clientX: 100, clientY: 0 } },
      { target: secondMarker(P1), coords: { clientX: 150, clientY: 0 } },
      { keys: '[/MouseLeft]', target: secondMarker(P1) },
    ]);

    expect(trackOf(readProbe().play, ROOT, P1).map((k) => k.t)).toEqual([0, 2.5, 4]);
  });

  it('treats a twitch under the slop as a click, not a retime', async () => {
    withRowWidth(200);
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
    withRowWidth(200);
    renderEditor(gap, <Timeline />);
    const user = userEvent.setup();
    const first = markersIn(P1)[0];
    if (first === undefined) throw new Error('expected a first marker');

    await user.pointer([
      { keys: '[MouseLeft>]', target: first, coords: { clientX: 0, clientY: 0 } },
      { target: first, coords: { clientX: 4, clientY: 0 } },
      { keys: '[/MouseLeft]', target: first },
    ]);

    // 4px of 200px across 4s.
    // 4px past the slop is 0.08s, which the grid rounds back to zero — the drag still
    // demonstrably acted, the marker having been placed and committed.
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
    withRowWidth(200);
    await viewSwitch();
    const forkAnchor = markersIn(P1)[1];
    if (forkAnchor === undefined) throw new Error('expected the fork anchor');

    await userEvent.click(forkAnchor);
    await dragElement(forkAnchor);

    expect(readProbe().selection).toEqual({ kind: 'keyframe', entityId: P1, t: 2 });
    expect(trackOf(readProbe().play, SWITCH, P1).map((k) => k.t)).toEqual([3]);
  });

  it('still lets the branch own marker be dragged', async () => {
    withRowWidth(200);
    await viewSwitch();
    const own = markersIn(P1)[2];
    if (own === undefined) throw new Error('expected the own marker');

    await dragElement(own);

    // Released at 2.4s, inside the branch's bounds (floor 2).
    expect(trackOf(readProbe().play, SWITCH, P1).map((k) => k.t)).toEqual([2.5]);
  });
});

describe('screen bars', () => {
  afterEach(() => vi.restoreAllMocks());

  const screensOfRoot = () => readProbe().play.branches.find((b) => b.id === ROOT)?.screens ?? [];

  it('renders a screen as a bar on its screener row, spanning its duration', () => {
    renderEditor(fixturePlay, <Timeline />);
    const bar = within(rowFor(P2)).getByTestId(`screen-bar-${SCREEN_1}`);

    // The fixture's screen: P2 screens for P1, from t=2 for 1s, of a 4s play.
    expect(bar.style.left).toBe('50%');
    expect(bar.style.width).toBe('25%');
    expect(within(rowFor(P1)).queryByTestId(`screen-bar-${SCREEN_1}`)).toBeNull();
  });

  it('sets the duration by dragging the right edge', async () => {
    withRowWidth(200);
    renderEditor(fixturePlay, <Timeline />);

    await dragElement(within(rowFor(P2)).getByTestId(`screen-handle-${SCREEN_1}`));

    // clientX 120 of 200px is 2.4s, which the grid rounds to 2.5; the screen starts at 2s.
    expect(screensOfRoot()[0]?.duration).toBeCloseTo(0.5, 6);
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

    // No layout: the drop maps to t=0, before the screen starts. It floors at one grid cell,
    // rather than being refused (which would leave 1), so the drag demonstrably acted.
    expect(screensOfRoot()[0]?.duration).toBeCloseTo(0.5, 6);
  });
});

describe('track alignment', () => {
  it('insets the row track, the ruler track and the overlay by the same amount', () => {
    // jsdom has no layout, so it cannot see the overflow this inset exists to prevent. What it
    // CAN pin is that the three containers sharing one time axis agree: if a later change insets
    // the rows but not the overlay, the playhead drifts from the markers by that amount.
    renderEditor(fixturePlay, <Timeline />);

    // By test id, not by child order: the row also holds the always-mounted dialog that
    // confirms removing a screen, which is a sibling of the track.
    const rowTrack = screen.getByTestId(`timeline-track-${P1}`);
    const rulerTrack = screen.getByTestId('step-ruler-track');
    const overlay = screen.getByTestId('timeline-playhead').parentElement as HTMLElement;

    // Both sides take the same inset now: with the time readout gone the scrubber runs the
    // full width, so nothing extra is reserved on the right.
    const right = `${TRACK_INSET_PX}px`;
    expect(rowTrack.style.marginLeft).toBe(`${TRACK_INSET_PX}px`);
    expect(rowTrack.style.marginRight).toBe(right);
    expect(rulerTrack.style.marginLeft).toBe(`${TRACK_INSET_PX}px`);
    expect(rulerTrack.style.marginRight).toBe(right);
    expect(overlay.style.right).toBe(right);
    expect(overlay.style.left).toContain(`${TRACK_INSET_PX}px`);
  });
});

describe('text selection', () => {
  it('makes the timeline unselectable, so a marker drag does not select row labels', () => {
    renderEditor(fixturePlay, <Timeline />);
    const surface = screen.getByTestId('step-ruler').parentElement as HTMLElement;

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
