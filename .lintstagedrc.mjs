export default {
  '*.{ts,tsx,js,jsx}': ['eslint --fix', 'prettier --write'],
  '*.{json,md,yml,yaml}': ['prettier --write'],
  // Function form: lint-staged appends staged filenames to string commands, which would
  // feed them to `extract:i18n` as arguments. Extraction reads the whole app regardless,
  // so this entry ignores the file list and re-stages whatever the parser rewrote.
  'apps/pwa/src/**/*.{ts,tsx}': () => [
    'pnpm --filter @phoopers/pwa extract:i18n',
    'git add apps/pwa/src/i18n/locales',
  ],
};
