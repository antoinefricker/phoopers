import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Play, PlayerId } from '../engine';
import { fixturePlay, P1, ROOT, SWITCH } from '../engine/__fixtures__/play';
import { IssuesButton } from './IssuesButton';
import { usePlaybackContext } from '../play2d/usePlaybackContext';
import { readProbe, renderEditor } from './testUtils/renderEditor';

// A ball attached to a player who is not in `players`: exactly one `unknown-player-reference`.
const danglingBall: Play = {
  ...fixturePlay,
  branches: fixturePlay.branches.map((b) =>
    b.id === ROOT ? { ...b, tracks: { ...b.tracks, ball: [{ t: 0, attachedTo: 'ghost' as PlayerId }] } } : b,
  ),
};

// A screen that names an unknown player: its issue carries the screen's id, which selects nothing.
const danglingScreen: Play = {
  ...fixturePlay,
  branches: fixturePlay.branches.map((b) =>
    b.id === ROOT ? { ...b, screens: b.screens.map((sc) => ({ ...sc, screenerId: 'ghost' as PlayerId })) } : b,
  ),
};

// A duplicated player id: the issue's entityId is that player, so its row is actionable.
const duplicatePlayer: Play = { ...fixturePlay, players: [...fixturePlay.players, ...fixturePlay.players.slice(0, 1)] };

// A keyframe on the variant before its fork (t = 2): the issue carries the variant's branch id.
const keyframeBeforeFork: Play = {
  ...fixturePlay,
  branches: fixturePlay.branches.map((b) =>
    b.id === SWITCH ? { ...b, tracks: { ...b.tracks, [P1]: [{ t: 1, position: { x: 6, y: 9 } }] } } : b,
  ),
};

function ShownBranch() {
  const { branchId } = usePlaybackContext();

  return <output data-testid="shown-branch">{branchId}</output>;
}

describe('IssuesButton', () => {
  const openMenu = () => userEvent.click(screen.getByRole('button', { name: /Problems/ }));

  it('reports nothing for a valid play: disabled, named for none, and no mark', () => {
    renderEditor(fixturePlay, <IssuesButton />);

    expect(screen.getByRole('button', { name: 'Problems (0)' })).toBeDisabled();
    expect(screen.queryByTestId('issue-count')).not.toBeInTheDocument();
  });

  it('opens no menu while it is disabled', async () => {
    renderEditor(fixturePlay, <IssuesButton />);

    await openMenu();

    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('writes the number of issues on the mark, and is enabled', () => {
    renderEditor(danglingBall, <IssuesButton />);

    expect(screen.getByTestId('issue-count')).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: 'Problems (1)' })).toBeEnabled();
  });

  it('is closed by default so it never blocks editing', () => {
    renderEditor(danglingBall, <IssuesButton />);

    expect(screen.getByRole('button', { name: /Problems/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('lists each issue message once opened', async () => {
    renderEditor(danglingBall, <IssuesButton />);

    await openMenu();

    expect(await screen.findAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('listitem')).toHaveTextContent(/ghost/);
    expect(screen.getByRole('button', { name: /Problems/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes on a second press of the button', async () => {
    renderEditor(danglingBall, <IssuesButton />);
    await openMenu();
    await screen.findByRole('listitem');

    await openMenu();

    await waitFor(() => expect(screen.queryByRole('listitem')).not.toBeInTheDocument());
  });

  it('closes on Escape', async () => {
    renderEditor(danglingBall, <IssuesButton />);
    await openMenu();
    await screen.findByRole('listitem');

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('listitem')).not.toBeInTheDocument());
  });

  it('selects the player a row names, and closes', async () => {
    renderEditor(duplicatePlayer, <IssuesButton />);
    await openMenu();

    await userEvent.click(await screen.findByRole('button', { name: /duplicate player id p1/ }));

    expect(readProbe().selection).toEqual({ kind: 'entity', entityId: P1 });
    await waitFor(() => expect(screen.queryByRole('listitem')).not.toBeInTheDocument());
  });

  it('selects the branch a row names', async () => {
    renderEditor(
      keyframeBeforeFork,
      <>
        <IssuesButton />
        <ShownBranch />
      </>,
    );
    expect(screen.getByTestId('shown-branch')).toHaveTextContent(ROOT);
    await openMenu();

    await userEvent.click(await screen.findByRole('button', { name: /before the fork/ }));

    expect(screen.getByTestId('shown-branch')).toHaveTextContent(SWITCH);
  });

  it('gives a row that names no player or branch no button', async () => {
    renderEditor(danglingScreen, <IssuesButton />);
    await openMenu();
    await screen.findByRole('listitem');

    // The only button left is the one that opened the menu.
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
