import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Play } from '../engine';
import { hornsPlay } from '../samples/horns';
import { DRAFT_KEY, clearDraft, fingerprint, readDraft, writeDraft, type Draft } from './draftStorage';

const draft: Draft = {
  play: hornsPlay,
  origin: { ownerId: '11111111-1111-1111-8111-111111111111', isPublic: false, fingerprint: 'abc' },
};

/** The same content with every object's keys inserted in reverse order; arrays keep their order. */
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, child]) => [key, reverseKeys(child)]),
    );
  }
  return value;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('draftStorage', () => {
  it('gives back what was written', () => {
    writeDraft(draft);
    expect(readDraft()).toEqual(draft);
  });

  it('gives back a draft with no origin', () => {
    writeDraft({ play: hornsPlay, origin: null });
    expect(readDraft()).toEqual({ play: hornsPlay, origin: null });
  });

  it('reads as no draft when nothing has been written', () => {
    expect(readDraft()).toBeNull();
  });

  it('reads as no draft when the key holds something that is not JSON', () => {
    localStorage.setItem(DRAFT_KEY, '{oops');
    expect(readDraft()).toBeNull();
  });

  it('reads as no draft when the stored value is not a play', () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ play: { id: 'x' }, origin: null }));
    expect(readDraft()).toBeNull();
  });

  it('reads as no draft when the stored value is not an object at all', () => {
    localStorage.setItem(DRAFT_KEY, 'null');
    expect(readDraft()).toBeNull();
    localStorage.setItem(DRAFT_KEY, '42');
    expect(readDraft()).toBeNull();
  });

  it('reads as no draft when the play has no branches array', () => {
    const { branches: _branches, ...rest } = hornsPlay;
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ play: rest, origin: null }));
    expect(readDraft()).toBeNull();
  });

  it('reads as no draft when the branches array is empty', () => {
    const play = { ...hornsPlay, branches: [] };
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ play, origin: null }));
    expect(readDraft()).toBeNull();
  });

  it('reads as no draft when the branches array holds a null entry', () => {
    const play = { ...hornsPlay, branches: [null] };
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ play, origin: null }));
    expect(readDraft()).toBeNull();
  });

  it('reads as no draft when the root branch id names no branch', () => {
    const play = { ...hornsPlay, rootBranchId: 'missing' };
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ play, origin: null }));
    expect(readDraft()).toBeNull();
  });

  it('reads as no draft when a branch entry is not an object, even beside the root', () => {
    const play = { ...hornsPlay, branches: [null, ...hornsPlay.branches] };
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ play, origin: null }));
    expect(readDraft()).toBeNull();
  });

  it('reads as no draft when the origin is neither null nor an object', () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ play: hornsPlay, origin: 'mine' }));
    expect(readDraft()).toBeNull();
  });

  it('survives a play that cannot be serialized', () => {
    const circular: Record<string, unknown> = { ...hornsPlay };
    circular.self = circular;
    expect(() => writeDraft({ play: circular as unknown as Play, origin: null })).not.toThrow();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('survives storage being unavailable on write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    expect(() => writeDraft(draft)).not.toThrow();
  });

  it('survives storage being unavailable on read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(readDraft()).toBeNull();
  });

  it('survives storage being unavailable on clear', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(() => clearDraft()).not.toThrow();
  });

  it('clears the draft', () => {
    writeDraft(draft);
    clearDraft();
    expect(readDraft()).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});

describe('fingerprint', () => {
  it('is the same for an identical copy of the play', () => {
    expect(fingerprint(hornsPlay)).toBe(fingerprint(structuredClone(hornsPlay)));
  });

  it('is the same when the same content was built with keys in another order', () => {
    const reordered = reverseKeys(hornsPlay) as Play;
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(hornsPlay));
    expect(fingerprint(reordered)).toBe(fingerprint(hornsPlay));
  });

  it('changes the fingerprint when anything in the play changes', () => {
    const base = fingerprint(hornsPlay);

    const renamed: Play = { ...hornsPlay, name: `${hornsPlay.name} (copy)` };
    expect(fingerprint(renamed)).not.toBe(base);

    const moved = structuredClone(hornsPlay);
    const root = moved.branches.find((b) => b.id === moved.rootBranchId)!;
    const track = Object.values(root.tracks).find((keys) => keys.length > 0)!;
    const first = track[0]!;
    const x = first.position?.x ?? 0;
    const y = first.position?.y ?? 0;
    track[0] = { ...first, position: { x: x + 0.5, y } };
    expect(fingerprint(moved)).not.toBe(base);
  });
});
