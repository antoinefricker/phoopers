import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    // `.superpowers` is the scratch workspace for superpowers plan execution: absent from a
    // fresh clone, but ESLint does not read .gitignore, so it needs its own entry to avoid
    // linting scratch files whenever the directory does exist.
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '.superpowers/**', 'apps/pwa/src/i18n/locales/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.config.{js,ts}', '**/vitest.setup.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
  eslintConfigPrettier,
);
