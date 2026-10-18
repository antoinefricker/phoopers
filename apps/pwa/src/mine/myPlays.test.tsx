import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/useAuthContext';
import type { Play, PlayId } from '../engine';
import * as api from '../plays/playsApi';
import * as hooks from '../plays/usePlays';
import type { PlaySummary } from '../types/PlaySummary';
import { MyPlaysScreen } from './MyPlaysScreen';

vi.mock('../plays/usePlays');
vi.mock('../plays/playsApi');

const horns: PlaySummary = {
  id: 'p1' as PlayId,
  name: 'Horns flare',
  court: 'fiba',
  extent: 'half',
  isPublic: true,
  updatedAt: '2026-03-04T12:00:00Z',
  ownerId: 'u1',
};
const press: PlaySummary = {
  ...horns,
  id: 'p2' as PlayId,
  name: 'Press break',
  court: 'nba',
  extent: 'full',
  isPublic: false,
};

const auth = (overrides: Partial<AuthContextValue> = {}): AuthContextValue => ({
  status: 'signedIn',
  userId: 'u1',
  configured: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  ...overrides,
});

const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(undefined), isError: false });
let rename: ReturnType<typeof mutation>;
let visibility: ReturnType<typeof mutation>;
let remove: ReturnType<typeof mutation>;
let save: ReturnType<typeof mutation>;

function renderScreen(value: AuthContextValue = auth()) {
  return render(
    <MantineProvider env="test">
      <AuthContext value={value}>
        <MemoryRouter>
          <MyPlaysScreen />
        </MemoryRouter>
      </AuthContext>
    </MantineProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  rename = mutation();
  visibility = mutation();
  remove = mutation();
  save = mutation();
  vi.mocked(hooks.useMyPlays).mockReturnValue({ data: [horns, press], isSuccess: true, isError: false } as never);
  vi.mocked(hooks.useRenamePlay).mockReturnValue(rename as never);
  vi.mocked(hooks.useSetVisibility).mockReturnValue(visibility as never);
  vi.mocked(hooks.useDeletePlay).mockReturnValue(remove as never);
  vi.mocked(hooks.useSavePlay).mockReturnValue(save as never);
});

const openMenu = async (user: ReturnType<typeof userEvent.setup>, name = 'Horns flare') =>
  user.click(screen.getByRole('button', { name: `More actions for ${name}` }));

describe('MyPlaysScreen', () => {
  it('lists the coach’s systems with their court, extent and badge', () => {
    renderScreen();
    const card = within(screen.getByRole('article', { name: 'Horns flare' }));
    expect(card.getByText('Public')).toBeInTheDocument();
    expect(card.getByText('FIBA · half court')).toBeInTheDocument();
    expect(card.getByText(/Updated .*2026/)).toBeInTheDocument();
    const other = within(screen.getByRole('article', { name: 'Press break' }));
    expect(other.getByText('Private')).toBeInTheDocument();
    expect(other.getByText('NBA · full court')).toBeInTheDocument();
  });

  it('keeps every action but Open behind one menu', async () => {
    const user = userEvent.setup();
    renderScreen();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    await openMenu(user);
    ['Rename', 'Make private', 'Duplicate', 'Delete'].forEach((name) =>
      expect(screen.getByRole('menuitem', { name })).toBeInTheDocument(),
    );
  });

  it('offers to make a private system public', async () => {
    const user = userEvent.setup();
    renderScreen();
    await openMenu(user, 'Press break');
    await user.click(screen.getByRole('menuitem', { name: 'Make public' }));
    expect(visibility.mutate).toHaveBeenCalledWith({ id: 'p2', isPublic: true });
  });

  it('asks before deleting, and deletes only on confirmation', async () => {
    const user = userEvent.setup();
    renderScreen();
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    expect(remove.mutate).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(remove.mutate).not.toHaveBeenCalled();

    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(remove.mutate).toHaveBeenCalledWith('p1');
  });

  it('renames to the trimmed name', async () => {
    const user = userEvent.setup();
    renderScreen();
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const field = await screen.findByLabelText('Name');
    expect(field).toHaveValue('Horns flare');
    await user.clear(field);
    await user.type(field, '  Horns twist ');
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    expect(rename.mutate).toHaveBeenCalledWith({ id: 'p1', name: 'Horns twist' });
  });

  it('refuses a rename to nothing but spaces', async () => {
    const user = userEvent.setup();
    renderScreen();
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const field = await screen.findByLabelText('Name');
    await user.clear(field);
    await user.type(field, '   {Enter}');
    expect(screen.getByRole('button', { name: 'Rename' })).toBeDisabled();
    expect(rename.mutate).not.toHaveBeenCalled();
  });

  it('duplicates as a private copy with a new id', async () => {
    const user = userEvent.setup();
    const original = { id: 'p1', name: 'Horns flare' } as Play;
    vi.mocked(api.fetchPlay).mockResolvedValue({
      id: 'p1' as PlayId,
      ownerId: 'u1',
      isPublic: true,
      updatedAt: horns.updatedAt,
      play: original,
    });
    renderScreen();
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    await waitFor(() => expect(save.mutateAsync).toHaveBeenCalledTimes(1));
    const { play, insert } = save.mutateAsync.mock.calls[0]?.[0] as { play: Play; insert: unknown };
    expect(insert).toEqual({ ownerId: 'u1', isPublic: false });
    expect(play.id).not.toBe('p1');
    expect(play.name).toBe('Horns flare (copy)');
  });

  it('searches by name, after a pause', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.type(screen.getByRole('textbox', { name: 'Search my systems' }), 'horns');
    await waitFor(() => expect(hooks.useMyPlays).toHaveBeenLastCalledWith('horns'));
    expect(vi.mocked(hooks.useMyPlays).mock.calls.filter(([s]) => s === 'h' || s === 'ho')).toHaveLength(0);
  });

  it('says to sign in rather than listing nothing when signed out', () => {
    renderScreen(auth({ status: 'signedOut', userId: null }));
    expect(screen.getByText('Sign in to see the systems you have saved.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/signin?next=%2Fmine');
    expect(hooks.useMyPlays).not.toHaveBeenCalled();
  });

  it('says the app is not configured rather than failing with no project', () => {
    renderScreen(auth({ configured: false, status: 'signedOut', userId: null }));
    expect(screen.getByText(/not configured/i)).toBeInTheDocument();
    expect(hooks.useMyPlays).not.toHaveBeenCalled();
  });
});
