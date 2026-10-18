import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabaseClient, installFakeSupabase } from '../supabase/testUtils/fakeSupabase';
import { AuthContextProvider } from './AuthContextProvider';
import { useAuthContext } from './useAuthContext';

const USER = '11111111-1111-1111-8111-111111111111';
const wrapper = ({ children }: { children: ReactNode }) => <AuthContextProvider>{children}</AuthContextProvider>;

describe('AuthContextProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('is signed out, and not configured, with no Supabase project', () => {
    installFakeSupabase(null);
    const { result } = renderHook(useAuthContext, { wrapper });
    expect(result.current.status).toBe('signedOut');
    expect(result.current.configured).toBe(false);
    expect(result.current.userId).toBeNull();
  });

  it('is loading, then signed out, when there is no session', async () => {
    installFakeSupabase(fakeSupabaseClient([]));
    const { result } = renderHook(useAuthContext, { wrapper });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    expect(result.current.configured).toBe(true);
  });

  it('reports the signed-in user id once the session resolves', async () => {
    installFakeSupabase(fakeSupabaseClient([], { userId: USER }));
    const { result } = renderHook(useAuthContext, { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedIn'));
    expect(result.current.userId).toBe(USER);
  });

  it('follows the session out when the coach signs out', async () => {
    const fake = fakeSupabaseClient([], { userId: USER });
    installFakeSupabase(fake);
    const { result } = renderHook(useAuthContext, { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedIn'));
    await act(() => result.current.signOut());
    expect(fake.client.auth.calls.signOut).toBe(1);
    expect(result.current.status).toBe('signedOut');
    expect(result.current.userId).toBeNull();
  });

  it('follows the session in when a sign-in lands', async () => {
    const fake = fakeSupabaseClient([]);
    installFakeSupabase(fake);
    const { result } = renderHook(useAuthContext, { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    act(() => fake.client.auth.setSession(USER));
    expect(result.current.userId).toBe(USER);
  });

  it('keeps a newer auth event over a slower initial session read', async () => {
    const fake = fakeSupabaseClient([]);
    let resolveSession: (value: Awaited<ReturnType<typeof fake.client.auth.getSession>>) => void = () => undefined;
    fake.client.auth.getSession = () => new Promise((resolve) => (resolveSession = resolve));
    installFakeSupabase(fake);
    const { result } = renderHook(useAuthContext, { wrapper });
    act(() => fake.client.auth.setSession(USER));
    expect(result.current.userId).toBe(USER);
    await act(async () => resolveSession({ data: { session: null }, error: null }));
    expect(result.current.userId).toBe(USER);
    expect(result.current.status).toBe('signedIn');
  });

  it('settles as signed out when the initial session read fails', async () => {
    const fake = fakeSupabaseClient([]);
    fake.client.auth.getSession = () => Promise.reject(new Error('network'));
    installFakeSupabase(fake);
    const { result } = renderHook(useAuthContext, { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
  });

  it('names the callback address, carrying where to return to', async () => {
    const fake = fakeSupabaseClient([]);
    installFakeSupabase(fake);
    const { result } = renderHook(useAuthContext, { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    await act(() => result.current.signInWithGoogle('/play'));
    const [call] = fake.client.auth.calls.signInWithOAuth;
    expect(call?.provider).toBe('google');
    expect(call?.options.redirectTo).toBe(`${window.location.origin}/auth/callback?next=%2Fplay`);
  });

  it('unsubscribes on unmount', async () => {
    const fake = fakeSupabaseClient([]);
    installFakeSupabase(fake);
    const { result, unmount } = renderHook(useAuthContext, { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    expect(fake.client.auth.listenerCount()).toBe(1);
    unmount();
    expect(fake.client.auth.listenerCount()).toBe(0);
  });

  it('throws outside its provider, naming both names', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(useAuthContext)).toThrow(/useAuthContext.*AuthContextProvider/s);
  });
});
