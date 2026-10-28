import { render, screen, waitFor } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubViewportWidth } from '../testUtils/viewport';
import { AppMenu } from '../app/AppMenu';
import { QueryProvider } from '../app/QueryProvider';
import { AuthContext } from '../auth/useAuthContext';
import { SettingsContextProvider } from './SettingsContextProvider';
import { SettingsDrawer } from './SettingsDrawer';
import { useSettingsContext } from './useSettingsContext';

beforeEach(() => localStorage.clear());

function ShowHitAreas() {
  return <p data-testid="value">{String(useSettingsContext().settings.showHitAreas)}</p>;
}

const renderDialog = () =>
  render(
    <MantineProvider env="test">
      <SettingsContextProvider>
        <SettingsDrawer opened onClose={() => undefined} />
        <ShowHitAreas />
      </SettingsContextProvider>
    </MantineProvider>,
  );

describe('the settings drawer', () => {
  it('lists the editing settings under their own group, on by default', async () => {
    renderDialog();

    expect(await screen.findByText('Editing')).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /^Outline reactive areas/ })).toBeChecked();
  });

  it('applies a change at once and keeps it for the next visit', async () => {
    const { unmount } = renderDialog();

    await userEvent.click(await screen.findByRole('switch', { name: /^Outline reactive areas/ }));

    expect(screen.getByTestId('value')).toHaveTextContent('false');

    unmount();
    renderDialog();

    expect(screen.getByTestId('value')).toHaveTextContent('false');
    expect(await screen.findByRole('switch', { name: /^Outline reactive areas/ })).not.toBeChecked();
  });

  it('reads a setting the coach never changed as its default', () => {
    localStorage.setItem('phoopers-settings', JSON.stringify({}));

    renderDialog();

    expect(screen.getByTestId('value')).toHaveTextContent('true');
  });
});

describe('the settings entry in the menu', () => {
  beforeEach(() => stubViewportWidth(1440));
  afterEach(() => vi.unstubAllGlobals());

  const renderMenu = (menu: ReactNode = <AppMenu />) =>
    render(
      <MantineProvider env="test">
        <QueryProvider>
          <AuthContext
            value={{
              status: 'signedOut',
              userId: null,
              configured: true,
              signInWithGoogle: async () => {},
              signOut: async () => {},
            }}
          >
            <SettingsContextProvider>
              <MemoryRouter>{menu}</MemoryRouter>
            </SettingsContextProvider>
          </AuthContext>
        </QueryProvider>
      </MantineProvider>,
    );

  const openSettings = async () => {
    await userEvent.click(screen.getByRole('button', { name: /^menu/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await screen.findByRole('switch', { name: /^Outline reactive areas/ });
  };

  it('opens the settings over the menu, which stays open underneath', async () => {
    renderMenu();

    await openSettings();

    expect(screen.getByRole('button', { name: 'Browse systems' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to the menu' })).toBeInTheDocument();
  });

  it('goes back to the menu from the arrow, leaving the menu open', async () => {
    renderMenu();
    await openSettings();

    await userEvent.click(screen.getByRole('button', { name: 'Back to the menu' }));

    await waitFor(() => expect(screen.queryByRole('switch')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Browse systems' })).toBeInTheDocument();
  });

  it('closes only the settings on Escape, leaving the menu open', async () => {
    renderMenu();
    await openSettings();

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('switch')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Browse systems' })).toBeInTheDocument();
  });

  it('closes the menu on the next Escape', async () => {
    renderMenu();
    await openSettings();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('switch')).not.toBeInTheDocument());

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Browse systems' })).not.toBeInTheDocument());
  });

  it('offers no close button beside the page, and the logo is the menu title', async () => {
    renderMenu();
    await openSettings();

    expect(screen.queryByRole('button', { name: /^close/i })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'phoopers' })).toBeInTheDocument();
  });

  it('offers a close button on each drawer on a phone', async () => {
    stubViewportWidth(375);
    renderMenu();
    await openSettings();

    expect(screen.getByRole('button', { name: 'Close the menu' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close the settings' })).toBeInTheDocument();
  });

  it('gives both headers the same height', async () => {
    renderMenu();
    await openSettings();

    const heights = [...document.querySelectorAll<HTMLElement>('.mantine-Drawer-header')].map((h) => h.style.height);
    expect(heights).toHaveLength(2);
    expect(new Set(heights).size).toBe(1);
    expect(heights[0]).not.toBe('');
  });

  it('closes the settings with the menu when something else closes it', async () => {
    function Harness() {
      const [opened, setOpened] = useState(false);

      return (
        <>
          <button type="button" onClick={() => setOpened(false)}>
            close from outside
          </button>
          <AppMenu opened={opened} onOpenedChange={setOpened} />
        </>
      );
    }
    renderMenu(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /^menu/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await screen.findByRole('switch', { name: /^Outline reactive areas/ });

    await userEvent.click(screen.getByRole('button', { name: 'close from outside' }));

    await waitFor(() => expect(screen.queryByRole('switch')).not.toBeInTheDocument());
  });
});
