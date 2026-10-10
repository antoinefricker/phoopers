import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Play, PlayerId } from '../engine';
import { fixturePlay, P1, ROOT } from '../engine/__fixtures__/play';
import { IssuePanel } from './IssuePanel';
import { readProbe, renderEditor } from './testUtils/renderEditor';

// A ball attached to a player who is not in `players`: exactly one `unknown-player-reference`.
const danglingBall: Play = {
  ...fixturePlay,
  branches: fixturePlay.branches.map((b) =>
    b.id === ROOT ? { ...b, tracks: { ...b.tracks, ball: [{ t: 0, attachedTo: 'ghost' as PlayerId }] } } : b,
  ),
};

// A duplicated player id: the issue's entityId is that player, so its row is actionable.
const duplicatePlayer: Play = { ...fixturePlay, players: [...fixturePlay.players, ...fixturePlay.players.slice(0, 1)] };

describe('IssuePanel', () => {
  it('reports nothing for a valid play', () => {
    renderEditor(fixturePlay, <IssuePanel />);

    expect(screen.getByTestId('issue-count')).toHaveTextContent('0');
  });

  it('shows an empty state once expanded on a valid play', async () => {
    renderEditor(fixturePlay, <IssuePanel />);

    await userEvent.click(screen.getByRole('button', { name: /Problems/ }));

    await waitFor(() => expect(screen.getByText('No problems')).toBeVisible());
  });

  it('counts the issues of an invalid play', () => {
    renderEditor(danglingBall, <IssuePanel />);

    expect(screen.getByTestId('issue-count')).toHaveTextContent('1');
  });

  it('is collapsed by default so it never blocks editing', () => {
    renderEditor(danglingBall, <IssuePanel />);

    expect(screen.getByRole('button', { name: /Problems/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('lists each issue message once expanded', async () => {
    renderEditor(danglingBall, <IssuePanel />);

    await userEvent.click(screen.getByRole('button', { name: /Problems/ }));

    expect(await screen.findAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('listitem')).toHaveTextContent(/ghost/);
  });

  it('selects the player a row names', async () => {
    renderEditor(duplicatePlayer, <IssuePanel />);
    await userEvent.click(screen.getByRole('button', { name: /Problems/ }));

    await userEvent.click(await screen.findByRole('button', { name: /duplicate player id p1/ }));

    expect(readProbe().selection).toEqual({ kind: 'entity', entityId: P1 });
  });

  it('gives a row that names no player no button', async () => {
    renderEditor(danglingBall, <IssuePanel />);
    await userEvent.click(screen.getByRole('button', { name: /Problems/ }));
    await screen.findByRole('listitem');

    // The only button left is the accordion control itself.
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
