import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BranchId, Play } from '../engine';
import { fixturePlay, ROOT, STEP_ENTRY, SWITCH } from '../engine/__fixtures__/play';
import { PlayView } from '../play2d/PlayView';
import { stubViewportWidth } from '../testUtils/viewport';
import { readProbe, renderEditor } from './testUtils/renderEditor';

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
const askToDelete = () => userEvent.click(screen.getByRole('button', { name: `Delete ${SWITCH_NAME}` }));

describe('ConfirmDelete on a branch', () => {
  it('does not remove anything until the confirmation is accepted', async () => {
    renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();

    await askToDelete();

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
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

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(readProbe().play.branches).toHaveLength(fixturePlay.branches.length);
  });

  it('names the descendants that will go with the branch', async () => {
    renderEditor(withGrandchild, <PlayView />, { wrapPlayback: false });
    await enterEditMode();

    await askToDelete();

    expect(await screen.findByRole('dialog')).toHaveTextContent('Deeper');
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

  it('keeps the play when cancelled', async () => {
    renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();

    await userEvent.click(screen.getByRole('button', { name: 'New play' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(readProbe().play.players).toHaveLength(fixturePlay.players.length);
  });
});
