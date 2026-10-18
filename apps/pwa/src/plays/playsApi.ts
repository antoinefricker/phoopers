import type { SupabaseClient } from '@supabase/supabase-js';
import { extentOf, type Play, type PlayId } from '../engine';
import { getSupabaseClient } from '../supabase/client';
import type { PlaySummary } from '../types/PlaySummary';
import type { StoredPlay } from '../types/StoredPlay';
import { fromRow, PLAY_SCHEMA_VERSION, summaryFromRow, toRow, type PlayRow } from './serialize';

/** How many systems a list asks for. Pagination goes here once a library outgrows one page. */
export const LIST_LIMIT = 100;

/** The columns a list needs: everything but the document, which can be large. */
const SUMMARY_COLUMNS = 'id, owner_id, name, court, extent, is_public, schema_version, created_at, updated_at';

/**
 * Who may read or write what is decided by the database's Row Level Security policies, not here:
 * the queries below only say what they want.
 */
function client(): SupabaseClient {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('supabase-not-configured');
  return supabase;
}

/** Unwraps a Supabase result, turning its error into a thrown one. */
function unwrap<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

function searchPattern(search: string | undefined): string | null {
  const term = search?.trim();
  // `%`, `_` and the escape character are literal in what a coach types, so escape them.
  return term ? `%${term.replace(/[\\%_]/g, '\\$&')}%` : null;
}

/** The signed-in coach's own systems, newest first. */
export async function listMyPlays(search?: string): Promise<PlaySummary[]> {
  const supabase = client();
  const { data: session, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  const ownerId = session.session?.user.id;
  // Signed out, there is no "mine": asking anyway would return the public systems of others.
  if (!ownerId) return [];
  let query = supabase.from('plays').select(SUMMARY_COLUMNS).eq('owner_id', ownerId);
  const pattern = searchPattern(search);
  if (pattern) query = query.ilike('name', pattern);
  const rows = unwrap(await query.order('updated_at', { ascending: false }).limit(LIST_LIMIT));
  return (rows as unknown as PlayRow[]).map(summaryFromRow);
}

/** Every public system with its author's name, newest first. */
export async function listPublicPlays(search?: string): Promise<PlaySummary[]> {
  let query = client().from('plays').select(`${SUMMARY_COLUMNS}, profiles(display_name)`).eq('is_public', true);
  const pattern = searchPattern(search);
  if (pattern) query = query.ilike('name', pattern);
  const rows = unwrap(await query.order('updated_at', { ascending: false }).limit(LIST_LIMIT));
  return (rows as unknown as PlayRow[]).map(summaryFromRow);
}

/** One system, or `null` when it does not exist or the reader may not read it: the two look alike. */
export async function fetchPlay(id: PlayId): Promise<StoredPlay | null> {
  const row = unwrap(await client().from('plays').select('*').eq('id', id).maybeSingle());
  return row ? fromRow(row as PlayRow) : null;
}

export async function insertPlay(play: Play, options: { ownerId: string; isPublic: boolean }): Promise<StoredPlay> {
  const row = unwrap(await client().from('plays').insert(toRow(play, options)).select('*').single());
  return fromRow(row as PlayRow);
}

/** Rewrites the whole document and the columns copied out of it. Owner and visibility stay as they are. */
export async function updatePlay(play: Play): Promise<StoredPlay> {
  const row = unwrap(
    await client()
      .from('plays')
      .update({
        name: play.name,
        court: play.court,
        extent: extentOf(play),
        schema_version: PLAY_SCHEMA_VERSION,
        data: play,
      })
      .eq('id', play.id)
      .select('*')
      .single(),
  );
  return fromRow(row as PlayRow);
}

/**
 * The document is authoritative, so a rename rewrites `data->name` as well as the column: writing
 * the column alone would leave the two disagreeing until the next save from the editor put the
 * old name back. Read then write, since the row is only ever written by its owner.
 */
export async function renamePlay(id: PlayId, name: string): Promise<void> {
  const row = unwrap(await client().from('plays').select('data').eq('id', id).maybeSingle());
  if (!row) throw new Error('play-not-found');
  const data = (row as { data: Play }).data;
  unwrap(
    await client()
      .from('plays')
      .update({ name, data: { ...data, name } })
      .eq('id', id),
  );
}

export async function setPlayVisibility(id: PlayId, isPublic: boolean): Promise<void> {
  unwrap(await client().from('plays').update({ is_public: isPublic }).eq('id', id));
}

export async function deletePlay(id: PlayId): Promise<void> {
  unwrap(await client().from('plays').delete().eq('id', id));
}

/**
 * Whether there is still a signed-in session. Row Level Security hides a coach's own private rows
 * from an expired one, so "the row is not there" means nothing until this is true.
 */
export async function hasActiveSession(): Promise<boolean> {
  const { data, error } = await client().auth.getSession();
  return !error && data.session !== null;
}
