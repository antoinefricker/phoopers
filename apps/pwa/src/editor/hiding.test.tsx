import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { P1, P2, fixturePlay } from '../engine/__fixtures__/play';
import { PlayView } from '../play2d/PlayView';
import { stubViewportWidth } from '../testUtils/viewport';
import { renderEditor } from './testUtils/renderEditor';

beforeEach(() => stubViewportWidth(1440));

const enterEditMode = () => userEvent.click(screen.getByRole('radio', { name: 'Edit' }));
const leaveEditMode = () => userEvent.click(screen.getByRole('radio', { name: 'Play' }));

const tokenFor = (container: HTMLElement, entityId: string) =>
  container.querySelector(`[data-testid="token"][data-player-id="${entityId}"]`);
const pathFor = (container: HTMLElement, entityId: string) =>
  container.querySelector(`[data-testid="player-path"][data-player-id="${entityId}"]`);
const hideButton = (entityId: string) =>
  within(screen.getByTestId(`timeline-row-${entityId}`)).getByRole('button', { name: /^(Hide|Show) / });
const ballToken = (container: HTMLElement) => container.querySelector('[data-testid="ball-token"]');

// Alt is held across the press, as a pointer does, rather than passed as an option: the handler
// reads `event.altKey` off the click, which only a real modifier state sets.
const altClick = async (button: HTMLElement) => {
  const user = userEvent.setup();
  await user.keyboard('{Alt>}');
  await user.click(button);
  await user.keyboard('{/Alt}');
};

