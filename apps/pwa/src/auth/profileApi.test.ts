import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabaseClient, installFakeSupabase } from '../supabase/testUtils/fakeSupabase';
import { fetchProfile, saveDisplayName } from './profileApi';

const USER = '11111111-1111-1111-8111-111111111111';

describe('profileApi', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns null when the coach has no profile yet', async () => {
    installFakeSupabase(fakeSupabaseClient([], { userId: USER, extraTables: { profiles: [] } }));
    expect(await fetchProfile(USER)).toBeNull();
  });

  it('reads a profile into the domain shape', async () => {
    installFakeSupabase(
      fakeSupabaseClient([], { userId: USER, extraTables: { profiles: [{ id: USER, display_name: 'Coach K' }] } }),
    );
    expect(await fetchProfile(USER)).toEqual({ id: USER, displayName: 'Coach K' });
  });

  it('creates the profile as the first write, keyed on the user id', async () => {
    const fake = fakeSupabaseClient([], { userId: USER, extraTables: { profiles: [] } });
    installFakeSupabase(fake);
    const saved = await saveDisplayName(USER, 'Coach K');
    expect(saved).toEqual({ id: USER, displayName: 'Coach K' });
    expect(fake.calls).toContainEqual({
      from: 'profiles',
      upsert: { id: USER, display_name: 'Coach K' },
    });
  });

  it('reads back the name it saved', async () => {
    installFakeSupabase(fakeSupabaseClient([], { userId: USER, extraTables: { profiles: [] } }));
    await saveDisplayName(USER, 'Coach K');
    expect(await fetchProfile(USER)).toEqual({ id: USER, displayName: 'Coach K' });
  });

  it('changes the name of an existing profile rather than adding a second', async () => {
    const fake = fakeSupabaseClient([], {
      userId: USER,
      extraTables: { profiles: [{ id: USER, display_name: 'Old' }] },
    });
    installFakeSupabase(fake);
    await saveDisplayName(USER, 'New');
    expect(await fetchProfile(USER)).toEqual({ id: USER, displayName: 'New' });
    const rows = await (fake.client.from('profiles') as { select: (c: string) => PromiseLike<unknown> }).select('id');
    expect(rows).toEqual({ data: [{ id: USER, display_name: 'New' }], error: null });
  });

  it('throws when Supabase reports an error', async () => {
    const fake = fakeSupabaseClient([], { userId: USER, extraTables: { profiles: [] } });
    fake.failWith('boom');
    installFakeSupabase(fake);
    await expect(saveDisplayName(USER, 'x')).rejects.toThrow('boom');
  });

  it('throws when Supabase is not configured', async () => {
    installFakeSupabase(null);
    await expect(fetchProfile(USER)).rejects.toThrow('supabase-not-configured');
  });
});
