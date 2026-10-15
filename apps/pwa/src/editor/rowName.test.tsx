import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Play } from '../engine';
import { P1, P2, fixturePlay } from '../engine/__fixtures__/play';
import { PlayView } from '../play2d/PlayView';
import { stubViewportWidth } from '../testUtils/viewport';
import { renderEditor } from './testUtils/renderEditor';

beforeEach(() => stubViewportWidth(1440));

const enterEditMode = () => userEvent.click(screen.getByRole('radio', { name: 'Edit' }));

const named = (label: string | undefined, team: 'offense' | 'defense' = 'offense'): Play => ({
  ...fixturePlay,
  players: fixturePlay.players.map((player) => (player.id === P1 ? { ...player, team, label } : player)),
});

const nameOf = (entityId: string) => screen.getByTestId(`row-name-${entityId}`);

const render = async (play: Play) => {
  renderEditor(play, <PlayView />, { wrapPlayback: false });
  await enterEditMode();
};

describe('the name beside a row symbol', () => {
  it('shows the coach own name once they have given one', async () => {
    await render(named('Pivot'));

    expect(nameOf(P1)).toHaveTextContent('Pivot');
  });

  it('falls back to the side and the number when they have not', async () => {
    await render(fixturePlay);

    expect(nameOf(P1)).toHaveTextContent('Offense 1');
    expect(nameOf(P2)).toHaveTextContent('Offense 2');
  });

  it('names a defender by their own side', async () => {
    await render(named(undefined, 'defense'));

    expect(nameOf(P1)).toHaveTextContent('Defense 1');
  });

  it('falls back for a name that is empty or only spaces', async () => {
    await render(named('   '));

    expect(nameOf(P1)).toHaveTextContent('Offense 1');
  });

  it('names the ball, which wears no number', async () => {
    await render(fixturePlay);

    expect(nameOf('ball')).toHaveTextContent('Ball');
  });

  it('carries the whole name in the title, the gutter being too narrow for a long one', async () => {
    // About 62px are left beside the symbol, so a long name ellipses on screen. The title is
    // then the only place the rest of it survives.
    const long = 'Meneur de jeu remplacant';
    await render(named(long));

    expect(nameOf(P1)).toHaveAttribute('title', long);
    expect(nameOf(P1)).toHaveTextContent(long);
  });

  it('says the name once, not twice, to a screen reader', async () => {
    // The symbol badge beside it already carries the same string as its accessible name.
    await render(named('Pivot'));

    expect(nameOf(P1)).toHaveAttribute('aria-hidden', 'true');
    expect(within(screen.getByTestId(`timeline-row-${P1}`)).getByRole('img')).toHaveAccessibleName('Pivot');
  });

  it('renames the player everywhere the row names them', async () => {
    // One helper behind all of them, so a rename cannot reach the gutter and miss the controls.
    await render(named('Pivot'));
    const row = within(screen.getByTestId(`timeline-row-${P1}`));

    expect(row.getByRole('button', { name: 'Hide Pivot' })).toBeInTheDocument();
    expect(row.getByRole('button', { name: 'Reorder Pivot' })).toBeInTheDocument();
    expect(row.getByRole('button', { name: 'Actions for Pivot' })).toBeInTheDocument();

    await userEvent.click(row.getByRole('button', { name: 'Actions for Pivot' }));
    const menu = within(await screen.findByTestId(`row-menu-${P1}`));

    expect(menu.getByRole('menuitem', { name: 'Rename Pivot' })).toBeInTheDocument();
    expect(menu.getByRole('menuitem', { name: 'Remove player Pivot' })).toBeInTheDocument();
  });

  it('names the players in the screen dialog the same way', async () => {
    // This one is reached through its own helper rather than the row's `rowName`, and nothing
    // caught it when the rename left it behind — hence a case of its own. The fixture's screen
    // is set by P2 for P1, so naming P1 must reach the body.
    await render(named('Pivot'));
    await userEvent.click(
      within(screen.getByTestId(`timeline-row-${P2}`)).getByRole('button', { name: 'Remove screen' }),
    );

    expect(await screen.findByText(/The screen set by Offense 2 for Pivot will be removed\./)).toBeInTheDocument();
  });

  it('leaves the number in the symbol, which is not the name', async () => {
    // The symbol says which side and which number; the text beside it says which player.
    await render(named('Pivot'));

    expect(within(screen.getByTestId(`timeline-row-${P1}`)).getByRole('img')).toHaveTextContent('1');
  });
});
