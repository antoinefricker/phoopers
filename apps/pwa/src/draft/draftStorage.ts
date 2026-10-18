import type { Play, PlayId } from '../engine';

/** Where a draft came from, so reopening it can tell whether it is a copy of a saved system. */
export interface DraftOrigin {
  /**
   * Which system this origin describes. A system keeps one identity everywhere, so an origin
   * naming another play id says nothing about the open one: it is then no origin at all.
   */
  playId: PlayId;
  ownerId: string;
  isPublic: boolean;
  /** `fingerprint` of the play as it was saved, to tell whether the draft has moved on since. */
  fingerprint: string;
}

/** The system being edited in this browser, kept across reloads until it is saved or discarded. */
export interface Draft {
  play: Play;
  origin: DraftOrigin | null;
}

export const DRAFT_KEY = 'phoopers.draft.v1';

/**
 * The JSON of a value with every object's keys sorted, so two equal plays serialize the same
 * whatever order their keys were inserted in. Mirrors JSON.stringify: `undefined` members are
 * dropped and an `undefined` array entry reads as null.
 */
function canonicalJson(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item) ?? 'null').join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const members: string[] = [];
    for (const key of Object.keys(record).sort()) {
      const member = canonicalJson(record[key]);
      if (member !== undefined) members.push(`${JSON.stringify(key)}:${member}`);
    }
    return `{${members.join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * A stable, cheap hash of the play's canonical JSON (cyrb53). Not cryptographic: it only has to
 * change when anything in the play changes, and it is only ever compared against another
 * fingerprint of the same shape.
 */
export function fingerprint(play: Play): string {
  const text = canonicalJson(play) ?? '';
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Enough of a play to be drawn and edited: an id, every branch an object, and the root branch
 * among them. Anything less reads as no draft, since the home screen cannot render it.
 */
function isPlayLike(value: unknown): value is Play {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.rootBranchId === 'string' &&
    Array.isArray(value.branches) &&
    value.branches.every(isObject) &&
    value.branches.some((branch) => branch.id === value.rootBranchId)
  );
}

function isDraft(value: unknown): value is Draft {
  return isObject(value) && isPlayLike(value.play) && (value.origin === null || isObject(value.origin));
}

/** The stored draft, or null when there is none, storage is unavailable, or the value is not one. */
export function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Keeps the draft for the next visit. A failing write is dropped: the in-memory play still works. */
export function writeDraft(draft: Draft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Storage is full, blocked, or unavailable; nothing else can be done here.
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Same as writeDraft: a storage failure must not break the editor.
  }
}

/**
 * The origin when it describes the given play, and null otherwise — the play was replaced by a
 * new system under the same provider, and where the previous one came from no longer applies.
 */
export const originOf = (play: Play, origin: DraftOrigin | null): DraftOrigin | null =>
  origin !== null && origin.playId === play.id ? origin : null;

/** Whether the draft holds changes that no stored copy has: never stored, or moved on since. */
export const isUnsaved = (draft: Draft): boolean => {
  const origin = originOf(draft.play, draft.origin);
  return origin === null || origin.fingerprint !== fingerprint(draft.play);
};
