import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
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
