import { createContext, useContext } from 'react';

export interface AuthContextValue {
  status: 'loading' | 'signedOut' | 'signedIn';
  userId: string | null;
  /** False when no Supabase project is configured: nothing can be saved, and nobody can sign in. */
  configured: boolean;
  /** Leaves for Google; the coach comes back to `/auth/callback`, which sends them on to `next`. */
  signInWithGoogle: (next: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuthContext(): AuthContextValue {
  const value = useContext(AuthContext);

  if (value === null) {
    throw new Error('useAuthContext must be used inside an AuthContextProvider');
  }

  return value;
}
