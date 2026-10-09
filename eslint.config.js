import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import importX from 'eslint-plugin-import-x';
import i18next from 'eslint-plugin-i18next';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  // `.superpowers` is the scratch workspace for superpowers plan execution: absent from a
  // fresh clone, but ESLint does not read .gitignore, so it needs its own entry to avoid
  // linting scratch files whenever the directory does exist.
  globalIgnores([
    '**/dist/**',
    '**/coverage/**',
    '**/node_modules/**',
    '.superpowers/**',
    'apps/pwa/src/i18n/locales/**',
  ]),

  // Baseline for every TypeScript file in the workspace.
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    rules: {
      curly: ['error', 'all'],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // Application code: React, accessibility, imports and translated copy.
  {
    files: ['apps/pwa/src/**/*.{ts,tsx}'],
    extends: [
      react.configs.flat.recommended,
      react.configs.flat['jsx-runtime'],
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
      importX.flatConfigs.recommended,
      importX.flatConfigs.typescript,
      i18next.configs['flat/recommended'],
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      react: { version: 'detect' },
      'import-x/resolver': {
        typescript: { project: './apps/pwa/tsconfig.json' },
      },
    },
    rules: {
      // Catch hard-coded user-facing strings in JSX, which AGENTS.md forbids. `jsx-only`
      // scans JSX text and attribute literals; the attribute list is opt-in (only props
      // that carry copy) and the callee list excludes call sites whose string arguments
      // are keys or identifiers rather than copy.
      'i18next/no-literal-string': [
        'error',
        {
          mode: 'jsx-only',
          'jsx-attributes': {
            include: [
              'label',
              'placeholder',
              'title',
              'aria-label',
              'tooltip',
              'description',
              'message',
              'nothingFoundMessage',
            ],
          },
          callees: {
            exclude: [
              'i18n(ext)?',
              't',
              'require',
              'addEventListener',
              'removeEventListener',
              'postMessage',
              'getElementById',
              'dispatch',
              'commit',
              'includes',
              'indexOf',
              'endsWith',
              'startsWith',
              'form\\.\\w+',
              'navigate',
              'set[A-Z]\\w*',
              'queryClient\\.\\w+',
            ],
          },
        },
      ],
    },
  },

  // The i18n module and domain types reference locale keys as string literals, and tests
  // assert on literal copy.
  {
    files: [
      'apps/pwa/src/i18n/**/*.{ts,tsx}',
      'apps/pwa/src/types/**/*.ts',
      'apps/pwa/src/**/*.test.{ts,tsx}',
      'apps/pwa/src/**/__fixtures__/**/*.{ts,tsx}',
    ],
    rules: {
      'i18next/no-literal-string': 'off',
    },
  },

  // i18next's default export is also published as a named one, and its chainable `use`
  // looks like a misused named member to import-x. Both reports are false here: the
  // default import is the documented API.
  {
    files: ['apps/pwa/src/i18n/i18n.ts'],
    rules: {
      'import-x/no-named-as-default': 'off',
      'import-x/no-named-as-default-member': 'off',
    },
  },

  // The engine is rendering-independent (spec 001) and carries no user-facing copy.
  {
    files: ['apps/pwa/src/engine/**/*.{ts,tsx}'],
    rules: {
      'i18next/no-literal-string': 'off',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react-dom/*', '@mantine/*', 'react-i18next'],
              message: 'The engine is rendering-independent (spec 001): no framework imports.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'The engine must not touch the DOM (spec 001).' },
        { name: 'document', message: 'The engine must not touch the DOM (spec 001).' },
      ],
    },
  },

  // Config files and test setup run in Node.
  {
    files: ['**/*.config.{js,ts}', '**/vitest.setup.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },

  eslintConfigPrettier,
]);
