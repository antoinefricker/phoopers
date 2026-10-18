import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../supabase/client';
import type { Profile } from '../types/Profile';

interface ProfileRow {
  id: string;
  display_name: string;
}

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

const fromRow = (row: ProfileRow): Profile => ({ id: row.id, displayName: row.display_name });

/** The coach's profile, or `null` while they have not yet chosen a name. */
export async function fetchProfile(userId: string): Promise<Profile | null> {
  const row = unwrap(await client().from('profiles').select('id, display_name').eq('id', userId).maybeSingle());
  return row ? fromRow(row as ProfileRow) : null;
}

/**
 * Sets the coach's display name, creating the profile when it is their first write. A system's
 * owner references the profile, so a coach cannot save anything until this has run once.
 */
export async function saveDisplayName(userId: string, displayName: string): Promise<Profile> {
  const row = unwrap(
    await client()
      .from('profiles')
      .upsert({ id: userId, display_name: displayName })
      .select('id, display_name')
      .single(),
  );
  return fromRow(row as ProfileRow);
}
