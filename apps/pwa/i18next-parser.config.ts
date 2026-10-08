export default {
  locales: ['en', 'fr'],
  defaultNamespace: 'common',
  input: ['src/**/*.{ts,tsx}'],
  output: 'src/i18n/locales/$LOCALE/$NAMESPACE.json',
  keySeparator: '.',
  nsSeparator: '.',
  useKeysAsDefaultValue: false,
  defaultValue: (locale: string, _namespace: string, _key: string, value: string) =>
    locale === 'en' ? value : '',
  sort: true,
  createOldCatalogs: false,
};
