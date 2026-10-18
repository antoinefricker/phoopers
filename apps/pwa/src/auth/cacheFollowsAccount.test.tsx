import { render } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { createQueryClient } from '../app/queryClient';
import { playKeys } from '../plays/usePlays';
import { CacheFollowsAccount } from './CacheFollowsAccount';
import { AuthContext, type AuthContextValue } from './useAuthContext';

const ME = '11111111-1111-1111-8111-111111111111';
const SOMEONE = '22222222-2222-2222-8222-222222222222';

const auth = (overrides: Partial<AuthContextValue>): AuthContextValue => ({
  status: 'signedOut',
  userId: null,
  configured: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  ...overrides,
});

describe('CacheFollowsAccount', () => {
  const mounted = (value: AuthContextValue) => {
    const client = createQueryClient();
    const tree = (current: AuthContextValue) => (
      <QueryClientProvider client={client}>
        <AuthContext value={current}>
          <CacheFollowsAccount />
        </AuthContext>
      </QueryClientProvider>
    );
    const { rerender } = render(tree(value));
    client.setQueryData(playKeys.mine(), [{ id: 'p1' }]);
    return { client, signAs: (next: AuthContextValue) => rerender(tree(next)) };
  };

  it('drops the previous coach’s systems when they sign out', () => {
    const { client, signAs } = mounted(auth({ status: 'signedIn', userId: ME }));
    signAs(auth({ status: 'signedOut', userId: null }));
    expect(client.getQueryData(playKeys.mine())).toBeUndefined();
  });

  it('drops them when another coach signs in on the same browser', () => {
    const { client, signAs } = mounted(auth({ status: 'signedIn', userId: ME }));
    signAs(auth({ status: 'signedIn', userId: SOMEONE }));
    expect(client.getQueryData(playKeys.mine())).toBeUndefined();
  });

  it('keeps the cache while the same coach stays signed in', () => {
    const { client, signAs } = mounted(auth({ status: 'signedIn', userId: ME }));
    signAs(auth({ status: 'signedIn', userId: ME }));
    expect(client.getQueryData(playKeys.mine())).toEqual([{ id: 'p1' }]);
  });

  it('keeps what was fetched while the session was still being read', () => {
    const { client, signAs } = mounted(auth({ status: 'loading', userId: null }));
    signAs(auth({ status: 'signedIn', userId: ME }));
    expect(client.getQueryData(playKeys.mine())).toEqual([{ id: 'p1' }]);
  });
});
