import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { fixturePlay } from '../engine/__fixtures__/play';
import { PlayView } from '../play2d/PlayView';
import { enterEditMode, readProbe, renderEditor } from './testUtils/renderEditor';

const openMenu = () => userEvent.click(screen.getByRole('button', { name: /^Menu/ }));

const renderView = () => renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });

/** Open the menu in edit mode, where the Editing group offers more than the way back. */
const openMenuEditing = async () => {
  await enterEditMode();
  await openMenu();
};

beforeEach(() => {
  localStorage.clear();
});

describe('clearing a system', () => {
  it('asks first, and changes nothing while the coach is still deciding', async () => {
    renderView();
    await openMenuEditing();
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(await screen.findByRole('dialog', { name: 'Clear' })).toBeInTheDocument();
    expect(readProbe().play.players).toHaveLength(fixturePlay.players.length);
  });

  it('changes nothing when the confirmation is dismissed', async () => {
    renderView();
    await openMenuEditing();
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    const { play } = readProbe();
    expect(play.players).toHaveLength(fixturePlay.players.length);
    expect(play.branches).toHaveLength(fixturePlay.branches.length);
  });

  it('empties the court once the coach confirms, and keeps the system itself', async () => {
    renderView();
    await openMenuEditing();
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await userEvent.click(screen.getByRole('button', { name: 'Erase everything' }));

    const { play } = readProbe();
    expect(play.players).toEqual([]);
    expect(play.branches).toHaveLength(1);
    expect(play.branches[0]?.steps).toEqual([]);
    // Still the same system: a save after this overwrites the row it came from.
    expect(play.id).toBe(fixturePlay.id);
    expect(play.name).toBe(fixturePlay.name);
    expect(play.rootBranchId).toBe(fixturePlay.rootBranchId);
  });

  it('leaves the court drawable rather than pointing at a branch that is gone', async () => {
    renderView();
    await openMenuEditing();
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await userEvent.click(screen.getByRole('button', { name: 'Erase everything' }));

    // Nothing remounts — the play id never changed — so the branch on screen is put back by
    // hand. If it were not, resolving a branch that no longer exists would throw.
    expect(screen.getByRole('img', { name: /Court diagram/ })).toBeInTheDocument();
    expect(screen.queryAllByTestId('token')).toHaveLength(0);
  });

  it('offers neither clearing nor saving while watching, but still offers the way back', async () => {
    renderView();
    await openMenu();

    expect(screen.getByRole('button', { name: 'Edit mode' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Save/ })).not.toBeInTheDocument();
  });
});
