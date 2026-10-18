import { extentOf, type CourtExtent, type Play, type PlayId } from '../engine';
import type { PlaySummary } from '../types/PlaySummary';
import type { StoredPlay } from '../types/StoredPlay';

/** The version written into every new row. Rows written under another version are read as they are. */
export const PLAY_SCHEMA_VERSION = 1;

/**
 * One row of the `plays` table as it is read back, in its column names. The timestamps are set
 * by the database and always present on a row that came from it.
 */
export interface PlayRow {
  id: string;
  owner_id: string;
  name: string;
  court: Play['court'];
  extent: CourtExtent;
  is_public: boolean;
  schema_version: number;
  data: Play;
  created_at: string;
  updated_at: string;
}

/**
 * The row as it is written: a `PlayRow` without the timestamps, which the database sets on
 * insert and update. This is the shape Supabase's `.insert` and `.upsert` take.
 */
export type PlayInsert = Omit<PlayRow, 'created_at' | 'updated_at'>;

/**
 * Builds the row that stores a play. The list columns are copied out of the document so the
 * database can filter and sort on them; the document itself is what gets read back.
 */
export function toRow(play: Play, options: { ownerId: string; isPublic: boolean }): PlayInsert {
  return {
    id: play.id,
    owner_id: options.ownerId,
    name: play.name,
    court: play.court,
    extent: extentOf(play),
    is_public: options.isPublic,
    schema_version: PLAY_SCHEMA_VERSION,
    data: play,
  };
}

/**
 * Reads a row back into a play. The document is authoritative: where a column disagrees with it,
 * the document wins. The document is not validated here, so a malformed one still opens and the
 * editor's issue panel reports it.
 */
export function fromRow(row: PlayRow): StoredPlay {
  return {
    id: row.data.id,
    ownerId: row.owner_id,
    isPublic: row.is_public,
    updatedAt: row.updated_at,
    play: row.data,
  };
}

/** Builds a list entry from a row's columns, with the author's display name when it was joined in. */
export function summaryFromRow(
  row: Omit<PlayRow, 'data'> & { profiles?: { display_name: string } | null },
): PlaySummary {
  return {
    id: row.id as PlayId,
    name: row.name,
    court: row.court,
    extent: row.extent,
    isPublic: row.is_public,
    updatedAt: row.updated_at,
    ownerId: row.owner_id,
    ...(row.profiles ? { authorName: row.profiles.display_name } : {}),
  };
}
