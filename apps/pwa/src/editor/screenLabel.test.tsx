import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Play } from '../engine';
import { P1, P2, SCREEN_1, SWITCH, fixturePlay } from '../engine/__fixtures__/play';
import { PlayView } from '../play2d/PlayView';
import { stubViewportWidth } from '../testUtils/viewport';
import { SelectBranch, enterEditMode, renderEditor } from './testUtils/renderEditor';
import { Timeline } from './Timeline';

beforeEach(() => stubViewportWidth(1440));

const named = (label: string): Play => ({
  ...fixturePlay,
  players: fixturePlay.players.map((player) => (player.id === P1 ? { ...player, label } : player)),
});

const render = async (play: Play = fixturePlay) => {
  renderEditor(play, <PlayView />, { wrapPlayback: false });
  await enterEditMode();
};

// The caption is the shared bar's, not an element the screen owns any more: reaching it through
// the bar is what keeps this test honest about where the text actually comes from.
const label = () => within(screen.getByTestId(`screen-bar-${SCREEN_1}`)).getByTestId('bar-caption');

describe('the label on a screen block', () => {
  it('says what the block is and who it is set for', async () => {
    // The fixture's screen is set BY P2 FOR P1, and it is drawn on P2's row — so the row
    // already names the screener and the label names the other half.
    await render();

    expect(label()).toHaveTextContent('Screen for Offense 1');
  });

  it('sits on the screener row, not the beneficiary one', async () => {
    await render();

    expect(within(screen.getByTestId(`timeline-row-${P2}`)).getByTestId(`screen-bar-${SCREEN_1}`)).toBeInTheDocument();
    expect(within(screen.getByTestId(`timeline-row-${P1}`)).queryByTestId(`screen-bar-${SCREEN_1}`)).toBeNull();
  });

  it('calls the beneficiary by the name the coach gave them', async () => {
    // Through the same helper every other surface uses, so a rename reaches the block too.
    await render(named('Pivot'));

    expect(label()).toHaveTextContent('Screen for Pivot');
  });

  it('stays transparent to the pointer, so the markers under the block keep working', async () => {
    // A row's keyframe markers sit under a screen's bar; the bar itself is already transparent
    // for that reason, and a label painted over them would undo it.
    await render();

    expect(label().parentElement).toHaveStyle({ pointerEvents: 'none' });
  });

  it('shares one row with its remove control, so neither has to guess the other width', async () => {
    // The clearance between them used to be a number each caller wrote down — 36px for a step
    // bar, 30px here — and it drifted the moment a control moved. They are siblings in one flex
    // row now: the caption takes the slack and elides into it, the control keeps its natural
    // width, and no number is written anywhere. That shared parent is what the test pins.
    await render();
    const remove = screen.getByTestId(`screen-remove-${SCREEN_1}`);

    expect(label().parentElement).toBe(remove.parentElement?.parentElement);
    expect(label()).toHaveAttribute('data-truncate', 'end');
  });

  it('labels an inherited screen too, which a branch may see but not change', async () => {
    renderEditor(
      fixturePlay,
      <>
        <SelectBranch branchId={SWITCH} />
        <Timeline />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: `select ${SWITCH}` }));

    expect(label()).toHaveTextContent('Screen for Offense 1');
    // It carries no remove control, so its caption has the whole bar to itself.
    expect(screen.queryByTestId(`screen-remove-${SCREEN_1}`)).toBeNull();
  });
});
