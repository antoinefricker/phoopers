import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryProvider } from '../app/QueryProvider';
import { AuthContext, type AuthContextValue } from '../auth/useAuthContext';
import { writeDraft } from '../draft/draftStorage';
import { hornsPlay } from '../samples/horns';
import { HomeScreen } from './HomeScreen';

const auth = (overrides: Partial<AuthContextValue> = {}): AuthContextValue => ({
  status: 'signedOut',
  userId: null,
  configured: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  ...overrides,
});

function renderHome(value: AuthContextValue = auth()) {
  return render(
    <MantineProvider env="test">
      <QueryProvider>
        <AuthContext value={value}>
          <MemoryRouter>
            <HomeScreen />
          </MemoryRouter>
        </AuthContext>
      </QueryProvider>
    </MantineProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('HomeScreen', () => {
  it('offers the three doors', () => {
    renderHome();
    ['New system', 'Public systems', 'My systems'].forEach((name) =>
      expect(screen.getByRole('heading', { name })).toBeInTheDocument(),
    );
  });

  it('invites signing in on My systems when nobody is signed in', () => {
    renderHome();
    expect(screen.getByRole('link', { name: 'Sign in to see your systems' })).toHaveAttribute(
      'href',
      '/signin?next=%2Fmine',
    );
  });

  it('opens My systems for a signed-in coach', () => {
    renderHome(auth({ status: 'signedIn', userId: 'u' }));
    expect(screen.getByRole('link', { name: 'Open my systems' })).toHaveAttribute('href', '/mine');
  });

  it('says the app is not configured, and still offers New system, with no Supabase project', () => {
    renderHome(auth({ configured: false }));
    expect(screen.getAllByText(/not configured/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'New system' })).toHaveAttribute('href', '/play');
    expect(screen.queryByRole('link', { name: 'Open my systems' })).not.toBeInTheDocument();
  });

  it('offers to continue a stored draft, or to start over', async () => {
    writeDraft({ play: hornsPlay, origin: null });
    const user = userEvent.setup();
    renderHome();
    expect(screen.getByRole('link', { name: 'Continue the draft' })).toHaveAttribute('href', '/play');
    await user.click(screen.getByRole('button', { name: 'Start a new system' }));
    expect(localStorage.getItem('phoopers.draft.v1')).toBeNull();
  });
});
