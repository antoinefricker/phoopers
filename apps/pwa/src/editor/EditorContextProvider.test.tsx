import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'vitest';
import { fixturePlay } from '../engine/__fixtures__/play';
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
