export default {
  locales: ['en', 'fr'],
  defaultNamespace: 'common',
  input: ['src/**/*.{ts,tsx}', '!src/**/*.test.{ts,tsx}'],
  output: 'src/i18n/locales/$LOCALE/$NAMESPACE.json',
  keySeparator: '.',
  nsSeparator: ':',
  useKeysAsDefaultValue: false,
  // Never delete a key on regeneration. The pre-commit hook re-runs this on every commit,
  // so a destructive parser would silently drop a mistyped key's existing translations
  // before anyone saw them. Keeping removed keys makes a typo show up as an orphan, which
  // `pnpm i18n:check` fails on; genuinely dead strings are deleted by hand, deliberately.
  keepRemoved: true,
  defaultValue: (locale: string, _namespace: string, _key: string, value: string) =>
    locale === 'en' ? value : '',
  sort: true,
  createOldCatalogs: false,
};