describe('hiding an entity from the court', () => {
  it('takes the token and its path off the court, and leaves the row behind', async () => {
    // The row has to stay: it is the only way back, and its keyframes are still editable.
    const { container } = renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();
    expect(tokenFor(container, P1)).not.toBeNull();
    expect(pathFor(container, P1)).not.toBeNull();

    await userEvent.click(hideButton(P1));

    expect(tokenFor(container, P1)).toBeNull();
    expect(pathFor(container, P1)).toBeNull();
    expect(screen.getByTestId(`timeline-row-${P1}`)).toBeInTheDocument();
  });

  it('leaves every other entity alone', async () => {
    const { container } = renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();
    const before = container.querySelectorAll('[data-testid="token"]').length;

    await userEvent.click(hideButton(P1));

    expect(container.querySelectorAll('[data-testid="token"]')).toHaveLength(before - 1);
  });

  it('puts it back when the control is pressed again', async () => {
    const { container } = renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();

    await userEvent.click(hideButton(P1));
    await userEvent.click(hideButton(P1));

    expect(tokenFor(container, P1)).not.toBeNull();
    expect(pathFor(container, P1)).not.toBeNull();
  });

  it('puts it back where the clock says it is, not at the court corner', async () => {
    // The tokens are painted by a layout effect that subscribes to the clock. Showing one
    // again mounts a fresh node, and nothing in that effect's dependencies changed, so the
    // node kept no transform at all and was drawn at the svg origin until the clock next
    // moved — which, paused, it never does.
    const { container } = renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();
    const before = tokenFor(container, P1)?.getAttribute('transform');

    await userEvent.click(hideButton(P1));
    await userEvent.click(hideButton(P1));

    expect(before).not.toBeNull();
    expect(tokenFor(container, P1)?.getAttribute('transform')).toBe(before);
  });

  it("takes a hidden player's screen symbols off the court with it", async () => {
    // The symbol is drawn at the screener's own position, so leaving it behind put a mark on
    // the floor with no token under it.
    const { container } = renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();
    const screenerOf = (mark: Element) => mark.getAttribute('data-screener-id');
    const marks = () => [...container.querySelectorAll('[data-testid="screen-mark"]')];
    const screener = screenerOf(marks()[0] as Element);
    if (screener === null) throw new Error('expected a screen mark naming its screener');
    const before = marks().length;

    await userEvent.click(hideButton(screener));

    expect(marks().filter((m) => screenerOf(m) === screener)).toHaveLength(0);
    expect(marks()).toHaveLength(before - 1);
  });

  it('leaves a screen alone when only its beneficiary is hidden', async () => {
    // The screener is still on the floor and still setting it, so the symbol still describes
    // something the coach can see.
    const { container } = renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();
    const marks = () => container.querySelectorAll('[data-testid="screen-mark"]');
    const screener = marks()[0]?.getAttribute('data-screener-id');
    const other = fixturePlay.players.map((p) => p.id).find((id) => id !== screener);
    if (other === undefined) throw new Error('expected another player');
    const before = marks().length;

    await userEvent.click(hideButton(other));

    expect(marks()).toHaveLength(before);
  });

  it('hides the ball too', async () => {
    const { container } = renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();
    expect(container.querySelector('[data-testid="ball-token"]')).not.toBeNull();

    await userEvent.click(hideButton('ball'));

    expect(container.querySelector('[data-testid="ball-token"]')).toBeNull();
  });

  it("takes the ball's path with it, not just its token", async () => {
    // Spec 003 says the control takes off the token and the path drawn for it, the ball
    // included. Hiding the ball to declutter while its dashed arrows stayed read as a bug.
    const { container } = renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();
    expect(container.querySelector('[data-testid="ball-path"]')).not.toBeNull();

    await userEvent.click(hideButton('ball'));

    expect(container.querySelector('[data-testid="ball-path"]')).toBeNull();
  });

  it('shows everything again in play mode, where nothing could unhide it', async () => {
    // The control lives in the timeline, which play mode does not render. A hide that survived
    // the switch could not be undone without going back to edit.
    const { container } = renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();
    await userEvent.click(hideButton(P1));

    await leaveEditMode();

    expect(tokenFor(container, P1)).not.toBeNull();
    expect(pathFor(container, P1)).not.toBeNull();
  });

  it('remembers the hiding on the way back into edit mode', async () => {
    const { container } = renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();
    await userEvent.click(hideButton(P1));

    await leaveEditMode();
    await enterEditMode();

    expect(tokenFor(container, P1)).toBeNull();
  });

  it('names the entity in the control, and says which way it goes', async () => {
    // A bare "Hide" would leave a voice-control user with eleven identical buttons.
    renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();
    const button = hideButton(P1);

    expect(button).toHaveAccessibleName('Hide Offense 1');
    expect(button).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(button);

    expect(hideButton(P1)).toHaveAccessibleName('Show Offense 1');
    expect(hideButton(P1)).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('isolating one entity with alt+click', () => {
  it('leaves the clicked entity on the court and takes every other one off', async () => {
    const { container } = renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();

    await altClick(hideButton(P1));

    expect(tokenFor(container, P1)).not.toBeNull();
    expect(tokenFor(container, P2)).toBeNull();
    expect(ballToken(container)).toBeNull();
  });

  it('brings them all back when the clicked entity is already the only one showing', async () => {
    // The second press has to undo the first, or isolating is a one-way trip a coach escapes
    // only by clicking every other row.
    const { container } = renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();
    await altClick(hideButton(P1));
    // Asserted, or a pair of plain toggles would pass this case without isolating anything.
    expect(tokenFor(container, P2)).toBeNull();

    await altClick(hideButton(P1));

    expect(tokenFor(container, P1)).not.toBeNull();
    expect(tokenFor(container, P2)).not.toBeNull();
    expect(ballToken(container)).not.toBeNull();
  });

  it('reveals the clicked entity when it was itself hidden', async () => {
    // "Show only this one" has to show it: isolating a hidden row from its own button would
    // otherwise empty the court.
    const { container } = renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();
    await userEvent.click(hideButton(P1));
    expect(tokenFor(container, P1)).toBeNull();

    await altClick(hideButton(P1));

    expect(tokenFor(container, P1)).not.toBeNull();
    expect(tokenFor(container, P2)).toBeNull();
  });

  it('reads "already alone" from the court rather than from the last isolate', async () => {
    // Isolate P1, then show P2 by hand: P1 is no longer alone, so the next alt+click isolates
    // again rather than restoring. A stored "isolated id" would have restored here.
    const { container } = renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();
    await altClick(hideButton(P1));
    await userEvent.click(hideButton(P2));
    expect(tokenFor(container, P2)).not.toBeNull();

    await altClick(hideButton(P1));

    expect(tokenFor(container, P1)).not.toBeNull();
    expect(tokenFor(container, P2)).toBeNull();
    expect(ballToken(container)).toBeNull();
  });

  it('isolates the ball too, it having a row like any other entity', async () => {
    const { container } = renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();

    await altClick(hideButton('ball'));

    expect(ballToken(container)).not.toBeNull();
    expect(tokenFor(container, P1)).toBeNull();
    expect(tokenFor(container, P2)).toBeNull();
  });

  it('leaves a plain click a plain toggle', async () => {
    // The modifier is the whole difference; without it the button must not touch other rows.
    const { container } = renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();

    await userEvent.click(hideButton(P1));

    expect(tokenFor(container, P1)).toBeNull();
    expect(tokenFor(container, P2)).not.toBeNull();
    expect(ballToken(container)).not.toBeNull();
  });
});
