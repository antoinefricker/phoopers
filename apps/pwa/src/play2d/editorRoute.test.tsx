import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../app/queryClient';
import { AuthContext, type AuthContextValue } from '../auth/useAuthContext';
import { fingerprint, readDraft, writeDraft, type Draft } from '../draft/draftStorage';
import type { PlayId } from '../engine';
import { LibraryScreen } from '../library/LibraryScreen';
import * as hooks from '../plays/usePlays';
import { hornsPlay } from '../samples/horns';
import { stubViewportWidth } from '../testUtils/viewport';
import type { PlaySummary } from '../types/PlaySummary';
import type { StoredPlay } from '../types/StoredPlay';
import { DraftEditorRoute, StoredEditorRoute } from './EditorRoute';

vi.mock('../plays/usePlays');

const OWNER = '11111111-1111-1111-8111-111111111111';
const stored: StoredPlay = {
  id: 'p1' as PlayId,
  ownerId: OWNER,
  isPublic: true,
  updatedAt: '2026-03-04T12:00:00Z',
  play: { ...hornsPlay, id: 'p1' as PlayId, name: 'Stored horns' },
};
const summary: PlaySummary = {
  id: 'p1' as PlayId,
  name: 'Stored horns',
  court: 'fiba',
  extent: 'half',
  isPublic: true,
  updatedAt: stored.updatedAt,
  ownerId: OWNER,
};

const auth = (overrides: Partial<AuthContextValue> = {}): AuthContextValue => ({
  status: 'signedOut',
  userId: null,
  configured: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  ...overrides,
});

const client = createQueryClient();

function tree(path: string, value: AuthContextValue = auth()) {
  return (
    <MantineProvider env="test">
      <QueryClientProvider client={client}>
        <AuthContext value={value}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/" element={<LibraryScreen />} />
              <Route path="/play" element={<DraftEditorRoute />} />
              <Route path="/play/:id" element={<StoredEditorRoute />} />
            </Routes>
          </MemoryRouter>
        </AuthContext>
      </QueryClientProvider>
    </MantineProvider>
  );
}

function renderAt(path: string, value: AuthContextValue = auth()) {
  stubViewportWidth(1440);
  return render(tree(path, value));
}

const fetched = (data: StoredPlay | null) =>
  vi.mocked(hooks.useStoredPlay).mockReturnValue({ data, isPending: false, isError: false } as never);

const savedDraft = (): Draft => ({
  play: stored.play,
  origin: { ownerId: OWNER, isPublic: true, fingerprint: fingerprint(stored.play) },
});

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  // The editor's menu reads the writer's state; nothing here saves.
  vi.mocked(hooks.useSavePlay).mockReturnValue({ isPending: false, isError: false, reset: vi.fn() } as never);
  vi.mocked(hooks.usePublicPlays).mockReturnValue({ data: [summary], isSuccess: true, isError: false } as never);
});

describe('editor routes', () => {
  it.each([
    ['fails', { data: undefined, isPending: false, isError: true }],
    ['comes back empty', { data: null, isPending: false, isError: false }],
  ])('keeps an open editor when a later fetch %s', (_name, later) => {
    fetched(stored);
    const { rerender } = renderAt('/play/p1');
    expect(screen.getByRole('heading', { name: 'Stored horns' })).toBeInTheDocument();

    vi.mocked(hooks.useStoredPlay).mockReturnValue(later as never);
    rerender(tree('/play/p1'));

    expect(screen.getByRole('heading', { name: 'Stored horns' })).toBeInTheDocument();
    expect(screen.queryByText('No system at this address')).not.toBeInTheDocument();
  });

  it('edits the draft at /play', () => {
    writeDraft({ play: hornsPlay, origin: null });
    renderAt('/play');
    expect(screen.getByRole('heading', { name: hornsPlay.name })).toBeInTheDocument();
  });

  it('sends an empty /play back to the home screen', () => {
    renderAt('/play');
    expect(screen.getByText('Public systems')).toBeInTheDocument();
  });

  it('opens a stored system at its own address, keeping its owner in the draft', () => {
    fetched({ ...stored, ownerId: 'someone-else' });
    renderAt('/play/p1');
    expect(screen.getByRole('heading', { name: 'Stored horns' })).toBeInTheDocument();
    expect(readDraft()?.origin?.ownerId).toBe('someone-else');
  });

  it('waits for the system without claiming it is missing', () => {
    vi.mocked(hooks.useStoredPlay).mockReturnValue({ data: undefined, isPending: true, isError: false } as never);
    renderAt('/play/p1');
    expect(screen.queryByText('No system at this address')).not.toBeInTheDocument();
  });

  it('says the same thing for a private system and for one that does not exist', () => {
    // The query gives null for both: a row that is absent and a row the reader may not see.
    fetched(null);
    renderAt('/play/p1', auth({ status: 'signedIn', userId: 'u2' }));
    expect(screen.getByText('No system at this address')).toBeInTheDocument();
    expect(screen.getByText('This system either does not exist or is private.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to home' })).toBeInTheDocument();
  });

  it('invites signing in on that screen when nobody is', () => {
    fetched(null);
    renderAt('/play/p1');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/signin?next=%2Fplay%2Fp1');
    expect(screen.getByText(/If it is yours, sign in/)).toBeInTheDocument();
  });

  it('keeps unsaved changes to a system over the server copy when coming back to it', () => {
    fetched(stored);
    const edited = { ...stored.play, name: 'Edited horns' };
    writeDraft({ play: edited, origin: savedDraft().origin });
    renderAt('/play/p1');
    expect(screen.getByRole('heading', { name: 'Edited horns' })).toBeInTheDocument();
  });

  it('opens the server copy when the held draft of that system is clean', () => {
    fetched({ ...stored, play: { ...stored.play, name: 'Newer on server' } });
    writeDraft(savedDraft());
    renderAt('/play/p1');
    expect(screen.getByRole('heading', { name: 'Newer on server' })).toBeInTheDocument();
  });

  it('warns before replacing a draft with unsaved changes, and only then opens', async () => {
    const user = userEvent.setup();
    fetched(stored);
    writeDraft({ play: hornsPlay, origin: null });
    renderAt('/');
    await user.click(screen.getByRole('button', { name: /open/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/unsaved changes will be lost/)).toBeInTheDocument();
    expect(screen.getByText('Public systems')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Open anyway' }));
    expect(await screen.findByRole('heading', { name: 'Stored horns' })).toBeInTheDocument();
  });

  it('stays where it is when the coach keeps editing', async () => {
    const user = userEvent.setup();
    writeDraft({ play: hornsPlay, origin: null });
    renderAt('/');
    await user.click(screen.getByRole('button', { name: /open/i }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Keep editing' }));
    expect(readDraft()?.play.id).toBe(hornsPlay.id);
    expect(screen.getByText('Public systems')).toBeInTheDocument();
  });

  it('switches without a word when the draft is clean', async () => {
    const user = userEvent.setup();
    fetched(stored);
    writeDraft({ play: hornsPlay, origin: { ownerId: OWNER, isPublic: false, fingerprint: fingerprint(hornsPlay) } });
    renderAt('/');
    await user.click(screen.getByRole('button', { name: /open/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Stored horns' })).toBeInTheDocument();
  });
});
