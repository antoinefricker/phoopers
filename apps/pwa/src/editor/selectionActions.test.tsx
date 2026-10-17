import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixturePlay, P1, P2, ROOT, SCREEN_1, SWITCH } from '../engine/__fixtures__/play';
import { PlayView } from '../play2d/PlayView';
import { stubViewportWidth } from '../testUtils/viewport';
import { branchButton, enterEditMode, leaveEditMode, readProbe, renderEditor } from './testUtils/renderEditor';

// These drive the real PlayView, not the mutations: what they prove is that a coach can REACH
// screen creation, screen removal and player removal. The mutations have their own unit tests, and
// the acceptance test calls them directly, which is how three unwired controls once went unseen.
beforeEach(() => stubViewportWidth(1440));
afterEach(() => vi.restoreAllMocks());

const HINT = 'Click the player being screened on the court.';
const rootScreens = () => readProbe().play.branches.find((b) => b.id === ROOT)?.screens ?? [];
const players = () => readProbe().play.players;

const selectOnCourt = (playerId: string) => userEvent.click(screen.getByTestId(`edit-token-${playerId}`));

const renderView = async () => {
  renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
  await enterEditMode();
};

describe('selecting a player on the court', () => {
  it('leaves every track byte-identical: a click selects, it does not author', async () => {
    await renderView();
    const before = JSON.stringify(readProbe().play.branches.map((b) => b.tracks));

    await selectOnCourt(P2);

    expect(readProbe().selection).toEqual({ kind: 'entity', entityId: P2 });
    expect(JSON.stringify(readProbe().play.branches.map((b) => b.tracks))).toBe(before);
  });
});

