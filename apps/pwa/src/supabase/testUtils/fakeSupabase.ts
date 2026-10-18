import type { SupabaseClient } from '@supabase/supabase-js';
import { vi } from 'vitest';
import * as supabaseClient from '../client';
import type { PlayRow } from '../../plays/serialize';

type Row = Record<string, unknown>;

/** One call made against the double. Every entry names the table it was made on. */
export type RecordedCall = { from: string } & Record<string, unknown>;

export interface FakeSupabase {
  /** What the double was asked, in order. Assert on it with `toContainEqual`. */
  calls: RecordedCall[];
  /** The object to hand out as the Supabase client. */
  client: { from: (table: string) => unknown; auth: Record<string, unknown> };
  /** Makes every terminal call resolve with this error instead of data. */
  failWith: (message: string) => void;
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
 * `auth` holds only what a test has needed so far; more surfaces and tables are added alongside it.
 */
export function fakeSupabaseClient(
  rows: PlayRow[],
  options: { userId?: string | null; extraTables?: Record<string, Row[]> } = {},
) {
  const { userId = null, extraTables = {} } = options;
  const tables: Record<string, Row[]> = { plays: [...rows] as unknown as Row[], ...extraTables };
  const calls: RecordedCall[] = [];
  let failure: { message: string } | null = null;

  function builder(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    let write: { kind: 'insert' | 'update' | 'delete'; payload?: Row } | null = null;

    const matching = () => (tables[table] ?? []).filter((row) => filters.every((keep) => keep(row)));
    const settle = (data: unknown) => (failure ? { data: null, error: failure } : { data, error: null });

    /** What a write returns when `.select()` follows it: the rows as they would then stand. */
    const written = (): Row[] => {
      if (write?.kind === 'insert') return [write.payload as Row];
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
      // The auth surface grows with the tests that need it: today only the session's user.
      auth: {
        getSession: () =>
          Promise.resolve({
            data: { session: userId ? { user: { id: userId } } : null },
            error: null,
          }),
      },
    },
    failWith: (message) => {
      failure = { message };
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
