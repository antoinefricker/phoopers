import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixturePlay, P1, P2 } from '../engine/__fixtures__/play';
import { PlayView } from '../play2d/PlayView';
import { SettingsContext } from '../settings/useSettingsContext';
import { BALL_RADIUS, DIAMOND_SIDE, TOKEN_SIZE } from '../play2d/PlayerSymbol';
import { stubViewportWidth } from '../testUtils/viewport';
import { enterEditMode, readProbe, renderEditor } from './testUtils/renderEditor';

beforeEach(() => stubViewportWidth(1440));
afterEach(() => vi.restoreAllMocks());

const renderView = async () => {
  renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
  await enterEditMode();
};

const row = (entityId: string) => screen.getByTestId(`timeline-row-${entityId}`);
const token = (entityId: string) =>
  entityId === 'ball'
    ? screen.getByTestId('ball-token')
    : document.querySelector(`[data-testid="token"][data-player-id="${entityId}"]`);

describe('selecting an entity from the timeline', () => {
  it('selects a player by a press on its name, and marks its row and its token', async () => {
    await renderView();

    await userEvent.click(screen.getByTestId(`row-name-${P2}`));

    expect(readProbe().selection).toEqual({ kind: 'entity', entityId: P2 });
    expect(row(P2)).toHaveAttribute('data-selected', 'true');
    expect(token(P2)).toHaveAttribute('data-selected', 'true');
    expect(row(P1)).not.toHaveAttribute('data-selected');
    expect(token(P1)).not.toHaveAttribute('data-selected');
  });

  it('selects the ball by a press on its row', async () => {
    await renderView();

    await userEvent.click(screen.getByTestId('row-gutter-ball'));

    expect(readProbe().selection).toEqual({ kind: 'entity', entityId: 'ball' });
    expect(row('ball')).toHaveAttribute('data-selected', 'true');
    expect(token('ball')).toHaveAttribute('data-selected', 'true');
  });

  it('keeps one selection: the next row replaces the last', async () => {
    await renderView();

    await userEvent.click(screen.getByTestId(`row-name-${P1}`));
    await userEvent.click(screen.getByTestId(`row-name-${P2}`));

    expect(row(P1)).not.toHaveAttribute('data-selected');
    expect(row(P2)).toHaveAttribute('data-selected', 'true');
  });

  it('leaves the selection alone when a gutter control is pressed', async () => {
    await renderView();
    await userEvent.click(screen.getByTestId(`row-name-${P1}`));

    await userEvent.click(screen.getAllByRole('button', { name: /^Hide / })[1]!);

    expect(readProbe().selection).toEqual({ kind: 'entity', entityId: P1 });
  });

  it('marks the row and the token of a selected keyframe too', async () => {
    await renderView();

    await userEvent.click(screen.getAllByRole('button', { name: /^Keyframe at / })[0]!);

    const selection = readProbe().selection as { kind: string; entityId: string };
    expect(selection.kind).toBe('keyframe');
    expect(row(selection.entityId)).toHaveAttribute('data-selected', 'true');
    expect(token(selection.entityId)).toHaveAttribute('data-selected', 'true');
  });
});

describe('selecting an entity on the court', () => {
  it('selects the ball, as it does a player', async () => {
    await renderView();

    await userEvent.click(screen.getByTestId('edit-token-ball'));

    expect(readProbe().selection).toEqual({ kind: 'entity', entityId: 'ball' });
    expect(row('ball')).toHaveAttribute('data-selected', 'true');
  });

  it('marks the row of a player selected on the court', async () => {
    await renderView();

    await userEvent.click(screen.getByTestId(`edit-token-${P2}`));

    expect(row(P2)).toHaveAttribute('data-selected', 'true');
    expect(token(P2)).toHaveAttribute('data-selected', 'true');
  });
});

describe('outlining the reactive area on the court', () => {
  const outline = (entityId: string) =>
    screen.getByTestId(`edit-token-${entityId}`).querySelector('circle')?.getAttribute('stroke');

  it('outlines a target only while the pointer is over it', async () => {
    await renderView();
    expect(outline(P1)).toBe('none');

    await userEvent.hover(screen.getByTestId(`edit-token-${P1}`));
    expect(outline(P1)).toBe('var(--mantine-primary-color-filled)');
    expect(outline(P2)).toBe('none');

    await userEvent.unhover(screen.getByTestId(`edit-token-${P1}`));
    expect(outline(P1)).toBe('none');
  });

  it('draws no outline while the showHitAreas setting is off', async () => {
    const off = { settings: { showHitAreas: false }, setSetting: () => undefined };
    renderEditor(
      fixturePlay,
      <SettingsContext value={off}>
        <PlayView />
      </SettingsContext>,
      { wrapPlayback: false },
    );
    await enterEditMode();

    await userEvent.hover(screen.getByTestId(`edit-token-${P1}`));

    expect(outline(P1)).toBe('none');
  });

  it('outlines the ball the same way', async () => {
    await renderView();

    await userEvent.hover(screen.getByTestId('edit-token-ball'));

    expect(outline('ball')).toBe('var(--mantine-primary-color-filled)');
  });
});

describe('the shape of a reactive area', () => {
  const area = (entityId: string) => screen.getByTestId(`edit-token-${entityId}`).firstElementChild!;

  it('is the offense disc for an offensive player and a larger disc for the ball', async () => {
    await renderView();

    expect(area(P1).tagName).toBe('circle');
    expect(area(P1)).toHaveAttribute('r', String(TOKEN_SIZE / 2));
    expect(area('ball').tagName).toBe('circle');
    expect(Number(area('ball').getAttribute('r'))).toBeGreaterThan(BALL_RADIUS);
  });

  it('is the turned square of a defender', async () => {
    const defended = {
      ...fixturePlay,
      players: fixturePlay.players.map((player) =>
        player.id === P2 ? { ...player, team: 'defense' as const } : player,
      ),
    };
    renderEditor(defended, <PlayView />, { wrapPlayback: false });
    await enterEditMode();

    expect(area(P2).tagName).toBe('rect');
    expect(area(P2)).toHaveAttribute('width', String(DIAMOND_SIDE));
    expect(area(P2)).toHaveAttribute('transform', 'rotate(45)');
  });
});
