import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'vitest';
import type { BranchId, StepId } from '../engine';
import { fixturePlay, ROOT, STEP_ENTRY } from '../engine/__fixtures__/play';
import { EditorContextProvider } from './EditorContextProvider';
import { EditorToolbar } from './EditorToolbar';
import { useEditorContext } from './useEditorContext';

function Probe() {
  const { play, mode, setMode, addPlayer } = useEditorContext();

  return (
    <>
      <output data-testid="count">{play.players.length}</output>
      <output data-testid="mode">{mode}</output>
      <button type="button" onClick={() => addPlayer('defense')}>
        add
      </button>
      <button type="button" onClick={() => setMode('edit')}>
        edit
      </button>
    </>
  );
}

const renderProbe = () =>
  render(
    <MantineProvider>
      <EditorContextProvider initialPlay={fixturePlay}>
        <Probe />
        <EditorToolbar />
      </EditorContextProvider>
    </MantineProvider>,
  );

describe('EditorContextProvider', () => {
  it('starts in play mode', () => {
    renderProbe();

    expect(screen.getByTestId('mode')).toHaveTextContent('play');
  });

  it('adds a player through the bound mutation', async () => {
    renderProbe();
    await userEvent.click(screen.getByRole('button', { name: 'add' }));

    expect(screen.getByTestId('count')).toHaveTextContent(String(fixturePlay.players.length + 1));
  });
});

describe('forkBranch', () => {
  it('returns null and leaves the play unchanged when the fork is refused', async () => {
    let forked: BranchId | null | undefined;
    function Forker() {
      const { play, forkBranch } = useEditorContext();

      return (
        <>
          <output data-testid="play">{JSON.stringify(play)}</output>
          <button type="button" onClick={() => (forked = forkBranch(ROOT, 'no-such-step' as StepId, 'Nope'))}>
            refuse
          </button>
          <button type="button" onClick={() => (forked = forkBranch(ROOT, STEP_ENTRY, 'Fine'))}>
            accept
          </button>
        </>
      );
    }
    render(
      <MantineProvider>
        <EditorContextProvider initialPlay={fixturePlay}>
          <Forker />
        </EditorContextProvider>
      </MantineProvider>,
    );
    const before = screen.getByTestId('play').textContent;

    await userEvent.click(screen.getByRole('button', { name: 'refuse' }));

    expect(forked).toBeNull();
    expect(screen.getByTestId('play').textContent).toBe(before);

    // The accepted path writes, so the assertion above is not satisfied by a dead button.
    await userEvent.click(screen.getByRole('button', { name: 'accept' }));

    expect(forked).not.toBeNull();
    expect(screen.getByTestId('play').textContent).not.toBe(before);
  });
});

describe('EditorToolbar', () => {
  it('shows the edit actions only in edit mode', async () => {
    renderProbe();

    expect(screen.queryByRole('button', { name: 'Add offense' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('Edit'));

    expect(screen.getByTestId('mode')).toHaveTextContent('edit');
    expect(screen.getByRole('button', { name: 'Add offense' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add defense' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Starting formation' })).toBeInTheDocument();
  });

  it('adds a player from the toolbar', async () => {
    renderProbe();
    await userEvent.click(screen.getByText('Edit'));
    await userEvent.click(screen.getByRole('button', { name: 'Add offense' }));

    expect(screen.getByTestId('count')).toHaveTextContent(String(fixturePlay.players.length + 1));
  });
});

describe('useEditorContext', () => {
  it('throws outside its provider', () => {
    expect(() => render(<Probe />)).toThrow(/useEditorContext.*EditorContextProvider/s);
  });
});
