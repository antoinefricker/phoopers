import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Play, StepId } from '../engine';
import { fixturePlay, P1, P2, ROOT, SCREEN_1, SWITCH } from '../engine/__fixtures__/play';
import { Timeline } from './Timeline';
import { dragElement, readProbe, renderEditor, SelectBranch, trackOf } from './testUtils/renderEditor';

const rowFor = (entityId: string) => screen.getByTestId(`timeline-row-${entityId}`);
const markersIn = (entityId: string) => within(rowFor(entityId)).getAllByRole('button');

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
    expect(within(rowFor(P1)).queryAllByRole('button')).toHaveLength(0);
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

  it('tints possession between consecutive attachment keyframes', () => {
    renderEditor(fixturePlay, <Timeline />);

    // 0-1 P1, 1-2 P1->P2 attachments, 2-4 P2: three held segments.
    expect(within(rowFor('ball')).getAllByTestId(/^possession-/)).toHaveLength(3);
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

// jsdom has no layout. Where a test needs real arithmetic it gives every box this width, so the
// drag helper's final clientX of 120 lands at 120 / WIDTH of the duration.
const withRowWidth = (width: number) =>
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    width,
    right: width,
    top: 0,
    bottom: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });

const secondMarker = (entityId: string) => {
  const marker = markersIn(entityId)[1];
  if (marker === undefined) throw new Error('expected a second marker');

  return marker;
};

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
    expect(trackOf(readProbe().play, ROOT, P1).map((k) => k.t)).toEqual([0, 2.4, 4]);
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

    expect(readProbe().selection).toEqual({ kind: 'keyframe', entityId: P1, t: 2.4 });
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

    // clientX 120 of 200px is 2.4s; the screen starts at 2s.
    expect(screensOfRoot()[0]?.duration).toBeCloseTo(0.4, 6);
  });

  it('keeps the duration positive when the edge is dragged left of its own start', async () => {
    renderEditor(fixturePlay, <Timeline />);

    await dragElement(within(rowFor(P2)).getByTestId(`screen-handle-${SCREEN_1}`));

    // No layout: the drop maps to t=0, before the screen starts. It floors, rather than being
    // refused (which would leave 1), so the drag demonstrably acted.
    expect(screensOfRoot()[0]?.duration).toBeCloseTo(0.1, 6);
  });
});
