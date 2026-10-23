import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/useAuthContext';
import { QueryProvider } from './QueryProvider';
import { AppMenu, type AppMenuProps } from './AppMenu';

const auth = (overrides: Partial<AuthContextValue> = {}): AuthContextValue => ({
  status: 'signedOut',
  userId: null,
  configured: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  ...overrides,
});

function renderMenu(props: AppMenuProps = {}, value: AuthContextValue = auth()) {
  render(
    <MantineProvider env="test">
      <QueryProvider>
        <AuthContext value={value}>
          <MemoryRouter initialEntries={['/']}>
            <Routes>
              <Route path="/" element={<AppMenu {...props} />} />
              <Route path="/library" element={<p>the library</p>} />
              <Route path="/mine" element={<p>my systems</p>} />
              <Route path="/signin" element={<p>sign in page</p>} />
            </Routes>
          </MemoryRouter>
        </AuthContext>
      </QueryProvider>
    </MantineProvider>,
  );
}

const open = () => userEvent.click(screen.getByRole('button', { name: /menu/i }));

describe('AppMenu', () => {
  it('offers the navigation entries on a page with no editor', async () => {
    renderMenu();
    await open();

    expect(screen.getByRole('button', { name: 'Create a new system' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Browse systems' })).toBeInTheDocument();
    // Nothing of the editor's: this page has none to contribute.
    expect(screen.queryByRole('button', { name: /^Save/ })).not.toBeInTheDocument();
  });

  it('offers my systems to nobody until they are signed in', async () => {
    renderMenu();
    await open();

    expect(screen.getByRole('button', { name: 'My systems' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('sends a signed-in coach to their systems, and closes behind them', async () => {
    renderMenu({}, auth({ status: 'signedIn', userId: 'u1' }));
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'My systems' }));

    expect(screen.getByText('my systems')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Browse systems' })).not.toBeInTheDocument();
  });

  it('carries where the coach was into signing in', async () => {
    renderMenu();
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByText('sign in page')).toBeInTheDocument();
  });

  it('names the coach on their own entry, so the group says who is signed in', async () => {
    renderMenu({}, auth({ status: 'signedIn', userId: 'u1' }));
    await open();

    expect(await screen.findByRole('button', { name: /My information/ })).toBeInTheDocument();
  });

  it('signs a coach out from the account group', async () => {
    const signOut = vi.fn(async () => {});
    renderMenu({}, auth({ status: 'signedIn', userId: 'u1', signOut }));
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(signOut).toHaveBeenCalledOnce();
  });

  it('says nothing about accounts when no project is configured', async () => {
    renderMenu({}, auth({ configured: false }));
    await open();

    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
    expect(screen.getByText(/not set up with a project/)).toBeInTheDocument();
    // Browsing needs the same project the accounts do.
    expect(screen.getByRole('button', { name: 'Browse systems' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('wears a dot on the burger when there is something to save', () => {
    renderMenu({ dirty: true });

    expect(screen.getByRole('button', { name: /unsaved changes/i })).toBeInTheDocument();
  });

  it('wears no dot when there is not', () => {
    renderMenu();

    expect(screen.queryByRole('button', { name: /unsaved changes/i })).not.toBeInTheDocument();
  });

  it('shows the page its own group, and closes the drawer when it asks', async () => {
    renderMenu({
      editing: (close) => (
        <button type="button" onClick={close}>
          Clear
        </button>
      ),
    });
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.queryByRole('button', { name: 'Create a new system' })).not.toBeInTheDocument();
  });
});
