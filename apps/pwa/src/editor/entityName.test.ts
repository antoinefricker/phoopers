import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { entityName } from './entityName';

// The real `t` is exercised through the views; here it is stubbed so the cases are about the
// choice entityName makes, not about the catalogue's wording.
const t = ((key: string, _fallback: string, vars?: Record<string, string>) =>
  `${key}:${vars?.number ?? ''}`) as unknown as TFunction;

describe('entityName', () => {
  it('uses the coach own name when they have given one', () => {
    expect(entityName({ team: 'offense', number: '1', label: 'Pivot' }, t)).toBe('Pivot');
  });

  it('falls back to the side and the number when they have not', () => {
    // Both teams number 1..5 on their own, so the side has to be in it: a bare "2" named two
    // different players.
    expect(entityName({ team: 'offense', number: '2' }, t)).toBe('play.editor.offenseRow:2');
    expect(entityName({ team: 'defense', number: '2' }, t)).toBe('play.editor.defenseRow:2');
  });

  it('treats an empty name as no name', () => {
    expect(entityName({ team: 'offense', number: '1', label: '' }, t)).toBe('play.editor.offenseRow:1');
  });

  it('treats a name of nothing but spaces as no name', () => {
    // Trusted, it would leave a row visibly blank with nothing to read and nothing to say.
    expect(entityName({ team: 'defense', number: '3', label: '   ' }, t)).toBe('play.editor.defenseRow:3');
  });

  it('trims a name the coach padded', () => {
    expect(entityName({ team: 'offense', number: '1', label: '  Meneur ' }, t)).toBe('Meneur');
  });

  it('names the ball outright, it having no number and no side', () => {
    expect(entityName({ team: 'ball', number: '' }, t)).toBe('play.editor.ballRow:');
  });

  it('lets the coach name the ball too', () => {
    expect(entityName({ team: 'ball', number: '', label: 'Le ballon' }, t)).toBe('Le ballon');
  });
});
