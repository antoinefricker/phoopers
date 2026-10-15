import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { fixturePlay, ROOT, SWITCH } from '../engine/__fixtures__/play';
import { PlayView } from '../play2d/PlayView';
import { stubViewportWidth } from '../testUtils/viewport';
import { branchButton, readProbe, renderEditor } from './testUtils/renderEditor';

beforeEach(() => stubViewportWidth(1440));

const enterEditMode = () => userEvent.click(screen.getByRole('radio', { name: 'Edit' }));
const leaveEditMode = () => userEvent.click(screen.getByRole('radio', { name: 'Play' }));
const openAddMenu = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Add' }));

  // By role, not by test id: the three are `menuitem`s inside a `menu`, which is what makes
  // them reachable with the arrow keys and dismissible with Escape.
  return within(await screen.findByRole('menu'));
};
const players = () => readProbe().play.players;
const stepsOfRoot = () => readProbe().play.branches.find((b) => b.id === ROOT)?.steps ?? [];

describe('the add menu', () => {
  it('is offered in edit mode only', async () => {
    // Its three actions all write to the play, and the transport it sits in is rendered while
    // playing too.
    renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();

    await enterEditMode();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();

    await leaveEditMode();
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
  });

  it('gathers the three things a coach adds', async () => {
    renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();

    const menu = await openAddMenu();

    expect(menu.getByRole('menuitem', { name: 'Add step' })).toBeInTheDocument();
    expect(menu.getByRole('menuitem', { name: 'Add offense' })).toBeInTheDocument();
    expect(menu.getByRole('menuitem', { name: 'Add defense' })).toBeInTheDocument();
  });

  it('adds a step at the playhead, named after how many there are', async () => {
    renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();
    const before = stepsOfRoot().length;

    await userEvent.click((await openAddMenu()).getByRole('menuitem', { name: 'Add step' }));

    expect(stepsOfRoot()).toHaveLength(before + 1);
    expect(stepsOfRoot().map((s) => s.name)).toContain(`Step ${before + 1}`);
    expect(stepsOfRoot().every((s) => Number.isFinite(s.t))).toBe(true);
  });

  it('adds a player to either team', async () => {
    renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();
    const before = players().length;

    await userEvent.click((await openAddMenu()).getByRole('menuitem', { name: 'Add offense' }));
    expect(players()).toHaveLength(before + 1);
    expect(players().at(-1)?.team).toBe('offense');

    await userEvent.click((await openAddMenu()).getByRole('menuitem', { name: 'Add defense' }));
    expect(players()).toHaveLength(before + 2);
    expect(players().at(-1)?.team).toBe('defense');
  });

  it('adds no step before the fork of a child branch, and says nothing', async () => {
    // Moved with the control it exercises. The playhead is at 0 and SWITCH forks at 2, so the
    // mutation refuses; nothing tells the coach. Recorded in limitations.md.
    renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();
    // Through the app's own menu: PlayView owns the playback provider, so a test helper that
    // needs it cannot sit beside PlayView as a sibling.
    await userEvent.click(await branchButton('Defence switches'));
    const stepsOfSwitch = () => readProbe().play.branches.find((b) => b.id === SWITCH)?.steps ?? [];

    await userEvent.click((await openAddMenu()).getByRole('menuitem', { name: 'Add step' }));

    expect(stepsOfSwitch()).toHaveLength(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('closes itself once something is added, and on Escape', async () => {
    // Both come from Menu rather than from anything written here; a Popover of buttons had
    // neither, and the close had to be fired by hand on every item.
    renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();

    await userEvent.click((await openAddMenu()).getByRole('menuitem', { name: 'Add offense' }));
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());

    await openAddMenu();
    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('leaves none of the three where they used to live', async () => {
    // One menu, one place. Two ways to add a player is one more than anyone needs to learn.
    renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();

    for (const name of ['Add step', 'Add offense', 'Add defense']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });
});
