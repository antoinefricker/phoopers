/**
 * Fails when the committed locale catalogue disagrees with the keys the source references.
 *
 * Extraction is run into a throwaway directory so the committed catalogue is never touched:
 * this reports, it does not repair. `git diff` cannot do this job — the pre-commit hook
 * regenerates and stages the catalogue, so by the time CI runs, a diff-based check always
 * sees a clean tree, and a brand-new namespace file is untracked and invisible to it.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resources } from '../src/i18n/resources';
import { type Catalogue, diffCatalogues, flattenCatalogue, formatDiff, isClean } from './i18nCatalogue';

const appRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const SOURCE_LOCALE = 'en';

function readCatalogue(localeDir: string): Catalogue {
  const catalogue: Catalogue = {};

  let entries: string[];
  try {
    entries = readdirSync(localeDir);
  } catch {
    return catalogue;
  }

  for (const entry of entries.filter((name) => name.endsWith('.json'))) {
    const namespace = entry.slice(0, -'.json'.length);
    catalogue[namespace] = flattenCatalogue(JSON.parse(readFileSync(join(localeDir, entry), 'utf8')));
  }

  return catalogue;
}

const scratch = mkdtempSync(join(tmpdir(), 'phoopers-i18n-'));

try {
  const config = join(scratch, 'i18next-parser.config.mjs');
  writeFileSync(
    config,
    `export default {
  locales: ['${SOURCE_LOCALE}'],
  defaultNamespace: 'common',
  input: ['${appRoot}/src/**/*.{ts,tsx}', '!${appRoot}/src/**/*.test.{ts,tsx}'],
  output: '${scratch}/$LOCALE/$NAMESPACE.json',
  keySeparator: '.',
  nsSeparator: ':',
  useKeysAsDefaultValue: false,
  sort: true,
  createOldCatalogs: false,
};
`,
  );

  execFileSync('pnpm', ['exec', 'i18next', '-c', config], { cwd: appRoot, stdio: 'pipe' });

  const diff = diffCatalogues(
    readCatalogue(join(scratch, SOURCE_LOCALE)),
    readCatalogue(join(appRoot, 'src/i18n/locales', SOURCE_LOCALE)),
    Object.keys(resources[SOURCE_LOCALE]),
  );

  console.log(formatDiff(diff));

  if (!isClean(diff)) {
    process.exitCode = 1;
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
