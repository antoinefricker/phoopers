import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from './useAuthContext';

/**
 * Empties the query cache whenever the signed-in coach changes.
 *
 * "My systems" is cached under a key that says nothing about whose it is, so without this a
 * second coach signing in on the same browser would be shown the first one's list until the
 * refetch landed — and signing out would leave it on screen for anyone.
 *
 * Renders nothing: it has to sit inside both the query client and the auth context, which is
 * exactly where `App` puts it.
 */
export function CacheFollowsAccount() {
  const { status, userId } = useAuthContext();
  const queryClient = useQueryClient();
  // The account the cache holds, `undefined` until the session has settled once.
  const cached = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (status === 'loading') return;
    if (cached.current === undefined || cached.current === userId) {
      cached.current = userId;
      return;
    }
    cached.current = userId;
    queryClient.clear();
  }, [status, userId, queryClient]);

  return null;
}
