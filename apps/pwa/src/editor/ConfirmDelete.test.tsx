import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { COURT_DIMENSIONS } from '../engine';
import type { BranchId, Play } from '../engine';
import { fixturePlay, ROOT, STEP_ENTRY, SWITCH } from '../engine/__fixtures__/play';
import { PlayView } from '../play2d/PlayView';
import { stubViewportWidth } from '../testUtils/viewport';
import { branchButton, readProbe, renderEditor } from './testUtils/renderEditor';

const DEEPER = 'deeper' as BranchId;
const SWITCH_NAME = 'Defence switches';

const withGrandchild: Play = {
  ...fixturePlay,
  branches: [
    ...fixturePlay.branches,
    {
      id: DEEPER,
      parentId: SWITCH,
      forkStepId: STEP_ENTRY,
      name: 'Deeper',
      tracks: { ball: [] },
      steps: [],
      screens: [],
    },
  ],
};

beforeEach(() => stubViewportWidth(1440));

const enterEditMode = async () => {
  await userEvent.click(screen.getByRole('radio', { name: 'Edit' }));
};
const askToDelete = async () => userEvent.click(await branchButton(`Delete ${SWITCH_NAME}`));
/**
 * The confirmation, by name. The branch menu that the delete action was reached through is a
 * `role="dialog"` as well (Mantine's Popover, named after its trigger), so an unqualified
 * dialog query matches two things.
 */
const confirmation = () => screen.findByRole('dialog', { name: `Delete ${SWITCH_NAME}?` });

describe('ConfirmDelete on a branch', () => {
  it('does not remove anything until the confirmation is accepted', async () => {
    renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();

    await askToDelete();

    expect(await confirmation()).toBeInTheDocument();
    expect(readProbe().play.branches).toHaveLength(fixturePlay.branches.length);
  });

  it('removes the branch on confirmation', async () => {
    renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();

    await askToDelete();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    expect(readProbe().play.branches.some((b) => b.id === SWITCH)).toBe(false);
    expect(readProbe().play.branches.some((b) => b.id === ROOT)).toBe(true);
  });

  it('cancels without removing', async () => {
    renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();

    await askToDelete();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: `Delete ${SWITCH_NAME}?` })).not.toBeInTheDocument(),
    );
    expect(readProbe().play.branches).toHaveLength(fixturePlay.branches.length);
  });

  it('names the descendants that will go with the branch', async () => {
    renderEditor(withGrandchild, <PlayView />, { wrapPlayback: false });
    await enterEditMode();

    await askToDelete();

    expect(await confirmation()).toHaveTextContent('Deeper');
  });

  it('removes the descendants too when confirmed', async () => {
    renderEditor(withGrandchild, <PlayView />, { wrapPlayback: false });
    await enterEditMode();

    await askToDelete();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    expect(readProbe().play.branches.map((b) => b.id)).toEqual([ROOT]);
  });
});

describe('New play', () => {
  it('replaces the play with an empty one only after confirmation', async () => {
    renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();

    await userEvent.click(screen.getByRole('button', { name: 'New play' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(readProbe().play.players).toHaveLength(fixturePlay.players.length);

    await userEvent.click(screen.getByRole('button', { name: 'Start over' }));

    const { play } = readProbe();
    expect(play.players).toEqual([]);
    expect(play.branches).toHaveLength(1);
    expect(play.branches[0]?.id).toBe(play.rootBranchId);
  });

  it('starts the ball at the centre circle, with a keyframe at zero', async () => {
    // An empty court gives a coach nothing to drag. The ball is the one thing every play has,
    // so it is placed before anything else is, loose on the floor since there is no one yet
    // to hold it.
    renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();

    await userEvent.click(screen.getByRole('button', { name: 'New play' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Start over' }));

    const { play } = readProbe();
    const { length, width } = COURT_DIMENSIONS[play.court];
    expect(play.branches[0]?.tracks.ball).toEqual([{ t: 0, position: { x: length / 2, y: width / 2 } }]);
  });

  it('takes the centre from the court the play is on', async () => {
    // Hard-coding 14 x 7.5 would put the ball off-centre on an NBA floor.
    renderEditor({ ...fixturePlay, court: 'nba' }, <PlayView />, { wrapPlayback: false });
    await enterEditMode();

    await userEvent.click(screen.getByRole('button', { name: 'New play' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Start over' }));

    const { play } = readProbe();
    expect(play.court).toBe('nba');
    expect(play.branches[0]?.tracks.ball?.[0]?.position).toEqual({
      x: COURT_DIMENSIONS.nba.length / 2,
      y: COURT_DIMENSIONS.nba.width / 2,
    });
    expect(play.branches[0]?.tracks.ball?.[0]?.position).not.toEqual({
      x: COURT_DIMENSIONS.fiba.length / 2,
      y: COURT_DIMENSIONS.fiba.width / 2,
    });
  });

  it('draws the ball on the court straight away', async () => {
    const { container } = renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();

    await userEvent.click(screen.getByRole('button', { name: 'New play' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Start over' }));

    expect(container.querySelector('[data-testid="ball-token"]')).not.toBeNull();
  });

  it('keeps the play when cancelled', async () => {
    renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();

    await userEvent.click(screen.getByRole('button', { name: 'New play' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(readProbe().play.players).toHaveLength(fixturePlay.players.length);
  });
});
