import type { SupabaseClient } from '@supabase/supabase-js';
import { vi } from 'vitest';
import * as supabaseClient from '../client';
import type { PlayRow } from '../../plays/serialize';

type Row = Record<string, unknown>;

/** One call made against the double. Every entry names the table it was made on. */
export type RecordedCall = { from: string } & Record<string, unknown>;

export interface FakeSession {
  user: { id: string };
}

export type FakeAuthListener = (event: string, session: FakeSession | null) => void;

/** The auth surface the double offers: the session, its subscribers, sign-in and sign-out. */
export interface FakeAuth {
  getSession: () => Promise<{ data: { session: FakeSession | null }; error: { message: string } | null }>;
  onAuthStateChange: (listener: FakeAuthListener) => { data: { subscription: { unsubscribe: () => void } } };
  signInWithOAuth: (credentials: { provider: string; options: { redirectTo: string } }) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
  signOut: () => Promise<{ error: { message: string } | null }>;
  /** What the double was asked, in order, per method. */
  calls: { signInWithOAuth: Array<{ provider: string; options: { redirectTo: string } }>; signOut: number };
  /** Changes the session and tells every subscriber, as a real sign-in or sign-out would. */
  setSession: (userId: string | null) => void;
  /** How many subscribers are listening right now. */
  listenerCount: () => number;
}

export interface FakeSupabase {
  /** What the double was asked, in order. Assert on it with `toContainEqual`. */
  calls: RecordedCall[];
  /** The object to hand out as the Supabase client. */
  client: { from: (table: string) => unknown; auth: FakeAuth };
  /** Makes every terminal call resolve with this error instead of data; `null` stops failing. */
  failWith: (message: string | null) => void;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Postgres LIKE semantics, case-insensitive: `%` and `_` are wildcards, backslash escapes them. */
function likeToRegExp(pattern: string): RegExp {
  let source = '';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern.charAt(i);
    if (char === '\\' && i + 1 < pattern.length) source += escapeRegExp(pattern.charAt(++i));
    else if (char === '%') source += '.*';
    else if (char === '_') source += '.';
    else source += escapeRegExp(char);
  }
  return new RegExp(`^${source}$`, 'is');
}

/**
 * A chainable double of the Supabase client that records the calls made against it. It holds rows
 * per table, applies `eq` and `ilike` to them, and resolves a terminal call with `{ data, error }`.
 * It does not enforce Row Level Security: that lives in the database, and the API relies on it.
 * `auth` holds a mutable session, its subscribers, and the sign-in and sign-out calls.
 */
export function fakeSupabaseClient(
  rows: PlayRow[],
  options: { userId?: string | null; extraTables?: Record<string, Row[]> } = {},
) {
  const { userId = null, extraTables = {} } = options;
  const tables: Record<string, Row[]> = { plays: [...rows] as unknown as Row[], ...extraTables };
  const calls: RecordedCall[] = [];
  let failure: { message: string } | null = null;
  let sessionUserId = userId;
  const listeners = new Set<FakeAuthListener>();
  const currentSession = (): FakeSession | null => (sessionUserId ? { user: { id: sessionUserId } } : null);
  const auth: FakeAuth = {
    getSession: () => Promise.resolve({ data: { session: currentSession() }, error: null }),
    onAuthStateChange: (listener) => {
      listeners.add(listener);
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    },
    signInWithOAuth: (credentials) => {
      auth.calls.signInWithOAuth.push(credentials);
      return Promise.resolve({ data: {}, error: null });
    },
    signOut: () => {
      auth.calls.signOut += 1;
      auth.setSession(null);
      return Promise.resolve({ error: null });
    },
    calls: { signInWithOAuth: [], signOut: 0 },
    setSession: (next) => {
      sessionUserId = next;
      const session = currentSession();
      listeners.forEach((listener) => listener(session ? 'SIGNED_IN' : 'SIGNED_OUT', session));
    },
    listenerCount: () => listeners.size,
  };

  function builder(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    let write: { kind: 'insert' | 'upsert' | 'update' | 'delete'; payload?: Row } | null = null;

    const matching = () => (tables[table] ?? []).filter((row) => filters.every((keep) => keep(row)));
    const settle = (data: unknown) => (failure ? { data: null, error: failure } : { data, error: null });

    /** What a write returns when `.select()` follows it: the rows as they would then stand. */
    const written = (): Row[] => {
      if (write?.kind === 'insert' || write?.kind === 'upsert') return [write.payload as Row];
      if (write?.kind === 'update') return matching().map((row) => ({ ...row, ...write?.payload }));
      return matching();
    };
    const rowsNow = (): Row[] => (write ? written() : matching());

    const self = {
      select(columns: string) {
        calls.push({ from: table, select: columns });
        return self;
      },
      insert(payload: Row) {
        calls.push({ from: table, insert: payload });
        write = { kind: 'insert', payload };
        return self;
      },
      upsert(payload: Row) {
        calls.push({ from: table, upsert: payload });
        write = { kind: 'upsert', payload };
        // Persist, keyed on `id`: replace the row holding that key, append otherwise.
        if (!failure) {
          const rowsOfTable = (tables[table] ??= []);
          const index = rowsOfTable.findIndex((row) => row.id === payload.id);
          if (index >= 0) rowsOfTable[index] = { ...rowsOfTable[index], ...payload };
          else rowsOfTable.push(payload);
        }
        return self;
      },
      update(payload: Row) {
        calls.push({ from: table, update: payload });
        write = { kind: 'update', payload };
        return self;
      },
      delete() {
        calls.push({ from: table, delete: true });
        write = { kind: 'delete' };
        return self;
      },
      eq(column: string, value: unknown) {
        calls.push({ from: table, eq: [column, value] });
        filters.push((row) => row[column] === value);
        return self;
      },
      ilike(column: string, pattern: string) {
        calls.push({ from: table, ilike: [column, pattern] });
        filters.push((row) => likeToRegExp(pattern).test(String(row[column])));
        return self;
      },
      order(column: string, options: { ascending: boolean }) {
        calls.push({ from: table, order: [column, options] });
        return self;
      },
      limit(count: number) {
        calls.push({ from: table, limit: count });
        return self;
      },
      maybeSingle: () => Promise.resolve(settle(rowsNow()[0] ?? null)),
      single: () => {
        const row = rowsNow()[0];
        return Promise.resolve(failure || row ? settle(row) : { data: null, error: { message: 'No rows found' } });
      },
      /** Awaiting the builder itself resolves a list query or a write without `.select()`. */
      then<T>(resolve: (value: { data: unknown; error: unknown }) => T) {
        return Promise.resolve(settle(write ? null : rowsNow())).then(resolve);
      },
    };
    return self;
  }

  const fake: FakeSupabase = {
    calls,
    client: {
      from: (table: string) => builder(table),
      auth,
    },
    failWith: (message) => {
      failure = message === null ? null : { message };
    },
  };
  return fake;
}

/**
 * Points the app's client module at a double, or at `null` for the unconfigured state. Call it in
 * `beforeEach`; `vi.resetAllMocks()` there undoes it, so each test installs what it needs.
 */
export function installFakeSupabase(fake: FakeSupabase | null) {
  vi.spyOn(supabaseClient, 'getSupabaseClient').mockReturnValue(
    (fake?.client ?? null) as unknown as SupabaseClient | null,
  );
}
