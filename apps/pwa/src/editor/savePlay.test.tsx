import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import type { AuthContextValue } from '../auth/useAuthContext';
import * as profileApi from '../auth/profileApi';
import { fingerprint, type DraftOrigin } from '../draft/draftStorage';
import { fixturePlay } from '../engine/__fixtures__/play';
import * as playsApi from '../plays/playsApi';
import type { StoredPlay } from '../types/StoredPlay';
import { PlayView } from '../play2d/PlayView';
import { readProbe, renderEditor } from './testUtils/renderEditor';

vi.mock('../plays/playsApi');
vi.mock('../auth/profileApi');

const ME = '11111111-1111-1111-8111-111111111111';
const SOMEONE = '22222222-2222-2222-8222-222222222222';

const signedIn: Partial<AuthContextValue> = { status: 'signedIn', userId: ME, configured: true };
const signedOut: Partial<AuthContextValue> = { status: 'signedOut', userId: null, configured: true };

const storedAs = (ownerId: string): DraftOrigin => ({
  playId: fixturePlay.id,
  ownerId,
  isPublic: false,
  fingerprint: fingerprint(fixturePlay),
});

const stored = (ownerId = ME): StoredPlay => ({
  id: fixturePlay.id,
  ownerId,
  isPublic: false,
  updatedAt: '2026-03-04T12:00:00Z',
  play: fixturePlay,
});

function Where() {
  const { pathname, search } = useLocation();

  return <output data-testid="where">{`${pathname}${search}`}</output>;
}

const renderView = (options: Parameters<typeof renderEditor>[2] = {}) =>
  renderEditor(
    fixturePlay,
    <>
      <PlayView />
      <Where />
    </>,
    { wrapPlayback: false, ...options },
  );

const openMenu = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'System menu' }));
};

const save = async () => {
  await openMenu();
  await userEvent.click(screen.getByRole('button', { name: /^Save/ }));
};

const where = () => screen.getByTestId('where').textContent;

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(profileApi.fetchProfile).mockImplementation(async (id) => ({
    id,
    displayName: id === ME ? 'Me' : 'Coach Ada',
  }));
  vi.mocked(playsApi.insertPlay).mockImplementation(async (play, { ownerId, isPublic }) => ({
    id: play.id,
    ownerId,
    isPublic,
    updatedAt: '2026-03-04T12:00:00Z',
    play,
  }));
  vi.mocked(playsApi.hasActiveSession).mockResolvedValue(true);
  vi.mocked(playsApi.updatePlay).mockImplementation(async (play) => ({ ...stored(), play }));
});

