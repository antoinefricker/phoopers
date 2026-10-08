# CI Initialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the repository foundation — a pnpm workspace, shared tooling, a minimal `apps/pwa` skeleton, git hooks, and a GitHub Actions pipeline — so that `lint`, `typecheck`, `test` and `build` run green locally and on every push/PR.

**Architecture:** A pnpm workspace whose root owns all shared tooling (TypeScript base config, ESLint flat config, Prettier, Husky, lint-staged) and whose only member today is `apps/pwa` (`@phoopers/pwa`), a Vite + React 19 + TypeScript app wired with Mantine and `react-i18next`. Root scripts fan out with `pnpm -r`, so a future `apps/api` is picked up without touching the workflow. CI is a single sequential job on `ubuntu-latest`.

**Tech Stack:** pnpm 10 · Node 24 · TypeScript 6 · Vite 8 · React 19 · Mantine 9 · Vitest 5 + Testing Library · ESLint 10 (flat config) + Prettier 3 · Husky 9 + lint-staged 17 · i18next 26 / react-i18next 17 · GitHub Actions

**Spec:** [documentation/roadmap.md](../roadmap.md) — see *Recommended architecture & stack* (Tooling, Testing) and *Phase 1*. The design agreed in brainstorming is reproduced in [Design Summary](#design-summary) below; this plan has no separate spec file.

---

## Global Constraints

- **Package manager:** pnpm, pinned via `"packageManager": "pnpm@10.8.0"` in the root `package.json`. Never run `npm install` or `yarn` in this repo.
- **Node:** `24` — recorded in `.nvmrc` and read by CI via `node-version-file`. Local and CI must not drift.
- **TypeScript:** `^6.0.3`. **Do not upgrade to TypeScript 7.** `typescript-eslint@8.71.1` declares `peerDependencies.typescript: ">=4.8.4 <6.1.0"`; TypeScript 7 breaks linting repo-wide. Revisit only when typescript-eslint ships TS 7 support.
- **Workspace members:** `apps/*` only. The root `package.json` is `"private": true` and publishes nothing.
- **Every user-facing string** in `apps/pwa/src/` goes through `t('<namespace>.<key>', 'English default')` — see `AGENTS.md` → *I18n (PWA)*. No hard-coded strings in JSX or component props.
- **Locales:** `en` (source of truth) and `fr`. Locale JSON deltas are committed in the same commit as the source change.
- **Commits:** conventional commits, no co-author lines. One commit per top-level task in this plan.
- **Out of scope for this plan:** Playwright, Supertest, `vite-plugin-pwa`, TanStack Query, deploy/release workflows, Dependabot, Makefile.

## Review Focus

Failure modes the design implies that no single task's happy path exercises. Each line has its test placed in the owning task.

1. **Missing French translation renders blank.** `i18next-parser` writes `""` into `fr/*.json` for new keys. Without a fallback to `en`, a French user sees an empty button. → pinned by a test in Task 4.
2. **Unknown translation key must fail at compile time.** `i18next.d.ts` module augmentation is what makes a typo a build error rather than a key string leaking to the UI. → pinned by a `tsc` check in Task 4.
3. **Lockfile drift breaks CI, not the laptop.** `pnpm install --frozen-lockfile` fails when `pnpm-lock.yaml` is stale; a contributor who edits `package.json` without committing the lockfile gets a red run with an opaque message. → verified in Task 6.
4. **Node version drift between `.nvmrc` and the workflow.** A hard-coded `node-version:` in CI silently diverges from `.nvmrc`. → prevented by `node-version-file` and verified in Task 6.
5. **lint-staged re-staging loop on locale JSON.** The i18n hook regenerates locale files and `git add`s them; if the glob also matches the generated JSON, the hook can rewrite files it just staged. → verified in Task 5.

---

## Design Summary

```
package.json              # private root: packageManager, scripts, shared devDeps
pnpm-workspace.yaml       # packages: apps/*
.nvmrc                    # 24
tsconfig.base.json        # strict compiler options, extended by each workspace
eslint.config.js          # flat config, covers every workspace
.prettierrc               # formatting rules
.prettierignore
.husky/pre-commit         # -> pnpm exec lint-staged
.github/workflows/ci.yml  # single sequential `ci` job
README.md                 # setup + script reference
apps/pwa/                 # @phoopers/pwa
  package.json
  tsconfig.json
  vite.config.ts          # includes the Vitest `test` block
  index.html
  i18next-parser.config.ts
  src/
    main.tsx              # MantineProvider + i18n bootstrap
    App.tsx
    App.test.tsx
    vitest.setup.ts
    i18n/
      i18n.ts             # SUPPORTED_LOCALES, init
      resources.ts        # imports locale JSON
      i18next.d.ts        # module augmentation -> typed t()
      i18n.test.tsx
      locales/{en,fr}/common.json
```

**File responsibilities:** the root carries configuration shared by every present and future workspace; `apps/pwa` carries only app code. Inside the app, `src/i18n/` is a self-contained unit — `i18n.ts` owns initialization, `resources.ts` owns the resource map, `i18next.d.ts` owns the types — so a consumer imports `./i18n/i18n` and nothing else.

---

### Task 1: pnpm workspace and root tooling

Establishes the workspace, the pinned toolchain, Prettier, and the root script surface. Deliverable: `pnpm install` succeeds and `pnpm format:check` passes on the repo's own files.

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.nvmrc`
- Create: `tsconfig.base.json`
- Create: `.prettierrc`
- Create: `.prettierignore`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: root scripts `lint`, `lint:fix`, `format`, `format:check`, `typecheck`, `test`, `build`, `prepare`. Later tasks add workspace scripts that these fan out to via `pnpm -r`. `tsconfig.base.json` is extended by `apps/pwa/tsconfig.json`.

- [ ] **Step 1: Create the workspace manifest**

`pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
```

- [ ] **Step 2: Create the root `package.json`**

Scripts delegate with `pnpm -r` so new workspaces are picked up automatically. `--if-present` keeps the root green when a workspace legitimately has no such script.

```json
{
  "name": "phoopers",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.8.0",
  "engines": {
    "node": ">=24"
  },
  "scripts": {
    "lint": "eslint . && prettier --check .",
    "lint:fix": "eslint . --fix && prettier --write .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "pnpm -r --if-present typecheck",
    "test": "pnpm -r --if-present test",
    "build": "pnpm -r --if-present build",
    "prepare": "husky"
  },
  "devDependencies": {
    "prettier": "^3.9.9",
    "typescript": "^6.0.3"
  }
}
```

- [ ] **Step 3: Pin the Node version**

`.nvmrc` — a single line, no `v` prefix, so `actions/setup-node`'s `node-version-file` reads it directly:

```
24
```

- [ ] **Step 4: Create the shared TypeScript base config**

`tsconfig.base.json`. `strict` plus the extra safety flags; no `include`/`exclude` here — each workspace sets its own.

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noEmit": true
  }
}
```

- [ ] **Step 5: Configure Prettier**

`.prettierrc`:

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "endOfLine": "lf"
}
```

`.prettierignore` — generated and vendored output, plus locale JSON, which `i18next-parser` owns and formats itself:

```
node_modules
dist
coverage
pnpm-lock.yaml
apps/pwa/src/i18n/locales
```

- [ ] **Step 6: Install and verify**

Run:

```bash
pnpm install
```

Expected: resolves and writes `pnpm-lock.yaml`. No workspace packages yet, so only root devDependencies install. `prepare` runs `husky` and fails because Husky is not installed yet — that is expected at this step and fixed in Task 5. If the failure blocks the install, temporarily run `pnpm install --ignore-scripts` and note it; Task 5 removes the condition.

Then run:

```bash
pnpm format:check
```

Expected: PASS — "All matched files use Prettier code style!"

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml .nvmrc tsconfig.base.json .prettierrc .prettierignore
git commit -m "chore: set up pnpm workspace with shared TypeScript and Prettier config"
```

