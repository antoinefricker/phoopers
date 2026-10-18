import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Play, PlayId } from '../engine';
import { hornsPlay } from '../samples/horns';
import {
  deletePlay,
  fetchPlay,
  insertPlay,
  LIST_LIMIT,
  listMyPlays,
  listPublicPlays,
  renamePlay,
  setPlayVisibility,
  updatePlay,
} from './playsApi';
import { toRow, type PlayRow } from './serialize';
import { fakeSupabaseClient, installFakeSupabase, type FakeSupabase } from '../supabase/testUtils/fakeSupabase';

const OWNER = '11111111-1111-1111-8111-111111111111';
const TIMESTAMP = '2026-10-18T10:00:00Z';

const storedRow: PlayRow = {
  ...toRow(hornsPlay, { ownerId: OWNER, isPublic: false }),
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP,
};

describe('playsApi', () => {
  let fake: FakeSupabase;

  beforeEach(() => {
    vi.resetAllMocks();
    fake = fakeSupabaseClient([storedRow], { userId: OWNER });
    installFakeSupabase(fake);
  });

  it('asks for the signed-in coach’s systems, newest first', async () => {
    const list = await listMyPlays();
    expect(fake.calls).toContainEqual({ from: 'plays', order: ['updated_at', { ascending: false }] });
    expect(fake.calls).toContainEqual({ from: 'plays', eq: ['owner_id', OWNER] });
    expect(fake.calls).toContainEqual({ from: 'plays', limit: LIST_LIMIT });
    expect(list.map((entry) => entry.id)).toEqual([hornsPlay.id]);
  });

  it('lists nothing, and asks nothing, when nobody is signed in', async () => {
    fake = fakeSupabaseClient([storedRow]);
    installFakeSupabase(fake);
    expect(await listMyPlays()).toEqual([]);
    expect(fake.calls).toEqual([]);
  });

  it('never selects the document for a list', async () => {
    await listMyPlays();
    const select = fake.calls.find((call) => 'select' in call)?.select as string;
    expect(select.split(',').map((column) => column.trim())).not.toContain('data');
  });

  it('filters by name when a search is given', async () => {
    await listMyPlays('horns');
    expect(fake.calls).toContainEqual({ from: 'plays', ilike: ['name', '%horns%'] });
  });

  it('treats wildcards in a search as literal text', async () => {
    fake = fakeSupabaseClient([storedRow, { ...storedRow, id: 'other', name: '50% off' }], {
      userId: OWNER,
    });
    installFakeSupabase(fake);
    const list = await listMyPlays('50%');
    expect(fake.calls).toContainEqual({ from: 'plays', ilike: ['name', '%50\\%%'] });
    expect(list.map((entry) => entry.name)).toEqual(['50% off']);
  });

  it('throws, rather than lists nothing, when the session cannot be read', async () => {
    fake = fakeSupabaseClient([storedRow], { userId: OWNER });
    fake.client.auth.getSession = () =>
      Promise.resolve({ data: { session: null }, error: { message: 'session-broken' } });
    installFakeSupabase(fake);
    await expect(listMyPlays()).rejects.toThrow('session-broken');
  });

  it('does not filter by name when the search is blank', async () => {
    await listMyPlays('   ');
    expect(fake.calls.some((call) => 'ilike' in call)).toBe(false);
  });

  it('asks the library for public systems and their authors', async () => {
    fake = fakeSupabaseClient([{ ...storedRow, is_public: true }]);
    installFakeSupabase(fake);
    await listPublicPlays();
    expect(fake.calls).toContainEqual({ from: 'plays', eq: ['is_public', true] });
    const select = fake.calls.find((call) => 'select' in call)?.select as string;
    expect(select).toContain('profiles(display_name)');
  });

  it('returns the stored system for a readable id', async () => {
    const stored = await fetchPlay(hornsPlay.id);
    expect(stored).toMatchObject({ id: hornsPlay.id, ownerId: OWNER, isPublic: false });
  });

  it('returns null for a system the reader may not read', async () => {
    expect(await fetchPlay('missing' as PlayId)).toBeNull();
  });

  it('inserts a new row owned by the given coach', async () => {
    const stored = await insertPlay(hornsPlay, { ownerId: OWNER, isPublic: true });
    expect(fake.calls).toContainEqual({
      from: 'plays',
      insert: toRow(hornsPlay, { ownerId: OWNER, isPublic: true }),
    });
    expect(stored.isPublic).toBe(true);
  });

  it('writes the whole document on an update', async () => {
    const edited = { ...hornsPlay, name: 'Horns, edited' };
    await updatePlay(edited);
    expect(fake.calls).toContainEqual({
      from: 'plays',
      update: expect.objectContaining({ name: 'Horns, edited', data: edited }),
    });
    expect(fake.calls).toContainEqual({ from: 'plays', eq: ['id', hornsPlay.id] });
  });

  it('renames the document as well as the column', async () => {
    await renamePlay(hornsPlay.id, 'Renamed');
    const written = fake.calls.find((call) => 'update' in call)?.update as { name: string; data: Play };
    expect(written.name).toBe('Renamed');
    expect(written.data.name).toBe('Renamed');
  });

  // The column is copied from the document on every save, so a rename that touched the column
  // alone would be undone by the first overwrite from the editor.
  it('keeps the new name when the editor later overwrites the system', async () => {
    await renamePlay(hornsPlay.id, 'Renamed');
    const written = fake.calls.find((call) => 'update' in call)?.update as { name: string; data: Play };

    fake = fakeSupabaseClient([{ ...storedRow, name: written.name, data: written.data }], { userId: OWNER });
    installFakeSupabase(fake);
    const reopened = await fetchPlay(hornsPlay.id);
    await updatePlay(reopened!.play);

    expect(fake.calls).toContainEqual({
      from: 'plays',
      update: expect.objectContaining({ name: 'Renamed', data: expect.objectContaining({ name: 'Renamed' }) }),
    });
  });

  it('refuses to rename a row it cannot read', async () => {
    await expect(renamePlay('missing' as PlayId, 'Renamed')).rejects.toThrow('play-not-found');
  });

  it('changes visibility through its column alone', async () => {
    await setPlayVisibility(hornsPlay.id, true);
    expect(fake.calls).toContainEqual({ from: 'plays', update: { is_public: true } });
  });

  it('deletes by id', async () => {
    await deletePlay(hornsPlay.id);
    expect(fake.calls).toContainEqual({ from: 'plays', delete: true });
    expect(fake.calls).toContainEqual({ from: 'plays', eq: ['id', hornsPlay.id] });
  });

  it('surfaces an error from Supabase', async () => {
    fake.failWith('boom');
    await expect(listMyPlays()).rejects.toThrow('boom');
    await expect(renamePlay(hornsPlay.id, 'x')).rejects.toThrow('boom');
  });

  describe('when Supabase is not configured', () => {
    beforeEach(() => installFakeSupabase(null));

    it('refuses every call', async () => {
      const refusals = [
        listMyPlays(),
        listPublicPlays(),
        fetchPlay(hornsPlay.id),
        insertPlay(hornsPlay, { ownerId: OWNER, isPublic: false }),
        updatePlay(hornsPlay),
        renamePlay(hornsPlay.id, 'x'),
        setPlayVisibility(hornsPlay.id, true),
        deletePlay(hornsPlay.id),
      ];
      for (const refusal of refusals) {
        await expect(refusal).rejects.toThrow('supabase-not-configured');
      }
    });
  });
});
