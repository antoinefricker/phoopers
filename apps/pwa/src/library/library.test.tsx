import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/useAuthContext';
import type { PlayId } from '../engine';
import * as hooks from '../plays/usePlays';
import type { PlaySummary } from '../types/PlaySummary';
import { LibraryScreen } from './LibraryScreen';

vi.mock('../plays/usePlays');

const horns: PlaySummary = {
  id: 'p1' as PlayId,
  name: 'Horns flare',
  court: 'fiba',
  extent: 'half',
  isPublic: true,
  updatedAt: '2026-03-04T12:00:00Z',
  ownerId: 'u1',
  authorName: 'Coach Ada',
};

const auth = (overrides: Partial<AuthContextValue> = {}): AuthContextValue => ({
  status: 'signedOut',
  userId: null,
  configured: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  ...overrides,
});

function renderScreen(value: AuthContextValue = auth()) {
  return render(
    <MantineProvider env="test">
      <AuthContext value={value}>
        <MemoryRouter>
          <Routes>
            <Route path="/" element={<LibraryScreen />} />
            <Route path="/play/:id" element={<p>play screen</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext>
    </MantineProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(hooks.usePublicPlays).mockReturnValue({ data: [horns], isSuccess: true, isError: false } as never);
});

describe('LibraryScreen', () => {
  it('lists public systems with the author and no ownership action, signed out', () => {
    renderScreen();
    expect(screen.getByText('Horns flare')).toBeInTheDocument();
    expect(screen.getByText('By Coach Ada')).toBeInTheDocument();
    expect(screen.queryByText('Public')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /more actions/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/sign in/i)).not.toBeInTheDocument();
  });

  it('opens a system at its address', async () => {
    renderScreen();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open Horns flare' }));
    expect(screen.getByText('play screen')).toBeInTheDocument();
  });

  it('passes the trimmed search to the query once typing pauses', async () => {
    renderScreen();
    await userEvent.setup().type(screen.getByRole('textbox', { name: 'Search public systems' }), ' flare ');
    await waitFor(() => expect(hooks.usePublicPlays).toHaveBeenLastCalledWith('flare'));
  });

  it('says so when the library is empty, and when a search matches nothing', async () => {
    vi.mocked(hooks.usePublicPlays).mockReturnValue({ data: [], isSuccess: true, isError: false } as never);
    renderScreen();
    expect(screen.getByText('No system has been made public yet.')).toBeInTheDocument();
    await userEvent.setup().type(screen.getByRole('textbox', { name: 'Search public systems' }), 'zzz');
    expect(await screen.findByText('No system matches this search.')).toBeInTheDocument();
  });

  it('shows an error when the list fails to load', () => {
    vi.mocked(hooks.usePublicPlays).mockReturnValue({ data: undefined, isSuccess: false, isError: true } as never);
    renderScreen();
    expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
  });

  it('says the app is not configured without querying', () => {
    renderScreen(auth({ configured: false }));
    expect(screen.getByText(/not configured/i)).toBeInTheDocument();
    expect(hooks.usePublicPlays).not.toHaveBeenCalled();
  });
});
