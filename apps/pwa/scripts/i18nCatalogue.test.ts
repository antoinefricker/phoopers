import { describe, expect, it } from 'vitest';
import { diffCatalogues, flattenCatalogue, formatDiff, isClean } from './i18nCatalogue';

describe('flattenCatalogue', () => {
  it('flattens nested namespace JSON into dotted keys', () => {
    expect(flattenCatalogue({ app: { title: 'Phoopers', tagline: '' } })).toEqual({
      'app.title': 'Phoopers',
      'app.tagline': '',
    });
  });
});

describe('diffCatalogues', () => {
  const imported = ['common'];

  it('reports no problems when source and catalogue agree', () => {
    const cat = { common: { 'app.title': 'Phoopers' } };

    expect(isClean(diffCatalogues(cat, cat, imported))).toBe(true);
  });

  it('reports a key referenced in source but absent from the catalogue', () => {
    const diff = diffCatalogues(
      { common: { 'app.title': 'Phoopers', 'app.subtitle': 'New' } },
      { common: { 'app.title': 'Phoopers' } },
      imported,
    );

    expect(diff.missing).toEqual(['common:app.subtitle']);
    expect(isClean(diff)).toBe(false);
  });

  it('reports a catalogue key no longer referenced in source, which is how a typo surfaces', () => {
    // Source now says t('app.taglin', …) — the old key is orphaned and its French
    // translation would be silently destroyed by a plain regenerate-and-stage.
    const diff = diffCatalogues(
      { common: { 'app.taglin': 'Design and replay basketball plays' } },
      { common: { 'app.tagline': 'Design and replay basketball plays' } },
      imported,
    );

    expect(diff.orphaned).toEqual(['common:app.tagline']);
    expect(diff.missing).toEqual(['common:app.taglin']);
    expect(isClean(diff)).toBe(false);
  });

  it('reports a namespace the resource map never imports', () => {
    const cat = { common: { 'app.title': 'Phoopers' }, plays: { 'editor.title': 'Editor' } };
    const diff = diffCatalogues(cat, cat, imported);

    expect(diff.unimported).toEqual(['plays']);
    expect(isClean(diff)).toBe(false);
  });

  it('names every problem in the formatted report', () => {
    const report = formatDiff(
      diffCatalogues(
        { common: { 'app.taglin': 'x' }, plays: { 'editor.title': 'Editor' } },
        { common: { 'app.tagline': 'x' } },
        imported,
      ),
    );

    expect(report).toContain('common:app.taglin');
    expect(report).toContain('common:app.tagline');
    expect(report).toContain('plays');
  });
});
