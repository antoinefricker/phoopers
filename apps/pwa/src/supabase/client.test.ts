import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseClient, isSupabaseConfigured } from './client';

describe('supabase client', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is not configured when the environment is empty', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    expect(isSupabaseConfigured()).toBe(false);
    expect(getSupabaseClient()).toBeNull();
  });

  it('builds one client, once, when both variables are set', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    expect(isSupabaseConfigured()).toBe(true);
    const client = getSupabaseClient();
    expect(client).not.toBeNull();
    expect(getSupabaseClient()).toBe(client);
  });

  it('is not configured when only the URL is set', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    expect(isSupabaseConfigured()).toBe(false);
    expect(getSupabaseClient()).toBeNull();
  });

  it('is not configured when only the key is set', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    expect(isSupabaseConfigured()).toBe(false);
    expect(getSupabaseClient()).toBeNull();
  });
});
