/**
 * Compares the translation keys a source tree actually references against the keys the
 * committed locale catalogue holds.
 *
 * This exists because the compiler cannot do it. The `t('key', 'English default')` form
 * this project mandates accepts any key by design — supplying a default tells i18next the
 * key need not exist — so a typo is invisible to `tsc`. Regenerating the catalogue is not
 * a guard either: it happily drops the old key, destroying its translations.
 */

/** A namespace's keys, flattened to dotted paths: `{ common: { 'app.title': 'Phoopers' } }`. */
export type Catalogue = Record<string, Record<string, string>>;

export interface CatalogueDiff {
  /** `ns:key` referenced in source but absent from the committed catalogue. */
  missing: string[];
  /** `ns:key` in the committed catalogue with no reference left in source — how a typo shows. */
  orphaned: string[];
  /** Namespaces in the catalogue that the resource map never imports, so they never load. */
  unimported: string[];
}

/** Flattens nested namespace JSON (`{ app: { title } }`) into dotted keys (`app.title`). */
export function flattenCatalogue(nested: unknown, prefix = ''): Record<string, string> {
  if (nested === null || typeof nested !== 'object') {
    return {};
  }

  const flat: Record<string, string> = {};

  for (const [key, value] of Object.entries(nested as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (value !== null && typeof value === 'object') {
      Object.assign(flat, flattenCatalogue(value, path));
    } else {
      flat[path] = String(value);
    }
  }

  return flat;
}

function qualify(namespace: string, key: string): string {
  return `${namespace}:${key}`;
}

/**
 * @param source    keys extracted fresh from the source tree — the truth
 * @param committed keys in the catalogue files under version control
 * @param importedNamespaces namespaces the resource map actually loads
 */
export function diffCatalogues(
  source: Catalogue,
  committed: Catalogue,
  importedNamespaces: readonly string[],
): CatalogueDiff {
  const missing: string[] = [];
  const orphaned: string[] = [];

  for (const [namespace, keys] of Object.entries(source)) {
    const committedKeys = committed[namespace] ?? {};

    for (const key of Object.keys(keys)) {
      if (!(key in committedKeys)) {
        missing.push(qualify(namespace, key));
      }
    }
  }

  for (const [namespace, keys] of Object.entries(committed)) {
    const sourceKeys = source[namespace] ?? {};

    for (const key of Object.keys(keys)) {
      if (!(key in sourceKeys)) {
        orphaned.push(qualify(namespace, key));
      }
    }
  }

  const unimported = [...new Set([...Object.keys(source), ...Object.keys(committed)])].filter(
    (namespace) => !importedNamespaces.includes(namespace),
  );

  return {
    missing: missing.sort(),
    orphaned: orphaned.sort(),
    unimported: unimported.sort(),
  };
}

export function isClean(diff: CatalogueDiff): boolean {
  return diff.missing.length === 0 && diff.orphaned.length === 0 && diff.unimported.length === 0;
}

export function formatDiff(diff: CatalogueDiff): string {
  if (isClean(diff)) {
    return 'i18n catalogue is up to date.';
  }

  const lines: string[] = ['i18n catalogue is out of date.', ''];

  if (diff.missing.length > 0) {
    lines.push('Referenced in source but missing from the catalogue:');
    lines.push(...diff.missing.map((key) => `  + ${key}`));
    lines.push('  Run: pnpm --filter @phoopers/pwa extract:i18n, then translate and commit.');
    lines.push('');
  }

  if (diff.orphaned.length > 0) {
    lines.push('In the catalogue but no longer referenced in source (often a typo):');
    lines.push(...diff.orphaned.map((key) => `  - ${key}`));
    lines.push('  Check the key spelling. If the string is genuinely gone, delete it by hand');
    lines.push('  so its translations are removed deliberately, not silently.');
    lines.push('');
  }

  if (diff.unimported.length > 0) {
    lines.push('Namespaces the resource map never imports, so they never load:');
    lines.push(...diff.unimported.map((namespace) => `  ? ${namespace}`));
    lines.push('  Add them to apps/pwa/src/i18n/resources.ts.');
    lines.push('');
  }

  return lines.join('\n');
}
