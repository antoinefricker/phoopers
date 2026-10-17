import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'vitest';
import type { BranchId, StepId } from '../engine';
import { fixturePlay, P1, ROOT, STEP_ENTRY } from '../engine/__fixtures__/play';
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

    expect(screen.queryByRole('button', { name: 'System menu' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('Edit'));

    expect(screen.getByTestId('mode')).toHaveTextContent('edit');
    expect(screen.getByRole('button', { name: 'System menu' })).toBeInTheDocument();
  });

  it('no longer offers the two that moved to the transport', async () => {
    // Adding a player lives in the add menu beside the playhead. Two ways to do it is one more
    // than anyone needs to learn, so the toolbar's are gone rather than duplicated.
    renderProbe();
    await userEvent.click(screen.getByText('Edit'));

    expect(screen.queryByRole('button', { name: 'Add offense' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add defense' })).not.toBeInTheDocument();
  });
});

describe('useEditorContext', () => {
  it('throws outside its provider', () => {
    expect(() => render(<Probe />)).toThrow(/useEditorContext.*EditorContextProvider/s);
  });
});

describe('the mode toggle icons', () => {
  it('adds an icon to each segment without changing its accessible name', () => {
    // Four test files find these segments by the names "Play" and "Edit". An icon that
    // replaced the text, or that contributed text of its own, would rename them and break
    // those silently — so the name is the assertion that matters here, not the icon.
    renderProbe();

    for (const name of ['Play', 'Edit']) {
      const radio = screen.getByRole('radio', { name }) as HTMLInputElement;
      // Mantine renders the input as a SIBLING of its label, so `closest` finds nothing.
      const label = radio.labels?.[0];
      expect(label?.querySelector('svg')).toBeInTheDocument();
      expect(label?.textContent).toBe(name);
    }
  });
});

describe('createPlay', () => {
  function Creator() {
    const { play, selection, select, createPlay, forkBranch } = useEditorContext();

    return (
      <>
        <output data-testid="branches">{play.branches.length}</output>
        <output data-testid="duration">{play.duration}</output>
        <output data-testid="extent">{play.extent}</output>
        <output data-testid="players">{play.players.length}</output>
        <output data-testid="id">{play.id}</output>
        <output data-testid="selected">{selection === null ? 'none' : 'some'}</output>
        <button type="button" onClick={() => select({ kind: 'entity', entityId: P1 })}>
          select
        </button>
        <button type="button" onClick={() => forkBranch(ROOT, STEP_ENTRY, 'Switch')}>
          fork
        </button>
        <button
          type="button"
          onClick={() => createPlay({ name: 'Flex', court: 'fiba', extent: 'half', lineup: 'threeOnThree' })}
        >
          create
        </button>
      </>
    );
  }

  const renderCreator = () =>
    render(
      <MantineProvider>
        <EditorContextProvider initialPlay={fixturePlay}>
          <Creator />
        </EditorContextProvider>
      </MantineProvider>,
    );

  it('replaces the play with a fresh one on its own root branch', async () => {
    renderCreator();
    await userEvent.click(screen.getByRole('button', { name: 'create' }));

    expect(screen.getByTestId('id')).not.toHaveTextContent(fixturePlay.id);
    expect(screen.getByTestId('branches')).toHaveTextContent('1');
    expect(screen.getByTestId('players')).toHaveTextContent('6');
    expect(screen.getByTestId('extent')).toHaveTextContent('half');
  });

  it('gives a new system eight seconds of timeline', async () => {
    renderCreator();
    await userEvent.click(screen.getByRole('button', { name: 'create' }));

    expect(screen.getByTestId('duration')).toHaveTextContent('8');
  });

  it('clears the selection', async () => {
    renderCreator();
    await userEvent.click(screen.getByRole('button', { name: 'select' }));
    expect(screen.getByTestId('selected')).toHaveTextContent('some');

    await userEvent.click(screen.getByRole('button', { name: 'create' }));

    expect(screen.getByTestId('selected')).toHaveTextContent('none');
  });

  it('leaves no trace of the variants the old system carried', async () => {
    renderCreator();
    await userEvent.click(screen.getByRole('button', { name: 'fork' }));
    expect(screen.getByTestId('branches')).toHaveTextContent('3');

    await userEvent.click(screen.getByRole('button', { name: 'create' }));

    expect(screen.getByTestId('branches')).toHaveTextContent('1');
  });
});