describe('placing a screen', () => {
  it('offers nothing until a player is selected', async () => {
    await renderView();

    expect(screen.queryByRole('button', { name: 'Place a screen' })).not.toBeInTheDocument();
  });

  it('creates a screen from the selected player to the next player clicked on the court', async () => {
    await renderView();
    const before = rootScreens().length;

    await selectOnCourt(P1);
    await userEvent.click(screen.getByRole('button', { name: 'Place a screen' }));
    expect(screen.getByText(HINT)).toBeInTheDocument();
    await userEvent.click(screen.getByTestId(`edit-token-${P2}`));

    expect(rootScreens()).toHaveLength(before + 1);
    const created = rootScreens().find((s) => s.id !== SCREEN_1);
    expect(created).toMatchObject({ screenerId: P1, beneficiaryId: P2, t: 0 });
    // The mode is spent: the next court click selects, it does not screen again.
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });

  it('writes no keyframe when the beneficiary click ends the gesture', async () => {
    await renderView();
    const before = readProbe().play.branches.find((b) => b.id === ROOT)?.tracks[P2]?.length;

    await selectOnCourt(P1);
    await userEvent.click(screen.getByRole('button', { name: 'Place a screen' }));
    await userEvent.click(screen.getByTestId(`edit-token-${P2}`));

    expect(readProbe().play.branches.find((b) => b.id === ROOT)?.tracks[P2]).toHaveLength(before ?? -1);
  });

  it('leaves the mutation to refuse a self-screen, and ends the gesture', async () => {
    await renderView();
    const before = rootScreens().length;

    await selectOnCourt(P1);
    await userEvent.click(screen.getByRole('button', { name: 'Place a screen' }));
    await userEvent.click(screen.getByTestId(`edit-token-${P1}`));

    expect(rootScreens()).toHaveLength(before);
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });

  it('writes nothing before the fork of a child branch, and gives no feedback', async () => {
    await renderView();
    await userEvent.click(await branchButton('Defence switches'));
    const screensOfSwitch = () => readProbe().play.branches.find((b) => b.id === SWITCH)?.screens ?? [];

    // The playhead is at 0 and SWITCH forks at 2. Recorded in limitations.md.
    await selectOnCourt(P1);
    await userEvent.click(screen.getByRole('button', { name: 'Place a screen' }));
    await userEvent.click(screen.getByTestId(`edit-token-${P2}`));

    expect(screensOfSwitch()).toHaveLength(0);
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('can be cancelled without writing anything', async () => {
    await renderView();
    const before = rootScreens().length;

    await selectOnCourt(P1);
    await userEvent.click(screen.getByRole('button', { name: 'Place a screen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel screen' }));
    await userEvent.click(screen.getByTestId(`edit-token-${P2}`));

    expect(rootScreens()).toHaveLength(before);
  });
});

describe('removing a screen', () => {
  const remove = () =>
    userEvent.click(within(screen.getByTestId('timeline-row-p2')).getByRole('button', { name: 'Remove screen' }));

  it('asks first, and keeps the screen when cancelled', async () => {
    await renderView();

    await remove();
    expect(await screen.findByText('Remove this screen?')).toBeInTheDocument();
    expect(rootScreens()).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(rootScreens()).toHaveLength(1);
  });

  it('removes the screen once confirmed', async () => {
    await renderView();

    await remove();
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    expect(rootScreens()).toHaveLength(0);
  });
});

describe('removing a player', () => {
  // The gutter is 180px and the name needs much of what is left beside the symbol, so removing
  // lives in the row's actions menu rather than on a button of its own. Opening it is therefore
  // part of reaching the command.
  const openRowMenu = async (entityId: string) => {
    const row = within(screen.getByTestId(`timeline-row-${entityId}`));
    await userEvent.click(row.getByRole('button', { name: /^Actions for/ }));

    return within(await screen.findByTestId(`row-menu-${entityId}`));
  };
  const removeItem = async (entityId: string) =>
    (await openRowMenu(entityId)).getByRole('menuitem', { name: /^Remove player/ });

  it('offers the action on a player row and never on the ball', async () => {
    // It is a row's action now, not a selection's: no player has to be picked on the court
    // first, and the ball has no player to remove — so it is offered no menu at all.
    await renderView();

    expect(await removeItem(P1)).toBeInTheDocument();
    expect(
      within(screen.getByTestId('timeline-row-ball')).queryByRole('button', { name: /^Actions for/ }),
    ).not.toBeInTheDocument();
  });

  it('names the player it removes, so eleven of them are told apart', async () => {
    await renderView();

    expect(await removeItem(P1)).toHaveAccessibleName('Remove player Offense 1');
  });

  it('asks first, and keeps the player when cancelled', async () => {
    await renderView();

    await userEvent.click(await removeItem(P1));
    expect(await screen.findByText('Remove player Offense 1?')).toBeInTheDocument();
    expect(players().map((p) => p.id)).toContain(P1);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(players().map((p) => p.id)).toContain(P1);
    // The dialog has to close too. Asserting only that the player survived passes just as well
    // when Cancel does nothing at all, which is how an unwired handler went unnoticed.
    await waitFor(() => expect(screen.queryByText('Remove player 1?')).not.toBeInTheDocument());
  });

  it('removes the player and their screens once confirmed', async () => {
    await renderView();

    await userEvent.click(await removeItem(P1));
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    expect(players().map((p) => p.id)).toEqual([P2]);
    // SCREEN_1 is P2 screening for P1, so it goes with P1.
    expect(rootScreens()).toHaveLength(0);
  });

  it('clears a selection that pointed at the player it removed', async () => {
    await renderView();
    await selectOnCourt(P1);

    await userEvent.click(await removeItem(P1));
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    expect(readProbe().selection).toBeNull();
  });

  it('leaves the selection alone when another player is removed', async () => {
    // The row's action is independent of what is selected, so removing one player must not
    // drop a selection that points at a different one.
    await renderView();
    await selectOnCourt(P2);

    await userEvent.click(await removeItem(P1));
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    expect(readProbe().selection).toEqual({ kind: 'entity', entityId: P2 });
  });

  it('is gone from the selection panel', async () => {
    await renderView();
    await selectOnCourt(P1);

    expect(
      within(screen.getByTestId('selection-actions')).queryByRole('button', { name: /^Remove player/ }),
    ).toBeNull();
  });
});

describe('leaving edit mode', () => {
  it('disarms a screen placement, so returning does not consume the next court click', async () => {
    await renderView();
    await selectOnCourt(P2);
    await userEvent.click(screen.getByRole('button', { name: 'Place a screen' }));
    expect(screen.getByRole('button', { name: 'Cancel screen' })).toBeInTheDocument();

    await leaveEditMode();
    await enterEditMode();

    // Deliberately NOT re-selecting the player first: `select()` already disarms placement, so
    // a test that clicks a token again would pass whether or not the mode switch disarms it.
    // The selection survives the round trip, so the button is on screen either way.
    expect(screen.getByRole('button', { name: 'Place a screen' })).toBeInTheDocument();
  });
});
