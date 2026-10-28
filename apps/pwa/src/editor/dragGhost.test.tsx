import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { fixturePlay, P1, P2 } from '../engine/__fixtures__/play';
import { PlayView } from '../play2d/PlayView';
import { stubViewportWidth } from '../testUtils/viewport';
import { enterEditMode, renderEditor } from './testUtils/renderEditor';

beforeEach(() => stubViewportWidth(1440));

const renderCourt = async () => {
  renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
  await enterEditMode();
};

const tokenOf = (entityId: string) => document.querySelector<SVGGElement>(`[data-token-of="${entityId}"]`)!;
const ghost = () => screen.getByTestId('edit-ghost');
/** The copies the ghost is showing: one per drag, and each is the symbol of the thing dragged. */
const shown = () =>
  Array.from(ghost().querySelectorAll<SVGGElement>('[data-ghost-of]'))
    .filter((symbol) => symbol.getAttribute('display') === 'inline')
    .map((symbol) => ({ of: symbol.dataset['ghostOf'], text: symbol.textContent }));

const press = (entityId: string) => userEvent.setup().pointer({ keys: '[MouseLeft>]', target: hit(entityId) });
const hit = (entityId: string) => screen.getByTestId(`edit-token-${entityId}`);
const moveBy = (entityId: string) =>
  userEvent.setup().pointer({ target: hit(entityId), coords: { clientX: 80, clientY: 60 } });

describe('dragging a token on the court', () => {
  it('drains the colour of the token where it stands and shows a copy of the same symbol, in colour', async () => {
    await renderCourt();
    const user = userEvent.setup();

    await user.pointer([
      { keys: '[MouseLeft>]', target: hit(P1) },
      { target: hit(P1), coords: { clientX: 80, clientY: 60 } },
    ]);

    // The token left behind is drained of colour, and the copy is the player's own symbol, number and all,
    // not a marker of a kind of its own.
    expect(tokenOf(P1).style.filter).toBe('grayscale(1)');
    expect(ghost()).toHaveAttribute('visibility', 'visible');
    expect(shown()).toEqual([{ of: P1, text: '1' }]);
    // Nobody else is touched.
    expect(tokenOf(P2).style.filter).toBe('');
  });

  it('shows a copy of the ball when the ball is dragged', async () => {
    await renderCourt();

    await userEvent.setup().pointer([
      { keys: '[MouseLeft>]', target: hit('ball') },
      { target: hit('ball'), coords: { clientX: 80, clientY: 60 } },
    ]);

    expect(tokenOf('ball').style.filter).toBe('grayscale(1)');
    expect(shown()).toEqual([{ of: 'ball', text: '' }]);
  });

  it('does nothing for a press that has not moved yet, which is still a click', async () => {
    await renderCourt();

    await press(P1);

    expect(tokenOf(P1).style.filter).toBe('');
    expect(ghost()).toHaveAttribute('visibility', 'hidden');
  });

  it('gives the token back its colour and hides the copy on release', async () => {
    await renderCourt();
    const user = userEvent.setup();

    await user.pointer([
      { keys: '[MouseLeft>]', target: hit(P1) },
      { target: hit(P1), coords: { clientX: 80, clientY: 60 } },
      { keys: '[/MouseLeft]', target: hit(P1) },
    ]);

    expect(tokenOf(P1).style.filter).toBe('');
    expect(ghost()).toHaveAttribute('visibility', 'hidden');
  });

  it('does the same when the gesture is cancelled', async () => {
    await renderCourt();
    await press(P1);
    await moveBy(P1);
    expect(tokenOf(P1).style.filter).toBe('grayscale(1)');

    fireEvent.pointerCancel(hit(P1));

    expect(tokenOf(P1).style.filter).toBe('');
    expect(ghost()).toHaveAttribute('visibility', 'hidden');
  });
});
