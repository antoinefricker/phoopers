import { describe, expect, it } from 'vitest';
import type { Play, PlayId } from '../engine';
import { hornsPlay } from '../samples/horns';
import { fromRow, PLAY_SCHEMA_VERSION, summaryFromRow, toRow, type PlayRow } from './serialize';

const TIMESTAMP = '2026-10-18T10:00:00Z';

/** A row as the database returns it: what toRow wrote, plus the timestamps the database sets. */
const readRow = (play: Play, options: { ownerId: string; isPublic: boolean }): PlayRow => ({
  ...toRow(play, options),
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP,
});

const halfCourtPlay: Play = { ...hornsPlay, id: 'half-court' as PlayId, extent: 'half' };

describe('toRow', () => {
  it('copies the list fields out of the document', () => {
    const row = toRow(halfCourtPlay, { ownerId: 'owner-1', isPublic: true });
    expect(row).toMatchObject({
      id: halfCourtPlay.id,
      name: halfCourtPlay.name,
      court: 'fiba',
      extent: 'half',
      is_public: true,
      owner_id: 'owner-1',
      schema_version: PLAY_SCHEMA_VERSION,
      data: halfCourtPlay,
    });
  });

  it('defaults the extent column to full when the document does not say', () => {
    const row = toRow(hornsPlay, { ownerId: 'owner-1', isPublic: false });
    expect(row.extent).toBe('full');
  });
});

describe('fromRow', () => {
  it('round-trips a play through a row unchanged', () => {
    expect(fromRow(readRow(hornsPlay, { ownerId: 'o', isPublic: false })).play).toEqual(hornsPlay);
  });

  it('takes the document as authoritative when a column disagrees with it', () => {
    const row = { ...readRow(hornsPlay, { ownerId: 'o', isPublic: false }), name: 'stale' };
    expect(fromRow(row).play.name).toBe(hornsPlay.name);
  });

  it('reads a document whose schema version it does not know', () => {
    const row = readRow(hornsPlay, { ownerId: 'o', isPublic: false });
    expect(fromRow({ ...row, schema_version: 99 }).play).toEqual(hornsPlay);
  });
});

describe('summaryFromRow', () => {
  it('builds a summary from the columns, without reading the document', () => {
    const { data: _document, ...columns } = readRow(halfCourtPlay, {
      ownerId: 'owner-1',
      isPublic: true,
    });
    expect(
      summaryFromRow({
        ...columns,
        profiles: { display_name: 'Antoine' },
      }),
    ).toEqual({
      id: halfCourtPlay.id,
      name: halfCourtPlay.name,
      court: 'fiba',
      extent: 'half',
      isPublic: true,
      updatedAt: TIMESTAMP,
      ownerId: 'owner-1',
      authorName: 'Antoine',
    });
  });
});
