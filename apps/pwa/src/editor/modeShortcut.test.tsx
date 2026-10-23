import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fixturePlay } from '../engine/__fixtures__/play';
import { PlayView } from '../play2d/PlayView';
import { readProbe, renderEditor } from './testUtils/renderEditor';
import { useModeShortcut } from './useModeShortcut';

/**
 * The hook on its own, beside the things it has to stay out of the way of: a text field, and an
 * element wearing the dialog role Mantine gives both its modals and its popovers.
 */
function Harness({ dialogOpen = false }: { dialogOpen?: boolean }) {
  useModeShortcut();

  return (
    <>
      <input data-testid="field" aria-label="field" />
      {dialogOpen && <div role="dialog" aria-label="something modal" />}
    </>
  );
}

const renderHook = (dialogOpen = false) => renderEditor(fixturePlay, <Harness dialogOpen={dialogOpen} />);
const mode = () => readProbe().mode;

describe('the mode shortcut', () => {
  it('switches to edit mode on Alt+Shift+E, and back on a second press', async () => {
    renderHook();
    expect(mode()).toBe('play');

    await userEvent.keyboard('{Alt>}{Shift>}e{/Shift}{/Alt}');
    expect(mode()).toBe('edit');

    await userEvent.keyboard('{Alt>}{Shift>}e{/Shift}{/Alt}');
    expect(mode()).toBe('play');
  });

  it('answers the chord without Shift as a separate guard, since Shift is part of it', async () => {
    renderHook();

    await userEvent.keyboard('{Alt>}{Shift>}E{/Shift}{/Alt}');

    expect(mode()).toBe('edit');
  });

  it('answers the macOS dead key, where Option+Shift+E yields no "e" at all', () => {
    renderHook();

    // What a Mac hands the page for Option+E: the OS has begun composing an acute accent, so
    // only `code` still names the key that was pressed.
    fireEvent.keyDown(window, { key: 'Dead', code: 'KeyE', altKey: true, shiftKey: true });

    expect(mode()).toBe('edit');
  });

  it('leaves the bare letter alone, so E can still be typed', async () => {
    renderHook();

    await userEvent.keyboard('e');

    expect(mode()).toBe('play');
  });

  it('stays out of a text field, even for the chord itself', async () => {
    renderHook();
    const field = screen.getByTestId('field');

    await userEvent.type(field, 'Pierre');
    // The chord in a field is how an acute accent is typed on macOS, not a command.
    field.focus();
    fireEvent.keyDown(field, { key: 'Dead', code: 'KeyE', altKey: true, shiftKey: true });

    expect(field).toHaveValue('Pierre');
    expect(mode()).toBe('play');
  });

  it('leaves Ctrl+Alt+Shift+E and Cmd+Alt+Shift+E to whoever owns them', async () => {
    renderHook();

    await userEvent.keyboard('{Control>}{Alt>}{Shift>}e{/Shift}{/Alt}{/Control}');
    await userEvent.keyboard('{Meta>}{Alt>}{Shift>}e{/Shift}{/Alt}{/Meta}');

    expect(mode()).toBe('play');
  });

  it('does not flap while the key is held down', () => {
    renderHook();

    fireEvent.keyDown(window, { key: 'e', code: 'KeyE', altKey: true, shiftKey: true });
    expect(mode()).toBe('edit');

    // What a keyboard sends for the rest of a long press.
    fireEvent.keyDown(window, { key: 'e', code: 'KeyE', altKey: true, shiftKey: true, repeat: true });
    fireEvent.keyDown(window, { key: 'e', code: 'KeyE', altKey: true, shiftKey: true, repeat: true });
    expect(mode()).toBe('edit');
  });

  it('ignores a key that is still being composed by an IME', () => {
    renderHook();

    fireEvent.keyDown(window, { key: 'e', code: 'KeyE', altKey: true, shiftKey: true, isComposing: true });

    expect(mode()).toBe('play');
  });

  it('says nothing while a dialog or a menu is open', async () => {
    renderHook(true);

    await userEvent.keyboard('{Alt>}{Shift>}e{/Shift}{/Alt}');

    expect(mode()).toBe('play');
  });

  it('stops listening once the editor is gone', async () => {
    const { unmount } = renderHook();
    unmount();

    // Nothing to assert on but the absence of a throw: the listener is off the window, so this
    // reaches no handler at all.
    await userEvent.keyboard('{Alt>}{Shift>}e{/Shift}{/Alt}');
  });
});

describe('the editor wiring', () => {
  it('toggles the mode from the editor itself', async () => {
    renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });

    await userEvent.keyboard('{Alt>}{Shift>}e{/Shift}{/Alt}');

    expect(mode()).toBe('edit');
  });

  it('shows the key on the menu entry that does the same thing', async () => {
    renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });

    await userEvent.click(screen.getByRole('button', { name: /^Menu/ }));
    const entry = await screen.findByRole('button', { name: /Edit mode/ });

    expect(entry).toHaveAttribute('aria-keyshortcuts', 'Alt+Shift+E');
    expect(entry).toHaveTextContent('Alt + Shift + E');
  });
});
