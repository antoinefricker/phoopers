import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Play } from '../engine';
import { P1, P2, SCREEN_1, SWITCH, fixturePlay } from '../engine/__fixtures__/play';
import { PlayView } from '../play2d/PlayView';
import { stubViewportWidth } from '../testUtils/viewport';
import { renderEditor, SelectBranch } from './testUtils/renderEditor';
import { Timeline } from './Timeline';

beforeEach(() => stubViewportWidth(1440));

const enterEditMode = () => userEvent.click(screen.getByRole('radio', { name: 'Edit' }));

const named = (label: string): Play => ({
  ...fixturePlay,
  players: fixturePlay.players.map((player) => (player.id === P1 ? { ...player, label } : player)),
});

const render = async (play: Play = fixturePlay) => {
  renderEditor(play, <PlayView />, { wrapPlayback: false });
  await enterEditMode();
};

const label = () => screen.getByTestId(`screen-label-${SCREEN_1}`);

describe('the label on a screen block', () => {
  it('says what the block is and who it is set for', async () => {
    // The fixture's screen is set BY P2 FOR P1, and it is drawn on P2's row — so the row
    // already names the screener and the label names the other half.
    await render();

    expect(label()).toHaveTextContent('Screen for Offense 1');
  });

  it('sits on the screener row, not the beneficiary one', async () => {
    await render();

    expect(
      within(screen.getByTestId(`timeline-row-${P2}`)).getByTestId(`screen-label-${SCREEN_1}`),
    ).toBeInTheDocument();
    expect(within(screen.getByTestId(`timeline-row-${P1}`)).queryByTestId(`screen-label-${SCREEN_1}`)).toBeNull();
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
    // It carries no remove control, so its label starts at the bar's own edge instead.
    expect(screen.queryByTestId(`screen-remove-${SCREEN_1}`)).toBeNull();
  });
});
