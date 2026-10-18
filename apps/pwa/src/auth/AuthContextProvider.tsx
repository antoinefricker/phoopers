import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getSupabaseClient } from '../supabase/client';
import { AuthContext, type AuthContextValue } from './useAuthContext';

interface Props {
  children: ReactNode;
}

/** `undefined` until the stored session has been read; then the signed-in user id, or `null`. */
type Settled = string | null | undefined;

export function AuthContextProvider({ children }: Props) {
  const supabase = getSupabaseClient();
  const [settled, setSettled] = useState<Settled>(undefined);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    // Once an event has fired it is authoritative: a slower initial read must not overwrite it.
    let eventSeen = false;
    // Only async callbacks set state: the initial read and every later change.
    supabase.auth
      .getSession()
      .then(({ data }) => data.session?.user.id ?? null)
      // A failed read settles as signed out rather than leaving the status on loading.
      .catch(() => null)
      .then((userId) => {
        if (active && !eventSeen) setSettled(userId);
      });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      eventSeen = true;
      if (active) setSettled(session?.user.id ?? null);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  const signInWithGoogle = useCallback(
    async (next: string) => {
      if (!supabase) throw new Error('supabase-not-configured');
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
      if (error) throw new Error(error.message);
    },
    [supabase],
  );

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
  }, [supabase]);

  const value = useMemo<AuthContextValue>(() => {
    const userId = supabase ? (settled ?? null) : null;
    const status = supabase && settled === undefined ? 'loading' : userId ? 'signedIn' : 'signedOut';
    return { status, userId, configured: supabase !== null, signInWithGoogle, signOut };
  }, [supabase, settled, signInWithGoogle, signOut]);

  return <AuthContext value={value}>{children}</AuthContext>;
}
