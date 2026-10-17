import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Play } from '../engine';
import { P1, P2, fixturePlay } from '../engine/__fixtures__/play';
import { PlayView } from '../play2d/PlayView';
import { stubViewportWidth } from '../testUtils/viewport';
import { enterEditMode, readProbe, renderEditor } from './testUtils/renderEditor';

beforeEach(() => stubViewportWidth(1440));

const named = (label: string | undefined): Play => ({
  ...fixturePlay,
  players: fixturePlay.players.map((player) => (player.id === P1 ? { ...player, label } : player)),
});

const render = async (play: Play = fixturePlay) => {
  renderEditor(play, <PlayView />, { wrapPlayback: false });
  await enterEditMode();
};

const nameOf = (entityId: string) => screen.getByTestId(`row-name-${entityId}`);
const labelInPlay = () => readProbe().play.players.find((p) => p.id === P1)?.label;

const openRename = async (entityId: string) => {
  const row = within(screen.getByTestId(`timeline-row-${entityId}`));
  await userEvent.click(row.getByRole('button', { name: /^Actions for/ }));
  const menu = within(await screen.findByTestId(`row-menu-${entityId}`));
  await userEvent.click(menu.getByRole('menuitem', { name: /^Rename/ }));

  return screen.getByRole('textbox', { name: 'Name' });
};

const save = () => userEvent.click(screen.getByRole('button', { name: 'Save' }));

describe('naming a player from their row', () => {
  it('writes the name the coach typed and shows it on the row', async () => {
    await render();

    await userEvent.type(await openRename(P1), 'Pivot');
    await save();

    expect(labelInPlay()).toBe('Pivot');
    await waitFor(() => expect(nameOf(P1)).toHaveTextContent('Pivot'));
  });

  it('opens on the name the player already has', async () => {
    // Not on an empty field: a rename is usually a correction, and retyping it from scratch is
    // what makes an editor feel hostile.
    await render(named('Pivot'));

    expect(await openRename(P1)).toHaveValue('Pivot');
  });

  it('opens empty for a player who has none, and offers the fallback as the placeholder', async () => {
    // The placeholder is what the row shows today, so the field says what clearing it gives.
    await render();
    const field = await openRename(P1);

    expect(field).toHaveValue('');
    expect(field).toHaveAttribute('placeholder', 'Offense 1');
  });

  it('offers the fallback as the placeholder even for a player who has a name', async () => {
    // The placeholder says what clearing the field gives back, so it must NOT be the name the
    // field already holds — which is what it was when it was passed the row's displayed name.
    await render(named('Pivot'));
    const field = await openRename(P1);

    expect(field).toHaveValue('Pivot');
    expect(field).toHaveAttribute('placeholder', 'Offense 1');
  });

  it('takes the name back when the coach clears the field', async () => {
    await render(named('Pivot'));

    await userEvent.clear(await openRename(P1));
    await save();

    expect(labelInPlay()).toBeUndefined();
    await waitFor(() => expect(nameOf(P1)).toHaveTextContent('Offense 1'));
  });

  it('treats a name of nothing but spaces as clearing it', async () => {
    await render(named('Pivot'));
    const field = await openRename(P1);

    await userEvent.clear(field);
    await userEvent.type(field, '   ');
    await save();

    expect(labelInPlay()).toBeUndefined();
  });

  it('saves on Enter, as any one-field form would', async () => {
    await render();

    await userEvent.type(await openRename(P1), 'Pivot{Enter}');

    expect(labelInPlay()).toBe('Pivot');
  });

  it('writes nothing when the coach cancels', async () => {
    await render(named('Pivot'));

    await userEvent.type(await openRename(P1), ' remplacant');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(labelInPlay()).toBe('Pivot');
  });

  it('starts from the current name again on a second open', async () => {
    // The dialog stays mounted for its exit transition, so without re-keying it per open the
    // field would still hold what the last open left in it.
    await render();
    await userEvent.type(await openRename(P1), 'Pivot');
    await save();

    expect(await openRename(P1)).toHaveValue('Pivot');
  });

  it('renames only the player whose row it was opened from', async () => {
    await render();

    await userEvent.type(await openRename(P1), 'Pivot');
    await save();

    await waitFor(() => expect(nameOf(P2)).toHaveTextContent('Offense 2'));
    expect(readProbe().play.players.find((p) => p.id === P2)?.label).toBeUndefined();
  });

  it('is not offered on the ball, which has no player record to name', async () => {
    await render();

    expect(
      within(screen.getByTestId('timeline-row-ball')).queryByRole('button', { name: /^Actions for/ }),
    ).not.toBeInTheDocument();
  });
});
