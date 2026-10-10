import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Play } from '../engine';
import { fixturePlay, P1, P2, ROOT, SWITCH } from '../engine/__fixtures__/play';
import { Timeline } from './Timeline';
import { readProbe, renderEditor, SelectBranch, trackOf } from './testUtils/renderEditor';

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