---

### Task 2: ESLint flat configuration

Deliverable: `pnpm lint` runs ESLint across the repo and reports zero errors, with `react-hooks` rules active — `AGENTS.md` relies on `react-hooks/set-state-in-effect` being enforced.

**Files:**
- Create: `eslint.config.js`
- Modify: `package.json` (add ESLint devDependencies)

**Interfaces:**
- Consumes: root `package.json` scripts from Task 1.
- Produces: a working `pnpm lint`. Task 5's lint-staged entry invokes `eslint --fix`; Task 6's CI step invokes `pnpm lint`.

- [ ] **Step 1: Install the ESLint toolchain**

`eslint-config-prettier` must be installed so it can be placed last and switch off every stylistic rule that would fight Prettier.

```bash
pnpm add -Dw eslint@^10.12.0 typescript-eslint@^8.71.1 eslint-plugin-react-hooks@^7.1.1 eslint-config-prettier@^10.1.8 globals@^16.5.0
```

- [ ] **Step 2: Write the flat config**

`eslint.config.js`. Order matters: `eslintConfigPrettier` is last.

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', 'apps/pwa/src/i18n/locales/**'],
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
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
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
```

- [ ] **Step 3: Verify ESLint runs clean**

Run:

```bash
pnpm lint
```

Expected: PASS — no output from `eslint` and "All matched files use Prettier code style!" from Prettier. There is no source code yet; this confirms the config itself parses and the plugin graph resolves.

- [ ] **Step 4: Verify the config actually catches a violation**

Prove the linter is wired rather than silently matching nothing. Create a scratch file:

```bash
cat > lint-probe.ts <<'EOF'
const unused: number = 1;
EOF
pnpm exec eslint lint-probe.ts
```

Expected: FAIL — `'unused' is assigned a value but never used  @typescript-eslint/no-unused-vars`.

Then remove it:

```bash
rm lint-probe.ts
```

- [ ] **Step 5: Commit**

```bash
git add eslint.config.js package.json pnpm-lock.yaml
git commit -m "chore: add ESLint flat config with react-hooks and prettier integration"
```

---

### Task 3: apps/pwa skeleton with Mantine and a smoke test

Deliverable: a React 19 + Vite app rendering a Mantine-wrapped `App`, with a passing component test. Written test-first.

**Files:**
- Create: `apps/pwa/package.json`
- Create: `apps/pwa/tsconfig.json`
- Create: `apps/pwa/vite.config.ts`
- Create: `apps/pwa/index.html`
- Create: `apps/pwa/src/main.tsx`
- Create: `apps/pwa/src/App.tsx`
- Create: `apps/pwa/src/vitest.setup.ts`
- Test: `apps/pwa/src/App.test.tsx`

**Interfaces:**
- Consumes: `tsconfig.base.json` (Task 1), `eslint.config.js` (Task 2).
- Produces: `App` — a default-exported zero-prop React component from `apps/pwa/src/App.tsx`. Task 4 modifies `App` to render a translated title and imports `./i18n/i18n` in `main.tsx`. Workspace scripts `dev`, `build`, `typecheck`, `test` become reachable from the root fan-out.

- [ ] **Step 1: Create the workspace package manifest**

`apps/pwa/package.json`:

```json
{
  "name": "@phoopers/pwa",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@mantine/core": "^9.7.1",
    "@mantine/hooks": "^9.7.1",
    "react": "^19.3.0",
    "react-dom": "^19.3.0"
  },
  "devDependencies": {
    "@testing-library/dom": "^10.4.1",
    "@testing-library/jest-dom": "^7.0.1",
    "@testing-library/react": "^16.3.3",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@vitejs/plugin-react": "^6.1.2",
    "jsdom": "^30.1.2",
    "vite": "^8.3.4",
    "vitest": "^5.0.3"
  }
}
```

- [ ] **Step 2: Install the app dependencies**

```bash
pnpm install
```

Expected: `apps/pwa` is recognised as a workspace member and its dependencies resolve.

- [ ] **Step 3: Create the app TypeScript config**

`apps/pwa/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "vite.config.ts", "i18next-parser.config.ts"]
}
```

- [ ] **Step 4: Create the Vite + Vitest config**

One config file owns both the build and the test environment, so they cannot drift.

`apps/pwa/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/vitest.setup.ts'],
    css: true,
  },
});
```

- [ ] **Step 5: Create the test setup file**

`apps/pwa/src/vitest.setup.ts`. Mantine components query `window.matchMedia`, which jsdom does not implement — stub it here or every Mantine render throws.

```ts
import '@testing-library/jest-dom/vitest';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
```

- [ ] **Step 6: Write the failing test**

`apps/pwa/src/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders the application heading', () => {
    render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Phoopers' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run:

```bash
pnpm --filter @phoopers/pwa test
```

Expected: FAIL — `Failed to resolve import "./App"`.

- [ ] **Step 8: Write the minimal implementation**

`apps/pwa/src/App.tsx`:

```tsx
import { Container, Title } from '@mantine/core';

export default function App() {
  return (
    <Container>
      <Title order={1}>Phoopers</Title>
    </Container>
  );
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run:

```bash
pnpm --filter @phoopers/pwa test
```

Expected: PASS — 1 passed.

- [ ] **Step 10: Create the entry point and HTML shell**

`apps/pwa/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Phoopers</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/pwa/src/main.tsx`. Mantine's stylesheet import is required — without it components render unstyled.

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import App from './App';
import '@mantine/core/styles.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(container).render(
  <StrictMode>
    <MantineProvider>
      <App />
    </MantineProvider>
  </StrictMode>,
);
```

- [ ] **Step 11: Verify the full gate passes**

Run:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Expected: all four PASS, and `apps/pwa/dist/` is produced.

- [ ] **Step 12: Ignore build output**

Confirm `dist` and `coverage` are covered by `.gitignore`; append them if the existing file does not already list them:

```bash
grep -qE '^dist$' .gitignore || printf '\n# Build output\ndist\ncoverage\n' >> .gitignore
```

- [ ] **Step 13: Commit**

```bash
git add apps/pwa package.json pnpm-lock.yaml .gitignore
git commit -m "feat: scaffold apps/pwa with Vite, React 19 and Mantine"
```

---

### Task 4: i18n wiring and the extraction pipeline

Deliverable: every visible string resolves through `t()`, unknown keys are compile errors, a missing French value falls back to English, and `extract:i18n` regenerates both locale files.

**Files:**
- Create: `apps/pwa/i18next-parser.config.ts`
- Create: `apps/pwa/src/i18n/i18n.ts`
- Create: `apps/pwa/src/i18n/resources.ts`
- Create: `apps/pwa/src/i18n/i18next.d.ts`
- Create: `apps/pwa/src/i18n/locales/en/common.json`
- Create: `apps/pwa/src/i18n/locales/fr/common.json`
- Test: `apps/pwa/src/i18n/i18n.test.tsx`
- Modify: `apps/pwa/src/App.tsx`
- Modify: `apps/pwa/src/App.test.tsx`
- Modify: `apps/pwa/src/main.tsx`
- Modify: `apps/pwa/src/vitest.setup.ts`
- Modify: `apps/pwa/package.json`

**Interfaces:**
- Consumes: `App` from Task 3.
- Produces: `SUPPORTED_LOCALES: readonly ['en', 'fr']` and a default-exported configured `i18n` instance from `src/i18n/i18n.ts`; `resources` from `src/i18n/resources.ts`; the `extract:i18n` script that Task 5's hook invokes.

- [ ] **Step 1: Install the i18n dependencies**

```bash
pnpm --filter @phoopers/pwa add i18next@^26.4.2 react-i18next@^17.0.16 i18next-browser-languagedetector@^8.2.1
pnpm --filter @phoopers/pwa add -D i18next-parser@^9.4.0
```

- [ ] **Step 2: Create the locale files**

`apps/pwa/src/i18n/locales/en/common.json` — English is the source of truth and carries both keys:

```json
{
  "app": {
    "title": "Phoopers",
    "tagline": "Design and replay basketball plays"
  }
}
```

`apps/pwa/src/i18n/locales/fr/common.json` — `title` is deliberately translated, `tagline` deliberately left empty. That asymmetry is what Step 7's tests exercise: a present French value must win, and an empty one must fall back to English rather than render blank (Review Focus #1). Leave `tagline` empty.

```json
{
  "app": {
    "title": "Phoopers — Tableau tactique",
    "tagline": ""
  }
}
```

- [ ] **Step 3: Create the resource map**

`apps/pwa/src/i18n/resources.ts`. Every namespace's JSON is imported here and nowhere else; adding a namespace means editing this one file.

```ts
import enCommon from './locales/en/common.json';
import frCommon from './locales/fr/common.json';

export const defaultNS = 'common';

export const resources = {
  en: { common: enCommon },
  fr: { common: frCommon },
} as const;
```

- [ ] **Step 4: Create the i18n initialization**

`apps/pwa/src/i18n/i18n.ts`. `fallbackLng: 'en'` plus `returnEmptyString: false` is what makes an untranslated French key fall back instead of rendering blank — see Review Focus #1.

```ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { defaultNS, resources } from './resources';

export const SUPPORTED_LOCALES = ['en', 'fr'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    defaultNS,
    ns: ['common'],
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LOCALES,
    returnEmptyString: false,
    interpolation: { escapeValue: false },
  });

export default i18n;
```

- [ ] **Step 5: Type `t()` against the English resources**

`apps/pwa/src/i18n/i18next.d.ts`. This is what turns an unknown key into a compile error — see Review Focus #2.

```ts
import type { defaultNS, resources } from './resources';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    resources: (typeof resources)['en'];
  }
}
```

- [ ] **Step 6: Add the extraction config and script**

`apps/pwa/i18next-parser.config.ts`:

```ts
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
```

Add the script to `apps/pwa/package.json`:

```json
"extract:i18n": "i18next -c i18next-parser.config.ts"
```

- [ ] **Step 7: Write the failing i18n tests**

`apps/pwa/src/i18n/i18n.test.tsx`. Covers Review Focus #1 explicitly.

```tsx
import { render, screen } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import { afterEach, describe, expect, it } from 'vitest';
import i18n, { SUPPORTED_LOCALES } from './i18n';

function Strings() {
  const { t } = useTranslation();
  return (
    <>
      <h1>{t('app.title', 'Phoopers')}</h1>
      <p>{t('app.tagline', 'Design and replay basketball plays')}</p>
    </>
  );
}

describe('i18n', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('supports English and French', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en', 'fr']);
  });

  it('uses the French value when the key is translated', async () => {
    await i18n.changeLanguage('fr');
    render(<Strings />);

    expect(screen.getByRole('heading', { name: 'Phoopers — Tableau tactique' })).toBeInTheDocument();
  });

  it('falls back to English rather than rendering an empty string', async () => {
    await i18n.changeLanguage('fr');
    render(<Strings />);

    // fr/common.json has "app.tagline": "" — returnEmptyString: false must make
    // i18next fall through to the English catalogue instead of rendering nothing.
    expect(screen.getByText('Design and replay basketball plays')).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run the tests to verify they fail**

Run:

```bash
pnpm --filter @phoopers/pwa test
```

Expected: FAIL — the i18n instance is not initialized in the test environment, so `t()` returns the key or the component throws.

- [ ] **Step 9: Initialize i18n in the test setup**

Append to `apps/pwa/src/vitest.setup.ts`:

```ts
import './i18n/i18n';
```

Place this import directly below the `@testing-library/jest-dom/vitest` import, above the `matchMedia` stub.

- [ ] **Step 10: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @phoopers/pwa test
```

Expected: PASS — 4 passed (the `App` test plus three i18n tests).

- [ ] **Step 11: Route the App heading through `t()`**

Replace `apps/pwa/src/App.tsx`:

```tsx
import { Container, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export default function App() {
  const { t } = useTranslation();

  return (
    <Container>
      <Title order={1}>{t('app.title', 'Phoopers')}</Title>
      <Text>{t('app.tagline', 'Design and replay basketball plays')}</Text>
    </Container>
  );
}
```

`App.test.tsx` already asserts on the rendered English text `'Phoopers'`, so it needs no change — but add a second assertion for the tagline so the new element is covered:

```tsx
expect(screen.getByText('Design and replay basketball plays')).toBeInTheDocument();
```

Insert that line directly after the existing `getByRole('heading', …)` assertion.

- [ ] **Step 12: Bootstrap i18n in the app entry point**

Add to `apps/pwa/src/main.tsx`, directly below the `import App from './App';` line:

```tsx
import './i18n/i18n';
```

- [ ] **Step 13: Verify extraction is idempotent**

Run:

```bash
pnpm --filter @phoopers/pwa extract:i18n
git diff --stat apps/pwa/src/i18n/locales
```

Expected: the command writes both locale files and `git diff` reports no changes — the committed JSON already matches what the parser generates. If it does report changes, the hand-written JSON was wrong: keep the generated version, and restore the French `app.title` value `"Phoopers — Tableau tactique"` by hand if the parser blanked it. Leave the French `app.tagline` empty; Step 7's fallback test depends on it.

- [ ] **Step 14: Verify unknown keys are a compile error (Review Focus #2)**

Temporarily add a bad key to `App.tsx`:

```tsx
<Text>{t('app.doesNotExist', 'nope')}</Text>
```

Run:

```bash
pnpm --filter @phoopers/pwa typecheck
```

Expected: FAIL — an error on the `'app.doesNotExist'` argument. Remove the line, then re-run and expect PASS.

- [ ] **Step 15: Verify the full gate passes**

Run:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Expected: all four PASS.

- [ ] **Step 16: Commit**

```bash
git add apps/pwa package.json pnpm-lock.yaml
git commit -m "feat: wire react-i18next with en/fr locales and extraction pipeline"
```

---

### Task 5: Husky and lint-staged

Deliverable: a `pre-commit` hook that lints, formats, and regenerates locale JSON for staged files.

**Files:**
- Create: `.husky/pre-commit`
- Create: `.lintstagedrc.json`
- Modify: `package.json` (add devDependencies)

**Interfaces:**
- Consumes: `pnpm lint` from Task 2, `extract:i18n` from Task 4, the root `prepare` script from Task 1.
- Produces: the pre-commit gate. Task 6 documents it in the README.

- [ ] **Step 1: Install and initialize Husky**

```bash
pnpm add -Dw husky@^9.1.7 lint-staged@^17.6.0
pnpm exec husky init
```

Expected: `.husky/` is created with a `pre-commit` file, and `prepare` is already present in `package.json` from Task 1.

- [ ] **Step 2: Write the pre-commit hook**

Overwrite `.husky/pre-commit` with exactly:

```sh
pnpm exec lint-staged
```

- [ ] **Step 3: Configure lint-staged**

`.lintstagedrc.json`. Note the second entry excludes the generated locale directory via the leading `!` glob, so the hook cannot rewrite files it just staged — Review Focus #5.

```json
{
  "*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write"],
  "*.{json,md,yml,yaml}": ["prettier --write"],
  "apps/pwa/src/**/*.{ts,tsx}": [
    "pnpm --filter @phoopers/pwa extract:i18n && git add apps/pwa/src/i18n/locales"
  ]
}
```

Add `apps/pwa/src/i18n/locales/**` to the `.prettierignore` entry already created in Task 1 — confirm it is present; the `*.{json,…}` rule above would otherwise reformat generated files.

- [ ] **Step 4: Verify the hook fires and fixes formatting**

Create a deliberately misformatted file:

```bash
cat > apps/pwa/src/hook-probe.ts <<'EOF'
export const probe =    "value"
EOF
git add apps/pwa/src/hook-probe.ts
git commit -m "test: hook probe"
```

Expected: the hook runs, Prettier rewrites the file to `export const probe = 'value';`, and the commit succeeds with the formatted content. Verify:

```bash
git show --stat HEAD && cat apps/pwa/src/hook-probe.ts
```

- [ ] **Step 5: Verify the hook blocks a lint error**

```bash
cat > apps/pwa/src/hook-probe.ts <<'EOF'
const unusedProbe: number = 1;
export const probe = 'value';
EOF
git add apps/pwa/src/hook-probe.ts
git commit -m "test: hook probe should fail"
```

Expected: FAIL — the commit is rejected with `'unusedProbe' is assigned a value but never used`.

- [ ] **Step 6: Remove the probe**

```bash
git reset HEAD apps/pwa/src/hook-probe.ts
rm apps/pwa/src/hook-probe.ts
git reset --soft HEAD~1 && git reset
```

Expected: the probe commit from Step 4 is undone and the working tree is clean apart from the Husky/lint-staged files. Confirm with `git status` and `git log --oneline -3`.

- [ ] **Step 7: Verify locale regeneration does not loop (Review Focus #5)**

Run the hook's i18n command twice in a row:

```bash
pnpm --filter @phoopers/pwa extract:i18n && pnpm --filter @phoopers/pwa extract:i18n && git status --porcelain apps/pwa/src/i18n/locales
```

Expected: empty output — the second run produces no further change.

- [ ] **Step 8: Commit**

```bash
git add .husky .lintstagedrc.json .prettierignore package.json pnpm-lock.yaml
git commit -m "chore: add husky pre-commit hook running lint-staged"
```

---

### Task 6: GitHub Actions workflow and README

Deliverable: a green CI run on the `ci-initialization` branch and a README documenting setup and scripts.

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `README.md`

**Interfaces:**
- Consumes: every root script from Tasks 1–5 and `.nvmrc` from Task 1.
- Produces: the `ci` status check, suitable for a branch protection rule on `main`.

- [ ] **Step 1: Write the workflow**

`.github/workflows/ci.yml`. `pnpm/action-setup` must run *before* `actions/setup-node`, otherwise `cache: pnpm` fails because the pnpm binary is not yet on `PATH`.

```yaml
name: CI

on:
  push:
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  ci:
    name: Lint, typecheck, test, build
    runs-on: ubuntu-latest
    steps:
      - name: Check out the repository
        uses: actions/checkout@v5

      - name: Set up pnpm
        uses: pnpm/action-setup@v4

      - name: Set up Node
        uses: actions/setup-node@v5
        with:
          node-version-file: .nvmrc
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Typecheck
        run: pnpm typecheck

      - name: Test
        run: pnpm test

      - name: Build
        run: pnpm build
```

`pnpm/action-setup@v4` reads the version from `packageManager` in `package.json`, so there is nothing to keep in sync.

- [ ] **Step 2: Verify the lockfile is current (Review Focus #3)**

Reproduce what CI does before pushing:

```bash
pnpm install --frozen-lockfile
```

Expected: PASS. A failure means `pnpm-lock.yaml` is stale — run `pnpm install`, commit the lockfile, and retry.

- [ ] **Step 3: Verify the Node version is read from one place (Review Focus #4)**

```bash
grep -n 'node-version' .github/workflows/ci.yml
```

Expected: exactly one match, `node-version-file: .nvmrc`. If a literal `node-version:` appears, remove it — the file is the single source of truth.

- [ ] **Step 4: Write the README**

`README.md`:

````markdown
# Phoopers

Create, save, and replay animated basketball plays — a 2D coach's-whiteboard view today,
a 3D view later. See [documentation/roadmap.md](documentation/roadmap.md) for the product
vision and phasing.

## Requirements

- Node 24 (see `.nvmrc` — `nvm use` picks it up)
- pnpm 10.8.0 (`corepack enable` installs the pinned version)

## Getting started

```bash
pnpm install
pnpm --filter @phoopers/pwa dev
```

The app is served at http://localhost:5173.

## Scripts

Run from the repository root; each one fans out to every workspace.

| Script             | What it does                                            |
| ------------------ | ------------------------------------------------------- |
| `pnpm lint`        | ESLint across the repo, then `prettier --check`          |
| `pnpm lint:fix`    | ESLint `--fix`, then `prettier --write`                  |
| `pnpm format`      | Prettier `--write` only                                  |
| `pnpm typecheck`   | `tsc --noEmit` in every workspace                        |
| `pnpm test`        | Vitest, run once (no watch)                              |
| `pnpm build`       | Production build of every workspace                      |

Workspace-specific:

| Script                                         | What it does                              |
| ---------------------------------------------- | ----------------------------------------- |
| `pnpm --filter @phoopers/pwa dev`              | Vite dev server                           |
| `pnpm --filter @phoopers/pwa extract:i18n`     | Regenerate `src/i18n/locales/*` from `t()` |

## Workspace layout

```
apps/pwa        @phoopers/pwa — Vite + React 19 + Mantine front end
documentation   roadmap and implementation plans
```

## Quality gates

A Husky `pre-commit` hook runs `lint-staged`: ESLint `--fix` and Prettier on staged
source files, plus i18n extraction for anything under `apps/pwa/src`. The same checks
run in CI (`.github/workflows/ci.yml`) on every push and pull request, as a single
sequential job: lint → typecheck → test → build.

## Contributing

- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
- All user-facing strings go through `t('<namespace>.<key>', 'English default')`;
  commit the regenerated locale JSON alongside the source change.
- Further conventions live in [AGENTS.md](AGENTS.md).
````

- [ ] **Step 5: Verify the full gate one last time**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Expected: all four PASS.

- [ ] **Step 6: Commit**

```bash
git add .github README.md
git commit -m "ci: add GitHub Actions lint/typecheck/test/build workflow"
```

- [ ] **Step 7: Push and confirm CI is green**

```bash
git push -u origin ci-initialization
```

Then watch the run:

```bash
gh run watch --exit-status
```

Expected: the `ci` job completes successfully. Do not consider this task done until the run is observed green — if it fails, read the log with `gh run view --log-failed`, fix, and push again.

---

## Verification

The step is complete when all of the following hold:

- [ ] `pnpm install --frozen-lockfile` succeeds from a clean clone.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all pass locally.
- [ ] A commit touching a `.tsx` file is reformatted by the pre-commit hook, and a commit introducing a lint error is rejected.
- [ ] `pnpm --filter @phoopers/pwa extract:i18n` run twice leaves the working tree clean.
- [ ] The GitHub Actions `ci` job is green on the pushed `ci-initialization` branch.

## Follow-ups (not in this plan)

- Playwright e2e harness and its CI job.
- `vite-plugin-pwa` manifest and service worker.
- TanStack Query provider.
- `apps/api` workspace with Supertest, once Phase 1 persistence is specified.
- Branch protection on `main` requiring the `ci` check.
- Revisit the TypeScript 6 pin when typescript-eslint supports TypeScript 7.