describe('saving a system', () => {
  it('marks Save while the open system differs from what is stored', async () => {
    const { unmount } = renderView({ origin: null });
    await openMenu();
    expect(screen.getByRole('img', { name: 'Unsaved changes' })).toBeInTheDocument();
    unmount();

    renderView({ origin: storedAs(ME), auth: signedIn });
    await openMenu();
    expect(screen.queryByRole('img', { name: 'Unsaved changes' })).not.toBeInTheDocument();
  });

  it('sends a coach with no account to sign in, and comes back to the save dialog', async () => {
    const first = renderView({ auth: signedOut });
    await save();
    expect(where()).toBe(`/signin?next=${encodeURIComponent('/play?save=1')}`);
    first.unmount();

    renderView({ auth: signedIn, path: '/play?save=1' });
    expect(await screen.findByRole('dialog', { name: 'Save the system' })).toBeInTheDocument();
  });

  it('asks a coach with no profile to name themselves before anything is written', async () => {
    vi.mocked(profileApi.fetchProfile).mockResolvedValue(null);
    renderView({ auth: signedIn });
    await waitFor(() => expect(profileApi.fetchProfile).toHaveBeenCalled());
    await save();

    await waitFor(() => expect(where()).toBe(`/auth/callback?next=${encodeURIComponent('/play?save=1')}`));
    expect(playsApi.insertPlay).not.toHaveBeenCalled();
  });

  it('inserts through the dialog on a first save, then stops marking Save', async () => {
    renderView({ auth: signedIn });
    await save();
    const dialog = await screen.findByRole('dialog', { name: 'Save the system' });
    const name = within(dialog).getByLabelText(/Name/);
    await userEvent.clear(name);
    await userEvent.type(name, 'Horns flare');
    await userEvent.click(within(dialog).getByRole('radio', { name: /Public/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(playsApi.insertPlay).toHaveBeenCalledWith(
        expect.objectContaining({ id: fixturePlay.id, name: 'Horns flare' }),
        {
          ownerId: ME,
          isPublic: true,
        },
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(readProbe().play.name).toBe('Horns flare');
    await openMenu();
    expect(screen.queryByRole('img', { name: 'Unsaved changes' })).not.toBeInTheDocument();
  });

  it('overwrites without a dialog when the signer owns the system', async () => {
    renderView({ auth: signedIn, origin: { ...storedAs(ME), fingerprint: 'older' } });
    await save();

    await waitFor(() => expect(playsApi.updatePlay).toHaveBeenCalledWith(fixturePlay));
    // The open menu is itself a dialog, so look for the save dialog by name.
    expect(screen.queryByRole('dialog', { name: /^Save/ })).not.toBeInTheDocument();
    expect(playsApi.insertPlay).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('img', { name: 'Unsaved changes' })).not.toBeInTheDocument());
  });

  it('offers a copy, and leaves the original alone, when someone else owns it', async () => {
    renderView({ auth: signedIn, origin: storedAs(SOMEONE) });
    await save();
    const dialog = await screen.findByRole('dialog', { name: 'Save a copy' });
    await waitFor(() => expect(within(dialog).getByText(/This system belongs to Coach Ada/)).toBeInTheDocument());
    expect(within(dialog).getByLabelText(/Name/)).toHaveValue(`${fixturePlay.name} (copy)`);
    expect(within(dialog).getByRole('radio', { name: /Public/ })).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(playsApi.insertPlay).toHaveBeenCalled());
    expect(playsApi.updatePlay).not.toHaveBeenCalled();
    expect(playsApi.insertPlay).toHaveBeenCalledWith(
      expect.objectContaining({ id: expect.not.stringMatching(fixturePlay.id) }),
      { ownerId: ME, isPublic: false },
    );
    const copyId = vi.mocked(playsApi.insertPlay).mock.calls[0]![0].id;
    await waitFor(() => expect(where()).toBe(`/play/${copyId}`));
  });

  it('refuses a name of nothing but spaces', async () => {
    renderView({ auth: signedIn });
    await save();
    const dialog = await screen.findByRole('dialog', { name: 'Save the system' });
    const name = within(dialog).getByLabelText(/Name/);
    await userEvent.clear(name);
    await userEvent.type(name, '   ');

    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('keeps the draft and says so when the save fails', async () => {
    vi.mocked(playsApi.insertPlay).mockRejectedValue(new Error('offline'));
    renderView({ auth: signedIn });
    await save();
    const dialog = await screen.findByRole('dialog', { name: 'Save the system' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByText(/could not be saved/)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Save the system' })).toBeInTheDocument();
    expect(readProbe().play.id).toBe(fixturePlay.id);
    expect(localStorage.getItem('phoopers.draft.v1')).not.toBeNull();
  });

  it('says so when an overwrite fails, and stays marked', async () => {
    vi.mocked(playsApi.updatePlay).mockRejectedValue(new Error('offline'));
    vi.mocked(playsApi.fetchPlay).mockResolvedValue(stored());
    renderView({ auth: signedIn, origin: { ...storedAs(ME), fingerprint: 'older' } });
    await save();

    expect(await screen.findByText(/could not be saved/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Unsaved changes' })).toBeInTheDocument();
  });

  it('offers to store the system again when its row has vanished', async () => {
    vi.mocked(playsApi.updatePlay).mockRejectedValue(new Error('0 rows'));
    vi.mocked(playsApi.fetchPlay).mockResolvedValue(null);
    renderView({ auth: signedIn, origin: { ...storedAs(ME), fingerprint: 'older' } });
    await save();

    const dialog = await screen.findByRole('dialog', { name: 'Save the system' });
    expect(within(dialog).getByText(/no longer exists/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(playsApi.insertPlay).toHaveBeenCalledWith(expect.objectContaining({ id: fixturePlay.id }), {
        ownerId: ME,
        isPublic: false,
      }),
    );
  });

  it('does not call the row gone when the session has lapsed', async () => {
    vi.mocked(playsApi.updatePlay).mockRejectedValue(new Error('0 rows'));
    vi.mocked(playsApi.fetchPlay).mockResolvedValue(null);
    vi.mocked(playsApi.hasActiveSession).mockResolvedValue(false);
    renderView({ auth: signedIn, origin: { ...storedAs(ME), fingerprint: 'older' } });
    await save();

    expect(await screen.findByText(/could not be saved/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /^Save/ })).not.toBeInTheDocument();
  });

  it('carries out a pending overwrite once the coach is back from signing in', async () => {
    renderView({
      auth: signedIn,
      origin: { ...storedAs(ME), fingerprint: 'older' },
      path: `/play/${fixturePlay.id}?save=1`,
    });

    await waitFor(() => expect(playsApi.updatePlay).toHaveBeenCalledWith(fixturePlay));
    expect(playsApi.updatePlay).toHaveBeenCalledTimes(1);
    // Awaited, not read straight after the write: dropping `?save=1` is a router state update,
    // so the two land in separate renders and asserting it synchronously was a race.
    await waitFor(() => expect(where()).toBe(`/play/${fixturePlay.id}`));
  });

  it('mints a copy id once per dialog, so a retry cannot make a second copy', async () => {
    vi.mocked(playsApi.insertPlay).mockRejectedValueOnce(new Error('offline'));
    renderView({ auth: signedIn, origin: storedAs(SOMEONE) });
    await save();
    const dialog = await screen.findByRole('dialog', { name: 'Save a copy' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await within(dialog).findByText(/could not be saved/);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(playsApi.insertPlay).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(playsApi.insertPlay).mock.calls;
    expect(second![0].id).toBe(first![0].id);
  });

  it('cannot save when no Supabase project is configured', async () => {
    renderView();
    await openMenu();

    expect(screen.getByRole('button', { name: /^Save/ })).toBeDisabled();
  });
});

describe('the save shortcut', () => {
  const chord = () => userEvent.keyboard('{Alt>}{Shift>}s{/Shift}{/Alt}');

  it('opens the save dialog without going through the menu', async () => {
    renderView({ auth: signedIn });

    await chord();

    expect(await screen.findByRole('dialog', { name: 'Save the system' })).toBeInTheDocument();
  });

  it('overwrites straight away on a system the coach already owns', async () => {
    vi.mocked(playsApi.updatePlay).mockResolvedValue(stored());
    renderView({ auth: signedIn, origin: { ...storedAs(ME), fingerprint: 'older' } });

    await chord();

    await waitFor(() => expect(playsApi.updatePlay).toHaveBeenCalledWith(fixturePlay));
  });

  it('sends a signed-out coach to sign in, as the menu entry does', async () => {
    renderView({ auth: signedOut });

    await chord();

    await waitFor(() => expect(screen.getByTestId('where').textContent).toContain('/signin'));
  });

  it('says nothing when there is no Supabase project to save to', async () => {
    renderView({ auth: { status: 'signedOut', userId: null, configured: false } });

    await chord();

    expect(screen.queryByRole('dialog', { name: 'Save the system' })).not.toBeInTheDocument();
    expect(screen.getByTestId('where').textContent).not.toContain('/signin');
  });
});
