import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixturePlay, P1, P2, ROOT, SCREEN_1 } from '../engine/__fixtures__/play';
import { PlayView } from '../play2d/PlayView';
import { stubViewportWidth } from '../testUtils/viewport';
import { readProbe, renderEditor } from './testUtils/renderEditor';

// These drive the real PlayView, not the mutations: what they prove is that a coach can REACH
// screen creation, screen removal and player removal. The mutations have their own unit tests, and
// the acceptance test calls them directly, which is how three unwired controls once went unseen.
beforeEach(() => stubViewportWidth(1440));
afterEach(() => vi.restoreAllMocks());

const HINT = 'Click the player being screened on the court.';
const rootScreens = () => readProbe().play.branches.find((b) => b.id === ROOT)?.screens ?? [];
const players = () => readProbe().play.players;

const enterEditMode = () => userEvent.click(screen.getByRole('radio', { name: 'Edit' }));
const selectOnCourt = (playerId: string) => userEvent.click(screen.getByTestId(`edit-token-${playerId}`));

const renderView = async () => {
  renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
  await enterEditMode();
};

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
  it('offers the action only for a selected player, not the ball', async () => {
    await renderView();
    expect(screen.queryByRole('button', { name: 'Remove player' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('edit-token-ball'));

    expect(screen.queryByRole('button', { name: 'Remove player' })).not.toBeInTheDocument();
  });

  it('asks first, and keeps the player when cancelled', async () => {
    await renderView();

    await selectOnCourt(P1);
    await userEvent.click(screen.getByRole('button', { name: 'Remove player' }));
    expect(await screen.findByText('Remove player 1?')).toBeInTheDocument();
    expect(players().map((p) => p.id)).toContain(P1);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(players().map((p) => p.id)).toContain(P1);
  });

  it('removes the player and their screens once confirmed, and clears the selection', async () => {
    await renderView();

    await selectOnCourt(P1);
    await userEvent.click(screen.getByRole('button', { name: 'Remove player' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    expect(players().map((p) => p.id)).toEqual([P2]);
    // SCREEN_1 is P2 screening for P1, so it goes with P1.
    expect(rootScreens()).toHaveLength(0);
    expect(readProbe().selection).toBeNull();
  });
});
