import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hornsPlay } from '../samples/horns';
import { PlaybackContextProvider } from './PlaybackContextProvider';
import { PlaybackTransport } from './PlaybackTransport';

beforeEach(() => {
  // A running clock would schedule frames; the shortcut only has to flip the state.
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => vi.unstubAllGlobals());

function renderTransport(dialogOpen = false) {
  return render(
    <MantineProvider>
      <PlaybackContextProvider play={hornsPlay}>
        <PlaybackTransport />
        <input aria-label="a field" />
        {dialogOpen && <div role="dialog" aria-label="something modal" />}
      </PlaybackContextProvider>
    </MantineProvider>,
  );
}

const playing = () => screen.queryByRole('button', { name: 'Pause' }) !== null;

describe('the play/pause shortcut', () => {
  it('plays on Space and pauses on the next press', async () => {
    renderTransport();
    expect(playing()).toBe(false);

    await userEvent.keyboard(' ');
    expect(playing()).toBe(true);

    await userEvent.keyboard(' ');
    expect(playing()).toBe(false);
  });

  it('says on the button which key it answers to', () => {
    renderTransport();

    expect(screen.getByRole('button', { name: 'Play' })).toHaveAttribute('aria-keyshortcuts', 'Space');
  });

  it('does not take the space typed into a text field', async () => {
    renderTransport();

    await userEvent.type(screen.getByRole('textbox', { name: 'a field' }), 'a b');

    expect(playing()).toBe(false);
    expect(screen.getByRole('textbox', { name: 'a field' })).toHaveValue('a b');
  });

  it('leaves a focused button to press itself, so playback flips once and not twice', async () => {
    renderTransport();
    screen.getByRole('button', { name: 'Play' }).focus();

    await userEvent.keyboard(' ');

    expect(playing()).toBe(true);
  });

  it('does nothing while a dialog is open over the page', async () => {
    renderTransport(true);

    await userEvent.keyboard(' ');

    expect(playing()).toBe(false);
  });

  it('leaves a chord with a modifier to whoever owns it', async () => {
    renderTransport();

    await userEvent.keyboard('{Control>} {/Control}');
    await userEvent.keyboard('{Shift>} {/Shift}');
    await userEvent.keyboard('{Alt>} {/Alt}');

    expect(playing()).toBe(false);
  });

  it('ignores a key held down, which would flip playback at the repeat rate', () => {
    renderTransport();

    fireEvent.keyDown(window, { code: 'Space', key: ' ', repeat: true });

    expect(playing()).toBe(false);
  });

  it('stops the page scrolling when it acts, and not when it does not', () => {
    renderTransport();

    const acted = fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    const ignored = fireEvent.keyDown(window, { code: 'Space', key: ' ', repeat: true });

    // `fireEvent` returns false when the default was prevented.
    expect(acted).toBe(false);
    expect(ignored).toBe(true);
  });
});
