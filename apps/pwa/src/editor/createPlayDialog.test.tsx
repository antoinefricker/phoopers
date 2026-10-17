import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fixturePlay } from '../engine/__fixtures__/play';
import { PlayView } from '../play2d/PlayView';
import { readProbe, renderEditor } from './testUtils/renderEditor';

const renderView = () => renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });

const openMenu = async () => {
  await userEvent.click(screen.getByText('Edit'));
  await userEvent.click(screen.getByRole('button', { name: 'System menu' }));
};

const openDialog = async () => {
  await openMenu();
  await userEvent.click(screen.getByRole('button', { name: 'Create a new system' }));

  return screen.getByRole('dialog');
};

describe('the system menu', () => {
  it('offers saving but cannot do it yet', async () => {
    renderView();
    await openMenu();

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('stays out of the way in play mode', () => {
    renderView();

    expect(screen.queryByRole('button', { name: 'System menu' })).not.toBeInTheDocument();
  });
});

describe('the creation dialog', () => {
  it('refuses a name of nothing but spaces', async () => {
    renderView();
    const dialog = await openDialog();
    await userEvent.type(screen.getByLabelText(/Name/), '   ');

    expect(within(dialog).getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('warns that the open system will be discarded', async () => {
    renderView();
    await openDialog();

    expect(screen.getByText(/will be discarded/i)).toBeInTheDocument();
  });

  it('changes nothing when it is cancelled', async () => {
    renderView();
    const dialog = await openDialog();
    await userEvent.type(screen.getByLabelText(/Name/), 'Flex');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(readProbe().play.id).toBe(fixturePlay.id);
  });

  it('creates the system it was asked for and closes', async () => {
    renderView();
    const dialog = await openDialog();
    await userEvent.type(screen.getByLabelText(/Name/), 'Flex');
    await userEvent.click(screen.getByRole('radio', { name: 'FIBA half court' }));
    await userEvent.click(screen.getByRole('radio', { name: '3 on 3' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    const { play } = readProbe();
    expect(play.name).toBe('Flex');
    expect(play.extent).toBe('half');
    expect(play.players).toHaveLength(6);
    expect(play.duration).toBe(8);
  });

  it('draws the half the new system declares', async () => {
    renderView();
    const dialog = await openDialog();
    await userEvent.type(screen.getByLabelText(/Name/), 'Flex');
    await userEvent.click(screen.getByRole('radio', { name: 'FIBA half court' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(screen.getByRole('img', { name: /Flex/ })).toHaveAttribute('viewBox', '13 -1 16 17');
  });
});

describe('the court view', () => {
  it('has no control that could disagree with the system', () => {
    renderView();

    expect(screen.queryByLabelText('Court view')).not.toBeInTheDocument();
  });

  it('draws a play that declares no extent on the whole floor', () => {
    renderView();

    expect(screen.getByRole('img', { name: /Horns entry/ })).toHaveAttribute('viewBox', '-1 -1 30 17');
  });
});
