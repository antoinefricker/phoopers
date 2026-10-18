import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../app/queryClient';
import * as api from './profileApi';
import { AuthContext, type AuthContextValue } from './useAuthContext';
import { useProfile } from './useProfile';

vi.mock('./profileApi');

const auth = (value: Partial<AuthContextValue>) => {
  const full: AuthContextValue = {
    status: 'signedOut',
    userId: null,
    configured: true,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    ...value,
  };
  const client = createQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <AuthContext.Provider value={full}>{children}</AuthContext.Provider>
      </QueryClientProvider>
    );
  }
  return Wrapper;
};

beforeEach(() => vi.resetAllMocks());

describe('useProfile', () => {
  it('does not query while signed out', () => {
    renderHook(() => useProfile(), { wrapper: auth({ status: 'signedOut' }) });
    expect(api.fetchProfile).not.toHaveBeenCalled();
  });

  it('does not query while the session is loading', () => {
    renderHook(() => useProfile(), { wrapper: auth({ status: 'loading', userId: 'u1' }) });
    expect(api.fetchProfile).not.toHaveBeenCalled();
  });

  it('fetches the profile once signed in', async () => {
    vi.mocked(api.fetchProfile).mockResolvedValue({ id: 'u1', displayName: 'Coach' });
    const { result } = renderHook(() => useProfile(), { wrapper: auth({ status: 'signedIn', userId: 'u1' }) });
    await waitFor(() => expect(result.current.data).toEqual({ id: 'u1', displayName: 'Coach' }));
    expect(api.fetchProfile).toHaveBeenCalledWith('u1');
  });
});
