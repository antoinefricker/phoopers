import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fixturePlay } from '../engine/__fixtures__/play';
import { PlayView } from '../play2d/PlayView';
import { fullCourtViewBox, halfCourtViewBox } from '../play2d/geometry/court';
import { branchMenu, readProbe, renderEditor } from './testUtils/renderEditor';
import { playheadTime } from '../testUtils/transport';

const renderView = () => renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });

const openMenu = async () => {
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

  it('is there in play mode too, since it is the way back into editing', async () => {
    renderView();
    await openMenu();

    expect(screen.getByRole('button', { name: 'Edit mode' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play mode' })).not.toBeInTheDocument();
  });

  it('offers the way out again once editing', async () => {
    renderView();
    await openMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Edit mode' }));
    await openMenu();

    expect(screen.getByRole('button', { name: 'Play mode' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit mode' })).not.toBeInTheDocument();
  });

  it('leaves no mode control in the header beside it', () => {
    renderView();

    expect(screen.queryByRole('radio', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Play' })).not.toBeInTheDocument();
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

    const viewBox = screen.getByRole('img', { name: /Flex/ }).getAttribute('viewBox');
    expect(viewBox).toBe(halfCourtViewBox('fiba', 'right'));
    expect(viewBox).not.toBe(fullCourtViewBox('fiba'));
  });
});

describe('the court view', () => {
  it('has no control that could disagree with the system', () => {
    renderView();

    expect(screen.queryByLabelText('Court view')).not.toBeInTheDocument();
  });

  it('draws a play that declares no extent on the whole floor', () => {
    renderView();

    expect(screen.getByRole('img', { name: /Horns entry/ })).toHaveAttribute('viewBox', fullCourtViewBox('fiba'));
  });
});

describe('creating while a variant is open and the clock has moved', () => {
  it('comes up on its own root with the playhead back at zero', async () => {
    // The guard is `PlayView`'s `key={play.id}` on the playback provider. Without it the clock
    // and the selected branch outlive the play they pointed into, and the next resolve is handed
    // a branch id the new system has never heard of.
    renderView();
    await userEvent.click((await branchMenu()).getByRole('button', { name: 'Defence switches' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(playheadTime()).toBeGreaterThan(0);

    const dialog = await openDialog();
    await userEvent.type(screen.getByLabelText(/Name/), 'Flex');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    const { play } = readProbe();
    expect(play.branches).toHaveLength(1);
    expect(play.rootBranchId).toBe(play.branches[0]?.id);
    expect(playheadTime()).toBe(0);
  });
});
